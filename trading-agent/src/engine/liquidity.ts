import { BarData } from '../data/MarketData';

export interface LiquidityMetrics {
  symbol: string;
  averageDailyVolume: number;     // 20-day ADV
  recentVolume: number;          // Latest day/period volume
  marketCap?: number;            // Market cap if available
  spread?: number;               // Bid-ask spread
  lastUpdated: Date;
}

export interface LiquidityLimits {
  maxAdvPercentage: number;      // Max % of ADV per trade (e.g., 0.05 = 5%)
  minAdvThreshold: number;       // Min ADV to trade (e.g., 100000 shares)
  maxSpreadBps: number;         // Max spread in bps (e.g., 50 = 0.5%)
  requireMarketCap?: number;    // Min market cap requirement
}

export interface LiquidityAssessment {
  approved: boolean;
  maxShares: number;            // Max shares we can trade
  reason?: string;              // Rejection reason
  metrics: LiquidityMetrics;
}

/**
 * Liquidity Manager - Ensures we don't impact market with large trades
 * Enforces ADV participation limits and liquidity filters
 */
export class LiquidityManager {
  private metrics: Map<string, LiquidityMetrics> = new Map();
  private limits: LiquidityLimits;

  constructor(limits: LiquidityLimits) {
    this.limits = limits;
  }

  /**
   * Update volume data from market bars
   */
  updateVolumeData(bars: BarData[]): void {
    for (const bar of bars) {
      this.updateSymbolVolume(bar);
    }
  }

  /**
   * Update volume data for a single symbol
   */
  updateSymbolVolume(bar: BarData): void {
    const existing = this.metrics.get(bar.symbol);

    if (existing) {
      // Update existing metrics with new volume data
      // Use exponential moving average for ADV (20-day equivalent)
      const alpha = 2 / 21; // EMA smoothing factor
      existing.averageDailyVolume = (1 - alpha) * existing.averageDailyVolume + alpha * bar.volume;
      existing.recentVolume = bar.volume;
      existing.lastUpdated = bar.timestamp;
    } else {
      // Initialize new symbol
      this.metrics.set(bar.symbol, {
        symbol: bar.symbol,
        averageDailyVolume: bar.volume, // Start with current volume
        recentVolume: bar.volume,
        lastUpdated: bar.timestamp
      });
    }
  }

  /**
   * Update spread data (call when you have bid/ask data)
   */
  updateSpread(symbol: string, bid: number, ask: number): void {
    const existing = this.metrics.get(symbol);
    if (existing && bid > 0 && ask > 0) {
      const midpoint = (bid + ask) / 2;
      existing.spread = ((ask - bid) / midpoint) * 10000; // Convert to basis points
    }
  }

  /**
   * Assess if we can trade a given quantity of shares
   */
  assessLiquidity(symbol: string, requestedShares: number, price: number): LiquidityAssessment {
    const metrics = this.metrics.get(symbol);

    if (!metrics) {
      return {
        approved: false,
        maxShares: 0,
        reason: 'No liquidity data available for symbol',
        metrics: {
          symbol,
          averageDailyVolume: 0,
          recentVolume: 0,
          lastUpdated: new Date()
        }
      };
    }

    // Check minimum ADV threshold
    if (metrics.averageDailyVolume < this.limits.minAdvThreshold) {
      return {
        approved: false,
        maxShares: 0,
        reason: `ADV ${metrics.averageDailyVolume.toFixed(0)} below minimum ${this.limits.minAdvThreshold}`,
        metrics
      };
    }

    // Check spread limits (if available)
    if (metrics.spread && metrics.spread > this.limits.maxSpreadBps) {
      return {
        approved: false,
        maxShares: 0,
        reason: `Spread ${metrics.spread.toFixed(1)}bps exceeds limit ${this.limits.maxSpreadBps}bps`,
        metrics
      };
    }

    // Check market cap requirements (if available)
    if (this.limits.requireMarketCap && metrics.marketCap && metrics.marketCap < this.limits.requireMarketCap) {
      return {
        approved: false,
        maxShares: 0,
        reason: `Market cap below minimum requirement`,
        metrics
      };
    }

    // Calculate maximum shares based on ADV participation
    const maxSharesByAdv = Math.floor(metrics.averageDailyVolume * this.limits.maxAdvPercentage);
    const approvedShares = Math.min(requestedShares, maxSharesByAdv);

    const approved = approvedShares > 0 && approvedShares >= requestedShares;
    const reason = approved ? undefined :
      `Requested ${requestedShares} shares exceeds ${this.limits.maxAdvPercentage * 100}% ADV limit (${maxSharesByAdv} shares)`;

    return {
      approved,
      maxShares: approvedShares,
      reason,
      metrics
    };
  }

  /**
   * Get liquidity metrics for a symbol
   */
  getLiquidityMetrics(symbol: string): LiquidityMetrics | undefined {
    return this.metrics.get(symbol);
  }

  /**
   * Get all liquidity metrics
   */
  getAllMetrics(): Map<string, LiquidityMetrics> {
    return new Map(this.metrics);
  }

  /**
   * Update market cap data (external data source)
   */
  updateMarketCap(symbol: string, marketCap: number): void {
    const existing = this.metrics.get(symbol);
    if (existing) {
      existing.marketCap = marketCap;
    }
  }

  /**
   * Clean up stale data (older than 24 hours)
   */
  cleanup(): void {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

    for (const [symbol, metrics] of this.metrics.entries()) {
      if (metrics.lastUpdated < cutoff) {
        this.metrics.delete(symbol);
      }
    }
  }

  /**
   * Update liquidity limits
   */
  updateLimits(newLimits: Partial<LiquidityLimits>): void {
    this.limits = { ...this.limits, ...newLimits };
  }

  /**
   * Get current limits
   */
  getLimits(): LiquidityLimits {
    return { ...this.limits };
  }
}

/**
 * Conservative liquidity limits for institutional trading
 */
export const CONSERVATIVE_LIQUIDITY_LIMITS: LiquidityLimits = {
  maxAdvPercentage: 0.02,        // Max 2% of ADV per trade
  minAdvThreshold: 50000,        // Min 50k shares ADV
  maxSpreadBps: 30,              // Max 30bps spread
  requireMarketCap: 1000000000   // Min $1B market cap
};

/**
 * Moderate liquidity limits
 */
export const MODERATE_LIQUIDITY_LIMITS: LiquidityLimits = {
  maxAdvPercentage: 0.05,        // Max 5% of ADV per trade
  minAdvThreshold: 20000,        // Min 20k shares ADV
  maxSpreadBps: 50,              // Max 50bps spread
  requireMarketCap: 500000000    // Min $500M market cap
};
