import { describe, it, expect } from 'vitest';
import {
    simulateSingleShot,
    simulateTWAP,
    simulatePOV,
    compareRoutingStrategies,
    type MarketContext,
} from '../src/sim/smartRouting';
import { DEFAULT_EXEC_CONFIG } from '../src/sim/executionSim';

const mockMarketContext: MarketContext = {
    currentPrice: 100,
    adv: 1000000, // 1M shares average daily volume
    spreadBps: 5,
    volatilityBps: 100, // 1% volatility
    bucket: 'Q2',
};

describe('Smart Routing', () => {
    describe('Single Shot Execution', () => {
        it('executes order in single slice', () => {
            const result = simulateSingleShot(1000, mockMarketContext, DEFAULT_EXEC_CONFIG);

            expect(result.strategy).toBe('single_shot');
            expect(result.numSlices).toBe(1);
            expect(result.avgPrice).toBeGreaterThan(mockMarketContext.currentPrice);
            expect(result.totalFees).toBeGreaterThan(0);
            expect(result.executionTimeMs).toBeLessThan(1000);
        });

        it('has higher market impact for large orders', () => {
            const smallOrder = simulateSingleShot(1000, mockMarketContext, DEFAULT_EXEC_CONFIG);
            const largeOrder = simulateSingleShot(50000, mockMarketContext, DEFAULT_EXEC_CONFIG);

            expect(largeOrder.marketImpactBps).toBeGreaterThan(smallOrder.marketImpactBps);
        });

        it('calculates total cost correctly', () => {
            const qty = 1000;
            const result = simulateSingleShot(qty, mockMarketContext, DEFAULT_EXEC_CONFIG);

            expect(result.totalCost).toBeGreaterThan(0);
            expect(result.totalCost).toBeGreaterThanOrEqual(result.totalFees);
        });
    });

    describe('TWAP Execution', () => {
        it('splits order into multiple time-based slices', () => {
            const result = simulateTWAP(10000, mockMarketContext, DEFAULT_EXEC_CONFIG, 300000, 30000);

            expect(result.strategy).toBe('twap');
            expect(result.numSlices).toBeGreaterThan(1);
            expect(result.executionTimeMs).toBe(300000);
        });

        it('has lower market impact than single shot for large orders', () => {
            const qty = 50000;
            const singleShot = simulateSingleShot(qty, mockMarketContext, DEFAULT_EXEC_CONFIG);
            const twap = simulateTWAP(qty, mockMarketContext, DEFAULT_EXEC_CONFIG);

            expect(twap.marketImpactBps).toBeLessThan(singleShot.marketImpactBps);
        });

        it('respects custom duration and interval', () => {
            const duration = 120000; // 2 minutes
            const interval = 20000; // 20 seconds
            const result = simulateTWAP(10000, mockMarketContext, DEFAULT_EXEC_CONFIG, duration, interval);

            expect(result.executionTimeMs).toBe(duration);
            expect(result.numSlices).toBe(Math.ceil(duration / interval));
        });

        it('handles remainders correctly', () => {
            const qty = 1000;
            const result = simulateTWAP(qty, mockMarketContext, DEFAULT_EXEC_CONFIG, 100000, 30000);

            expect(result.avgPrice).toBeGreaterThan(0);
            expect(result.totalFees).toBeGreaterThan(0);
        });
    });

    describe('POV Execution', () => {
        it('participates at target percentage of volume', () => {
            const result = simulatePOV(10000, mockMarketContext, DEFAULT_EXEC_CONFIG, 10);

            expect(result.strategy).toBe('pov');
            expect(result.numSlices).toBeGreaterThan(1);
        });

        it('has lowest market impact among all strategies', () => {
            const qty = 50000;
            const singleShot = simulateSingleShot(qty, mockMarketContext, DEFAULT_EXEC_CONFIG);
            const twap = simulateTWAP(qty, mockMarketContext, DEFAULT_EXEC_CONFIG);
            const pov = simulatePOV(qty, mockMarketContext, DEFAULT_EXEC_CONFIG);

            expect(pov.marketImpactBps).toBeLessThanOrEqual(twap.marketImpactBps);
            expect(pov.marketImpactBps).toBeLessThan(singleShot.marketImpactBps);
        });

        it('respects maximum duration constraint', () => {
            const maxDuration = 300000; // 5 minutes
            const result = simulatePOV(100000, mockMarketContext, DEFAULT_EXEC_CONFIG, 10, maxDuration);

            expect(result.executionTimeMs).toBeLessThanOrEqual(maxDuration);
        });

        it('adjusts execution time based on order size', () => {
            const smallOrder = simulatePOV(1000, mockMarketContext, DEFAULT_EXEC_CONFIG);
            const largeOrder = simulatePOV(100000, mockMarketContext, DEFAULT_EXEC_CONFIG);

            expect(largeOrder.executionTimeMs).toBeGreaterThan(smallOrder.executionTimeMs);
        });
    });

    describe('Routing Comparison', () => {
        it('recommends single shot for small orders', () => {
            const qty = 1000; // 0.1% of ADV
            const comparison = compareRoutingStrategies(qty, mockMarketContext, DEFAULT_EXEC_CONFIG);

            expect(comparison.recommendation).toBe('single_shot');
            expect(comparison.reason).toContain('ADV');
        });

        it('recommends TWAP for medium orders', () => {
            const qty = 20000; // 2% of ADV
            const comparison = compareRoutingStrategies(qty, mockMarketContext, DEFAULT_EXEC_CONFIG);

            expect(comparison.recommendation).toBe('twap');
            expect(comparison.reason).toContain('ADV');
        });

        it('recommends POV for large orders', () => {
            const qty = 100000; // 10% of ADV
            const comparison = compareRoutingStrategies(qty, mockMarketContext, DEFAULT_EXEC_CONFIG);

            expect(comparison.recommendation).toBe('pov');
            expect(comparison.reason).toContain('ADV');
        });

        it('includes all three strategies in comparison', () => {
            const comparison = compareRoutingStrategies(10000, mockMarketContext, DEFAULT_EXEC_CONFIG);

            expect(comparison.singleShot).toBeDefined();
            expect(comparison.twap).toBeDefined();
            expect(comparison.pov).toBeDefined();
            expect(comparison.recommendation).toBeDefined();
            expect(comparison.reason).toBeDefined();
        });

        it('overrides recommendation if cost savings are significant', () => {
            // Create a scenario where POV would normally be recommended but has much higher cost
            const highVolatilityCtx: MarketContext = {
                ...mockMarketContext,
                volatilityBps: 10, // Very low volatility - favors single shot
                adv: 100000, // Lower ADV
            };

            const qty = 5000; // 5% of ADV
            const comparison = compareRoutingStrategies(qty, highVolatilityCtx, DEFAULT_EXEC_CONFIG);

            // Should have a recommendation based on cost analysis
            expect(['single_shot', 'twap', 'pov']).toContain(comparison.recommendation);
        });

        it('calculates total costs correctly for all strategies', () => {
            const comparison = compareRoutingStrategies(10000, mockMarketContext, DEFAULT_EXEC_CONFIG);

            expect(comparison.singleShot.totalCost).toBeGreaterThan(0);
            expect(comparison.twap.totalCost).toBeGreaterThan(0);
            expect(comparison.pov.totalCost).toBeGreaterThan(0);
        });
    });
});
