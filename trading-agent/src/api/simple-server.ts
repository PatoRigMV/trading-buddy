#!/usr/bin/env node

import * as fastify from 'fastify';
import * as dotenv from 'dotenv';
import { AlpacaBroker } from '../adapters/AlpacaBroker';

dotenv.config();

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

    console.log('🚀 Starting Simple Trading Agent API Server...');
    console.log(`📊 Trading Mode: ${process.env.TRADING_MODE || 'paper'}`);

    await server.listen({ port, host });

    console.log(`✅ API Server running on http://${host}:${port}`);
    console.log(`🏥 Health Check: http://${host}:${port}/health`);

  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);

  try {
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
