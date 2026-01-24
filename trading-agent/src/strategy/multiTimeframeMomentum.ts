// Multi-timeframe momentum analyzer
// Analyzes momentum across multiple timeframes to detect trend alignment

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export interface Bar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MomentumSignal {
  timeframe: Timeframe;
  momentum: number; // Rate of change percentage
  direction: 'bullish' | 'bearish' | 'neutral';
  strength: number; // 0-100 scale
}

export interface MultiTimeframeMomentum {
  signals: MomentumSignal[];
  alignment: 'strong_bullish' | 'bullish' | 'neutral' | 'bearish' | 'strong_bearish';
  alignmentScore: number; // -100 to 100
  divergence: boolean; // True if timeframes disagree significantly
  confidence: number; // 0-100 based on alignment
}

export interface MultiTimeframeMomentumConfig {
  timeframes: Timeframe[];
  momentumPeriod: number; // Lookback period for momentum calculation
  strongAlignmentThreshold: number; // % of timeframes that must agree
  divergenceThreshold: number; // Minimum spread between timeframes to flag divergence
}

const DEFAULT_CONFIG: MultiTimeframeMomentumConfig = {
  timeframes: ['1m', '5m', '15m', '1h'],
  momentumPeriod: 14,
  strongAlignmentThreshold: 0.75, // 75% agreement
  divergenceThreshold: 20, // 20 percentage point spread
};

export class MultiTimeframeMomentumAnalyzer {
  private config: MultiTimeframeMomentumConfig;

  constructor(config: Partial<MultiTimeframeMomentumConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Analyze momentum across multiple timeframes
   */
  public analyze(barsByTimeframe: Map<Timeframe, Bar[]>): MultiTimeframeMomentum {
    const signals: MomentumSignal[] = [];

    for (const timeframe of this.config.timeframes) {
      const bars = barsByTimeframe.get(timeframe);
      if (!bars || bars.length < this.config.momentumPeriod) {
        continue;
      }

      const signal = this.calculateMomentum(timeframe, bars);
      signals.push(signal);
    }

    const alignment = this.detectAlignment(signals);
    const alignmentScore = this.calculateAlignmentScore(signals);
    const divergence = this.detectDivergence(signals);
    const confidence = this.calculateConfidence(signals, alignment, divergence);

    return {
      signals,
      alignment,
      alignmentScore,
      divergence,
      confidence,
    };
  }

  /**
   * Calculate momentum for a single timeframe using rate of change
   */
  private calculateMomentum(timeframe: Timeframe, bars: Bar[]): MomentumSignal {
    const period = this.config.momentumPeriod;
    const currentPrice = bars[bars.length - 1].close;
    const pastPrice = bars[bars.length - period].close;

    // Rate of change percentage
    const momentum = ((currentPrice - pastPrice) / pastPrice) * 100;

    // Determine direction
    let direction: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    if (momentum > 1) direction = 'bullish';
    else if (momentum < -1) direction = 'bearish';

    // Calculate strength (normalize to 0-100 scale)
    const strength = Math.min(100, Math.abs(momentum) * 10);

    return {
      timeframe,
      momentum,
      direction,
      strength,
    };
  }

  /**
   * Detect overall trend alignment across timeframes
   */
  private detectAlignment(signals: MomentumSignal[]): MultiTimeframeMomentum['alignment'] {
    if (signals.length === 0) return 'neutral';

    const bullishCount = signals.filter((s) => s.direction === 'bullish').length;
    const bearishCount = signals.filter((s) => s.direction === 'bearish').length;
    const total = signals.length;

    const bullishRatio = bullishCount / total;
    const bearishRatio = bearishCount / total;

    if (bullishRatio >= this.config.strongAlignmentThreshold) {
      return 'strong_bullish';
    } else if (bullishRatio > 0.5) {
      return 'bullish';
    } else if (bearishRatio >= this.config.strongAlignmentThreshold) {
      return 'strong_bearish';
    } else if (bearishRatio > 0.5) {
      return 'bearish';
    }

    return 'neutral';
  }

  /**
   * Calculate alignment score (-100 to 100)
   * Positive = bullish alignment, Negative = bearish alignment
   */
  private calculateAlignmentScore(signals: MomentumSignal[]): number {
    if (signals.length === 0) return 0;

    let score = 0;
    for (const signal of signals) {
      if (signal.direction === 'bullish') {
        score += signal.strength;
      } else if (signal.direction === 'bearish') {
        score -= signal.strength;
      }
    }

    // Normalize to -100 to 100 scale
    return Math.max(-100, Math.min(100, score / signals.length));
  }

  /**
   * Detect divergence between timeframes
   * Returns true if short-term and long-term momentum disagree significantly
   */
  private detectDivergence(signals: MomentumSignal[]): boolean {
    if (signals.length < 2) return false;

    // Get shortest and longest timeframe signals
    const shortTerm = signals[0];
    const longTerm = signals[signals.length - 1];

    // Check if directions are opposite
    const oppositeDirections =
      (shortTerm.direction === 'bullish' && longTerm.direction === 'bearish') ||
      (shortTerm.direction === 'bearish' && longTerm.direction === 'bullish');

    if (!oppositeDirections) return false;

    // Check if momentum values are significantly different
    const momentumSpread = Math.abs(shortTerm.momentum - longTerm.momentum);
    return momentumSpread >= this.config.divergenceThreshold;
  }

  /**
   * Calculate confidence score (0-100) based on alignment and divergence
   */
  private calculateConfidence(
    signals: MomentumSignal[],
    alignment: MultiTimeframeMomentum['alignment'],
    divergence: boolean
  ): number {
    if (signals.length === 0) return 0;

    let confidence = 50; // Base confidence

    // Increase confidence for strong alignment
    if (alignment === 'strong_bullish' || alignment === 'strong_bearish') {
      confidence += 30;
    } else if (alignment === 'bullish' || alignment === 'bearish') {
      confidence += 15;
    }

    // Decrease confidence if divergence detected
    if (divergence) {
      confidence -= 25;
    }

    // Adjust based on average strength
    const avgStrength =
      signals.reduce((sum, s) => sum + s.strength, 0) / signals.length;
    confidence += (avgStrength - 50) * 0.3;

    return Math.max(0, Math.min(100, confidence));
  }

  /**
   * Get timeframe duration in milliseconds
   */
  private getTimeframeDuration(timeframe: Timeframe): number {
    const durations: Record<Timeframe, number> = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
    };
    return durations[timeframe];
  }

  /**
   * Aggregate bars into a different timeframe
   * Useful for converting 1m bars to 5m, 15m, etc.
   */
  public aggregateBars(bars: Bar[], targetTimeframe: Timeframe): Bar[] {
    if (bars.length === 0) return [];

    const duration = this.getTimeframeDuration(targetTimeframe);
    const aggregated: Bar[] = [];
    let currentBar: Bar | null = null;

    for (const bar of bars) {
      if (!currentBar) {
        currentBar = { ...bar };
        continue;
      }

      const timeDiff = bar.timestamp - currentBar.timestamp;

      if (timeDiff >= duration) {
        // Close current bar and start new one
        aggregated.push(currentBar);
        currentBar = { ...bar };
      } else {
        // Update current bar
        currentBar.high = Math.max(currentBar.high, bar.high);
        currentBar.low = Math.min(currentBar.low, bar.low);
        currentBar.close = bar.close;
        currentBar.volume += bar.volume;
      }
    }

    // Add final bar
    if (currentBar) {
      aggregated.push(currentBar);
    }

    return aggregated;
  }

  /**
   * Get trading signal based on multi-timeframe analysis
   */
  public getTradeSignal(momentum: MultiTimeframeMomentum): {
    action: 'buy' | 'sell' | 'hold';
    confidence: number;
    reason: string;
  } {
    // Strong alignment with high confidence = trade signal
    if (
      momentum.alignment === 'strong_bullish' &&
      momentum.confidence >= 70 &&
      !momentum.divergence
    ) {
      return {
        action: 'buy',
        confidence: momentum.confidence,
        reason: 'Strong bullish alignment across all timeframes',
      };
    }

    if (
      momentum.alignment === 'strong_bearish' &&
      momentum.confidence >= 70 &&
      !momentum.divergence
    ) {
      return {
        action: 'sell',
        confidence: momentum.confidence,
        reason: 'Strong bearish alignment across all timeframes',
      };
    }

    // Divergence = caution
    if (momentum.divergence) {
      return {
        action: 'hold',
        confidence: momentum.confidence,
        reason: 'Divergence detected between timeframes',
      };
    }

    // Weak alignment = wait
    if (momentum.alignment === 'neutral' || momentum.confidence < 60) {
      return {
        action: 'hold',
        confidence: momentum.confidence,
        reason: 'Insufficient trend alignment',
      };
    }

    return {
      action: 'hold',
      confidence: momentum.confidence,
      reason: 'Conditions not met for trading',
    };
  }
}

// Global analyzer instance
let globalAnalyzer: MultiTimeframeMomentumAnalyzer | null = null;

export function getMomentumAnalyzer(
  config?: Partial<MultiTimeframeMomentumConfig>
): MultiTimeframeMomentumAnalyzer {
  if (!globalAnalyzer) {
    globalAnalyzer = new MultiTimeframeMomentumAnalyzer(config);
  }
  return globalAnalyzer;
}
