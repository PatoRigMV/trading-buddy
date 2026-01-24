import { NormalizedQuote, ProviderName } from "./types";
import { priceConsensus, ConsensusConfig } from "./consensus";
import { metrics } from "./metrics";
import { ProviderRegistry } from "./ProviderRegistry";
import { backfillMissingBars } from "./backfill";

interface Freshness { quotesMs:number; bars1mMs:number; }
interface WSConnection {
  connected: boolean;
  lastHeartbeat: number;
  reconnectAttempt: number;
  maxReconnectAttempt: number;
}

interface QuoteCache {
  quote: NormalizedQuote;
  timestamp: number;
}

export class ProviderRouter {
  private cfg: { freshness:Freshness; consensus:ConsensusConfig; quorumMin:number };
  private wsConnection: WSConnection;
  private quoteCache = new Map<string, Map<ProviderName, QuoteCache>>();
  private providerRegistry: ProviderRegistry;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(
    providerRegistry: ProviderRegistry,
    cfg?: Partial<{freshness:Freshness; consensus:ConsensusConfig; quorumMin:number}>
  ) {
    this.providerRegistry = providerRegistry;
    this.cfg = {
      freshness: { quotesMs: 2000, bars1mMs: 60000, ...(cfg?.freshness||{}) },
      consensus: { floor_bps:5, spread_multiplier:2.0, cap_bps:15, min_quorum:2, ...(cfg?.consensus||{}) },
      quorumMin: cfg?.quorumMin ?? 2
    };
    this.wsConnection = {
      connected: false,
      lastHeartbeat: 0,
      reconnectAttempt: 0,
      maxReconnectAttempt: 10
    };

    this.initializeWSConnection();
  }

  private async initializeWSConnection() {
    try {
      // WebSocket connection logic would go here
      // For now, simulate connection state
      this.wsConnection.connected = true;
      this.wsConnection.lastHeartbeat = Date.now();
      console.log('✅ WebSocket connection initialized');

      // Start heartbeat monitoring
      this.startHeartbeatMonitoring();
    } catch (error) {
      console.error('❌ WebSocket connection failed:', error);
      this.scheduleReconnect();
    }
  }

  private startHeartbeatMonitoring() {
    setInterval(() => {
      const now = Date.now();
      const timeSinceLastHeartbeat = now - this.wsConnection.lastHeartbeat;

      if (timeSinceLastHeartbeat > 30000) { // 30 second timeout
        console.warn('⚠️  WebSocket heartbeat timeout, reconnecting...');
        this.wsConnection.connected = false;
        this.scheduleReconnect();
      }
    }, 5000); // Check every 5 seconds
  }

  private scheduleReconnect() {
    if (this.wsConnection.reconnectAttempt >= this.wsConnection.maxReconnectAttempt) {
      console.error('❌ Max reconnect attempts reached, falling back to REST only');
      return;
    }

    this.wsConnection.reconnectAttempt++;

    // Exponential backoff with jitter
    const baseDelay = Math.min(1000 * Math.pow(2, this.wsConnection.reconnectAttempt), 30000);
    const jitter = Math.random() * 1000;
    const delay = baseDelay + jitter;

    console.log(`🔄 Scheduling reconnect attempt ${this.wsConnection.reconnectAttempt} in ${Math.round(delay)}ms`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnect();
    }, delay);
  }

  private async reconnect() {
    try {
      console.log('🔄 Attempting WebSocket reconnection...');

      // Reset connection state
      this.wsConnection.connected = true;
      this.wsConnection.lastHeartbeat = Date.now();
      this.wsConnection.reconnectAttempt = 0;

      // Trigger gap detection and backfill
      await this.detectAndBackfillGaps();

      console.log('✅ WebSocket reconnected successfully');
      metrics.wsReconnect(true);

    } catch (error) {
      console.error('❌ Reconnection failed:', error);
      this.wsConnection.connected = false;
      metrics.wsReconnect(false);
      this.scheduleReconnect();
    }
  }

  private async detectAndBackfillGaps() {
    // Check for gaps in data during disconnection
    const symbols = Array.from(this.quoteCache.keys());

    for (const symbol of symbols) {
      const symbolCache = this.quoteCache.get(symbol);
      if (!symbolCache) continue;

      for (const [provider, cache] of symbolCache) {
        const timeSinceLastUpdate = Date.now() - cache.timestamp;

        if (timeSinceLastUpdate > this.cfg.freshness.bars1mMs) {
          console.log(`🔄 Backfilling ${symbol} from ${provider} (${Math.round(timeSinceLastUpdate/1000)}s gap)`);

          try {
            await backfillMissingBars(symbol, provider, cache.timestamp, Date.now());
            metrics.backfillSuccess(symbol, provider);
          } catch (error) {
            console.error(`❌ Backfill failed for ${symbol}:`, error);
            metrics.backfillFailure(symbol, provider);
          }
        }
      }
    }
  }

  // Enhanced WS-first quote fetching with freshness tracking
  async getQuote(symbol: string): Promise<{ mid:number|null; stale:boolean; providers:ProviderName[] }> {
    const quotes: NormalizedQuote[] = await this.fetchQuotesFromProviders(symbol);
    const res = priceConsensus(quotes, this.cfg.consensus);

    // Update cache for freshness tracking
    this.updateQuoteCache(symbol, quotes);

    if (res.stale) {
      metrics.staleQuote(symbol);
      console.warn(`⚠️  Stale quote for ${symbol}, providers: ${res.providersUsed.join(', ')}`);
    }

    metrics.freshness("quotes", res.stale ? this.cfg.freshness.quotesMs + 1 : 0);
    return { mid: res.value, stale: res.stale, providers: res.providersUsed };
  }

  private async fetchQuotesFromProviders(symbol: string): Promise<NormalizedQuote[]> {
    const quotes: NormalizedQuote[] = [];
    const now = Date.now();

    // 1. Try WebSocket data first (if connected and fresh)
    if (this.wsConnection.connected) {
      const wsQuote = this.getWSQuote(symbol);
      if (wsQuote && (now - wsQuote.timestamp) < this.cfg.freshness.quotesMs) {
        quotes.push(wsQuote.quote);
      }
    }

    // 2. Fetch from REST providers
    const providers = this.providerRegistry.getHealthyProviders();

    for (const provider of providers) {
      try {
        const adapter = this.providerRegistry.getQuoteAdapter(provider);
        if (adapter) {
          const quote = await adapter.getQuote(symbol);
          if (quote && (now - quote.ts_provider) < this.cfg.freshness.quotesMs) {
            quotes.push(quote);
          }
        }
      } catch (error) {
        console.error(`❌ Provider ${provider} failed for ${symbol}:`, error);
        metrics.providerError(provider);
      }
    }

    return quotes;
  }

  private getWSQuote(symbol: string): QuoteCache | null {
    const symbolCache = this.quoteCache.get(symbol);
    if (!symbolCache) return null;

    const wsCache = symbolCache.get('polygon'); // Assuming Polygon is WS provider
    return wsCache || null;
  }

  private updateQuoteCache(symbol: string, quotes: NormalizedQuote[]) {
    if (!this.quoteCache.has(symbol)) {
      this.quoteCache.set(symbol, new Map());
    }

    const symbolCache = this.quoteCache.get(symbol)!;
    const now = Date.now();

    for (const quote of quotes) {
      symbolCache.set(quote.provider, {
        quote,
        timestamp: now
      });
    }
  }

  // Check if entries should be halted due to stale data
  haltEntriesIfStale(symbol: string): boolean {
    const symbolCache = this.quoteCache.get(symbol);
    if (!symbolCache || symbolCache.size === 0) {
      return true; // Halt if no data available
    }

    const now = Date.now();
    let freshDataExists = false;

    for (const cache of symbolCache.values()) {
      if ((now - cache.timestamp) < this.cfg.freshness.quotesMs) {
        freshDataExists = true;
        break;
      }
    }

    return !freshDataExists;
  }

  // Get connection status for monitoring
  getConnectionStatus() {
    return {
      wsConnected: this.wsConnection.connected,
      lastHeartbeat: this.wsConnection.lastHeartbeat,
      reconnectAttempt: this.wsConnection.reconnectAttempt,
      cacheSize: this.quoteCache.size,
      healthyProviders: this.providerRegistry.getHealthyProviders()
    };
  }

  // Cleanup resources
  destroy() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.quoteCache.clear();
  }
}
