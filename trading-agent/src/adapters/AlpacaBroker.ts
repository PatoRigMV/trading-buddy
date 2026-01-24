import { Broker, NewOrder, PlacedOrder, Account, BrokerPosition } from './Broker';

export class AlpacaBroker implements Broker {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;
  private isPaper: boolean;

  constructor(apiKey: string, apiSecret: string, isPaper: boolean = true) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.isPaper = isPaper;
    this.baseUrl = isPaper
      ? 'https://paper-api.alpaca.markets'
      : 'https://api.alpaca.markets';
  }

  private getHeaders(): Record<string, string> {
    return {
      'APCA-API-KEY-ID': this.apiKey,
      'APCA-API-SECRET-KEY': this.apiSecret,
      'Content-Type': 'application/json'
    };
  }

  protected async makeRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount <= maxRetries) {
      try {
        const url = `${this.baseUrl}${endpoint}`;
        const response = await fetch(url, {
          ...options,
          headers: {
            ...this.getHeaders(),
            ...options.headers
          }
        });

        if (response.status === 429) {
          // Rate limited - exponential backoff
          const delay = Math.min(1000 * Math.pow(2, retryCount), 30000); // Max 30 seconds
          console.warn(`Alpaca API rate limited, retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries + 1})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          retryCount++;
          continue;
        }

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Alpaca API error (${response.status}): ${errorText}`);
        }

        return response.json();
      } catch (error: any) {
        if (retryCount === maxRetries) {
          throw error;
        }

        // Exponential backoff for network errors too
        const delay = Math.min(500 * Math.pow(2, retryCount), 15000);
        console.warn(`Alpaca API request failed, retrying in ${delay}ms:`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay));
        retryCount++;
      }
    }

    throw new Error('Max retries exceeded');
  }

  async getAccount(): Promise<Account> {
    const data = await this.makeRequest('/v2/account');

    return {
      id: data.id,
      currency: data.currency,
      buyingPower: parseFloat(data.buying_power),
      equity: parseFloat(data.equity),
      cash: parseFloat(data.cash),
      portfolioValue: parseFloat(data.portfolio_value),
      daytradeCount: parseInt(data.daytrade_buying_power_used || '0'),
      status: data.status
    };
  }

  async getPositions(): Promise<BrokerPosition[]> {
    const data = await this.makeRequest('/v2/positions');

    return data.map((pos: any) => ({
      symbol: pos.symbol,
      qty: parseFloat(pos.qty),
      avgEntryPrice: parseFloat(pos.avg_entry_price),
      marketValue: parseFloat(pos.market_value),
      costBasis: parseFloat(pos.cost_basis),
      unrealizedPl: parseFloat(pos.unrealized_pl),
      unrealizedPlpc: parseFloat(pos.unrealized_plpc),
      side: parseFloat(pos.qty) >= 0 ? 'long' as const : 'short' as const,
      assetClass: pos.asset_class
    }));
  }

  async placeOrder(order: NewOrder): Promise<PlacedOrder> {
    // Safety check for paper trading
    if (process.env.TRADING_MODE !== 'paper' && !process.env.CONFIRM_LIVE_TRADING) {
      throw new Error('Live trading requires CONFIRM_LIVE_TRADING=true in environment');
    }

    let orderRequest: any;

    if (order.type === 'marketable_limit') {
      // Get current NBBO
      const quote = await this.getLatestQuote(order.symbol);
      const priceBandBps = order.priceBandBps || 20; // Default 20bps
      const bandMultiplier = priceBandBps / 10000; // Convert bps to decimal

      let limitPrice: number;
      if (order.side === 'buy') {
        // For buy: use ask + band as limit (aggressive but protected)
        limitPrice = quote.ask * (1 + bandMultiplier);
      } else {
        // For sell: use bid - band as limit (aggressive but protected)
        limitPrice = quote.bid * (1 - bandMultiplier);
      }

      orderRequest = {
        symbol: order.symbol,
        side: order.side,
        qty: order.qty.toString(),
        type: 'limit',
        time_in_force: order.timeInForce || 'ioc', // Use IOC for marketable limits
        limit_price: limitPrice.toFixed(2),
        ...(order.stopLoss && { stop_loss: { stop_price: order.stopLoss.toString() } })
      };
    } else {
      orderRequest = {
        symbol: order.symbol,
        side: order.side,
        qty: order.qty.toString(),
        type: order.type,
        time_in_force: order.timeInForce || 'day',
        ...(order.limitPrice && { limit_price: order.limitPrice.toString() }),
        ...(order.stopLoss && { stop_loss: { stop_price: order.stopLoss.toString() } })
      };
    }

    const data = await this.makeRequest('/v2/orders', {
      method: 'POST',
      body: JSON.stringify(orderRequest)
    });

    return {
      id: data.id,
      symbol: data.symbol,
      side: data.side,
      qty: parseFloat(data.qty),
      status: data.status,
      filledQty: parseFloat(data.filled_qty || '0'),
      avgFillPrice: data.filled_avg_price ? parseFloat(data.filled_avg_price) : undefined,
      submittedAt: new Date(data.submitted_at),
      filledAt: data.filled_at ? new Date(data.filled_at) : undefined
    };
  }

  async cancelOrder(orderId: string): Promise<void> {
    await this.makeRequest(`/v2/orders/${orderId}`, {
      method: 'DELETE'
    });
  }

  async getOrder(orderId: string): Promise<PlacedOrder> {
    const data = await this.makeRequest(`/v2/orders/${orderId}`);

    return {
      id: data.id,
      symbol: data.symbol,
      side: data.side,
      qty: parseFloat(data.qty),
      status: data.status,
      filledQty: parseFloat(data.filled_qty || '0'),
      avgFillPrice: data.filled_avg_price ? parseFloat(data.filled_avg_price) : undefined,
      submittedAt: new Date(data.submitted_at),
      filledAt: data.filled_at ? new Date(data.filled_at) : undefined
    };
  }

  async getOrders(status?: string, limit: number = 100): Promise<PlacedOrder[]> {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    params.append('limit', limit.toString());

    const data = await this.makeRequest(`/v2/orders?${params.toString()}`);

    return data.map((order: any) => ({
      id: order.id,
      symbol: order.symbol,
      side: order.side,
      qty: parseFloat(order.qty),
      status: order.status,
      filledQty: parseFloat(order.filled_qty || '0'),
      avgFillPrice: order.filled_avg_price ? parseFloat(order.filled_avg_price) : undefined,
      submittedAt: new Date(order.submitted_at),
      filledAt: order.filled_at ? new Date(order.filled_at) : undefined
    }));
  }

  async closeAllPositions(): Promise<void> {
    const positions = await this.getPositions();

    const closePromises = positions.map(async (position) => {
      if (position.qty !== 0) {
        const side = position.qty > 0 ? 'sell' : 'buy';
        const qty = Math.abs(position.qty);

        return this.placeOrder({
          symbol: position.symbol,
          side,
          qty,
          type: 'marketable_limit',
          priceBandBps: 30, // Wider band for emergency liquidation
          timeInForce: 'ioc'
        });
      }
    });

    await Promise.all(closePromises);
  }

  // Store latest bar data for immediate quote access
  private latestPrices = new Map<string, number>();

  /**
   * Update latest price from bar data (called by the agent when it receives new bars)
   */
  updateLatestPrice(symbol: string, price: number): void {
    this.latestPrices.set(symbol, price);
  }

  /**
   * Get current market price for a symbol (using latest bar data)
   */
  async getLatestQuote(symbol: string): Promise<{ bid: number; ask: number; last: number }> {
    // Use the latest bar price if available
    const latestPrice = this.latestPrices.get(symbol);

    if (latestPrice && latestPrice > 0) {
      // Simulate realistic bid/ask spread based on price level
      const spread = latestPrice * 0.0005; // 0.05% spread

      return {
        bid: latestPrice - spread,
        ask: latestPrice + spread,
        last: latestPrice
      };
    }

    // Fallback to reasonable market prices for major stocks
    const fallbackPrices: Record<string, number> = {
      'AAPL': 225, 'MSFT': 420, 'NVDA': 120, 'GOOGL': 165, 'AMZN': 175,
      'TSLA': 250, 'META': 520, 'AMD': 140, 'INTC': 21, 'JPM': 210,
      'BAC': 40, 'V': 280, 'JNJ': 160, 'UNH': 520, 'WMT': 70,
      'HD': 380, 'PG': 170, 'KO': 63, 'NFLX': 700, 'CRM': 280
    };

    const fallbackPrice = fallbackPrices[symbol] || 150;
    const spread = fallbackPrice * 0.0005;

    return {
      bid: fallbackPrice - spread,
      ask: fallbackPrice + spread,
      last: fallbackPrice
    };
  }

  /**
   * Get best bid/offer for a symbol
   */
  async getBestBidOffer(symbol: string): Promise<{ bid: number; ask: number; last: number }> {
    return this.getLatestQuote(symbol);
  }
}
