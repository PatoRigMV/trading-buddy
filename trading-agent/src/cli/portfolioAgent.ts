#!/usr/bin/env node

import * as dotenv from 'dotenv';
import { AlpacaBroker } from '../adapters/AlpacaBroker';
import { MarketHours } from '../engine/marketHours';
import { getMessageBus } from '../shared/AgentMessageBus';

dotenv.config();

class PortfolioAgent {
  private broker: AlpacaBroker;
  private isRunning = false;
  private messageBus = getMessageBus();
  private agentId = 'portfolio_agent';

  constructor() {
    const apiKey = process.env.APCA_API_KEY_ID || '';
    const apiSecret = process.env.APCA_API_SECRET_KEY || '';
    const isPaper = process.env.TRADING_MODE === 'paper';
    this.broker = new AlpacaBroker(apiKey, apiSecret, isPaper);
  }

  async initialize() {
    console.log('📊 Portfolio Analysis Agent v2.0');
    console.log('===================================');
    console.log(`🔒 Trading Mode: ${process.env.TRADING_MODE?.toUpperCase()}`);
    console.log('🕐 Market-aware resource optimization enabled');

    try {
      const account = await this.broker.getAccount();
      const marketSession = MarketHours.getCurrentSession();
      console.log(`✅ Connected - Account: ${account.id}`);
      console.log(`💰 Portfolio Value: $${account.portfolioValue.toLocaleString()}`);
      console.log(`📊 Market Status: ${marketSession.status} (${marketSession.isOpen ? 'OPEN' : 'CLOSED'})`);

      // Register with message bus
      this.messageBus.registerAgent(
        this.agentId,
        ['portfolio_analysis', 'risk_monitoring', 'p&l_tracking'],
        marketSession.isOpen ? 'trading' : 'monitoring'
      );

      // Subscribe to strategy updates from strategy agent
      this.messageBus.subscribeAgent(this.agentId, (message) => {
        this.handleAgentMessage(message);
      });

      console.log('');
    } catch (error) {
      console.error('❌ Failed to connect to broker:', error);
      throw error;
    }
  }

  async start() {
    if (this.isRunning) {
      console.log('⚠️  Portfolio agent is already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Portfolio agent started - analyzing positions...');
    console.log('');

    // Main loop - market-aware portfolio analysis
    while (this.isRunning) {
      try {
        const marketSession = MarketHours.getCurrentSession();

        await this.analyzePortfolio();

        // Market-aware wait times for optimal resource allocation
        let waitTime: number;
        if (marketSession.isOpen) {
          // 📈 MARKET OPEN: Active monitoring for real-time P&L
          waitTime = 60000; // 1 minute - positions can change quickly
          console.log(`📊 [PORTFOLIO] Market open - active monitoring mode (1min cycles)`);
        } else {
          // 🌙 MARKET CLOSED: Conservative monitoring - positions static
          waitTime = 300000; // 5 minutes - positions won't change
          console.log(`🌙 [PORTFOLIO] Market closed - conservation mode (5min cycles)`);
        }

        await this.sleep(waitTime);
      } catch (error) {
        console.error('❌ Error in portfolio analysis:', error);
        await this.sleep(5000);
      }
    }
  }

  async analyzePortfolio() {
    try {
      const [account, positions] = await Promise.all([
        this.broker.getAccount(),
        this.broker.getPositions()
      ]);

      if (positions.length === 0) {
        // Send empty portfolio data
        await this.sendPortfolioAnalysis({
          portfolio_summary: {
            'Total Value': `$${account.portfolioValue.toLocaleString()}`,
            'Cash Available': `$${account.cash.toLocaleString()}`,
            'Equity Value': `$${account.equity.toLocaleString()}`,
            'Position Count': '0',
            'Day P&L': '$0.00'
          },
          positions: [],
          allocation: {},
          insights: [
            'No equity positions currently held',
            `Cash position: $${account.cash.toLocaleString()}`,
            'Ready for new opportunities'
          ]
        });
        return;
      }

      // Calculate portfolio metrics
      const totalMarketValue = positions.reduce((sum, pos) => sum + pos.marketValue, 0);
      const totalUnrealizedPnL = positions.reduce((sum, pos) => sum + pos.unrealizedPl, 0);
      const totalCostBasis = positions.reduce((sum, pos) => sum + pos.costBasis, 0);

      // Calculate sector allocation with comprehensive categorization
      const allocation: Record<string, number> = {};
      positions.forEach(pos => {
        const sector = this.getSectorFromSymbol(pos.symbol);
        allocation[sector] = (allocation[sector] || 0) + pos.marketValue;
      });

      // Convert to percentages
      const allocationPercent: Record<string, string> = {};
      Object.entries(allocation).forEach(([sector, value]) => {
        allocationPercent[sector] = ((value / totalMarketValue) * 100).toFixed(1) + '%';
      });

      // Prepare position data
      const positionsData = positions.map(pos => ({
        symbol: pos.symbol,
        quantity: pos.qty,
        market_value: pos.marketValue,
        cost_basis: pos.costBasis,
        unrealized_pnl: pos.unrealizedPl,
        unrealized_pnl_percent: (pos.unrealizedPlpc * 100).toFixed(2) + '%',
        avg_entry_price: pos.avgEntryPrice,
        current_price: (pos.marketValue / Math.abs(pos.qty)).toFixed(2),
        side: pos.side,
        asset_class: pos.assetClass
      }));

      // Generate insights
      const insights = [
        `Managing ${positions.length} equity position${positions.length > 1 ? 's' : ''}`,
        `Total unrealized P&L: ${totalUnrealizedPnL >= 0 ? '+' : ''}$${totalUnrealizedPnL.toFixed(2)}`,
        `Portfolio return: ${((totalUnrealizedPnL / totalCostBasis) * 100).toFixed(2)}%`,
        `Largest position: ${positions.sort((a, b) => Math.abs(b.marketValue) - Math.abs(a.marketValue))[0].symbol} (${((Math.abs(positions[0].marketValue) / totalMarketValue) * 100).toFixed(1)}%)`,
        `Cash allocation: ${((account.cash / account.portfolioValue) * 100).toFixed(1)}%`
      ];

      const portfolioAnalysis = {
        portfolio_summary: {
          'Total Value': `$${account.portfolioValue.toLocaleString()}`,
          'Cash Available': `$${account.cash.toLocaleString()}`,
          'Equity Value': `$${totalMarketValue.toLocaleString()}`,
          'Position Count': positions.length.toString(),
          'Unrealized P&L': `${totalUnrealizedPnL >= 0 ? '+' : ''}$${totalUnrealizedPnL.toFixed(2)}`,
          'Portfolio Return': `${((totalUnrealizedPnL / totalCostBasis) * 100).toFixed(2)}%`
        },
        positions: positionsData,
        allocation: allocationPercent,
        insights
      };

      await this.sendPortfolioAnalysis(portfolioAnalysis);

      console.log(`📊 [PORTFOLIO] Analyzed ${positions.length} positions - P&L: $${totalUnrealizedPnL.toFixed(2)}`);

      // Send risk alerts if needed
      await this.checkAndSendRiskAlerts(totalUnrealizedPnL, totalCostBasis, positions.length);

    } catch (error) {
      console.error('❌ Error analyzing portfolio:', error);
    }
  }

  private handleAgentMessage(message: any): void {
    try {
      switch (message.type) {
        case 'strategy_update':
          console.log(`📡 [PORTFOLIO] Received strategy update from ${message.from}`);
          if (message.data.watchlist) {
            console.log(`   📋 New watchlist: ${message.data.watchlist.map((w: any) => w.symbol).join(', ')}`);
          }
          break;

        case 'market_alert':
          console.log(`📡 [PORTFOLIO] Market alert from ${message.from}: ${message.data.message}`);
          break;

        case 'risk_warning':
          console.log(`📡 [PORTFOLIO] Risk warning from ${message.from}: ${message.data.warning}`);
          break;
      }
    } catch (error) {
      console.error('❌ Error handling agent message:', error);
    }
  }

  private async checkAndSendRiskAlerts(pnl: number, costBasis: number, positionCount: number): Promise<void> {
    try {
      // Send alerts for significant portfolio changes
      const portfolioReturn = (pnl / costBasis) * 100;

      if (portfolioReturn < -5) {
        this.messageBus.sendMessage({
          from: this.agentId,
          type: 'risk_warning',
          priority: 'high',
          data: {
            warning: `Portfolio down ${portfolioReturn.toFixed(2)}%`,
            pnl: pnl.toFixed(2),
            position_count: positionCount,
            timestamp: new Date().toISOString()
          }
        });
      } else if (portfolioReturn > 10) {
        this.messageBus.sendMessage({
          from: this.agentId,
          type: 'market_alert',
          priority: 'medium',
          data: {
            message: `Strong portfolio performance: +${portfolioReturn.toFixed(2)}%`,
            pnl: pnl.toFixed(2),
            suggestion: 'Consider profit-taking or position sizing adjustments'
          }
        });
      }

      // Update status in message bus
      const marketSession = MarketHours.getCurrentSession();
      this.messageBus.updateAgentStatus(
        this.agentId,
        marketSession.isOpen ? 'trading' : 'monitoring'
      );

    } catch (error) {
      console.error('❌ Error sending risk alerts:', error);
    }
  }

  private getSectorFromSymbol(symbol: string): string {
    // Comprehensive sector mapping based on your holdings
    const sectorMap: Record<string, string> = {
      // Technology & Software
      'AAPL': 'Technology',
      'MSFT': 'Technology',
      'GOOGL': 'Technology',
      'NVDA': 'Technology',
      'AMD': 'Technology',
      'INTC': 'Technology',
      'META': 'Technology',
      'NFLX': 'Technology',
      'CRM': 'Technology',
      'OKTA': 'Technology',
      'PLTR': 'Technology',
      'TTD': 'Technology',
      'CSCO': 'Technology',
      'ADBE': 'Technology',

      // Quantum Computing & Emerging Tech
      'QUBT': 'Quantum Computing',

      // Social Media & Communication
      'SNAP': 'Social Media',

      // Financial Services
      'JPM': 'Financial',
      'BAC': 'Financial',
      'V': 'Financial',
      'NU': 'Fintech',

      // Healthcare & Pharmaceuticals
      'JNJ': 'Healthcare',
      'UNH': 'Healthcare',

      // Consumer Goods & Retail
      'PG': 'Consumer Goods',
      'WMT': 'Consumer Goods',
      'KO': 'Consumer Goods',
      'HD': 'Consumer Goods',
      'PEP': 'Consumer Goods',

      // Automotive & EV
      'TSLA': 'Electric Vehicles',
      'LI': 'Electric Vehicles',

      // Energy & Utilities
      'CVX': 'Energy',
      'XOM': 'Energy',

      // E-commerce & Cloud
      'AMZN': 'E-commerce & Cloud',

      // ETFs & Index Funds
      'SPY': 'ETFs',
      'QQQ': 'ETFs'
    };

    return sectorMap[symbol] || 'Specialty Stocks';
  }

  private async sendPortfolioAnalysis(data: any): Promise<void> {
    try {
      await fetch('http://localhost:8000/api/portfolio_analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'portfolio_analysis',
          timestamp: new Date().toISOString(),
          agent: 'PortfolioAgent',
          ...data
        })
      });
    } catch (error) {
      // Silently fail if frontend is not available
    }
  }

  sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async stop() {
    console.log('');
    console.log('🛑 Stopping portfolio agent...');
    this.isRunning = false;
    console.log('✅ Portfolio agent stopped successfully');
  }
}

async function main() {
  const agent = new PortfolioAgent();

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
