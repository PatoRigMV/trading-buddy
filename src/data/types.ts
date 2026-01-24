export type ProviderName = "polygon"|"tiingo"|"finnhub"|"twelvedata"|"fmp"|"yahoo";

export interface ProviderMeta { provider: ProviderName; ts_provider: number; source_latency_ms?: number; }

export interface NormalizedQuote extends ProviderMeta {
  symbol: string;
  ts_exchange: number; // epoch ms
  bid: number | null;
  ask: number | null;
  bidSize?: number | null;
  askSize?: number | null;
  last?: number | null;
  lastSize?: number | null;
  mid: number | null; // computed if bid/ask present
  spread_bps: number | null; // (ask-bid)/mid * 10000
  halted?: boolean;
  luld?: { upper: number; lower: number } | null;
}

export interface NormalizedBar extends ProviderMeta {
  symbol: string;
  ts_open: number; // epoch ms (bar start)
  ts_close: number; // epoch ms (bar end)
  o: number; h: number; l: number; c: number; v: number;
  adjusted: boolean; // split/dividend adjusted
  interval: "1m"|"5m"|"1d";
}

export interface ConsensusResult<T> { value: T | null; providersUsed: ProviderName[]; quorum: number; threshold_bps: number; stale: boolean; }
