import { describe, it, expect, beforeAll } from 'vitest';
import { PolygonAdapter } from '../src/data/providers/polygon';
import { YahooAdapter } from '../src/data/providers/yahoo';
import { ProviderRegistry } from '../src/data/ProviderRegistry';

describe('Provider Adapters', () => {
  let polygonAdapter: PolygonAdapter;
  let yahooAdapter: YahooAdapter;
  let registry: ProviderRegistry;

  beforeAll(() => {
    const polygonKey = process.env.POLYGON_API_KEY || '';

    polygonAdapter = new PolygonAdapter({ api_key: polygonKey });
    yahooAdapter = new YahooAdapter();

    registry = new ProviderRegistry({
      polygon: { api_key: polygonKey },
      yahoo: {}
    });
  });

  describe('Polygon Adapter', () => {
    it('should implement all required interfaces', () => {
      expect(polygonAdapter.provider).toBe('polygon');
      expect(typeof polygonAdapter.getQuote).toBe('function');
      expect(typeof polygonAdapter.getBars).toBe('function');
      expect(typeof polygonAdapter.getHaltState).toBe('function');
      expect(typeof polygonAdapter.healthCheck).toBe('function');
    });

    it('should handle health check', async () => {
      const healthy = await polygonAdapter.healthCheck();
      expect(typeof healthy).toBe('boolean');
    });

    it('should provide rate limit info', () => {
      const rateLimit = polygonAdapter.getRateLimit();
      expect(typeof rateLimit.remaining).toBe('number');
      expect(typeof rateLimit.resetTime).toBe('number');
    });
  });

  describe('Yahoo Adapter', () => {
    it('should implement all required interfaces', () => {
      expect(yahooAdapter.provider).toBe('yahoo');
      expect(typeof yahooAdapter.getQuote).toBe('function');
      expect(typeof yahooAdapter.getBars).toBe('function');
      expect(typeof yahooAdapter.getHaltState).toBe('function');
      expect(typeof yahooAdapter.healthCheck).toBe('function');
    });

    it('should get quote for valid symbol', async () => {
      const quote = await yahooAdapter.getQuote('AAPL');

      if (quote) {
        expect(quote.provider).toBe('yahoo');
        expect(quote.symbol).toBe('AAPL');
        expect(typeof quote.ts_exchange).toBe('number');
        expect(typeof quote.ts_provider).toBe('number');

        // Mid should be calculated if bid/ask available, or use last price
        if (quote.bid && quote.ask) {
          expect(quote.mid).toBe((quote.bid + quote.ask) / 2);
          expect(typeof quote.spread_bps).toBe('number');
        }
      }
    }, 10000);

    it('should get bars for valid symbol', async () => {
      const fromMs = Date.now() - 86400000; // 24 hours ago
      const toMs = Date.now();

      const bars = await yahooAdapter.getBars('AAPL', '1d', fromMs, toMs);

      expect(Array.isArray(bars)).toBe(true);

      if (bars.length > 0) {
        const bar = bars[0];
        expect(bar.provider).toBe('yahoo');
        expect(bar.symbol).toBe('AAPL');
        expect(typeof bar.o).toBe('number');
        expect(typeof bar.h).toBe('number');
        expect(typeof bar.l).toBe('number');
        expect(typeof bar.c).toBe('number');
        expect(typeof bar.v).toBe('number');
        expect(bar.interval).toBe('1d');
      }
    }, 10000);
  });

  describe('Provider Registry', () => {
    it('should initialize with configured providers', () => {
      const providers = registry.getAvailableProviders();
      expect(providers).toContain('yahoo');

      if (process.env.POLYGON_API_KEY) {
        expect(providers).toContain('polygon');
      }
    });

    it('should provide adapter access', () => {
      const yahooQuotes = registry.getQuoteAdapter('yahoo');
      expect(yahooQuotes).toBeTruthy();
      expect(yahooQuotes!.provider).toBe('yahoo');

      const yahooBars = registry.getBarsAdapter('yahoo');
      expect(yahooBars).toBeTruthy();
      expect(yahooBars!.provider).toBe('yahoo');

      const yahooHalts = registry.getHaltsAdapter('yahoo');
      expect(yahooHalts).toBeTruthy();
      expect(yahooHalts!.provider).toBe('yahoo');
    });

    it('should perform health checks', async () => {
      const healthResults = await registry.healthCheckAll();
      expect(healthResults.size).toBeGreaterThan(0);

      for (const [provider, healthy] of healthResults) {
        expect(typeof healthy).toBe('boolean');
        console.log(`Provider ${provider}: ${healthy ? 'healthy' : 'unhealthy'}`);
      }
    }, 15000);
  });

  describe('Data Schema Validation', () => {
    it('should return null for invalid symbols gracefully', async () => {
      const quote = await yahooAdapter.getQuote('INVALID_SYMBOL_12345');
      // Should either return null or valid quote structure
      if (quote) {
        expect(quote.provider).toBe('yahoo');
        expect(typeof quote.symbol).toBe('string');
      }
    });

    it('should handle network errors gracefully', async () => {
      // Create adapter with invalid URL to test error handling
      const badAdapter = new YahooAdapter({ base_url: 'https://invalid-url-12345.com' });
      const quote = await badAdapter.getQuote('AAPL');
      expect(quote).toBeNull();
    });
  });
});
