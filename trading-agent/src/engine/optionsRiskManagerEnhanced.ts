// optionsRiskManagerEnhanced.ts
// Production-grade risk & execution guard patch for options engine
// Incorporates ChatGPT audit recommendations
// Drop-in replacement with enhanced microstructure and risk controls

import { OptionsRiskLimits, OptionsRiskMetrics } from './optionsRiskManager';
import { OptionContract, Greeks, VolatilityAnalysis } from '../types/options';

export interface EnhancedQuote {
  bid: number;
  ask: number;
  last?: number;
  volume?: number;
  impliedVolatility: number;
  nbboAgeMs?: number;
  openInterest?: number;
}

export interface LiquidityRules {
  minOpenInterest: number;
  minVolume: number;
  maxSpreadPct: number;        // 0.03 = 3%
  minMidPrice: number;
  maxNbboAgeMs: number;
}

export interface EarningsCalendar {
  daysToEarnings: number | null;
  daysToExDividend: number | null;
  nextDividendCash?: number | null;
  dividendYield?: number | null;
}

export interface MacroCalendar {
  hasMajorEventNow: boolean;   // FOMC/CPI/NFP flags
}

export interface SpreadSanityRules {
  minCreditToWidthRatio: number;  // 0.3 = 30%
  minWingWidthToATR: number;      // 1.0 = wings 1x ATR apart
  gapBuffer: number;              // 1.2 = 20% extra risk buffer
}

export interface EnhancedPlaybook {
  liquidity: LiquidityRules;
  exposure: {
    maxTotalOptionsExposure: number;
    maxSingleOptionsExposure: number;
    maxPerUnderlyingRiskPct: number;
  };
  portfolioGreeksLimits: {
    baseMaxDelta: number;
    baseMaxGamma: number;
    baseMaxTheta: number;
    baseMaxVega: number;
    vegaLimitScalerByIvRankHigh: number;  // 0.6
    vegaLimitScalerByIvRankLow: number;   // 1.2
    highIvRankThreshold: number;          // 70
    lowIvRankThreshold: number;           // 30
  };
  ivRankRules: {
    longPremiumMaxIvRank: number;   // 70
    shortPremiumMinIvRank: number;  // 30
  };
  dteRules: {
    minDte: number;
    maxDte: number;
    nearExpiryDte: number;                      // 7
    maxShortGammaExposurePctNearExpiry: number; // 0.02
  };
  earningsAndMacro: {
    earningsBlackoutDaysBefore: number;
    earningsBlackoutDaysAfter: number;
    macroPauseMinutes: number;
  };
  spreadSanity: SpreadSanityRules;
  circuitBreakers: {
    cautiousDrawdownPct: number;
    haltDrawdownPct: number;
  };
}

// Enhanced statistical functions
export function normalCDF(x: number): number {
  // Abramowitz-Stegun approximation
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const absx = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * absx);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absx * absx);
  return 0.5 * (1 + sign * y);
}

// Risk-neutral probability a call finishes ITM at expiry
export function callITMProb(S: number, K: number, DTE: number, iv: number, r: number = 0.02, q: number = 0.01): number {
  const T = Math.max(DTE, 1) / 365.0;
  const sigma = Math.max(iv, 1e-6);
  const volT = sigma * Math.sqrt(T);
  const mu = (r - q - 0.5 * sigma * sigma) * T;
  const d2 = (Math.log(S / K) + mu) / volT;
  return normalCDF(d2);
}

// Enhanced liquidity gate with microstructure checks
export function passLiquidity(contract: OptionContract, quote: EnhancedQuote, rules: LiquidityRules): boolean {
  const oi = quote.openInterest ?? contract.openInterest ?? 0;
  const vol = quote.volume ?? 0;
  const mid = (quote.bid + quote.ask) / 2;

  // Basic volume/OI requirements
  if (oi < rules.minOpenInterest) return false;
  if (vol < rules.minVolume) return false;
  if (mid < rules.minMidPrice) return false;

  // Bid-ask spread check (critical for execution quality)
  const spreadPct = (quote.ask - quote.bid) / Math.max(mid, 1e-6);
  if (spreadPct > rules.maxSpreadPct) return false;

  // NBBO age check (stale quotes)
  if ((quote.nbboAgeMs ?? 0) > rules.maxNbboAgeMs) return false;

  return true;
}

// Early exercise risk for short calls around ex-dividend
export function shortCallEarlyExerciseLikely(extrinsicValue: number, dividend: number, daysToExDiv: number): boolean {
  // High risk if extrinsic < dividend and close to ex-div date
  if (daysToExDiv <= 2 && extrinsicValue < dividend) return true;
  return false;
}

// Pin risk assessment near expiration
export function pinRiskLevel(spotPrice: number, strikePrice: number, hoursToExpiry: number): 'low' | 'med' | 'high' {
  const priceDiffPct = Math.abs(spotPrice - strikePrice) / Math.max(strikePrice, 1e-6);

  if (hoursToExpiry < 3 && priceDiffPct < 0.005) return 'high';      // <0.5% away, <3 hours
  if (hoursToExpiry < 24 && priceDiffPct < 0.01) return 'med';       // <1% away, <24 hours
  return 'low';
}

// Position sizing for defined-risk spreads with gap buffer
export function contractsForSpread(maxLossPerContract: number, equity: number, riskFrac: number, gapBuffer: number = 1.2): number {
  const riskBudget = Math.max(equity * riskFrac, 0);
  if (maxLossPerContract <= 0) return 0;
  return Math.max(1, Math.floor(riskBudget / (maxLossPerContract * gapBuffer)));
}

// IV regime-aware vega limit adjustment
export function adjustedVegaLimit(
  baseMaxVega: number,
  portfolioIvRank: number,
  lowThreshold: number,
  highThreshold: number,
  lowScaler: number,
  highScaler: number
): number {
  if (portfolioIvRank >= highThreshold) return baseMaxVega * highScaler; // Reduce in high IV
  if (portfolioIvRank <= lowThreshold) return baseMaxVega * lowScaler;   // Increase in low IV
  return baseMaxVega;
}

// IV rank strategy gating
export function ivRankGating(isLongPremium: boolean, ivRank: number, longMaxIvRank: number, shortMinIvRank: number): boolean {
  if (isLongPremium && ivRank > longMaxIvRank) return false;  // Don't buy expensive options
  if (!isLongPremium && ivRank < shortMinIvRank) return false; // Don't sell cheap options
  return true;
}

// Earnings blackout window check
export function inEarningsBlackout(daysToEarnings: number | null, beforeDays: number, afterDays: number): boolean {
  if (daysToEarnings === null) return false;
  return (-afterDays <= daysToEarnings && daysToEarnings <= beforeDays);
}

// Spread sanity: ensure minimum credit-to-width ratio
export function minCreditOK(netCredit: number, width: number, minRatio: number): boolean {
  if (width <= 0) return false;
  return (netCredit / width) >= minRatio;
}

// Wing width vs ATR sanity check
export function wingWidthSane(wingWidth: number, underlyingATR: number, minATRMultiple: number): boolean {
  if (underlyingATR <= 0) return true; // Skip if no ATR data
  return wingWidth >= (minATRMultiple * underlyingATR);
}

// Main enhanced pre-trade approval function
export function approveEnhancedOptionsTrade(args: {
  contract: OptionContract;
  quote: EnhancedQuote;
  greeks: Greeks;
  portfolioGreeks: OptionsRiskMetrics;
  equity: number;
  portfolioIvRank: number;        // 0-100
  isLongPremium: boolean;
  dte: number;
  underlyingATR: number;
  earnings: EarningsCalendar;
  macro: MacroCalendar;
  perUnderlyingRiskPct: number;
  proposedMaxLossPerContract?: number;
  proposedNetCredit?: number;
  spreadWidth?: number;
  extrinsicValueShortCall?: number;
  hoursToExpiry?: number;
}, playbook: EnhancedPlaybook): { approved: boolean; reasons: string[]; riskScore: number } {

  const reasons: string[] = [];
  let riskScore = 0.5; // Base risk score

  // 1. Liquidity/microstructure gate
  if (!passLiquidity(args.contract, args.quote, playbook.liquidity)) {
    reasons.push('liquidity_gate_failed');
    riskScore += 0.3;
  }

  // 2. IV rank strategy gating
  if (!ivRankGating(args.isLongPremium, args.portfolioIvRank, playbook.ivRankRules.longPremiumMaxIvRank, playbook.ivRankRules.shortPremiumMinIvRank)) {
    reasons.push('iv_rank_gate_failed');
    riskScore += 0.2;
  }

  // 3. DTE boundaries
  if (args.dte < playbook.dteRules.minDte || args.dte > playbook.dteRules.maxDte) {
    reasons.push('dte_out_of_bounds');
    riskScore += 0.2;
  }

  // 4. Near-expiry short gamma restrictions
  if (args.dte < playbook.dteRules.nearExpiryDte && !args.isLongPremium) {
    if (playbook.dteRules.maxShortGammaExposurePctNearExpiry <= 0) {
      reasons.push('near_expiry_short_gamma_blocked');
      riskScore += 0.4;
    }
  }

  // 5. Earnings blackout
  if (inEarningsBlackout(args.earnings.daysToEarnings, playbook.earningsAndMacro.earningsBlackoutDaysBefore, playbook.earningsAndMacro.earningsBlackoutDaysAfter)) {
    reasons.push('earnings_blackout');
    riskScore += 0.3;
  }

  // 6. Macro event pause
  if (args.macro.hasMajorEventNow) {
    reasons.push('macro_event_pause');
    riskScore += 0.2;
  }

  // 7. Per-underlying concentration
  if (args.perUnderlyingRiskPct > playbook.exposure.maxPerUnderlyingRiskPct) {
    reasons.push('per_underlying_risk_cap');
    riskScore += 0.3;
  }

  // 8. Spread sanity checks (if applicable)
  if (typeof args.spreadWidth === 'number' && typeof args.proposedNetCredit === 'number') {
    if (!minCreditOK(args.proposedNetCredit, args.spreadWidth, playbook.spreadSanity.minCreditToWidthRatio)) {
      reasons.push('min_credit_ratio_failed');
      riskScore += 0.2;
    }

    if (!wingWidthSane(args.spreadWidth, args.underlyingATR, playbook.spreadSanity.minWingWidthToATR)) {
      reasons.push('wings_too_tight_vs_atr');
      riskScore += 0.2;
    }
  }

  // 9. Early exercise risk (short calls near ex-div)
  if (typeof args.extrinsicValueShortCall === 'number' &&
      typeof args.earnings.daysToExDividend === 'number' &&
      args.earnings.nextDividendCash) {

    const risky = shortCallEarlyExerciseLikely(
      args.extrinsicValueShortCall,
      args.earnings.nextDividendCash,
      args.earnings.daysToExDividend
    );
    if (risky) {
      reasons.push('early_exercise_risk_exdiv');
      riskScore += 0.4;
    }
  }

  // 10. Pin risk near expiration
  if (typeof args.hoursToExpiry === 'number') {
    const spotPrice = args.quote.last ?? (args.quote.bid + args.quote.ask) / 2;
    const pinRisk = pinRiskLevel(spotPrice, args.contract.strikePrice, args.hoursToExpiry);

    if (pinRisk === 'high') {
      reasons.push('pin_risk_high');
      riskScore += 0.3;
    } else if (pinRisk === 'med') {
      reasons.push('pin_risk_medium');
      riskScore += 0.1;
    }
  }

  // 11. Portfolio Greeks limit checks with IV regime scaling
  const adjustedVega = adjustedVegaLimit(
    playbook.portfolioGreeksLimits.baseMaxVega,
    args.portfolioIvRank,
    playbook.portfolioGreeksLimits.lowIvRankThreshold,
    playbook.portfolioGreeksLimits.highIvRankThreshold,
    playbook.portfolioGreeksLimits.vegaLimitScalerByIvRankLow,
    playbook.portfolioGreeksLimits.vegaLimitScalerByIvRankHigh
  );

  if (Math.abs(args.portfolioGreeks.totalVega) > adjustedVega) {
    reasons.push('portfolio_vega_limit');
    riskScore += 0.2;
  }

  if (Math.abs(args.portfolioGreeks.totalDelta) > playbook.portfolioGreeksLimits.baseMaxDelta) {
    reasons.push('portfolio_delta_limit');
    riskScore += 0.2;
  }

  if (Math.abs(args.portfolioGreeks.totalGamma) > playbook.portfolioGreeksLimits.baseMaxGamma) {
    reasons.push('portfolio_gamma_limit');
    riskScore += 0.3;
  }

  const approved = reasons.length === 0;
  const finalRiskScore = Math.min(riskScore, 1.0);

  return { approved, reasons, riskScore: finalRiskScore };
}

// Enhanced playbook configuration
export const PRODUCTION_ENHANCED_PLAYBOOK: EnhancedPlaybook = {
  liquidity: {
    minOpenInterest: 500,
    minVolume: 50,
    maxSpreadPct: 0.03,        // 3% max bid-ask spread
    minMidPrice: 0.10,
    maxNbboAgeMs: 500          // 500ms max quote age
  },
  exposure: {
    maxTotalOptionsExposure: 0.25,     // 25% of equity
    maxSingleOptionsExposure: 0.05,    // 5% per position
    maxPerUnderlyingRiskPct: 0.05      // 5% per underlying
  },
  portfolioGreeksLimits: {
    baseMaxDelta: 200,
    baseMaxGamma: 20,
    baseMaxTheta: -100,
    baseMaxVega: 400,
    vegaLimitScalerByIvRankHigh: 0.6,  // Cut vega limits in high IV
    vegaLimitScalerByIvRankLow: 1.2,   // Expand vega limits in low IV
    highIvRankThreshold: 70,
    lowIvRankThreshold: 30
  },
  ivRankRules: {
    longPremiumMaxIvRank: 70,          // Don't buy above 70th percentile
    shortPremiumMinIvRank: 30          // Don't sell below 30th percentile
  },
  dteRules: {
    minDte: 14,
    maxDte: 60,
    nearExpiryDte: 7,
    maxShortGammaExposurePctNearExpiry: 0.02  // <2% equity in short gamma <7 DTE
  },
  earningsAndMacro: {
    earningsBlackoutDaysBefore: 2,
    earningsBlackoutDaysAfter: 1,
    macroPauseMinutes: 60
  },
  spreadSanity: {
    minCreditToWidthRatio: 0.30,       // 30% min credit/width
    minWingWidthToATR: 1.0,            // Wings 1x ATR apart minimum
    gapBuffer: 1.20                    // 20% extra risk buffer
  },
  circuitBreakers: {
    cautiousDrawdownPct: 0.02,         // 2% loss = cautious mode
    haltDrawdownPct: 0.04              // 4% loss = halt trading
  }
};
