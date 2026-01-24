import { describe, it, expect } from "vitest";
import { ProviderRouter } from "../src/data/ProviderRouter";
describe("router", () => {
    it("constructs and returns a shape", async () => {
        const r = new ProviderRouter();
        const q = await r.getQuote("AAPL");
        expect(q).toHaveProperty("mid");
        expect(q).toHaveProperty("stale");
    });
});
