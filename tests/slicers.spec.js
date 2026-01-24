import { describe, it, expect } from "vitest";
import { scheduleTWAP, schedulePOV, LiveSlicer } from "../src/execution/slicers";
describe('slicers', () => {
    it('twap creates jittered schedule', () => {
        const plans = scheduleTWAP(Date.now(), 60, 100);
        expect(plans.length).toBeGreaterThan(2);
        const sum = plans.reduce((a, b) => a + b.qty, 0);
        expect(sum).toBe(100);
    });
    it('pov creates 1-min grid', () => {
        const plans = schedulePOV(Date.now(), 5, 50);
        expect(plans.length).toBeGreaterThanOrEqual(5);
    });
    it('live slicer produces a bounded child order', () => {
        const ls = new LiveSlicer({ min_band_bps: 5, band_spread_multiplier: 1.5, band_cap_bps: 25, open_close_auction_entries: false, participation_target: 0.05, adv_slice_threshold: 0.01, twap_slice_secs: 20 }, async () => { });
        const order = ls.nextPOVChild({ symbol: 'AAPL', side: 'buy', qty: 100, notional: 20000, mid: 200, spread_bps: 10 }, 0.05, 10000, 50, 200);
        expect(order.qty).toBeGreaterThan(0);
    });
});
