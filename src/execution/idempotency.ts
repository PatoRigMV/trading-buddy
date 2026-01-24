import crypto from "crypto";
export function clientOrderId(strategy:string, symbol:string, ts:number, side:"buy"|"sell", qty:number, limit:number){
  const raw = `${strategy}|${symbol}|${ts}|${side}|${qty}|${limit.toFixed(4)}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24);
}
