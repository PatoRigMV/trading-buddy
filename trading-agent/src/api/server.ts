#!/usr/bin/env node

import * as fastify from 'fastify';
import * as dotenv from 'dotenv';
import { TradingAgent } from '../engine/agent';
import { AlpacaBroker } from '../adapters/AlpacaBroker';
import { AlpacaOptionsBroker } from '../adapters/AlpacaOptionsBroker';
import { AlpacaOptionsData } from '../data/AlpacaOptionsData';
import { OptionsAnalyzer } from '../engine/optionsAnalyzer';
import { OptionsRiskManager } from '../engine/optionsRiskManager';
import { getOptionsRiskLimits } from '../engine/optionsDefaultConfigs';

dotenv.config();

// Global agent instance - for now we'll work without direct agent integration
// and just provide broker data access
let tradingAgent: TradingAgent | null = null;

const server = fastify.fastify({
  logger: {
    level: 'info'
  }
});

// Health check endpoint
server.get('/health', async (request, reply) => {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    agent_running: false // We'll update this later when we integrate with the agent
  };
});

// Get current positions
server.get('/positions', async (request, reply) => {
  try {
    const broker = new AlpacaBroker(
      process.env.APCA_API_KEY_ID!,
      process.env.APCA_API_SECRET_KEY!,
      process.env.TRADING_MODE === 'paper'
    );

    const positions = await broker.getPositions();
    return { positions };
  } catch (error) {
    return reply.code(500).send({ error: 'Failed to get positions', details: error });
  }
});

// Get options positions
server.get('/options/positions', async (request, reply) => {
  try {
    const optionsBroker = new AlpacaOptionsBroker(
      process.env.APCA_API_KEY_ID!,
      process.env.APCA_API_SECRET_KEY!,
      process.env.TRADING_MODE === 'paper'
    );

    const optionsPositions = await optionsBroker.getOptionPositions();
    return { optionsPositions };
  } catch (error) {
    return reply.code(500).send({ error: 'Failed to get options positions', details: error });
  }
});

// Get option chain for a symbol
server.get('/options/chain/:symbol', async (request, reply) => {
  const { symbol } = request.params as { symbol: string };
  const { strike_price_gte, strike_price_lte, expiration_gte, expiration_lte } = request.query as {
    strike_price_gte?: string;
    strike_price_lte?: string;
    expiration_gte?: string;
    expiration_lte?: string;
  };

  try {
    const optionsData = new AlpacaOptionsData(
      process.env.POLYGON_API_KEY!,
      process.env.APCA_API_KEY_ID!,
      process.env.APCA_API_SECRET_KEY!,
      process.env.TRADING_MODE === 'paper'
    );

    const chain = await optionsData.getOptionChain(
      symbol.toUpperCase(),
      strike_price_gte ? parseFloat(strike_price_gte) : undefined,
      strike_price_lte ? parseFloat(strike_price_lte) : undefined,
      expiration_gte ? new Date(expiration_gte) : undefined,
      expiration_lte ? new Date(expiration_lte) : undefined
    );

    return {
      symbol: symbol.toUpperCase(),
      chain,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return reply.code(500).send({ error: `Failed to get options chain for ${symbol}`, details: error });
  }
});

// Get options quotes for specific contracts
server.post('/options/quotes', async (request, reply) => {
  const { contracts } = request.body as { contracts: string[] };

  if (!contracts || !Array.isArray(contracts)) {
    return reply.code(400).send({ error: 'contracts array is required' });
  }

  try {
    const optionsData = new AlpacaOptionsData(
      process.env.POLYGON_API_KEY!,
      process.env.APCA_API_KEY_ID!,
      process.env.APCA_API_SECRET_KEY!,
      process.env.TRADING_MODE === 'paper'
    );

    const quotes = await Promise.all(
      contracts.map(async (contractSymbol) => {
        try {
          const quote = await optionsData.getOptionQuote(contractSymbol);
          return { contractSymbol, quote, error: null };
        } catch (error) {
          return { contractSymbol, quote: null, error: error instanceof Error ? error.message : String(error) };
        }
      })
    );

    return { quotes, timestamp: new Date().toISOString() };
  } catch (error) {
    return reply.code(500).send({ error: 'Failed to get options quotes', details: error });
  }
});

// Get options analysis for a symbol
server.get('/options/analysis/:symbol', async (request, reply) => {
  const { symbol } = request.params as { symbol: string };

  try {
    const optionsData = new AlpacaOptionsData(
      process.env.POLYGON_API_KEY!,
      process.env.APCA_API_KEY_ID!,
      process.env.APCA_API_SECRET_KEY!,
      process.env.TRADING_MODE === 'paper'
    );

    const analyzer = new OptionsAnalyzer(optionsData);
    const opportunities = await analyzer.analyzeOptionOpportunities(symbol.toUpperCase());

    return {
      symbol: symbol.toUpperCase(),
      opportunities,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return reply.code(500).send({ error: `Failed to analyze options for ${symbol}`, details: error });
  }
});

// Get portfolio Greeks and options risk metrics
server.get('/options/portfolio-greeks', async (request, reply) => {
  try {
    const optionsBroker = new AlpacaOptionsBroker(
      process.env.APCA_API_KEY_ID!,
      process.env.APCA_API_SECRET_KEY!,
      process.env.TRADING_MODE === 'paper'
    );

    const broker = new AlpacaBroker(
      process.env.APCA_API_KEY_ID!,
      process.env.APCA_API_SECRET_KEY!,
      process.env.TRADING_MODE === 'paper'
    );

    const optionsPositions = await optionsBroker.getOptionPositions();
    const account = await broker.getAccount();

    // Calculate portfolio-level Greeks and risk metrics
    const optionsRiskLimits = getOptionsRiskLimits('moderate', account.portfolioValue);
    const riskManager = new OptionsRiskManager(optionsRiskLimits, account.portfolioValue);

    const riskMetrics = riskManager.calculateOptionsRiskMetrics(
      optionsPositions,
      account.portfolioValue,
      account.buyingPower
    );

    return {
      portfolioGreeks: {
        delta: riskMetrics.totalDelta,
        gamma: riskMetrics.totalGamma,
        theta: riskMetrics.totalTheta,
        vega: riskMetrics.totalVega,
        rho: riskMetrics.totalRho
      },
      riskMetrics,
      tradingMode: riskManager.getOptionsTradingMode(riskMetrics),
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return reply.code(500).send({ error: 'Failed to get portfolio Greeks', details: error });
  }
});

// Place options order
server.post('/options/orders', async (request, reply) => {
  const orderRequest = request.body as any;

  if (!orderRequest.contract || !orderRequest.side || !orderRequest.quantity) {
    return reply.code(400).send({
      error: 'Missing required fields: contract, side, quantity'
    });
  }

  try {
    const optionsBroker = new AlpacaOptionsBroker(
      process.env.APCA_API_KEY_ID!,
      process.env.APCA_API_SECRET_KEY!,
      process.env.TRADING_MODE === 'paper'
    );

    const result = await optionsBroker.placeOptionOrder(orderRequest);
    return {
      success: result.success,
      orderId: result.orderId,
      filledQuantity: result.filledQuantity,
      totalCost: result.totalCost,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return reply.code(500).send({ error: 'Failed to place options order', details: error });
  }
});

// Get options orders
server.get('/options/orders', async (request, reply) => {
  const { status, limit } = request.query as { status?: string; limit?: string };
  const limitNumber = limit ? parseInt(limit) : 50;

  try {
    const optionsBroker = new AlpacaOptionsBroker(
      process.env.APCA_API_KEY_ID!,
      process.env.APCA_API_SECRET_KEY!,
      process.env.TRADING_MODE === 'paper'
    );

    const orders = await optionsBroker.getOptionOrders(status, limitNumber);
    return { orders };
  } catch (error) {
    return reply.code(500).send({ error: 'Failed to get options orders', details: error });
  }
});

// Get implied volatility rank for a symbol
server.get('/options/iv-rank/:symbol', async (request, reply) => {
  const { symbol } = request.params as { symbol: string };

  try {
    const optionsData = new AlpacaOptionsData(
      process.env.POLYGON_API_KEY!,
      process.env.APCA_API_KEY_ID!,
      process.env.APCA_API_SECRET_KEY!,
      process.env.TRADING_MODE === 'paper'
    );

    const ivRank = await optionsData.getIVRank(symbol.toUpperCase());
    return {
      symbol: symbol.toUpperCase(),
      ivRank,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return reply.code(500).send({ error: `Failed to get IV rank for ${symbol}`, details: error });
  }
});

// Multi-leg strategy endpoints
server.post('/options/strategies/analyze', async (request, reply) => {
  const { underlyingSymbol, strategies } = request.body as {
    underlyingSymbol: string;
    strategies?: string[];
  };

  if (!underlyingSymbol) {
    return reply.code(400).send({ error: 'underlyingSymbol is required' });
  }

  try {
    const optionsData = new AlpacaOptionsData(
      process.env.POLYGON_API_KEY!,
      process.env.APCA_API_KEY_ID!,
      process.env.APCA_API_SECRET_KEY!,
      process.env.TRADING_MODE === 'paper'
    );

    const analyzer = new OptionsAnalyzer(optionsData);
    const analysis = await analyzer.analyzeStrategies(
      underlyingSymbol.toUpperCase(),
      strategies
    );

    return {
      underlyingSymbol: underlyingSymbol.toUpperCase(),
      analysis,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return reply.code(500).send({ error: 'Failed to analyze options strategies', details: error });
  }
});

server.post('/options/strategies/execute', async (request, reply) => {
  const strategyRequest = request.body as any;

  if (!strategyRequest.legs || !Array.isArray(strategyRequest.legs)) {
    return reply.code(400).send({ error: 'legs array is required' });
  }

  try {
    const optionsBroker = new AlpacaOptionsBroker(
      process.env.APCA_API_KEY_ID!,
      process.env.APCA_API_SECRET_KEY!,
      process.env.TRADING_MODE === 'paper'
    );

    const result = await optionsBroker.executeMultiLegStrategy(strategyRequest);
    return {
      success: result.success,
      orderId: result.orderId,
      filledQuantity: result.filledQuantity,
      totalCost: result.totalCost,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return reply.code(500).send({ error: 'Failed to execute multi-leg strategy', details: error });
  }
});

// Get account information
server.get('/account', async (request, reply) => {
  try {
    const broker = new AlpacaBroker(
      process.env.APCA_API_KEY_ID!,
      process.env.APCA_API_SECRET_KEY!,
      process.env.TRADING_MODE === 'paper'
    );

    const account = await broker.getAccount();
    return { account };
  } catch (error) {
    return reply.code(500).send({ error: 'Failed to get account info', details: error });
  }
});

// Get daily P&L
server.get('/pnl/daily', async (request, reply) => {
  try {
    const broker = new AlpacaBroker(
      process.env.APCA_API_KEY_ID!,
      process.env.APCA_API_SECRET_KEY!,
      process.env.TRADING_MODE === 'paper'
    );

    const account = await broker.getAccount();
    const positions = await broker.getPositions();

    const totalUnrealizedPnL = positions.reduce((sum, pos) => sum + pos.unrealizedPl, 0);

    // This is a simplified calculation - in production you'd want to track this more precisely
    return {
      date: new Date().toISOString().split('T')[0],
      unrealized_pnl: totalUnrealizedPnL,
      account_value: account.portfolioValue
    };
  } catch (error) {
    return reply.code(500).send({ error: 'Failed to get P&L', details: error });
  }
});

// Get trading decisions for a symbol
server.get('/decisions', async (request, reply) => {
  // For now, return placeholder data until we integrate with the agent
  const { symbol, limit } = request.query as { symbol?: string; limit?: string };
  const limitNumber = limit ? parseInt(limit) : 100;

  return {
    decisions: [],
    message: "Trading decisions will be available once agent integration is complete"
  };
});

// Get state machine stats
server.get('/stats', async (request, reply) => {
  // For now, return placeholder stats until we integrate with the agent
  return {
    stats: {
      states: {},
      transitions: 0,
      symbols_monitored: 0
    },
    message: "State machine stats will be available once agent integration is complete"
  };
});

// Get orders
server.get('/orders', async (request, reply) => {
  const { status, limit } = request.query as { status?: string; limit?: string };
  const limitNumber = limit ? parseInt(limit) : 50;

  try {
    const broker = new AlpacaBroker(
      process.env.APCA_API_KEY_ID!,
      process.env.APCA_API_SECRET_KEY!,
      process.env.TRADING_MODE === 'paper'
    );

    const orders = await broker.getOrders(status, limitNumber);
    return { orders };
  } catch (error) {
    return reply.code(500).send({ error: 'Failed to get orders', details: error });
  }
});

// Emergency stop endpoint
server.post('/emergency-stop', async (request, reply) => {
  // For now, just close all positions through the broker directly
  try {
    const broker = new AlpacaBroker(
      process.env.APCA_API_KEY_ID!,
      process.env.APCA_API_SECRET_KEY!,
      process.env.TRADING_MODE === 'paper'
    );

    await broker.closeAllPositions();
    return {
      message: 'Emergency stop executed - all positions closed',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return reply.code(500).send({ error: 'Emergency stop failed', details: error });
  }
});

// Get recent market data for a symbol
server.get('/market-data/:symbol', async (request, reply) => {
  const { symbol } = request.params as { symbol: string };

  try {
    const broker = new AlpacaBroker(
      process.env.APCA_API_KEY_ID!,
      process.env.APCA_API_SECRET_KEY!,
      process.env.TRADING_MODE === 'paper'
    );

    const quote = await broker.getLatestQuote(symbol.toUpperCase());
    return {
      symbol: symbol.toUpperCase(),
      quote,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return reply.code(500).send({ error: `Failed to get market data for ${symbol}`, details: error });
  }
});

// API documentation endpoint
server.get('/docs', async (request, reply) => {
  const docs = {
    name: 'Trading Agent API with Options Support',
    version: '0.2.0',
    endpoints: [
      {
        method: 'GET',
        path: '/health',
        description: 'Health check and agent status'
      },
      {
        method: 'GET',
        path: '/positions',
        description: 'Get current equity positions'
      },
      {
        method: 'GET',
        path: '/account',
        description: 'Get account information'
      },
      {
        method: 'GET',
        path: '/pnl/daily',
        description: 'Get daily P&L summary'
      },
      {
        method: 'GET',
        path: '/decisions',
        description: 'Get trading decisions',
        query_params: ['symbol', 'limit']
      },
      {
        method: 'GET',
        path: '/stats',
        description: 'Get state machine statistics'
      },
      {
        method: 'GET',
        path: '/orders',
        description: 'Get order history',
        query_params: ['status', 'limit']
      },
      {
        method: 'POST',
        path: '/emergency-stop',
        description: 'Emergency stop - close all positions and stop agent'
      },
      {
        method: 'GET',
        path: '/market-data/:symbol',
        description: 'Get latest market data for a symbol'
      },
      // Options Trading Endpoints
      {
        method: 'GET',
        path: '/options/positions',
        description: 'Get current options positions'
      },
      {
        method: 'GET',
        path: '/options/chain/:symbol',
        description: 'Get options chain for a symbol',
        query_params: ['strike_price_gte', 'strike_price_lte', 'expiration_gte', 'expiration_lte']
      },
      {
        method: 'POST',
        path: '/options/quotes',
        description: 'Get quotes for specific option contracts',
        body_params: ['contracts']
      },
      {
        method: 'GET',
        path: '/options/analysis/:symbol',
        description: 'Get options trading analysis and opportunities for a symbol'
      },
      {
        method: 'GET',
        path: '/options/portfolio-greeks',
        description: 'Get portfolio-level Greeks and options risk metrics'
      },
      {
        method: 'POST',
        path: '/options/orders',
        description: 'Place an options order',
        body_params: ['contract', 'side', 'quantity', 'price', 'type']
      },
      {
        method: 'GET',
        path: '/options/orders',
        description: 'Get options order history',
        query_params: ['status', 'limit']
      },
      {
        method: 'GET',
        path: '/options/iv-rank/:symbol',
        description: 'Get implied volatility rank for a symbol'
      },
      {
        method: 'POST',
        path: '/options/strategies/analyze',
        description: 'Analyze multi-leg options strategies for a symbol',
        body_params: ['underlyingSymbol', 'strategies']
      },
      {
        method: 'POST',
        path: '/options/strategies/execute',
        description: 'Execute a multi-leg options strategy',
        body_params: ['legs']
      }
    ]
  };

  return docs;
});

// CORS middleware
server.register(async (fastify) => {
  fastify.addHook('onRequest', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  });

  fastify.options('*', async (request, reply) => {
    return reply.send();
  });
});

// Start server
async function start() {
  try {
    const port = parseInt(process.env.API_PORT || '3001');
    const host = process.env.API_HOST || '0.0.0.0';

    console.log('🚀 Starting Trading Agent API Server...');
    console.log(`📊 Trading Mode: ${process.env.TRADING_MODE || 'paper'}`);

    await server.listen({ port, host });

    console.log(`✅ API Server running on http://${host}:${port}`);
    console.log(`📖 API Documentation: http://${host}:${port}/docs`);
    console.log(`🏥 Health Check: http://${host}:${port}/health`);

    // Note: This API server doesn't start the trading agent automatically
    // The agent should be started separately using the CLI tool
    console.log('');
    console.log('💡 To start the trading agent, use:');
    console.log('   pnpm agent --config config/strategy.yaml');

  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`\\n🛑 Received ${signal}, shutting down gracefully...`);

  try {
    // If we had a trading agent, we would stop it here
    // For now, just close the server
    await server.close();
    console.log('✅ Server shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

if (require.main === module) {
  start();
}

export { server };
