#!/usr/bin/env node

import * as fs from 'fs';
import * as yaml from 'yaml';
import { YahooMarketData } from '../data/YahooData';
import { TechnicalIndicators } from '../engine/indicators';
import { calculateConfidenceScores } from '../engine/scorer';
import { RiskManager } from '../engine/risk';
import { TESTING_RISK_LIMITS } from '../engine/defaultConfigs';

interface BacktestConfig {
  symbols: string[];
  interval: string;
  risk: {
    per_trade: number;
    max_daily_loss: number;
    max_positions: number;
    max_exposure_symbol: number;
  };
  thresholds: {
    buy_enter: number;
    sell_exit: number;
  };
}

interface BacktestResult {
  symbol: string;
  startDate: Date;
  endDate: Date;
  initialCapital: number;
  finalValue: number;
  totalReturn: number;
  totalReturnPercent: number;
  trades: TradeResult[];
  metrics: {
    sharpeRatio: number;
    maxDrawdown: number;
    winRate: number;
    profitFactor: number;
    avgWin: number;
    avgLoss: number;
  };
}

interface TradeResult {
  symbol: string;
  entryDate: Date;
  exitDate: Date;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  side: 'buy' | 'sell';
  reason: string;
}

class Backtester {
  private config: BacktestConfig;
  private marketData: YahooMarketData;
  private initialCapital: number = 100000;

  constructor(config: BacktestConfig) {
    this.config = config;
    this.marketData = new YahooMarketData();
  }

  async runBacktest(symbol: string, startDate: Date, endDate: Date): Promise<BacktestResult> {
    console.log(`📊 Running backtest for ${symbol} from ${startDate.toDateString()} to ${endDate.toDateString()}`);

    // Get historical data
    const bars = await this.marketData.getHistoricalBars(
      symbol,
      this.config.interval,
      startDate,
      endDate
    );

    if (bars.length === 0) {
      throw new Error(`No data available for ${symbol}`);
    }

    console.log(`📈 Loaded ${bars.length} bars`);

    const indicators = new TechnicalIndicators(symbol);
    const trades: TradeResult[] = [];
    const riskManager = new RiskManager({
      ...TESTING_RISK_LIMITS,
      // Override with backtest config values
      maxRiskPerTrade: this.config.risk.per_trade,
      maxDailyLoss: this.config.risk.max_daily_loss,
      maxPositions: this.config.risk.max_positions,
      maxExposurePerSymbol: this.config.risk.max_exposure_symbol
    }, this.initialCapital);

    let portfolioValue = this.initialCapital;
    let cash = this.initialCapital;
    let position: { quantity: number; avgPrice: number; entryDate: Date } | null = null;
    let portfolioHistory: number[] = [];

    // Process each bar
    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i];

      // Add bar to indicators
      indicators.addBar(bar);

      // Skip first 50 bars for indicator warmup
      if (i < 50) {
        portfolioHistory.push(portfolioValue);
        continue;
      }

      // Get signals and confidence
      const signals = indicators.getSignals();
      const confidence = calculateConfidenceScores(signals);

      // Calculate current portfolio value
      if (position) {
        const positionValue = position.quantity * bar.close;
        portfolioValue = cash + positionValue;
      } else {
        portfolioValue = cash;
      }
      portfolioHistory.push(portfolioValue);

      // Trading logic
      if (!position && confidence.buy >= this.config.thresholds.buy_enter) {
        // Enter position
        const positionSize = riskManager.calculateOptimalPositionSize(
          bar.close,
          portfolioValue,
          signals.atr,
          confidence.buy
        );

        if (positionSize > 0 && positionSize * bar.close <= cash) {
          position = {
            quantity: positionSize,
            avgPrice: bar.close,
            entryDate: bar.timestamp
          };
          cash -= positionSize * bar.close;

          console.log(`📈 BUY: ${positionSize} shares at $${bar.close.toFixed(2)} on ${bar.timestamp.toDateString()}`);
        }
      }
      else if (position && confidence.sell >= this.config.thresholds.sell_exit) {
        // Exit position
        const exitValue = position.quantity * bar.close;
        const pnl = exitValue - (position.quantity * position.avgPrice);
        const pnlPercent = (pnl / (position.quantity * position.avgPrice)) * 100;

        trades.push({
          symbol,
          entryDate: position.entryDate,
          exitDate: bar.timestamp,
          entryPrice: position.avgPrice,
          exitPrice: bar.close,
          quantity: position.quantity,
          pnl,
          pnlPercent,
          side: 'buy',
          reason: 'Sell signal'
        });

        cash += exitValue;
        position = null;

        console.log(`📉 SELL: ${trades[trades.length - 1].quantity} shares at $${bar.close.toFixed(2)}, P&L: $${pnl.toFixed(2)} (${pnlPercent.toFixed(1)}%)`);
      }
    }

    // Close any remaining position
    if (position && bars.length > 0) {
      const lastBar = bars[bars.length - 1];
      const exitValue = position.quantity * lastBar.close;
      const pnl = exitValue - (position.quantity * position.avgPrice);
      const pnlPercent = (pnl / (position.quantity * position.avgPrice)) * 100;

      trades.push({
        symbol,
        entryDate: position.entryDate,
        exitDate: lastBar.timestamp,
        entryPrice: position.avgPrice,
        exitPrice: lastBar.close,
        quantity: position.quantity,
        pnl,
        pnlPercent,
        side: 'buy',
        reason: 'End of backtest'
      });

      cash += exitValue;
    }

    const finalValue = cash;
    const totalReturn = finalValue - this.initialCapital;
    const totalReturnPercent = (totalReturn / this.initialCapital) * 100;

    // Calculate metrics
    const metrics = this.calculateMetrics(trades, portfolioHistory);

    return {
      symbol,
      startDate,
      endDate,
      initialCapital: this.initialCapital,
      finalValue,
      totalReturn,
      totalReturnPercent,
      trades,
      metrics
    };
  }

  private calculateMetrics(trades: TradeResult[], portfolioHistory: number[]): BacktestResult['metrics'] {
    if (trades.length === 0) {
      return {
        sharpeRatio: 0,
        maxDrawdown: 0,
        winRate: 0,
        profitFactor: 0,
        avgWin: 0,
        avgLoss: 0
      };
    }

    // Win rate
    const winningTrades = trades.filter(t => t.pnl > 0);
    const losingTrades = trades.filter(t => t.pnl < 0);
    const winRate = (winningTrades.length / trades.length) * 100;

    // Average win/loss
    const avgWin = winningTrades.length > 0 ?
      winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length : 0;
    const avgLoss = losingTrades.length > 0 ?
      Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length) : 0;

    // Profit factor
    const totalWins = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
    const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : 0;

    // Max drawdown
    let maxDrawdown = 0;
    let peak = portfolioHistory[0];

    for (const value of portfolioHistory) {
      if (value > peak) {
        peak = value;
      }
      const drawdown = (peak - value) / peak;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    // Simplified Sharpe ratio calculation
    const returns = portfolioHistory.map((value, i) =>
      i > 0 ? (value - portfolioHistory[i - 1]) / portfolioHistory[i - 1] : 0
    ).slice(1);

    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const stdDev = Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
    );
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // Annualized

    return {
      sharpeRatio,
      maxDrawdown: maxDrawdown * 100,
      winRate,
      profitFactor,
      avgWin,
      avgLoss
    };
  }

  generateReport(results: BacktestResult[]): void {
    console.log('\\n' + '='.repeat(60));
    console.log('📊 BACKTEST REPORT');
    console.log('='.repeat(60));

    for (const result of results) {
      console.log(`\\n📈 ${result.symbol} Results:`);
      console.log(`   Period: ${result.startDate.toDateString()} to ${result.endDate.toDateString()}`);
      console.log(`   Initial Capital: $${result.initialCapital.toLocaleString()}`);
      console.log(`   Final Value: $${result.finalValue.toLocaleString()}`);
      console.log(`   Total Return: $${result.totalReturn.toLocaleString()} (${result.totalReturnPercent.toFixed(2)}%)`);
      console.log(`   Total Trades: ${result.trades.length}`);

      console.log(`\\n📊 Metrics:`);
      console.log(`   Sharpe Ratio: ${result.metrics.sharpeRatio.toFixed(2)}`);
      console.log(`   Max Drawdown: ${result.metrics.maxDrawdown.toFixed(2)}%`);
      console.log(`   Win Rate: ${result.metrics.winRate.toFixed(1)}%`);
      console.log(`   Profit Factor: ${result.metrics.profitFactor.toFixed(2)}`);
      console.log(`   Avg Win: $${result.metrics.avgWin.toFixed(2)}`);
      console.log(`   Avg Loss: $${result.metrics.avgLoss.toFixed(2)}`);

      // Show last 5 trades
      if (result.trades.length > 0) {
        console.log(`\\n🔄 Last ${Math.min(5, result.trades.length)} Trades:`);
        const recentTrades = result.trades.slice(-5);
        for (const trade of recentTrades) {
          const emoji = trade.pnl > 0 ? '✅' : '❌';
          console.log(`   ${emoji} ${trade.entryDate.toDateString()}: $${trade.entryPrice.toFixed(2)} → $${trade.exitPrice.toFixed(2)} (${trade.pnlPercent.toFixed(1)}%)`);
        }
      }
    }

    // Overall summary if multiple symbols
    if (results.length > 1) {
      const totalInitial = results.reduce((sum, r) => sum + r.initialCapital, 0);
      const totalFinal = results.reduce((sum, r) => sum + r.finalValue, 0);
      const totalReturn = totalFinal - totalInitial;
      const totalReturnPercent = (totalReturn / totalInitial) * 100;

      console.log(`\\n🎯 OVERALL PORTFOLIO:`);
      console.log(`   Total Initial: $${totalInitial.toLocaleString()}`);
      console.log(`   Total Final: $${totalFinal.toLocaleString()}`);
      console.log(`   Total Return: $${totalReturn.toLocaleString()} (${totalReturnPercent.toFixed(2)}%)`);
    }
  }
}

async function main() {
  console.log('📈 Trading Agent Backtester v0.1.0');

  // Parse command line arguments
  const args = process.argv.slice(2);
  const configIndex = args.indexOf('--config');
  const fromIndex = args.indexOf('--from');
  const toIndex = args.indexOf('--to');

  const configPath = configIndex !== -1 ? args[configIndex + 1] : 'config/strategy.yaml';
  const fromDate = fromIndex !== -1 ? new Date(args[fromIndex + 1]) : new Date('2023-01-01');
  const toDate = toIndex !== -1 ? new Date(args[toIndex + 1]) : new Date('2024-12-31');

  // Load configuration
  console.log(`📋 Loading config from: ${configPath}`);
  const configContent = fs.readFileSync(configPath, 'utf8');
  const config: BacktestConfig = yaml.parse(configContent);

  console.log(`📅 Backtest period: ${fromDate.toDateString()} to ${toDate.toDateString()}`);
  console.log(`🎯 Symbols: ${config.symbols.join(', ')}`);

  const backtester = new Backtester(config);
  const results: BacktestResult[] = [];

  try {
    // Run backtest for each symbol
    for (const symbol of config.symbols) {
      const result = await backtester.runBacktest(symbol, fromDate, toDate);
      results.push(result);
    }

    // Generate and display report
    backtester.generateReport(results);

    // Save results to file
    const timestamp = new Date().toISOString().split('T')[0];
    const reportPath = `backtest_results_${timestamp}.json`;
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`\\n💾 Results saved to: ${reportPath}`);

  } catch (error) {
    console.error('❌ Backtest failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
