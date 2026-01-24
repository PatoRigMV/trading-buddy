export interface RiskLimits {
  maxRiskPerTrade: number;        // % of equity per trade (e.g., 0.01 = 1%)
  maxDailyLoss: number;           // % max daily loss (e.g., 0.03 = 3%)
  maxPositions: number;           // Maximum concurrent positions
  maxExposurePerSymbol: number;   // % max exposure per symbol (e.g., 0.10 = 10%)
  maxTotalExposure: number;       // % max total exposure (e.g., 0.80 = 80%)
  // Drawdown-aware scaling
  drawdownThresholds: number[];   // Drawdown levels for scaling (e.g., [0.05, 0.10, 0.15])
  drawdownScaling: number[];      // Risk scaling factors (e.g., [0.8, 0.5, 0.2])
  maxDrawdown: number;           // Maximum drawdown before stop (e.g., 0.20 = 20%)

  // ChatGPT Critical Add-Ons
  circuitBreakerCautious: number; // Daily loss % to enter cautious mode (e.g., 0.02 = 2%)
  circuitBreakerHalt: number;     // Daily loss % to halt all new entries (e.g., 0.04 = 4%)
  maxOpenRisk: number;            // Max total open risk % (sum of all stop distances, e.g., 0.06 = 6%)
  maxTradesPerDay: number;        // Maximum trades per day (e.g., 20)
  minAccountValue: number;        // PDT awareness - if below $25k limit day trades
  symbolCooldownMinutes: number;  // Minutes to wait after exiting position (e.g., 45)

  // ATR-based stops
  atrStopMultiplier: number;      // ATR multiplier for stops (e.g., 1.5-2.5)
  trailingStopATR: number;        // ATR for trailing stops (e.g., 1.0)
  trailingActivationATR: number;  // ATR move before activating trailing (e.g., 0.75)

  // Pyramiding controls
  allowPyramiding?: boolean;      // Allow adding to existing positions
  maxPyramidLevels?: number;      // Maximum pyramid levels (e.g., 3)
  pyramidSizeMultiplier?: number; // Size reduction for pyramids (e.g., 0.5)

  // Liquidity and microstructure
  minPrice: number;               // Minimum stock price (e.g., 3.0)
  minDailyVolume: number;         // Minimum daily dollar volume (e.g., 10000000 = $10M)
  maxSpreadBps: number;           // Maximum bid-ask spread in bps (e.g., 10)

  // Time filters
  avoidFirstMinutes: number;      // Avoid first N minutes of trading (e.g., 10)
  avoidLastMinutes: number;       // Avoid last N minutes of trading (e.g., 10)
  earningsBlackoutDays: number;   // Days before/after earnings to avoid (e.g., 2)
}

export interface Position {
  symbol: string;
  quantity: number;
  avgPrice: number;
  marketValue: number;
  unrealizedPnL: number;
  side: 'long' | 'short';
}

export interface RiskMetrics {
  dailyPnL: number;
  totalExposure: number;
  positionCount: number;
  largestPosition: number;
  portfolioValue: number;
  // Drawdown metrics
  currentDrawdown: number;       // Current drawdown from peak
  peakValue: number;            // Historical peak portfolio value
  drawdownScaleFactor: number;  // Current risk scaling factor

  // Circuit breaker metrics
  dailyLossPercent: number;      // Daily loss as percentage
  isCautiousMode: boolean;       // True if in cautious mode (2% loss)
  isHaltMode: boolean;           // True if halting new entries (4% loss)
  totalOpenRisk: number;         // Sum of all open position risks
  totalOpenRiskPercent: number;  // Open risk as % of portfolio
  tradesExecutedToday: number;   // Number of trades today
  isWithinTradingWindow: boolean; // True if within allowed trading hours
}

export interface TradeRiskAssessment {
  approved: boolean;
  reason?: string;
  suggestedSize?: number;
  stopLoss?: number;
  riskAmount?: number;
}

export class RiskManager {
  private limits: RiskLimits;
  private startOfDayValue: number;
  private peakValue: number;
  private dailyTradeCount: number = 0;
  private lastTradeDate: string = '';
  private symbolCooldowns: Map<string, Date> = new Map();

  constructor(limits: RiskLimits, startOfDayValue: number) {
    this.limits = limits;
    this.startOfDayValue = startOfDayValue;
    this.peakValue = startOfDayValue;
    this.resetDailyCountersIfNeeded();
  }

  assessTrade(
    symbol: string,
    side: 'buy' | 'sell',
    quantity: number,
    price: number,
    currentPositions: Position[],
    portfolioValue: number,
    atr?: number
  ): TradeRiskAssessment {

    this.resetDailyCountersIfNeeded();
    const metrics = this.calculateRiskMetrics(currentPositions, portfolioValue);

    // 1. Circuit Breaker Checks
    if (metrics.isHaltMode) {
      return {
        approved: false,
        reason: `Circuit breaker halt: Daily loss ${(metrics.dailyLossPercent * 100).toFixed(1)}% exceeds ${(this.limits.circuitBreakerHalt * 100)}% limit`
      };
    }

    // 2. Symbol Cooldown Check
    const cooldownCheck = this.checkSymbolCooldown(symbol);
    if (!cooldownCheck.approved) return cooldownCheck;

    // 3. Trading Window Check
    const tradingWindowCheck = this.checkTradingWindow();
    if (!tradingWindowCheck.approved) return tradingWindowCheck;

    // 4. Daily Trade Count Check
    const tradeCountCheck = this.checkDailyTradeCount();
    if (!tradeCountCheck.approved) return tradeCountCheck;

    // 5. Stock Quality Filters
    const qualityCheck = this.checkStockQuality(symbol, price);
    if (!qualityCheck.approved) return qualityCheck;

    // 6. Check daily loss limit (existing)
    const dailyLossCheck = this.checkDailyLoss(metrics);
    if (!dailyLossCheck.approved) return dailyLossCheck;

    // 7. Check open risk limit
    const openRiskCheck = this.checkOpenRisk(currentPositions, quantity, price, portfolioValue, atr);
    if (!openRiskCheck.approved) return openRiskCheck;

    // 8. Check position count limit (existing)
    const positionCountCheck = this.checkPositionCount(currentPositions, symbol);
    if (!positionCountCheck.approved) return positionCountCheck;

    // 9. Check exposure limits (existing)
    const exposureCheck = this.checkExposure(symbol, quantity, price, currentPositions, portfolioValue);
    if (!exposureCheck.approved) return exposureCheck;

    // 10. Check individual trade risk (existing)
    const tradeRiskCheck = this.checkTradeRisk(quantity, price, portfolioValue, atr);
    if (!tradeRiskCheck.approved) return tradeRiskCheck;

    // Apply cautious mode sizing if needed
    let finalQuantity = quantity;
    if (metrics.isCautiousMode) {
      finalQuantity = Math.floor(quantity * 0.5); // Halve position size in cautious mode
    }

    // All checks passed
    return {
      approved: true,
      suggestedSize: finalQuantity,
      stopLoss: this.calculateATRStopLoss(price, side, atr),
      riskAmount: this.calculateRiskAmount(finalQuantity, price, portfolioValue)
    };
  }

  calculateOptimalPositionSize(
    price: number,
    portfolioValue: number,
    atr?: number,
    confidenceScore: number = 0.5
  ): number {
    // Update peak value tracking
    this.updatePeakValue(portfolioValue);

    // Calculate drawdown scaling factor
    const drawdownScaleFactor = this.getDrawdownScaleFactor(portfolioValue);

    // Base size using fixed fractional method
    const baseRiskAmount = portfolioValue * this.limits.maxRiskPerTrade;

    // Apply drawdown scaling to base risk
    const drawdownAdjustedRiskAmount = baseRiskAmount * drawdownScaleFactor;

    // If we have ATR, use it for stop distance, otherwise use 2%
    const stopDistance = atr || (price * 0.02);
    const baseShares = Math.floor(drawdownAdjustedRiskAmount / stopDistance);

    // Scale by confidence (0.5 to 1.0 multiplier)
    const confidenceMultiplier = Math.max(0.5, Math.min(1.0, confidenceScore));
    const adjustedShares = Math.floor(baseShares * confidenceMultiplier);

    // Ensure we don't exceed symbol exposure limit
    const maxValueForSymbol = portfolioValue * this.limits.maxExposurePerSymbol;
    const maxSharesByExposure = Math.floor(maxValueForSymbol / price);

    return Math.min(adjustedShares, maxSharesByExposure);
  }

  private calculateRiskMetrics(positions: Position[], portfolioValue: number): RiskMetrics {
    this.updatePeakValue(portfolioValue);

    const dailyPnL = portfolioValue - this.startOfDayValue;
    const dailyLossPercent = dailyPnL / this.startOfDayValue;
    const totalExposure = positions.reduce((sum, pos) => sum + Math.abs(pos.marketValue), 0);
    const positionCount = positions.length;
    const largestPosition = positions.reduce((max, pos) =>
      Math.max(max, Math.abs(pos.marketValue)), 0
    );

    // Calculate total open risk (approximate)
    const totalOpenRisk = positions.reduce((sum, pos) => {
      const stopDistance = Math.abs(pos.marketValue) * 0.02; // Assume 2% stop
      return sum + stopDistance;
    }, 0);

    const currentDrawdown = (this.peakValue - portfolioValue) / this.peakValue;
    const drawdownScaleFactor = this.getDrawdownScaleFactor(portfolioValue);

    return {
      dailyPnL,
      totalExposure,
      positionCount,
      largestPosition,
      portfolioValue,
      currentDrawdown,
      peakValue: this.peakValue,
      drawdownScaleFactor,
      dailyLossPercent,
      isCautiousMode: dailyLossPercent <= -this.limits.circuitBreakerCautious,
      isHaltMode: dailyLossPercent <= -this.limits.circuitBreakerHalt,
      totalOpenRisk,
      totalOpenRiskPercent: totalOpenRisk / portfolioValue,
      tradesExecutedToday: this.dailyTradeCount,
      isWithinTradingWindow: this.isWithinTradingWindow()
    };
  }

  private checkDailyLoss(metrics: RiskMetrics): TradeRiskAssessment {
    const dailyLossPercent = metrics.dailyPnL / this.startOfDayValue;

    if (dailyLossPercent <= -this.limits.maxDailyLoss) {
      return {
        approved: false,
        reason: `Daily loss limit exceeded: ${(dailyLossPercent * 100).toFixed(2)}%`
      };
    }

    // Check maximum drawdown limit
    if (metrics.currentDrawdown >= this.limits.maxDrawdown) {
      return {
        approved: false,
        reason: `Maximum drawdown exceeded: ${(metrics.currentDrawdown * 100).toFixed(2)}%`
      };
    }

    return { approved: true };
  }

  private checkPositionCount(positions: Position[], symbol: string): TradeRiskAssessment {
    const existingPosition = positions.find(p => p.symbol === symbol);
    const effectivePositionCount = existingPosition ? positions.length : positions.length + 1;

    if (effectivePositionCount > this.limits.maxPositions) {
      return {
        approved: false,
        reason: `Maximum position count exceeded: ${effectivePositionCount} > ${this.limits.maxPositions}`
      };
    }

    return { approved: true };
  }

  private checkExposure(
    symbol: string,
    quantity: number,
    price: number,
    positions: Position[],
    portfolioValue: number
  ): TradeRiskAssessment {

    const tradeValue = quantity * price;
    const existingPosition = positions.find(p => p.symbol === symbol);
    const newSymbolExposure = tradeValue + (existingPosition?.marketValue || 0);

    // Check per-symbol exposure
    const symbolExposurePercent = newSymbolExposure / portfolioValue;
    if (symbolExposurePercent > this.limits.maxExposurePerSymbol) {
      return {
        approved: false,
        reason: `Symbol exposure limit exceeded: ${(symbolExposurePercent * 100).toFixed(2)}%`
      };
    }

    // Check total exposure
    const currentTotalExposure = positions.reduce((sum, pos) => sum + Math.abs(pos.marketValue), 0);
    const newTotalExposure = currentTotalExposure + tradeValue;
    const totalExposurePercent = newTotalExposure / portfolioValue;

    if (totalExposurePercent > this.limits.maxTotalExposure) {
      return {
        approved: false,
        reason: `Total exposure limit exceeded: ${(totalExposurePercent * 100).toFixed(2)}%`
      };
    }

    return { approved: true };
  }

  private checkTradeRisk(
    quantity: number,
    price: number,
    portfolioValue: number,
    atr?: number
  ): TradeRiskAssessment {

    const tradeValue = quantity * price;
    const stopDistance = atr || (price * 0.02);
    const riskAmount = quantity * stopDistance;
    const riskPercent = riskAmount / portfolioValue;

    if (riskPercent > this.limits.maxRiskPerTrade) {
      // Suggest a smaller size
      const maxRiskAmount = portfolioValue * this.limits.maxRiskPerTrade;
      const suggestedQuantity = Math.floor(maxRiskAmount / stopDistance);

      return {
        approved: false,
        reason: `Trade risk too high: ${(riskPercent * 100).toFixed(2)}%`,
        suggestedSize: suggestedQuantity
      };
    }

    return { approved: true };
  }

  private calculateStopLoss(price: number, side: 'buy' | 'sell', atr?: number): number {
    const stopDistance = atr || (price * 0.02);

    if (side === 'buy') {
      return price - stopDistance;
    } else {
      return price + stopDistance;
    }
  }

  private calculateRiskAmount(quantity: number, price: number, portfolioValue: number): number {
    const tradeValue = quantity * price;
    return tradeValue * this.limits.maxRiskPerTrade;
  }

  updateStartOfDayValue(value: number): void {
    this.startOfDayValue = value;
    // Also update peak value if this is higher
    this.updatePeakValue(value);
  }

  getCurrentRiskMetrics(positions: Position[], portfolioValue: number): RiskMetrics {
    return this.calculateRiskMetrics(positions, portfolioValue);
  }

  /**
   * Update peak portfolio value for drawdown calculation
   */
  private updatePeakValue(portfolioValue: number): void {
    if (portfolioValue > this.peakValue) {
      this.peakValue = portfolioValue;
    }
  }

  /**
   * Calculate the current drawdown scaling factor based on portfolio value
   */
  private getDrawdownScaleFactor(portfolioValue: number): number {
    const currentDrawdown = (this.peakValue - portfolioValue) / this.peakValue;

    // Find the appropriate scaling factor based on drawdown thresholds
    for (let i = 0; i < this.limits.drawdownThresholds.length; i++) {
      if (currentDrawdown >= this.limits.drawdownThresholds[i]) {
        return this.limits.drawdownScaling[i];
      }
    }

    // No drawdown scaling needed
    return 1.0;
  }

  /**
   * Reset peak value (e.g., at start of new trading period)
   */
  resetPeakValue(newPeakValue: number): void {
    this.peakValue = newPeakValue;
  }

  /**
   * Check if symbol is in cooldown period after recent exit
   */
  private checkSymbolCooldown(symbol: string): TradeRiskAssessment {
    const cooldownUntil = this.symbolCooldowns.get(symbol);
    if (cooldownUntil && new Date() < cooldownUntil) {
      const remainingMinutes = Math.ceil((cooldownUntil.getTime() - Date.now()) / 60000);
      return {
        approved: false,
        reason: `Symbol ${symbol} in cooldown for ${remainingMinutes} more minutes`
      };
    }
    return { approved: true };
  }

  /**
   * Check if within allowed trading window (avoid first/last minutes)
   */
  private checkTradingWindow(): TradeRiskAssessment {
    if (!this.isWithinTradingWindow()) {
      return {
        approved: false,
        reason: `Outside trading window: avoiding first ${this.limits.avoidFirstMinutes}min and last ${this.limits.avoidLastMinutes}min`
      };
    }
    return { approved: true };
  }

  /**
   * Check daily trade count limit
   */
  private checkDailyTradeCount(): TradeRiskAssessment {
    if (this.dailyTradeCount >= this.limits.maxTradesPerDay) {
      return {
        approved: false,
        reason: `Daily trade limit reached: ${this.dailyTradeCount}/${this.limits.maxTradesPerDay}`
      };
    }
    return { approved: true };
  }

  /**
   * Check stock quality filters (price, volume, etc.)
   */
  private checkStockQuality(symbol: string, price: number): TradeRiskAssessment {
    if (price < this.limits.minPrice) {
      return {
        approved: false,
        reason: `Price $${price.toFixed(2)} below minimum $${this.limits.minPrice}`
      };
    }
    // Note: Volume and spread checks would require additional data
    return { approved: true };
  }

  /**
   * Check total open risk limit
   */
  private checkOpenRisk(
    positions: Position[],
    quantity: number,
    price: number,
    portfolioValue: number,
    atr?: number
  ): TradeRiskAssessment {
    const currentOpenRisk = positions.reduce((sum, pos) => {
      const stopDistance = Math.abs(pos.marketValue) * 0.02; // Assume 2% stop
      return sum + stopDistance;
    }, 0);

    const newTradeRisk = quantity * (atr || price * 0.02);
    const totalOpenRisk = currentOpenRisk + newTradeRisk;
    const openRiskPercent = totalOpenRisk / portfolioValue;

    if (openRiskPercent > this.limits.maxOpenRisk) {
      return {
        approved: false,
        reason: `Open risk ${(openRiskPercent * 100).toFixed(1)}% exceeds limit ${(this.limits.maxOpenRisk * 100)}%`
      };
    }
    return { approved: true };
  }

  /**
   * Calculate ATR-based stop loss
   */
  private calculateATRStopLoss(price: number, side: 'buy' | 'sell', atr?: number): number {
    const stopDistance = atr ? (atr * this.limits.atrStopMultiplier) : (price * 0.02);

    if (side === 'buy') {
      return price - stopDistance;
    } else {
      return price + stopDistance;
    }
  }

  /**
   * Check if within trading window
   */
  private isWithinTradingWindow(): boolean {
    const now = new Date();
    const marketOpen = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 30, 0); // 9:30 AM ET
    const marketClose = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 16, 0, 0); // 4:00 PM ET

    const avoidUntil = new Date(marketOpen.getTime() + this.limits.avoidFirstMinutes * 60000);
    const avoidAfter = new Date(marketClose.getTime() - this.limits.avoidLastMinutes * 60000);

    return now >= avoidUntil && now <= avoidAfter;
  }

  /**
   * Reset daily counters if new trading day
   */
  private resetDailyCountersIfNeeded(): void {
    const today = new Date().toDateString();
    if (this.lastTradeDate !== today) {
      this.dailyTradeCount = 0;
      this.lastTradeDate = today;
      // Clean up old cooldowns
      const now = new Date();
      for (const [symbol, cooldownUntil] of this.symbolCooldowns.entries()) {
        if (now >= cooldownUntil) {
          this.symbolCooldowns.delete(symbol);
        }
      }
    }
  }

  /**
   * Record trade execution and start cooldown
   */
  recordTradeExecution(symbol: string): void {
    this.dailyTradeCount++;
    const cooldownUntil = new Date(Date.now() + this.limits.symbolCooldownMinutes * 60000);
    this.symbolCooldowns.set(symbol, cooldownUntil);
  }

  /**
   * Get current trading mode status
   */
  getTradingMode(): 'normal' | 'cautious' | 'halt' {
    const dailyLossPercent = (this.startOfDayValue - this.startOfDayValue) / this.startOfDayValue;

    if (dailyLossPercent <= -this.limits.circuitBreakerHalt) {
      return 'halt';
    } else if (dailyLossPercent <= -this.limits.circuitBreakerCautious) {
      return 'cautious';
    }
    return 'normal';
  }
}
