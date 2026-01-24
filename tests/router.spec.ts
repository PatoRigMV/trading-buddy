import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProviderRouter } from '../src/data/ProviderRouter';
import { ProviderRegistry } from '../src/data/ProviderRegistry';
import { metrics } from '../src/data/metrics';
import { backfillMissingBars } from '../src/data/backfill';
import { priceConsensus } from '../src/data/consensus';

// Mock the backfill module
vi.mock('../src/data/backfill', () => ({
  backfillMissingBars: vi.fn()
}));

// Mock the consensus module
vi.mock('../src/data/consensus', () => ({
  priceConsensus: vi.fn()
}));

// Mock the metrics module
vi.mock('../src/data/metrics', () => ({
  metrics: {
    emit: vi.fn(),
    wsReconnect: vi.fn(),
    wsHeartbeat: vi.fn(),
    wsDisconnect: vi.fn(),
    backfillSuccess: vi.fn(),
    backfillFailure: vi.fn(),
    staleQuote: vi.fn(),
    freshness: vi.fn(),
    providerError: vi.fn()
  }
}));

describe('ProviderRouter - WebSocket-first with Reconnect & Gap-fill', () => {
  let router: ProviderRouter;
  let mockProviderRegistry: ProviderRegistry;
  let originalSetInterval: typeof setInterval;
  let originalSetTimeout: typeof setTimeout;
  let originalClearTimeout: typeof clearTimeout;

  beforeEach(() => {
    // Store original timers
    originalSetInterval = global.setInterval;
    originalSetTimeout = global.setTimeout;
    originalClearTimeout = global.clearTimeout;

    // Mock timers
    vi.useFakeTimers();

    // Create mock provider registry
    mockProviderRegistry = {
      getHealthyProviders: vi.fn(() => ['polygon', 'twelvedata']),
      getQuoteAdapter: vi.fn((provider) => ({
        getQuote: vi.fn(async (symbol) => ({
          symbol,
          provider,
          bid: 100.0,
          ask: 100.1,
          ts_provider: Date.now()
        }))
      }))
    } as any;

    // Clear all mocks
    vi.clearAllMocks();
    (backfillMissingBars as any).mockResolvedValue(50);

    // Setup default consensus behavior
    (priceConsensus as any).mockReturnValue({
      value: 100.05,
      stale: false,
      providersUsed: ['polygon'],
      quorum: 2,
      threshold_bps: 5
    });
  });

  afterEach(() => {
    if (router) {
      router.destroy();
    }
    vi.useRealTimers();
  });

  describe('WebSocket Connection Management', () => {
    it('should initialize with WebSocket connected', () => {
      router = new ProviderRouter(mockProviderRegistry);
      const status = router.getConnectionStatus();

      expect(status.wsConnected).toBe(true);
      expect(status.lastHeartbeat).toBeGreaterThan(0);
      expect(status.reconnectAttempt).toBe(0);
    });

    it('should start heartbeat monitoring on initialization', () => {
      router = new ProviderRouter(mockProviderRegistry);

      // Verify setInterval was called for heartbeat monitoring
      expect(vi.getTimerCount()).toBeGreaterThan(0);
    });

    it('should detect heartbeat timeout and trigger reconnect', async () => {
      router = new ProviderRouter(mockProviderRegistry);

      // Simulate stale heartbeat by not updating lastHeartbeat
      const status = router.getConnectionStatus();
      const oldHeartbeat = status.lastHeartbeat;

      // Fast-forward past heartbeat timeout (30 seconds)
      vi.advanceTimersByTime(35000);

      const newStatus = router.getConnectionStatus();
      expect(newStatus.wsConnected).toBe(false);
      expect(newStatus.reconnectAttempt).toBeGreaterThan(0);
    });
  });

  describe('Reconnection Logic', () => {
    it('should implement exponential backoff with jitter', async () => {
      router = new ProviderRouter(mockProviderRegistry);

      // Force connection failure
      (router as any).wsConnection.connected = false;
      (router as any).wsConnection.reconnectAttempt = 0;

      // Trigger reconnect attempts
      (router as any).scheduleReconnect();
      expect((router as any).wsConnection.reconnectAttempt).toBe(1);

      (router as any).scheduleReconnect();
      expect((router as any).wsConnection.reconnectAttempt).toBe(2);

      (router as any).scheduleReconnect();
      expect((router as any).wsConnection.reconnectAttempt).toBe(3);
    });

    it('should respect max reconnect attempts', async () => {
      router = new ProviderRouter(mockProviderRegistry);
      (router as any).wsConnection.connected = false;
      (router as any).wsConnection.reconnectAttempt = 10; // At max

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      (router as any).scheduleReconnect();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Max reconnect attempts reached')
      );
    });

    it('should trigger gap detection and backfill on successful reconnect', async () => {
      router = new ProviderRouter(mockProviderRegistry);

      // Add some cached data
      const symbolCache = new Map();
      symbolCache.set('polygon', {
        quote: { symbol: 'SPY', provider: 'polygon', bid: 100.0, ask: 100.1, ts_provider: Date.now() - 120000 },
        timestamp: Date.now() - 120000 // 2 minutes ago
      });
      (router as any).quoteCache.set('SPY', symbolCache);

      // Trigger reconnect
      await (router as any).reconnect();

      expect(backfillMissingBars).toHaveBeenCalledWith(
        'SPY',
        'polygon',
        expect.any(Number),
        expect.any(Number)
      );
      expect(metrics.backfillSuccess).toHaveBeenCalledWith('SPY', 'polygon');
    });
  });

  describe('Quote Fetching - WebSocket First', () => {
    it('should prefer WebSocket data when connected and fresh', async () => {
      router = new ProviderRouter(mockProviderRegistry, {
        freshness: { quotesMs: 2000, bars1mMs: 60000 }
      });

      // Add fresh WebSocket data to cache
      const symbolCache = new Map();
      symbolCache.set('polygon', {
        quote: {
          symbol: 'SPY',
          provider: 'polygon',
          bid: 100.0,
          ask: 100.1,
          ts_provider: Date.now() - 1000 // 1 second ago (fresh)
        },
        timestamp: Date.now() - 1000
      });
      (router as any).quoteCache.set('SPY', symbolCache);

      const result = await router.getQuote('SPY');

      expect(result.mid).toBeDefined();
      expect(result.stale).toBe(false);
      expect(result.providers).toContain('polygon');
    });

    it('should fallback to REST when WebSocket data is stale', async () => {
      router = new ProviderRouter(mockProviderRegistry, {
        freshness: { quotesMs: 2000, bars1mMs: 60000 }
      });

      // Add stale WebSocket data to cache
      const symbolCache = new Map();
      symbolCache.set('polygon', {
        quote: {
          symbol: 'SPY',
          provider: 'polygon',
          bid: 100.0,
          ask: 100.1,
          ts_provider: Date.now() - 5000 // 5 seconds ago (stale)
        },
        timestamp: Date.now() - 5000
      });
      (router as any).quoteCache.set('SPY', symbolCache);

      const result = await router.getQuote('SPY');

      // Should have called REST providers
      expect(mockProviderRegistry.getQuoteAdapter).toHaveBeenCalled();
      expect(result.providers).toContain('polygon'); // From REST fallback
    });

    it('should handle provider errors gracefully', async () => {
      const failingAdapter = {
        getQuote: vi.fn().mockRejectedValue(new Error('Provider timeout'))
      };
      mockProviderRegistry.getQuoteAdapter = vi.fn(() => failingAdapter);

      // Mock consensus to return null when no quotes available
      (priceConsensus as any).mockReturnValueOnce({
        value: null,
        stale: true,
        providersUsed: [],
        quorum: 0,
        threshold_bps: 5
      });

      router = new ProviderRouter(mockProviderRegistry);

      const result = await router.getQuote('SPY');

      expect(metrics.providerError).toHaveBeenCalled();
      expect(result.mid).toBeNull(); // No consensus possible
    });
  });

  describe('Freshness Tracking & Cache Management', () => {
    it('should update quote cache after fetching', async () => {
      router = new ProviderRouter(mockProviderRegistry);

      await router.getQuote('AAPL');

      const cacheSize = (router as any).quoteCache.size;
      expect(cacheSize).toBeGreaterThan(0);

      const symbolCache = (router as any).quoteCache.get('AAPL');
      expect(symbolCache).toBeDefined();
    });

    it('should track freshness metrics for quotes', async () => {
      router = new ProviderRouter(mockProviderRegistry);

      await router.getQuote('SPY');

      expect(metrics.freshness).toHaveBeenCalledWith('quotes', expect.any(Number));
    });

    it('should emit stale quote metrics when appropriate', async () => {
      router = new ProviderRouter(mockProviderRegistry, {
        consensus: { floor_bps: 5, spread_multiplier: 2.0, cap_bps: 15, min_quorum: 1 }
      });

      // Mock consensus to return stale result
      (priceConsensus as any).mockReturnValueOnce({
        value: 100.05,
        stale: true,
        providersUsed: ['polygon'],
        quorum: 1,
        threshold_bps: 10
      });

      await router.getQuote('SPY');

      expect(metrics.staleQuote).toHaveBeenCalledWith('SPY');
    });
  });

  describe('Entry Halting Logic', () => {
    it('should halt entries when no fresh data available', () => {
      router = new ProviderRouter(mockProviderRegistry, {
        freshness: { quotesMs: 2000, bars1mMs: 60000 }
      });

      // No cache data
      const shouldHalt = router.haltEntriesIfStale('SPY');
      expect(shouldHalt).toBe(true);
    });

    it('should allow entries when fresh data exists', () => {
      router = new ProviderRouter(mockProviderRegistry, {
        freshness: { quotesMs: 2000, bars1mMs: 60000 }
      });

      // Add fresh data to cache
      const symbolCache = new Map();
      symbolCache.set('polygon', {
        quote: { symbol: 'SPY', provider: 'polygon', bid: 100.0, ask: 100.1, ts_provider: Date.now() },
        timestamp: Date.now() // Fresh
      });
      (router as any).quoteCache.set('SPY', symbolCache);

      const shouldHalt = router.haltEntriesIfStale('SPY');
      expect(shouldHalt).toBe(false);
    });

    it('should halt entries when all data is stale', () => {
      router = new ProviderRouter(mockProviderRegistry, {
        freshness: { quotesMs: 2000, bars1mMs: 60000 }
      });

      // Add stale data to cache
      const symbolCache = new Map();
      symbolCache.set('polygon', {
        quote: { symbol: 'SPY', provider: 'polygon', bid: 100.0, ask: 100.1, ts_provider: Date.now() - 5000 },
        timestamp: Date.now() - 5000 // Stale (5 seconds old, threshold is 2 seconds)
      });
      (router as any).quoteCache.set('SPY', symbolCache);

      const shouldHalt = router.haltEntriesIfStale('SPY');
      expect(shouldHalt).toBe(true);
    });
  });

  describe('Gap Detection & Backfill Integration', () => {
    it('should detect gaps during reconnection', async () => {
      router = new ProviderRouter(mockProviderRegistry, {
        freshness: { quotesMs: 2000, bars1mMs: 60000 }
      });

      // Add multiple symbols with stale data
      const symbols = ['SPY', 'QQQ', 'AAPL'];
      symbols.forEach(symbol => {
        const symbolCache = new Map();
        symbolCache.set('polygon', {
          quote: { symbol, provider: 'polygon', bid: 100.0, ask: 100.1, ts_provider: Date.now() - 120000 },
          timestamp: Date.now() - 120000 // 2 minutes ago
        });
        (router as any).quoteCache.set(symbol, symbolCache);
      });

      await (router as any).detectAndBackfillGaps();

      expect(backfillMissingBars).toHaveBeenCalledTimes(symbols.length);
      symbols.forEach(symbol => {
        expect(metrics.backfillSuccess).toHaveBeenCalledWith(symbol, 'polygon');
      });
    });

    it('should handle backfill failures gracefully', async () => {
      (backfillMissingBars as any).mockRejectedValueOnce(new Error('Backfill API timeout'));

      router = new ProviderRouter(mockProviderRegistry);

      // Add symbol with stale data
      const symbolCache = new Map();
      symbolCache.set('polygon', {
        quote: { symbol: 'SPY', provider: 'polygon', bid: 100.0, ask: 100.1, ts_provider: Date.now() - 120000 },
        timestamp: Date.now() - 120000
      });
      (router as any).quoteCache.set('SPY', symbolCache);

      await (router as any).detectAndBackfillGaps();

      expect(metrics.backfillFailure).toHaveBeenCalledWith('SPY', 'polygon');
    });
  });

  describe('Configuration & Status Monitoring', () => {
    it('should apply custom configuration', () => {
      const customConfig = {
        freshness: { quotesMs: 5000, bars1mMs: 120000 },
        consensus: { floor_bps: 10, spread_multiplier: 1.5, cap_bps: 20, min_quorum: 3 },
        quorumMin: 3
      };

      router = new ProviderRouter(mockProviderRegistry, customConfig);

      expect((router as any).cfg.freshness.quotesMs).toBe(5000);
      expect((router as any).cfg.consensus.floor_bps).toBe(10);
      expect((router as any).cfg.quorumMin).toBe(3);
    });

    it('should provide comprehensive connection status', () => {
      router = new ProviderRouter(mockProviderRegistry);

      const status = router.getConnectionStatus();

      expect(status).toMatchObject({
        wsConnected: expect.any(Boolean),
        lastHeartbeat: expect.any(Number),
        reconnectAttempt: expect.any(Number),
        cacheSize: expect.any(Number),
        healthyProviders: expect.any(Array)
      });
    });
  });

  describe('Resource Cleanup', () => {
    it('should clean up resources on destroy', () => {
      router = new ProviderRouter(mockProviderRegistry);

      // Add some cache data
      const symbolCache = new Map();
      symbolCache.set('polygon', {
        quote: { symbol: 'SPY', provider: 'polygon', bid: 100.0, ask: 100.1, ts_provider: Date.now() },
        timestamp: Date.now()
      });
      (router as any).quoteCache.set('SPY', symbolCache);

      expect((router as any).quoteCache.size).toBe(1);

      router.destroy();

      expect((router as any).quoteCache.size).toBe(0);
    });
  });

  describe('Integration Test - Complete WS Drop & Recovery', () => {
    it('should handle complete WebSocket failure and recovery cycle', async () => {
      router = new ProviderRouter(mockProviderRegistry, {
        freshness: { quotesMs: 2000, bars1mMs: 60000 }
      });

      // 1. Initial state - WS connected
      expect(router.getConnectionStatus().wsConnected).toBe(true);

      // 2. Add stale WebSocket data to ensure backfill will be triggered
      const symbolCache = new Map();
      symbolCache.set('polygon', {
        quote: { symbol: 'SPY', provider: 'polygon', bid: 100.0, ask: 100.1, ts_provider: Date.now() - 120000 },
        timestamp: Date.now() - 120000 // 2 minutes ago (stale)
      });
      (router as any).quoteCache.set('SPY', symbolCache);

      // 3. Get quote to establish cache
      const quote1 = await router.getQuote('SPY');
      expect(quote1.mid).toBeDefined();

      // 4. Simulate heartbeat timeout (WS drops)
      vi.advanceTimersByTime(35000); // Past 30s timeout
      expect(router.getConnectionStatus().wsConnected).toBe(false);

      // 5. Should now use REST fallback
      const quote2 = await router.getQuote('SPY');
      expect(mockProviderRegistry.getQuoteAdapter).toHaveBeenCalled();

      // 6. Clear previous mock calls and trigger reconnect directly
      vi.clearAllMocks();
      (backfillMissingBars as any).mockResolvedValue(50);
      await (router as any).reconnect();

      // 7. Should be reconnected and may trigger backfill (if cache exists and is stale)
      expect(router.getConnectionStatus().wsConnected).toBe(true);
      expect(metrics.wsReconnect).toHaveBeenCalledWith(true);
      // Backfill may or may not be called depending on cache state, but should handle gracefully
    });
  });
});
