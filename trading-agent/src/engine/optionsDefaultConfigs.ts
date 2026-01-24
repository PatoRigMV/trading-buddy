import { OptionsRiskLimits } from './optionsRiskManager';

/**
 * Conservative options risk management configuration
 * Suitable for beginners or conservative traders
 */
export const CONSERVATIVE_OPTIONS_LIMITS: OptionsRiskLimits = {
  // Base risk limits (inherited from equity risk management)
  maxRiskPerTrade: 0.005,                  // 0.5% per trade (more conservative than equity)
  maxDailyLoss: 0.015,                     // 1.5% max daily loss
  maxPositions: 3,                         // Fewer concurrent positions for options
  maxExposurePerSymbol: 0.05,              // 5% max per symbol
  maxTotalExposure: 0.30,                  // 30% total exposure (much lower for options)

  drawdownThresholds: [0.03, 0.06, 0.10],
  drawdownScaling: [0.8, 0.5, 0.2],
  maxDrawdown: 0.15,                       // 15% max drawdown

  circuitBreakerCautious: 0.01,            // 1% loss triggers cautious mode
  circuitBreakerHalt: 0.02,                // 2% loss halts new positions
  maxOpenRisk: 0.03,                       // 3% max total open risk
  maxTradesPerDay: 5,                      // Fewer options trades per day
  minAccountValue: 25000,                  // PDT rule compliance
  symbolCooldownMinutes: 60,               // Longer cooldown for options

  atrStopMultiplier: 2.0,
  trailingStopATR: 1.5,
  trailingActivationATR: 1.0,

  allowPyramiding: false,                  // No pyramiding for conservative approach
  maxPyramidLevels: 0,
  pyramidSizeMultiplier: 0,

  minPrice: 5.0,                           // Higher minimum price for options underlyings
  minDailyVolume: 50000000,                // $50M minimum daily volume
  maxSpreadBps: 20,                        // 20bps max spread

  avoidFirstMinutes: 15,                   // Avoid first 15 minutes
  avoidLastMinutes: 15,                    // Avoid last 15 minutes
  earningsBlackoutDays: 3,                 // 3 days before/after earnings

  // Options-specific limits (conservative)
  maxTotalOptionsExposure: 0.15,           // 15% max total options exposure
  maxSingleOptionsExposure: 0.03,          // 3% max single position
  maxOptionsPositions: 3,                  // Max 3 options positions

  maxPortfolioDelta: 50,                   // $50 per $1 move max delta
  maxPortfolioGamma: 5,                    // Conservative gamma limit
  maxPortfolioTheta: -25,                  // Max $25/day theta decay
  maxPortfolioVega: 100,                   // $100 per 1% IV change

  maxLongPremium: 0.10,                    // 10% max long premium
  maxShortPremium: 0.05,                   // 5% max short premium
  maxNakedShortExposure: 0.02,             // 2% max naked short exposure

  minDaysToExpiration: 14,                 // Minimum 14 DTE for new positions
  maxNearExpirationExposure: 0.05,         // 5% max near-expiration exposure

  maxIVPercentile: 0.70,                   // Don't buy above 70th IV percentile
  minIVPercentile: 0.50,                   // Don't sell below 50th IV percentile

  maxAssignmentRisk: 0.10,                 // 10% max assignment risk
  maxEarningsExposure: 0.05,               // 5% max through earnings

  optionsMarginBuffer: 1.5,                // 50% extra margin buffer
  maxBuyingPowerUsed: 0.40                 // Use max 40% of buying power
};

/**
 * Moderate options risk management configuration
 * Suitable for experienced traders with moderate risk tolerance
 */
export const MODERATE_OPTIONS_LIMITS: OptionsRiskLimits = {
  // Base risk limits
  maxRiskPerTrade: 0.01,                   // 1% per trade
  maxDailyLoss: 0.025,                     // 2.5% max daily loss
  maxPositions: 6,                         // More positions allowed
  maxExposurePerSymbol: 0.08,              // 8% max per symbol
  maxTotalExposure: 0.50,                  // 50% total exposure

  drawdownThresholds: [0.05, 0.10, 0.15],
  drawdownScaling: [0.8, 0.6, 0.3],
  maxDrawdown: 0.20,                       // 20% max drawdown

  circuitBreakerCautious: 0.015,           // 1.5% loss triggers cautious mode
  circuitBreakerHalt: 0.03,                // 3% loss halts new positions
  maxOpenRisk: 0.05,                       // 5% max total open risk
  maxTradesPerDay: 10,                     // More trades allowed
  minAccountValue: 25000,
  symbolCooldownMinutes: 45,

  atrStopMultiplier: 2.0,
  trailingStopATR: 1.5,
  trailingActivationATR: 1.0,

  allowPyramiding: true,                   // Allow moderate pyramiding
  maxPyramidLevels: 2,
  pyramidSizeMultiplier: 0.7,

  minPrice: 3.0,                           // Lower minimum price
  minDailyVolume: 25000000,                // $25M minimum daily volume
  maxSpreadBps: 15,                        // 15bps max spread

  avoidFirstMinutes: 10,
  avoidLastMinutes: 10,
  earningsBlackoutDays: 2,

  // Options-specific limits (moderate)
  maxTotalOptionsExposure: 0.25,           // 25% max total options exposure
  maxSingleOptionsExposure: 0.05,          // 5% max single position
  maxOptionsPositions: 6,                  // Max 6 options positions

  maxPortfolioDelta: 100,                  // $100 per $1 move max delta
  maxPortfolioGamma: 10,                   // Moderate gamma limit
  maxPortfolioTheta: -50,                  // Max $50/day theta decay
  maxPortfolioVega: 200,                   // $200 per 1% IV change

  maxLongPremium: 0.15,                    // 15% max long premium
  maxShortPremium: 0.08,                   // 8% max short premium
  maxNakedShortExposure: 0.04,             // 4% max naked short exposure

  minDaysToExpiration: 10,                 // Minimum 10 DTE
  maxNearExpirationExposure: 0.08,         // 8% max near-expiration exposure

  maxIVPercentile: 0.80,                   // Buy up to 80th IV percentile
  minIVPercentile: 0.40,                   // Sell down to 40th IV percentile

  maxAssignmentRisk: 0.15,                 // 15% max assignment risk
  maxEarningsExposure: 0.08,               // 8% max through earnings

  optionsMarginBuffer: 1.3,                // 30% extra margin buffer
  maxBuyingPowerUsed: 0.60                 // Use max 60% of buying power
};

/**
 * Aggressive options risk management configuration
 * Suitable for experienced traders with high risk tolerance
 */
export const AGGRESSIVE_OPTIONS_LIMITS: OptionsRiskLimits = {
  // Base risk limits
  maxRiskPerTrade: 0.015,                  // 1.5% per trade
  maxDailyLoss: 0.04,                      // 4% max daily loss
  maxPositions: 10,                        // Many positions allowed
  maxExposurePerSymbol: 0.12,              // 12% max per symbol
  maxTotalExposure: 0.80,                  // 80% total exposure

  drawdownThresholds: [0.08, 0.15, 0.25],
  drawdownScaling: [0.9, 0.7, 0.4],
  maxDrawdown: 0.30,                       // 30% max drawdown

  circuitBreakerCautious: 0.025,           // 2.5% loss triggers cautious mode
  circuitBreakerHalt: 0.05,                // 5% loss halts new positions
  maxOpenRisk: 0.08,                       // 8% max total open risk
  maxTradesPerDay: 20,                     // Many trades allowed
  minAccountValue: 25000,
  symbolCooldownMinutes: 30,               // Shorter cooldown

  atrStopMultiplier: 2.5,
  trailingStopATR: 2.0,
  trailingActivationATR: 1.2,

  allowPyramiding: true,
  maxPyramidLevels: 3,
  pyramidSizeMultiplier: 0.6,

  minPrice: 1.0,                           // Lower minimum price
  minDailyVolume: 10000000,                // $10M minimum daily volume
  maxSpreadBps: 25,                        // 25bps max spread

  avoidFirstMinutes: 5,                    // Shorter avoidance periods
  avoidLastMinutes: 5,
  earningsBlackoutDays: 1,

  // Options-specific limits (aggressive)
  maxTotalOptionsExposure: 0.40,           // 40% max total options exposure
  maxSingleOptionsExposure: 0.08,          // 8% max single position
  maxOptionsPositions: 10,                 // Max 10 options positions

  maxPortfolioDelta: 200,                  // $200 per $1 move max delta
  maxPortfolioGamma: 20,                   // Higher gamma tolerance
  maxPortfolioTheta: -100,                 // Max $100/day theta decay
  maxPortfolioVega: 400,                   // $400 per 1% IV change

  maxLongPremium: 0.25,                    // 25% max long premium
  maxShortPremium: 0.15,                   // 15% max short premium
  maxNakedShortExposure: 0.08,             // 8% max naked short exposure

  minDaysToExpiration: 7,                  // Minimum 7 DTE (allow weeklies)
  maxNearExpirationExposure: 0.15,         // 15% max near-expiration exposure

  maxIVPercentile: 0.90,                   // Buy up to 90th IV percentile
  minIVPercentile: 0.25,                   // Sell down to 25th IV percentile

  maxAssignmentRisk: 0.25,                 // 25% max assignment risk
  maxEarningsExposure: 0.15,               // 15% max through earnings

  optionsMarginBuffer: 1.2,                // 20% extra margin buffer
  maxBuyingPowerUsed: 0.80                 // Use max 80% of buying power
};

/**
 * Get appropriate options risk limits based on experience level and risk tolerance
 */
export function getOptionsRiskLimits(
  riskLevel: 'conservative' | 'moderate' | 'aggressive' = 'moderate',
  accountSize: number = 100000
): OptionsRiskLimits {

  let baseLimits: OptionsRiskLimits;

  switch (riskLevel) {
    case 'conservative':
      baseLimits = { ...CONSERVATIVE_OPTIONS_LIMITS };
      break;
    case 'aggressive':
      baseLimits = { ...AGGRESSIVE_OPTIONS_LIMITS };
      break;
    default:
      baseLimits = { ...MODERATE_OPTIONS_LIMITS };
  }

  // Adjust limits based on account size
  if (accountSize < 25000) {
    // Smaller accounts should be more conservative
    baseLimits.maxTotalOptionsExposure *= 0.7;
    baseLimits.maxSingleOptionsExposure *= 0.7;
    baseLimits.maxOptionsPositions = Math.min(baseLimits.maxOptionsPositions, 3);
    baseLimits.maxTradesPerDay = Math.min(baseLimits.maxTradesPerDay, 3); // PDT rule
  } else if (accountSize > 500000) {
    // Larger accounts can handle slightly more risk
    baseLimits.maxTotalOptionsExposure = Math.min(baseLimits.maxTotalOptionsExposure * 1.2, 0.50);
    baseLimits.maxOptionsPositions = Math.min(baseLimits.maxOptionsPositions + 2, 15);
  }

  return baseLimits;
}

/**
 * Create options risk limits optimized for specific strategies
 */
export function getStrategyOptimizedLimits(
  strategy: 'income' | 'growth' | 'speculation',
  accountSize: number = 100000
): OptionsRiskLimits {

  switch (strategy) {
    case 'income':
      // Optimized for premium selling strategies
      return {
        ...getOptionsRiskLimits('moderate', accountSize),
        maxShortPremium: 0.12,               // Higher short premium for income
        maxNakedShortExposure: 0.06,         // Allow more short exposure
        minIVPercentile: 0.30,               // Sell at lower IV levels
        minDaysToExpiration: 21,             // Prefer longer-term positions
        maxPortfolioTheta: -75,              // Accept more theta decay for income
      };

    case 'speculation':
      // Optimized for directional long options
      return {
        ...getOptionsRiskLimits('aggressive', accountSize),
        maxLongPremium: 0.35,                // Higher long premium allocation
        maxShortPremium: 0.05,               // Minimal short exposure
        maxIVPercentile: 0.95,               // Buy at any IV level
        minDaysToExpiration: 3,              // Allow very short-term plays
        maxPortfolioVega: 600,               // Higher vega tolerance
      };

    default: // 'growth'
      // Balanced approach for growth strategies
      return {
        ...getOptionsRiskLimits('moderate', accountSize),
        maxTotalOptionsExposure: 0.20,       // Moderate options allocation
        maxLongPremium: 0.12,                // Balanced long/short
        maxShortPremium: 0.08,
        minDaysToExpiration: 14,             // Medium-term focus
      };
  }
}

/**
 * Emergency/defensive risk limits for volatile market conditions
 */
export const DEFENSIVE_OPTIONS_LIMITS: OptionsRiskLimits = {
  ...CONSERVATIVE_OPTIONS_LIMITS,

  // Extra defensive measures
  maxTotalOptionsExposure: 0.08,           // Very low options exposure
  maxSingleOptionsExposure: 0.02,          // Tiny individual positions
  maxOptionsPositions: 2,                  // Very few positions
  maxTradesPerDay: 2,                      // Minimal trading

  maxPortfolioDelta: 25,                   // Very low delta exposure
  maxPortfolioTheta: -10,                  // Minimal theta decay
  maxPortfolioVega: 50,                    // Low vega exposure

  minDaysToExpiration: 21,                 // Only longer-term options
  maxNearExpirationExposure: 0.02,         // Almost no near-expiration risk

  maxIVPercentile: 0.50,                   // Only buy cheap options
  minIVPercentile: 0.70,                   // Only sell expensive options

  circuitBreakerCautious: 0.005,           // 0.5% triggers cautious mode
  circuitBreakerHalt: 0.01,                // 1% halts trading

  optionsMarginBuffer: 2.0,                // Double margin buffer
  maxBuyingPowerUsed: 0.20                 // Very conservative capital usage
};
