import { QuotesAdapter, BarsAdapter, HaltsAdapter, HaltState } from '../contracts';
import { NormalizedQuote, NormalizedBar, ProviderName } from '../types';

interface PolygonConfig {
  api_key: string;
  base_url?: string;
  rate_limit_rpm?: number;
}

export class PolygonAdapter implements QuotesAdapter, BarsAdapter, HaltsAdapter {
  readonly provider: ProviderName = 'polygon';
  private config: PolygonConfig;
  private lastRequest = 0;
  private requestCount = 0;
  private readonly minInterval: number;

  constructor(config: PolygonConfig) {
    this.config = {
      base_url: 'https://api.polygon.io',
      rate_limit_rpm: 300,
      ...config
    };
    this.minInterval = Math.ceil(60000 / this.config.rate_limit_rpm!);
  }

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequest;
    if (elapsed < this.minInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minInterval - elapsed));
    }
    this.lastRequest = Date.now();
    this.requestCount++;
  }

  private async fetchJson(url: string): Promise<any> {
    await this.rateLimit();

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Polygon API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  async getQuote(symbol: string): Promise<NormalizedQuote | null> {
    try {
      const url = `${this.config.base_url}/v1/marketstatus/now?apikey=${this.config.api_key}`;
      const data = await this.fetchJson(url);

      // For free tier, return market status as basic quote
      return {
        provider: this.provider,
        ts_provider: Date.now(),
        symbol: symbol.toUpperCase(),
        ts_exchange: Date.now(),
        bid: null,
        ask: null,
        mid: null,
        spread_bps: null,
        source_latency_ms: 0
      };
    } catch (error) {
      console.error(`Polygon getQuote error for ${symbol}:`, error);
      return null;
    }
  }

  async getBars(symbol: string, interval: "1m" | "5m" | "1d", fromMs: number, toMs: number): Promise<NormalizedBar[]> {
    try {
      // Free tier has limited access - return empty for now
      console.log(`Polygon getBars: Free tier limitation for ${symbol}`);
      return [];
    } catch (error) {
      console.error(`Polygon getBars error for ${symbol}:`, error);
      return [];
    }
  }

  async getHaltState(symbol: string): Promise<HaltState | null> {
    try {
      const url = `${this.config.base_url}/v1/marketstatus/now?apikey=${this.config.api_key}`;
      const data = await this.fetchJson(url);

      // Use market status to infer basic halt state
      return {
        halted: data.market !== 'open',
        luld: null,
        ts_exchange: Date.now()
      };
    } catch (error) {
      console.error(`Polygon getHaltState error for ${symbol}:`, error);
      return null;
    }
  }

  getRateLimit() {
    const resetTime = this.lastRequest + 60000;
    const remaining = Math.max(0, this.config.rate_limit_rpm! - this.requestCount);
    return { remaining, resetTime };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const url = `${this.config.base_url}/v1/marketstatus/now?apikey=${this.config.api_key}`;
      const response = await fetch(url);
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Legacy function for backward compatibility
export async function polygonQuote(symbol: string): Promise<NormalizedQuote | null> {
  const adapter = new PolygonAdapter({ api_key: process.env.POLYGON_API_KEY || '' });
  return adapter.getQuote(symbol);
}
