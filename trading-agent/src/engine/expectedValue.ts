import { TechnicalSignals } from './indicators';
import { ConfidenceScores } from './scorer';

export interface EVGateConfig {
  minExpectedValueBps: number;     // Minimum EV in basis points (e.g., 50 = 0.5%)
  probabilityCalibration: boolean;  // Apply probability calibration
  confidenceDecay: number;         // Decay factor for overconfidence (0.8-0.95)
  riskFreeRate: number;           // Risk-free rate for comparison
}

export interface ExpectedValueCalculation {
  expectedValueBps: number;        // Expected value in basis points
  winProbability: number;          // Calibrated win probability
  lossProbability: number;         // Calibrated loss probability
  expectedWin: number;             // Expected win amount (%)
  expectedLoss: number;            // Expected loss amount (%)
  sharpeRatio: number;             // Risk-adjusted return
  approved: boolean;               // Pass EV gate
  reason?: string;                 // Rejection reason
}

/**
 * Expected Value Gate - Only execute trades with positive expected value
 * Uses probability calibration to reduce overconfidence bias
 */
export class ExpectedValueGate {
  private config: EVGateConfig;

  constructor(config: EVGateConfig) {
    this.config = config;
  }

  /**
   * Calculate expected value for a trading decision
   */
  calculateExpectedValue(
    confidence: ConfidenceScores,
    signals: TechnicalSignals,
    atr: number,
    currentPrice: number
  ): ExpectedValueCalculation {

    // Apply probability calibration to reduce overconfidence
    const calibratedWinProb = this.calibrateProbability(confidence.buy);
    const calibratedLossProb = this.calibrateProbability(confidence.sell);
    const holdProb = 1 - calibratedWinProb - calibratedLossProb;

    // Estimate expected win/loss based on ATR and momentum
    const volatilityFactor = atr / currentPrice; // ATR as % of price
    const momentumFactor = (signals.momentum - 0.5) * 2; // Convert to -1 to +1 range

    // Expected win: use momentum and volatility
    // Higher momentum = higher expected win, but capped by volatility
    const baseWinReturn = volatilityFactor * 2; // Base win = 2x ATR
    const momentumAdjustment = momentumFactor * volatilityFactor;
    const expectedWin = Math.max(0.01, baseWinReturn + momentumAdjustment); // Min 1%

    // Expected loss: typically 1x ATR (stop loss level)
    const expectedLoss = volatilityFactor * 1.2; // Slightly wider than 1x ATR

    // Calculate expected value
    const expectedValue = (calibratedWinProb * expectedWin) - (calibratedLossProb * expectedLoss);
    const expectedValueBps = expectedValue * 10000; // Convert to basis points

    // Calculate Sharpe-like ratio (excess return / volatility)
    const excessReturn = expectedValue - this.config.riskFreeRate;
    const sharpeRatio = excessReturn / volatilityFactor;

    // Determine if trade passes the gate
    const approved = expectedValueBps >= this.config.minExpectedValueBps;
    const reason = approved ? undefined :
      `Expected value ${expectedValueBps.toFixed(1)}bps below minimum ${this.config.minExpectedValueBps}bps`;

    return {
      expectedValueBps,
      winProbability: calibratedWinProb,
      lossProbability: calibratedLossProb,
      expectedWin: expectedWin * 100, // Convert to percentage
      expectedLoss: expectedLoss * 100, // Convert to percentage
      sharpeRatio,
      approved,
      reason
    };
  }

  /**
   * Apply probability calibration to reduce overconfidence
   * Uses a sigmoid-like transformation to bring extreme probabilities toward 0.5
   */
  private calibrateProbability(rawProbability: number): number {
    if (!this.config.probabilityCalibration) {
      return rawProbability;
    }

    // Apply confidence decay to reduce overconfidence
    const decayFactor = this.config.confidenceDecay;

    // Pull extreme probabilities toward the center (0.5)
    const centered = rawProbability - 0.5;
    const calibrated = 0.5 + (centered * decayFactor);

    // Ensure bounds [0.05, 0.95] to avoid extreme probabilities
    return Math.max(0.05, Math.min(0.95, calibrated));
  }

  /**
   * Update gate configuration (for dynamic adjustment)
   */
  updateConfig(newConfig: Partial<EVGateConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current gate configuration
   */
  getConfig(): EVGateConfig {
    return { ...this.config };
  }
}

/**
 * Default configuration for conservative institutional trading
 */
export const DEFAULT_EV_CONFIG: EVGateConfig = {
  minExpectedValueBps: 50,        // 0.5% minimum expected value
  probabilityCalibration: true,    // Apply calibration
  confidenceDecay: 0.85,          // 85% confidence retention (reduces overconfidence)
  riskFreeRate: 0.0001           // ~5% annual risk-free rate daily
};
