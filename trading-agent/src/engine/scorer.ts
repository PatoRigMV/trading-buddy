import { clamp } from "./utils";
import { TechnicalSignals } from "./indicators";

export interface ScoringWeights {
  momentum: number;
  emaFast: number;
  emaSlow: number;
  rsi: number;
  volume: number;
  breakout: number;
  volatility: number;
}

export const DEFAULT_BUY_WEIGHTS: ScoringWeights = {
  momentum: 0.25,
  emaFast: 0.20,
  emaSlow: 0.15,
  rsi: 0.15,
  volume: 0.10,
  breakout: 0.10,
  volatility: 0.05
};

export const DEFAULT_SELL_WEIGHTS: ScoringWeights = {
  momentum: 0.20,
  emaFast: 0.15,
  emaSlow: 0.15,
  rsi: 0.25,
  volume: 0.05,
  breakout: 0.10,
  volatility: 0.10
};

export function buyConfidence(
  signals: TechnicalSignals,
  weights: ScoringWeights = DEFAULT_BUY_WEIGHTS
): number {
  const score =
    weights.momentum * signals.momentum +
    weights.emaFast * signals.emaFast +
    weights.emaSlow * signals.emaSlow +
    weights.rsi * signals.rsi +
    weights.volume * signals.volumeRatio +
    weights.breakout * signals.breakoutStrength +
    weights.volatility * (1 - signals.atr); // Lower volatility = higher confidence

  return clamp(score, 0, 1);
}

export function sellConfidence(
  signals: TechnicalSignals,
  weights: ScoringWeights = DEFAULT_SELL_WEIGHTS
): number {
  // For sell signals, we invert some indicators
  const invertedSignals = {
    momentum: 1 - signals.momentum,
    emaFast: 1 - signals.emaFast,
    emaSlow: 1 - signals.emaSlow,
    rsi: 1 - signals.rsi, // High RSI = overbought = sell signal
    volumeRatio: signals.volumeRatio, // High volume supports sell too
    breakoutStrength: 1 - signals.breakoutStrength,
    atr: signals.atr // Higher volatility = higher sell urgency
  };

  const score =
    weights.momentum * invertedSignals.momentum +
    weights.emaFast * invertedSignals.emaFast +
    weights.emaSlow * invertedSignals.emaSlow +
    weights.rsi * invertedSignals.rsi +
    weights.volume * invertedSignals.volumeRatio +
    weights.breakout * invertedSignals.breakoutStrength +
    weights.volatility * invertedSignals.atr;

  return clamp(score, 0, 1);
}

export interface ConfidenceScores {
  buy: number;
  sell: number;
  hold: number;
  timestamp: Date;
}

export function calculateConfidenceScores(
  signals: TechnicalSignals,
  buyWeights?: ScoringWeights,
  sellWeights?: ScoringWeights
): ConfidenceScores {
  const buyScore = buyConfidence(signals, buyWeights);
  const sellScore = sellConfidence(signals, sellWeights);

  // Hold confidence is inverse of both buy and sell
  const holdScore = 1 - Math.max(buyScore, sellScore);

  return {
    buy: buyScore,
    sell: sellScore,
    hold: clamp(holdScore, 0, 1),
    timestamp: new Date()
  };
}
