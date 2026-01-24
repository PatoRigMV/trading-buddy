// Volatility regime detection and classification
// Classifies market conditions based on volatility measures

export type VolatilityRegime = 'low' | 'normal' | 'high' | 'extreme';

export interface Bar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface VolatilityMetrics {
  atr: number; // Average True Range
  atrPercent: number; // ATR as % of price
  historicalVolatility: number; // Annualized historical volatility %
  parkinsonVolatility: number; // High-low volatility estimator
}

export interface RegimeAnalysis {
  regime: VolatilityRegime;
  metrics: VolatilityMetrics;
  percentile: number; // Current volatility percentile (0-100)
  inTransition: boolean; // True if regime is changing
  transitionDirection?: 'increasing' | 'decreasing';
  confidence: number; // 0-100 confidence in regime classification
  positionSizeMultiplier: number; // Suggested position size adjustment (0.5-2.0)
}

export interface VolatilityRegimeConfig {
  atrPeriod: number; // Period for ATR calculation
  hvPeriod: number; // Period for historical volatility
  lookbackPeriod: number; // Period for regime percentile calculation
  lowThreshold: number; // Percentile threshold for low volatility (e.g., 25)
  normalLowThreshold: number; // Percentile for normal low boundary (e.g., 40)
  normalHighThreshold: number; // Percentile for normal high boundary (e.g., 60)
  highThreshold: number; // Percentile threshold for high volatility (e.g., 75)
  transitionWindow: number; // Bars to look back for transition detection
  minConfidence: number; // Minimum confidence for regime classification
}

const DEFAULT_CONFIG: VolatilityRegimeConfig = {
  atrPeriod: 14,
  hvPeriod: 20,
  lookbackPeriod: 100,
  lowThreshold: 25,
  normalLowThreshold: 40,
  normalHighThreshold: 60,
  highThreshold: 75,
  transitionWindow: 5,
  minConfidence: 60,
};

export class VolatilityRegimeDetector {
  private config: VolatilityRegimeConfig;
  private volatilityHistory: number[] = [];

  constructor(config: Partial<VolatilityRegimeConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Analyze current volatility regime
   */
  public analyze(bars: Bar[]): RegimeAnalysis {
    if (bars.length < this.config.atrPeriod) {
      throw new Error(`Insufficient data: need at least ${this.config.atrPeriod} bars`);
    }

    const metrics = this.calculateMetrics(bars);

    // Update volatility history
    this.volatilityHistory.push(metrics.atrPercent);
    if (this.volatilityHistory.length > this.config.lookbackPeriod) {
      this.volatilityHistory.shift();
    }

    const percentile = this.calculatePercentile(metrics.atrPercent);
    const regime = this.classifyRegime(percentile);
    const { inTransition, transitionDirection } = this.detectTransition();
    const confidence = this.calculateConfidence(percentile, inTransition);
    const positionSizeMultiplier = this.calculatePositionSizeMultiplier(regime);

    return {
      regime,
      metrics,
      percentile,
      inTransition,
      transitionDirection,
      confidence,
      positionSizeMultiplier,
    };
  }

  /**
   * Calculate volatility metrics
   */
  private calculateMetrics(bars: Bar[]): VolatilityMetrics {
    const atr = this.calculateATR(bars);
    const currentPrice = bars[bars.length - 1].close;
    const atrPercent = (atr / currentPrice) * 100;

    const historicalVolatility = this.calculateHistoricalVolatility(bars);
    const parkinsonVolatility = this.calculateParkinsonVolatility(bars);

    return {
      atr,
      atrPercent,
      historicalVolatility,
      parkinsonVolatility,
    };
  }

  /**
   * Calculate Average True Range (ATR)
   */
  private calculateATR(bars: Bar[]): number {
    const period = this.config.atrPeriod;
    const trueRanges: number[] = [];

    for (let i = 1; i < bars.length; i++) {
      const high = bars[i].high;
      const low = bars[i].low;
      const prevClose = bars[i - 1].close;

      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );

      trueRanges.push(tr);
    }

    // Take last 'period' true ranges and average
    const recentTRs = trueRanges.slice(-period);
    return recentTRs.reduce((sum, tr) => sum + tr, 0) / recentTRs.length;
  }

  /**
   * Calculate historical volatility (annualized standard deviation of returns)
   */
  private calculateHistoricalVolatility(bars: Bar[]): number {
    const period = this.config.hvPeriod;
    const returns: number[] = [];

    for (let i = 1; i < bars.length; i++) {
      const ret = Math.log(bars[i].close / bars[i - 1].close);
      returns.push(ret);
    }

    const recentReturns = returns.slice(-period);
    const mean = recentReturns.reduce((sum, r) => sum + r, 0) / recentReturns.length;

    const variance =
      recentReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) /
      recentReturns.length;

    const dailyVol = Math.sqrt(variance);

    // Annualize (assuming 252 trading days)
    const annualizedVol = dailyVol * Math.sqrt(252) * 100;

    return annualizedVol;
  }

  /**
   * Calculate Parkinson volatility (high-low range estimator)
   * More efficient estimator than close-to-close
   */
  private calculateParkinsonVolatility(bars: Bar[]): number {
    const period = this.config.hvPeriod;
    const recentBars = bars.slice(-period);

    const sum = recentBars.reduce((acc, bar) => {
      const hlRatio = Math.log(bar.high / bar.low);
      return acc + Math.pow(hlRatio, 2);
    }, 0);

    // Parkinson constant: 1 / (4 * ln(2))
    const parkinsonConstant = 1 / (4 * Math.log(2));
    const dailyVol = Math.sqrt(parkinsonConstant * (sum / period));

    // Annualize
    const annualizedVol = dailyVol * Math.sqrt(252) * 100;

    return annualizedVol;
  }

  /**
   * Calculate percentile of current volatility vs historical
   */
  private calculatePercentile(currentVol: number): number {
    if (this.volatilityHistory.length < 2) {
      return 50; // Default to median if insufficient history
    }

    const sorted = [...this.volatilityHistory].sort((a, b) => a - b);
    const belowCount = sorted.filter((v) => v < currentVol).length;

    return (belowCount / sorted.length) * 100;
  }

  /**
   * Classify regime based on percentile
   */
  private classifyRegime(percentile: number): VolatilityRegime {
    if (percentile < this.config.lowThreshold) {
      return 'low';
    } else if (percentile < this.config.normalHighThreshold) {
      return 'normal';
    } else if (percentile < this.config.highThreshold) {
      return 'high';
    } else if (percentile < 95) {
      return 'high';
    } else {
      return 'extreme';
    }
  }

  /**
   * Detect if regime is in transition
   */
  private detectTransition(): {
    inTransition: boolean;
    transitionDirection?: 'increasing' | 'decreasing';
  } {
    const window = this.config.transitionWindow;

    if (this.volatilityHistory.length < window * 2) {
      return { inTransition: false };
    }

    // Compare recent window to previous window
    const recent = this.volatilityHistory.slice(-window);
    const previous = this.volatilityHistory.slice(-window * 2, -window);

    const recentAvg = recent.reduce((sum, v) => sum + v, 0) / recent.length;
    const previousAvg = previous.reduce((sum, v) => sum + v, 0) / previous.length;

    const changePercent = ((recentAvg - previousAvg) / previousAvg) * 100;

    // Consider transition if change > 20%
    if (Math.abs(changePercent) > 20) {
      return {
        inTransition: true,
        transitionDirection: changePercent > 0 ? 'increasing' : 'decreasing',
      };
    }

    return { inTransition: false };
  }

  /**
   * Calculate confidence in regime classification
   */
  private calculateConfidence(percentile: number, inTransition: boolean): number {
    let confidence = 100;

    // Reduce confidence if near regime boundaries
    const distanceFromLow = Math.abs(percentile - this.config.lowThreshold);
    const distanceFromNormalLow = Math.abs(
      percentile - this.config.normalLowThreshold
    );
    const distanceFromNormalHigh = Math.abs(
      percentile - this.config.normalHighThreshold
    );
    const distanceFromHigh = Math.abs(percentile - this.config.highThreshold);

    const minDistance = Math.min(
      distanceFromLow,
      distanceFromNormalLow,
      distanceFromNormalHigh,
      distanceFromHigh
    );

    // If within 5 percentile points of a boundary, reduce confidence
    if (minDistance < 5) {
      confidence -= (5 - minDistance) * 10;
    }

    // Reduce confidence during transitions
    if (inTransition) {
      confidence -= 20;
    }

    // Reduce confidence if insufficient history
    if (this.volatilityHistory.length < this.config.lookbackPeriod) {
      const historyRatio = this.volatilityHistory.length / this.config.lookbackPeriod;
      confidence *= historyRatio;
    }

    return Math.max(0, Math.min(100, confidence));
  }

  /**
   * Calculate position size multiplier based on regime
   * Low volatility = larger positions (up to 2x)
   * High volatility = smaller positions (down to 0.5x)
   */
  private calculatePositionSizeMultiplier(regime: VolatilityRegime): number {
    const multipliers: Record<VolatilityRegime, number> = {
      low: 1.5,
      normal: 1.0,
      high: 0.7,
      extreme: 0.5,
    };

    return multipliers[regime];
  }

  /**
   * Get trading recommendations based on regime
   */
  public getRecommendations(analysis: RegimeAnalysis): {
    tradeFrequency: 'aggressive' | 'normal' | 'conservative' | 'defensive';
    stopLossMultiplier: number; // Multiplier for stop loss distance
    takeProfitMultiplier: number; // Multiplier for take profit distance
    recommendations: string[];
  } {
    const { regime, inTransition } = analysis;

    let tradeFrequency: 'aggressive' | 'normal' | 'conservative' | 'defensive' = 'normal';
    let stopLossMultiplier = 1.0;
    let takeProfitMultiplier = 1.0;
    const recommendations: string[] = [];

    switch (regime) {
      case 'low':
        tradeFrequency = 'aggressive';
        stopLossMultiplier = 0.8; // Tighter stops in low vol
        takeProfitMultiplier = 1.2; // Wider targets
        recommendations.push('Low volatility: favorable for trend-following');
        recommendations.push('Consider larger position sizes');
        recommendations.push('Tighter stops acceptable');
        break;

      case 'normal':
        tradeFrequency = 'normal';
        stopLossMultiplier = 1.0;
        takeProfitMultiplier = 1.0;
        recommendations.push('Normal volatility: standard risk management');
        break;

      case 'high':
        tradeFrequency = 'conservative';
        stopLossMultiplier = 1.3; // Wider stops needed
        takeProfitMultiplier = 0.8; // Take profits faster
        recommendations.push('High volatility: reduce position sizes');
        recommendations.push('Wider stops to avoid whipsaws');
        recommendations.push('Consider shorter holding periods');
        break;

      case 'extreme':
        tradeFrequency = 'defensive';
        stopLossMultiplier = 1.5;
        takeProfitMultiplier = 0.7;
        recommendations.push('Extreme volatility: minimal trading recommended');
        recommendations.push('Significantly reduce position sizes');
        recommendations.push('Consider staying in cash');
        break;
    }

    if (inTransition) {
      recommendations.push(`Volatility ${analysis.transitionDirection}: monitor closely`);
      tradeFrequency = 'conservative';
    }

    return {
      tradeFrequency,
      stopLossMultiplier,
      takeProfitMultiplier,
      recommendations,
    };
  }

  /**
   * Reset volatility history (useful for testing or strategy resets)
   */
  public reset(): void {
    this.volatilityHistory = [];
  }

  /**
   * Get current volatility history
   */
  public getHistory(): number[] {
    return [...this.volatilityHistory];
  }
}

// Global detector instance
let globalDetector: VolatilityRegimeDetector | null = null;

export function getVolatilityDetector(
  config?: Partial<VolatilityRegimeConfig>
): VolatilityRegimeDetector {
  if (!globalDetector) {
    globalDetector = new VolatilityRegimeDetector(config);
  }
  return globalDetector;
}
