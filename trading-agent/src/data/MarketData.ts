export interface BarData {
  symbol: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface QuoteData {
  symbol: string;
  timestamp: Date;
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
}

export interface TradeData {
  symbol: string;
  timestamp: Date;
  price: number;
  size: number;
}

export interface MarketDataProvider {
  /**
   * Subscribe to real-time bars for symbols
   */
  subscribeBars(symbols: string[], timeframe: string, callback: (bar: BarData) => void): Promise<void>;

  /**
   * Subscribe to real-time quotes
   */
  subscribeQuotes(symbols: string[], callback: (quote: QuoteData) => void): Promise<void>;

  /**
   * Get historical bars
   */
  getHistoricalBars(
    symbol: string,
    timeframe: string,
    start: Date,
    end: Date,
    limit?: number
  ): Promise<BarData[]>;

  /**
   * Get latest quote
   */
  getLatestQuote(symbol: string): Promise<QuoteData>;

  /**
   * Disconnect from data feed
   */
  disconnect(): Promise<void>;
}

export type Timeframe = '1min' | '5min' | '15min' | '30min' | '1hour' | '1day';
