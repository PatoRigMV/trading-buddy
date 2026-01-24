import { OrderIntent, RoutedOrder, ExecConfig } from "./types";
import { buildMarketableLimit } from "./OrderRouter";

function jitter(ms:number, pct=0.1){ const delta = ms*pct; return Math.max(0, ms + (Math.random()*2*delta - delta)); }

export type ChildPlan = { at: number; qty: number };

export function scheduleTWAP(startMs:number, horizonSecs:number, totalQty:number, slices?:number): ChildPlan[] {
  const n = slices ?? Math.max(2, Math.ceil(horizonSecs / 10));
  const base = Math.floor(totalQty / n); const rem = totalQty % n;
  const step = (horizonSecs*1000)/n;
  const plans: ChildPlan[] = [];
  for(let i=0;i<n;i++){
    const qty = base + (i<rem?1:0);
    plans.push({ at: Math.floor(startMs + jitter(step*i, 0.1)), qty });
  }
  return plans;
}

export function schedulePOV(startMs:number, minutes:number, totalQty:number): ChildPlan[] {
  // Start with 1 slice per minute; LiveSlicer will adjust in-flight for participation
  const base = Math.max(2, minutes);
  const per = Math.floor(totalQty / base); const rem = totalQty % base;
  const plans: ChildPlan[] = [];
  for(let i=0;i<base;i++){
    plans.push({ at: startMs + i*60000, qty: per + (i<rem?1:0) });
  }
  return plans;
}

export class LiveSlicer {
  constructor(private cfg: ExecConfig, private send: (order:RoutedOrder)=>Promise<void>){ }

  /** POV loop: call each minute with observed tape volume to adjust next child */
  nextPOVChild(intent: OrderIntent, targetParticipation: number, lastMinuteTapeVol: number, plannedQty: number, priceMid: number){
    const desired = Math.max(1, Math.floor(targetParticipation * lastMinuteTapeVol));
    const qty = Math.min(plannedQty * 2, Math.max(1, desired));
    const order = buildMarketableLimit({ ...intent, qty, mid: priceMid }, this.cfg);
    return order;
  }

  async trySend(order:RoutedOrder, guardsOk:boolean){
    if (!guardsOk) return false;
    await this.send(order);
    return true;
  }
}
