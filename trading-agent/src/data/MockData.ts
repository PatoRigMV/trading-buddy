import { MarketDataProvider, BarData, QuoteData } from './MarketData';

// Realistic stock prices for testing
const MOCK_STOCK_PRICES: Record<string, number> = {
  'AAPL': 225.50,
  'MSFT': 420.75,
  'NVDA': 125.80,
  'AMZN': 185.20,
  'GOOGL': 160.45,
  'TSLA': 248.90,
  'META': 560.30,
  'BRK-B': 455.60,
  'V': 290.85,
  'JNJ': 158.75,
  'JPM': 220.40,
  'BAC': 42.15,
  'WMT': 78.90,
  'HD': 385.60,
  'PG': 165.30,
  'KO': 61.25,
  'UNH': 590.80,
  'CVX': 155.40,
  'XOM': 118.70,
  'PEP': 162.90,
  'AMD': 142.35,
  'INTC': 24.80,
  'NFLX': 720.45,
  'CRM': 315.80,
  'NOW': 890.25,
  'ADBE': 535.60,
  'ORCL': 175.30,
  'CSCO': 58.40,
  'PLTR': 40.15,
  'SNOW': 120.85,
  'NET': 85.60,
  'CRWD': 385.20,
  'ZS': 195.75,
  'OKTA': 105.40,
  'DDOG': 125.90
};

export class MockMarketData implements MarketDataProvider {
  private priceData: Map<string, { basePrice: number; trend: number; volatility: number }> = new Map();
  private isRunning = false;
  private intervalId?: NodeJS.Timeout;

  constructor() {
    // Initialize each symbol with base price and random trend/volatility
    Object.entries(MOCK_STOCK_PRICES).forEach(([symbol, basePrice]) => {
      this.priceData.set(symbol, {
        basePrice,
        trend: (Math.random() - 0.5) * 0.02, // -1% to +1% trend per minute
        volatility: 0.005 + Math.random() * 0.015 // 0.5% to 2% volatility
      });
    });
  }

  async subscribeBars(
    symbols: string[],
    timeframe: string,
    callback: (bar: BarData) => void
  ): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    const pollInterval = this.getPollingInterval(timeframe);

    const generateBars = () => {
      for (const symbol of symbols) {
        const data = this.priceData.get(symbol);
        if (!data) continue;

        // Generate realistic OHLCV data with trends and volatility
        const basePrice = this.getCurrentPrice(symbol);
        const volatility = data.volatility;

        const open = basePrice * (1 + (Math.random() - 0.5) * volatility * 0.5);
        const close = basePrice * (1 + data.trend + (Math.random() - 0.5) * volatility);
        const high = Math.max(open, close) * (1 + Math.random() * volatility * 0.3);
        const low = Math.min(open, close) * (1 - Math.random() * volatility * 0.3);
        const volume = Math.floor(1000000 + Math.random() * 5000000);

        // Update base price for next iteration
        data.basePrice = close;

        // Occasionally change trend direction
        if (Math.random() < 0.1) {
          data.trend = (Math.random() - 0.5) * 0.02;
        }

        const bar: BarData = {
          symbol,
          timestamp: new Date(),
          open,
          high,
          low,
          close,
          volume
        };

        callback(bar);
      }
    };

    // Generate initial bars
    generateBars();

    // Set up polling
    this.intervalId = setInterval(generateBars, pollInterval);
  }

  async subscribeQuotes(symbols: string[], callback: (quote: QuoteData) => void): Promise<void> {
    const generateQuotes = () => {
      for (const symbol of symbols) {
        const price = this.getCurrentPrice(symbol);
        const spread = price * 0.0001; // 1 basis point spread

        const quote: QuoteData = {
          symbol,
          timestamp: new Date(),
          bid: price - spread/2,
          ask: price + spread/2,
          bidSize: Math.floor(100 + Math.random() * 900),
          askSize: Math.floor(100 + Math.random() * 900)
        };

        callback(quote);
      }
    };

    // Generate initial quotes
    generateQuotes();

    // Update quotes every 5 seconds
    setInterval(generateQuotes, 5000);
  }

  async getHistoricalBars(
    symbol: string,
    timeframe: string,
    start: Date,
    end: Date,
    limit?: number
  ): Promise<BarData[]> {
    const data = this.priceData.get(symbol);
    if (!data) return [];

    const bars: BarData[] = [];
    const intervalMs = this.getPollingInterval(timeframe);
    const periods = Math.min(limit || 100, 100);

    let currentTime = new Date(Date.now() - periods * intervalMs);
    let currentPrice = data.basePrice * 0.98; // Start slightly lower for trend

    for (let i = 0; i < periods; i++) {
      const trend = (Math.random() - 0.45) * 0.01; // Slight upward bias
      const volatility = data.volatility;

      const open = currentPrice;
      const close = currentPrice * (1 + trend + (Math.random() - 0.5) * volatility);
      const high = Math.max(open, close) * (1 + Math.random() * volatility * 0.3);
      const low = Math.min(open, close) * (1 - Math.random() * volatility * 0.3);
      const volume = Math.floor(500000 + Math.random() * 2000000);

      bars.push({
        symbol,
        timestamp: new Date(currentTime),
        open,
        high,
        low,
        close,
        volume
      });

      currentPrice = close;
      currentTime = new Date(currentTime.getTime() + intervalMs);
    }

    return bars;
  }

  async getLatestQuote(symbol: string): Promise<QuoteData> {
    const price = this.getCurrentPrice(symbol);
    const spread = price * 0.0001; // 1 basis point spread

    return {
      symbol,
      timestamp: new Date(),
      bid: price - spread/2,
      ask: price + spread/2,
      bidSize: Math.floor(100 + Math.random() * 900),
      askSize: Math.floor(100 + Math.random() * 900)
    };
  }

  async disconnect(): Promise<void> {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  private getCurrentPrice(symbol: string): number {
    const data = this.priceData.get(symbol);
    if (!data) return 100; // Default price
    return data.basePrice;
  }

  private getPollingInterval(timeframe: string): number {
    switch (timeframe) {
      case '1min': return 60000; // 1 minute
      case '5min': return 120000; // 2 minutes for testing
      case '15min': return 180000; // 3 minutes for testing
      case '30min': return 240000; // 4 minutes for testing
      case '1hour': return 300000; // 5 minutes for testing
      case '1day': return 360000; // 6 minutes for testing
      default: return 60000;
    }
  }
}
