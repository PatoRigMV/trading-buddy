#!/usr/bin/env node

import * as dotenv from 'dotenv';
import { InstitutionalOptionsOrchestrator, OrchestratorConfig } from '../core/InstitutionalOptionsOrchestrator';

dotenv.config();

console.log('📊 Options Trading Agent v1.0');
console.log('========================================');

const config: OrchestratorConfig = {
  mode: (process.env.TRADING_MODE as any) || 'paper',
  initialCapital: parseFloat(process.env.INITIAL_CAPITAL || '100000'),
  riskParameters: {
    maxPortfolioVaR: 0.02,
    maxPositionSize: 0.1,
    maxConcentration: 0.25,
    maxDelta: 100,
    maxGamma: 50,
    maxVega: 500,
    maxTheta: -200,
    maxRho: 100,
    liquidityThreshold: 100,
    marginRequirement: 0.25
  },
  tradingHours: {
    marketOpen: '09:30',
    marketClose: '16:00',
    preMarketStart: '04:00',
    afterHoursEnd: '20:00',
    timeZone: 'America/New_York'
  },
  venues: [
    {
      name: 'Alpaca',
      type: 'primary',
      credentials: {
        keyId: process.env.APCA_API_KEY_ID,
        secretKey: process.env.APCA_API_SECRET_KEY,
        baseUrl: process.env.APCA_API_BASE_URL || 'https://paper-api.alpaca.markets'
      },
      latencyTarget: 100,
      enabled: true,
      priority: 1
    }
  ],
  symbols: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'SPY', 'QQQ'],
  strategies: [
    {
      name: 'Covered Call Wheel',
      type: 'wheel',
      enabled: true,
      allocation: 0.4,
      parameters: {
        deltaTarget: 0.30,
        dteTarget: 30,
        profitTarget: 0.5,
        rollThreshold: 0.8
      },
      riskLimits: {
        maxContracts: 10,
        maxLoss: 5000
      },
      symbols: ['AAPL', 'MSFT', 'GOOGL']
    },
    {
      name: 'Credit Spreads',
      type: 'spread',
      enabled: true,
      allocation: 0.3,
      parameters: {
        deltaShort: 0.16,
        deltaLong: 0.05,
        dteTarget: 45,
        creditTarget: 0.33
      },
      riskLimits: {
        maxContracts: 5,
        maxLoss: 3000
      },
      symbols: ['SPY', 'QQQ', 'NVDA']
    },
    {
      name: 'Iron Condor',
      type: 'iron_condor',
      enabled: true,
      allocation: 0.3,
      parameters: {
        deltaWings: 0.10,
        width: 5,
        dteTarget: 45,
        creditTarget: 0.30
      },
      riskLimits: {
        maxContracts: 3,
        maxLoss: 2000
      },
      symbols: ['SPY', 'QQQ']
    }
  ],
  observability: {
    enabled: true,
    retentionPeriod: 30,
    alerting: {
      channels: [
        {
          type: 'webhook',
          config: {
            url: 'http://localhost:8000/api/agent_stream'
          },
          enabled: true
        }
      ],
      thresholds: [
        {
          metric: 'portfolio_delta',
          threshold: 100,
          severity: 'warning',
          condition: 'above'
        },
        {
          metric: 'daily_loss',
          threshold: 5000,
          severity: 'critical',
          condition: 'above'
        }
      ],
      escalation: [
        {
          severity: 'critical',
          escalationTime: 300,
          actions: [
            {
              type: 'stop',
              parameters: {}
            }
          ]
        }
      ]
    },
    dashboards: ['portfolio', 'greeks', 'performance'],
    exports: {
      enabled: true,
      format: 'json',
      frequency: 'real-time',
      destination: 'http://localhost:8000/api/options_events'
    }
  }
};

async function main() {
  console.log(`🔒 Trading Mode: ${config.mode.toUpperCase()}`);
  if (config.mode === 'paper') {
    console.log('📝 Paper trading mode - no real money at risk');
  }

  console.log(`💰 Initial Capital: $${config.initialCapital.toLocaleString()}`);
  console.log(`📈 Strategies Enabled: ${config.strategies.filter(s => s.enabled).map(s => s.name).join(', ')}`);
  console.log(`🎯 Monitoring Symbols: ${config.symbols.join(', ')}`);
  console.log('');

  const orchestrator = new InstitutionalOptionsOrchestrator(config);

  // Set up event listeners for status updates
  orchestrator.on('orchestratorStarting', () => {
    console.log('🔄 Starting options trading orchestrator...');
  });

  orchestrator.on('orchestratorStarted', (data) => {
    console.log(`✅ Options orchestrator started successfully (Session: ${data.sessionId})`);
  });

  orchestrator.on('strategySignal', (signal) => {
    console.log(`🎯 [${signal.strategy}] Signal: ${signal.action} ${signal.symbol} - Confidence: ${(signal.confidence * 100).toFixed(1)}%`);
  });

  orchestrator.on('tradeExecuted', (trade) => {
    console.log(`✅ [TRADE] ${trade.action} ${trade.contracts}x ${trade.symbol} @ $${trade.price} - Strategy: ${trade.strategy}`);
  });

  orchestrator.on('riskAlert', (alert) => {
    console.log(`⚠️  [RISK] ${alert.severity.toUpperCase()}: ${alert.message}`);
  });

  orchestrator.on('positionUpdate', (position) => {
    console.log(`📊 [POSITION] ${position.symbol}: P&L: $${position.pnl.toFixed(2)}, Delta: ${position.delta.toFixed(2)}, Theta: ${position.theta.toFixed(2)}`);
  });

  orchestrator.on('orchestratorError', (error) => {
    console.error('❌ Orchestrator error:', error);
  });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down options orchestrator...');
    await orchestrator.stop();
    console.log('✅ Options orchestrator stopped successfully');
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down options orchestrator...');
    await orchestrator.stop();
    console.log('✅ Options orchestrator stopped successfully');
    process.exit(0);
  });

  // Start the orchestrator
  try {
    await orchestrator.start();
    console.log('🚀 Options trading agent is now running...');
    console.log('Press Ctrl+C to stop\n');
  } catch (error) {
    console.error('❌ Failed to start options orchestrator:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
