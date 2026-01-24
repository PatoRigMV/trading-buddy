import { NormalizedQuote, ProviderMeta } from "../types";
export async function twelveDataQuote(symbol:string): Promise<NormalizedQuote|null>{
  const meta:ProviderMeta = { provider:"twelvedata", ts_provider: Date.now() };
  return { ...meta, symbol, ts_exchange: Date.now(), bid:null, ask:null, mid:null, spread_bps:null };
}
