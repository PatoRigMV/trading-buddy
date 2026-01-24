import { Broker, BrokerPosition } from '../adapters/Broker';
import { AlpacaBroker } from '../adapters/AlpacaBroker';
import { MarketDataProvider, BarData } from '../data/MarketData';
import { TechnicalIndicators, TechnicalSignals } from './indicators';
import { calculateConfidenceScores, ConfidenceScores } from './scorer';
import { RiskManager, RiskLimits, Position } from './risk';
import { TradingStateMachine, AgentContext } from './stateMachine';
import { ExpectedValueGate, EVGateConfig, DEFAULT_EV_CONFIG, ExpectedValueCalculation } from './expectedValue';
import { LiquidityManager, LiquidityLimits, CONSERVATIVE_LIQUIDITY_LIMITS, LiquidityAssessment } from './liquidity';
import { MarketHours, MarketSession } from './marketHours';
import { newTrace, newSpan, endSpan, durationMs, recordE2E, recordDecision, recordAck } from '../obs/e2e';

export interface AgentConfig {
  symbols: string[];
  timeframe: string;
  buyThreshold: number;
  sellThreshold: number;
  riskLimits: RiskLimits;
  maxPositions: number;
  emergencyStop: boolean;
  evGateConfig?: EVGateConfig; // Optional EV gate configuration
  liquidityLimits?: LiquidityLimits; // Optional liquidity limits
}

export interface DecisionRecord {
  id: string;
  traceId?: string; // For distributed tracing
  symbol: string;
  timestamp: Date;
  state: string;
  signals: TechnicalSignals;
  confidence: ConfidenceScores;
  decision: 'buy' | 'sell' | 'hold';
  reason: string;
  orderId?: string;
  price?: number;
  quantity?: number;
  expectedValue?: ExpectedValueCalculation; // EV analysis
  liquidityAssessment?: LiquidityAssessment; // Liquidity analysis
}

export class TradingAgent {
  private config: AgentConfig;
  private broker: Broker;
  private marketData: MarketDataProvider;
  private stateMachine: TradingStateMachine;
  private riskManager: RiskManager;
  private evGate: ExpectedValueGate;
  private liquidityManager: LiquidityManager;
  private indicators: Map<string, TechnicalIndicators> = new Map();
  private decisions: DecisionRecord[] = [];
  private isRunning: boolean = false;
  private startOfDayValue: number = 0;
  private cachedAccount: any = null;
  private cachedPositions: Position[] = [];
  private lastAccountFetch: number = 0;
  private lastPositionsFetch: number = 0;
  private readonly ACCOUNT_CACHE_MS = 5000;
  private readonly POSITIONS_CACHE_MS = 3000;

  constructor(
    config: AgentConfig,
    broker: Broker,
    marketData: MarketDataProvider
  ) {
    this.config = config;
    this.broker = broker;
    this.marketData = marketData;
    this.stateMachine = new TradingStateMachine();
    this.riskManager = new RiskManager(config.riskLimits, 0);
    this.evGate = new ExpectedValueGate(config.evGateConfig || DEFAULT_EV_CONFIG);
    this.liquidityManager = new LiquidityManager(config.liquidityLimits || CONSERVATIVE_LIQUIDITY_LIMITS);

    // Initialize indicators for each symbol
    for (const symbol of config.symbols) {
      this.indicators.set(symbol, new TechnicalIndicators(symbol));
      this.stateMachine.initializeSymbol(symbol);
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Agent is already running');
      return;
    }

    console.log('Starting trading agent...');
    this.isRunning = true;

    try {
      // Initialize start-of-day portfolio value
      const account = await this.broker.getAccount();
      this.startOfDayValue = account.portfolioValue;
      this.riskManager.updateStartOfDayValue(this.startOfDayValue);

      console.log(`Portfolio value: $${account.portfolioValue.toFixed(2)}`);
      console.log(`Monitoring symbols: ${this.config.symbols.join(', ')}`);

      // Subscribe to market data
      await this.marketData.subscribeBars(
        this.config.symbols,
        this.config.timeframe,
        this.handleBarData.bind(this)
      );

      console.log('Trading agent started successfully');

      // Start the main trading loop
      this.runTradingLoop();

    } catch (error) {
      console.error('Failed to start trading agent:', error);
      this.isRunning = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    console.log('Stopping trading agent...');
    this.isRunning = false;

    try {
      await this.marketData.disconnect();
      console.log('Trading agent stopped');
    } catch (error) {
      console.error('Error stopping trading agent:', error);
    }
  }

  async emergencyStop(): Promise<void> {
    console.log('EMERGENCY STOP - Closing all positions...');

    try {
      await this.broker.closeAllPositions();
      await this.stop();
      console.log('Emergency stop completed');
    } catch (error) {
      console.error('Emergency stop failed:', error);
      throw error;
    }
  }

  private async handleBarData(bar: BarData): Promise<void> {
    if (!this.isRunning) return;

    const indicator = this.indicators.get(bar.symbol);
    if (!indicator) return;

    // Add bar to technical indicators
    indicator.addBar({
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
      timestamp: bar.timestamp
    });

    // Update latest price in broker for immediate quote access
    if (this.broker instanceof AlpacaBroker) {
      this.broker.updateLatestPrice(bar.symbol, bar.close);
    }

    // Update liquidity data
    this.liquidityManager.updateVolumeData([bar]);

    // Update spread data if we have bid/ask info
    try {
      const quote = await this.broker.getBestBidOffer?.(bar.symbol);
      if (quote) {
        this.liquidityManager.updateSpread(bar.symbol, quote.bid, quote.ask);
      }
    } catch (error) {
      // Quote unavailable, continue without spread update
    }

    // Process the bar data for this symbol
    await this.processSymbol(bar.symbol);
  }

  private async processSymbol(symbol: string): Promise<void> {
    try {
      const context = this.stateMachine.getContext(symbol);
      if (!context || context.state === 'error') return;

      // Check market hours - skip intensive processing during off-hours
      const marketSession = MarketHours.getCurrentSession();
      if (!marketSession.isOpen) {
        // During off-hours: only monitor existing positions, skip new analysis
        if (context.state === 'in_position' || context.state === 'exiting') {
          // Still monitor positions during off-hours for risk management
          await this.handleInPositionState(symbol, context);
        }
        // Skip all other processing (idle, analyzing, entering) during off-hours
        return;
      }

      // Check emergency stop
      if (this.config.emergencyStop) {
        console.log('Emergency stop is active - no new trades');
        return;
      }

      // 🔥 Active trading during market hours
      switch (context.state) {
        case 'idle':
          await this.handleIdleState(symbol, context);
          break;

        case 'analyzing':
          await this.handleAnalyzingState(symbol, context);
          break;

        case 'entering':
          await this.handleEnteringState(symbol, context);
          break;

        case 'in_position':
          await this.handleInPositionState(symbol, context);
          break;

        case 'exiting':
          await this.handleExitingState(symbol, context);
          break;
      }

    } catch (error) {
      console.error(`Error processing ${symbol}:`, error);
      this.stateMachine.setError(symbol, `Processing error: ${error}`);
    }
  }

  private async handleIdleState(symbol: string, context: AgentContext): Promise<void> {
    // Get current price for analysis start message
    const indicator = this.indicators.get(symbol);
    const signals = indicator ? indicator.getSignals() : null;
    const currentPrice = signals ? signals.emaFast : 'N/A';

    // Transition to analyzing with detailed message
    this.stateMachine.transition(symbol, 'analyzing', `🔍 Analyzing ${symbol} @ $${typeof currentPrice === 'number' ? currentPrice.toFixed(2) : currentPrice} - checking RSI, EMA, ATR patterns...`);
  }

  private async handleAnalyzingState(symbol: string, context: AgentContext): Promise<void> {
    const indicator = this.indicators.get(symbol);
    if (!indicator) return;

    // Start decision span
    const traceId = newTrace();
    const decisionSpan = newSpan('decision', traceId);

    // Get technical signals
    const signals = indicator.getSignals();
    const confidence = calculateConfidenceScores(signals);

    // Get current price for EV calculation
    const quote = await this.broker.getBestBidOffer?.(symbol);
    const currentPrice = quote ? quote.last : signals.emaFast; // Fallback to EMA if quote unavailable

    // Calculate expected value
    const evCalculation = this.evGate.calculateExpectedValue(
      confidence,
      signals,
      signals.atr * currentPrice, // Convert ATR signal back to price
      currentPrice
    );

    // Record decision with EV analysis
    const decision = this.makeDecision(confidence);

    // End decision span and record latency
    endSpan(decisionSpan);
    recordDecision(durationMs(decisionSpan));

    // Get liquidity assessment for logging purposes
    const estimatedShares = 100; // Rough estimate for logging
    const liquidityAssessment = this.liquidityManager.assessLiquidity(symbol, estimatedShares, currentPrice);

    this.recordDecision(symbol, signals, confidence, decision, 'Analysis completed', undefined, undefined, undefined, evCalculation, liquidityAssessment, traceId);

    if (decision === 'buy' && confidence.buy >= this.config.buyThreshold) {
      // Check EV gate first
      if (!evCalculation.approved) {
        this.stateMachine.transition(symbol, 'idle', `EV gate rejected: ${evCalculation.reason}`);
        return;
      }
      // Check if we can enter a position
      const positions = await this.getCurrentPositions();
      const account = await this.getCachedAccount();

      // Check if we already have a position in this symbol
      const existingPosition = positions.find(p => p.symbol === symbol);
      if (existingPosition && existingPosition.quantity > 0) {
        this.stateMachine.transition(symbol, 'idle', 'Already have position');
        return;
      }

      // Calculate position size
      const price = currentPrice; // Use current market price
      let positionSize = this.riskManager.calculateOptimalPositionSize(
        price,
        account.portfolioValue,
        signals.atr * currentPrice, // Convert ATR signal back to price
        confidence.buy
      );

      // Check liquidity limits
      const liquidityAssessment = this.liquidityManager.assessLiquidity(symbol, positionSize, price);
      if (!liquidityAssessment.approved) {
        this.stateMachine.transition(symbol, 'idle', `Liquidity rejected: ${liquidityAssessment.reason}`);
        return;
      }

      // Use liquidity-constrained position size
      positionSize = liquidityAssessment.maxShares;

      if (positionSize > 0) {
        this.stateMachine.transition(symbol, 'entering', 'Entering buy position', {
          quantity: positionSize,
          entryPrice: price,
          traceId
        });
      } else {
        this.stateMachine.transition(symbol, 'idle', 'Position size too small');
      }

    } else if (decision === 'sell') {
      // Check if we have a position to sell
      const positions = await this.getCurrentPositions();
      const position = positions.find(p => p.symbol === symbol);

      if (position && position.quantity > 0) {
        this.stateMachine.transition(symbol, 'exiting', 'Exiting position', {
          quantity: position.quantity
        });
      } else {
        this.stateMachine.transition(symbol, 'idle', 'No position to sell');
      }

    } else {
      // Hold decision - show detailed analysis
      const rsiCondition = signals.rsi > 70 ? '🔴 Overbought' : signals.rsi < 30 ? '🟢 Oversold' : '🟡 Neutral';
      const emaCondition = signals.emaFast > signals.emaSlow ? '🟢 Bullish EMA' : '🔴 Bearish EMA';
      const volumeCondition = signals.volumeRatio > 1.2 ? '📈 High Vol' : signals.volumeRatio < 0.8 ? '📉 Low Vol' : '➡️ Normal Vol';
      const momentumCondition = signals.momentum > 0.5 ? '⬆️ Strong' : signals.momentum < -0.5 ? '⬇️ Weak' : '➡️ Neutral';

      const analysisDetails = `📊 ${symbol}: RSI ${signals.rsi.toFixed(1)} ${rsiCondition}, ${emaCondition}, ${volumeCondition}, Momentum ${momentumCondition}, ATR $${(signals.atr * currentPrice).toFixed(2)} - Buy ${confidence.buy.toFixed(3)} (need ${this.config.buyThreshold}), Sell ${confidence.sell.toFixed(3)} - 🔄 Scanning for entry...`;

      this.stateMachine.transition(symbol, 'idle', analysisDetails);
    }
  }

  private async handleEnteringState(symbol: string, context: AgentContext): Promise<void> {
    if (!context.quantity || !context.entryPrice) {
      this.stateMachine.setError(symbol, 'Missing quantity or entry price');
      return;
    }

    try {
      const positions = await this.getCurrentPositions();
      const account = await this.broker.getAccount();

      // Final risk check
      const riskAssessment = this.riskManager.assessTrade(
        symbol,
        'buy',
        context.quantity,
        context.entryPrice,
        positions,
        account.portfolioValue
      );

      if (!riskAssessment.approved) {
        this.stateMachine.transition(symbol, 'idle', `Trade rejected: ${riskAssessment.reason}`);
        return;
      }

      // Place the order using marketable limit with 20bps band
      // Start order span for tracking order ack latency
      const traceId = context.traceId || newTrace();
      const orderSpan = newSpan('order_ack', traceId);

      const order = await this.broker.placeOrder({
        symbol,
        side: 'buy',
        qty: context.quantity,
        type: 'marketable_limit',
        priceBandBps: 20,
        useBestBidOffer: true,
        timeInForce: 'ioc'
      });

      // End order span and record ack latency
      endSpan(orderSpan);
      recordAck(durationMs(orderSpan));

      this.stateMachine.transition(symbol, 'in_position', 'Order placed', {
        orderId: order.id,
        stopLoss: riskAssessment.stopLoss
      });

      this.recordDecision(symbol, {}, {}, 'buy', 'Order executed', order.id, context.entryPrice, context.quantity, undefined, undefined, traceId);

      // Record trade execution for cooldown tracking
      this.riskManager.recordTradeExecution(symbol);

    } catch (error) {
      this.stateMachine.setError(symbol, `Order failed: ${error}`);
    }
  }

  private async handleInPositionState(symbol: string, context: AgentContext): Promise<void> {
    const positions = await this.getCurrentPositions();
    const position = positions.find(p => p.symbol === symbol);

    if (!position || position.quantity === 0) {
      this.stateMachine.transition(symbol, 'idle', 'Position no longer exists');
      return;
    }

    // Check for exit conditions
    const indicator = this.indicators.get(symbol);
    if (!indicator) return;

    const signals = indicator.getSignals();
    const confidence = calculateConfidenceScores(signals);

    // Exit if sell confidence is high
    if (confidence.sell >= this.config.sellThreshold) {
      this.stateMachine.transition(symbol, 'exiting', 'High sell confidence detected');
    }
    // Exit if stop loss is hit
    else if (context.stopLoss && position.avgPrice * 0.98 >= context.stopLoss) {
      this.stateMachine.transition(symbol, 'exiting', 'Stop loss triggered');
    }
  }

  private async handleExitingState(symbol: string, context: AgentContext): Promise<void> {
    const positions = await this.getCurrentPositions();
    const position = positions.find(p => p.symbol === symbol);

    if (!position || position.quantity === 0) {
      this.stateMachine.transition(symbol, 'idle', 'No position to exit');
      return;
    }

    try {
      // Start order span for tracking order ack latency
      const traceId = context.traceId || newTrace();
      const orderSpan = newSpan('order_ack', traceId);

      const order = await this.broker.placeOrder({
        symbol,
        side: 'sell',
        qty: position.quantity,
        type: 'marketable_limit',
        priceBandBps: 20,
        useBestBidOffer: true,
        timeInForce: 'ioc'
      });

      // End order span and record ack latency
      endSpan(orderSpan);
      recordAck(durationMs(orderSpan));

      this.stateMachine.transition(symbol, 'idle', 'Exit order placed');
      this.recordDecision(symbol, {}, {}, 'sell', 'Exit order executed', order.id, position.avgPrice, position.quantity, undefined, undefined, traceId);

      // Record trade execution for cooldown tracking
      this.riskManager.recordTradeExecution(symbol);

    } catch (error) {
      this.stateMachine.setError(symbol, `Exit order failed: ${error}`);
    }
  }

  private makeDecision(confidence: ConfidenceScores): 'buy' | 'sell' | 'hold' {
    if (confidence.buy > confidence.sell && confidence.buy > confidence.hold) {
      return 'buy';
    } else if (confidence.sell > confidence.buy && confidence.sell > confidence.hold) {
      return 'sell';
    }
    return 'hold';
  }

  private async getCurrentPositions(): Promise<Position[]> {
    const now = Date.now();
    if (now - this.lastPositionsFetch < this.POSITIONS_CACHE_MS) {
      return this.cachedPositions;
    }

    const brokerPositions = await this.broker.getPositions();

    this.cachedPositions = brokerPositions.map(pos => ({
      symbol: pos.symbol,
      quantity: pos.qty,
      avgPrice: pos.avgEntryPrice,
      marketValue: pos.marketValue,
      unrealizedPnL: pos.unrealizedPl,
      side: pos.side
    }));
    this.lastPositionsFetch = now;

    return this.cachedPositions;
  }

  private async getCachedAccount(): Promise<any> {
    const now = Date.now();
    if (now - this.lastAccountFetch < this.ACCOUNT_CACHE_MS) {
      return this.cachedAccount;
    }

    this.cachedAccount = await this.broker.getAccount();
    this.lastAccountFetch = now;

    return this.cachedAccount;
  }

  private recordDecision(
    symbol: string,
    signals: any,
    confidence: any,
    decision: 'buy' | 'sell' | 'hold',
    reason: string,
    orderId?: string,
    price?: number,
    quantity?: number,
    expectedValue?: ExpectedValueCalculation,
    liquidityAssessment?: LiquidityAssessment,
    traceId?: string
  ): void {
    const record: DecisionRecord = {
      id: `${symbol}_${Date.now()}`,
      traceId,
      symbol,
      timestamp: new Date(),
      state: this.stateMachine.getContext(symbol)?.state || 'unknown',
      signals,
      confidence,
      decision,
      reason,
      orderId,
      price,
      quantity,
      expectedValue,
      liquidityAssessment
    };

    this.decisions.push(record);

    // Keep only last 10000 decisions
    if (this.decisions.length > 10000) {
      this.decisions = this.decisions.slice(-10000);
    }
  }

  private async runTradingLoop(): Promise<void> {
    // Bar-close event loop - no constant polling
    // Trading decisions are now only made on bar close events via handleBarData()

    while (this.isRunning) {
      let marketSession;
      let waitTime = 60000; // Default 1 minute

      try {
        // Check market hours and adapt behavior
        marketSession = MarketHours.getCurrentSession();

        // Market-aware operation mode
        if (marketSession.isOpen) {
          // 🔥 HIGH FREQUENCY: Market open - active trading mode
          console.log(`📈 Market open: ${marketSession.status} - Active trading mode`);

          // Periodic cleanup and health checks
          this.stateMachine.cleanup();
          this.liquidityManager.cleanup();

          // During market hours: check for position exits
          await this.checkPositionExits();

          // Active monitoring - check every 15 seconds during market hours
          waitTime = 15000;

        } else {
          // 🌙 LOW FREQUENCY: Market closed - conservation mode
          console.log(`🌙 Market ${marketSession.status} - Resource conservation mode`);
          console.log(`   Next market session: ${marketSession.timeUntilNext}`);

          // Minimal activity during off-hours to preserve CPU
          // Only essential health checks and light cleanup
          if (Date.now() % 600000 < 10000) { // Every 10 minutes (with 10s tolerance)
            this.stateMachine.cleanup();
            this.liquidityManager.cleanup();
            console.log(`🧹 Periodic cleanup completed`);
          }

          // Skip intensive after-hours analysis - let strategy preparation agent handle this
          console.log(`   Strategy preparation delegated to dedicated agent`);

          // Conservative monitoring - check every 5 minutes during off-hours
          waitTime = 300000; // 5 minutes
        }

        // Log status with market context every 5 minutes (regardless of mode)
        if (Date.now() % 300000 < 5000) { // 5 minute intervals with 5 second tolerance
          const positions = await this.getCurrentPositions();
          await this.logMarketAwareStatus(positions, marketSession);
        }

      } catch (error) {
        console.error('Trading loop error:', error);
        waitTime = 60000; // Wait 1 minute on error
        marketSession = { isOpen: false, status: 'error' }; // Fallback
      }

      // Dynamic wait time based on market status
      console.log(`⏱️ Next check in ${waitTime / 1000}s (${marketSession.isOpen ? 'active' : 'conservation'} mode)`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  /**
   * Check existing positions for exit conditions (stop losses, etc.)
   * This runs periodically but at lower frequency than the old polling loop
   */
  private async checkPositionExits(): Promise<void> {
    try {
      const positions = await this.getCurrentPositions();

      for (const position of positions) {
        // Only check positions we're actively managing
        const context = this.stateMachine.getContext(position.symbol);
        if (!context || context.state !== 'in_position') continue;

        // Get current market data
        let currentPrice: number;
        try {
          const quote = await this.broker.getBestBidOffer?.(position.symbol);
          currentPrice = quote ? quote.last : position.avgPrice;
        } catch {
          currentPrice = position.avgPrice; // Fallback
        }

        // Check stop loss conditions
        if (context.stopLoss) {
          const isStopTriggered = position.side === 'long'
            ? currentPrice <= context.stopLoss
            : currentPrice >= context.stopLoss;

          if (isStopTriggered) {
            console.log(`Stop loss triggered for ${position.symbol} at ${currentPrice}`);
            this.stateMachine.transition(position.symbol, 'exiting', 'Stop loss triggered');
          }
        }

        // Check for significant adverse movement (emergency exit)
        const movePercent = position.side === 'long'
          ? (currentPrice - position.avgPrice) / position.avgPrice
          : (position.avgPrice - currentPrice) / position.avgPrice;

        if (movePercent < -0.05) { // 5% adverse movement
          console.log(`Emergency exit triggered for ${position.symbol} due to -${(Math.abs(movePercent) * 100).toFixed(1)}% move`);
          this.stateMachine.transition(position.symbol, 'exiting', 'Emergency exit: large adverse movement');
        }
      }
    } catch (error) {
      console.error('Error in checkPositionExits:', error);
    }
  }

  private logStatus(positions: Position[]): void {
    const stats = this.stateMachine.getStateStats();
    const account = this.broker.getAccount().then(acc => {
      const riskMetrics = this.riskManager.getCurrentRiskMetrics(positions, acc.portfolioValue);
      console.log(`Status - Portfolio: $${acc.portfolioValue.toFixed(2)}, Positions: ${positions.length}, Drawdown: ${(riskMetrics.currentDrawdown * 100).toFixed(1)}%, States:`, stats);
    }).catch(() => {
      console.log(`Status - Positions: ${positions.length}, States:`, stats);
    });
  }

  // Public methods for monitoring
  getDecisions(symbol?: string, limit: number = 100): DecisionRecord[] {
    let filtered = this.decisions;

    if (symbol) {
      filtered = filtered.filter(d => d.symbol === symbol);
    }

    return filtered.slice(-limit).reverse();
  }

  getStateMachineStats() {
    return {
      states: this.stateMachine.getStateStats(),
      transitions: this.stateMachine.getTransitionHistory(undefined, 50),
      contexts: this.stateMachine.getAllContexts()
    };
  }

  getRunningStatus(): boolean {
    return this.isRunning;
  }

  private async performAfterHoursAnalysis(session: MarketSession): Promise<void> {
    try {
      // Perform deep analysis without trading pressure
      const watchlist: string[] = [];
      let analysisCount = 0;
      const maxAnalysisPerCycle = 10; // Limit to avoid overwhelming logs

      for (const symbol of this.config.symbols.slice(0, maxAnalysisPerCycle)) {
        const indicators = this.indicators.get(symbol);
        if (!indicators) continue;

        const signals = indicators.getSignals();
        const confidence = calculateConfidenceScores(signals);

        // Identify high-potential stocks for tomorrow
        const overallConfidence = Math.max(confidence.buy, confidence.sell);
        if (overallConfidence > 0.65) {
          watchlist.push(symbol);
        }

        // Log detailed after-hours analysis occasionally
        if (analysisCount % 3 === 0) {
          console.log(`[${symbol}] after-hours → analyzing: 📊 RSI: ${(signals.rsi * 100).toFixed(1)}%, momentum: ${(signals.momentum * 100).toFixed(1)}%, confidence: ${(overallConfidence * 100).toFixed(1)}% - ${session.message}`);
        }

        analysisCount++;
      }

      // Log watchlist summary periodically
      if (watchlist.length > 0 && Date.now() % 120000 < 15000) { // Every 2 minutes
        console.log(`🎯 After-hours watchlist (${watchlist.length}): ${watchlist.slice(0, 5).join(', ')}${watchlist.length > 5 ? '...' : ''} - Market opens in ${session.timeUntilNext}`);
      }

    } catch (error) {
      console.error('After-hours analysis error:', error);
    }
  }

  private async logMarketAwareStatus(positions: Position[], session: MarketSession): Promise<void> {
    try {
      const account = await this.broker.getAccount();
      const portfolio = account.equity;
      const pnl = portfolio - this.startOfDayValue;
      const pnlPct = ((pnl / this.startOfDayValue) * 100);

      console.log(`📈 ${session.message}`);
      console.log(`💰 Portfolio: $${portfolio.toFixed(2)} (${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}, ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%)`);
      console.log(`📊 Positions: ${positions.length}, Next: ${session.status === 'market-hours' ? 'close' : 'open'} in ${session.timeUntilNext}`);

      // Show different insights based on market session
      if (session.status === 'after-hours') {
        console.log(`🌆 After-hours mode: Building watchlist for tomorrow's pre-market`);
      } else if (session.status === 'pre-market') {
        console.log(`🌅 Pre-market mode: Monitoring overnight news and gap analysis`);
      } else if (session.status === 'closed') {
        if (session.timeUntilNext.includes('d')) {
          console.log(`📅 Weekend mode: Fundamental analysis and weekly planning`);
        } else {
          console.log(`🌙 Overnight mode: Processing daily moves and sector rotation`);
        }
      }
    } catch (error) {
      console.error('Error getting portfolio value:', error);
    }
  }

  // Method to get current market session (for external monitoring)
  getCurrentMarketSession(): MarketSession {
    return MarketHours.getCurrentSession();
  }
}
