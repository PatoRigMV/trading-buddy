import { MarketDataProvider, BarData, QuoteData } from './MarketData';

export class YahooMarketData implements MarketDataProvider {
  private baseUrl = 'https://query1.finance.yahoo.com';
  private requestCache = new Map<string, { data: any; timestamp: number }>();
  private rateLimitDelay = 1000; // 1 second between requests
  private lastRequestTime = 0;

  async subscribeBars(
    symbols: string[],
    timeframe: string,
    callback: (bar: BarData) => void
  ): Promise<void> {
    // Yahoo Finance doesn't have WebSocket, so we'll poll
    const pollInterval = this.getPollingInterval(timeframe);

    const poll = async () => {
      for (const symbol of symbols) {
        try {
          const bars = await this.getHistoricalBars(
            symbol,
            timeframe,
            new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago for sufficient history
            new Date(),
            100 // Get more bars for technical analysis
          );

          if (bars.length > 0) {
            callback(bars[0]);
          }
        } catch (error) {
          console.error(`Error polling ${symbol} from Yahoo:`, error);
          // Continue polling even after errors
        }
      }

      // Use setTimeout with try-catch to prevent unhandled promise rejections
      setTimeout(() => {
        poll().catch(error => {
          console.error('Polling error caught:', error);
        });
      }, pollInterval);
    };

    // Initial delay before starting
    setTimeout(() => {
      poll().catch(error => {
        console.error('Initial polling error caught:', error);
      });
    }, 5000);
  }

  async subscribeQuotes(symbols: string[], callback: (quote: QuoteData) => void): Promise<void> {
    const poll = async () => {
      for (const symbol of symbols) {
        try {
          const quote = await this.getLatestQuote(symbol);
          callback(quote);
        } catch (error) {
          console.error(`Error getting quote for ${symbol} from Yahoo:`, error);
          // Continue polling even after errors
        }
      }

      // Use setTimeout with try-catch to prevent unhandled promise rejections
      setTimeout(() => {
        poll().catch(error => {
          console.error('Quote polling error caught:', error);
        });
      }, 10000); // Poll every 10 seconds
    };

    setTimeout(() => {
      poll().catch(error => {
        console.error('Initial quote polling error caught:', error);
      });
    }, 2000);
  }

  async getHistoricalBars(
    symbol: string,
    timeframe: string,
    start: Date,
    end: Date,
    limit?: number
  ): Promise<BarData[]> {
    // Check cache first (5 minute cache for historical data)
    const cacheKey = `${symbol}-${timeframe}-${Math.floor(start.getTime() / 300000)}`;
    const cached = this.requestCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 300000) { // 5 minutes
      return cached.data.slice(0, limit);
    }

    // Rate limiting - wait if needed
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.rateLimitDelay) {
      await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay - timeSinceLastRequest));
    }
    this.lastRequestTime = Date.now();

    const interval = this.mapTimeframe(timeframe);
    const period1 = Math.floor(start.getTime() / 1000);
    const period2 = Math.floor(end.getTime() / 1000);

    const url = `${this.baseUrl}/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=${interval}&includePrePost=false`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        if (response.status === 429) {
          console.warn(`Rate limited for ${symbol}, using cached data or returning empty`);
          return cached ? cached.data.slice(0, limit) : [];
        }
        throw new Error(`Yahoo Finance API error: ${response.status}`);
      }

      const text = await response.text();
      if (!text.trim()) {
        console.warn(`Empty response for ${symbol}`);
        return cached ? cached.data.slice(0, limit) : [];
      }

      const data = JSON.parse(text);

      if (!data.chart?.result || data.chart.result.length === 0) {
        console.warn(`No chart data for ${symbol}`);
        return cached ? cached.data.slice(0, limit) : [];
      }

      const result = data.chart.result[0];
    const timestamps = result.timestamp;
    const prices = result.indicators?.quote?.[0];

    // Check if we have valid data
    if (!timestamps || !prices || !Array.isArray(timestamps)) {
      return [];
    }

    const bars: BarData[] = [];

    for (let i = 0; i < timestamps.length; i++) {
      if (prices.open[i] !== null && prices.high[i] !== null &&
          prices.low[i] !== null && prices.close[i] !== null) {
        bars.push({
          symbol,
          timestamp: new Date(timestamps[i] * 1000),
          open: prices.open[i],
          high: prices.high[i],
          low: prices.low[i],
          close: prices.close[i],
          volume: prices.volume[i] || 0
        });
      }
    }

    // Cache successful response
    this.requestCache.set(cacheKey, { data: bars, timestamp: Date.now() });

    // Apply limit if specified
    if (limit && bars.length > limit) {
      return bars.slice(-limit);
    }

    return bars;
    } catch (error) {
      console.error(`Error fetching historical data for ${symbol}:`, error);
      return cached ? cached.data.slice(0, limit) : [];
    }
  }

  async getLatestQuote(symbol: string): Promise<QuoteData> {
    const url = `${this.baseUrl}/v6/finance/quote?symbols=${symbol}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Yahoo Finance API error: ${response.status}`);
    }

    const data = await response.json() as any;

    if (!data.quoteResponse.result || data.quoteResponse.result.length === 0) {
      throw new Error(`No quote data found for ${symbol}`);
    }

    const quote = data.quoteResponse.result[0];

    return {
      symbol,
      timestamp: new Date(),
      bid: quote.bid || quote.regularMarketPrice,
      ask: quote.ask || quote.regularMarketPrice,
      bidSize: quote.bidSize || 0,
      askSize: quote.askSize || 0
    };
  }

  async disconnect(): Promise<void> {
    // Nothing to disconnect for Yahoo Finance
  }

  private mapTimeframe(timeframe: string): string {
    const mapping: Record<string, string> = {
      '1min': '1m',
      '5min': '5m',
      '15min': '15m',
      '30min': '30m',
      '1hour': '1h',
      '1day': '1d'
    };
    return mapping[timeframe] || '1m';
  }

  private getPollingInterval(timeframe: string): number {
    switch (timeframe) {
      case '1min': return 60000; // 1 minute
      case '5min': return 120000; // 2 minutes
      case '15min': return 300000; // 5 minutes
      case '30min': return 600000; // 10 minutes
      case '1hour': return 1800000; // 30 minutes
      case '1day': return 3600000; // 1 hour
      default: return 120000;
    }
  }
}
