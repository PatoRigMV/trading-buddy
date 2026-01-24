/**
 * Options Analysis Engine
 * Analyzes options opportunities, finds optimal strikes/expirations,
 * calculates risk/reward, and generates trading signals
 */

import {
  OptionContract,
  OptionQuote,
  OptionsStrategy,
  OptionTradingSignal,
  MultiLegStrategy,
  StrategyLeg,
  VolatilityAnalysis,
  OptionsMarketCondition,
  Greeks
} from '../types/options';
import { OptionsMarketDataProvider } from '../data/AlpacaOptionsData';
import { TechnicalIndicators } from '../engine/indicators';

// Define TechnicalAnalysis interface
interface TechnicalAnalysis {
  signal: 'bullish' | 'bearish' | 'neutral';
  strength: number; // 0-1 scale
  supportLevels: number[];
  resistanceLevels: number[];
  trend: 'up' | 'down' | 'sideways';
}

export interface StrategyOpportunity {
  strategy: OptionsStrategy;
  underlyingSymbol: string;
  contracts: OptionContract[];
  expectedProfit: number;
  maxLoss: number;
  successProbability: number;
  confidence: number;
  reasoning: string;
  breakevens: number[];

  // Risk metrics
  greeksExposure: Greeks;
  capitalRequired: number;
  returnOnCapital: number;

  // Timing
  optimalEntry: Date;
  targetExit?: Date;
  maxHoldDays: number;

  // Market conditions favoring this strategy
  favorableConditions: string[];
}

export interface OptionsAnalysisConfig {
  // Strategy preferences
  enabledStrategies: OptionsStrategy[];
  minProbabilityOfProfit: number;
  minReturnOnCapital: number;
  maxCapitalAtRisk: number;

  // Volatility preferences
  minIVRank: number;      // Buy strategies need low IV rank
  maxIVRank: number;      // Sell strategies need high IV rank

  // Time preferences
  minDaysToExpiration: number;
  maxDaysToExpiration: number;
  preferredDTE: number;   // Target days to expiration

  // Greeks limits
  maxDeltaExposure: number;
  maxVegaExposure: number;
  maxThetaExposure: number;

  // Technical analysis integration
  useTechnicalAnalysis: boolean;
  technicalWeight: number; // 0-1, weight of technical vs options analysis
}

export class OptionsAnalyzer {
  constructor(
    private marketData: OptionsMarketDataProvider,
    private config: OptionsAnalysisConfig
  ) {}

  /**
   * Analyze options opportunities for a given underlying
   */
  async analyzeOptionOpportunities(
    underlyingSymbol: string,
    technicalAnalysis?: TechnicalAnalysis
  ): Promise<OptionTradingSignal[]> {
    console.log(`🔍 Analyzing options opportunities for ${underlyingSymbol}...`);

    try {
      // Get current market conditions
      const [underlyingPrice, volatilityAnalysis, marketCondition] = await Promise.all([
        this.marketData.getCurrentPrice(underlyingSymbol),
        this.marketData.analyzeVolatility(underlyingSymbol),
        this.marketData.getOptionsMarketCondition(underlyingSymbol)
      ]);

      // Get option chain for analysis
      const optionChain = await this.getAnalysisOptionChain(underlyingSymbol, underlyingPrice);

      if (optionChain.length === 0) {
        console.warn(`No options found for ${underlyingSymbol}`);
        return [];
      }

      // Analyze opportunities for each enabled strategy
      const opportunities: StrategyOpportunity[] = [];

      for (const strategy of this.config.enabledStrategies) {
        try {
          const strategyOpportunities = await this.analyzeStrategy(
            strategy,
            underlyingSymbol,
            underlyingPrice,
            optionChain,
            volatilityAnalysis,
            marketCondition,
            technicalAnalysis
          );
          opportunities.push(...strategyOpportunities);
        } catch (error) {
          console.warn(`Failed to analyze ${strategy} for ${underlyingSymbol}:`, error);
        }
      }

      // Convert opportunities to trading signals
      const signals = opportunities
        .filter(opp => this.meetsFilterCriteria(opp))
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 5) // Top 5 opportunities
        .map(opp => this.convertToTradingSignal(opp, volatilityAnalysis));

      console.log(`✅ Found ${signals.length} options opportunities for ${underlyingSymbol}`);
      return signals;

    } catch (error) {
      console.error(`❌ Failed to analyze options for ${underlyingSymbol}:`, error);
      return [];
    }
  }

  /**
   * Find optimal strike price and expiration for a strategy
   */
  async findOptimalStrikeAndExpiration(
    underlyingPrice: number,
    priceTarget: number,
    timeframe: number,
    strategy: OptionsStrategy,
    underlyingSymbol: string
  ): Promise<{ strike: number; expiration: Date; probability: number }> {
    // Calculate optimal strike based on strategy
    let optimalStrike: number;

    switch (strategy) {
      case OptionsStrategy.LONG_CALL:
        // For long calls, slightly OTM for max leverage
        optimalStrike = this.roundToStrike(priceTarget * 0.95);
        break;
      case OptionsStrategy.LONG_PUT:
        // For long puts, slightly OTM
        optimalStrike = this.roundToStrike(priceTarget * 1.05);
        break;
      case OptionsStrategy.COVERED_CALL:
        // For covered calls, slightly OTM
        optimalStrike = this.roundToStrike(underlyingPrice * 1.03);
        break;
      case OptionsStrategy.CASH_SECURED_PUT:
        // For CSPs, at or below current price
        optimalStrike = this.roundToStrike(underlyingPrice * 0.97);
        break;
      default:
        optimalStrike = this.roundToStrike(underlyingPrice);
    }

    // Calculate optimal expiration (add buffer to timeframe)
    const bufferDays = Math.max(7, timeframe * 0.2);
    const optimalExpiration = new Date(Date.now() + (timeframe + bufferDays) * 24 * 60 * 60 * 1000);

    // Calculate probability of success
    const probability = await this.calculateSuccessProbability(
      underlyingPrice,
      priceTarget,
      timeframe,
      strategy,
      optimalStrike
    );

    return {
      strike: optimalStrike,
      expiration: optimalExpiration,
      probability
    };
  }

  /**
   * Calculate comprehensive risk/reward for a strategy
   */
  async calculateRiskReward(strategy: MultiLegStrategy): Promise<{
    maxProfit: number;
    maxLoss: number;
    breakevens: number[];
    profitProbability: number;
    returnOnCapital: number;
  }> {
    let maxProfit = 0;
    let maxLoss = 0;
    let breakevens: number[] = [];

    // Get current underlying price
    const underlyingPrice = await this.marketData.getCurrentPrice(strategy.underlyingSymbol);

    // Calculate P&L at various price points
    const priceRange = this.generatePriceRange(underlyingPrice);
    const pnlCurve: Array<{ price: number; pnl: number }> = [];

    for (const price of priceRange) {
      const pnl = await this.calculatePnLAtPrice(strategy, price);
      pnlCurve.push({ price, pnl });

      maxProfit = Math.max(maxProfit, pnl);
      maxLoss = Math.min(maxLoss, pnl);

      // Find breakeven points (where P&L crosses zero)
      if (pnlCurve.length > 1) {
        const prev = pnlCurve[pnlCurve.length - 2];
        const curr = pnlCurve[pnlCurve.length - 1];

        if ((prev.pnl <= 0 && curr.pnl > 0) || (prev.pnl > 0 && curr.pnl <= 0)) {
          // Linear interpolation to find exact breakeven
          const breakeven = prev.price +
            (0 - prev.pnl) * (curr.price - prev.price) / (curr.pnl - prev.pnl);
          breakevens.push(breakeven);
        }
      }
    }

    // Calculate probability of profit
    const profitProbability = await this.calculateProfitProbability(
      strategy,
      underlyingPrice,
      pnlCurve
    );

    // Calculate return on capital
    const capitalAtRisk = Math.abs(maxLoss);
    const returnOnCapital = capitalAtRisk > 0 ? maxProfit / capitalAtRisk : 0;

    return {
      maxProfit,
      maxLoss,
      breakevens,
      profitProbability,
      returnOnCapital
    };
  }

  /**
   * Analyze volatility patterns and trading opportunities
   */
  async analyzeVolatility(
    underlyingSymbol: string,
    historicalDays: number = 30
  ): Promise<VolatilityAnalysis> {
    return await this.marketData.analyzeVolatility(underlyingSymbol);
  }

  // Private helper methods

  private async getAnalysisOptionChain(
    underlyingSymbol: string,
    underlyingPrice: number
  ): Promise<OptionContract[]> {
    // Get options for next 3 expirations
    const expirations = this.getNextExpirations(3);

    // Define strike range around current price
    const strikeRange = {
      min: underlyingPrice * 0.8,
      max: underlyingPrice * 1.2
    };

    const allContracts: OptionContract[] = [];

    for (const expiration of expirations) {
      try {
        const contracts = await this.marketData.getOptionChain(
          underlyingSymbol,
          expiration,
          strikeRange
        );
        allContracts.push(...contracts);
      } catch (error) {
        console.warn(`Failed to get option chain for ${expiration}:`, error);
      }
    }

    return allContracts;
  }

  private async analyzeStrategy(
    strategy: OptionsStrategy,
    underlyingSymbol: string,
    underlyingPrice: number,
    optionChain: OptionContract[],
    volatilityAnalysis: VolatilityAnalysis,
    marketCondition: OptionsMarketCondition,
    technicalAnalysis?: TechnicalAnalysis
  ): Promise<StrategyOpportunity[]> {

    switch (strategy) {
      case OptionsStrategy.LONG_CALL:
        return await this.analyzeLongCall(
          underlyingSymbol, underlyingPrice, optionChain, volatilityAnalysis, technicalAnalysis
        );

      case OptionsStrategy.LONG_PUT:
        return await this.analyzeLongPut(
          underlyingSymbol, underlyingPrice, optionChain, volatilityAnalysis, technicalAnalysis
        );

      case OptionsStrategy.COVERED_CALL:
        return await this.analyzeCoveredCall(
          underlyingSymbol, underlyingPrice, optionChain, volatilityAnalysis
        );

      case OptionsStrategy.CASH_SECURED_PUT:
        return await this.analyzeCashSecuredPut(
          underlyingSymbol, underlyingPrice, optionChain, volatilityAnalysis
        );

      case OptionsStrategy.BULL_CALL_SPREAD:
        return await this.analyzeBullCallSpread(
          underlyingSymbol, underlyingPrice, optionChain, volatilityAnalysis, technicalAnalysis
        );

      case OptionsStrategy.IRON_CONDOR:
        return await this.analyzeIronCondor(
          underlyingSymbol, underlyingPrice, optionChain, volatilityAnalysis, marketCondition
        );

      default:
        console.warn(`Strategy ${strategy} not implemented yet`);
        return [];
    }
  }

  private async analyzeLongCall(
    underlyingSymbol: string,
    underlyingPrice: number,
    optionChain: OptionContract[],
    volatilityAnalysis: VolatilityAnalysis,
    technicalAnalysis?: TechnicalAnalysis
  ): Promise<StrategyOpportunity[]> {
    const opportunities: StrategyOpportunity[] = [];

    // Filter for calls that are slightly OTM
    const targetCalls = optionChain.filter(contract =>
      contract.contractType === 'call' &&
      contract.strikePrice > underlyingPrice &&
      contract.strikePrice <= underlyingPrice * 1.1 &&
      this.getDaysToExpiration(contract.expirationDate) >= this.config.minDaysToExpiration &&
      this.getDaysToExpiration(contract.expirationDate) <= this.config.maxDaysToExpiration
    );

    for (const contract of targetCalls) {
      try {
        const quote = await this.marketData.getOptionQuote(contract.symbol);

        // Check if IV is reasonable for buying
        if (quote.impliedVolatility > volatilityAnalysis.impliedVolatility.ivRank / 100 + 0.5) {
          continue; // IV too high for buying
        }

        const daysToExpiry = this.getDaysToExpiration(contract.expirationDate);
        const costBasis = quote.ask * contract.multiplier;

        // Calculate potential profit (assuming 20% move)
        const targetPrice = underlyingPrice * 1.2;
        const intrinsicAtTarget = Math.max(0, targetPrice - contract.strikePrice);
        const potentialProfit = intrinsicAtTarget * contract.multiplier - costBasis;

        if (potentialProfit <= 0) continue;

        // Calculate success probability
        const successProbability = await this.calculateCallSuccessProbability(
          underlyingPrice,
          contract.strikePrice,
          daysToExpiry,
          volatilityAnalysis.historicalVolatility.hv20
        );

        // Calculate confidence based on technical and options factors
        let confidence = 0.4; // Base confidence

        if (technicalAnalysis) {
          if (technicalAnalysis.trend === 'bullish') confidence += 0.2;
          if (technicalAnalysis.momentum > 0.6) confidence += 0.1;
        }

        if (volatilityAnalysis.impliedVolatility.ivRank < 30) confidence += 0.1;
        if (quote.delta > 0.3 && quote.delta < 0.7) confidence += 0.1; // Sweet spot
        if (successProbability > 0.4) confidence += 0.1;

        const opportunity: StrategyOpportunity = {
          strategy: OptionsStrategy.LONG_CALL,
          underlyingSymbol,
          contracts: [contract],
          expectedProfit: potentialProfit,
          maxLoss: -costBasis,
          successProbability,
          confidence: Math.min(confidence, 1.0),
          reasoning: `Bullish call option with ${(successProbability * 100).toFixed(1)}% success probability. IV rank: ${volatilityAnalysis.impliedVolatility.ivRank}`,
          breakevens: [contract.strikePrice + (quote.ask)],

          greeksExposure: {
            delta: quote.delta,
            gamma: quote.gamma,
            theta: quote.theta,
            vega: quote.vega,
            rho: quote.rho
          },

          capitalRequired: costBasis,
          returnOnCapital: potentialProfit / costBasis,
          optimalEntry: new Date(),
          maxHoldDays: Math.floor(daysToExpiry * 0.75),
          favorableConditions: [
            'Bullish technical setup',
            'Low implied volatility',
            'Positive momentum'
          ]
        };

        opportunities.push(opportunity);

      } catch (error) {
        console.warn(`Failed to analyze call option ${contract.symbol}:`, error);
      }
    }

    return opportunities.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
  }

  private async analyzeLongPut(
    underlyingSymbol: string,
    underlyingPrice: number,
    optionChain: OptionContract[],
    volatilityAnalysis: VolatilityAnalysis,
    technicalAnalysis?: TechnicalAnalysis
  ): Promise<StrategyOpportunity[]> {
    // Similar to long call but for bearish moves
    const opportunities: StrategyOpportunity[] = [];

    const targetPuts = optionChain.filter(contract =>
      contract.contractType === 'put' &&
      contract.strikePrice < underlyingPrice &&
      contract.strikePrice >= underlyingPrice * 0.9 &&
      this.getDaysToExpiration(contract.expirationDate) >= this.config.minDaysToExpiration
    );

    for (const contract of targetPuts) {
      try {
        const quote = await this.marketData.getOptionQuote(contract.symbol);

        if (quote.impliedVolatility > volatilityAnalysis.impliedVolatility.ivRank / 100 + 0.5) {
          continue;
        }

        const daysToExpiry = this.getDaysToExpiration(contract.expirationDate);
        const costBasis = quote.ask * contract.multiplier;

        // Calculate potential profit (assuming 20% drop)
        const targetPrice = underlyingPrice * 0.8;
        const intrinsicAtTarget = Math.max(0, contract.strikePrice - targetPrice);
        const potentialProfit = intrinsicAtTarget * contract.multiplier - costBasis;

        if (potentialProfit <= 0) continue;

        let confidence = 0.4;

        if (technicalAnalysis) {
          if (technicalAnalysis.trend === 'bearish') confidence += 0.2;
          if (technicalAnalysis.momentum < -0.6) confidence += 0.1;
        }

        const opportunity: StrategyOpportunity = {
          strategy: OptionsStrategy.LONG_PUT,
          underlyingSymbol,
          contracts: [contract],
          expectedProfit: potentialProfit,
          maxLoss: -costBasis,
          successProbability: 0.35, // Conservative estimate
          confidence: Math.min(confidence, 1.0),
          reasoning: `Bearish put option for downside protection or profit`,
          breakevens: [contract.strikePrice - quote.ask],

          greeksExposure: {
            delta: quote.delta,
            gamma: quote.gamma,
            theta: quote.theta,
            vega: quote.vega,
            rho: quote.rho
          },

          capitalRequired: costBasis,
          returnOnCapital: potentialProfit / costBasis,
          optimalEntry: new Date(),
          maxHoldDays: Math.floor(daysToExpiry * 0.75),
          favorableConditions: [
            'Bearish technical setup',
            'High volatility expected',
            'Defensive positioning'
          ]
        };

        opportunities.push(opportunity);

      } catch (error) {
        console.warn(`Failed to analyze put option ${contract.symbol}:`, error);
      }
    }

    return opportunities.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
  }

  private async analyzeCoveredCall(
    underlyingSymbol: string,
    underlyingPrice: number,
    optionChain: OptionContract[],
    volatilityAnalysis: VolatilityAnalysis
  ): Promise<StrategyOpportunity[]> {
    // Covered calls: Own stock + sell call
    const opportunities: StrategyOpportunity[] = [];

    const targetCalls = optionChain.filter(contract =>
      contract.contractType === 'call' &&
      contract.strikePrice > underlyingPrice &&
      contract.strikePrice <= underlyingPrice * 1.05 &&
      this.getDaysToExpiration(contract.expirationDate) <= 45
    );

    for (const contract of targetCalls) {
      try {
        const quote = await this.marketData.getOptionQuote(contract.symbol);

        // Need high IV for selling calls
        if (volatilityAnalysis.impliedVolatility.ivRank < 50) continue;

        const premium = quote.bid * contract.multiplier;
        const stockCost = underlyingPrice * 100;
        const maxProfit = premium + (contract.strikePrice - underlyingPrice) * 100;

        const opportunity: StrategyOpportunity = {
          strategy: OptionsStrategy.COVERED_CALL,
          underlyingSymbol,
          contracts: [contract],
          expectedProfit: maxProfit,
          maxLoss: -stockCost + premium,
          successProbability: 0.6,
          confidence: 0.7,
          reasoning: `Generate income from stock holdings with ${(premium).toFixed(0)} premium`,
          breakevens: [underlyingPrice - (premium / 100)],

          greeksExposure: {
            delta: -quote.delta,
            gamma: -quote.gamma,
            theta: -quote.theta,
            vega: -quote.vega,
            rho: -quote.rho
          },

          capitalRequired: stockCost,
          returnOnCapital: maxProfit / stockCost,
          optimalEntry: new Date(),
          maxHoldDays: this.getDaysToExpiration(contract.expirationDate),
          favorableConditions: [
            'High implied volatility',
            'Neutral to slightly bullish outlook',
            'Income generation'
          ]
        };

        opportunities.push(opportunity);

      } catch (error) {
        console.warn(`Failed to analyze covered call ${contract.symbol}:`, error);
      }
    }

    return opportunities.sort((a, b) => b.returnOnCapital - a.returnOnCapital).slice(0, 2);
  }

  private async analyzeCashSecuredPut(
    underlyingSymbol: string,
    underlyingPrice: number,
    optionChain: OptionContract[],
    volatilityAnalysis: VolatilityAnalysis
  ): Promise<StrategyOpportunity[]> {
    // Similar to covered call but for puts
    const opportunities: StrategyOpportunity[] = [];

    const targetPuts = optionChain.filter(contract =>
      contract.contractType === 'put' &&
      contract.strikePrice < underlyingPrice &&
      contract.strikePrice >= underlyingPrice * 0.95
    );

    for (const contract of targetPuts) {
      try {
        const quote = await this.marketData.getOptionQuote(contract.symbol);

        if (volatilityAnalysis.impliedVolatility.ivRank < 50) continue;

        const premium = quote.bid * contract.multiplier;
        const cashRequired = contract.strikePrice * 100;

        const opportunity: StrategyOpportunity = {
          strategy: OptionsStrategy.CASH_SECURED_PUT,
          underlyingSymbol,
          contracts: [contract],
          expectedProfit: premium,
          maxLoss: -(cashRequired - premium),
          successProbability: 0.65,
          confidence: 0.6,
          reasoning: `Generate income while potentially acquiring stock at discount`,
          breakevens: [contract.strikePrice - (premium / 100)],

          greeksExposure: {
            delta: -quote.delta,
            gamma: -quote.gamma,
            theta: -quote.theta,
            vega: -quote.vega,
            rho: -quote.rho
          },

          capitalRequired: cashRequired,
          returnOnCapital: premium / cashRequired,
          optimalEntry: new Date(),
          maxHoldDays: this.getDaysToExpiration(contract.expirationDate),
          favorableConditions: [
            'High implied volatility',
            'Bullish long-term outlook',
            'Willing to own stock'
          ]
        };

        opportunities.push(opportunity);

      } catch (error) {
        console.warn(`Failed to analyze cash secured put ${contract.symbol}:`, error);
      }
    }

    return opportunities.sort((a, b) => b.returnOnCapital - a.returnOnCapital).slice(0, 2);
  }

  private async analyzeBullCallSpread(
    underlyingSymbol: string,
    underlyingPrice: number,
    optionChain: OptionContract[],
    volatilityAnalysis: VolatilityAnalysis,
    technicalAnalysis?: TechnicalAnalysis
  ): Promise<StrategyOpportunity[]> {
    // Buy call, sell higher strike call
    const opportunities: StrategyOpportunity[] = [];

    if (!technicalAnalysis || technicalAnalysis.trend !== 'bullish') {
      return opportunities; // Only consider if bullish
    }

    // Find call pairs for spreads
    const calls = optionChain.filter(contract =>
      contract.contractType === 'call' &&
      contract.strikePrice >= underlyingPrice &&
      contract.strikePrice <= underlyingPrice * 1.1
    );

    // Group by expiration
    const callsByExpiration = new Map<string, OptionContract[]>();
    calls.forEach(call => {
      const expiryKey = call.expirationDate.toISOString();
      if (!callsByExpiration.has(expiryKey)) {
        callsByExpiration.set(expiryKey, []);
      }
      callsByExpiration.get(expiryKey)!.push(call);
    });

    for (const [, expirationCalls] of callsByExpiration) {
      const sortedCalls = expirationCalls.sort((a, b) => a.strikePrice - b.strikePrice);

      for (let i = 0; i < sortedCalls.length - 1; i++) {
        const longCall = sortedCalls[i];
        const shortCall = sortedCalls[i + 1];

        // Strike spread should be reasonable
        if (shortCall.strikePrice - longCall.strikePrice > underlyingPrice * 0.05) continue;

        try {
          const [longQuote, shortQuote] = await Promise.all([
            this.marketData.getOptionQuote(longCall.symbol),
            this.marketData.getOptionQuote(shortCall.symbol)
          ]);

          const netDebit = (longQuote.ask - shortQuote.bid) * 100;
          const maxSpreadValue = (shortCall.strikePrice - longCall.strikePrice) * 100;
          const maxProfit = maxSpreadValue - netDebit;

          if (maxProfit <= 0 || netDebit <= 0) continue;

          const opportunity: StrategyOpportunity = {
            strategy: OptionsStrategy.BULL_CALL_SPREAD,
            underlyingSymbol,
            contracts: [longCall, shortCall],
            expectedProfit: maxProfit,
            maxLoss: -netDebit,
            successProbability: 0.45,
            confidence: 0.6,
            reasoning: `Bull call spread with limited risk and defined profit potential`,
            breakevens: [longCall.strikePrice + (netDebit / 100)],

            greeksExposure: {
              delta: longQuote.delta - shortQuote.delta,
              gamma: longQuote.gamma - shortQuote.gamma,
              theta: longQuote.theta - shortQuote.theta,
              vega: longQuote.vega - shortQuote.vega,
              rho: longQuote.rho - shortQuote.rho
            },

            capitalRequired: netDebit,
            returnOnCapital: maxProfit / netDebit,
            optimalEntry: new Date(),
            maxHoldDays: Math.floor(this.getDaysToExpiration(longCall.expirationDate) * 0.8),
            favorableConditions: [
              'Bullish technical setup',
              'Moderate volatility',
              'Limited capital at risk'
            ]
          };

          opportunities.push(opportunity);

        } catch (error) {
          console.warn(`Failed to analyze bull call spread:`, error);
        }
      }
    }

    return opportunities.sort((a, b) => b.returnOnCapital - a.returnOnCapital).slice(0, 2);
  }

  private async analyzeIronCondor(
    underlyingSymbol: string,
    underlyingPrice: number,
    optionChain: OptionContract[],
    volatilityAnalysis: VolatilityAnalysis,
    marketCondition: OptionsMarketCondition
  ): Promise<StrategyOpportunity[]> {
    const opportunities: StrategyOpportunity[] = [];

    // Iron condors work best in sideways markets with high IV
    if (marketCondition.underlyingTrend !== 'sideways' ||
        volatilityAnalysis.impliedVolatility.ivRank < 60) {
      return opportunities;
    }

    // Complex multi-leg strategy - simplified implementation
    const opportunity: StrategyOpportunity = {
      strategy: OptionsStrategy.IRON_CONDOR,
      underlyingSymbol,
      contracts: [], // Would need 4 contracts
      expectedProfit: 200, // Placeholder
      maxLoss: -800,
      successProbability: 0.65,
      confidence: 0.5,
      reasoning: `High probability income strategy in sideways market`,
      breakevens: [underlyingPrice * 0.97, underlyingPrice * 1.03],

      greeksExposure: {
        delta: 0.05,
        gamma: -0.02,
        theta: 0.8,
        vega: -0.3,
        rho: 0.01
      },

      capitalRequired: 1000,
      returnOnCapital: 0.2,
      optimalEntry: new Date(),
      maxHoldDays: 30,
      favorableConditions: [
        'Sideways price action',
        'High implied volatility',
        'Time decay advantage'
      ]
    };

    opportunities.push(opportunity);
    return opportunities;
  }

  // Utility methods

  private meetsFilterCriteria(opportunity: StrategyOpportunity): boolean {
    return (
      opportunity.successProbability >= this.config.minProbabilityOfProfit &&
      opportunity.returnOnCapital >= this.config.minReturnOnCapital &&
      opportunity.capitalRequired <= this.config.maxCapitalAtRisk &&
      opportunity.confidence >= 0.4
    );
  }

  private convertToTradingSignal(
    opportunity: StrategyOpportunity,
    volatilityAnalysis: VolatilityAnalysis
  ): OptionTradingSignal {
    return {
      underlyingSymbol: opportunity.underlyingSymbol,
      strategy: opportunity.strategy,
      contracts: opportunity.contracts,
      recommendation: 'buy',
      confidence: opportunity.confidence,
      expectedProfit: opportunity.expectedProfit,
      maxLoss: opportunity.maxLoss,
      successProbability: opportunity.successProbability,

      technicalBasis: opportunity.reasoning,
      volatilityAnalysis: {
        historicalVolatility: volatilityAnalysis.historicalVolatility.hv20,
        impliedVolatility: volatilityAnalysis.impliedVolatility.currentIV,
        volatilityRank: volatilityAnalysis.impliedVolatility.ivRank,
        ivSkew: 0 // Simplified
      },

      optimalEntry: opportunity.optimalEntry,
      expirationDate: opportunity.contracts[0]?.expirationDate || new Date(),
      daysToExpiration: opportunity.maxHoldDays,

      deltaExposure: opportunity.greeksExposure.delta,
      gammaExposure: opportunity.greeksExposure.gamma,
      thetaExposure: opportunity.greeksExposure.theta,
      vegaExposure: opportunity.greeksExposure.vega,

      timestamp: new Date()
    };
  }

  private getDaysToExpiration(expirationDate: Date): number {
    return Math.ceil((expirationDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  }

  private getNextExpirations(count: number): Date[] {
    const expirations: Date[] = [];
    const now = new Date();

    // Start with next Friday
    let currentDate = new Date(now);
    while (currentDate.getDay() !== 5) { // Find next Friday
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Add weekly/monthly expirations
    for (let i = 0; i < count * 2; i++) {
      expirations.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 7); // Next week
    }

    return expirations.slice(0, count);
  }

  private roundToStrike(price: number): number {
    // Round to nearest $2.50 for most stocks, $5 for high-priced
    const increment = price > 200 ? 5 : 2.5;
    return Math.round(price / increment) * increment;
  }

  private async calculateSuccessProbability(
    currentPrice: number,
    targetPrice: number,
    days: number,
    strategy: OptionsStrategy,
    strike: number
  ): Promise<number> {
    // Simplified probability calculation
    // In reality would use Monte Carlo or other sophisticated models
    const requiredMove = Math.abs(targetPrice - currentPrice) / currentPrice;
    const timeDecay = Math.max(0.3, 1 - days / 365);

    // Base probability decreases with required move size and time
    let probability = Math.exp(-requiredMove * 5) * timeDecay;

    // Adjust for strategy type
    switch (strategy) {
      case OptionsStrategy.COVERED_CALL:
      case OptionsStrategy.CASH_SECURED_PUT:
        probability = 0.65; // Higher probability income strategies
        break;
      case OptionsStrategy.IRON_CONDOR:
        probability = 0.7; // High probability if market stays in range
        break;
      default:
        break;
    }

    return Math.max(0.1, Math.min(0.9, probability));
  }

  private async calculateCallSuccessProbability(
    currentPrice: number,
    strikePrice: number,
    daysToExpiry: number,
    historicalVol: number
  ): Promise<number> {
    // Black-Scholes probability calculation
    const timeToExpiry = daysToExpiry / 365;
    const d2 = (Math.log(currentPrice / strikePrice)) / (historicalVol * Math.sqrt(timeToExpiry)) -
               0.5 * historicalVol * Math.sqrt(timeToExpiry);

    // Probability that option will be ITM at expiration
    return this.normalCDF(d2);
  }

  private normalCDF(x: number): number {
    return (1.0 + this.erf(x / Math.sqrt(2.0))) / 2.0;
  }

  private erf(x: number): number {
    // Error function approximation
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;

    const sign = x >= 0 ? 1 : -1;
    x = Math.abs(x);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return sign * y;
  }

  private generatePriceRange(centerPrice: number): number[] {
    const range: number[] = [];
    const steps = 50;
    const minPrice = centerPrice * 0.7;
    const maxPrice = centerPrice * 1.3;
    const stepSize = (maxPrice - minPrice) / steps;

    for (let i = 0; i <= steps; i++) {
      range.push(minPrice + i * stepSize);
    }

    return range;
  }

  private async calculatePnLAtPrice(strategy: MultiLegStrategy, price: number): Promise<number> {
    // Simplified P&L calculation at expiration
    let totalPnL = 0;

    for (const leg of strategy.legs) {
      const contract = leg.contract;
      let intrinsicValue = 0;

      if (contract.contractType === 'call') {
        intrinsicValue = Math.max(0, price - contract.strikePrice);
      } else {
        intrinsicValue = Math.max(0, contract.strikePrice - price);
      }

      const optionValue = intrinsicValue * contract.multiplier;
      const costBasis = (leg.price || 0) * contract.multiplier;

      if (leg.action === 'buy') {
        totalPnL += optionValue - costBasis;
      } else {
        totalPnL += costBasis - optionValue;
      }
    }

    return totalPnL;
  }

  private async calculateProfitProbability(
    strategy: MultiLegStrategy,
    currentPrice: number,
    pnlCurve: Array<{ price: number; pnl: number }>
  ): Promise<number> {
    // Calculate probability of profit based on normal distribution
    // Simplified - would use actual probability distribution in production
    const profitablePoints = pnlCurve.filter(point => point.pnl > 0);
    return profitablePoints.length / pnlCurve.length;
  }

  async analyzeStrategies(
    underlyingSymbol: string,
    filters?: { strategies?: string[]; maxRisk?: number; minProbability?: number }
  ): Promise<StrategyOpportunity[]> {
    try {
      // Get current market data
      const currentPrice = await this.dataProvider.getCurrentPrice(underlyingSymbol);
      const optionChain = await this.dataProvider.getOptionChain(underlyingSymbol);

      if (optionChain.length === 0) {
        return [];
      }

      // Analyze volatility
      const volatilityAnalysis = await this.analyzeVolatility(underlyingSymbol, optionChain);

      // Get technical analysis (basic implementation)
      const technicalAnalysis: TechnicalAnalysis = {
        signal: 'neutral',
        strength: 0.5,
        supportLevels: [currentPrice * 0.95],
        resistanceLevels: [currentPrice * 1.05],
        trend: 'sideways'
      };

      // Analyze different strategies
      let opportunities: StrategyOpportunity[] = [];

      const strategies = filters?.strategies || ['covered_call', 'cash_secured_put', 'bull_call_spread'];

      if (strategies.includes('covered_call')) {
        const coveredCallOpps = await this.analyzeCoveredCall(
          underlyingSymbol,
          currentPrice,
          optionChain,
          volatilityAnalysis
        );
        opportunities.push(...coveredCallOpps);
      }

      if (strategies.includes('cash_secured_put')) {
        const cashSecuredPutOpps = await this.analyzeCashSecuredPut(
          underlyingSymbol,
          currentPrice,
          optionChain,
          volatilityAnalysis
        );
        opportunities.push(...cashSecuredPutOpps);
      }

      if (strategies.includes('bull_call_spread')) {
        const bullCallSpreadOpps = await this.analyzeBullCallSpread(
          underlyingSymbol,
          currentPrice,
          optionChain,
          volatilityAnalysis,
          technicalAnalysis
        );
        opportunities.push(...bullCallSpreadOpps);
      }

      // Apply filters
      let filteredOpportunities = opportunities;

      if (filters?.maxRisk) {
        filteredOpportunities = filteredOpportunities.filter(opp => opp.maxLoss <= filters.maxRisk);
      }

      if (filters?.minProbability) {
        filteredOpportunities = filteredOpportunities.filter(opp => opp.probabilityOfProfit >= filters.minProbability);
      }

      // Sort by risk-adjusted return
      return filteredOpportunities
        .sort((a, b) => (b.returnOnCapital / (b.maxLoss || 1)) - (a.returnOnCapital / (a.maxLoss || 1)))
        .slice(0, 10); // Return top 10 opportunities

    } catch (error) {
      console.error(`Failed to analyze strategies for ${underlyingSymbol}:`, error);
      return [];
    }
  }
}
