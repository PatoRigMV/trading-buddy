import { NormalizedQuote, ProviderName, ConsensusResult } from "./types";

export interface ConsensusConfig { floor_bps: number; spread_multiplier: number; cap_bps: number; min_quorum: number; }

function bps(a: number, b: number) { return Math.abs(a - b) / ((a + b) / 2) * 10000; }

export function dynamicThresholdBps(spread_bps: number|null, cfg: ConsensusConfig) {
  const s = Math.max(cfg.floor_bps, (spread_bps ?? 0) * cfg.spread_multiplier);
  return Math.min(s, cfg.cap_bps);
}

export function priceConsensus(quotes: NormalizedQuote[], cfg: ConsensusConfig): ConsensusResult<number> {
  const fresh = quotes.filter(q => q.mid != null && q.spread_bps != null);
  if (fresh.length === 0) return { value: null, providersUsed: [], quorum: 0, threshold_bps: cfg.floor_bps, stale: true };

  // Choose anchor (first provider) and find nearest neighbors within dynamic threshold
  const anchor = fresh[0];
  const thr = dynamicThresholdBps(anchor.spread_bps, cfg);
  const agree: [ProviderName, number][] = [[anchor.provider, anchor.mid!]];

  for (let i=1; i<fresh.length; i++) {
    const q = fresh[i];
    if (bps(anchor.mid!, q.mid!) <= thr) agree.push([q.provider, q.mid!]);
  }

  const quorum = agree.length;
  if (quorum >= cfg.min_quorum) {
    const avg = agree.reduce((s, [,v]) => s+v, 0) / quorum;
    return { value: avg, providersUsed: agree.map(a=>a[0]), quorum, threshold_bps: thr, stale: false };
  }

  // Low quorum fallback - return single source but mark as stale if only one provider
  return { value: anchor.mid!, providersUsed: [anchor.provider], quorum, threshold_bps: thr, stale: quorum === 1 };
}

export function deweightIfLowQuorum<T>(result: ConsensusResult<T>, lowQuorumWeight: number = 0.5): ConsensusResult<T> {
  if (result.quorum < 2 && result.value !== null) {
    // Apply confidence downgrade for single-source data
    return {
      ...result,
      stale: true, // Mark as stale to indicate lower confidence
      confidence: 'low' as any // Add confidence indicator
    };
  }
  return result;
}

export function calculateConfidence(quorum: number, totalProviders: number, threshold_bps: number): 'high' | 'medium' | 'low' {
  if (quorum < 2) return 'low';
  if (quorum >= Math.ceil(totalProviders * 0.66) && threshold_bps <= 10) return 'high';
  return 'medium';
}
