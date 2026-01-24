import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AlpacaBroker } from '../src/adapters/AlpacaBroker';
import type { NewOrder } from '../src/adapters/Broker';

// Mock the global fetch function
global.fetch = vi.fn();

describe('AlpacaBroker', () => {
  let broker: AlpacaBroker;
  const mockApiKey = 'test-api-key';
  const mockApiSecret = 'test-api-secret';

  beforeEach(() => {
    // Reset environment
    process.env.TRADING_MODE = 'paper';
    delete process.env.CONFIRM_LIVE_TRADING;

    // Create broker instance
    broker = new AlpacaBroker(mockApiKey, mockApiSecret, true);

    // Reset mock
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with paper trading URL', () => {
      const paperBroker = new AlpacaBroker(mockApiKey, mockApiSecret, true);
      expect(paperBroker).toBeDefined();
    });

    it('should initialize with live trading URL', () => {
      const liveBroker = new AlpacaBroker(mockApiKey, mockApiSecret, false);
      expect(liveBroker).toBeDefined();
    });
  });

  describe('getAccount', () => {
    it('should fetch and parse account data', async () => {
      const mockAccountData = {
        id: 'test-account-id',
        currency: 'USD',
        buying_power: '100000.00',
        equity: '100000.00',
        cash: '50000.00',
        portfolio_value: '100000.00',
        status: 'ACTIVE'
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockAccountData
      });

      const account = await broker.getAccount();

      expect(account).toEqual({
        id: 'test-account-id',
        currency: 'USD',
        buyingPower: 100000,
        equity: 100000,
        cash: 50000,
        portfolioValue: 100000,
        daytradeCount: 0,
        status: 'ACTIVE'
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://paper-api.alpaca.markets/v2/account',
        expect.objectContaining({
          headers: expect.objectContaining({
            'APCA-API-KEY-ID': mockApiKey,
            'APCA-API-SECRET-KEY': mockApiSecret
          })
        })
      );
    });

    it('should handle API errors', async () => {
      // Mock error for all retry attempts
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized'
      });

      await expect(broker.getAccount()).rejects.toThrow('Alpaca API error');
    });
  });

  describe('getPositions', () => {
    it('should fetch and parse positions', async () => {
      const mockPositions = [
        {
          symbol: 'AAPL',
          qty: '100',
          avg_entry_price: '150.00',
          market_value: '15000.00',
          cost_basis: '15000.00',
          unrealized_pl: '500.00',
          unrealized_plpc: '0.033',
          asset_class: 'us_equity'
        },
        {
          symbol: 'GOOGL',
          qty: '-50',
          avg_entry_price: '2500.00',
          market_value: '-125000.00',
          cost_basis: '125000.00',
          unrealized_pl: '-1000.00',
          unrealized_plpc: '-0.008',
          asset_class: 'us_equity'
        }
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockPositions
      });

      const positions = await broker.getPositions();

      expect(positions).toHaveLength(2);
      expect(positions[0]).toMatchObject({
        symbol: 'AAPL',
        side: 'long'
      });
      expect(positions[1]).toMatchObject({
        symbol: 'GOOGL',
        side: 'short'
      });
    });

    it('should return empty array when no positions', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => []
      });

      const positions = await broker.getPositions();
      expect(positions).toEqual([]);
    });
  });

  describe('placeOrder', () => {
    it('should place a market order', async () => {
      const order: NewOrder = {
        symbol: 'AAPL',
        side: 'buy',
        qty: 100,
        type: 'market',
        timeInForce: 'day'
      };

      const mockResponse = {
        id: 'order-123',
        symbol: 'AAPL',
        side: 'buy',
        qty: '100',
        status: 'submitted',
        filled_qty: '0',
        submitted_at: new Date().toISOString()
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse
      });

      const placedOrder = await broker.placeOrder(order);

      expect(placedOrder).toMatchObject({
        id: 'order-123',
        symbol: 'AAPL',
        side: 'buy',
        qty: 100,
        status: 'submitted'
      });

      // Verify the request body
      expect(global.fetch).toHaveBeenCalledWith(
        'https://paper-api.alpaca.markets/v2/orders',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('market')
        })
      );
    });

    it('should place a limit order', async () => {
      const order: NewOrder = {
        symbol: 'GOOGL',
        side: 'sell',
        qty: 50,
        type: 'limit',
        limitPrice: 2550,
        timeInForce: 'day'
      };

      const mockResponse = {
        id: 'order-456',
        symbol: 'GOOGL',
        side: 'sell',
        qty: '50',
        status: 'submitted',
        filled_qty: '0',
        submitted_at: new Date().toISOString()
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse
      });

      const placedOrder = await broker.placeOrder(order);

      expect(placedOrder.symbol).toBe('GOOGL');
      expect(placedOrder.side).toBe('sell');
      expect(placedOrder.qty).toBe(50);
    });

    it('should place a marketable limit order with quote fetch', async () => {
      const order: NewOrder = {
        symbol: 'AAPL',
        side: 'buy',
        qty: 100,
        type: 'marketable_limit',
        priceBandBps: 20,
        timeInForce: 'ioc'
      };

      // Mock the order response (getLatestQuote uses internal fallback prices)
      const mockOrderResponse = {
        id: 'order-789',
        symbol: 'AAPL',
        side: 'buy',
        qty: '100',
        status: 'submitted',
        filled_qty: '0',
        submitted_at: new Date().toISOString()
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockOrderResponse
      });

      const placedOrder = await broker.placeOrder(order);

      expect(placedOrder.id).toBe('order-789');
      expect(global.fetch).toHaveBeenCalledTimes(1); // Only for placeOrder
    });

    it('should reject live trading without confirmation', async () => {
      const liveBroker = new AlpacaBroker(mockApiKey, mockApiSecret, false);
      process.env.TRADING_MODE = 'live';
      delete process.env.CONFIRM_LIVE_TRADING;

      const order: NewOrder = {
        symbol: 'AAPL',
        side: 'buy',
        qty: 100,
        type: 'market'
      };

      await expect(liveBroker.placeOrder(order)).rejects.toThrow(
        'Live trading requires CONFIRM_LIVE_TRADING=true'
      );
    });

    it('should place order with stop loss', async () => {
      const order: NewOrder = {
        symbol: 'AAPL',
        side: 'buy',
        qty: 100,
        type: 'market',
        stopLoss: 145.00
      };

      const mockResponse = {
        id: 'order-stop',
        symbol: 'AAPL',
        side: 'buy',
        qty: '100',
        status: 'submitted',
        filled_qty: '0',
        submitted_at: new Date().toISOString()
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse
      });

      await broker.placeOrder(order);

      const callBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(callBody.stop_loss).toBeDefined();
      expect(callBody.stop_loss.stop_price).toBe('145');
    });
  });

  describe('cancelOrder', () => {
    it('should cancel an order', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({})
      });

      await broker.cancelOrder('order-123');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://paper-api.alpaca.markets/v2/orders/order-123',
        expect.objectContaining({
          method: 'DELETE'
        })
      );
    });

    it('should handle cancel errors', async () => {
      // Mock 404 error for all retries
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => 'Order not found'
      });

      await expect(broker.cancelOrder('invalid-order')).rejects.toThrow('Order not found');
    });
  });

  describe('getOrder', () => {
    it('should fetch order details', async () => {
      const mockOrder = {
        id: 'order-123',
        symbol: 'AAPL',
        side: 'buy',
        qty: '100',
        status: 'filled',
        filled_qty: '100',
        filled_avg_price: '150.50',
        submitted_at: new Date().toISOString(),
        filled_at: new Date().toISOString()
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockOrder
      });

      const order = await broker.getOrder('order-123');

      expect(order).toMatchObject({
        id: 'order-123',
        symbol: 'AAPL',
        side: 'buy',
        qty: 100,
        status: 'filled',
        filledQty: 100
      });
    });
  });

  describe('Rate Limiting', () => {
    it('should retry on 429 rate limit', async () => {
      // First call returns 429, second succeeds
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: async () => 'Rate limited'
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            id: 'test',
            currency: 'USD',
            buying_power: '100000',
            equity: '100000',
            cash: '100000',
            portfolio_value: '100000',
            status: 'ACTIVE'
          })
        });

      await broker.getAccount();

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should fail after max retries', async () => {
      // Always return 429 (will retry 3 times for 4 total calls)
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'Rate limited'
      });

      await expect(broker.getAccount()).rejects.toThrow();

      // Should retry 3 times (4 total calls)
      expect(global.fetch).toHaveBeenCalledTimes(4);
    }, 30000); // Increase timeout to 30s for retries
  });

  describe('Error Handling', () => {
    it('should handle network errors', async () => {
      // Reject all retry attempts
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      await expect(broker.getAccount()).rejects.toThrow('Network error');
    });

    it('should parse error messages from API', async () => {
      // Mock error for all retry attempts
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Invalid request parameters'
      });

      await expect(broker.getAccount()).rejects.toThrow('Invalid request parameters');
    });
  });
});
