/**
 * Base Market Data Provider Interface
 */

export interface MarketBar {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketDataProvider {
  getCurrentPrice(symbol: string): Promise<number>;
  getHistoricalBars(
    symbol: string,
    timeframe: string,
    start: Date,
    end: Date
  ): Promise<MarketBar[]>;
}
