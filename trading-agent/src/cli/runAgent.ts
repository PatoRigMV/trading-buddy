#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import * as dotenv from 'dotenv';
import { TradingAgent, AgentConfig } from '../engine/agent';
import { AlpacaBroker } from '../adapters/AlpacaBroker';
import { AlpacaMarketData } from '../data/AlpacaData';
import { YahooMarketData } from '../data/YahooData';
import { MockMarketData } from '../data/MockData';
import { RiskLimits } from '../engine/risk';
import { MODERATE_EV_CONFIG, MODERATE_LIQUIDITY_LIMITS, TESTING_RISK_LIMITS } from '../engine/defaultConfigs';

// Load environment variables
dotenv.config();

interface SymbolCategories {
  mega_cap?: string[];
  large_cap_value?: string[];
  growth_leaders?: string[];
  mid_cap_gems?: string[];
  small_cap_innovators?: string[];
  biotech_emerging?: string[];
  fintech_disruptors?: string[];
  clean_energy?: string[];
  cybersecurity?: string[];
  robotics_ai?: string[];
  international_growth?: string[];
  value_growth_hybrid?: string[];
  space_economy?: string[];
  quantum_computing?: string[];
  gaming_metaverse?: string[];
}

interface StrategyConfig {
  symbols: string[] | SymbolCategories;
  active_symbols?: string[];
  interval: string;
  mode: string;
  equity_start: number;
  analysis?: {
    check_interval: string;
    market_data_timeout: string;
    enable_realtime: boolean;
  };
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
  monitoring?: {
    log_decisions: boolean;
    log_positions: boolean;
    status_interval: string;
  };
  logging: {
    level: string;
  };
}

async function loadConfig(configPath: string): Promise<StrategyConfig> {
  try {
    const configContent = fs.readFileSync(configPath, 'utf8');
    return yaml.parse(configContent);
  } catch (error) {
    console.error(`Failed to load config from ${configPath}:`, error);
    process.exit(1);
  }
}

function validateEnvironment(): void {
  const required = ['APCA_API_KEY_ID', 'APCA_API_SECRET_KEY', 'APCA_API_BASE_URL'];

  for (const key of required) {
    if (!process.env[key]) {
      console.error(`Missing required environment variable: ${key}`);
      console.error('Please copy .env.example to .env and fill in your Alpaca API credentials');
      process.exit(1);
    }
  }
}

function parseSymbolsFromConfig(symbolsConfig: string[] | SymbolCategories, activeSymbols?: string[]): string[] {
  // If it's already a string array, return as-is
  if (Array.isArray(symbolsConfig)) {
    return symbolsConfig;
  }

  // If active_symbols is specified, use those for trading focus
  if (activeSymbols && activeSymbols.length > 0) {
    console.log(`📍 Using active symbols for focused trading: ${activeSymbols.length} stocks`);
    return activeSymbols;
  }

  // Otherwise, flatten all categories into one array
  const allSymbols: string[] = [];
  const categories = symbolsConfig as SymbolCategories;

  // Add symbols from all categories
  Object.entries(categories).forEach(([category, symbols]) => {
    if (symbols && symbols.length > 0) {
      console.log(`📂 ${category}: ${symbols.length} stocks`);
      allSymbols.push(...symbols);
    }
  });

  // Remove duplicates
  const uniqueSymbols = [...new Set(allSymbols)];
  console.log(`🎯 Total unique symbols to monitor: ${uniqueSymbols.length}`);

  // For performance reasons, limit to most liquid stocks if too many
  if (uniqueSymbols.length > 50) {
    console.log('⚡ Large symbol list detected - recommend using active_symbols for better performance');
  }

  return uniqueSymbols;
}

function createAgentConfig(strategyConfig: StrategyConfig): AgentConfig {
  // Start with TESTING_RISK_LIMITS and override with YAML config values
  const riskLimits: RiskLimits = {
    ...TESTING_RISK_LIMITS,
    // Override with values from YAML config
    maxRiskPerTrade: strategyConfig.risk.per_trade,
    maxDailyLoss: strategyConfig.risk.max_daily_loss,
    maxPositions: strategyConfig.risk.max_positions,
    maxExposurePerSymbol: strategyConfig.risk.max_exposure_symbol
  };

  // Parse symbols from config
  const symbols = parseSymbolsFromConfig(strategyConfig.symbols, strategyConfig.active_symbols);

  return {
    symbols: symbols,
    timeframe: strategyConfig.interval,
    buyThreshold: strategyConfig.thresholds.buy_enter,
    sellThreshold: strategyConfig.thresholds.sell_exit,
    riskLimits,
    maxPositions: strategyConfig.risk.max_positions,
    emergencyStop: process.env.BLOCK_NEW_ORDERS === 'true',
    evGateConfig: MODERATE_EV_CONFIG,        // Use institutional EV gate
    liquidityLimits: MODERATE_LIQUIDITY_LIMITS // Use liquidity filters
  };
}

async function main() {
  console.log('🤖 Autonomous Trading Agent v0.1.0');
  console.log('='.repeat(40));

  // Parse command line arguments
  const args = process.argv.slice(2);
  const configIndex = args.indexOf('--config');
  const confirmLive = args.includes('--confirm-live');

  const configPath = configIndex !== -1 ? args[configIndex + 1] : 'config/strategy.yaml';

  // Load configuration
  console.log(`📋 Loading config from: ${configPath}`);
  const strategyConfig = await loadConfig(configPath);

  // Validate environment
  validateEnvironment();

  // Safety checks
  const tradingMode = process.env.TRADING_MODE || 'paper';
  const isPaper = tradingMode === 'paper';

  console.log(`🔒 Trading Mode: ${tradingMode.toUpperCase()}`);

  if (!isPaper && !confirmLive) {
    console.error('❌ Live trading requires --confirm-live flag');
    console.error('   Example: pnpm agent --config config/strategy.yaml --confirm-live');
    process.exit(1);
  }

  if (!isPaper) {
    console.log('⚠️  WARNING: LIVE TRADING MODE ENABLED');
    console.log('   This will use real money and place actual trades!');

    // 10 second countdown for live trading
    for (let i = 10; i > 0; i--) {
      process.stdout.write(`   Starting in ${i} seconds... (Ctrl+C to cancel)\r`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    console.log('\\n🚀 Starting live trading...');
  } else {
    console.log('📝 Paper trading mode - no real money at risk');
  }

  try {
    // Initialize broker
    const broker = new AlpacaBroker(
      process.env.APCA_API_KEY_ID!,
      process.env.APCA_API_SECRET_KEY!,
      isPaper
    );

    // Test broker connection
    console.log('🔌 Connecting to broker...');
    const account = await broker.getAccount();
    console.log(`✅ Connected - Account: ${account.id}, Equity: $${account.equity.toFixed(2)}`);

    // Initialize market data provider
    console.log('📊 Connecting to market data...');
    let marketData;
    if (strategyConfig.mode === 'alpaca') {
      console.log('📈 Using Alpaca live market data');
      marketData = new AlpacaMarketData(process.env.APCA_API_KEY_ID!, process.env.APCA_API_SECRET_KEY!, isPaper);
    } else if (strategyConfig.mode === 'mock') {
      console.log('📈 Using Mock market data for testing');
      marketData = new MockMarketData();
    } else {
      console.log('📈 Using Yahoo live market data (default)');
      marketData = new YahooMarketData();
    }

    // Create agent configuration
    const agentConfig = createAgentConfig(strategyConfig);

    // Initialize trading agent
    console.log('🤖 Initializing trading agent...');
    const agent = new TradingAgent(agentConfig, broker, marketData);

    // Setup graceful shutdown
    const shutdown = async () => {
      console.log('\\n📴 Shutting down agent...');
      try {
        await agent.stop();
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Setup emergency stop
    const emergencyStop = async () => {
      console.log('\\n🛑 EMERGENCY STOP INITIATED');
      try {
        await agent.emergencyStop();
        process.exit(0);
      } catch (error) {
        console.error('Emergency stop failed:', error);
        process.exit(1);
      }
    };

    // Emergency stop on double Ctrl+C
    let ctrlCCount = 0;
    process.on('SIGINT', () => {
      ctrlCCount++;
      if (ctrlCCount >= 2) {
        emergencyStop();
      } else {
        console.log('\\nPress Ctrl+C again to emergency stop (closes all positions)');
        setTimeout(() => { ctrlCCount = 0; }, 3000);
      }
    });

    // Start the agent
    console.log(`📈 Monitoring symbols: ${agentConfig.symbols.join(', ')}`);
    console.log(`⚡ Timeframe: ${agentConfig.timeframe}`);
    console.log(`🎯 Buy threshold: ${agentConfig.buyThreshold}`);
    console.log(`🎯 Sell threshold: ${agentConfig.sellThreshold}`);
    console.log('🔄 Agent starting...');
    console.log('');

    await agent.start();

    // Keep the process alive
    process.stdin.resume();

  } catch (error) {
    console.error('❌ Failed to start trading agent:', error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections - log but don't exit
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Promise Rejection at:', promise, 'reason:', reason);
  console.error('Agent continuing despite error - check for issues...');
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  console.error('Agent continuing despite error - check for issues...');
});

if (require.main === module) {
  main();
}
