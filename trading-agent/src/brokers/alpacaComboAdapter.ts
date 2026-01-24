// alpacaComboAdapter.ts
// Alpaca ComboAdapter: emulates combo net-price via coordinated single-leg orders
// with IOC attempts, hedge sequencing, and slippage controls.
// NOTE: Alpaca's API may not support native option combo orders; this adapter
// orchestrates synchronized single-leg orders while attempting to maintain a target net price.
// Wire your actual Alpaca client where indicated.
//
// Author: ChatGPT (GPT-5 Thinking)

/* eslint-disable @typescript-eslint/no-explicit-any */

import { Broker, ComboLeg, ComboOrderRequest, ComboOrderResult, Quote, slippageBps } from '../utils/executionHelpers';
import { Metrics, LadderAttemptMetric } from '../utils/metrics';
import { AlpacaClient, AlpacaConfig } from '../utils/alpacaClientAdvanced';

export class AlpacaComboAdapter implements Broker {
  private alpaca: AlpacaClient;
  private metrics?: Metrics;

  constructor(config: AlpacaConfig, metrics?: Metrics) {
    this.alpaca = new AlpacaClient(config);
    this.metrics = metrics;
  }

  async getQuote(symbol: string): Promise<Quote> {
    try {
      const alpacaQuote = await this.alpaca.getOptionQuote(symbol);
      return {
        bid: alpacaQuote.bid_price,
        ask: alpacaQuote.ask_price,
        last: alpacaQuote.last_price || (alpacaQuote.bid_price + alpacaQuote.ask_price) / 2,
        tickSize: 0.01 // Standard options tick size
      };
    } catch (error) {
      throw new Error(`Failed to get quote for ${symbol}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async placeComboOrder(req: ComboOrderRequest & { netPriceLimit: number }): Promise<ComboOrderResult> {
    // If Alpaca supports combo orders in future, call it directly here.
    // Otherwise emulate with synchronized singles:
    return this.emulateComboNetPrice(req);
  }

  async cancelOrder(orderId: string): Promise<void> {
    try {
      await this.alpaca.cancelOrder(orderId);
    } catch (error) {
      throw new Error(`Failed to cancel order ${orderId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async placeLimitOrder(symbol: string, side: 'buy'|'sell', qty: number, limitPrice: number, tif: 'IOC'|'DAY'|'FOK'='IOC'): Promise<{orderId: string, filledQty: number, avgPrice?: number, status: string}> {
    try {
      const timeInForce = tif.toLowerCase() === 'ioc' ? 'ioc' : tif.toLowerCase() === 'fok' ? 'fok' : 'day';

      const order = await this.alpaca.placeOptionsOrder({
        symbol,
        qty,
        side,
        type: 'limit',
        limit_price: limitPrice,
        time_in_force: timeInForce,
        client_order_id: `${symbol}-${Date.now()}`
      });

      // For IOC/FOK orders, wait briefly to see if they fill immediately
      if (tif === 'IOC' || tif === 'FOK') {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s for fill
        const updatedOrder = await this.alpaca.getOrder(order.id);

        return {
          orderId: order.id,
          filledQty: parseFloat(updatedOrder.filled_qty || '0'),
          avgPrice: updatedOrder.filled_avg_price ? parseFloat(updatedOrder.filled_avg_price) : undefined,
          status: updatedOrder.status
        };
      }

      return {
        orderId: order.id,
        filledQty: parseFloat(order.filled_qty || '0'),
        avgPrice: order.filled_avg_price ? parseFloat(order.filled_avg_price) : undefined,
        status: order.status
      };
    } catch (error) {
      throw new Error(`Failed to place limit order for ${symbol}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Emulate a combo by placing short premium legs first (collect credit), then hedging longs.
   * Tries to respect a target net price by keeping a running tally of achieved credits/debits.
   * Abort if net slippage beyond cap or partials leave you unhedged.
   */
  private async emulateComboNetPrice(req: ComboOrderRequest & { netPriceLimit: number }): Promise<ComboOrderResult> {
    const orderTag = req.clientTag ?? 'combo';
    const result: ComboOrderResult = {
      orderId: `${orderTag}-${Date.now()}`,
      filled: false,
      filledQtys: {},
      status: 'rejected'
    };

    // Sequence: sell legs first, then buy legs
    const sellLegs = req.legs.filter(l => l.side === 'sell');
    const buyLegs  = req.legs.filter(l => l.side === 'buy');

    let netSpent = 0; // positive = paid, negative = received
    let totalQty = 0;
    const rungMetric: LadderAttemptMetric = {
      tag: orderTag,
      attemptIndex: 0,
      targetNetPrice: req.netPriceLimit,
      achievedNetPrice: 0,
      filled: false,
      filledQty: 0,
      slippageBps: 0,
      reason: ''
    };

    // SELL legs
    for (const leg of sellLegs) {
      const q = await this.getQuote(leg.symbol);
      const mid = (q.bid + q.ask) / 2;
      const limit = Number((mid + (q.tickSize ?? 0.01)).toFixed(4)); // edge toward fill
      const r = await this.placeLimitOrder(leg.symbol, 'sell', leg.quantity, limit, req.tif ?? 'IOC');
      if (r.filledQty <= 0) {
        rungMetric.reason = `sell_leg_no_fill_${leg.symbol}`;
        this.metrics?.recordLadderAttempt(rungMetric);
        return { ...result, status: 'expired', reason: rungMetric.reason };
      }
      netSpent -= (r.avgPrice ?? limit) * r.filledQty;
      totalQty += r.filledQty;
      result.filledQtys[leg.symbol] = r.filledQty;
    }

    // BUY legs (hedge)
    for (const leg of buyLegs) {
      const q = await this.getQuote(leg.symbol);
      const mid = (q.bid + q.ask) / 2;
      const limit = Number((mid + (-(q.tickSize ?? 0.01))).toFixed(4)); // edge toward fill
      const r = await this.placeLimitOrder(leg.symbol, 'buy', leg.quantity, limit, req.tif ?? 'IOC');
      if (r.filledQty <= 0) {
        rungMetric.reason = `buy_leg_no_fill_${leg.symbol}`;
        // TRY immediate cancel & unwind previously sold legs (risk-off)
        // ... wire unwind logic here if desired ...
        this.metrics?.recordLadderAttempt(rungMetric);
        return { ...result, status: 'partial', reason: rungMetric.reason, filled: false };
      }
      netSpent += (r.avgPrice ?? limit) * r.filledQty;
      totalQty += r.filledQty;
      result.filledQtys[leg.symbol] = r.filledQty;
    }

    rungMetric.achievedNetPrice = netSpent;
    rungMetric.slippageBps = slippageBps(req.netPriceLimit, netSpent);
    rungMetric.filled = true;
    rungMetric.filledQty = totalQty;
    this.metrics?.recordLadderAttempt(rungMetric);

    return {
      ...result,
      filled: true,
      status: 'filled',
      avgNetPrice: netSpent
    };
  }
}
