import { QuotesAdapter, BarsAdapter, HaltsAdapter, HaltState } from '../contracts';
import { NormalizedQuote, NormalizedBar, ProviderName } from '../types';

interface YahooConfig {
  base_url?: string;
  rate_limit_rpm?: number;
}

export class YahooAdapter implements QuotesAdapter, BarsAdapter, HaltsAdapter {
  readonly provider: ProviderName = 'yahoo';
  private config: YahooConfig;
  private lastRequest = 0;
  private requestCount = 0;
  private readonly minInterval: number;

  constructor(config: YahooConfig = {}) {
    this.config = {
      base_url: 'https://query1.finance.yahoo.com',
      rate_limit_rpm: 600,
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

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Yahoo Finance API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  async getQuote(symbol: string): Promise<NormalizedQuote | null> {
    try {
      const url = `${this.config.base_url}/v8/finance/chart/${symbol}?interval=1m&range=1d`;
      const data = await this.fetchJson(url);

      if (!data.chart?.result?.[0]) return null;

      const result = data.chart.result[0];
      const meta = result.meta;
      const quote = meta;

      const bid = quote.bid || null;
      const ask = quote.ask || null;
      const last = quote.regularMarketPrice || null;
      const mid = (bid && ask) ? (bid + ask) / 2 : last;
      const spread_bps = (bid && ask && mid) ? ((ask - bid) / mid) * 10000 : null;

      return {
        provider: this.provider,
        ts_provider: Date.now(),
        symbol: symbol.toUpperCase(),
        ts_exchange: Date.now(),
        bid,
        ask,
        last,
        mid,
        spread_bps,
        source_latency_ms: 0
      };
    } catch (error) {
      console.error(`Yahoo getQuote error for ${symbol}:`, error);
      return null;
    }
  }

  async getBars(symbol: string, interval: "1m" | "5m" | "1d", fromMs: number, toMs: number): Promise<NormalizedBar[]> {
    try {
      const intervalMap = { '1m': '1m', '5m': '5m', '1d': '1d' };
      const yahooInterval = intervalMap[interval];

      const period1 = Math.floor(fromMs / 1000);
      const period2 = Math.floor(toMs / 1000);

      const url = `${this.config.base_url}/v8/finance/chart/${symbol}?interval=${yahooInterval}&period1=${period1}&period2=${period2}`;
      const data = await this.fetchJson(url);

      if (!data.chart?.result?.[0]?.indicators?.quote?.[0]) return [];

      const result = data.chart.result[0];
      const timestamps = result.timestamp || [];
      const quote = result.indicators.quote[0];
      const open = quote.open || [];
      const high = quote.high || [];
      const low = quote.low || [];
      const close = quote.close || [];
      const volume = quote.volume || [];

      return timestamps.map((ts: number, i: number) => ({
        provider: this.provider,
        ts_provider: Date.now(),
        symbol: symbol.toUpperCase(),
        ts_open: ts * 1000,
        ts_close: ts * 1000 + (interval === '1d' ? 86400000 : interval === '5m' ? 300000 : 60000),
        o: open[i] || 0,
        h: high[i] || 0,
        l: low[i] || 0,
        c: close[i] || 0,
        v: volume[i] || 0,
        adjusted: true,
        interval
      })).filter(bar => bar.o && bar.h && bar.l && bar.c);
    } catch (error) {
      console.error(`Yahoo getBars error for ${symbol}:`, error);
      return [];
    }
  }

  async getHaltState(symbol: string): Promise<HaltState | null> {
    try {
      const url = `${this.config.base_url}/v8/finance/chart/${symbol}?interval=1m&range=1d`;
      const data = await this.fetchJson(url);

      if (!data.chart?.result?.[0]?.meta) return null;

      const meta = data.chart.result[0].meta;

      // Yahoo doesn't provide detailed halt info, infer from market state
      return {
        halted: meta.currentTradingPeriod?.regular?.gmtoffset !== undefined &&
                meta.marketState !== 'REGULAR',
        luld: null,
        ts_exchange: Date.now()
      };
    } catch (error) {
      console.error(`Yahoo getHaltState error for ${symbol}:`, error);
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
      const url = `${this.config.base_url}/v8/finance/chart/AAPL?interval=1d&range=1d`;
      const response = await fetch(url);
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Legacy function for backward compatibility
export async function yahooQuote(symbol: string): Promise<NormalizedQuote | null> {
  const adapter = new YahooAdapter();
  return adapter.getQuote(symbol);
}
