import { describe, it, expect, beforeEach } from 'vitest';
import {
  MultiTimeframeMomentumAnalyzer,
  type Bar,
  type Timeframe,
  type MultiTimeframeMomentumConfig,
} from '../src/strategy/multiTimeframeMomentum';

describe('Multi-Timeframe Momentum Analyzer', () => {
  let analyzer: MultiTimeframeMomentumAnalyzer;

  beforeEach(() => {
    analyzer = new MultiTimeframeMomentumAnalyzer();
  });

  describe('Momentum Calculation', () => {
    it('calculates bullish momentum correctly', () => {
      const bars = createTrendingBars(100, 110, 20); // Price rises from 100 to 110
      const barsByTimeframe = new Map<Timeframe, Bar[]>([['1m', bars]]);

      const result = analyzer.analyze(barsByTimeframe);

      expect(result.signals.length).toBe(1);
      expect(result.signals[0].direction).toBe('bullish');
      expect(result.signals[0].momentum).toBeGreaterThan(0);
    });

    it('calculates bearish momentum correctly', () => {
      const bars = createTrendingBars(110, 100, 20); // Price falls from 110 to 100
      const barsByTimeframe = new Map<Timeframe, Bar[]>([['1m', bars]]);

      const result = analyzer.analyze(barsByTimeframe);

      expect(result.signals.length).toBe(1);
      expect(result.signals[0].direction).toBe('bearish');
      expect(result.signals[0].momentum).toBeLessThan(0);
    });

    it('identifies neutral momentum for sideways market', () => {
      const bars = createSidewaysBars(100, 20);
      const barsByTimeframe = new Map<Timeframe, Bar[]>([['1m', bars]]);

      const result = analyzer.analyze(barsByTimeframe);

      expect(result.signals[0].direction).toBe('neutral');
      expect(Math.abs(result.signals[0].momentum)).toBeLessThan(1);
    });

    it('calculates strength based on momentum magnitude', () => {
      const strongBars = createTrendingBars(100, 120, 20); // 20% increase
      const weakBars = createTrendingBars(100, 102, 20); // 2% increase

      const strongResult = analyzer.analyze(
        new Map<Timeframe, Bar[]>([['1m', strongBars]])
      );
      const weakResult = analyzer.analyze(new Map<Timeframe, Bar[]>([['1m', weakBars]]));

      expect(strongResult.signals[0].strength).toBeGreaterThan(
        weakResult.signals[0].strength
      );
    });
  });

  describe('Multi-Timeframe Analysis', () => {
    it('analyzes multiple timeframes', () => {
      const bars1m = createTrendingBars(100, 105, 20);
      const bars5m = createTrendingBars(100, 108, 20);
      const bars15m = createTrendingBars(100, 110, 20);

      const barsByTimeframe = new Map<Timeframe, Bar[]>([
        ['1m', bars1m],
        ['5m', bars5m],
        ['15m', bars15m],
      ]);

      const result = analyzer.analyze(barsByTimeframe);

      expect(result.signals.length).toBe(3);
      expect(result.signals.every((s) => s.direction === 'bullish')).toBe(true);
    });

    it('handles missing timeframe data gracefully', () => {
      const bars1m = createTrendingBars(100, 105, 20);

      const barsByTimeframe = new Map<Timeframe, Bar[]>([
        ['1m', bars1m],
        ['5m', []], // Empty data
      ]);

      const result = analyzer.analyze(barsByTimeframe);

      expect(result.signals.length).toBe(1);
      expect(result.signals[0].timeframe).toBe('1m');
    });

    it('skips timeframes with insufficient data', () => {
      const bars1m = createTrendingBars(100, 105, 20);
      const bars5m = createTrendingBars(100, 105, 5); // Only 5 bars (need 14)

      const barsByTimeframe = new Map<Timeframe, Bar[]>([
        ['1m', bars1m],
        ['5m', bars5m],
      ]);

      const result = analyzer.analyze(barsByTimeframe);

      expect(result.signals.length).toBe(1);
      expect(result.signals[0].timeframe).toBe('1m');
    });
  });

  describe('Trend Alignment', () => {
    it('detects strong bullish alignment', () => {
      const bars1m = createTrendingBars(100, 108, 20);
      const bars5m = createTrendingBars(100, 110, 20);
      const bars15m = createTrendingBars(100, 112, 20);
      const bars1h = createTrendingBars(100, 115, 20);

      const barsByTimeframe = new Map<Timeframe, Bar[]>([
        ['1m', bars1m],
        ['5m', bars5m],
        ['15m', bars15m],
        ['1h', bars1h],
      ]);

      const result = analyzer.analyze(barsByTimeframe);

      expect(result.alignment).toBe('strong_bullish');
      expect(result.alignmentScore).toBeGreaterThan(50);
    });

    it('detects strong bearish alignment', () => {
      const bars1m = createTrendingBars(100, 92, 20);
      const bars5m = createTrendingBars(100, 90, 20);
      const bars15m = createTrendingBars(100, 88, 20);
      const bars1h = createTrendingBars(100, 85, 20);

      const barsByTimeframe = new Map<Timeframe, Bar[]>([
        ['1m', bars1m],
        ['5m', bars5m],
        ['15m', bars15m],
        ['1h', bars1h],
      ]);

      const result = analyzer.analyze(barsByTimeframe);

      expect(result.alignment).toBe('strong_bearish');
      expect(result.alignmentScore).toBeLessThan(-50);
    });

    it('detects weak bullish alignment', () => {
      const bars1m = createTrendingBars(100, 105, 20);
      const bars5m = createTrendingBars(100, 106, 20);
      const bars15m = createSidewaysBars(100, 20);

      const barsByTimeframe = new Map<Timeframe, Bar[]>([
        ['1m', bars1m],
        ['5m', bars5m],
        ['15m', bars15m],
      ]);

      const result = analyzer.analyze(barsByTimeframe);

      expect(result.alignment).toBe('bullish');
    });

    it('detects neutral alignment with mixed signals', () => {
      const bars1m = createTrendingBars(100, 105, 20); // Bullish
      const bars5m = createTrendingBars(100, 95, 20); // Bearish

      const barsByTimeframe = new Map<Timeframe, Bar[]>([
        ['1m', bars1m],
        ['5m', bars5m],
      ]);

      const result = analyzer.analyze(barsByTimeframe);

      expect(result.alignment).toBe('neutral');
    });
  });

  describe('Divergence Detection', () => {
    it('detects divergence between short and long term', () => {
      const bars1m = createTrendingBars(100, 120, 20); // 20% bullish
      const bars1h = createTrendingBars(100, 85, 20); // 15% bearish

      const barsByTimeframe = new Map<Timeframe, Bar[]>([
        ['1m', bars1m],
        ['1h', bars1h],
      ]);

      const result = analyzer.analyze(barsByTimeframe);

      expect(result.divergence).toBe(true);
    });

    it('does not flag divergence when trends align', () => {
      const bars1m = createTrendingBars(100, 105, 20);
      const bars1h = createTrendingBars(100, 108, 20);

      const barsByTimeframe = new Map<Timeframe, Bar[]>([
        ['1m', bars1m],
        ['1h', bars1h],
      ]);

      const result = analyzer.analyze(barsByTimeframe);

      expect(result.divergence).toBe(false);
    });

    it('requires significant momentum spread for divergence', () => {
      const bars1m = createTrendingBars(100, 105, 20); // Weak bullish (+5%)
      const bars1h = createTrendingBars(100, 97, 20); // Weak bearish (-3%)

      const barsByTimeframe = new Map<Timeframe, Bar[]>([
        ['1m', bars1m],
        ['1h', bars1h],
      ]);

      const result = analyzer.analyze(barsByTimeframe);

      // Spread too small (only 8 percentage points) to flag divergence
      expect(result.divergence).toBe(false);
    });
  });

  describe('Confidence Calculation', () => {
    it('assigns high confidence to strong alignment', () => {
      const bars1m = createTrendingBars(100, 110, 20);
      const bars5m = createTrendingBars(100, 112, 20);
      const bars15m = createTrendingBars(100, 115, 20);
      const bars1h = createTrendingBars(100, 118, 20);

      const barsByTimeframe = new Map<Timeframe, Bar[]>([
        ['1m', bars1m],
        ['5m', bars5m],
        ['15m', bars15m],
        ['1h', bars1h],
      ]);

      const result = analyzer.analyze(barsByTimeframe);

      expect(result.confidence).toBeGreaterThan(70);
    });

    it('assigns low confidence to divergent signals', () => {
      const bars1m = createTrendingBars(100, 120, 20);
      const bars1h = createTrendingBars(100, 85, 20);

      const barsByTimeframe = new Map<Timeframe, Bar[]>([
        ['1m', bars1m],
        ['1h', bars1h],
      ]);

      const result = analyzer.analyze(barsByTimeframe);

      expect(result.confidence).toBeLessThan(70);
    });

    it('assigns medium confidence to neutral alignment', () => {
      const bars1m = createSidewaysBars(100, 20);
      const bars5m = createSidewaysBars(100, 20);

      const barsByTimeframe = new Map<Timeframe, Bar[]>([
        ['1m', bars1m],
        ['5m', bars5m],
      ]);

      const result = analyzer.analyze(barsByTimeframe);

      expect(result.confidence).toBeGreaterThan(30);
      expect(result.confidence).toBeLessThan(70);
    });
  });

  describe('Bar Aggregation', () => {
    it('aggregates 1m bars to 5m bars', () => {
      const bars1m = createBarsWithTimestamps(100, 10, 60 * 1000); // 10 1-minute bars

      const bars5m = analyzer.aggregateBars(bars1m, '5m');

      expect(bars5m.length).toBe(2); // 10 minutes = 2 5-minute bars
    });

    it('combines OHLCV data correctly', () => {
      const bars1m: Bar[] = [
        { timestamp: 0, open: 100, high: 105, low: 99, close: 103, volume: 1000 },
        { timestamp: 60000, open: 103, high: 108, low: 102, close: 107, volume: 1500 },
        {
          timestamp: 120000,
          open: 107,
          high: 110,
          low: 106,
          close: 109,
          volume: 2000,
        },
      ];

      const bars5m = analyzer.aggregateBars(bars1m, '5m');

      expect(bars5m.length).toBe(1);
      expect(bars5m[0].open).toBe(100); // First open
      expect(bars5m[0].close).toBe(109); // Last close
      expect(bars5m[0].high).toBe(110); // Highest high
      expect(bars5m[0].low).toBe(99); // Lowest low
      expect(bars5m[0].volume).toBe(4500); // Sum of volumes
    });

    it('handles empty bar array', () => {
      const bars5m = analyzer.aggregateBars([], '5m');
      expect(bars5m.length).toBe(0);
    });

    it('preserves single bar', () => {
      const bars1m: Bar[] = [
        { timestamp: 0, open: 100, high: 105, low: 99, close: 103, volume: 1000 },
      ];

      const bars5m = analyzer.aggregateBars(bars1m, '5m');

      expect(bars5m.length).toBe(1);
      expect(bars5m[0]).toEqual(bars1m[0]);
    });
  });

  describe('Trade Signal Generation', () => {
    it('generates buy signal for strong bullish alignment', () => {
      const bars1m = createTrendingBars(100, 110, 20);
      const bars5m = createTrendingBars(100, 112, 20);
      const bars15m = createTrendingBars(100, 115, 20);
      const bars1h = createTrendingBars(100, 118, 20);

      const barsByTimeframe = new Map<Timeframe, Bar[]>([
        ['1m', bars1m],
        ['5m', bars5m],
        ['15m', bars15m],
        ['1h', bars1h],
      ]);

      const momentum = analyzer.analyze(barsByTimeframe);
      const signal = analyzer.getTradeSignal(momentum);

      expect(signal.action).toBe('buy');
      expect(signal.confidence).toBeGreaterThan(70);
      expect(signal.reason).toContain('bullish');
    });

    it('generates sell signal for strong bearish alignment', () => {
      const bars1m = createTrendingBars(100, 90, 20);
      const bars5m = createTrendingBars(100, 88, 20);
      const bars15m = createTrendingBars(100, 85, 20);
      const bars1h = createTrendingBars(100, 82, 20);

      const barsByTimeframe = new Map<Timeframe, Bar[]>([
        ['1m', bars1m],
        ['5m', bars5m],
        ['15m', bars15m],
        ['1h', bars1h],
      ]);

      const momentum = analyzer.analyze(barsByTimeframe);
      const signal = analyzer.getTradeSignal(momentum);

      expect(signal.action).toBe('sell');
      expect(signal.confidence).toBeGreaterThan(70);
      expect(signal.reason).toContain('bearish');
    });

    it('generates hold signal for divergence', () => {
      const bars1m = createTrendingBars(100, 120, 20);
      const bars1h = createTrendingBars(100, 85, 20);

      const barsByTimeframe = new Map<Timeframe, Bar[]>([
        ['1m', bars1m],
        ['1h', bars1h],
      ]);

      const momentum = analyzer.analyze(barsByTimeframe);
      const signal = analyzer.getTradeSignal(momentum);

      expect(signal.action).toBe('hold');
      expect(signal.reason).toContain('Divergence');
    });

    it('generates hold signal for weak alignment', () => {
      const bars1m = createTrendingBars(100, 102, 20);
      const bars5m = createSidewaysBars(100, 20);

      const barsByTimeframe = new Map<Timeframe, Bar[]>([
        ['1m', bars1m],
        ['5m', bars5m],
      ]);

      const momentum = analyzer.analyze(barsByTimeframe);
      const signal = analyzer.getTradeSignal(momentum);

      expect(signal.action).toBe('hold');
    });

    it('generates hold signal for neutral market', () => {
      const bars1m = createSidewaysBars(100, 20);
      const bars5m = createSidewaysBars(100, 20);

      const barsByTimeframe = new Map<Timeframe, Bar[]>([
        ['1m', bars1m],
        ['5m', bars5m],
      ]);

      const momentum = analyzer.analyze(barsByTimeframe);
      const signal = analyzer.getTradeSignal(momentum);

      expect(signal.action).toBe('hold');
    });
  });

  describe('Custom Configuration', () => {
    it('accepts custom momentum period', () => {
      const customAnalyzer = new MultiTimeframeMomentumAnalyzer({
        momentumPeriod: 20,
      });

      const bars = createTrendingBars(100, 110, 25);
      const barsByTimeframe = new Map<Timeframe, Bar[]>([['1m', bars]]);

      const result = customAnalyzer.analyze(barsByTimeframe);

      expect(result.signals.length).toBe(1);
    });

    it('accepts custom timeframes', () => {
      const customAnalyzer = new MultiTimeframeMomentumAnalyzer({
        timeframes: ['5m', '1h'],
      });

      const bars5m = createTrendingBars(100, 105, 20);
      const bars1h = createTrendingBars(100, 108, 20);

      const barsByTimeframe = new Map<Timeframe, Bar[]>([
        ['5m', bars5m],
        ['1h', bars1h],
      ]);

      const result = customAnalyzer.analyze(barsByTimeframe);

      expect(result.signals.length).toBe(2);
      expect(result.signals[0].timeframe).toBe('5m');
      expect(result.signals[1].timeframe).toBe('1h');
    });

    it('accepts custom alignment threshold', () => {
      const customAnalyzer = new MultiTimeframeMomentumAnalyzer({
        strongAlignmentThreshold: 1.0, // Require 100% agreement
      });

      const bars1m = createTrendingBars(100, 105, 20);
      const bars5m = createTrendingBars(100, 106, 20);
      const bars15m = createSidewaysBars(100, 20); // One neutral

      const barsByTimeframe = new Map<Timeframe, Bar[]>([
        ['1m', bars1m],
        ['5m', bars5m],
        ['15m', bars15m],
      ]);

      const result = customAnalyzer.analyze(barsByTimeframe);

      // Should not be strong alignment with 100% threshold
      expect(result.alignment).not.toBe('strong_bullish');
    });
  });
});

// Helper functions to create test data
function createTrendingBars(startPrice: number, endPrice: number, count: number): Bar[] {
  const bars: Bar[] = [];
  const priceStep = (endPrice - startPrice) / (count - 1);

  for (let i = 0; i < count; i++) {
    const price = startPrice + priceStep * i;
    bars.push({
      timestamp: i * 60000, // 1 minute intervals
      open: i === 0 ? startPrice : bars[i - 1].close,
      high: price + 0.5,
      low: price - 0.5,
      close: price,
      volume: 1000 + Math.random() * 500,
    });
  }

  return bars;
}

function createSidewaysBars(price: number, count: number): Bar[] {
  const bars: Bar[] = [];

  for (let i = 0; i < count; i++) {
    const noise = (Math.random() - 0.5) * 0.5; // Small random variation
    bars.push({
      timestamp: i * 60000,
      open: price + noise,
      high: price + 0.3,
      low: price - 0.3,
      close: price + noise,
      volume: 1000 + Math.random() * 500,
    });
  }

  return bars;
}

function createBarsWithTimestamps(
  startPrice: number,
  count: number,
  interval: number
): Bar[] {
  const bars: Bar[] = [];

  for (let i = 0; i < count; i++) {
    const price = startPrice + i;
    bars.push({
      timestamp: i * interval,
      open: price,
      high: price + 1,
      low: price - 1,
      close: price + 0.5,
      volume: 1000,
    });
  }

  return bars;
}
