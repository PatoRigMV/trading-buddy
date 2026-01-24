// netPriceReconciliation.ts
// Advanced net-price reconciliation loop with cancel/replace backoff strategy
// Implements intelligent order management for options combo execution
// Author: Integration deliverable #2

/* eslint-disable @typescript-eslint/no-explicit-any */

import { Broker, ComboLeg, Quote } from './executionHelpers';

export interface ReconciliationConfig {
  maxAttempts: number;
  initialBackoffMs: number;
  maxBackoffMs: number;
  backoffMultiplier: number;
  priceToleranceBps: number;
  maxSlippageBps: number;
  timeoutMs: number;
}

export interface ActiveOrder {
  orderId: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  limitPrice: number;
  filledQty: number;
  status: string;
  timestamp: number;
}

export interface ReconciliationState {
  attempt: number;
  targetNetPrice: number;
  currentNetPrice: number;
  activeOrders: Map<string, ActiveOrder>;
  filledLegs: Map<string, number>;
  backoffMs: number;
  startTime: number;
  lastReconcileTime: number;
}

export interface ReconciliationResult {
  success: boolean;
  finalNetPrice?: number;
  totalFilled: number;
  attempts: number;
  elapsed: number;
  reason?: string;
  filledQtys: Record<string, number>;
}

export class NetPriceReconciliationEngine {
  private broker: Broker;
  private config: ReconciliationConfig;

  constructor(broker: Broker, config: ReconciliationConfig) {
    this.broker = broker;
    this.config = config;
  }

  async reconcileComboNetPrice(
    legs: ComboLeg[],
    targetNetPrice: number,
    clientTag?: string
  ): Promise<ReconciliationResult> {
    const state: ReconciliationState = {
      attempt: 0,
      targetNetPrice,
      currentNetPrice: 0,
      activeOrders: new Map(),
      filledLegs: new Map(),
      backoffMs: this.config.initialBackoffMs,
      startTime: Date.now(),
      lastReconcileTime: Date.now()
    };

    const tag = clientTag || `reconcile-${Date.now()}`;
    console.log(`[${tag}] Starting net-price reconciliation for ${legs.length} legs, target: ${targetNetPrice}`);

    try {
      while (state.attempt < this.config.maxAttempts) {
        state.attempt++;
        console.log(`[${tag}] Reconciliation attempt ${state.attempt}/${this.config.maxAttempts}`);

        // Check timeout
        if (Date.now() - state.startTime > this.config.timeoutMs) {
          return this.buildFailureResult(state, 'timeout');
        }

        // Cancel outstanding orders from previous attempt
        if (state.activeOrders.size > 0) {
          await this.cancelActiveOrders(state, tag);
        }

        // Get fresh quotes and calculate new limit prices
        const legQuotes = await this.getQuotesForLegs(legs);
        const legPrices = this.calculateOptimalPrices(legs, legQuotes, targetNetPrice);

        // Place new orders
        const orderResults = await this.placeOrdersForLegs(legs, legPrices, state, tag);

        // Wait for fills with progressive timeout
        await this.waitForFills(state, Math.min(state.backoffMs * 2, 5000), tag);

        // Check if combo is complete
        const completionCheck = this.checkComboCompletion(legs, state);
        if (completionCheck.complete) {
          return {
            success: true,
            finalNetPrice: state.currentNetPrice,
            totalFilled: completionCheck.totalFilled,
            attempts: state.attempt,
            elapsed: Date.now() - state.startTime,
            filledQtys: Object.fromEntries(state.filledLegs)
          };
        }

        // Calculate current slippage and decide if acceptable
        const currentSlippageBps = Math.abs(((state.currentNetPrice - targetNetPrice) / targetNetPrice) * 10000);
        if (currentSlippageBps > this.config.maxSlippageBps) {
          console.log(`[${tag}] Slippage ${currentSlippageBps.toFixed(1)}bps exceeds limit ${this.config.maxSlippageBps}bps`);
          return this.buildFailureResult(state, 'max_slippage_exceeded');
        }

        // Apply exponential backoff
        await this.sleep(state.backoffMs);
        state.backoffMs = Math.min(state.backoffMs * this.config.backoffMultiplier, this.config.maxBackoffMs);
        state.lastReconcileTime = Date.now();
      }

      return this.buildFailureResult(state, 'max_attempts_exceeded');

    } catch (error) {
      console.error(`[${tag}] Reconciliation error:`, error);
      await this.emergencyCleanup(state, tag);
      return this.buildFailureResult(state, `error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async getQuotesForLegs(legs: ComboLeg[]): Promise<Map<string, Quote>> {
    const quotes = new Map<string, Quote>();

    // Fetch quotes in parallel
    const quotePromises = legs.map(async (leg) => {
      try {
        const quote = await this.broker.getQuote(leg.symbol);
        quotes.set(leg.symbol, quote);
      } catch (error) {
        console.warn(`Failed to get quote for ${leg.symbol}:`, error);
        // Use fallback quote with wide spread
        quotes.set(leg.symbol, {
          bid: 0,
          ask: 100,
          last: 50,
          tickSize: 0.01
        });
      }
    });

    await Promise.all(quotePromises);
    return quotes;
  }

  private calculateOptimalPrices(
    legs: ComboLeg[],
    quotes: Map<string, Quote>,
    targetNetPrice: number
  ): Map<string, number> {
    const prices = new Map<string, number>();

    // Calculate theoretical net price at mid-market
    let theoreticalNet = 0;
    for (const leg of legs) {
      const quote = quotes.get(leg.symbol);
      if (quote) {
        const mid = (quote.bid + quote.ask) / 2;
        theoreticalNet += leg.side === 'buy' ? mid * leg.quantity : -mid * leg.quantity;
      }
    }

    // Calculate adjustment factor to reach target
    const adjustment = targetNetPrice - theoreticalNet;
    const adjustmentPerLeg = adjustment / legs.length;

    // Apply adjustment to each leg's limit price
    for (const leg of legs) {
      const quote = quotes.get(leg.symbol);
      if (quote) {
        const mid = (quote.bid + quote.ask) / 2;
        let limitPrice: number;

        if (leg.side === 'buy') {
          // For buys, start at ask and adjust down toward target
          limitPrice = quote.ask + adjustmentPerLeg;
          limitPrice = Math.max(limitPrice, quote.bid); // Don't go below bid
        } else {
          // For sells, start at bid and adjust up toward target
          limitPrice = quote.bid - adjustmentPerLeg;
          limitPrice = Math.min(limitPrice, quote.ask); // Don't go above ask
        }

        // Round to tick size
        const tickSize = quote.tickSize || 0.01;
        limitPrice = Math.round(limitPrice / tickSize) * tickSize;
        prices.set(leg.symbol, limitPrice);
      }
    }

    return prices;
  }

  private async placeOrdersForLegs(
    legs: ComboLeg[],
    prices: Map<string, number>,
    state: ReconciliationState,
    tag: string
  ): Promise<void> {
    // Place orders sequentially to maintain proper risk management
    for (const leg of legs) {
      const limitPrice = prices.get(leg.symbol);
      if (limitPrice) {
        try {
          const result = await this.broker.placeLimitOrder(
            leg.symbol,
            leg.side,
            leg.quantity,
            limitPrice,
            'IOC' // Use IOC for immediate feedback
          );

          const activeOrder: ActiveOrder = {
            orderId: result.orderId,
            symbol: leg.symbol,
            side: leg.side,
            quantity: leg.quantity,
            limitPrice,
            filledQty: result.filledQty,
            status: result.status,
            timestamp: Date.now()
          };

          state.activeOrders.set(result.orderId, activeOrder);

          if (result.filledQty > 0) {
            state.filledLegs.set(leg.symbol, (state.filledLegs.get(leg.symbol) || 0) + result.filledQty);

            // Update current net price
            const fillValue = result.avgPrice ? result.avgPrice * result.filledQty : limitPrice * result.filledQty;
            if (leg.side === 'buy') {
              state.currentNetPrice += fillValue;
            } else {
              state.currentNetPrice -= fillValue;
            }
          }

          console.log(`[${tag}] Placed ${leg.side} order for ${leg.symbol}: ${result.filledQty}/${leg.quantity} filled`);

        } catch (error) {
          console.warn(`[${tag}] Failed to place order for ${leg.symbol}:`, error);
        }
      }
    }
  }

  private async waitForFills(state: ReconciliationState, timeoutMs: number, tag: string): Promise<void> {
    const endTime = Date.now() + timeoutMs;

    while (Date.now() < endTime && state.activeOrders.size > 0) {
      await this.sleep(100); // Check every 100ms

      // Update order statuses
      const orderIds = Array.from(state.activeOrders.keys());
      for (const orderId of orderIds) {
        const activeOrder = state.activeOrders.get(orderId);
        if (activeOrder && (activeOrder.status === 'new' || activeOrder.status === 'accepted')) {
          try {
            const updatedOrder = await this.broker.getOrder(orderId);
            activeOrder.status = updatedOrder.status;
            activeOrder.filledQty = parseFloat(updatedOrder.filled_qty || '0');

            if (activeOrder.filledQty > 0) {
              const prevFilled = state.filledLegs.get(activeOrder.symbol) || 0;
              const newFills = activeOrder.filledQty - prevFilled;

              if (newFills > 0) {
                state.filledLegs.set(activeOrder.symbol, activeOrder.filledQty);

                // Update net price with new fills
                const avgPrice = parseFloat(updatedOrder.filled_avg_price || String(activeOrder.limitPrice));
                const fillValue = avgPrice * newFills;

                if (activeOrder.side === 'buy') {
                  state.currentNetPrice += fillValue;
                } else {
                  state.currentNetPrice -= fillValue;
                }

                console.log(`[${tag}] ${activeOrder.symbol} partial fill: +${newFills}, net price now: ${state.currentNetPrice.toFixed(4)}`);
              }
            }
          } catch (error) {
            console.warn(`[${tag}] Failed to update order ${orderId}:`, error);
          }
        }
      }
    }
  }

  private checkComboCompletion(legs: ComboLeg[], state: ReconciliationState): { complete: boolean; totalFilled: number } {
    let totalFilled = 0;
    let allComplete = true;

    for (const leg of legs) {
      const filled = state.filledLegs.get(leg.symbol) || 0;
      totalFilled += filled;

      if (filled < leg.quantity) {
        allComplete = false;
      }
    }

    return { complete: allComplete, totalFilled };
  }

  private async cancelActiveOrders(state: ReconciliationState, tag: string): Promise<void> {
    const cancelPromises = Array.from(state.activeOrders.entries()).map(async ([orderId, order]) => {
      try {
        await this.broker.cancelOrder(orderId);
        console.log(`[${tag}] Cancelled order ${orderId} for ${order.symbol}`);
      } catch (error) {
        console.warn(`[${tag}] Failed to cancel order ${orderId}:`, error);
      }
    });

    await Promise.all(cancelPromises);
    state.activeOrders.clear();
  }

  private async emergencyCleanup(state: ReconciliationState, tag: string): Promise<void> {
    console.log(`[${tag}] Performing emergency cleanup...`);
    await this.cancelActiveOrders(state, tag);
  }

  private buildFailureResult(state: ReconciliationState, reason: string): ReconciliationResult {
    return {
      success: false,
      totalFilled: Array.from(state.filledLegs.values()).reduce((sum, qty) => sum + qty, 0),
      attempts: state.attempt,
      elapsed: Date.now() - state.startTime,
      reason,
      filledQtys: Object.fromEntries(state.filledLegs)
    };
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Add getOrder method to Broker interface if not present
  private async getOrder(orderId: string): Promise<any> {
    // This should be implemented in the broker interface
    // For now, we'll try to call it and handle errors gracefully
    try {
      return await (this.broker as any).getOrder(orderId);
    } catch (error) {
      console.warn(`Failed to get order ${orderId}:`, error);
      return { filled_qty: '0', status: 'unknown' };
    }
  }
}

// Default configuration for production use
export const DEFAULT_RECONCILIATION_CONFIG: ReconciliationConfig = {
  maxAttempts: 8,
  initialBackoffMs: 500,
  maxBackoffMs: 8000,
  backoffMultiplier: 1.5,
  priceToleranceBps: 25,
  maxSlippageBps: 50,
  timeoutMs: 300000 // 5 minutes
};

// Factory function for easy instantiation
export function createReconciliationEngine(
  broker: Broker,
  customConfig?: Partial<ReconciliationConfig>
): NetPriceReconciliationEngine {
  const config = { ...DEFAULT_RECONCILIATION_CONFIG, ...customConfig };
  return new NetPriceReconciliationEngine(broker, config);
}
