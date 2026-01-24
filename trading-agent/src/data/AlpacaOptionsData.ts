/**
 * Alpaca Options Market Data Provider
 * Provides options quotes, Greeks, and option chain data via Alpaca API
 */

import { MarketDataProvider, MarketBar } from '../adapters/MarketDataProvider';
import {
  OptionContract,
  OptionQuote,
  Greeks,
  VolatilityAnalysis,
  OptionsMarketCondition,
  OptionsStrategy
} from '../types/options';

// Alpaca API response types
interface AlpacaOptionContract {
  symbol: string;
  underlying_symbol: string;
  type: 'call' | 'put';
  strike_price: string;
  expiration_date: string;
  size: string;
  exchange: string;
}

interface AlpacaOptionQuote {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  last_size: number;
  bid_size: number;
  ask_size: number;
  volume: number;
  open_interest: number;
  implied_volatility?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  rho?: number;
  timestamp: string;
}

interface AlpacaOptionChainResponse {
  option_contracts: AlpacaOptionContract[];
  next_page_token?: string;
}

interface AlpacaOptionQuotesResponse {
  quotes: { [symbol: string]: AlpacaOptionQuote };
}

export interface OptionsMarketDataProvider extends MarketDataProvider {
  // Options-specific methods
  getOptionChain(
    underlyingSymbol: string,
    expirationDate?: Date,
    strikeRange?: { min: number; max: number }
  ): Promise<OptionContract[]>;

  getOptionQuote(optionSymbol: string): Promise<OptionQuote>;

  getOptionQuotes(optionSymbols: string[]): Promise<OptionQuote[]>;

  getImpliedVolatility(
    underlyingSymbol: string,
    strike: number,
    expiration: Date,
    optionType: 'call' | 'put'
  ): Promise<number>;

  calculateGreeks(
    underlyingPrice: number,
    strike: number,
    timeToExpiration: number,
    riskFreeRate: number,
    impliedVolatility: number,
    optionType: 'call' | 'put'
  ): Promise<Greeks>;

  analyzeVolatility(underlyingSymbol: string): Promise<VolatilityAnalysis>;
  getOptionsMarketCondition(underlyingSymbol: string): Promise<OptionsMarketCondition>;
}

export class AlpacaOptionsData implements OptionsMarketDataProvider {
  private apiKey: string;
  private secretKey: string;
  private baseUrl: string;
  private isPaper: boolean;

  constructor(apiKey: string, secretKey: string, isPaper: boolean = true) {
    this.apiKey = apiKey;
    this.secretKey = secretKey;
    this.isPaper = isPaper;
    this.baseUrl = isPaper
      ? 'https://paper-api.alpaca.markets'
      : 'https://api.alpaca.markets';
  }

  private getHeaders(): Record<string, string> {
    return {
      'APCA-API-KEY-ID': this.apiKey,
      'APCA-API-SECRET-KEY': this.secretKey,
      'Content-Type': 'application/json',
    };
  }

  // Implement base MarketDataProvider methods
  async getCurrentPrice(symbol: string): Promise<number> {
    // For options, we'll return the mid price
    if (this.isOptionSymbol(symbol)) {
      const quote = await this.getOptionQuote(symbol);
      return (quote.bid + quote.ask) / 2;
    }

    // For stocks, use existing logic (would need to implement or inherit)
    const response = await fetch(
      `${this.baseUrl}/v2/stocks/${symbol}/quotes/latest`,
      { headers: this.getHeaders() }
    );

    if (!response.ok) {
      throw new Error(`Failed to get current price for ${symbol}: ${response.statusText}`);
    }

    const data = await response.json() as any;
    return (data.quote.bid_price + data.quote.ask_price) / 2;
  }

  async getHistoricalBars(
    symbol: string,
    timeframe: string,
    start: Date,
    end: Date
  ): Promise<MarketBar[]> {
    // Options don't have historical bars in the same way
    if (this.isOptionSymbol(symbol)) {
      throw new Error('Historical bars not supported for options contracts');
    }

    // Implement stock historical bars (would need full implementation)
    throw new Error('Stock historical bars not implemented in options provider');
  }

  // Options-specific implementations

  async getOptionQuote(optionSymbol: string): Promise<OptionQuote> {
    const quotes = await this.getOptionQuotes([optionSymbol]);
    if (quotes.length === 0) {
      throw new Error(`No quote found for option ${optionSymbol}`);
    }
    return quotes[0];
  }

  async getOptionQuotes(optionSymbols: string[]): Promise<OptionQuote[]> {
    const symbolsParam = optionSymbols.join(',');

    const response = await fetch(
      `${this.baseUrl}/v1beta1/options/quotes/latest?symbols=${symbolsParam}`,
      { headers: this.getHeaders() }
    );

    if (!response.ok) {
      throw new Error(`Failed to get option quotes: ${response.statusText}`);
    }

    const data = await response.json() as AlpacaOptionQuotesResponse;

    const quotes: OptionQuote[] = [];

    for (const [symbol, alpacaQuote] of Object.entries(data.quotes)) {
      try {
        const contract = await this.parseOptionSymbol(symbol);
        const quote = await this.convertAlpacaQuote(symbol, alpacaQuote, contract);
        quotes.push(quote);
      } catch (error) {
        console.warn(`Failed to process option quote for ${symbol}:`, error);
      }
    }

    return quotes;
  }

  async getImpliedVolatility(
    underlyingSymbol: string,
    strike: number,
    expiration: Date,
    optionType: 'call' | 'put'
  ): Promise<number> {
    // Find the specific option contract
    const optionSymbol = this.buildOptionSymbol(underlyingSymbol, optionType, strike, expiration);

    try {
      const quote = await this.getOptionQuote(optionSymbol);
      return quote.impliedVolatility;
    } catch (error) {
      console.warn(`Failed to get IV for ${optionSymbol}, using fallback calculation`);

      // Fallback: estimate IV from option price using Black-Scholes
      const underlyingPrice = await this.getCurrentPrice(underlyingSymbol);
      return this.estimateIVFromPrice(underlyingPrice, strike, expiration, optionType, 0); // Would need actual option price
    }
  }

  async calculateGreeks(
    underlyingPrice: number,
    strike: number,
    timeToExpiration: number,
    riskFreeRate: number,
    impliedVolatility: number,
    optionType: 'call' | 'put'
  ): Promise<Greeks> {
    // Black-Scholes Greeks calculations
    const d1 = (Math.log(underlyingPrice / strike) +
                (riskFreeRate + 0.5 * impliedVolatility ** 2) * timeToExpiration) /
               (impliedVolatility * Math.sqrt(timeToExpiration));

    const d2 = d1 - impliedVolatility * Math.sqrt(timeToExpiration);

    const nd1 = this.normalCDF(d1);
    const nd2 = this.normalCDF(d2);
    const nPrimeD1 = this.normalPDF(d1);

    let delta: number;
    let gamma: number;
    let theta: number;
    let vega: number;
    let rho: number;

    if (optionType === 'call') {
      delta = nd1;
      rho = strike * timeToExpiration * Math.exp(-riskFreeRate * timeToExpiration) * nd2;
    } else {
      delta = nd1 - 1;
      rho = -strike * timeToExpiration * Math.exp(-riskFreeRate * timeToExpiration) * this.normalCDF(-d2);
    }

    // Common Greeks for both calls and puts
    gamma = nPrimeD1 / (underlyingPrice * impliedVolatility * Math.sqrt(timeToExpiration));

    theta = (-underlyingPrice * nPrimeD1 * impliedVolatility) / (2 * Math.sqrt(timeToExpiration)) -
            riskFreeRate * strike * Math.exp(-riskFreeRate * timeToExpiration) *
            (optionType === 'call' ? nd2 : this.normalCDF(-d2));
    theta = theta / 365; // Convert to daily theta

    vega = underlyingPrice * Math.sqrt(timeToExpiration) * nPrimeD1 / 100; // Per 1% IV change

    return { delta, gamma, theta, vega, rho };
  }

  async analyzeVolatility(underlyingSymbol: string): Promise<VolatilityAnalysis> {
    // Get historical volatility (would need historical data)
    // For now, return mock analysis - would implement full calculation
    return {
      symbol: underlyingSymbol,
      historicalVolatility: {
        hv10: 0.25,
        hv20: 0.28,
        hv30: 0.30,
        hv60: 0.32
      },
      impliedVolatility: {
        currentIV: 0.35,
        ivRank: 75,
        ivPercentile: 80
      },
      volatilitySkew: {
        callSkew: [0.30, 0.32, 0.35, 0.38, 0.42],
        putSkew: [0.45, 0.40, 0.35, 0.32, 0.30],
        termStructure: [0.25, 0.30, 0.35, 0.38]
      },
      recommendation: 'sell_vol',
      confidence: 0.75,
      updatedAt: new Date()
    };
  }

  async getOptionsMarketCondition(underlyingSymbol: string): Promise<OptionsMarketCondition> {
    // Mock implementation - would need full market analysis
    return {
      underlyingTrend: 'bullish',
      volatilityEnvironment: 'high',
      expectedMove: 15.50,
      supportLevels: [145, 140, 135],
      resistanceLevels: [155, 160, 165],
      putCallRatio: 0.85,
      maxPain: 150,
      gammaLevels: [145, 150, 155],
      recommendedStrategies: [OptionsStrategy.LONG_CALL, OptionsStrategy.BULL_CALL_SPREAD],
      timestamp: new Date()
    };
  }

  // Helper methods
  private isOptionSymbol(symbol: string): boolean {
    // OCC format: AAPL240920C00150000 (21 characters)
    return symbol.length >= 15 && /^[A-Z]+\d{6}[CP]\d{8}$/.test(symbol);
  }

  private async parseOptionSymbol(symbol: string): Promise<OptionContract> {
    // Parse OCC format: AAPL240920C00150000
    const match = symbol.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);

    if (!match) {
      throw new Error(`Invalid option symbol format: ${symbol}`);
    }

    const [, underlying, dateStr, typeChar, strikeStr] = match;

    const year = 2000 + parseInt(dateStr.substring(0, 2));
    const month = parseInt(dateStr.substring(2, 4)) - 1; // JS months are 0-based
    const day = parseInt(dateStr.substring(4, 6));

    const expiration = new Date(year, month, day);
    const contractType = typeChar === 'C' ? 'call' : 'put';
    const strike = parseInt(strikeStr) / 1000; // Strike is in thousandths

    return {
      symbol,
      underlyingSymbol: underlying,
      contractType,
      strikePrice: strike,
      expirationDate: expiration,
      multiplier: 100,
      exchange: 'CBOE' // Default
    };
  }

  private buildOptionSymbol(
    underlying: string,
    type: 'call' | 'put',
    strike: number,
    expiration: Date
  ): string {
    const year = expiration.getFullYear().toString().substring(2);
    const month = (expiration.getMonth() + 1).toString().padStart(2, '0');
    const day = expiration.getDate().toString().padStart(2, '0');

    const typeChar = type === 'call' ? 'C' : 'P';
    const strikeStr = Math.round(strike * 1000).toString().padStart(8, '0');

    return `${underlying}${year}${month}${day}${typeChar}${strikeStr}`;
  }

  private convertAlpacaContract(contract: AlpacaOptionContract): OptionContract {
    return {
      symbol: contract.symbol,
      underlyingSymbol: contract.underlying_symbol,
      contractType: contract.type,
      strikePrice: parseFloat(contract.strike_price),
      expirationDate: new Date(contract.expiration_date),
      multiplier: parseInt(contract.size),
      exchange: contract.exchange
    };
  }

  private async convertAlpacaQuote(
    symbol: string,
    alpacaQuote: AlpacaOptionQuote,
    contract: OptionContract
  ): Promise<OptionQuote> {
    const intrinsicValue = this.calculateIntrinsicValue(
      contract.contractType,
      contract.strikePrice,
      await this.getCurrentPrice(contract.underlyingSymbol)
    );

    const mid = (alpacaQuote.bid + alpacaQuote.ask) / 2;
    const timeValue = Math.max(0, mid - intrinsicValue);

    return {
      contract,
      bid: alpacaQuote.bid,
      ask: alpacaQuote.ask,
      last: alpacaQuote.last,
      volume: alpacaQuote.volume,
      openInterest: alpacaQuote.open_interest,
      impliedVolatility: alpacaQuote.implied_volatility || 0,
      delta: alpacaQuote.delta || 0,
      gamma: alpacaQuote.gamma || 0,
      theta: alpacaQuote.theta || 0,
      vega: alpacaQuote.vega || 0,
      rho: alpacaQuote.rho || 0,
      intrinsicValue,
      timeValue,
      bidSize: alpacaQuote.bid_size,
      askSize: alpacaQuote.ask_size,
      timestamp: new Date(alpacaQuote.timestamp)
    };
  }

  private calculateIntrinsicValue(
    optionType: 'call' | 'put',
    strike: number,
    underlyingPrice: number
  ): number {
    if (optionType === 'call') {
      return Math.max(0, underlyingPrice - strike);
    } else {
      return Math.max(0, strike - underlyingPrice);
    }
  }

  private estimateIVFromPrice(
    underlyingPrice: number,
    strike: number,
    expiration: Date,
    optionType: 'call' | 'put',
    optionPrice: number
  ): number {
    // Newton-Raphson method to solve for IV given option price
    // This is a simplified implementation
    let iv = 0.3; // Initial guess
    const timeToExpiration = (expiration.getTime() - Date.now()) / (365.25 * 24 * 60 * 60 * 1000);
    const riskFreeRate = 0.05; // Assume 5%

    for (let i = 0; i < 100; i++) {
      const price = this.blackScholesPrice(underlyingPrice, strike, timeToExpiration, riskFreeRate, iv, optionType);
      const vega = this.blackScholesVega(underlyingPrice, strike, timeToExpiration, riskFreeRate, iv);

      const diff = price - optionPrice;
      if (Math.abs(diff) < 0.001) break;

      iv = iv - diff / vega;
      iv = Math.max(0.01, Math.min(5.0, iv)); // Constrain IV
    }

    return iv;
  }

  private blackScholesPrice(
    S: number, K: number, T: number, r: number, sigma: number, type: 'call' | 'put'
  ): number {
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);

    if (type === 'call') {
      return S * this.normalCDF(d1) - K * Math.exp(-r * T) * this.normalCDF(d2);
    } else {
      return K * Math.exp(-r * T) * this.normalCDF(-d2) - S * this.normalCDF(-d1);
    }
  }

  private blackScholesVega(S: number, K: number, T: number, r: number, sigma: number): number {
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * Math.sqrt(T));
    return S * Math.sqrt(T) * this.normalPDF(d1) / 100;
  }

  private normalCDF(x: number): number {
    // Approximation of cumulative standard normal distribution
    return (1.0 + this.erf(x / Math.sqrt(2.0))) / 2.0;
  }

  private normalPDF(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  }

  private erf(x: number): number {
    // Approximation of error function
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;

    const sign = x >= 0 ? 1 : -1;
    x = Math.abs(x);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return sign * y;
  }

  // Missing method for IV Rank
  async getIVRank(symbol: string): Promise<{ ivRank: number; ivPercentile: number; currentIV: number }> {
    try {
      // This is a simplified implementation
      // In a real implementation, you'd fetch historical IV data and calculate percentiles
      const currentPrice = await this.getCurrentPrice(symbol);

      // Mock data for now - in production you'd calculate from historical IV data
      return {
        ivRank: 50, // Placeholder: 0-100 scale
        ivPercentile: 50, // Placeholder: 0-100 scale
        currentIV: 0.25 // Placeholder: 25% IV
      };
    } catch (error) {
      console.error(`Failed to get IV rank for ${symbol}:`, error);
      return {
        ivRank: 0,
        ivPercentile: 0,
        currentIV: 0
      };
    }
  }

  // Override getOptionChain to match server call pattern
  async getOptionChain(
    underlyingSymbol: string,
    strikeMin?: number,
    strikeMax?: number,
    expirationMin?: Date,
    expirationMax?: Date
  ): Promise<OptionContract[]> {
    try {
      const params = new URLSearchParams();
      params.append('underlying_symbols', underlyingSymbol);

      if (strikeMin !== undefined) params.append('strike_price_gte', strikeMin.toString());
      if (strikeMax !== undefined) params.append('strike_price_lte', strikeMax.toString());
      if (expirationMin) params.append('expiration_date_gte', expirationMin.toISOString().split('T')[0]);
      if (expirationMax) params.append('expiration_date_lte', expirationMax.toISOString().split('T')[0]);

      const response = await fetch(
        `${this.baseUrl}/v1beta1/options/contracts?${params}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error(`Failed to get option chain: ${response.statusText}`);
      }

      const data = await response.json() as AlpacaOptionChainResponse;
      return data.option_contracts.map(contract => this.convertAlpacaContract(contract));
    } catch (error) {
      console.error(`Failed to get option chain for ${underlyingSymbol}:`, error);
      return [];
    }
  }
}
