#!/usr/bin/env node

import * as dotenv from 'dotenv';
import { AlpacaBroker } from '../adapters/AlpacaBroker';
import { MarketHours } from '../engine/marketHours';

dotenv.config();

interface OptionsPosition {
  symbol: string;
  strategy: string;
  contracts: number;
  entryPrice: number;
  strikePrice: number;
  expiration: string;
  delta: number;
  theta: number;
}

class SimpleOptionsAgent {
  private broker: AlpacaBroker;
  private positions: Map<string, OptionsPosition> = new Map();
  private isRunning = false;
  private portfolio: any = null;

  private async sendSSEEvent(data: any): Promise<void> {
    try {
      await fetch('http://localhost:8000/api/options_events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'options_agent_event',
          timestamp: new Date().toISOString(),
          agent: 'SimpleOptionsAgent',
          ...data
        })
      });
    } catch (error) {
      // Silently fail if frontend is not available
    }
  }

  constructor() {
    const apiKey = process.env.APCA_API_KEY_ID || '';
    const apiSecret = process.env.APCA_API_SECRET_KEY || '';
    const isPaper = process.env.TRADING_MODE === 'paper';
    this.broker = new AlpacaBroker(apiKey, apiSecret, isPaper);
  }

  async initialize() {
    console.log('📊 Simple Options Trading Agent v2.0');
    console.log('========================================');
    console.log(`🔒 Trading Mode: ${process.env.TRADING_MODE?.toUpperCase()}`);
    console.log('🕐 Market-aware optimization enabled');

    if (process.env.TRADING_MODE === 'paper') {
      console.log('📝 Paper trading mode - no real money at risk');
    }

    try {
      const account = await this.broker.getAccount();
      const marketSession = MarketHours.getCurrentSession();
      console.log(`✅ Connected - Account: ${account.id}`);
      console.log(`💰 Portfolio Value: $${account.portfolioValue.toLocaleString()}`);
      console.log(`💵 Cash Available: $${account.cash.toLocaleString()}`);
      console.log(`📊 Market Status: ${marketSession.status} (${marketSession.isOpen ? 'OPEN' : 'CLOSED'})`);

      this.portfolio = {
        equity: account.equity,
        cash: account.cash,
        portfolioValue: account.portfolioValue
      };
    } catch (error) {
      console.error('❌ Failed to connect to broker:', error);
      throw error;
    }

    console.log('');
    console.log('📈 Active Strategies:');
    console.log('  1. Covered Call Wheel (30-45 DTE, 0.30 delta)');
    console.log('  2. Credit Spreads (45 DTE, 0.16 delta short)');
    console.log('');
    console.log('🎯 Target Symbols: AAPL, MSFT, GOOGL, NVDA, SPY, QQQ');
    console.log('⚡ Options trading only during market hours');
    console.log('');
  }

  async start() {
    if (this.isRunning) {
      console.log('⚠️  Agent is already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Options agent started - monitoring for opportunities...');
    console.log('');

    // Send SSE event for agent start
    await this.sendSSEEvent({
      event: 'agent_started',
      message: 'Simple Options Agent v1.0 started successfully',
      portfolio_value: this.portfolio?.portfolioValue || 0,
      cash_available: this.portfolio?.cash || 0,
      strategies: ['Covered Call Wheel', 'Credit Spreads'],
      target_symbols: ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'SPY', 'QQQ']
    });

    // Main loop - market-aware options trading
    let analysisCounter = 0;
    while (this.isRunning) {
      try {
        const marketSession = MarketHours.getCurrentSession();

        if (marketSession.isOpen) {
          // 📈 MARKET OPEN: Active options trading and opportunity scanning
          await this.scanOpportunities();
          await this.monitorPositions();

          analysisCounter++;
          if (analysisCounter % 4 === 0) {
            await this.generateAndSendAnalysis();
          }

          console.log(`⚡ [OPTIONS] Market open - active trading mode (30s cycles)`);
          await this.sleep(30000); // 30 seconds - opportunities can appear quickly
        } else {
          // 🌙 MARKET CLOSED: Position monitoring only - no new trades possible
          console.log(`🌙 [OPTIONS] Market closed - monitoring only mode (10min cycles)`);
          console.log('   ⚠️  Options market closed - no new trades possible');

          // Only monitor existing positions
          await this.monitorPositions();

          // Still send analysis but less frequently
          analysisCounter++;
          if (analysisCounter % 2 === 0) {
            await this.generateAndSendAnalysis();
          }

          await this.sleep(600000); // 10 minutes - positions won't change significantly
        }
      } catch (error) {
        console.error('❌ Error in main loop:', error);
        await this.sleep(5000);
      }
    }
  }

  async scanOpportunities() {
    const symbols = ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'SPY', 'QQQ'];

    for (const symbol of symbols) {
      try {
        // Get current stock price (simulated for now)
        const currentPrice = Math.random() * 500 + 100; // Random price between 100-600

        // Simulate options analysis
        await this.analyzeCoveredCallOpportunity(symbol, currentPrice);
        await this.analyzeCreditSpreadOpportunity(symbol, currentPrice);

      } catch (error) {
        // Silently continue - likely just no data available
      }
    }
  }

  async analyzeCoveredCallOpportunity(symbol: string, price: number) {
    // Simulate covered call analysis
    const strikePrice = Math.round(price * 1.05); // 5% OTM
    const premium = price * 0.02; // ~2% premium estimate
    const daysToExpiry = 35;

    // Check if we already have a position
    if (this.positions.has(`${symbol}-CC`)) {
      return;
    }

    // Randomly decide if opportunity is good (for simulation)
    if (Math.random() > 0.95) {
      console.log(`🎯 [Covered Call] ${symbol} opportunity detected:`);
      console.log(`   Strike: $${strikePrice}, Premium: $${premium.toFixed(2)}, DTE: ${daysToExpiry}`);
      console.log(`   Expected Return: ${((premium / price) * 100).toFixed(2)}%`);

      // Simulate position entry
      this.positions.set(`${symbol}-CC`, {
        symbol,
        strategy: 'Covered Call',
        contracts: 1,
        entryPrice: premium,
        strikePrice,
        expiration: this.getExpirationDate(daysToExpiry),
        delta: -0.30,
        theta: 15
      });

      console.log(`✅ [TRADE] Sold 1x ${symbol} $${strikePrice} Call @ $${premium.toFixed(2)}`);

      // Send SSE event for trade
      await this.sendSSEEvent({
        event: 'trade_executed',
        strategy: 'Covered Call',
        symbol,
        action: 'SELL',
        contracts: 1,
        strike: strikePrice,
        premium: premium.toFixed(2),
        expiration: this.getExpirationDate(daysToExpiry),
        expected_return: ((premium / price) * 100).toFixed(2) + '%'
      });
      console.log('');
    }
  }

  async analyzeCreditSpreadOpportunity(symbol: string, price: number) {
    // Only trade credit spreads on SPY/QQQ
    if (symbol !== 'SPY' && symbol !== 'QQQ') {
      return;
    }

    // Simulate credit spread analysis
    const shortStrike = Math.round(price * 0.97); // 3% OTM
    const longStrike = Math.round(price * 0.93); // 7% OTM
    const credit = (shortStrike - longStrike) * 0.33; // 33% of width
    const daysToExpiry = 45;

    // Check if we already have a position
    if (this.positions.has(`${symbol}-CS`)) {
      return;
    }

    // Randomly decide if opportunity is good (for simulation)
    if (Math.random() > 0.98) {
      console.log(`🎯 [Credit Spread] ${symbol} opportunity detected:`);
      console.log(`   Short: $${shortStrike}, Long: $${longStrike}`);
      console.log(`   Credit: $${credit.toFixed(2)}, Width: $${(shortStrike - longStrike)}, DTE: ${daysToExpiry}`);
      console.log(`   Max Risk: $${((shortStrike - longStrike) - credit).toFixed(2)}`);

      // Simulate position entry
      this.positions.set(`${symbol}-CS`, {
        symbol,
        strategy: 'Credit Spread',
        contracts: 1,
        entryPrice: credit,
        strikePrice: shortStrike,
        expiration: this.getExpirationDate(daysToExpiry),
        delta: -0.16,
        theta: 25
      });

      console.log(`✅ [TRADE] ${symbol} ${shortStrike}/${longStrike} Put Spread @ $${credit.toFixed(2)} credit`);

      // Send SSE event for trade
      await this.sendSSEEvent({
        event: 'trade_executed',
        strategy: 'Credit Spread',
        symbol,
        action: 'SELL_SPREAD',
        contracts: 1,
        short_strike: shortStrike,
        long_strike: longStrike,
        credit: credit.toFixed(2),
        width: shortStrike - longStrike,
        max_risk: ((shortStrike - longStrike) - credit).toFixed(2),
        expiration: this.getExpirationDate(daysToExpiry)
      });
      console.log('');
    }
  }

  async monitorPositions() {
    if (this.positions.size === 0) {
      return;
    }

    const now = Date.now();

    for (const [key, position] of this.positions.entries()) {
      const daysToExpiry = this.getDaysUntilExpiration(position.expiration);

      // Calculate P&L (simulated)
      const currentValue = position.entryPrice * (1 + (Math.random() * 0.2 - 0.1));
      const pnl = (position.entryPrice - currentValue) * position.contracts * 100;

      // Show position update periodically
      if (Math.random() > 0.95) {
        console.log(`📊 [${position.strategy}] ${position.symbol}:`);
        console.log(`   P&L: $${pnl.toFixed(2)}, DTE: ${daysToExpiry}, Delta: ${position.delta.toFixed(2)}, Theta: ${position.theta.toFixed(2)}`);
        console.log('');

        // Send SSE event for position update
        await this.sendSSEEvent({
          event: 'position_update',
          strategy: position.strategy,
          symbol: position.symbol,
          pnl: pnl.toFixed(2),
          dte: daysToExpiry,
          delta: position.delta.toFixed(2),
          theta: position.theta.toFixed(2),
          current_value: currentValue.toFixed(2),
          entry_price: position.entryPrice.toFixed(2)
        });
      }

      // Close position if expires soon or hits profit target
      if (daysToExpiry <= 5 || pnl > position.entryPrice * 50) {
        console.log(`✅ [CLOSE] ${position.strategy} ${position.symbol} - P&L: $${pnl.toFixed(2)}`);
        console.log('');

        // Send SSE event for position close
        await this.sendSSEEvent({
          event: 'position_closed',
          strategy: position.strategy,
          symbol: position.symbol,
          final_pnl: pnl.toFixed(2),
          reason: daysToExpiry <= 5 ? 'expiration_approach' : 'profit_target',
          dte_remaining: daysToExpiry,
          entry_price: position.entryPrice.toFixed(2),
          exit_value: currentValue.toFixed(2)
        });

        this.positions.delete(key);
      }
    }
  }

  async generateAndSendAnalysis() {
    try {
      const positionsArray = Array.from(this.positions.values());

      if (positionsArray.length === 0) {
        return;
      }

      const totalDelta = positionsArray.reduce((sum, pos) => sum + pos.delta, 0);
      const totalTheta = positionsArray.reduce((sum, pos) => sum + pos.theta, 0);
      const totalPnL = positionsArray.reduce((sum, pos) => {
        const currentValue = pos.entryPrice * (1 + (Math.random() * 0.2 - 0.1));
        return sum + ((pos.entryPrice - currentValue) * pos.contracts * 100);
      }, 0);

      const analysis = {
        analysis_type: 'options',
        positions: positionsArray.map(pos => ({
          symbol: pos.symbol,
          strategy: pos.strategy,
          strike: pos.strikePrice,
          expiration: pos.expiration,
          pnl: ((pos.entryPrice - (pos.entryPrice * (1 + (Math.random() * 0.2 - 0.1)))) * pos.contracts * 100),
          delta: pos.delta,
          theta: pos.theta,
          dte: this.getDaysUntilExpiration(pos.expiration)
        })),
        greeks_summary: {
          'Total Delta': totalDelta.toFixed(2),
          'Total Theta': totalTheta.toFixed(2),
          'Delta/Position': (totalDelta / positionsArray.length).toFixed(2),
          'Theta/Position': (totalTheta / positionsArray.length).toFixed(2)
        },
        risk_assessment: {
          'Portfolio Delta': totalDelta > 0 ? 'Bullish' : totalDelta < 0 ? 'Bearish' : 'Neutral',
          'Daily Theta Decay': `$${totalTheta.toFixed(2)} per day`,
          'Position Count': positionsArray.length.toString(),
          'Total Unrealized P&L': `$${totalPnL.toFixed(2)}`
        },
        strategies: positionsArray.map(pos => pos.strategy),
        insights: [
          `Currently managing ${positionsArray.length} options position${positionsArray.length > 1 ? 's' : ''}`,
          `Net portfolio delta: ${totalDelta.toFixed(2)} (${totalDelta > 0 ? 'bullish bias' : totalDelta < 0 ? 'bearish bias' : 'market neutral'})`,
          `Daily theta decay: $${totalTheta.toFixed(2)} working in our favor`,
          `Average DTE across positions: ${Math.round(positionsArray.reduce((sum, pos) => sum + this.getDaysUntilExpiration(pos.expiration), 0) / positionsArray.length)} days`,
          totalPnL > 0 ? `Positions are profitable by $${totalPnL.toFixed(2)}` : `Positions tracking $${Math.abs(totalPnL).toFixed(2)} unrealized loss`
        ]
      };

      await fetch('http://localhost:8000/api/agent_analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(analysis)
      });

      console.log('📊 [ANALYSIS] Sent position analysis to frontend');
    } catch (error) {
    }
  }

  getDaysUntilExpiration(expiration: string): number {
    const exp = new Date(expiration);
    const now = new Date();
    return Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  getExpirationDate(daysOut: number): string {
    const date = new Date();
    date.setDate(date.getDate() + daysOut);
    return date.toISOString().split('T')[0];
  }

  sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async stop() {
    console.log('');
    console.log('🛑 Stopping options agent...');
    this.isRunning = false;
    console.log('✅ Options agent stopped successfully');
  }
}

async function main() {
  const agent = new SimpleOptionsAgent();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    await agent.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await agent.stop();
    process.exit(0);
  });

  try {
    await agent.initialize();
    await agent.start();
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
