import { describe, it, expect } from 'vitest';
import { RiskManager, Position, RiskLimits } from '../src/engine/risk';

describe('RiskManager', () => {
  const riskLimits: RiskLimits = {
    maxRiskPerTrade: 0.02, // 2%
    maxDailyLoss: 0.05, // 5%
    maxPositions: 5,
    maxExposurePerSymbol: 0.1, // 10%
    maxTotalExposure: 0.8, // 80%
    // Drawdown-aware scaling
    drawdownThresholds: [0.05, 0.10, 0.15],
    drawdownScaling: [0.8, 0.5, 0.2],
    maxDrawdown: 0.20,
    // Circuit breakers
    circuitBreakerCautious: 0.02,
    circuitBreakerHalt: 0.04,
    maxOpenRisk: 0.06,
    maxTradesPerDay: 20,
    minAccountValue: 25000,
    symbolCooldownMinutes: 45,
    // ATR-based stops
    atrStopMultiplier: 2.0,
    trailingStopATR: 1.0,
    trailingActivationATR: 0.75,
    // Trading window
    avoidFirstMinutes: 0, // Disable for testing
    avoidLastMinutes: 0, // Disable for testing
    // Pyramiding
    allowPyramiding: true,
    maxPyramidLayers: 3,
    pyramidScaling: 0.5
  };

  const portfolioValue = 100000;
  const riskManager = new RiskManager(riskLimits, portfolioValue);

  it('should approve valid trades', () => {
    const positions: Position[] = [];
    const assessment = riskManager.assessTrade(
      'AAPL',
      'buy',
      10,
      150,
      positions,
      portfolioValue,
      2.0 // ATR
    );

    expect(assessment.approved).toBe(true);
    expect(assessment.suggestedSize).toBeDefined();
    expect(assessment.stopLoss).toBeDefined();
  });

  it('should reject trades that exceed daily loss limit', () => {
    const positions: Position[] = [];
    // Simulate a portfolio that's already down 6% (exceeding 4% circuit breaker halt)
    const currentValue = portfolioValue * 0.94;

    const assessment = riskManager.assessTrade(
      'AAPL',
      'buy',
      10,
      150,
      positions,
      currentValue
    );

    expect(assessment.approved).toBe(false);
    // Updated to match actual error message from circuit breaker
    expect(assessment.reason).toContain('Circuit breaker halt');
  });

  it('should reject trades that exceed position count', () => {
    const positions: Position[] = Array(6).fill(null).map((_, i) => ({
      symbol: `STOCK${i}`,
      quantity: 10,
      avgPrice: 100,
      marketValue: 1000,
      unrealizedPnL: 0,
      side: 'long' as const
    }));

    const assessment = riskManager.assessTrade(
      'NEWSTOCK',
      'buy',
      10,
      150,
      positions,
      portfolioValue
    );

    expect(assessment.approved).toBe(false);
    expect(assessment.reason).toContain('Maximum position count exceeded');
  });

  it('should calculate optimal position size correctly', () => {
    const price = 100;
    const atr = 2;
    const confidence = 0.8;

    const size = riskManager.calculateOptimalPositionSize(
      price,
      portfolioValue,
      atr,
      confidence
    );

    expect(size).toBeGreaterThan(0);

    // Should not exceed risk limits
    const maxRiskAmount = portfolioValue * riskLimits.maxRiskPerTrade;
    const maxShares = Math.floor(maxRiskAmount / atr);
    expect(size).toBeLessThanOrEqual(maxShares);

    // Should not exceed exposure limits
    const maxValueForSymbol = portfolioValue * riskLimits.maxExposurePerSymbol;
    const maxSharesByExposure = Math.floor(maxValueForSymbol / price);
    expect(size).toBeLessThanOrEqual(maxSharesByExposure);
  });

  it('should enforce symbol exposure limits', () => {
    const positions: Position[] = [{
      symbol: 'AAPL',
      quantity: 500,
      avgPrice: 150,
      marketValue: 75000, // Already 75% of portfolio in AAPL
      unrealizedPnL: 0,
      side: 'long'
    }];

    const assessment = riskManager.assessTrade(
      'AAPL',
      'buy',
      100,
      150,
      positions,
      portfolioValue
    );

    expect(assessment.approved).toBe(false);
    expect(assessment.reason).toContain('Symbol exposure limit exceeded');
  });

  it('should provide risk metrics correctly', () => {
    const positions: Position[] = [
      {
        symbol: 'AAPL',
        quantity: 100,
        avgPrice: 150,
        marketValue: 15000,
        unrealizedPnL: 0,
        side: 'long'
      },
      {
        symbol: 'GOOGL',
        quantity: 10,
        avgPrice: 2500,
        marketValue: 25000,
        unrealizedPnL: 1000,
        side: 'long'
      }
    ];

    const metrics = riskManager.getCurrentRiskMetrics(positions, portfolioValue);

    expect(metrics.positionCount).toBe(2);
    expect(metrics.totalExposure).toBe(40000);
    expect(metrics.largestPosition).toBe(25000);
    expect(metrics.portfolioValue).toBe(portfolioValue);
  });
});
