import { describe, it, expect } from "vitest";
import { simulateFill, DEFAULT_EXEC_CONFIG, type LiquidityBucket } from "../src/sim/executionSim";

describe("execution simulator", () => {
    it("simulates buy fills with slippage", () => {
        const result = simulateFill(100.1, 100, "buy", 100, "Q1", DEFAULT_EXEC_CONFIG);

        expect(result.price).toBeLessThanOrEqual(100.1);
        expect(result.slip_bps).toBeGreaterThanOrEqual(-DEFAULT_EXEC_CONFIG.spreadBpsByBucket.Q1 / 2);
        expect(result.fee).toBeGreaterThan(0);
    });

    it("simulates sell fills with slippage", () => {
        const result = simulateFill(99.9, 100, "sell", 100, "Q1", DEFAULT_EXEC_CONFIG);

        expect(result.price).toBeGreaterThanOrEqual(99.9);
        expect(result.slip_bps).toBeGreaterThanOrEqual(-DEFAULT_EXEC_CONFIG.spreadBpsByBucket.Q1 / 2);
        expect(result.fee).toBeGreaterThan(0);
    });

    it("respects limit prices for buy orders", () => {
        const limit = 100.05;
        const result = simulateFill(limit, 100, "buy", 100, "Q1", DEFAULT_EXEC_CONFIG);

        expect(result.price).toBeLessThanOrEqual(limit);
    });

    it("respects limit prices for sell orders", () => {
        const limit = 99.95;
        const result = simulateFill(limit, 100, "sell", 100, "Q1", DEFAULT_EXEC_CONFIG);

        expect(result.price).toBeGreaterThanOrEqual(limit);
    });

    it("has higher slippage for less liquid stocks", () => {
        const runs = 100;
        let q1Total = 0;
        let q5Total = 0;

        for (let i = 0; i < runs; i++) {
            const q1Result = simulateFill(100.1, 100, "buy", 100, "Q1", DEFAULT_EXEC_CONFIG);
            const q5Result = simulateFill(100.1, 100, "buy", 100, "Q5", DEFAULT_EXEC_CONFIG);

            q1Total += Math.abs(q1Result.slip_bps);
            q5Total += Math.abs(q5Result.slip_bps);
        }

        const q1Avg = q1Total / runs;
        const q5Avg = q5Total / runs;

        expect(q5Avg).toBeGreaterThan(q1Avg);
    });

    it("calculates fees correctly", () => {
        const qty = 100;
        const feePerShare = DEFAULT_EXEC_CONFIG.feePerShare;
        const result = simulateFill(100.1, 100, "buy", qty, "Q1", DEFAULT_EXEC_CONFIG);

        expect(result.fee).toBeCloseTo(qty * feePerShare, 4);
    });

    it("handles different liquidity buckets", () => {
        const buckets: LiquidityBucket[] = ["Q1", "Q2", "Q3", "Q4", "Q5"];

        buckets.forEach((bucket) => {
            const result = simulateFill(100.1, 100, "buy", 100, bucket, DEFAULT_EXEC_CONFIG);
            expect(result.price).toBeGreaterThan(0);
            expect(result.fee).toBeGreaterThan(0);
        });
    });
});
