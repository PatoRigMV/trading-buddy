import { describe, it, expect } from "vitest";
import { priceConsensus, dynamicThresholdBps } from "../src/data/consensus";

describe("consensus", () => {
  it("uses dynamic threshold and quorum", () => {
    const quotes = [
      { provider:"polygon", ts_provider:1, symbol:"AAPL", ts_exchange:1, bid:100, ask:100.1, mid:100.05, spread_bps:9 },
      { provider:"tiingo", ts_provider:1, symbol:"AAPL", ts_exchange:1, bid:100.01, ask:100.11, mid:100.06, spread_bps:10 },
    ] as any;
    const res = priceConsensus(quotes, { floor_bps:5, spread_multiplier:2, cap_bps:15, min_quorum:2 });
    expect(res.value).toBeGreaterThan(100.04);
    expect(res.providersUsed.length).toBe(2);
  });
  it("returns stale when no fresh quotes", () => {
    const res = priceConsensus([], { floor_bps:5, spread_multiplier:2, cap_bps:15, min_quorum:2 });
    expect(res.stale).toBe(true);
  });
});
