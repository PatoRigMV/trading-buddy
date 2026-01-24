import { RiskManager, RiskLimits, Position, TradeRiskAssessment } from './risk';
import {
  OptionContract,
  OptionPosition,
  Greeks,
  OptionsStrategy,
  MultiLegStrategy,
  OptionOrder
} from '../types/options';

export interface OptionsRiskLimits extends RiskLimits {
  // Options-specific risk limits
  maxTotalOptionsExposure: number;        // % max exposure to options (e.g., 0.30 = 30%)
  maxSingleOptionsExposure: number;       // % max single options position (e.g., 0.05 = 5%)
  maxOptionsPositions: number;            // Max concurrent options positions

  // Greeks limits
  maxPortfolioDelta: number;              // Max net delta exposure (e.g., 100 = $100 per $1 move)
  maxPortfolioGamma: number;              // Max net gamma exposure
  maxPortfolioTheta: number;              // Max daily theta decay tolerance (negative)
  maxPortfolioVega: number;               // Max IV sensitivity

  // Strategy-specific limits
  maxLongPremium: number;                 // Max premium paid for long options (% of portfolio)
  maxShortPremium: number;                // Max short premium exposure (% of portfolio)
  maxNakedShortExposure: number;          // Max naked short options exposure

  // Expiration risk management
  minDaysToExpiration: number;            // Min days to expiration for new positions (e.g., 7)
  maxNearExpirationExposure: number;      // Max exposure to options expiring within 7 days

  // IV and volatility limits
  maxIVPercentile: number;                // Max IV percentile to buy options (e.g., 0.80 = 80th percentile)
  minIVPercentile: number;                // Min IV percentile to sell options (e.g., 0.60 = 60th percentile)

  // Assignment risk
  maxAssignmentRisk: number;              // Max exposure to potential assignment (% of portfolio)
  maxEarningsExposure: number;            // Max exposure through earnings announcements

  // Capital requirements
  optionsMarginBuffer: number;            // Extra margin buffer for options (e.g., 1.2 = 20% buffer)
  maxBuyingPowerUsed: number;             // Max % of buying power used for options
}

export interface OptionsRiskMetrics {
  // Portfolio Greeks
  totalDelta: number;
  totalGamma: number;
  totalTheta: number;
  totalVega: number;
  totalRho: number;

  // Exposure metrics
  totalOptionsExposure: number;           // Total options exposure ($)
  totalOptionsExposurePercent: number;    // As % of portfolio
  longPremiumExposure: number;            // Total long premium
  shortPremiumExposure: number;           // Total short premium exposure

  // Expiration metrics
  nearExpirationExposure: number;         // Exposure expiring within 7 days
  nearExpirationCount: number;            // Number of positions expiring soon
  averageDaysToExpiration: number;        // Weighted average DTE

  // Risk concentrations
  largestSingleOptionsPosition: number;   // Largest single options position value
  maxSymbolOptionsExposure: number;       // Largest per-symbol options exposure

  // IV and assignment risk
  avgImpliedVolatility: number;           // Weighted average IV
  assignmentRisk: number;                 // Total potential assignment risk
  earningsExposure: number;               // Exposure through earnings

  // Capital metrics
  totalMarginUsed: number;                // Total margin used for options
  marginUtilization: number;              // % of available margin used
  buyingPowerUsed: number;                // Total buying power used
}

export class OptionsRiskManager extends RiskManager {
  private optionsLimits: OptionsRiskLimits;

  constructor(limits: OptionsRiskLimits, startOfDayValue: number) {
    super(limits, startOfDayValue);
    this.optionsLimits = limits;
  }

  /**
   * Assess options trade risk
   */
  assessOptionsTrade(
    order: OptionOrder,
    currentPositions: Position[],
    currentOptionsPositions: OptionPosition[],
    portfolioValue: number,
    buyingPower: number,
    underlyingPrice?: number
  ): TradeRiskAssessment {

    // First run standard risk checks
    const baseAssessment = this.assessTrade(
      order.contract.underlyingSymbol,
      order.side === 'buy_to_open' || order.side === 'buy_to_close' ? 'buy' : 'sell',
      order.quantity,
      order.price,
      currentPositions,
      portfolioValue
    );

    if (!baseAssessment.approved) {
      return baseAssessment;
    }

    // Options-specific risk checks
    const optionsMetrics = this.calculateOptionsRiskMetrics(
      currentOptionsPositions,
      portfolioValue,
      buyingPower
    );

    // 1. Check options exposure limits
    const exposureCheck = this.checkOptionsExposure(order, optionsMetrics, portfolioValue);
    if (!exposureCheck.approved) return exposureCheck;

    // 2. Check Greeks limits
    const greeksCheck = this.checkGreeksLimits(order, optionsMetrics);
    if (!greeksCheck.approved) return greeksCheck;

    // 3. Check expiration risk
    const expirationCheck = this.checkExpirationRisk(order, optionsMetrics);
    if (!expirationCheck.approved) return expirationCheck;

    // 4. Check IV conditions
    const ivCheck = this.checkIVConditions(order);
    if (!ivCheck.approved) return ivCheck;

    // 5. Check assignment risk
    const assignmentCheck = this.checkAssignmentRisk(order, optionsMetrics, portfolioValue, underlyingPrice);
    if (!assignmentCheck.approved) return assignmentCheck;

    // 6. Check capital requirements
    const capitalCheck = this.checkCapitalRequirements(order, buyingPower, portfolioValue);
    if (!capitalCheck.approved) return capitalCheck;

    return { approved: true };
  }

  /**
   * Assess multi-leg strategy risk
   */
  assessMultiLegStrategy(
    strategy: MultiLegStrategy,
    currentPositions: Position[],
    currentOptionsPositions: OptionPosition[],
    portfolioValue: number,
    buyingPower: number
  ): TradeRiskAssessment {

    // Calculate net Greeks and exposure for the entire strategy
    const netGreeks = this.calculateStrategyGreeks(strategy);
    const totalPremium = this.calculateStrategyPremium(strategy);
    const totalExposure = Math.abs(totalPremium);

    const optionsMetrics = this.calculateOptionsRiskMetrics(
      currentOptionsPositions,
      portfolioValue,
      buyingPower
    );

    // Check if strategy would exceed exposure limits
    const newTotalExposure = optionsMetrics.totalOptionsExposure + totalExposure;
    if (newTotalExposure / portfolioValue > this.optionsLimits.maxTotalOptionsExposure) {
      return {
        approved: false,
        reason: `Multi-leg strategy would exceed total options exposure limit: ${((newTotalExposure / portfolioValue) * 100).toFixed(1)}%`
      };
    }

    // Check Greeks impact
    if (Math.abs(optionsMetrics.totalDelta + netGreeks.delta) > this.optionsLimits.maxPortfolioDelta) {
      return {
        approved: false,
        reason: `Strategy would exceed portfolio delta limit: ${(optionsMetrics.totalDelta + netGreeks.delta).toFixed(0)}`
      };
    }

    // Check individual legs
    for (const leg of strategy.legs) {
      const legAssessment = this.assessOptionsTrade(
        {
          contract: leg.contract,
          side: leg.side,
          quantity: leg.quantity,
          price: leg.price,
          type: 'limit'
        },
        currentPositions,
        currentOptionsPositions,
        portfolioValue,
        buyingPower
      );

      if (!legAssessment.approved) {
        return {
          approved: false,
          reason: `Strategy leg ${leg.contract.symbol} rejected: ${legAssessment.reason}`
        };
      }
    }

    return { approved: true };
  }

  /**
   * Calculate comprehensive options risk metrics
   */
  calculateOptionsRiskMetrics(
    optionsPositions: OptionPosition[],
    portfolioValue: number,
    buyingPower: number
  ): OptionsRiskMetrics {

    let totalDelta = 0, totalGamma = 0, totalTheta = 0, totalVega = 0, totalRho = 0;
    let totalOptionsExposure = 0;
    let longPremiumExposure = 0;
    let shortPremiumExposure = 0;
    let nearExpirationExposure = 0;
    let nearExpirationCount = 0;
    let totalMarginUsed = 0;
    let totalDTE = 0;
    let totalIV = 0;
    let assignmentRisk = 0;
    let earningsExposure = 0;

    const symbolExposures = new Map<string, number>();
    const now = new Date();

    for (const position of optionsPositions) {
      const positionValue = Math.abs(position.quantity * position.averagePrice * 100);
      totalOptionsExposure += positionValue;

      // Greeks aggregation (multiplied by quantity and contract multiplier)
      const multiplier = position.quantity * 100;
      if (position.greeks) {
        totalDelta += position.greeks.delta * multiplier;
        totalGamma += position.greeks.gamma * multiplier;
        totalTheta += position.greeks.theta * multiplier;
        totalVega += position.greeks.vega * multiplier;
        totalRho += position.greeks.rho * multiplier;
      }

      // Long vs short premium exposure
      if (position.quantity > 0) {
        longPremiumExposure += positionValue;
      } else {
        shortPremiumExposure += positionValue;
      }

      // Expiration risk
      const daysToExpiration = Math.max(0, Math.floor(
        (position.contract.expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      ));

      if (daysToExpiration <= 7) {
        nearExpirationExposure += positionValue;
        nearExpirationCount++;
      }

      totalDTE += daysToExpiration * positionValue;
      totalIV += (position.impliedVolatility || 0) * positionValue;

      // Symbol exposure tracking
      const currentSymbolExposure = symbolExposures.get(position.contract.underlyingSymbol) || 0;
      symbolExposures.set(position.contract.underlyingSymbol, currentSymbolExposure + positionValue);

      // Assignment risk for short options
      if (position.quantity < 0 && position.contract.contractType === 'call') {
        assignmentRisk += Math.abs(positionValue);
      }

      // Margin estimation (simplified)
      if (position.quantity < 0) {
        totalMarginUsed += positionValue * 0.2; // Approximate 20% margin requirement
      }
    }

    const averageDaysToExpiration = totalOptionsExposure > 0 ? totalDTE / totalOptionsExposure : 0;
    const avgImpliedVolatility = totalOptionsExposure > 0 ? totalIV / totalOptionsExposure : 0;
    const maxSymbolOptionsExposure = Math.max(0, ...symbolExposures.values());
    const largestSingleOptionsPosition = optionsPositions.reduce(
      (max, pos) => Math.max(max, Math.abs(pos.quantity * pos.averagePrice * 100)), 0
    );

    return {
      totalDelta,
      totalGamma,
      totalTheta,
      totalVega,
      totalRho,
      totalOptionsExposure,
      totalOptionsExposurePercent: totalOptionsExposure / portfolioValue,
      longPremiumExposure,
      shortPremiumExposure,
      nearExpirationExposure,
      nearExpirationCount,
      averageDaysToExpiration,
      largestSingleOptionsPosition,
      maxSymbolOptionsExposure,
      avgImpliedVolatility,
      assignmentRisk,
      earningsExposure,
      totalMarginUsed,
      marginUtilization: totalMarginUsed / buyingPower,
      buyingPowerUsed: totalMarginUsed
    };
  }

  /**
   * Calculate optimal options position size based on Greeks and IV
   */
  calculateOptionsPositionSize(
    contract: OptionContract,
    price: number,
    greeks: Greeks,
    portfolioValue: number,
    confidenceScore: number = 0.5,
    isLongPosition: boolean = true
  ): number {

    const basePositionValue = portfolioValue * this.optionsLimits.maxSingleOptionsExposure;

    // Adjust for confidence
    const confidenceAdjustedValue = basePositionValue * Math.max(0.2, Math.min(1.0, confidenceScore));

    // Calculate position size in contracts
    const contractValue = price * 100; // Options contract multiplier
    let baseContracts = Math.floor(confidenceAdjustedValue / contractValue);

    // Adjust for Greeks risk
    if (isLongPosition) {
      // For long positions, consider theta decay
      const thetaAdjustment = Math.max(0.5, 1 - Math.abs(greeks.theta) / 10);
      baseContracts = Math.floor(baseContracts * thetaAdjustment);
    } else {
      // For short positions, be more conservative with gamma
      const gammaAdjustment = Math.max(0.3, 1 - Math.abs(greeks.gamma) / 0.05);
      baseContracts = Math.floor(baseContracts * gammaAdjustment);
    }

    // Ensure minimum position size
    return Math.max(1, baseContracts);
  }

  private checkOptionsExposure(
    order: OptionOrder,
    metrics: OptionsRiskMetrics,
    portfolioValue: number
  ): TradeRiskAssessment {

    const contractValue = order.quantity * order.price * 100;
    const newTotalExposure = metrics.totalOptionsExposure + contractValue;
    const newExposurePercent = newTotalExposure / portfolioValue;

    if (newExposurePercent > this.optionsLimits.maxTotalOptionsExposure) {
      return {
        approved: false,
        reason: `Total options exposure would exceed limit: ${(newExposurePercent * 100).toFixed(1)}% > ${(this.optionsLimits.maxTotalOptionsExposure * 100)}%`
      };
    }

    const singlePositionPercent = contractValue / portfolioValue;
    if (singlePositionPercent > this.optionsLimits.maxSingleOptionsExposure) {
      return {
        approved: false,
        reason: `Single options position would exceed limit: ${(singlePositionPercent * 100).toFixed(1)}% > ${(this.optionsLimits.maxSingleOptionsExposure * 100)}%`
      };
    }

    return { approved: true };
  }

  private checkGreeksLimits(order: OptionOrder, metrics: OptionsRiskMetrics): TradeRiskAssessment {
    if (!order.greeks) return { approved: true };

    const contractMultiplier = order.quantity * 100;
    const orderDelta = order.greeks.delta * contractMultiplier;

    if (Math.abs(metrics.totalDelta + orderDelta) > this.optionsLimits.maxPortfolioDelta) {
      return {
        approved: false,
        reason: `Portfolio delta would exceed limit: ${(metrics.totalDelta + orderDelta).toFixed(0)} > ${this.optionsLimits.maxPortfolioDelta}`
      };
    }

    const orderGamma = order.greeks.gamma * contractMultiplier;
    if (Math.abs(metrics.totalGamma + orderGamma) > this.optionsLimits.maxPortfolioGamma) {
      return {
        approved: false,
        reason: `Portfolio gamma would exceed limit: ${(metrics.totalGamma + orderGamma).toFixed(2)}`
      };
    }

    return { approved: true };
  }

  private checkExpirationRisk(order: OptionOrder, metrics: OptionsRiskMetrics): TradeRiskAssessment {
    const now = new Date();
    const daysToExpiration = Math.floor(
      (order.contract.expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysToExpiration < this.optionsLimits.minDaysToExpiration) {
      return {
        approved: false,
        reason: `Options expires too soon: ${daysToExpiration} days < ${this.optionsLimits.minDaysToExpiration} day minimum`
      };
    }

    return { approved: true };
  }

  private checkIVConditions(order: OptionOrder): TradeRiskAssessment {
    if (!order.impliedVolatility || !order.ivPercentile) return { approved: true };

    const isLong = order.side === 'buy_to_open' || order.side === 'buy_to_close';

    if (isLong && order.ivPercentile > this.optionsLimits.maxIVPercentile) {
      return {
        approved: false,
        reason: `IV too high for buying options: ${(order.ivPercentile * 100).toFixed(0)}th percentile > ${(this.optionsLimits.maxIVPercentile * 100)}th percentile limit`
      };
    }

    if (!isLong && order.ivPercentile < this.optionsLimits.minIVPercentile) {
      return {
        approved: false,
        reason: `IV too low for selling options: ${(order.ivPercentile * 100).toFixed(0)}th percentile < ${(this.optionsLimits.minIVPercentile * 100)}th percentile limit`
      };
    }

    return { approved: true };
  }

  private checkAssignmentRisk(
    order: OptionOrder,
    metrics: OptionsRiskMetrics,
    portfolioValue: number,
    underlyingPrice?: number
  ): TradeRiskAssessment {

    const isShort = order.side === 'sell_to_open';
    if (!isShort || !underlyingPrice) return { approved: true };

    const contractValue = order.quantity * order.price * 100;
    const assignmentValue = order.quantity * order.contract.strikePrice * 100;

    const newAssignmentRisk = metrics.assignmentRisk + assignmentValue;
    const assignmentRiskPercent = newAssignmentRisk / portfolioValue;

    if (assignmentRiskPercent > this.optionsLimits.maxAssignmentRisk) {
      return {
        approved: false,
        reason: `Assignment risk would exceed limit: ${(assignmentRiskPercent * 100).toFixed(1)}% > ${(this.optionsLimits.maxAssignmentRisk * 100)}%`
      };
    }

    return { approved: true };
  }

  private checkCapitalRequirements(
    order: OptionOrder,
    buyingPower: number,
    portfolioValue: number
  ): TradeRiskAssessment {

    const estimatedMargin = this.estimateMarginRequirement(order);
    const marginWithBuffer = estimatedMargin * this.optionsLimits.optionsMarginBuffer;

    if (marginWithBuffer > buyingPower * this.optionsLimits.maxBuyingPowerUsed) {
      return {
        approved: false,
        reason: `Insufficient buying power: requires ${marginWithBuffer.toFixed(0)}, available ${(buyingPower * this.optionsLimits.maxBuyingPowerUsed).toFixed(0)}`
      };
    }

    return { approved: true };
  }

  private estimateMarginRequirement(order: OptionOrder): number {
    const contractValue = order.quantity * order.price * 100;

    switch (order.side) {
      case 'buy_to_open':
      case 'buy_to_close':
        return contractValue; // Premium paid

      case 'sell_to_open':
        // Simplified margin calculation - in practice, this would be more complex
        const strikeValue = order.quantity * order.contract.strikePrice * 100;
        return Math.min(strikeValue * 0.2, contractValue * 5); // 20% of strike or 5x premium

      case 'sell_to_close':
        return 0; // Closing short position

      default:
        return contractValue;
    }
  }

  private calculateStrategyGreeks(strategy: MultiLegStrategy): Greeks {
    let totalDelta = 0, totalGamma = 0, totalTheta = 0, totalVega = 0, totalRho = 0;

    for (const leg of strategy.legs) {
      if (leg.greeks) {
        const multiplier = leg.quantity * 100;
        const sign = leg.side === 'buy_to_open' ? 1 : -1;

        totalDelta += leg.greeks.delta * multiplier * sign;
        totalGamma += leg.greeks.gamma * multiplier * sign;
        totalTheta += leg.greeks.theta * multiplier * sign;
        totalVega += leg.greeks.vega * multiplier * sign;
        totalRho += leg.greeks.rho * multiplier * sign;
      }
    }

    return { totalDelta, totalGamma, totalTheta, totalVega, totalRho };
  }

  private calculateStrategyPremium(strategy: MultiLegStrategy): number {
    let totalPremium = 0;

    for (const leg of strategy.legs) {
      const legValue = leg.quantity * leg.price * 100;
      const sign = leg.side === 'buy_to_open' ? -1 : 1; // Buying costs money, selling receives money
      totalPremium += legValue * sign;
    }

    return totalPremium;
  }

  /**
   * Get current options trading mode based on metrics
   */
  getOptionsTradingMode(metrics: OptionsRiskMetrics): 'normal' | 'cautious' | 'halt' {
    const baseMode = this.getTradingMode();

    // Additional options-specific restrictions
    if (metrics.totalOptionsExposurePercent > this.optionsLimits.maxTotalOptionsExposure * 0.9) {
      return 'cautious';
    }

    if (metrics.nearExpirationCount > 5 || metrics.marginUtilization > 0.8) {
      return 'cautious';
    }

    return baseMode;
  }
}
