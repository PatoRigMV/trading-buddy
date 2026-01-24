import { RiskLimits } from './risk';
import { EVGateConfig } from './expectedValue';
import { LiquidityLimits } from './liquidity';

/**
 * Conservative institutional-grade risk limits with drawdown awareness
 */
export const CONSERVATIVE_RISK_LIMITS: RiskLimits = {
  maxRiskPerTrade: 0.005,        // 0.5% per trade (conservative)
  maxDailyLoss: 0.02,            // 2% max daily loss
  maxPositions: 10,              // Max 10 concurrent positions
  maxExposurePerSymbol: 0.05,    // Max 5% exposure per symbol
  maxTotalExposure: 0.60,        // Max 60% total exposure

  // Drawdown-aware scaling
  drawdownThresholds: [0.03, 0.05, 0.10], // 3%, 5%, 10% drawdown levels
  drawdownScaling: [0.8, 0.5, 0.2],       // Scale down to 80%, 50%, 20%
  maxDrawdown: 0.15,             // Stop all trading at 15% drawdown

  // ChatGPT Critical Add-Ons
  circuitBreakerCautious: 0.015, // 1.5% loss = cautious mode
  circuitBreakerHalt: 0.03,      // 3% loss = halt new entries
  maxOpenRisk: 0.04,             // 4% max total open risk
  maxTradesPerDay: 15,           // Conservative trade count
  minAccountValue: 25000,        // PDT rule compliance
  symbolCooldownMinutes: 60,     // 1 hour cooldown

  // ATR-based stops
  atrStopMultiplier: 2.0,        // Conservative 2x ATR stops
  trailingStopATR: 1.5,          // 1.5x ATR trailing
  trailingActivationATR: 1.0,    // Start trailing after 1x ATR move

  // Liquidity and microstructure
  minPrice: 5.0,                 // Min $5 stock price
  minDailyVolume: 20000000,      // Min $20M daily volume
  maxSpreadBps: 15,              // Max 15bps spread

  // Time filters
  avoidFirstMinutes: 15,         // Avoid first 15 minutes
  avoidLastMinutes: 15,          // Avoid last 15 minutes
  earningsBlackoutDays: 2        // 2 days before/after earnings
};

/**
 * Moderate risk limits for experienced traders
 */
export const MODERATE_RISK_LIMITS: RiskLimits = {
  maxRiskPerTrade: 0.01,         // 1% per trade
  maxDailyLoss: 0.03,            // 3% max daily loss
  maxPositions: 15,              // Max 15 concurrent positions
  maxExposurePerSymbol: 0.08,    // Max 8% exposure per symbol
  maxTotalExposure: 0.80,        // Max 80% total exposure

  // Drawdown-aware scaling
  drawdownThresholds: [0.05, 0.10, 0.15], // 5%, 10%, 15% drawdown levels
  drawdownScaling: [0.8, 0.6, 0.3],       // Scale down to 80%, 60%, 30%
  maxDrawdown: 0.20,             // Stop all trading at 20% drawdown

  // ChatGPT Critical Add-Ons
  circuitBreakerCautious: 0.02,  // 2% loss = cautious mode
  circuitBreakerHalt: 0.04,      // 4% loss = halt new entries
  maxOpenRisk: 0.06,             // 6% max total open risk
  maxTradesPerDay: 20,           // Moderate trade count
  minAccountValue: 25000,        // PDT rule compliance
  symbolCooldownMinutes: 45,     // 45 min cooldown

  // ATR-based stops
  atrStopMultiplier: 1.8,        // 1.8x ATR stops
  trailingStopATR: 1.2,          // 1.2x ATR trailing
  trailingActivationATR: 0.8,    // Start trailing after 0.8x ATR move

  // Liquidity and microstructure
  minPrice: 3.0,                 // Min $3 stock price
  minDailyVolume: 10000000,      // Min $10M daily volume
  maxSpreadBps: 20,              // Max 20bps spread

  // Time filters
  avoidFirstMinutes: 10,         // Avoid first 10 minutes
  avoidLastMinutes: 10,          // Avoid last 10 minutes
  earningsBlackoutDays: 2        // 2 days before/after earnings
};

/**
 * Conservative EV gate configuration
 */
export const CONSERVATIVE_EV_CONFIG: EVGateConfig = {
  minExpectedValueBps: 75,       // 0.75% minimum expected value
  probabilityCalibration: true,   // Apply calibration
  confidenceDecay: 0.80,         // 80% confidence retention (aggressive debiasing)
  riskFreeRate: 0.0001          // ~5% annual risk-free rate daily
};

/**
 * Moderate EV gate configuration
 */
export const MODERATE_EV_CONFIG: EVGateConfig = {
  minExpectedValueBps: 50,       // 0.5% minimum expected value
  probabilityCalibration: true,   // Apply calibration
  confidenceDecay: 0.85,         // 85% confidence retention
  riskFreeRate: 0.0001          // ~5% annual risk-free rate daily
};

/**
 * Conservative liquidity limits for institutional trading
 */
export const CONSERVATIVE_LIQUIDITY_LIMITS: LiquidityLimits = {
  maxAdvPercentage: 0.02,        // Max 2% of ADV per trade
  minAdvThreshold: 100000,       // Min 100k shares ADV
  maxSpreadBps: 25,              // Max 25bps spread
  requireMarketCap: 2000000000   // Min $2B market cap
};

/**
 * Moderate liquidity limits
 */
export const MODERATE_LIQUIDITY_LIMITS: LiquidityLimits = {
  maxAdvPercentage: 0.05,        // Max 5% of ADV per trade
  minAdvThreshold: 50000,        // Min 50k shares ADV
  maxSpreadBps: 50,              // Max 50bps spread
  requireMarketCap: 1000000000   // Min $1B market cap
};

/**
 * EMERGENCY TESTING configuration - ULTRA-PERMISSIVE to force trades before market close
 */
export const TESTING_RISK_LIMITS: RiskLimits = {
  maxRiskPerTrade: 0.05,         // 5% per trade (EMERGENCY HIGH)
  maxDailyLoss: 0.20,            // 20% max daily loss (EMERGENCY HIGH)
  maxPositions: 20,              // Max 20 concurrent positions
  maxExposurePerSymbol: 0.25,    // Max 25% exposure per symbol (EMERGENCY HIGH)
  maxTotalExposure: 1.0,         // Max 100% total exposure

  // Drawdown-aware scaling - DISABLED
  drawdownThresholds: [0.50, 0.75, 0.90], // Very high thresholds (effectively disabled)
  drawdownScaling: [1.0, 1.0, 1.0],       // No scaling (effectively disabled)
  maxDrawdown: 0.50,             // Stop all trading at 50% drawdown (very high)

  // ChatGPT Critical Add-Ons - RELAXED FOR EMERGENCY TESTING
  circuitBreakerCautious: 0.15,  // 15% loss = cautious mode (very high)
  circuitBreakerHalt: 0.25,      // 25% loss = halt new entries (very high)
  maxOpenRisk: 0.25,             // 25% max total open risk (very high)
  maxTradesPerDay: 100,          // Very high trade count for testing
  minAccountValue: 1000,         // Low minimum (relaxed)
  symbolCooldownMinutes: 1,      // 1 min cooldown only (very short)

  // ATR-based stops - RELAXED
  atrStopMultiplier: 3.0,        // 3.0x ATR stops (very wide)
  trailingStopATR: 2.0,          // 2.0x ATR trailing (very wide)
  trailingActivationATR: 0.25,   // Start trailing after 0.25x ATR move

  // Liquidity and microstructure - ULTRA-RELAXED
  minPrice: 0.50,                // Min $0.50 stock price (very low)
  minDailyVolume: 100000,        // Min $100k daily volume (very low)
  maxSpreadBps: 500,             // Max 500bps spread (very high)

  // Time filters - DISABLED
  avoidFirstMinutes: 0,          // No time restrictions
  avoidLastMinutes: 0,           // No time restrictions
  earningsBlackoutDays: 0        // No earnings restrictions
};
