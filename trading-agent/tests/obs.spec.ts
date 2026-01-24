import { describe, it, expect, beforeEach } from "vitest";
import { newSpan, endSpan, durationMs } from "../src/obs/e2e";
import { HdrLike } from "../src/obs/histogram";
import { recordE2E, recordDecision, recordAck, snapshot, resetMetrics } from "../src/obs/e2e";

describe("tracing", () => {
    it("measures durations", () => {
        const s = newSpan("test");
        const e = endSpan(s);
        expect(durationMs(e)).toBeGreaterThanOrEqual(0);
    });

    it("generates unique trace IDs", () => {
        const s1 = newSpan("test1");
        const s2 = newSpan("test2");
        expect(s1.traceId).not.toBe(s2.traceId);
        expect(s1.spanId).not.toBe(s2.spanId);
    });

    it("allows custom trace IDs", () => {
        const traceId = "custom-trace-id";
        const s = newSpan("test", traceId);
        expect(s.traceId).toBe(traceId);
    });
});

describe("histogram", () => {
    let hist: HdrLike;

    beforeEach(() => {
        hist = new HdrLike();
    });

    it("computes percentiles correctly", () => {
        for (let i = 1; i <= 100; i++) {
            hist.add(i);
        }
        expect(hist.p(50)).toBeGreaterThanOrEqual(49);
        expect(hist.p(50)).toBeLessThanOrEqual(51);
        expect(hist.p(95)).toBeGreaterThanOrEqual(95);
        expect(hist.p(99)).toBeGreaterThanOrEqual(99);
    });

    it("handles empty histogram", () => {
        expect(hist.p(50)).toBe(0);
        expect(hist.count()).toBe(0);
    });

    it("ignores non-finite values", () => {
        hist.add(NaN);
        hist.add(Infinity);
        hist.add(42);
        expect(hist.count()).toBe(1);
        expect(hist.p(50)).toBe(42);
    });

    it("resets correctly", () => {
        hist.add(1);
        hist.add(2);
        hist.add(3);
        expect(hist.count()).toBe(3);
        hist.reset();
        expect(hist.count()).toBe(0);
    });
});

describe("end-to-end metrics", () => {
    beforeEach(() => {
        resetMetrics();
    });

    it("records e2e latency", () => {
        recordE2E(100);
        recordE2E(200);
        recordE2E(300);

        const snap = snapshot();
        expect(snap.e2e.n).toBe(3);
        expect(snap.e2e.p50).toBeCloseTo(200, 0);
    });

    it("records decision latency", () => {
        recordDecision(50);
        recordDecision(60);
        recordDecision(70);

        const snap = snapshot();
        expect(snap.decision.n).toBe(3);
        expect(snap.decision.p50).toBeCloseTo(60, 0);
    });

    it("records ack latency", () => {
        recordAck(150);
        recordAck(250);
        recordAck(350);

        const snap = snapshot();
        expect(snap.ack.n).toBe(3);
        expect(snap.ack.p95).toBeGreaterThanOrEqual(250);
    });

    it("resets all metrics", () => {
        recordE2E(100);
        recordDecision(50);
        recordAck(150);

        let snap = snapshot();
        expect(snap.e2e.n).toBe(1);
        expect(snap.decision.n).toBe(1);
        expect(snap.ack.n).toBe(1);

        resetMetrics();
        snap = snapshot();
        expect(snap.e2e.n).toBe(0);
        expect(snap.decision.n).toBe(0);
        expect(snap.ack.n).toBe(0);
    });
});
