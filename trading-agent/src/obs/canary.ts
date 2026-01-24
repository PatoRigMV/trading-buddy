// Canary comparator: Compare live vs paper trading performance
// Detects divergence between production and shadow deployments

export interface EnvironmentSnapshot {
  env: 'live' | 'paper';
  timestamp: number;
  positions: Map<string, PositionState>;
  cash: number;
  portfolioValue: number;
  realizedPnL: number;
  unrealizedPnL: number;
}

export interface PositionState {
  symbol: string;
  qty: number;
  avgPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnL: number;
}

export interface ComparisonResult {
  timestamp: number;
  live: EnvironmentSnapshot;
  paper: EnvironmentSnapshot;
  divergence: DivergenceMetrics;
  alerts: Alert[];
}

export interface DivergenceMetrics {
  portfolioValueDiff: number; // Absolute difference
  portfolioValueDiffPct: number; // Percentage difference
  pnlDiff: number; // Total P&L difference
  positionCountDiff: number; // Number of positions that differ
  positionDivergences: PositionDivergence[];
}

export interface PositionDivergence {
  symbol: string;
  liveQty: number;
  paperQty: number;
  qtyDiff: number;
  liveValue: number;
  paperValue: number;
  valueDiff: number;
  divergenceType: 'qty_mismatch' | 'price_mismatch' | 'missing_live' | 'missing_paper';
}

export interface Alert {
  severity: 'info' | 'warning' | 'critical';
  message: string;
  metric: string;
  value: number;
  threshold: number;
}

export interface CanaryConfig {
  portfolioValueThresholdPct: number; // Alert if portfolio value differs by more than this %
  pnlThresholdPct: number; // Alert if P&L differs by more than this %
  positionQtyThresholdPct: number; // Alert if position quantity differs by more than this %
  maxPositionDivergences: number; // Alert if more than this many positions diverge
}

const DEFAULT_CONFIG: CanaryConfig = {
  portfolioValueThresholdPct: 2.0, // 2% divergence threshold
  pnlThresholdPct: 5.0, // 5% P&L divergence threshold
  positionQtyThresholdPct: 10.0, // 10% position size divergence threshold
  maxPositionDivergences: 3, // More than 3 divergent positions is concerning
};

export class CanaryComparator {
  private config: CanaryConfig;

  constructor(config: Partial<CanaryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  public compare(live: EnvironmentSnapshot, paper: EnvironmentSnapshot): ComparisonResult {
    const divergence = this.calculateDivergence(live, paper);
    const alerts = this.generateAlerts(divergence);

    return {
      timestamp: Date.now(),
      live,
      paper,
      divergence,
      alerts,
    };
  }

  private calculateDivergence(live: EnvironmentSnapshot, paper: EnvironmentSnapshot): DivergenceMetrics {
    // Portfolio value divergence
    const portfolioValueDiff = live.portfolioValue - paper.portfolioValue;
    const portfolioValueDiffPct =
      paper.portfolioValue > 0 ? (portfolioValueDiff / paper.portfolioValue) * 100 : 0;

    // P&L divergence
    const liveTotalPnL = live.realizedPnL + live.unrealizedPnL;
    const paperTotalPnL = paper.realizedPnL + paper.unrealizedPnL;
    const pnlDiff = liveTotalPnL - paperTotalPnL;

    // Position divergences
    const positionDivergences: PositionDivergence[] = [];
    const allSymbols = new Set([...live.positions.keys(), ...paper.positions.keys()]);

    for (const symbol of allSymbols) {
      const livePos = live.positions.get(symbol);
      const paperPos = paper.positions.get(symbol);

      if (!livePos && paperPos) {
        // Position exists in paper but not live
        positionDivergences.push({
          symbol,
          liveQty: 0,
          paperQty: paperPos.qty,
          qtyDiff: -paperPos.qty,
          liveValue: 0,
          paperValue: paperPos.marketValue,
          valueDiff: -paperPos.marketValue,
          divergenceType: 'missing_live',
        });
      } else if (livePos && !paperPos) {
        // Position exists in live but not paper
        positionDivergences.push({
          symbol,
          liveQty: livePos.qty,
          paperQty: 0,
          qtyDiff: livePos.qty,
          liveValue: livePos.marketValue,
          paperValue: 0,
          valueDiff: livePos.marketValue,
          divergenceType: 'missing_paper',
        });
      } else if (livePos && paperPos) {
        // Position exists in both, check for divergence
        const qtyDiff = livePos.qty - paperPos.qty;
        const valueDiff = livePos.marketValue - paperPos.marketValue;
        const qtyDiffPct = paperPos.qty !== 0 ? Math.abs((qtyDiff / paperPos.qty) * 100) : 0;

        if (qtyDiffPct > this.config.positionQtyThresholdPct) {
          positionDivergences.push({
            symbol,
            liveQty: livePos.qty,
            paperQty: paperPos.qty,
            qtyDiff,
            liveValue: livePos.marketValue,
            paperValue: paperPos.marketValue,
            valueDiff,
            divergenceType: qtyDiff !== 0 ? 'qty_mismatch' : 'price_mismatch',
          });
        }
      }
    }

    return {
      portfolioValueDiff,
      portfolioValueDiffPct,
      pnlDiff,
      positionCountDiff: positionDivergences.length,
      positionDivergences,
    };
  }

  private generateAlerts(divergence: DivergenceMetrics): Alert[] {
    const alerts: Alert[] = [];

    // Portfolio value divergence alert
    if (Math.abs(divergence.portfolioValueDiffPct) > this.config.portfolioValueThresholdPct) {
      alerts.push({
        severity: 'critical',
        message: `Portfolio value divergence exceeds threshold: ${divergence.portfolioValueDiffPct.toFixed(2)}%`,
        metric: 'portfolio_value_diff_pct',
        value: Math.abs(divergence.portfolioValueDiffPct),
        threshold: this.config.portfolioValueThresholdPct,
      });
    }

    // P&L divergence alert
    if (Math.abs(divergence.pnlDiff) > 0) {
      const severity =
        Math.abs(divergence.pnlDiff) > 1000 ? 'critical' : Math.abs(divergence.pnlDiff) > 100 ? 'warning' : 'info';
      alerts.push({
        severity,
        message: `P&L divergence detected: $${divergence.pnlDiff.toFixed(2)}`,
        metric: 'pnl_diff',
        value: Math.abs(divergence.pnlDiff),
        threshold: this.config.pnlThresholdPct,
      });
    }

    // Position count divergence alert
    if (divergence.positionCountDiff > this.config.maxPositionDivergences) {
      alerts.push({
        severity: 'warning',
        message: `${divergence.positionCountDiff} positions diverge between live and paper`,
        metric: 'position_count_diff',
        value: divergence.positionCountDiff,
        threshold: this.config.maxPositionDivergences,
      });
    }

    // Individual position divergence alerts
    for (const posDiv of divergence.positionDivergences) {
      alerts.push({
        severity: 'info',
        message: `${posDiv.symbol}: ${posDiv.divergenceType} (live: ${posDiv.liveQty}, paper: ${posDiv.paperQty})`,
        metric: `position_${posDiv.symbol}_qty_diff`,
        value: Math.abs(posDiv.qtyDiff),
        threshold: this.config.positionQtyThresholdPct,
      });
    }

    return alerts;
  }

  public compareTimeSeries(results: ComparisonResult[]): TimeSeriesAnalysis {
    const portfolioValueDiffs = results.map((r) => r.divergence.portfolioValueDiffPct);
    const pnlDiffs = results.map((r) => r.divergence.pnlDiff);
    const positionCounts = results.map((r) => r.divergence.positionCountDiff);

    return {
      dataPoints: results.length,
      portfolioValueDivergence: {
        mean: this.mean(portfolioValueDiffs),
        max: Math.max(...portfolioValueDiffs.map(Math.abs)),
        min: Math.min(...portfolioValueDiffs.map(Math.abs)),
      },
      pnlDivergence: {
        mean: this.mean(pnlDiffs),
        max: Math.max(...pnlDiffs.map(Math.abs)),
        min: Math.min(...pnlDiffs.map(Math.abs)),
      },
      positionDivergence: {
        mean: this.mean(positionCounts),
        max: Math.max(...positionCounts),
        min: Math.min(...positionCounts),
      },
      alertCount: results.reduce((sum, r) => sum + r.alerts.length, 0),
      criticalAlertCount: results.reduce(
        (sum, r) => sum + r.alerts.filter((a) => a.severity === 'critical').length,
        0
      ),
    };
  }

  private mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }
}

export interface TimeSeriesAnalysis {
  dataPoints: number;
  portfolioValueDivergence: {
    mean: number;
    max: number;
    min: number;
  };
  pnlDivergence: {
    mean: number;
    max: number;
    min: number;
  };
  positionDivergence: {
    mean: number;
    max: number;
    min: number;
  };
  alertCount: number;
  criticalAlertCount: number;
}

// Helper to create environment snapshot
export function createSnapshot(
  env: 'live' | 'paper',
  positions: PositionState[],
  cash: number,
  realizedPnL: number
): EnvironmentSnapshot {
  const posMap = new Map<string, PositionState>();
  let unrealizedPnL = 0;

  for (const pos of positions) {
    posMap.set(pos.symbol, pos);
    unrealizedPnL += pos.unrealizedPnL;
  }

  const portfolioValue = cash + positions.reduce((sum, p) => sum + p.marketValue, 0);

  return {
    env,
    timestamp: Date.now(),
    positions: posMap,
    cash,
    portfolioValue,
    realizedPnL,
    unrealizedPnL,
  };
}
