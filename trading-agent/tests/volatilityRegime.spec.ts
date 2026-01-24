import { describe, it, expect, beforeEach } from 'vitest';
import {
  VolatilityRegimeDetector,
  type Bar,
  type VolatilityRegimeConfig,
} from '../src/strategy/volatilityRegime';

describe('Volatility Regime Detector', () => {
  let detector: VolatilityRegimeDetector;

  beforeEach(() => {
    detector = new VolatilityRegimeDetector();
  });

  describe('ATR Calculation', () => {
    it('calculates ATR correctly', () => {
      const bars = createBarsWithVolatility(100, 50, 1.0); // Normal volatility

      const analysis = detector.analyze(bars);

      expect(analysis.metrics.atr).toBeGreaterThan(0);
      expect(analysis.metrics.atrPercent).toBeGreaterThan(0);
    });

    it('detects higher ATR in volatile markets', () => {
      const lowVolBars = createBarsWithVolatility(100, 50, 0.5);
      const highVolBars = createBarsWithVolatility(100, 50, 2.0);

      detector.reset();
      const lowVolAnalysis = detector.analyze(lowVolBars);

      detector.reset();
      const highVolAnalysis = detector.analyze(highVolBars);

      expect(highVolAnalysis.metrics.atr).toBeGreaterThan(lowVolAnalysis.metrics.atr);
    });

    it('expresses ATR as percentage of price', () => {
      const bars = createBarsWithVolatility(100, 50, 1.0);

      const analysis = detector.analyze(bars);

      expect(analysis.metrics.atrPercent).toBeGreaterThan(0);
      expect(analysis.metrics.atrPercent).toBeLessThan(20); // Reasonable range
    });
  });

  describe('Historical Volatility', () => {
    it('calculates annualized historical volatility', () => {
      const bars = createBarsWithVolatility(100, 50, 1.0);

      const analysis = detector.analyze(bars);

      expect(analysis.metrics.historicalVolatility).toBeGreaterThan(0);
      expect(analysis.metrics.historicalVolatility).toBeLessThan(200); // Reasonable max
    });

    it('detects higher HV in volatile markets', () => {
      const lowVolBars = createBarsWithVolatility(100, 50, 0.5);
      const highVolBars = createBarsWithVolatility(100, 50, 2.5);

      detector.reset();
      const lowVolAnalysis = detector.analyze(lowVolBars);

      detector.reset();
      const highVolAnalysis = detector.analyze(highVolBars);

      expect(highVolAnalysis.metrics.historicalVolatility).toBeGreaterThan(
        lowVolAnalysis.metrics.historicalVolatility
      );
    });
  });

  describe('Parkinson Volatility', () => {
    it('calculates Parkinson volatility estimator', () => {
      const bars = createBarsWithVolatility(100, 50, 1.0);

      const analysis = detector.analyze(bars);

      expect(analysis.metrics.parkinsonVolatility).toBeGreaterThan(0);
    });

    it('responds to high-low range changes', () => {
      const narrowRangeBars = createBarsWithRange(100, 50, 0.5);
      const wideRangeBars = createBarsWithRange(100, 50, 3.0);

      detector.reset();
      const narrowAnalysis = detector.analyze(narrowRangeBars);

      detector.reset();
      const wideAnalysis = detector.analyze(wideRangeBars);

      expect(wideAnalysis.metrics.parkinsonVolatility).toBeGreaterThan(
        narrowAnalysis.metrics.parkinsonVolatility
      );
    });
  });

  describe('Regime Classification', () => {
    it('classifies low volatility regime', () => {
      // Build history with mix of volatilities, then use low
      detector.reset();
      const mixedBars = createBarsWithVolatility(100, 80, 1.0);
      for (let i = 0; i < mixedBars.length - 15; i++) {
        detector.analyze(mixedBars.slice(0, i + 15));
      }

      // Now test with low volatility
      const lowVolBars = createBarsWithVolatility(100, 30, 0.2);
      const analysis = detector.analyze(lowVolBars);

      expect(analysis.regime).toBe('low');
      expect(analysis.percentile).toBeLessThan(30);
    });

    it('classifies regime based on percentile', () => {
      // Build history with moderate volatility
      detector.reset();
      const bars = createBarsWithVolatility(100, 100, 1.0);

      for (let i = 0; i < bars.length - 15; i++) {
        detector.analyze(bars.slice(0, i + 15));
      }

      const analysis = detector.analyze(bars);

      expect(['low', 'normal', 'high']).toContain(analysis.regime);
      expect(analysis.percentile).toBeGreaterThanOrEqual(0);
      expect(analysis.percentile).toBeLessThanOrEqual(100);
    });

    it('classifies high volatility regime', () => {
      // Build history, then spike volatility
      detector.reset();
      const lowVolBars = createBarsWithVolatility(100, 50, 0.5);
      for (let i = 0; i < lowVolBars.length - 15; i++) {
        detector.analyze(lowVolBars.slice(0, i + 15));
      }

      const highVolBars = createBarsWithVolatility(100, 50, 2.5);
      const analysis = detector.analyze(highVolBars);

      expect(['high', 'extreme']).toContain(analysis.regime);
      expect(analysis.percentile).toBeGreaterThan(75);
    });

    it('classifies extreme volatility regime', () => {
      // Build history, then extreme spike
      detector.reset();
      const normalBars = createBarsWithVolatility(100, 80, 0.5);
      for (let i = 0; i < normalBars.length - 15; i++) {
        detector.analyze(normalBars.slice(0, i + 15));
      }

      const extremeBars = createBarsWithVolatility(100, 30, 5.0);
      const analysis = detector.analyze(extremeBars);

      expect(analysis.regime).toBe('extreme');
    });
  });

  describe('Percentile Calculation', () => {
    it('calculates volatility percentile', () => {
      const bars = createBarsWithVolatility(100, 100, 1.0);

      for (let i = 0; i < bars.length - 15; i++) {
        detector.analyze(bars.slice(0, i + 15));
      }

      const analysis = detector.analyze(bars);

      expect(analysis.percentile).toBeGreaterThanOrEqual(0);
      expect(analysis.percentile).toBeLessThanOrEqual(100);
    });

    it('shows higher percentile for volatile periods', () => {
      detector.reset();

      // Build history with low volatility
      const lowVolBars = createBarsWithVolatility(100, 80, 0.5);
      for (let i = 0; i < lowVolBars.length - 15; i++) {
        detector.analyze(lowVolBars.slice(0, i + 15));
      }

      // Compare low vs high volatility
      const recentLowVol = detector.analyze(lowVolBars);
      const highVolBars = createBarsWithVolatility(100, 30, 2.5);
      const recentHighVol = detector.analyze(highVolBars);

      expect(recentHighVol.percentile).toBeGreaterThan(recentLowVol.percentile);
    });

    it('defaults to 50th percentile with insufficient history', () => {
      detector.reset();
      const bars = createBarsWithVolatility(100, 20, 1.0);

      const analysis = detector.analyze(bars);

      expect(analysis.percentile).toBe(50);
    });
  });

  describe('Regime Transitions', () => {
    it('detects increasing volatility transition', () => {
      detector.reset();

      // Start with low volatility
      const lowVolBars = createBarsWithVolatility(100, 60, 0.5);
      for (let i = 0; i < lowVolBars.length - 15; i++) {
        detector.analyze(lowVolBars.slice(0, i + 15));
      }

      // Gradually increase volatility
      for (let i = 0; i < 10; i++) {
        const increasingBars = createBarsWithVolatility(100, 15, 1.5 + i * 0.3);
        detector.analyze(increasingBars);
      }

      const highVolBars = createBarsWithVolatility(100, 15, 3.0);
      const analysis = detector.analyze(highVolBars);

      expect(analysis.inTransition).toBe(true);
      expect(analysis.transitionDirection).toBe('increasing');
    });

    it('detects decreasing volatility transition', () => {
      detector.reset();

      // Start with high volatility
      const highVolBars = createBarsWithVolatility(100, 60, 2.5);
      for (let i = 0; i < highVolBars.length - 15; i++) {
        detector.analyze(highVolBars.slice(0, i + 15));
      }

      // Gradually decrease volatility
      for (let i = 0; i < 10; i++) {
        const decreasingBars = createBarsWithVolatility(100, 15, 2.5 - i * 0.3);
        detector.analyze(decreasingBars);
      }

      const lowVolBars = createBarsWithVolatility(100, 15, 0.5);
      const analysis = detector.analyze(lowVolBars);

      expect(analysis.inTransition).toBe(true);
      expect(analysis.transitionDirection).toBe('decreasing');
    });

    it('does not flag transition for stable volatility', () => {
      detector.reset();

      // Consistent volatility
      const bars = createBarsWithVolatility(100, 100, 1.0);
      for (let i = 0; i < bars.length - 15; i++) {
        detector.analyze(bars.slice(0, i + 15));
      }

      const analysis = detector.analyze(bars);

      expect(analysis.inTransition).toBe(false);
      expect(analysis.transitionDirection).toBeUndefined();
    });
  });

  describe('Confidence Calculation', () => {
    it('assigns high confidence for clear regimes', () => {
      detector.reset();

      // Build clear low volatility regime
      const lowVolBars = createBarsWithVolatility(100, 100, 0.3);
      for (let i = 0; i < lowVolBars.length - 15; i++) {
        detector.analyze(lowVolBars.slice(0, i + 15));
      }

      const analysis = detector.analyze(lowVolBars);

      expect(analysis.confidence).toBeGreaterThan(70);
    });

    it('reduces confidence during transitions', () => {
      detector.reset();

      // Start stable
      const stableBars = createBarsWithVolatility(100, 80, 1.0);
      for (let i = 0; i < stableBars.length - 15; i++) {
        detector.analyze(stableBars.slice(0, i + 15));
      }

      const stableAnalysis = detector.analyze(stableBars);

      // Create transition
      for (let i = 0; i < 10; i++) {
        const transitionBars = createBarsWithVolatility(100, 15, 1.0 + i * 0.4);
        detector.analyze(transitionBars);
      }

      const highVolBars = createBarsWithVolatility(100, 15, 3.0);
      const transitionAnalysis = detector.analyze(highVolBars);

      if (transitionAnalysis.inTransition) {
        expect(transitionAnalysis.confidence).toBeLessThan(stableAnalysis.confidence);
      }
    });

    it('reduces confidence with insufficient history', () => {
      detector.reset();

      const bars = createBarsWithVolatility(100, 20, 1.0);
      const analysis = detector.analyze(bars);

      expect(analysis.confidence).toBeLessThan(100);
    });
  });

  describe('Position Size Adjustment', () => {
    it('suggests larger positions in low volatility', () => {
      detector.reset();

      const mixedBars = createBarsWithVolatility(100, 80, 1.0);
      for (let i = 0; i < mixedBars.length - 15; i++) {
        detector.analyze(mixedBars.slice(0, i + 15));
      }

      const lowVolBars = createBarsWithVolatility(100, 30, 0.2);
      const analysis = detector.analyze(lowVolBars);

      // Should suggest larger position for low volatility
      expect(analysis.positionSizeMultiplier).toBeGreaterThan(1.0);
    });

    it('suggests appropriate positions based on regime', () => {
      detector.reset();

      const normalBars = createBarsWithVolatility(100, 100, 1.0);
      for (let i = 0; i < normalBars.length - 15; i++) {
        detector.analyze(normalBars.slice(0, i + 15));
      }

      const analysis = detector.analyze(normalBars);

      // Position size should be reasonable (between 0.5 and 1.5)
      expect(analysis.positionSizeMultiplier).toBeGreaterThanOrEqual(0.5);
      expect(analysis.positionSizeMultiplier).toBeLessThanOrEqual(1.5);
    });

    it('suggests smaller positions in high volatility', () => {
      detector.reset();

      const lowVolBars = createBarsWithVolatility(100, 80, 0.5);
      for (let i = 0; i < lowVolBars.length - 15; i++) {
        detector.analyze(lowVolBars.slice(0, i + 15));
      }

      const highVolBars = createBarsWithVolatility(100, 30, 3.0);
      const analysis = detector.analyze(highVolBars);

      expect(analysis.positionSizeMultiplier).toBeLessThan(1.0);
    });

    it('suggests minimal positions in extreme volatility', () => {
      detector.reset();

      const normalBars = createBarsWithVolatility(100, 80, 0.5);
      for (let i = 0; i < normalBars.length - 15; i++) {
        detector.analyze(normalBars.slice(0, i + 15));
      }

      const extremeBars = createBarsWithVolatility(100, 30, 5.0);
      const analysis = detector.analyze(extremeBars);

      expect(analysis.positionSizeMultiplier).toBeLessThanOrEqual(0.5);
    });
  });

  describe('Trading Recommendations', () => {
    it('recommends aggressive trading in low volatility', () => {
      detector.reset();

      const mixedBars = createBarsWithVolatility(100, 80, 1.0);
      for (let i = 0; i < mixedBars.length - 15; i++) {
        detector.analyze(mixedBars.slice(0, i + 15));
      }

      const lowVolBars = createBarsWithVolatility(100, 30, 0.2);
      const analysis = detector.analyze(lowVolBars);
      const recommendations = detector.getRecommendations(analysis);

      expect(recommendations.tradeFrequency).toBe('aggressive');
      expect(recommendations.stopLossMultiplier).toBeLessThan(1.0);
      expect(recommendations.takeProfitMultiplier).toBeGreaterThan(1.0);
    });

    it('provides reasonable recommendations based on regime', () => {
      detector.reset();

      const normalBars = createBarsWithVolatility(100, 100, 1.0);
      for (let i = 0; i < normalBars.length - 15; i++) {
        detector.analyze(normalBars.slice(0, i + 15));
      }

      const analysis = detector.analyze(normalBars);
      const recommendations = detector.getRecommendations(analysis);

      expect(recommendations.tradeFrequency).toBeDefined();
      expect(recommendations.stopLossMultiplier).toBeGreaterThan(0);
      expect(recommendations.takeProfitMultiplier).toBeGreaterThan(0);
      expect(recommendations.recommendations.length).toBeGreaterThan(0);
    });

    it('recommends conservative trading in high volatility', () => {
      detector.reset();

      const lowVolBars = createBarsWithVolatility(100, 80, 0.5);
      for (let i = 0; i < lowVolBars.length - 15; i++) {
        detector.analyze(lowVolBars.slice(0, i + 15));
      }

      const highVolBars = createBarsWithVolatility(100, 30, 3.0);
      const analysis = detector.analyze(highVolBars);
      const recommendations = detector.getRecommendations(analysis);

      expect(recommendations.tradeFrequency).toBe('conservative');
      expect(recommendations.stopLossMultiplier).toBeGreaterThan(1.0);
    });

    it('recommends more conservative trading in extreme volatility', () => {
      detector.reset();

      const normalBars = createBarsWithVolatility(100, 80, 0.5);
      for (let i = 0; i < normalBars.length - 15; i++) {
        detector.analyze(normalBars.slice(0, i + 15));
      }

      const extremeBars = createBarsWithVolatility(100, 30, 5.0);
      const analysis = detector.analyze(extremeBars);
      const recommendations = detector.getRecommendations(analysis);

      expect(['conservative', 'defensive']).toContain(recommendations.tradeFrequency);
      expect(recommendations.recommendations.length).toBeGreaterThan(0);
    });

    it('adjusts recommendations during transitions', () => {
      detector.reset();

      const stableBars = createBarsWithVolatility(100, 80, 1.0);
      for (let i = 0; i < stableBars.length - 15; i++) {
        detector.analyze(stableBars.slice(0, i + 15));
      }

      // Create transition
      for (let i = 0; i < 10; i++) {
        const transitionBars = createBarsWithVolatility(100, 15, 1.0 + i * 0.4);
        detector.analyze(transitionBars);
      }

      const highVolBars = createBarsWithVolatility(100, 15, 3.0);
      const analysis = detector.analyze(highVolBars);
      const recommendations = detector.getRecommendations(analysis);

      if (analysis.inTransition) {
        expect(recommendations.tradeFrequency).toBe('conservative');
      }
    });
  });

  describe('Custom Configuration', () => {
    it('accepts custom ATR period', () => {
      const customDetector = new VolatilityRegimeDetector({
        atrPeriod: 20,
      });

      const bars = createBarsWithVolatility(100, 50, 1.0);
      const analysis = customDetector.analyze(bars);

      expect(analysis.metrics.atr).toBeGreaterThan(0);
    });

    it('accepts custom thresholds', () => {
      const customDetector = new VolatilityRegimeDetector({
        lowThreshold: 20,
        highThreshold: 80,
      });

      const bars = createBarsWithVolatility(100, 100, 1.0);
      for (let i = 0; i < bars.length - 15; i++) {
        customDetector.analyze(bars.slice(0, i + 15));
      }

      const analysis = customDetector.analyze(bars);

      expect(analysis.regime).toBeDefined();
    });

    it('accepts custom transition window', () => {
      const customDetector = new VolatilityRegimeDetector({
        transitionWindow: 3,
      });

      const bars = createBarsWithVolatility(100, 50, 1.0);
      const analysis = customDetector.analyze(bars);

      expect(analysis.inTransition).toBeDefined();
    });
  });

  describe('History Management', () => {
    it('maintains volatility history', () => {
      detector.reset();

      const bars = createBarsWithVolatility(100, 50, 1.0);
      detector.analyze(bars);

      const history = detector.getHistory();

      expect(history.length).toBe(1);
    });

    it('limits history to lookback period', () => {
      detector.reset();

      const bars = createBarsWithVolatility(100, 50, 1.0);
      for (let i = 0; i < 150; i++) {
        detector.analyze(bars);
      }

      const history = detector.getHistory();

      expect(history.length).toBeLessThanOrEqual(100); // Default lookback
    });

    it('resets history', () => {
      const bars = createBarsWithVolatility(100, 50, 1.0);
      detector.analyze(bars);

      detector.reset();

      const history = detector.getHistory();
      expect(history.length).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('throws error with insufficient data', () => {
      detector.reset();

      const bars = createBarsWithVolatility(100, 5, 1.0); // Only 5 bars

      expect(() => detector.analyze(bars)).toThrow('Insufficient data');
    });

    it('handles minimum required bars', () => {
      detector.reset();

      const bars = createBarsWithVolatility(100, 14, 1.0); // Exactly 14 bars

      expect(() => detector.analyze(bars)).not.toThrow();
    });
  });
});

// Helper functions to create test data
function createBarsWithVolatility(
  startPrice: number,
  count: number,
  volatilityMultiplier: number
): Bar[] {
  const bars: Bar[] = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 2 * volatilityMultiplier;
    price += change;

    const high = price + Math.abs(Math.random() * volatilityMultiplier);
    const low = price - Math.abs(Math.random() * volatilityMultiplier);

    bars.push({
      timestamp: i * 60000,
      open: price - change / 2,
      high,
      low,
      close: price,
      volume: 1000 + Math.random() * 500,
    });
  }

  return bars;
}

function createBarsWithRange(
  startPrice: number,
  count: number,
  rangeMultiplier: number
): Bar[] {
  const bars: Bar[] = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const range = rangeMultiplier * (1 + Math.random());

    bars.push({
      timestamp: i * 60000,
      open: price,
      high: price + range,
      low: price - range,
      close: price + (Math.random() - 0.5) * range,
      volume: 1000 + Math.random() * 500,
    });

    price = bars[i].close;
  }

  return bars;
}
