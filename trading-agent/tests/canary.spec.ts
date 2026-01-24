import { describe, it, expect } from 'vitest';
import {
  CanaryComparator,
  createSnapshot,
  type EnvironmentSnapshot,
  type PositionState,
  type ComparisonResult,
} from '../src/obs/canary';

describe('Canary Comparator', () => {
  describe('Snapshot Creation', () => {
    it('creates snapshot with correct portfolio value', () => {
      const positions: PositionState[] = [
        {
          symbol: 'AAPL',
          qty: 100,
          avgPrice: 150,
          currentPrice: 160,
          marketValue: 16000,
          unrealizedPnL: 1000,
        },
        {
          symbol: 'GOOGL',
          qty: 50,
          avgPrice: 2800,
          currentPrice: 2900,
          marketValue: 145000,
          unrealizedPnL: 5000,
        },
      ];

      const snapshot = createSnapshot('live', positions, 10000, 500);

      expect(snapshot.env).toBe('live');
      expect(snapshot.cash).toBe(10000);
      expect(snapshot.portfolioValue).toBe(171000); // 10k + 16k + 145k
      expect(snapshot.realizedPnL).toBe(500);
      expect(snapshot.unrealizedPnL).toBe(6000); // 1k + 5k
      expect(snapshot.positions.size).toBe(2);
    });

    it('creates snapshot with no positions', () => {
      const snapshot = createSnapshot('paper', [], 50000, 0);

      expect(snapshot.env).toBe('paper');
      expect(snapshot.cash).toBe(50000);
      expect(snapshot.portfolioValue).toBe(50000);
      expect(snapshot.realizedPnL).toBe(0);
      expect(snapshot.unrealizedPnL).toBe(0);
      expect(snapshot.positions.size).toBe(0);
    });
  });

  describe('Perfect Alignment', () => {
    it('shows no divergence when environments are identical', () => {
      const positions: PositionState[] = [
        {
          symbol: 'AAPL',
          qty: 100,
          avgPrice: 150,
          currentPrice: 160,
          marketValue: 16000,
          unrealizedPnL: 1000,
        },
      ];

      const live = createSnapshot('live', positions, 10000, 500);
      const paper = createSnapshot('paper', positions, 10000, 500);

      const comparator = new CanaryComparator();
      const result = comparator.compare(live, paper);

      expect(result.divergence.portfolioValueDiff).toBe(0);
      expect(result.divergence.portfolioValueDiffPct).toBe(0);
      expect(result.divergence.pnlDiff).toBe(0);
      expect(result.divergence.positionCountDiff).toBe(0);
      expect(result.alerts.length).toBe(0);
    });
  });

  describe('Portfolio Value Divergence', () => {
    it('detects portfolio value divergence', () => {
      const livePositions: PositionState[] = [
        {
          symbol: 'AAPL',
          qty: 100,
          avgPrice: 150,
          currentPrice: 160,
          marketValue: 16000,
          unrealizedPnL: 1000,
        },
      ];

      const paperPositions: PositionState[] = [
        {
          symbol: 'AAPL',
          qty: 100,
          avgPrice: 150,
          currentPrice: 158, // Slightly different price
          marketValue: 15800,
          unrealizedPnL: 800,
        },
      ];

      const live = createSnapshot('live', livePositions, 10000, 0);
      const paper = createSnapshot('paper', paperPositions, 10000, 0);

      const comparator = new CanaryComparator();
      const result = comparator.compare(live, paper);

      expect(result.divergence.portfolioValueDiff).toBe(200);
      expect(result.divergence.portfolioValueDiffPct).toBeCloseTo(0.77, 1);
    });

    it('generates critical alert when divergence exceeds threshold', () => {
      const livePositions: PositionState[] = [
        {
          symbol: 'AAPL',
          qty: 100,
          avgPrice: 150,
          currentPrice: 160,
          marketValue: 16000,
          unrealizedPnL: 1000,
        },
      ];

      const paperPositions: PositionState[] = [
        {
          symbol: 'AAPL',
          qty: 100,
          avgPrice: 150,
          currentPrice: 150, // Much larger divergence
          marketValue: 15000,
          unrealizedPnL: 0,
        },
      ];

      const live = createSnapshot('live', livePositions, 5000, 0);
      const paper = createSnapshot('paper', paperPositions, 5000, 0);

      const comparator = new CanaryComparator({ portfolioValueThresholdPct: 2.0 });
      const result = comparator.compare(live, paper);

      const criticalAlerts = result.alerts.filter((a) => a.severity === 'critical');
      expect(criticalAlerts.length).toBeGreaterThan(0);
      expect(criticalAlerts[0].metric).toBe('portfolio_value_diff_pct');
    });
  });

  describe('P&L Divergence', () => {
    it('detects P&L divergence', () => {
      const livePositions: PositionState[] = [
        {
          symbol: 'AAPL',
          qty: 100,
          avgPrice: 150,
          currentPrice: 160,
          marketValue: 16000,
          unrealizedPnL: 1000,
        },
      ];

      const paperPositions: PositionState[] = [
        {
          symbol: 'AAPL',
          qty: 100,
          avgPrice: 150,
          currentPrice: 160,
          marketValue: 16000,
          unrealizedPnL: 800, // Different unrealized P&L
        },
      ];

      const live = createSnapshot('live', livePositions, 10000, 500);
      const paper = createSnapshot('paper', paperPositions, 10000, 300);

      const comparator = new CanaryComparator();
      const result = comparator.compare(live, paper);

      // (1000 + 500) - (800 + 300) = 400
      expect(result.divergence.pnlDiff).toBe(400);
    });

    it('generates appropriate severity alerts for P&L divergence', () => {
      const live = createSnapshot('live', [], 10000, 1500);
      const paper = createSnapshot('paper', [], 10000, 0);

      const comparator = new CanaryComparator();
      const result = comparator.compare(live, paper);

      expect(result.divergence.pnlDiff).toBe(1500);

      const criticalAlerts = result.alerts.filter((a) => a.severity === 'critical');
      expect(criticalAlerts.length).toBeGreaterThan(0);
    });
  });

  describe('Position Divergence', () => {
    it('detects missing position in live', () => {
      const livePositions: PositionState[] = [];

      const paperPositions: PositionState[] = [
        {
          symbol: 'AAPL',
          qty: 100,
          avgPrice: 150,
          currentPrice: 160,
          marketValue: 16000,
          unrealizedPnL: 1000,
        },
      ];

      const live = createSnapshot('live', livePositions, 10000, 0);
      const paper = createSnapshot('paper', paperPositions, 10000, 0);

      const comparator = new CanaryComparator();
      const result = comparator.compare(live, paper);

      expect(result.divergence.positionCountDiff).toBe(1);
      expect(result.divergence.positionDivergences[0].divergenceType).toBe('missing_live');
      expect(result.divergence.positionDivergences[0].symbol).toBe('AAPL');
    });

    it('detects missing position in paper', () => {
      const livePositions: PositionState[] = [
        {
          symbol: 'GOOGL',
          qty: 50,
          avgPrice: 2800,
          currentPrice: 2900,
          marketValue: 145000,
          unrealizedPnL: 5000,
        },
      ];

      const paperPositions: PositionState[] = [];

      const live = createSnapshot('live', livePositions, 10000, 0);
      const paper = createSnapshot('paper', paperPositions, 10000, 0);

      const comparator = new CanaryComparator();
      const result = comparator.compare(live, paper);

      expect(result.divergence.positionCountDiff).toBe(1);
      expect(result.divergence.positionDivergences[0].divergenceType).toBe('missing_paper');
      expect(result.divergence.positionDivergences[0].symbol).toBe('GOOGL');
    });

    it('detects quantity mismatch', () => {
      const livePositions: PositionState[] = [
        {
          symbol: 'AAPL',
          qty: 100,
          avgPrice: 150,
          currentPrice: 160,
          marketValue: 16000,
          unrealizedPnL: 1000,
        },
      ];

      const paperPositions: PositionState[] = [
        {
          symbol: 'AAPL',
          qty: 80, // 20% different
          avgPrice: 150,
          currentPrice: 160,
          marketValue: 12800,
          unrealizedPnL: 800,
        },
      ];

      const live = createSnapshot('live', livePositions, 10000, 0);
      const paper = createSnapshot('paper', paperPositions, 10000, 0);

      const comparator = new CanaryComparator({ positionQtyThresholdPct: 10.0 });
      const result = comparator.compare(live, paper);

      expect(result.divergence.positionCountDiff).toBe(1);
      expect(result.divergence.positionDivergences[0].divergenceType).toBe('qty_mismatch');
      expect(result.divergence.positionDivergences[0].qtyDiff).toBe(20);
    });

    it('ignores small quantity differences below threshold', () => {
      const livePositions: PositionState[] = [
        {
          symbol: 'AAPL',
          qty: 100,
          avgPrice: 150,
          currentPrice: 160,
          marketValue: 16000,
          unrealizedPnL: 1000,
        },
      ];

      const paperPositions: PositionState[] = [
        {
          symbol: 'AAPL',
          qty: 98, // 2% different (below 10% threshold)
          avgPrice: 150,
          currentPrice: 160,
          marketValue: 15680,
          unrealizedPnL: 980,
        },
      ];

      const live = createSnapshot('live', livePositions, 10000, 0);
      const paper = createSnapshot('paper', paperPositions, 10000, 0);

      const comparator = new CanaryComparator({ positionQtyThresholdPct: 10.0 });
      const result = comparator.compare(live, paper);

      expect(result.divergence.positionCountDiff).toBe(0);
    });

    it('generates warning when too many positions diverge', () => {
      const livePositions: PositionState[] = [
        {
          symbol: 'AAPL',
          qty: 100,
          avgPrice: 150,
          currentPrice: 160,
          marketValue: 16000,
          unrealizedPnL: 1000,
        },
        {
          symbol: 'GOOGL',
          qty: 50,
          avgPrice: 2800,
          currentPrice: 2900,
          marketValue: 145000,
          unrealizedPnL: 5000,
        },
        {
          symbol: 'MSFT',
          qty: 200,
          avgPrice: 300,
          currentPrice: 320,
          marketValue: 64000,
          unrealizedPnL: 4000,
        },
        {
          symbol: 'TSLA',
          qty: 75,
          avgPrice: 200,
          currentPrice: 210,
          marketValue: 15750,
          unrealizedPnL: 750,
        },
      ];

      const paperPositions: PositionState[] = [];

      const live = createSnapshot('live', livePositions, 10000, 0);
      const paper = createSnapshot('paper', paperPositions, 10000, 0);

      const comparator = new CanaryComparator({ maxPositionDivergences: 3 });
      const result = comparator.compare(live, paper);

      const warningAlerts = result.alerts.filter(
        (a) => a.severity === 'warning' && a.metric === 'position_count_diff'
      );
      expect(warningAlerts.length).toBeGreaterThan(0);
    });
  });

  describe('Time Series Analysis', () => {
    it('calculates statistics across multiple comparisons', () => {
      const comparator = new CanaryComparator();
      const results: ComparisonResult[] = [];

      // Generate 10 comparison results with varying divergence
      for (let i = 0; i < 10; i++) {
        const livePositions: PositionState[] = [
          {
            symbol: 'AAPL',
            qty: 100,
            avgPrice: 150,
            currentPrice: 160 + i,
            marketValue: (160 + i) * 100,
            unrealizedPnL: (160 + i - 150) * 100,
          },
        ];

        const paperPositions: PositionState[] = [
          {
            symbol: 'AAPL',
            qty: 100,
            avgPrice: 150,
            currentPrice: 160,
            marketValue: 16000,
            unrealizedPnL: 1000,
          },
        ];

        const live = createSnapshot('live', livePositions, 10000, 0);
        const paper = createSnapshot('paper', paperPositions, 10000, 0);

        results.push(comparator.compare(live, paper));
      }

      const analysis = comparator.compareTimeSeries(results);

      expect(analysis.dataPoints).toBe(10);
      expect(analysis.portfolioValueDivergence.mean).toBeGreaterThan(0);
      expect(analysis.portfolioValueDivergence.max).toBeGreaterThan(analysis.portfolioValueDivergence.min);
      expect(analysis.pnlDivergence.mean).toBeGreaterThan(0);
      expect(analysis.alertCount).toBeGreaterThan(0);
    });

    it('tracks critical alerts over time', () => {
      const comparator = new CanaryComparator({ portfolioValueThresholdPct: 1.0 });
      const results: ComparisonResult[] = [];

      for (let i = 0; i < 5; i++) {
        const livePositions: PositionState[] = [
          {
            symbol: 'AAPL',
            qty: 100,
            avgPrice: 150,
            currentPrice: 160 + i * 2,
            marketValue: (160 + i * 2) * 100,
            unrealizedPnL: (160 + i * 2 - 150) * 100,
          },
        ];

        const paperPositions: PositionState[] = [
          {
            symbol: 'AAPL',
            qty: 100,
            avgPrice: 150,
            currentPrice: 160,
            marketValue: 16000,
            unrealizedPnL: 1000,
          },
        ];

        const live = createSnapshot('live', livePositions, 10000, 0);
        const paper = createSnapshot('paper', paperPositions, 10000, 0);

        results.push(comparator.compare(live, paper));
      }

      const analysis = comparator.compareTimeSeries(results);

      expect(analysis.criticalAlertCount).toBeGreaterThan(0);
    });
  });

  describe('Alert Severity', () => {
    it('generates info alerts for small divergences', () => {
      const livePositions: PositionState[] = [
        {
          symbol: 'AAPL',
          qty: 100,
          avgPrice: 150,
          currentPrice: 160,
          marketValue: 16000,
          unrealizedPnL: 1000,
        },
      ];

      const paperPositions: PositionState[] = [
        {
          symbol: 'AAPL',
          qty: 80, // Position divergence
          avgPrice: 150,
          currentPrice: 160,
          marketValue: 12800,
          unrealizedPnL: 800,
        },
      ];

      const live = createSnapshot('live', livePositions, 10000, 50);
      const paper = createSnapshot('paper', paperPositions, 10000, 0);

      const comparator = new CanaryComparator();
      const result = comparator.compare(live, paper);

      const infoAlerts = result.alerts.filter((a) => a.severity === 'info');
      expect(infoAlerts.length).toBeGreaterThan(0);
    });
  });

  describe('Custom Thresholds', () => {
    it('respects custom portfolio value threshold', () => {
      const livePositions: PositionState[] = [
        {
          symbol: 'AAPL',
          qty: 100,
          avgPrice: 150,
          currentPrice: 160,
          marketValue: 16000,
          unrealizedPnL: 1000,
        },
      ];

      const paperPositions: PositionState[] = [
        {
          symbol: 'AAPL',
          qty: 100,
          avgPrice: 150,
          currentPrice: 158,
          marketValue: 15800,
          unrealizedPnL: 800,
        },
      ];

      const live = createSnapshot('live', livePositions, 10000, 0);
      const paper = createSnapshot('paper', paperPositions, 10000, 0);

      // Strict threshold (0.5%)
      const strictComparator = new CanaryComparator({ portfolioValueThresholdPct: 0.5 });
      const strictResult = strictComparator.compare(live, paper);

      // Loose threshold (5%)
      const looseComparator = new CanaryComparator({ portfolioValueThresholdPct: 5.0 });
      const looseResult = looseComparator.compare(live, paper);

      const strictCritical = strictResult.alerts.filter(
        (a) => a.severity === 'critical' && a.metric === 'portfolio_value_diff_pct'
      );
      const looseCritical = looseResult.alerts.filter(
        (a) => a.severity === 'critical' && a.metric === 'portfolio_value_diff_pct'
      );

      expect(strictCritical.length).toBeGreaterThan(0);
      expect(looseCritical.length).toBe(0);
    });
  });
});
