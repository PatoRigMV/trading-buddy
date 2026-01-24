import { describe, it, expect } from "vitest";
import { buildMarketableLimit, computeBandBps, planSlices } from "../src/execution/OrderRouter";
describe("execution", () => {
    const cfg = { min_band_bps: 5, band_spread_multiplier: 1.5, band_cap_bps: 25, open_close_auction_entries: false, participation_target: 0.05, twap_slice_secs: 20, adv_slice_threshold: 0.01 };
    it("computes a reasonable band", () => {
        expect(computeBandBps(10, cfg)).toBeGreaterThanOrEqual(5);
        expect(computeBandBps(1, cfg)).toBeGreaterThanOrEqual(5);
    });
    it("builds marketable limit within band", () => {
        const intent = { symbol: "AAPL", side: "buy", qty: 100, notional: 20000, mid: 200, spread_bps: 10, luld: { upper: 205, lower: 195 } };
        const order = buildMarketableLimit(intent, cfg);
        expect(order.type).toBe("limit");
        expect(order.limit).toBeLessThanOrEqual(205);
    });
    it("plans slices when notional exceeds ADV threshold", () => {
        const intent = { symbol: "AAPL", side: "buy", qty: 1000, notional: 500000, mid: 200, spread_bps: 10 };
        const plan = planSlices(intent, 1000000, cfg); // 1m ADV
        expect(plan.slices).toBeGreaterThanOrEqual(2);
        expect(plan.qtys.reduce((a, b) => a + b, 0)).toBe(1000);
    });
});
