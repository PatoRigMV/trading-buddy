import { describe, it, expect } from 'vitest';
import { buyConfidence, sellConfidence, calculateConfidenceScores } from '../src/engine/scorer';
import { TechnicalSignals } from '../src/engine/indicators';

describe('Scorer', () => {
  const mockSignals: TechnicalSignals = {
    rsi: 0.3, // Oversold
    emaFast: 0.8, // Bullish
    emaSlow: 0.7, // Bullish
    atr: 0.2, // Low volatility
    volumeRatio: 0.9, // High volume
    breakoutStrength: 0.8, // Strong breakout
    momentum: 0.6 // Positive momentum
  };

  it('should calculate buy confidence correctly', () => {
    const confidence = buyConfidence(mockSignals);
    expect(confidence).toBeGreaterThan(0.5);
    expect(confidence).toBeLessThanOrEqual(1);
  });

  it('should calculate sell confidence correctly', () => {
    const bearishSignals: TechnicalSignals = {
      rsi: 0.8, // Overbought
      emaFast: 0.2, // Bearish
      emaSlow: 0.3, // Bearish
      atr: 0.8, // High volatility
      volumeRatio: 0.6, // Moderate volume
      breakoutStrength: 0.2, // Weak
      momentum: 0.1 // Negative momentum
    };

    const confidence = sellConfidence(bearishSignals);
    expect(confidence).toBeGreaterThan(0.5);
    expect(confidence).toBeLessThanOrEqual(1);
  });

  it('should calculate confidence scores with proper scaling', () => {
    const scores = calculateConfidenceScores(mockSignals);

    expect(scores.buy).toBeGreaterThanOrEqual(0);
    expect(scores.buy).toBeLessThanOrEqual(1);
    expect(scores.sell).toBeGreaterThanOrEqual(0);
    expect(scores.sell).toBeLessThanOrEqual(1);
    expect(scores.hold).toBeGreaterThanOrEqual(0);
    expect(scores.hold).toBeLessThanOrEqual(1);
    expect(scores.timestamp).toBeInstanceOf(Date);
  });

  it('should have buy > sell for bullish signals', () => {
    const scores = calculateConfidenceScores(mockSignals);
    expect(scores.buy).toBeGreaterThan(scores.sell);
  });
});
