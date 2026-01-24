/**
 * Options Trading Data Types and Interfaces
 * Comprehensive type definitions for options trading functionality
 */

// Core option contract representation
export interface OptionContract {
  symbol: string;           // AAPL240920C00150000 (OCC format)
  underlyingSymbol: string; // AAPL
  contractType: 'call' | 'put';
  strikePrice: number;
  expirationDate: Date;
  multiplier: number;       // Usually 100 shares per contract
  exchange: string;
}

// Greeks calculations
export interface Greeks {
  delta: number;    // Price sensitivity to underlying
  gamma: number;    // Delta sensitivity to underlying
  theta: number;    // Time decay per day
  vega: number;     // IV sensitivity
  rho: number;      // Interest rate sensitivity
}

// Options market data with Greeks and pricing info
export interface OptionQuote {
  contract: OptionContract;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  intrinsicValue: number;
  timeValue: number;
  bidSize?: number;
  askSize?: number;
  timestamp: Date;
}

// Options-specific order extending base NewOrder
export interface OptionOrder {
  symbol: string;               // Option symbol (OCC format)
  underlyingSymbol: string;     // Underlying stock symbol
  side: "buy" | "sell";
  qty: number;
  type: "limit" | "market" | "marketable_limit";
  limitPrice?: number;
  stopLoss?: number;
  timeInForce?: "day" | "gtc" | "ioc" | "fok";
  assetClass: 'option';
  contract: OptionContract;
  strategy?: OptionsStrategy;
  // Options-specific fields
  openClose: 'open' | 'close';  // Opening or closing position
  priceBandBps?: number;
  useBestBidOffer?: boolean;
}

// Options position extending base BrokerPosition
export interface OptionPosition {
  symbol: string;               // Option symbol
  underlyingSymbol: string;     // Underlying stock symbol
  qty: number;
  avgEntryPrice: number;
  marketValue: number;
  costBasis: number;
  unrealizedPl: number;
  unrealizedPlpc: number;
  side: "long" | "short";
  assetClass: 'option';

  // Options-specific fields
  contract: OptionContract;
  optionType: 'call' | 'put';
  strike: number;
  expiration: Date;
  daysToExpiration: number;
  impliedVolatility: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  intrinsicValue: number;
  timeValue: number;

  // Risk metrics
  assignmentRisk: AssignmentRisk;
  liquidationPriority?: number;  // For expiration management
}

// Options strategies enumeration
export enum OptionsStrategy {
  // Single leg strategies
  LONG_CALL = 'long_call',
  LONG_PUT = 'long_put',
  SHORT_CALL = 'short_call',
  SHORT_PUT = 'short_put',

  // Stock + option strategies
  COVERED_CALL = 'covered_call',
  PROTECTIVE_PUT = 'protective_put',
  CASH_SECURED_PUT = 'cash_secured_put',
  COLLAR = 'collar',

  // Volatility strategies
  LONG_STRADDLE = 'long_straddle',
  SHORT_STRADDLE = 'short_straddle',
  LONG_STRANGLE = 'long_strangle',
  SHORT_STRANGLE = 'short_strangle',

  // Spread strategies
  BULL_CALL_SPREAD = 'bull_call_spread',
  BEAR_CALL_SPREAD = 'bear_call_spread',
  BULL_PUT_SPREAD = 'bull_put_spread',
  BEAR_PUT_SPREAD = 'bear_put_spread',

  // Advanced strategies
  IRON_CONDOR = 'iron_condor',
  IRON_BUTTERFLY = 'iron_butterfly',
  LONG_BUTTERFLY = 'long_butterfly',
  SHORT_BUTTERFLY = 'short_butterfly',
  CALENDAR_SPREAD = 'calendar_spread'
}

// Individual leg of a multi-leg strategy
export interface StrategyLeg {
  action: 'buy' | 'sell';
  contract: OptionContract;
  quantity: number;
  orderType: 'market' | 'limit';
  price?: number;
  filled?: boolean;
  fillPrice?: number;
}

// Multi-leg strategy definition
export interface MultiLegStrategy {
  strategy: OptionsStrategy;
  legs: StrategyLeg[];
  underlyingSymbol: string;
  netDebit?: number;      // If strategy costs money
  netCredit?: number;     // If strategy brings in money
  maxProfit: number;
  maxLoss: number;
  breakeven: number[];    // Can have multiple breakeven points
  profitProbability: number;

  // Risk metrics
  totalDelta: number;
  totalGamma: number;
  totalTheta: number;
  totalVega: number;

  // Execution
  status: 'pending' | 'partial' | 'filled' | 'cancelled' | 'rejected';
  submittedAt?: Date;
  filledAt?: Date;

  // Management
  profitTarget?: number;
  stopLoss?: number;
  daysToManage?: number;  // Close position X days before expiration
}

// Options trading signal
export interface OptionTradingSignal {
  underlyingSymbol: string;
  strategy: OptionsStrategy;
  contracts: OptionContract[];
  recommendation: 'buy' | 'sell' | 'hold' | 'close';
  confidence: number;     // 0-1 scale
  expectedProfit: number;
  maxLoss: number;
  successProbability: number;

  // Analysis basis
  technicalBasis: string;
  volatilityAnalysis: {
    historicalVolatility: number;
    impliedVolatility: number;
    volatilityRank: number;
    ivSkew: number;
  };

  // Timing
  optimalEntry: Date;
  profitTarget?: number;
  stopLoss?: number;
  expirationDate: Date;
  daysToExpiration: number;

  // Greeks exposure
  deltaExposure: number;
  gammaExposure: number;
  thetaExposure: number;
  vegaExposure: number;

  timestamp: Date;
}

// Assignment risk assessment
export interface AssignmentRisk {
  probability: number;    // 0-1 scale
  level: 'low' | 'medium' | 'high' | 'imminent';
  factors: string[];      // Reasons for assignment risk
  daysToExpiration: number;
  moneyness: number;      // How far ITM/OTM (strike - underlying price)
  earlyAssignmentRisk: boolean;
  dividendRisk: boolean;  // Risk from upcoming dividend
  recommendation: 'hold' | 'close' | 'roll' | 'exercise';
}

// Expiration warning for positions nearing expiration
export interface ExpirationWarning {
  position: OptionPosition;
  daysToExpiration: number;
  warningLevel: 'info' | 'warning' | 'critical';
  recommendedAction: 'close' | 'roll' | 'exercise' | 'let_expire';
  assignmentRisk: AssignmentRisk;
  autoAction?: {
    action: 'close' | 'exercise';
    trigger: 'days_to_expiration' | 'assignment_risk' | 'liquidity';
    threshold: number;
  };
}

// Portfolio Greeks aggregation
export interface PortfolioGreeks {
  totalDelta: number;
  totalGamma: number;
  totalTheta: number;     // Daily theta decay
  totalVega: number;
  totalRho: number;

  // Risk metrics
  deltaExposure: number;  // As % of portfolio
  gammaRisk: number;      // Gamma exposure as % of portfolio
  thetaDecay: number;     // Daily time decay in $
  vegaExposure: number;   // IV exposure as % of portfolio

  // By expiration
  greeksByExpiration: Map<string, Greeks>; // Date -> Greeks

  // By underlying
  greeksByUnderlying: Map<string, Greeks>; // Symbol -> Greeks

  calculatedAt: Date;
}

// Volatility analysis result
export interface VolatilityAnalysis {
  symbol: string;
  historicalVolatility: {
    hv10: number;   // 10-day HV
    hv20: number;   // 20-day HV
    hv30: number;   // 30-day HV
    hv60: number;   // 60-day HV
  };
  impliedVolatility: {
    currentIV: number;
    ivRank: number;         // 0-100 percentile
    ivPercentile: number;   // 0-100 percentile
  };
  volatilitySkew: {
    callSkew: number[];     // IV by strike for calls
    putSkew: number[];      // IV by strike for puts
    termStructure: number[]; // IV by expiration
  };
  recommendation: 'buy_vol' | 'sell_vol' | 'neutral';
  confidence: number;
  updatedAt: Date;
}

// Options-specific market condition analysis
export interface OptionsMarketCondition {
  underlyingTrend: 'bullish' | 'bearish' | 'sideways';
  volatilityEnvironment: 'low' | 'normal' | 'high' | 'extreme';
  timeToEarnings?: number; // Days until next earnings
  dividendDate?: Date;
  expectedMove: number;    // Expected price move based on straddle
  supportLevels: number[];
  resistanceLevels: number[];

  // Options-specific indicators
  putCallRatio: number;
  maxPain: number;        // Price with max option pain
  gammaLevels: number[];  // Key gamma levels

  recommendedStrategies: OptionsStrategy[];
  timestamp: Date;
}

// Options order result
export interface OptionOrderResult {
  success: boolean;
  orderId?: string;
  filledQuantity: number;
  avgFillPrice?: number;
  totalCost: number;
  commission: number;
  error?: string;
  warnings?: string[];

  // Updated position info
  newPosition?: OptionPosition;
  updatedPortfolioGreeks?: PortfolioGreeks;
}

// Configuration for options trading
export interface OptionsConfig {
  enabled: boolean;
  maxAllocation: number;          // Max % of portfolio in options
  maxSinglePosition: number;      // Max $ per option position
  minDaysToExpiration: number;    // Don't trade options < X days to expiry
  maxDaysToExpiration: number;    // Don't trade options > X days to expiry
  autoCloseAtDTE: number;         // Auto close positions at X DTE

  // Greeks limits
  maxDelta: number;               // Max portfolio delta exposure
  maxGamma: number;               // Max portfolio gamma exposure
  maxVega: number;                // Max portfolio vega exposure
  maxTheta: number;               // Max daily theta decay

  // IV limits
  maxIVToBuy: number;            // Don't buy options above X IV
  minIVToSell: number;           // Don't sell options below X IV

  // Strategy preferences
  preferredStrategies: OptionsStrategy[];
  allowedStrategies: OptionsStrategy[];

  // Risk management
  profitTarget: number;           // Close at X% profit
  stopLoss: number;              // Close at X% loss
  autoManagePositions: boolean;

  // Liquidity requirements
  minVolume: number;             // Minimum daily volume
  minOpenInterest: number;       // Minimum open interest
  maxBidAskSpread: number;       // Max bid-ask spread as % of mid
}
