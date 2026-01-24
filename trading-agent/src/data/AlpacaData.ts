import { MarketDataProvider, BarData, QuoteData, Timeframe } from './MarketData';

export class AlpacaMarketData implements MarketDataProvider {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;
  private websocket: WebSocket | null = null;
  private subscriptions: Map<string, ((data: any) => void) | (() => void)> = new Map();

  constructor(apiKey: string, apiSecret: string, isPaper: boolean = true) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = 'https://data.alpaca.markets';
  }

  private getHeaders(): Record<string, string> {
    return {
      'APCA-API-KEY-ID': this.apiKey,
      'APCA-API-SECRET-KEY': this.apiSecret,
      'Content-Type': 'application/json'
    };
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount <= maxRetries) {
      try {
        const url = `${this.baseUrl}${endpoint}`;
        const response = await fetch(url, {
          ...options,
          headers: {
            ...this.getHeaders(),
            ...options.headers
          }
        });

        if (response.status === 429) {
          // Rate limited - exponential backoff
          const delay = Math.min(1000 * Math.pow(2, retryCount), 30000); // Max 30 seconds
          console.warn(`Rate limited, retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries + 1})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          retryCount++;
          continue;
        }

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Alpaca Data API error (${response.status}): ${errorText}`);
        }

        return response.json();
      } catch (error: any) {
        if (retryCount === maxRetries) {
          throw error;
        }

        // Exponential backoff for network errors too
        const delay = Math.min(500 * Math.pow(2, retryCount), 15000);
        console.warn(`Request failed, retrying in ${delay}ms:`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay));
        retryCount++;
      }
    }

    throw new Error('Max retries exceeded');
  }

  private mapTimeframe(timeframe: string): string {
    const mapping: Record<string, string> = {
      '1min': '1Min',
      '5min': '5Min',
      '15min': '15Min',
      '30min': '30Min',
      '1hour': '1Hour',
      '1day': '1Day'
    };
    return mapping[timeframe] || '1Min';
  }

  async subscribeBars(
    symbols: string[],
    timeframe: string,
    callback: (bar: BarData) => void
  ): Promise<void> {
    // For this implementation, we'll use REST API polling instead of WebSocket
    // In production, you'd want to use Alpaca's WebSocket for real-time data

    const pollInterval = this.getPollingInterval(timeframe);
    let isPolling = true;

    const poll = async () => {
      if (!isPolling) return;

      try {
        // Poll all symbols in smaller batches to avoid rate limits
        const batchSize = 3; // Process 3 symbols at a time
        for (let i = 0; i < symbols.length; i += batchSize) {
          const batch = symbols.slice(i, i + batchSize);

          await Promise.allSettled(batch.map(async (symbol) => {
            try {
              const bars = await this.getHistoricalBars(
                symbol,
                timeframe,
                new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
                new Date(),
                1 // Just get the latest bar
              );

              if (bars.length > 0) {
                callback(bars[0]);
              }
            } catch (error) {
              console.error(`Error polling ${symbol}:`, error);
              // Continue with other symbols
            }
          }));

          // Small delay between batches to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.error('Batch polling error:', error);
      }

      // Schedule next poll
      if (isPolling) {
        setTimeout(poll, pollInterval);
      }
    };

    // Start polling
    setTimeout(poll, 1000);

    // Store cleanup function
    this.subscriptions.set('bars_cleanup', () => {
      isPolling = false;
    });
  }

  async subscribeQuotes(symbols: string[], callback: (quote: QuoteData) => void): Promise<void> {
    // Similar to bars, use polling for quotes
    let isQuotePolling = true;

    const poll = async () => {
      if (!isQuotePolling) return;

      try {
        // Process quotes in batches to avoid rate limits
        const batchSize = 5;
        for (let i = 0; i < symbols.length; i += batchSize) {
          const batch = symbols.slice(i, i + batchSize);

          await Promise.allSettled(batch.map(async (symbol) => {
            try {
              const quote = await this.getLatestQuote(symbol);
              callback(quote);
            } catch (error) {
              console.error(`Error getting quote for ${symbol}:`, error);
            }
          }));

          // Small delay between batches
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } catch (error) {
        console.error('Quote polling error:', error);
      }

      if (isQuotePolling) {
        setTimeout(poll, 5000); // Poll every 5 seconds
      }
    };

    setTimeout(poll, 1000);

    // Store cleanup function
    this.subscriptions.set('quotes_cleanup', () => {
      isQuotePolling = false;
    });
  }

  async getHistoricalBars(
    symbol: string,
    timeframe: string,
    start: Date,
    end: Date,
    limit?: number
  ): Promise<BarData[]> {
    const params = new URLSearchParams({
      start: start.toISOString(),
      end: end.toISOString(),
      timeframe: this.mapTimeframe(timeframe),
      adjustment: 'raw',
      feed: 'iex',
      asof: '',
      page_token: '',
      sort: 'asc'
    });

    if (limit) {
      params.append('limit', limit.toString());
    }

    const endpoint = `/v2/stocks/${symbol}/bars?${params.toString()}`;
    const response = await this.makeRequest(endpoint);

    if (!response.bars) {
      return [];
    }

    return response.bars.map((bar: any) => ({
      symbol,
      timestamp: new Date(bar.t),
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v
    }));
  }

  async getLatestQuote(symbol: string): Promise<QuoteData> {
    const endpoint = `/v2/stocks/${symbol}/quotes/latest?feed=iex`;
    const response = await this.makeRequest(endpoint);

    const quote = response.quote;
    return {
      symbol,
      timestamp: new Date(quote.t),
      bid: quote.bp,
      ask: quote.ap,
      bidSize: quote.bs,
      askSize: quote.as
    };
  }

  async disconnect(): Promise<void> {
    // Clean up polling loops
    const barsCleanup = this.subscriptions.get('bars_cleanup');
    const quotesCleanup = this.subscriptions.get('quotes_cleanup');

    if (barsCleanup && typeof barsCleanup === 'function') {
      (barsCleanup as () => void)();
    }

    if (quotesCleanup && typeof quotesCleanup === 'function') {
      (quotesCleanup as () => void)();
    }

    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }

    this.subscriptions.clear();
    console.log('Market data disconnected and polling stopped');
  }

  private getPollingInterval(timeframe: string): number {
    // Return polling interval in milliseconds based on timeframe
    switch (timeframe) {
      case '1min': return 30000; // 30 seconds
      case '5min': return 60000; // 1 minute
      case '15min': return 300000; // 5 minutes
      case '30min': return 600000; // 10 minutes
      case '1hour': return 900000; // 15 minutes
      case '1day': return 3600000; // 1 hour
      default: return 60000;
    }
  }
}
