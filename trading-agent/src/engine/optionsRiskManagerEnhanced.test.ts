// optionsRiskManagerEnhanced.test.ts
// Comprehensive test suite for enhanced options risk manager
// Tests all critical risk controls and edge cases

import {
  normalCDF,
  callITMProb,
  passLiquidity,
  shortCallEarlyExerciseLikely,
  pinRiskLevel,
  contractsForSpread,
  adjustedVegaLimit,
  ivRankGating,
  inEarningsBlackout,
  minCreditOK,
  wingWidthSane,
  approveEnhancedOptionsTrade,
  PRODUCTION_ENHANCED_PLAYBOOK
} from './optionsRiskManagerEnhanced';

import { OptionContract } from '../types/options';

// Test playbook for consistent testing
const testPlaybook = {
  liquidity: {
    minOpenInterest: 500,
    minVolume: 50,
    maxSpreadPct: 0.03,
    minMidPrice: 0.1,
    maxNbboAgeMs: 500
  },
  exposure: {
    maxTotalOptionsExposure: 0.25,
    maxSingleOptionsExposure: 0.05,
    maxPerUnderlyingRiskPct: 0.05
  },
  portfolioGreeksLimits: {
    baseMaxDelta: 200,
    baseMaxGamma: 20,
    baseMaxTheta: -100,
    baseMaxVega: 400,
    vegaLimitScalerByIvRankHigh: 0.6,
    vegaLimitScalerByIvRankLow: 1.2,
    highIvRankThreshold: 70,
    lowIvRankThreshold: 30
  },
  ivRankRules: {
    longPremiumMaxIvRank: 70,
    shortPremiumMinIvRank: 30
  },
  dteRules: {
    minDte: 14,
    maxDte: 60,
    nearExpiryDte: 7,
    maxShortGammaExposurePctNearExpiry: 0.02
  },
  earningsAndMacro: {
    earningsBlackoutDaysBefore: 2,
    earningsBlackoutDaysAfter: 1,
    macroPauseMinutes: 60
  },
  spreadSanity: {
    minCreditToWidthRatio: 0.3,
    minWingWidthToATR: 1.0,
    gapBuffer: 1.2
  },
  circuitBreakers: {
    cautiousDrawdownPct: 0.02,
    haltDrawdownPct: 0.04
  }
};

describe('Enhanced Options Risk Manager', () => {

  describe('Statistical Functions', () => {
    test('normalCDF returns expected values', () => {
      expect(normalCDF(-3)).toBeLessThan(0.01);
      expect(normalCDF(0)).toBeCloseTo(0.5, 3);
      expect(normalCDF(3)).toBeGreaterThan(0.99);
    });

    test('normalCDF is monotonic', () => {
      expect(normalCDF(-2)).toBeLessThan(normalCDF(-1));
      expect(normalCDF(-1)).toBeLessThan(normalCDF(0));
      expect(normalCDF(0)).toBeLessThan(normalCDF(1));
      expect(normalCDF(1)).toBeLessThan(normalCDF(2));
    });

    test('callITMProb returns sensible probabilities', () => {
      // ATM call, 30 DTE, 30% IV
      const prob = callITMProb(100, 100, 30, 0.3, 0.02, 0.01);
      expect(prob).toBeGreaterThan(0.45);
      expect(prob).toBeLessThan(0.55);

      // Deep OTM call should have low probability
      const otmProb = callITMProb(100, 120, 30, 0.3, 0.02, 0.01);
      expect(otmProb).toBeLessThan(0.2);

      // Deep ITM call should have high probability
      const itmProb = callITMProb(120, 100, 30, 0.3, 0.02, 0.01);
      expect(itmProb).toBeGreaterThan(0.8);
    });
  });

  describe('Liquidity Filters', () => {
    const testContract: OptionContract = {
      symbol: 'AAPL240920C00150000',
      underlyingSymbol: 'AAPL',
      contractType: 'call',
      strikePrice: 150,
      expirationDate: new Date('2024-09-20'),
      multiplier: 100,
      exchange: 'OPRA',
      openInterest: 1000
    };

    test('passLiquidity accepts good quotes', () => {
      const goodQuote = {
        bid: 1.0,
        ask: 1.02,
        impliedVolatility: 0.3,
        volume: 100,
        nbboAgeMs: 100,
        openInterest: 600
      };

      expect(passLiquidity(testContract, goodQuote, testPlaybook.liquidity)).toBe(true);
    });

    test('passLiquidity rejects wide spreads', () => {
      const wideSpreadQuote = {
        bid: 1.0,
        ask: 1.2,  // 18% spread
        impliedVolatility: 0.3,
        volume: 100,
        nbboAgeMs: 100,
        openInterest: 600
      };

      expect(passLiquidity(testContract, wideSpreadQuote, testPlaybook.liquidity)).toBe(false);
    });

    test('passLiquidity rejects low volume', () => {
      const lowVolumeQuote = {
        bid: 1.0,
        ask: 1.02,
        impliedVolatility: 0.3,
        volume: 10,  // Below minimum
        nbboAgeMs: 100,
        openInterest: 600
      };

      expect(passLiquidity(testContract, lowVolumeQuote, testPlaybook.liquidity)).toBe(false);
    });

    test('passLiquidity rejects low open interest', () => {
      const lowOIQuote = {
        bid: 1.0,
        ask: 1.02,
        impliedVolatility: 0.3,
        volume: 100,
        nbboAgeMs: 100,
        openInterest: 100  // Below minimum
      };

      expect(passLiquidity(testContract, lowOIQuote, testPlaybook.liquidity)).toBe(false);
    });

    test('passLiquidity rejects stale quotes', () => {
      const staleQuote = {
        bid: 1.0,
        ask: 1.02,
        impliedVolatility: 0.3,
        volume: 100,
        nbboAgeMs: 1000,  // Too old
        openInterest: 600
      };

      expect(passLiquidity(testContract, staleQuote, testPlaybook.liquidity)).toBe(false);
    });
  });

  describe('Assignment Risk Functions', () => {
    test('shortCallEarlyExerciseLikely detects dividend risk', () => {
      // Extrinsic < dividend, close to ex-div
      expect(shortCallEarlyExerciseLikely(0.2, 0.3, 1)).toBe(true);

      // Extrinsic > dividend
      expect(shortCallEarlyExerciseLikely(0.4, 0.3, 1)).toBe(false);

      // Far from ex-div
      expect(shortCallEarlyExerciseLikely(0.2, 0.3, 10)).toBe(false);
    });

    test('pinRiskLevel assesses expiration risk correctly', () => {
      // High risk: very close to strike, near expiration
      expect(pinRiskLevel(100, 100.4, 2)).toBe('high');

      // Medium risk: close to strike, day of expiration
      expect(pinRiskLevel(100, 101, 10)).toBe('med');

      // Low risk: far from strike
      expect(pinRiskLevel(100, 110, 10)).toBe('low');
    });
  });

  describe('Position Sizing Functions', () => {
    test('contractsForSpread respects risk budget and gap buffer', () => {
      const contracts = contractsForSpread(200, 100000, 0.01, 1.2);
      const expectedRisk = 100000 * 0.01; // $1000 risk budget
      const adjustedRisk = 200 * 1.2; // $240 per contract with buffer
      const expectedContracts = Math.floor(expectedRisk / adjustedRisk);

      expect(contracts).toBe(Math.max(1, expectedContracts));
    });

    test('contractsForSpread returns at least 1 contract', () => {
      const contracts = contractsForSpread(10000, 100000, 0.001, 1.5);
      expect(contracts).toBe(1);
    });

    test('contractsForSpread handles zero max loss', () => {
      const contracts = contractsForSpread(0, 100000, 0.01, 1.2);
      expect(contracts).toBe(0);
    });
  });

  describe('IV Regime Functions', () => {
    test('adjustedVegaLimit scales correctly with IV regime', () => {
      const baseVega = 400;

      // High IV regime - reduce limit
      const highIVLimit = adjustedVegaLimit(baseVega, 80, 30, 70, 1.2, 0.6);
      expect(highIVLimit).toBe(240);

      // Low IV regime - increase limit
      const lowIVLimit = adjustedVegaLimit(baseVega, 20, 30, 70, 1.2, 0.6);
      expect(lowIVLimit).toBe(480);

      // Normal regime - no change
      const normalLimit = adjustedVegaLimit(baseVega, 50, 30, 70, 1.2, 0.6);
      expect(normalLimit).toBe(400);
    });

    test('ivRankGating enforces strategy-appropriate IV levels', () => {
      // Long premium: should reject high IV
      expect(ivRankGating(true, 50, 70, 30)).toBe(true);
      expect(ivRankGating(true, 80, 70, 30)).toBe(false);

      // Short premium: should reject low IV
      expect(ivRankGating(false, 50, 70, 30)).toBe(true);
      expect(ivRankGating(false, 20, 70, 30)).toBe(false);
    });
  });

  describe('Calendar Functions', () => {
    test('inEarningsBlackout detects earnings windows', () => {
      // Before earnings
      expect(inEarningsBlackout(1, 2, 1)).toBe(true);

      // After earnings
      expect(inEarningsBlackout(-1, 2, 1)).toBe(true);

      // Outside window
      expect(inEarningsBlackout(5, 2, 1)).toBe(false);
      expect(inEarningsBlackout(-5, 2, 1)).toBe(false);

      // Unknown earnings date
      expect(inEarningsBlackout(null, 2, 1)).toBe(false);
    });
  });

  describe('Spread Sanity Functions', () => {
    test('minCreditOK enforces minimum credit-to-width ratio', () => {
      expect(minCreditOK(0.3, 1.0, 0.3)).toBe(true);
      expect(minCreditOK(0.2, 1.0, 0.3)).toBe(false);
      expect(minCreditOK(0.3, 0, 0.3)).toBe(false);
    });

    test('wingWidthSane checks against ATR', () => {
      expect(wingWidthSane(5, 3, 1.0)).toBe(true);
      expect(wingWidthSane(2, 3, 1.0)).toBe(false);
      expect(wingWidthSane(2, 0, 1.0)).toBe(true); // No ATR data
    });
  });

  describe('Comprehensive Trade Approval', () => {
    const baseTradeArgs = {
      contract: {
        symbol: 'AAPL240920C00150000',
        underlyingSymbol: 'AAPL',
        contractType: 'call' as const,
        strikePrice: 150,
        expirationDate: new Date('2024-09-20'),
        multiplier: 100,
        exchange: 'OPRA',
        openInterest: 1000
      },
      quote: {
        bid: 1.0,
        ask: 1.02,
        last: 1.01,
        impliedVolatility: 0.3,
        volume: 100,
        nbboAgeMs: 100,
        openInterest: 600
      },
      greeks: { delta: 0.4, gamma: 0.02, theta: -0.03, vega: 0.1 },
      portfolioGreeks: { totalDelta: 0, totalGamma: 0, totalTheta: 0, totalVega: 0 },
      equity: 100000,
      portfolioIvRank: 40,
      isLongPremium: true,
      dte: 30,
      underlyingATR: 3,
      earnings: {
        daysToEarnings: 10,
        daysToExDividend: 15,
        nextDividendCash: 0.2,
        dividendYield: 0.005
      },
      macro: { hasMajorEventNow: false },
      perUnderlyingRiskPct: 0.01,
      hoursToExpiry: 48
    };

    test('approves clean trades', () => {
      const result = approveEnhancedOptionsTrade(baseTradeArgs, testPlaybook);

      expect(result.approved).toBe(true);
      expect(result.reasons.length).toBe(0);
      expect(result.riskScore).toBeLessThan(0.8);
    });

    test('rejects trades failing multiple criteria', () => {
      const badTradeArgs = {
        ...baseTradeArgs,
        quote: {
          ...baseTradeArgs.quote,
          bid: 1.0,
          ask: 1.2,        // Wide spread
          nbboAgeMs: 1000,  // Stale
          volume: 10,       // Low volume
          openInterest: 100 // Low OI
        },
        portfolioIvRank: 80,  // High IV for long premium
        dte: 5,               // Too short
        isLongPremium: true,
        earnings: {
          ...baseTradeArgs.earnings,
          daysToEarnings: 1   // Earnings blackout
        },
        macro: { hasMajorEventNow: true },
        perUnderlyingRiskPct: 0.2,  // Over concentration limit
        hoursToExpiry: 1             // Pin risk
      };

      const result = approveEnhancedOptionsTrade(badTradeArgs, testPlaybook);

      expect(result.approved).toBe(false);
      expect(result.reasons.length).toBeGreaterThan(5);
      expect(result.reasons).toContain('liquidity_gate_failed');
      expect(result.reasons).toContain('iv_rank_gate_failed');
      expect(result.reasons).toContain('dte_out_of_bounds');
      expect(result.reasons).toContain('earnings_blackout');
      expect(result.reasons).toContain('macro_event_pause');
      expect(result.reasons).toContain('per_underlying_risk_cap');
      expect(result.riskScore).toBeGreaterThan(0.8);
    });

    test('handles spread trades with sanity checks', () => {
      const spreadTradeArgs = {
        ...baseTradeArgs,
        proposedNetCredit: 0.1,
        spreadWidth: 0.5,
        underlyingATR: 1.0
      };

      // Should fail min credit ratio (0.1 / 0.5 = 0.2 < 0.3)
      // Should fail wing width vs ATR (0.5 < 1.0 * 1.0)
      const result = approveEnhancedOptionsTrade(spreadTradeArgs, testPlaybook);

      expect(result.approved).toBe(false);
      expect(result.reasons).toContain('min_credit_ratio_failed');
      expect(result.reasons).toContain('wings_too_tight_vs_atr');
    });

    test('detects early exercise risk', () => {
      const earlyExerciseArgs = {
        ...baseTradeArgs,
        earnings: {
          daysToEarnings: 10,
          daysToExDividend: 1,      // Close to ex-div
          nextDividendCash: 0.5,    // Large dividend
          dividendYield: 0.01
        },
        extrinsicValueShortCall: 0.3  // Less than dividend
      };

      const result = approveEnhancedOptionsTrade(earlyExerciseArgs, testPlaybook);

      expect(result.approved).toBe(false);
      expect(result.reasons).toContain('early_exercise_risk_exdiv');
    });

    test('detects pin risk near expiration', () => {
      const pinRiskArgs = {
        ...baseTradeArgs,
        quote: {
          ...baseTradeArgs.quote,
          last: 150.04  // Very close to 150 strike
        },
        hoursToExpiry: 2  // Very close to expiration
      };

      const result = approveEnhancedOptionsTrade(pinRiskArgs, testPlaybook);

      expect(result.approved).toBe(false);
      expect(result.reasons).toContain('pin_risk_high');
    });

    test('enforces portfolio Greeks limits', () => {
      const highGreeksArgs = {
        ...baseTradeArgs,
        portfolioGreeks: {
          totalDelta: 300,  // Exceeds base limit of 200
          totalGamma: 0,
          totalTheta: 0,
          totalVega: 0
        }
      };

      const result = approveEnhancedOptionsTrade(highGreeksArgs, testPlaybook);

      expect(result.approved).toBe(false);
      expect(result.reasons).toContain('portfolio_delta_limit');
    });

    test('applies IV regime scaling to vega limits', () => {
      const highVegaHighIVArgs = {
        ...baseTradeArgs,
        portfolioGreeks: {
          totalDelta: 0,
          totalGamma: 0,
          totalTheta: 0,
          totalVega: 300  // Would exceed adjusted limit of 240 (400 * 0.6)
        },
        portfolioIvRank: 80  // High IV regime
      };

      const result = approveEnhancedOptionsTrade(highVegaHighIVArgs, testPlaybook);

      expect(result.approved).toBe(false);
      expect(result.reasons).toContain('portfolio_vega_limit');

      // Same vega should pass in low IV regime (limit becomes 480)
      const highVegaLowIVArgs = {
        ...highVegaHighIVArgs,
        portfolioIvRank: 20  // Low IV regime
      };

      const lowIVResult = approveEnhancedOptionsTrade(highVegaLowIVArgs, testPlaybook);
      expect(lowIVResult.approved).toBe(true);
    });
  });

  describe('Production Configuration', () => {
    test('PRODUCTION_ENHANCED_PLAYBOOK has sensible defaults', () => {
      const config = PRODUCTION_ENHANCED_PLAYBOOK;

      // Liquidity rules
      expect(config.liquidity.minOpenInterest).toBeGreaterThan(0);
      expect(config.liquidity.maxSpreadPct).toBeLessThan(0.1);

      // Exposure limits
      expect(config.exposure.maxTotalOptionsExposure).toBeLessThan(0.5);
      expect(config.exposure.maxSingleOptionsExposure).toBeLessThan(0.1);

      // Greeks limits
      expect(config.portfolioGreeksLimits.baseMaxVega).toBeGreaterThan(0);
      expect(config.portfolioGreeksLimits.vegaLimitScalerByIvRankHigh).toBeLessThan(1);
      expect(config.portfolioGreeksLimits.vegaLimitScalerByIvRankLow).toBeGreaterThan(1);

      // DTE rules
      expect(config.dteRules.minDte).toBeGreaterThan(0);
      expect(config.dteRules.maxDte).toBeGreaterThan(config.dteRules.minDte);

      // Circuit breakers
      expect(config.circuitBreakers.haltDrawdownPct).toBeGreaterThan(config.circuitBreakers.cautiousDrawdownPct);
    });
  });
});
