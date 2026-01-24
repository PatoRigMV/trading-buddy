import { OrderIntent, RoutedOrder, ExecConfig } from "./types";
import { clientOrderId } from "./idempotency";

export function computeBandBps(spread_bps:number|null, cfg:ExecConfig){
  const spreadTerm = (spread_bps ?? 0) * cfg.band_spread_multiplier;
  return Math.min(Math.max(cfg.min_band_bps, spreadTerm), cfg.band_cap_bps);
}

export function buildMarketableLimit(intent:OrderIntent, cfg:ExecConfig): RoutedOrder {
  const band_bps = computeBandBps(intent.spread_bps, cfg);
  const band = intent.mid * (band_bps / 10000);
  const upper = intent.luld?.upper ?? Number.POSITIVE_INFINITY;
  const lower = intent.luld?.lower ?? 0;
  const rawLimit = intent.side === "buy" ? Math.min(intent.mid + band, upper) : Math.max(intent.mid - band, lower);
  const limit = Number(rawLimit.toFixed(4));
  const id = clientOrderId("agent", intent.symbol, Date.now(), intent.side, intent.qty, limit);
  return { client_order_id: id, symbol:intent.symbol, side:intent.side, qty:intent.qty, type:"limit", limit, timeInForce:"IOC" };
}

export function sliceChildOrders(totalQty:number, slices:number): number[] {
  const base = Math.floor(totalQty / slices); const rem = totalQty % slices;
  return Array.from({length:slices}, (_,i)=> base + (i<rem?1:0));
}

export function planSlices(intent:OrderIntent, oneMinADV:number, cfg:ExecConfig): { slices:number; qtys:number[] } {
  const exceed = intent.notional > oneMinADV * cfg.adv_slice_threshold;
  if (!exceed) return { slices:1, qtys:[intent.qty] };
  const slices = Math.max(2, Math.ceil((intent.notional / (oneMinADV * cfg.participation_target))));
  return { slices, qtys: sliceChildOrders(intent.qty, slices) };
}
