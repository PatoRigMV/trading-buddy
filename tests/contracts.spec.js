import { describe, it, expect } from "vitest";
import { PolygonBars, TiingoBars, FinnhubBars } from "../src/data/providers/bars";
import { PolygonHalts, FmpHalts, YahooHalts } from "../src/data/providers/halts";
describe("contracts", () => {
    it("bars adapters exist", async () => {
        expect(new PolygonBars()).toBeTruthy();
        expect(new TiingoBars()).toBeTruthy();
        expect(new FinnhubBars()).toBeTruthy();
    });
    it("halts adapters exist", async () => {
        expect(new PolygonHalts()).toBeTruthy();
        expect(new FmpHalts()).toBeTruthy();
        expect(new YahooHalts()).toBeTruthy();
    });
});
