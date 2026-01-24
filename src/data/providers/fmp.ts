import { NormalizedQuote, ProviderMeta } from "../types";
export async function fmpQuote(symbol:string): Promise<NormalizedQuote|null>{
  const meta:ProviderMeta = { provider:"fmp", ts_provider: Date.now() };
  return { ...meta, symbol, ts_exchange: Date.now(), bid:null, ask:null, mid:null, spread_bps:null };
}
