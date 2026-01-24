export interface NewOrder {
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  type: "limit" | "market" | "marketable_limit";
  limitPrice?: number;
  stopLoss?: number;
  timeInForce?: "day" | "gtc" | "ioc" | "fok";
  // New fields for marketable limits
  priceBandBps?: number;  // Price band in basis points (default: 20bps)
  useBestBidOffer?: boolean; // Use NBBO for pricing (default: true)
}

export interface PlacedOrder {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  status: string;
  filledQty: number;
  avgFillPrice?: number;
  submittedAt: Date;
  filledAt?: Date;
}

export interface Account {
  id: string;
  currency: string;
  buyingPower: number;
  equity: number;
  cash: number;
  portfolioValue: number;
  daytradeCount: number;
  status: string;
}

export interface BrokerPosition {
  symbol: string;
  qty: number;
  avgEntryPrice: number;
  marketValue: number;
  costBasis: number;
  unrealizedPl: number;
  unrealizedPlpc: number;
  side: "long" | "short";
  assetClass: string;
}

export interface Broker {
  /**
   * Get account information including buying power, equity, etc.
   */
  getAccount(): Promise<Account>;

  /**
   * Get all current positions
   */
  getPositions(): Promise<BrokerPosition[]>;

  /**
   * Place a new order
   */
  placeOrder(order: NewOrder): Promise<PlacedOrder>;

  /**
   * Cancel an existing order
   */
  cancelOrder(orderId: string): Promise<void>;

  /**
   * Get order status
   */
  getOrder(orderId: string): Promise<PlacedOrder>;

  /**
   * Get all orders (optional filters)
   */
  getOrders(status?: string, limit?: number): Promise<PlacedOrder[]>;

  /**
   * Close all positions (emergency stop)
   */
  closeAllPositions(): Promise<void>;

  /**
   * Get best bid/offer for a symbol
   */
  getBestBidOffer?(symbol: string): Promise<{ bid: number; ask: number; last: number }>;
}
