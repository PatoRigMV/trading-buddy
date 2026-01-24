import { EventEmitter } from 'events';
import { OptionsData, VolatilitySurface, GreeksSnapshot } from '../types/options';
import { InstitutionalOptionsData } from '../data/InstitutionalOptionsData';
import { VolatilitySurfaceEngine } from '../engine/VolatilitySurfaceEngine';
import { InstitutionalOptionsAnalyzer } from '../engine/InstitutionalOptionsAnalyzer';

export interface ResearchParameters {
  symbols: string[];
  dateRange: {
    start: Date;
    end: Date;
  };
  strategies: OptionsStrategy[];
  riskParameters: RiskParameters;
  marketConditions?: MarketConditionFilter[];
}

export interface OptionsStrategy {
  name: string;
  type: 'bullish' | 'bearish' | 'neutral' | 'volatility' | 'arbitrage';
  legs: StrategyLeg[];
  entryConditions: ConditionSet;
  exitConditions: ConditionSet;
  riskManagement: StrategyRiskManagement;
}

export interface StrategyLeg {
  action: 'buy' | 'sell';
  optionType: 'call' | 'put';
  strike?: number;
  strikeOffset?: number; // relative to spot
  expiration?: Date;
  expirationDte?: number; // days to expiration
  quantity: number;
}

export interface ConditionSet {
  volatility?: VolatilityCondition;
  price?: PriceCondition;
  greeks?: GreeksCondition;
  technical?: TechnicalCondition;
  fundamental?: FundamentalCondition;
  market?: MarketCondition;
}

export interface VolatilityCondition {
  impliedVol?: { min?: number; max?: number };
  realizedVol?: { min?: number; max?: number };
  volSkew?: { min?: number; max?: number };
  volTerm?: { min?: number; max?: number };
  rankPercentile?: { min?: number; max?: number };
}

export interface PriceCondition {
  spot?: { min?: number; max?: number };
  priceChange?: { min?: number; max?: number };
  support?: number[];
  resistance?: number[];
  bollinger?: { position?: 'upper' | 'lower' | 'middle' };
}

export interface GreeksCondition {
  delta?: { min?: number; max?: number };
  gamma?: { min?: number; max?: number };
  theta?: { min?: number; max?: number };
  vega?: { min?: number; max?: number };
  rho?: { min?: number; max?: number };
}

export interface TechnicalCondition {
  rsi?: { min?: number; max?: number };
  macd?: { signal?: 'bullish' | 'bearish' };
  stochastic?: { min?: number; max?: number };
  vix?: { min?: number; max?: number };
}

export interface FundamentalCondition {
  earnings?: { daysToNext?: number; surprise?: number };
  dividend?: { exDate?: Date; yield?: number };
  news?: { sentiment?: 'positive' | 'negative' | 'neutral' };
}

export interface MarketCondition {
  timeOfDay?: { start?: string; end?: string };
  dayOfWeek?: number[];
  volumeProfile?: 'high' | 'low' | 'average';
  marketRegime?: 'trending' | 'ranging' | 'volatile';
}

export interface RiskParameters {
  maxLoss: number;
  maxGain?: number;
  maxDelta: number;
  maxGamma: number;
  maxVega: number;
  maxTheta: number;
  positionSize: number;
  maxPositions: number;
}

export interface BacktestResult {
  strategy: OptionsStrategy;
  performance: PerformanceMetrics;
  trades: BacktestTrade[];
  analytics: BacktestAnalytics;
  riskMetrics: RiskMetrics;
  monthlyReturns: MonthlyReturn[];
  drawdowns: Drawdown[];
}

export interface PerformanceMetrics {
  totalReturn: number;
  annualizedReturn: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  totalTrades: number;
  avgTradeReturn: number;
  volatility: number;
  calmarRatio: number;
}

export interface BacktestTrade {
  entryDate: Date;
  exitDate: Date;
  symbol: string;
  strategy: string;
  legs: TradeLeg[];
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
  holdingPeriod: number;
  maxFavorable: number;
  maxAdverse: number;
  greeksAtEntry: GreeksSnapshot;
  greeksAtExit: GreeksSnapshot;
  entryConditions: any;
  exitReason: string;
}

export interface TradeLeg {
  action: 'buy' | 'sell';
  optionType: 'call' | 'put';
  strike: number;
  expiration: Date;
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  impliedVol: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
}

export interface BacktestAnalytics {
  strategyBreakdown: StrategyBreakdown[];
  seasonalAnalysis: SeasonalAnalysis;
  volRegimeAnalysis: VolRegimeAnalysis;
  correlationAnalysis: CorrelationAnalysis;
  optimalParameters: OptimalParameters;
}

export interface StrategyBreakdown {
  strategyName: string;
  trades: number;
  winRate: number;
  avgReturn: number;
  maxDrawdown: number;
  profitFactor: number;
}

export interface SeasonalAnalysis {
  monthlyStats: MonthlyStats[];
  quarterlyStats: QuarterlyStats[];
  dayOfWeekStats: DayOfWeekStats[];
}

export interface MonthlyStats {
  month: number;
  avgReturn: number;
  winRate: number;
  trades: number;
  volatility: number;
}

export interface QuarterlyStats {
  quarter: number;
  avgReturn: number;
  winRate: number;
  trades: number;
}

export interface DayOfWeekStats {
  dayOfWeek: number;
  avgReturn: number;
  winRate: number;
  trades: number;
}

export interface VolRegimeAnalysis {
  lowVol: RegimeStats;
  mediumVol: RegimeStats;
  highVol: RegimeStats;
  volTransitions: VolTransition[];
}

export interface RegimeStats {
  threshold: number;
  avgReturn: number;
  winRate: number;
  trades: number;
  sharpeRatio: number;
}

export interface VolTransition {
  from: 'low' | 'medium' | 'high';
  to: 'low' | 'medium' | 'high';
  profitability: number;
  frequency: number;
}

export interface CorrelationAnalysis {
  strategyCorrelations: number[][];
  marketCorrelations: MarketCorrelation[];
  greeksCorrelations: GreeksCorrelation[];
}

export interface MarketCorrelation {
  factor: string;
  correlation: number;
  significance: number;
}

export interface GreeksCorrelation {
  greek: string;
  correlation: number;
  significance: number;
}

export interface OptimalParameters {
  entryConditions: any;
  exitConditions: any;
  riskParameters: RiskParameters;
  confidence: number;
  backtestPeriod: number;
}

export interface RiskMetrics {
  var95: number;
  var99: number;
  cvar95: number;
  cvar99: number;
  maxConsecutiveLosses: number;
  avgDrawdownDuration: number;
  kelly: number;
  exposureMetrics: ExposureMetrics;
}

export interface ExposureMetrics {
  avgDeltaExposure: number;
  maxDeltaExposure: number;
  avgGammaExposure: number;
  maxGammaExposure: number;
  avgVegaExposure: number;
  maxVegaExposure: number;
  avgThetaExposure: number;
  concentrationRisk: number;
}

export interface MonthlyReturn {
  date: Date;
  return: number;
  trades: number;
  winRate: number;
  maxDrawdown: number;
}

export interface Drawdown {
  start: Date;
  end: Date;
  duration: number;
  magnitude: number;
  recovery: number;
}

export interface MarketConditionFilter {
  type: 'volatility' | 'trend' | 'economic' | 'earnings';
  condition: any;
}

export interface StrategyRiskManagement {
  stopLoss?: number;
  takeProfit?: number;
  timeStop?: number; // days
  deltaHedge?: boolean;
  gammaScalping?: boolean;
  volAdjustment?: boolean;
}

export class OptionsResearchEngine extends EventEmitter {
  private dataProvider: InstitutionalOptionsData;
  private volSurfaceEngine: VolatilitySurfaceEngine;
  private analyzer: InstitutionalOptionsAnalyzer;
  private cache: Map<string, any> = new Map();

  constructor(
    dataProvider: InstitutionalOptionsData,
    volSurfaceEngine: VolatilitySurfaceEngine,
    analyzer: InstitutionalOptionsAnalyzer
  ) {
    super();
    this.dataProvider = dataProvider;
    this.volSurfaceEngine = volSurfaceEngine;
    this.analyzer = analyzer;
  }

  async runBacktest(parameters: ResearchParameters): Promise<BacktestResult[]> {
    this.emit('backtestStarted', { parameters });

    const results: BacktestResult[] = [];

    for (const strategy of parameters.strategies) {
      this.emit('strategyBacktestStarted', { strategy: strategy.name });

      const result = await this.backtestStrategy(strategy, parameters);
      results.push(result);

      this.emit('strategyBacktestCompleted', {
        strategy: strategy.name,
        performance: result.performance
      });
    }

    this.emit('backtestCompleted', { results });
    return results;
  }

  private async backtestStrategy(
    strategy: OptionsStrategy,
    parameters: ResearchParameters
  ): Promise<BacktestResult> {
    const trades: BacktestTrade[] = [];
    const positions: Map<string, OptionsPosition> = new Map();

    let currentDate = new Date(parameters.dateRange.start);
    const endDate = parameters.dateRange.end;

    while (currentDate <= endDate) {
      await this.processBacktestDay(
        currentDate,
        strategy,
        parameters,
        trades,
        positions
      );

      currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);
    }

    // Close any remaining positions
    await this.closeRemainingPositions(positions, trades, endDate);

    const performance = this.calculatePerformanceMetrics(trades);
    const analytics = await this.generateBacktestAnalytics(trades, strategy);
    const riskMetrics = this.calculateRiskMetrics(trades);
    const monthlyReturns = this.calculateMonthlyReturns(trades);
    const drawdowns = this.calculateDrawdowns(trades);

    return {
      strategy,
      performance,
      trades,
      analytics,
      riskMetrics,
      monthlyReturns,
      drawdowns
    };
  }

  private async processBacktestDay(
    date: Date,
    strategy: OptionsStrategy,
    parameters: ResearchParameters,
    trades: BacktestTrade[],
    positions: Map<string, OptionsPosition>
  ): Promise<void> {
    for (const symbol of parameters.symbols) {
      // Check for strategy entry signals
      const entrySignal = await this.checkEntryConditions(
        symbol,
        date,
        strategy,
        parameters.riskParameters
      );

      if (entrySignal) {
        const trade = await this.enterPosition(
          symbol,
          date,
          strategy,
          positions
        );
        if (trade) {
          trades.push(trade);
        }
      }

      // Check existing positions for exit conditions
      const positionsToClose = await this.checkExitConditions(
        symbol,
        date,
        strategy,
        positions
      );

      for (const positionId of positionsToClose) {
        const exitTrade = await this.exitPosition(
          positionId,
          date,
          strategy,
          positions
        );
        if (exitTrade) {
          const tradeIndex = trades.findIndex(t =>
            t.symbol === symbol &&
            t.entryDate <= date &&
            !t.exitDate
          );
          if (tradeIndex >= 0) {
            trades[tradeIndex] = { ...trades[tradeIndex], ...exitTrade };
          }
        }
      }
    }
  }

  private async checkEntryConditions(
    symbol: string,
    date: Date,
    strategy: OptionsStrategy,
    riskParams: RiskParameters
  ): Promise<boolean> {
    const marketData = await this.getHistoricalMarketData(symbol, date);
    if (!marketData) return false;

    const conditions = strategy.entryConditions;

    // Check volatility conditions
    if (conditions.volatility) {
      const volCheck = await this.checkVolatilityConditions(
        symbol, date, conditions.volatility
      );
      if (!volCheck) return false;
    }

    // Check price conditions
    if (conditions.price) {
      const priceCheck = this.checkPriceConditions(marketData, conditions.price);
      if (!priceCheck) return false;
    }

    // Check Greeks conditions
    if (conditions.greeks) {
      const greeksCheck = await this.checkGreeksConditions(
        symbol, date, conditions.greeks
      );
      if (!greeksCheck) return false;
    }

    // Check technical conditions
    if (conditions.technical) {
      const techCheck = await this.checkTechnicalConditions(
        symbol, date, conditions.technical
      );
      if (!techCheck) return false;
    }

    // Check risk parameters
    const riskCheck = await this.checkRiskParameters(
      symbol, date, strategy, riskParams
    );
    if (!riskCheck) return false;

    return true;
  }

  private async checkVolatilityConditions(
    symbol: string,
    date: Date,
    conditions: VolatilityCondition
  ): Promise<boolean> {
    const volSurface = await this.volSurfaceEngine.getHistoricalSurface(symbol, date);
    if (!volSurface) return false;

    const atmVol = this.getATMVolatility(volSurface);

    if (conditions.impliedVol) {
      if (conditions.impliedVol.min && atmVol < conditions.impliedVol.min) return false;
      if (conditions.impliedVol.max && atmVol > conditions.impliedVol.max) return false;
    }

    if (conditions.volSkew) {
      const skew = this.calculateVolatilitySkew(volSurface);
      if (conditions.volSkew.min && skew < conditions.volSkew.min) return false;
      if (conditions.volSkew.max && skew > conditions.volSkew.max) return false;
    }

    if (conditions.rankPercentile) {
      const rank = await this.calculateVolatilityRank(symbol, date, atmVol);
      if (conditions.rankPercentile.min && rank < conditions.rankPercentile.min) return false;
      if (conditions.rankPercentile.max && rank > conditions.rankPercentile.max) return false;
    }

    return true;
  }

  private checkPriceConditions(
    marketData: any,
    conditions: PriceCondition
  ): boolean {
    const currentPrice = marketData.close;

    if (conditions.spot) {
      if (conditions.spot.min && currentPrice < conditions.spot.min) return false;
      if (conditions.spot.max && currentPrice > conditions.spot.max) return false;
    }

    if (conditions.priceChange) {
      const change = (currentPrice - marketData.previousClose) / marketData.previousClose;
      if (conditions.priceChange.min && change < conditions.priceChange.min) return false;
      if (conditions.priceChange.max && change > conditions.priceChange.max) return false;
    }

    return true;
  }

  private async checkExitConditions(
    symbol: string,
    date: Date,
    strategy: OptionsStrategy,
    positions: Map<string, OptionsPosition>
  ): Promise<string[]> {
    const positionsToClose: string[] = [];

    for (const [positionId, position] of positions.entries()) {
      if (position.symbol !== symbol) continue;

      let shouldExit = false;

      // Check time-based exit
      const daysHeld = (date.getTime() - position.entryDate.getTime()) / (24 * 60 * 60 * 1000);
      if (strategy.riskManagement?.timeStop && daysHeld >= strategy.riskManagement.timeStop) {
        shouldExit = true;
      }

      // Check P&L-based exits
      const currentPnL = await this.calculatePositionPnL(position, date);
      if (strategy.riskManagement?.stopLoss && currentPnL <= -strategy.riskManagement.stopLoss) {
        shouldExit = true;
      }
      if (strategy.riskManagement?.takeProfit && currentPnL >= strategy.riskManagement.takeProfit) {
        shouldExit = true;
      }

      // Check strategy-specific exit conditions
      if (strategy.exitConditions) {
        const exitSignal = await this.checkStrategyExitConditions(
          symbol, date, strategy.exitConditions, position
        );
        if (exitSignal) shouldExit = true;
      }

      if (shouldExit) {
        positionsToClose.push(positionId);
      }
    }

    return positionsToClose;
  }

  private calculatePerformanceMetrics(trades: BacktestTrade[]): PerformanceMetrics {
    if (trades.length === 0) {
      return {
        totalReturn: 0,
        annualizedReturn: 0,
        sharpeRatio: 0,
        sortinoRatio: 0,
        maxDrawdown: 0,
        winRate: 0,
        profitFactor: 0,
        avgWin: 0,
        avgLoss: 0,
        totalTrades: 0,
        avgTradeReturn: 0,
        volatility: 0,
        calmarRatio: 0
      };
    }

    const returns = trades.map(t => t.pnlPercent);
    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl < 0);

    const totalReturn = returns.reduce((sum, r) => sum + r, 0);
    const avgReturn = totalReturn / trades.length;
    const winRate = wins.length / trades.length;

    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance);

    const annualizedReturn = avgReturn * 252; // Trading days
    const annualizedVol = volatility * Math.sqrt(252);
    const sharpeRatio = annualizedVol > 0 ? annualizedReturn / annualizedVol : 0;

    const downside = returns.filter(r => r < 0);
    const downsideVol = downside.length > 0 ?
      Math.sqrt(downside.reduce((sum, r) => sum + r * r, 0) / downside.length) * Math.sqrt(252) : 0;
    const sortinoRatio = downsideVol > 0 ? annualizedReturn / downsideVol : 0;

    const grossWins = wins.reduce((sum, t) => sum + t.pnl, 0);
    const grossLosses = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));
    const profitFactor = grossLosses > 0 ? grossWins / grossLosses : 0;

    const maxDrawdown = this.calculateMaxDrawdown(returns);
    const calmarRatio = maxDrawdown > 0 ? annualizedReturn / maxDrawdown : 0;

    return {
      totalReturn,
      annualizedReturn,
      sharpeRatio,
      sortinoRatio,
      maxDrawdown,
      winRate,
      profitFactor,
      avgWin: wins.length > 0 ? wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length : 0,
      avgLoss: losses.length > 0 ? losses.reduce((sum, t) => sum + t.pnl, 0) / losses.length : 0,
      totalTrades: trades.length,
      avgTradeReturn: avgReturn,
      volatility: annualizedVol,
      calmarRatio
    };
  }

  private calculateMaxDrawdown(returns: number[]): number {
    let peak = 0;
    let maxDD = 0;
    let cumulative = 0;

    for (const ret of returns) {
      cumulative += ret;
      peak = Math.max(peak, cumulative);
      const drawdown = peak - cumulative;
      maxDD = Math.max(maxDD, drawdown);
    }

    return maxDD;
  }

  async optimizeStrategy(
    strategy: OptionsStrategy,
    parameters: ResearchParameters,
    optimizationTargets: OptimizationTarget[]
  ): Promise<StrategyOptimizationResult> {
    this.emit('optimizationStarted', { strategy: strategy.name });

    const parameterSpace = this.generateParameterSpace(strategy);
    const results: OptimizationResult[] = [];

    for (const params of parameterSpace) {
      const modifiedStrategy = this.applyParameters(strategy, params);
      const backtest = await this.backtestStrategy(modifiedStrategy, parameters);

      const score = this.calculateOptimizationScore(backtest.performance, optimizationTargets);
      results.push({
        parameters: params,
        performance: backtest.performance,
        score
      });
    }

    results.sort((a, b) => b.score - a.score);

    this.emit('optimizationCompleted', {
      strategy: strategy.name,
      bestScore: results[0]?.score
    });

    return {
      originalStrategy: strategy,
      optimizedStrategy: this.applyParameters(strategy, results[0].parameters),
      results: results.slice(0, 10), // Top 10 results
      parameterSpace
    };
  }

  async generateAlphaReport(
    strategies: OptionsStrategy[],
    marketData: any,
    timeframe: { start: Date; end: Date }
  ): Promise<AlphaReport> {
    const analysis = await this.analyzer.runComprehensiveAnalysis({
      symbols: marketData.symbols,
      strategies,
      timeframe
    });

    return {
      executiveSummary: this.generateExecutiveSummary(analysis),
      strategyRankings: this.rankStrategies(strategies, analysis),
      marketRegimeAnalysis: this.analyzeMarketRegimes(marketData, timeframe),
      riskFactorAnalysis: this.analyzeRiskFactors(analysis),
      recommendations: this.generateRecommendations(analysis),
      forwardLookingMetrics: await this.calculateForwardMetrics(strategies, marketData)
    };
  }

  // Helper methods for complex calculations
  private async getHistoricalMarketData(symbol: string, date: Date): Promise<any> {
    // Implementation would fetch historical market data
    return null;
  }

  private getATMVolatility(surface: VolatilitySurface): number {
    // Find ATM volatility from surface
    return 0;
  }

  private calculateVolatilitySkew(surface: VolatilitySurface): number {
    // Calculate put-call skew
    return 0;
  }

  private async calculateVolatilityRank(symbol: string, date: Date, currentVol: number): Promise<number> {
    // Calculate percentile rank of current volatility
    return 0;
  }

  private async enterPosition(
    symbol: string,
    date: Date,
    strategy: OptionsStrategy,
    positions: Map<string, OptionsPosition>
  ): Promise<BacktestTrade | null> {
    // Implementation would create new position
    return null;
  }

  private async exitPosition(
    positionId: string,
    date: Date,
    strategy: OptionsStrategy,
    positions: Map<string, OptionsPosition>
  ): Promise<Partial<BacktestTrade> | null> {
    // Implementation would close position
    return null;
  }

  private async closeRemainingPositions(
    positions: Map<string, OptionsPosition>,
    trades: BacktestTrade[],
    endDate: Date
  ): Promise<void> {
    // Implementation would close all remaining positions
  }

  private async generateBacktestAnalytics(
    trades: BacktestTrade[],
    strategy: OptionsStrategy
  ): Promise<BacktestAnalytics> {
    // Implementation would generate comprehensive analytics
    return {} as BacktestAnalytics;
  }

  private calculateRiskMetrics(trades: BacktestTrade[]): RiskMetrics {
    // Implementation would calculate various risk metrics
    return {} as RiskMetrics;
  }

  private calculateMonthlyReturns(trades: BacktestTrade[]): MonthlyReturn[] {
    // Implementation would aggregate returns by month
    return [];
  }

  private calculateDrawdowns(trades: BacktestTrade[]): Drawdown[] {
    // Implementation would identify all drawdown periods
    return [];
  }

  private async checkRiskParameters(
    symbol: string,
    date: Date,
    strategy: OptionsStrategy,
    riskParams: RiskParameters
  ): Promise<boolean> {
    // Implementation would check position sizing and risk limits
    return true;
  }

  private async checkGreeksConditions(
    symbol: string,
    date: Date,
    conditions: GreeksCondition
  ): Promise<boolean> {
    // Implementation would check Greeks-based conditions
    return true;
  }

  private async checkTechnicalConditions(
    symbol: string,
    date: Date,
    conditions: TechnicalCondition
  ): Promise<boolean> {
    // Implementation would check technical indicators
    return true;
  }

  private async checkStrategyExitConditions(
    symbol: string,
    date: Date,
    conditions: ConditionSet,
    position: OptionsPosition
  ): Promise<boolean> {
    // Implementation would check strategy-specific exit conditions
    return false;
  }

  private async calculatePositionPnL(position: OptionsPosition, date: Date): Promise<number> {
    // Implementation would calculate current P&L for position
    return 0;
  }

  private generateParameterSpace(strategy: OptionsStrategy): any[] {
    // Implementation would generate parameter combinations for optimization
    return [];
  }

  private applyParameters(strategy: OptionsStrategy, params: any): OptionsStrategy {
    // Implementation would apply parameters to strategy
    return strategy;
  }

  private calculateOptimizationScore(
    performance: PerformanceMetrics,
    targets: OptimizationTarget[]
  ): number {
    // Implementation would calculate optimization score
    return 0;
  }

  private generateExecutiveSummary(analysis: any): string {
    // Implementation would generate executive summary
    return '';
  }

  private rankStrategies(strategies: OptionsStrategy[], analysis: any): any[] {
    // Implementation would rank strategies by performance
    return [];
  }

  private analyzeMarketRegimes(marketData: any, timeframe: any): any {
    // Implementation would analyze market regimes
    return {};
  }

  private analyzeRiskFactors(analysis: any): any {
    // Implementation would analyze risk factors
    return {};
  }

  private generateRecommendations(analysis: any): string[] {
    // Implementation would generate actionable recommendations
    return [];
  }

  private async calculateForwardMetrics(strategies: OptionsStrategy[], marketData: any): Promise<any> {
    // Implementation would calculate forward-looking metrics
    return {};
  }
}

// Additional interfaces
interface OptionsPosition {
  id: string;
  symbol: string;
  strategy: string;
  legs: TradeLeg[];
  entryDate: Date;
  entryPrice: number;
  quantity: number;
  greeks: GreeksSnapshot;
}

interface OptimizationTarget {
  metric: keyof PerformanceMetrics;
  weight: number;
  target?: number;
}

interface OptimizationResult {
  parameters: any;
  performance: PerformanceMetrics;
  score: number;
}

interface StrategyOptimizationResult {
  originalStrategy: OptionsStrategy;
  optimizedStrategy: OptionsStrategy;
  results: OptimizationResult[];
  parameterSpace: any[];
}

interface AlphaReport {
  executiveSummary: string;
  strategyRankings: any[];
  marketRegimeAnalysis: any;
  riskFactorAnalysis: any;
  recommendations: string[];
  forwardLookingMetrics: any;
}
