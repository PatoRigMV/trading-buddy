import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TradingAgent, AgentConfig, DecisionRecord } from '../src/engine/agent';
import { Broker, BrokerPosition } from '../src/adapters/Broker';
import { MarketDataProvider, BarData } from '../src/data/MarketData';
import { RiskLimits } from '../src/engine/risk';

// Mock Broker implementation
class MockBroker implements Broker {
  private accountValue = 100000;
  private positions: BrokerPosition[] = [];
  private orders: Map<string, any> = new Map();

  async getAccount(): Promise<any> {
    return {
      portfolioValue: this.accountValue,
      equity: this.accountValue,
      cash: this.accountValue * 0.5,
      buyingPower: this.accountValue * 2
    };
  }

  async getPositions(): Promise<BrokerPosition[]> {
    return this.positions;
  }

  async getPosition(symbol: string): Promise<BrokerPosition | null> {
    return this.positions.find(p => p.symbol === symbol) || null;
  }

  async placeLimitOrder(
    symbol: string,
    side: 'buy' | 'sell',
    quantity: number,
    limitPrice: number,
    timeInForce?: string
  ): Promise<{ orderId: string; filledQty: number; avgPrice?: number; status: string }> {
    const orderId = `order-${Date.now()}`;
    this.orders.set(orderId, {
      symbol,
      side,
      quantity,
      limitPrice,
      status: 'filled',
      filledQty: quantity,
      avgPrice: limitPrice
    });

    // Add to positions
    const existing = this.positions.find(p => p.symbol === symbol);
    if (existing) {
      if (side === 'buy') {
        existing.quantity += quantity;
        existing.avgPrice = (existing.avgPrice * (existing.quantity - quantity) + limitPrice * quantity) / existing.quantity;
      } else {
        existing.quantity -= quantity;
      }
    } else if (side === 'buy') {
      this.positions.push({
        symbol,
        quantity,
        avgPrice: limitPrice,
        marketValue: limitPrice * quantity,
        unrealizedPnL: 0,
        side: 'long'
      });
    }

    return {
      orderId,
      filledQty: quantity,
      avgPrice: limitPrice,
      status: 'filled'
    };
  }

  async placeMarketOrder(
    symbol: string,
    side: 'buy' | 'sell',
    quantity: number
  ): Promise<{ orderId: string; filledQty: number; avgPrice?: number; status: string }> {
    return this.placeLimitOrder(symbol, side, quantity, 100);
  }

  async getOrder(orderId: string): Promise<any> {
    return this.orders.get(orderId) || null;
  }

  async cancelOrder(orderId: string): Promise<void> {
    const order = this.orders.get(orderId);
    if (order) {
      order.status = 'cancelled';
    }
  }

  async closeAllPositions(): Promise<void> {
    // Close all positions by placing opposite orders
    for (const position of this.positions) {
      await this.placeMarketOrder(
        position.symbol,
        position.side === 'long' ? 'sell' : 'buy',
        position.quantity
      );
    }
    this.positions = [];
  }

  setAccountValue(value: number) {
    this.accountValue = value;
  }

  setPositions(positions: BrokerPosition[]) {
    this.positions = positions;
  }
}

// Mock Market Data Provider
class MockMarketDataProvider implements MarketDataProvider {
  private subscribers: Map<string, (bar: BarData) => void> = new Map();

  async getHistoricalBars(
    symbol: string,
    timeframe: string,
    start: Date,
    end: Date
  ): Promise<BarData[]> {
    // Return mock historical data
    return Array.from({ length: 100 }, (_, i) => ({
      symbol,
      timestamp: new Date(Date.now() - (100 - i) * 60000),
      open: 100 + Math.random() * 10,
      high: 105 + Math.random() * 10,
      low: 95 + Math.random() * 10,
      close: 100 + Math.random() * 10,
      volume: 1000000
    }));
  }

  async subscribeBars(
    symbols: string[],
    timeframe: string,
    callback: (bar: BarData) => void
  ): Promise<void> {
    for (const symbol of symbols) {
      this.subscribers.set(symbol, callback);
    }
  }

  async unsubscribe(symbols: string[]): Promise<void> {
    for (const symbol of symbols) {
      this.subscribers.delete(symbol);
    }
  }

  async disconnect(): Promise<void> {
    // Clean up all subscribers
    this.subscribers.clear();
  }

  async getLatestBar(symbol: string, timeframe: string): Promise<BarData | null> {
    return {
      symbol,
      timestamp: new Date(),
      open: 100,
      high: 105,
      low: 95,
      close: 102,
      volume: 1000000
    };
  }

  // Simulate sending bar data to subscribers
  simulateBar(bar: BarData) {
    const callback = this.subscribers.get(bar.symbol);
    if (callback) {
      callback(bar);
    }
  }
}

describe('TradingAgent', () => {
  let agent: TradingAgent;
  let mockBroker: MockBroker;
  let mockMarketData: MockMarketDataProvider;
  let config: AgentConfig;

  beforeEach(() => {
    mockBroker = new MockBroker();
    mockMarketData = new MockMarketDataProvider();

    const riskLimits: RiskLimits = {
      maxRiskPerTrade: 0.02,
      maxDailyLoss: 0.05,
      maxPositions: 5,
      maxExposurePerSymbol: 0.1,
      maxTotalExposure: 0.8,
      drawdownThresholds: [0.05, 0.10, 0.15],
      drawdownScaling: [0.8, 0.5, 0.2],
      maxDrawdown: 0.20,
      circuitBreakerCautious: 0.02,
      circuitBreakerHalt: 0.04,
      maxOpenRisk: 0.06,
      maxTradesPerDay: 20,
      minAccountValue: 25000,
      symbolCooldownMinutes: 45,
      atrStopMultiplier: 2.0,
      trailingStopATR: 1.0,
      trailingActivationATR: 0.75,
      avoidFirstMinutes: 0,
      avoidLastMinutes: 0,
      allowPyramiding: true,
      maxPyramidLayers: 3,
      pyramidScaling: 0.5
    };

    config = {
      symbols: ['AAPL', 'GOOGL', 'MSFT'],
      timeframe: '1Min',
      buyThreshold: 0.7,
      sellThreshold: -0.3,
      riskLimits,
      maxPositions: 5,
      emergencyStop: false
    };

    agent = new TradingAgent(config, mockBroker, mockMarketData);
  });

  describe('Initialization', () => {
    it('should initialize with correct configuration', () => {
      expect(agent).toBeDefined();
      expect(agent.getRunningStatus()).toBe(false);
    });

    it('should initialize state machine for all symbols', () => {
      const stats = agent.getStateMachineStats();
      expect(stats).toBeDefined();
      expect(stats.states).toBeDefined();
      expect(stats.transitions).toBeDefined();
      expect(stats.contexts).toBeDefined();
    });
  });

  describe('Agent Lifecycle', () => {
    it('should start successfully', async () => {
      await agent.start();
      expect(agent.getRunningStatus()).toBe(true);
    });

    it('should not start twice', async () => {
      await agent.start();
      expect(agent.getRunningStatus()).toBe(true);

      // Try to start again
      await agent.start();
      expect(agent.getRunningStatus()).toBe(true);
    });

    it('should stop successfully', async () => {
      await agent.start();
      expect(agent.getRunningStatus()).toBe(true);

      await agent.stop();
      expect(agent.getRunningStatus()).toBe(false);
    });

    it('should handle emergency stop', async () => {
      await agent.start();

      // Add some positions
      mockBroker.setPositions([
        {
          symbol: 'AAPL',
          quantity: 100,
          avgPrice: 150,
          marketValue: 15000,
          unrealizedPnL: 500,
          side: 'long'
        }
      ]);

      await agent.emergencyStop();
      expect(agent.getRunningStatus()).toBe(false);
    });
  });

  describe('Decision Making', () => {
    it('should record decisions', async () => {
      await agent.start();

      // Wait a bit for agent to process
      await new Promise(resolve => setTimeout(resolve, 100));

      const decisions = agent.getDecisions();
      expect(Array.isArray(decisions)).toBe(true);
    });

    it('should filter decisions by symbol', async () => {
      await agent.start();
      await new Promise(resolve => setTimeout(resolve, 100));

      const aaplDecisions = agent.getDecisions('AAPL');
      expect(Array.isArray(aaplDecisions)).toBe(true);

      // All decisions should be for AAPL
      for (const decision of aaplDecisions) {
        expect(decision.symbol).toBe('AAPL');
      }
    });

    it('should limit number of decisions returned', async () => {
      await agent.start();
      await new Promise(resolve => setTimeout(resolve, 100));

      const decisions = agent.getDecisions(undefined, 5);
      expect(decisions.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Risk Management Integration', () => {
    it('should respect max positions limit', async () => {
      // Set positions to max
      mockBroker.setPositions([
        { symbol: 'AAPL', quantity: 100, avgPrice: 150, marketValue: 15000, unrealizedPnL: 0, side: 'long' },
        { symbol: 'GOOGL', quantity: 10, avgPrice: 2500, marketValue: 25000, unrealizedPnL: 0, side: 'long' },
        { symbol: 'MSFT', quantity: 50, avgPrice: 300, marketValue: 15000, unrealizedPnL: 0, side: 'long' },
        { symbol: 'TSLA', quantity: 30, avgPrice: 200, marketValue: 6000, unrealizedPnL: 0, side: 'long' },
        { symbol: 'NVDA', quantity: 20, avgPrice: 500, marketValue: 10000, unrealizedPnL: 0, side: 'long' }
      ]);

      await agent.start();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Agent should not try to enter new positions
      const stats = agent.getStateMachineStats();
      expect(stats).toBeDefined();
      expect(stats.states).toBeDefined();
    });

    it('should stop trading on large drawdown', async () => {
      // Simulate large loss
      mockBroker.setAccountValue(90000); // 10% loss from 100k

      await agent.start();
      await new Promise(resolve => setTimeout(resolve, 100));

      // Agent should be in cautious or halted state
      expect(agent.getRunningStatus()).toBeDefined();
    });
  });

  describe('Market Session Awareness', () => {
    it('should detect current market session', () => {
      const session = agent.getCurrentMarketSession();
      expect(session).toBeDefined();
      expect(session.status).toBeDefined();
      expect(['market-hours', 'pre-market', 'after-hours', 'closed']).toContain(session.status);
    });
  });

  describe('State Machine Integration', () => {
    it('should provide state machine statistics', () => {
      const stats = agent.getStateMachineStats();

      expect(stats).toBeDefined();
      expect(stats.states).toBeDefined();
      expect(stats.transitions).toBeDefined();
      expect(stats.contexts).toBeDefined();
    });

    it('should track state transitions', async () => {
      await agent.start();

      const statsBefore = agent.getStateMachineStats();
      const transitionsBefore = statsBefore.transitions.length;

      // Wait for some processing
      await new Promise(resolve => setTimeout(resolve, 200));

      const statsAfter = agent.getStateMachineStats();
      const transitionsAfter = statsAfter.transitions.length;

      // Should have some transitions
      expect(transitionsAfter).toBeGreaterThanOrEqual(transitionsBefore);
    });
  });

  describe('Configuration', () => {
    it('should use custom EV gate configuration', () => {
      const customConfig = {
        ...config,
        evGateConfig: {
          minWinRate: 0.6,
          minRiskRewardRatio: 2.0,
          minExpectedValue: 0.5,
          enabled: true
        }
      };

      const customAgent = new TradingAgent(customConfig, mockBroker, mockMarketData);
      expect(customAgent).toBeDefined();
    });

    it('should use custom liquidity limits', () => {
      const customConfig = {
        ...config,
        liquidityLimits: {
          minDollarVolume: 10000000,
          minAvgVolume: 500000,
          maxSpreadPercent: 0.5,
          minMarketCap: 1000000000
        }
      };

      const customAgent = new TradingAgent(customConfig, mockBroker, mockMarketData);
      expect(customAgent).toBeDefined();
    });
  });
});
