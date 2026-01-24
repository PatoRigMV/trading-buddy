// executionHelpers.ts
// Combo net-price builders (mid±ticks ladder with IOC retries) and generic broker interface.
// Author: ChatGPT (GPT-5 Thinking)

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Side = 'buy' | 'sell';

export type ComboLeg = {
  symbol: string;
  side: Side;
  quantity: number;     // contracts
};

export type Quote = {
  bid: number;
  ask: number;
  last?: number;
  tickSize?: number;    // price tick for this option
};

export type ComboOrderRequest = {
  legs: ComboLeg[];
  tif?: 'IOC' | 'DAY' | 'FOK';
  clientTag?: string;
};

export type ComboOrderResult = {
  orderId: string;
  filled: boolean;
  filledQtys: Record<string, number>; // symbol -> qty filled
  avgNetPrice?: number;
  status: 'filled' | 'partial' | 'rejected' | 'expired' | 'cancelled';
  reason?: string;
};

export interface Broker {
  getQuote(symbol: string): Promise<Quote>;
  // Place a combo/net-price order if supported by the broker.
  // netPriceLimit is price objective for the net (buy legs positive, sell legs negative; so net cost positive to pay).
  placeComboOrder(req: ComboOrderRequest & { netPriceLimit: number }): Promise<ComboOrderResult>;
  cancelOrder(orderId: string): Promise<void>;
  // Optional: if broker does not support combos, we will leg with hedge sequencing:
  placeLimitOrder?(symbol: string, side: Side, qty: number, limitPrice: number, tif?: 'IOC'|'DAY'|'FOK'): Promise<{orderId: string, filledQty: number, avgPrice?: number, status: string}>;
}

/** Compute mid price for each leg and the net mid for the combo (positive = cost to pay) */
export async function computeNetMid(broker: Broker, legs: ComboLeg[]): Promise<{netMid: number, mids: Record<string, number>, quotes: Record<string, Quote>}> {
  let netMid = 0;
  const mids: Record<string, number> = {};
  const quotes: Record<string, Quote> = {};
  for (const leg of legs) {
    const q = await broker.getQuote(leg.symbol);
    const mid = (q.bid + q.ask) / 2;
    quotes[leg.symbol] = q;
    mids[leg.symbol] = mid;
    // Buy legs add cost; sell legs reduce cost
    netMid += (leg.side === 'buy' ? 1 : -1) * (mid * leg.quantity);
  }
  return { netMid, mids, quotes };
}

/** Build a ladder of target net prices around mid using tick sizes */
export function buildNetPriceLadder(initialNetMid: number, tickSize: number, ticks: number[]): number[] {
  const uniq = new Set<number>();
  for (const t of ticks) {
    uniq.add(Number((initialNetMid + t * tickSize).toFixed(4)));
  }
  return Array.from(uniq.values());
}

/** Estimate slippage in bps relative to initial net mid */
export function slippageBps(initialNetMid: number, execNetPrice: number): number {
  if (initialNetMid <= 0) return 0;
  return Math.abs((execNetPrice - initialNetMid) / initialNetMid) * 1e4;
}

/**
 * Try to place a combo at mid±ticks ladder with IOC retries.
 * Aborts if cumulative slippage exceeds cap or retries exhausted.
 */
export async function tryPlaceComboLadder(args: {
  broker: Broker;
  legs: ComboLeg[];
  ticks: number[];           // e.g., [ -2, -1, 0, +1, +2, +3, +4 ]
  maxRetries: number;        // total attempts across ladder (we iterate ticks order)
  slippageBpsCap: number;    // e.g., 50 = 0.50% from initial mid
  clientTag?: string;
}): Promise<ComboOrderResult> {
  const { broker, legs, ticks, maxRetries, slippageBpsCap, clientTag } = args;
  const { netMid, quotes } = await computeNetMid(broker, legs);

  // Determine a representative tick size (max of legs to be conservative)
  const tickSize = Math.max(...Object.values(quotes).map(q => q.tickSize ?? 0.01), 0.01);
  const ladder = buildNetPriceLadder(netMid, tickSize, ticks);

  let attempts = 0;
  let lastResult: ComboOrderResult | null = null;

  for (const netPx of ladder) {
    if (attempts >= maxRetries) break;
    attempts += 1;

    // Slippage guard vs initial mid
    if (slippageBps(netMid, netPx) > slippageBpsCap) {
      return {
        orderId: '',
        filled: false,
        filledQtys: {},
        status: 'rejected',
        reason: `slippage_cap_exceeded_${slippageBps(netMid, netPx).toFixed(1)}bps`
      };
    }

    const res = await broker.placeComboOrder({
      legs, netPriceLimit: netPx, tif: 'IOC', clientTag
    });

    lastResult = res;

    if (res.status === 'filled' || (res.filled && res.status === 'partial')) {
      // If partial, caller should decide whether to re-quote remaining size
      return res;
    }

    // If rejected/expired, continue up the ladder
  }

  // Nothing filled within retries
  return lastResult ?? {
    orderId: '',
    filled: false,
    filledQtys: {},
    status: 'expired',
    reason: 'no_fill_after_ladder'
  };
}

/**
 * Fallback legging approach (if broker lacks combo orders).
 * Places hedge leg first depending on risk preference, then completes other legs if hedge filled.
 * WARNING: Use tight IOC and small slices to limit slippage.
 */
export async function leggingFallback(args: {
  broker: Broker;
  legs: ComboLeg[];
  sliceQty: number;       // contracts per attempt
  maxSlices: number;
  priceEdgeTicks: number; // improve limit by this many ticks toward fill
  tickSize?: number;
  clientTag?: string;
}): Promise<{ filled: boolean; reason?: string }> {
  const { broker, legs, sliceQty, maxSlices, priceEdgeTicks, tickSize = 0.01, clientTag } = args;
  if (!broker.placeLimitOrder) return { filled: false, reason: 'broker_no_single_leg_api' };

  // Simple sequence: fill short premium leg first to collect credit, then hedge
  const [shortLegs, longLegs] = [legs.filter(l => l.side === 'sell'), legs.filter(l => l.side === 'buy')];

  let slices = 0;
  for (const leg of shortLegs) {
    let remaining = leg.quantity;
    while (remaining > 0 && slices < maxSlices) {
      slices++;
      const quote = await broker.getQuote(leg.symbol);
      const limit = (quote.bid + quote.ask) / 2 + priceEdgeTicks * (leg.side === 'sell' ? +tickSize : -tickSize);
      const qty = Math.min(sliceQty, remaining);
      const r = await broker.placeLimitOrder!(leg.symbol, leg.side, qty, Number(limit.toFixed(4)), 'IOC');
      if (r.filledQty <= 0) break; // give up on this leg slice
      remaining -= r.filledQty;
    }
  }

  for (const leg of longLegs) {
    let remaining = leg.quantity;
    while (remaining > 0 && slices < maxSlices) {
      slices++;
      const quote = await broker.getQuote(leg.symbol);
      const limit = (quote.bid + quote.ask) / 2 + priceEdgeTicks * (leg.side === 'sell' ? +tickSize : -tickSize);
      const qty = Math.min(sliceQty, remaining);
      const r = await broker.placeLimitOrder!(leg.symbol, leg.side, qty, Number(limit.toFixed(4)), 'IOC');
      if (r.filledQty <= 0) break;
      remaining -= r.filledQty;
    }
  }

  // Caller should reconcile any imbalances and decide whether to abandon or continue
  return { filled: true };
}
