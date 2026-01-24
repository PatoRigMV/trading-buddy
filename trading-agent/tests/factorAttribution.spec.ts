import { describe, it, expect, beforeEach } from 'vitest';
import {
    FactorAttributionEngine,
    createMockFactors,
    type Position,
    type SecurityFactors,
} from '../src/analytics/factorAttribution';

describe('Factor Attribution', () => {
    let positions: Position[];
    let factorData: Map<string, SecurityFactors>;
    let engine: FactorAttributionEngine;

    beforeEach(() => {
        // Create test portfolio
        positions = [
            {
                symbol: 'AAPL',
                quantity: 100,
                avgPrice: 150,
                currentPrice: 160,
                marketValue: 16000,
            },
            {
                symbol: 'GOOGL',
                quantity: 50,
                avgPrice: 2800,
                currentPrice: 2900,
                marketValue: 145000,
            },
            {
                symbol: 'MSFT',
                quantity: 200,
                avgPrice: 300,
                currentPrice: 320,
                marketValue: 64000,
            },
        ];

        // Create factor data
        factorData = new Map();
        factorData.set('AAPL', {
            symbol: 'AAPL',
            beta: 1.2,
            marketCap: 2_500_000_000_000, // $2.5T
            pe: 28,
            momentum: 15, // 15% 3-month return
            volatility: 25, // 25% annualized
            sector: 'technology',
        });
        factorData.set('GOOGL', {
            symbol: 'GOOGL',
            beta: 1.1,
            marketCap: 1_800_000_000_000, // $1.8T
            pe: 22,
            momentum: 10,
            volatility: 22,
            sector: 'technology',
        });
        factorData.set('MSFT', {
            symbol: 'MSFT',
            beta: 0.9,
            marketCap: 2_300_000_000_000, // $2.3T
            pe: 32,
            momentum: 8,
            volatility: 20,
            sector: 'technology',
        });

        engine = new FactorAttributionEngine(positions, factorData);
    });

    describe('Portfolio Analysis', () => {
        it('calculates total portfolio value correctly', () => {
            const analysis = engine.analyzePortfolio();
            expect(analysis.totalValue).toBe(225000);
        });

        it('calculates aggregate beta', () => {
            const analysis = engine.analyzePortfolio();

            // Weighted beta calculation
            const expectedBeta =
                (16000 / 225000) * 1.2 +
                (145000 / 225000) * 1.1 +
                (64000 / 225000) * 0.9;

            expect(analysis.aggregateBeta).toBeCloseTo(expectedBeta, 2);
        });

        it('identifies factor exposures', () => {
            const analysis = engine.analyzePortfolio();

            expect(analysis.factorExposures).toBeDefined();
            expect(analysis.factorExposures.length).toBeGreaterThan(0);

            const marketFactor = analysis.factorExposures.find(f => f.factor === 'market');
            expect(marketFactor).toBeDefined();
            expect(marketFactor!.value).toBeGreaterThan(0);
        });

        it('calculates sector concentrations', () => {
            const analysis = engine.analyzePortfolio();

            expect(analysis.sectorExposures.size).toBeGreaterThan(0);

            const techExposure = analysis.sectorExposures.get('technology');
            expect(techExposure).toBe(100); // All positions are tech
        });

        it('calculates diversification ratio', () => {
            const analysis = engine.analyzePortfolio();

            expect(analysis.diversificationRatio).toBeGreaterThan(0);
            expect(analysis.diversificationRatio).toBeLessThanOrEqual(2);
        });

        it('calculates concentration risk (HHI)', () => {
            const analysis = engine.analyzePortfolio();

            expect(analysis.concentrationRisk).toBeGreaterThan(0);
            expect(analysis.concentrationRisk).toBeLessThanOrEqual(10000);
        });
    });

    describe('Factor Exposures', () => {
        it('calculates market exposure', () => {
            const analysis = engine.analyzePortfolio();
            const marketExposure = analysis.factorExposures.find(f => f.factor === 'market');

            expect(marketExposure).toBeDefined();
            expect(marketExposure!.value).toBeGreaterThan(0);
        });

        it('calculates size exposure', () => {
            const analysis = engine.analyzePortfolio();
            const sizeExposure = analysis.factorExposures.find(f => f.factor === 'size');

            expect(sizeExposure).toBeDefined();
            // Large cap stocks should have negative size factor
            expect(sizeExposure!.value).toBeLessThan(0);
        });

        it('calculates value exposure', () => {
            const analysis = engine.analyzePortfolio();
            const valueExposure = analysis.factorExposures.find(f => f.factor === 'value');

            expect(valueExposure).toBeDefined();
        });

        it('calculates momentum exposure', () => {
            const analysis = engine.analyzePortfolio();
            const momentumExposure = analysis.factorExposures.find(f => f.factor === 'momentum');

            expect(momentumExposure).toBeDefined();
            expect(momentumExposure!.value).toBeGreaterThan(0);
        });

        it('calculates volatility exposure', () => {
            const analysis = engine.analyzePortfolio();
            const volExposure = analysis.factorExposures.find(f => f.factor === 'volatility');

            expect(volExposure).toBeDefined();
            expect(volExposure!.value).toBeGreaterThan(0);
        });

        it('includes risk metrics for each factor', () => {
            const analysis = engine.analyzePortfolio();

            analysis.factorExposures.forEach(exposure => {
                expect(exposure.risk).toBeGreaterThanOrEqual(0);
                expect(exposure.contribution).toBeDefined();
            });
        });
    });

    describe('Return Attribution', () => {
        it('attributes returns to positions', () => {
            const periodReturns = new Map<string, number>();
            periodReturns.set('AAPL', 0.10); // 10% return
            periodReturns.set('GOOGL', 0.05); // 5% return
            periodReturns.set('MSFT', 0.08); // 8% return

            const attributions = engine.attributeReturns(periodReturns);

            expect(attributions.length).toBe(3);
            attributions.forEach(attr => {
                expect(attr.weight).toBeGreaterThan(0);
                expect(attr.returnContribution).toBeDefined();
            });
        });

        it('calculates position weights correctly', () => {
            const periodReturns = new Map<string, number>();
            periodReturns.set('AAPL', 0);
            periodReturns.set('GOOGL', 0);
            periodReturns.set('MSFT', 0);

            const attributions = engine.attributeReturns(periodReturns);

            const totalWeight = attributions.reduce((sum, attr) => sum + attr.weight, 0);
            expect(totalWeight).toBeCloseTo(100, 1);
        });

        it('calculates factor contributions for each position', () => {
            const periodReturns = new Map<string, number>();
            periodReturns.set('AAPL', 0.10);
            periodReturns.set('GOOGL', 0.05);
            periodReturns.set('MSFT', 0.08);

            const attributions = engine.attributeReturns(periodReturns);

            attributions.forEach(attr => {
                expect(attr.factorContributions.size).toBeGreaterThan(0);
                expect(attr.factorContributions.has('market')).toBe(true);
                expect(attr.factorContributions.has('momentum')).toBe(true);
            });
        });

        it('handles zero returns', () => {
            const periodReturns = new Map<string, number>();
            periodReturns.set('AAPL', 0);
            periodReturns.set('GOOGL', 0);
            periodReturns.set('MSFT', 0);

            const attributions = engine.attributeReturns(periodReturns);

            attributions.forEach(attr => {
                expect(attr.returnContribution).toBe(0);
            });
        });
    });

    describe('Risk Attribution', () => {
        it('calculates risk contribution for each position', () => {
            const periodReturns = new Map<string, number>();
            periodReturns.set('AAPL', 0.10);
            periodReturns.set('GOOGL', 0.05);
            periodReturns.set('MSFT', 0.08);

            const attributions = engine.attributeReturns(periodReturns);

            attributions.forEach(attr => {
                expect(attr.riskContribution).toBeGreaterThan(0);
            });
        });

        it('higher volatility stocks contribute more risk', () => {
            const periodReturns = new Map<string, number>();
            periodReturns.set('AAPL', 0.10);
            periodReturns.set('GOOGL', 0.05);
            periodReturns.set('MSFT', 0.08);

            const attributions = engine.attributeReturns(periodReturns);

            const aaplAttr = attributions.find(a => a.symbol === 'AAPL')!;
            const msftAttr = attributions.find(a => a.symbol === 'MSFT')!;

            // AAPL has higher volatility (25 vs 20) - should have higher risk per unit weight
            const aaplRiskPerWeight = aaplAttr.riskContribution / aaplAttr.weight;
            const msftRiskPerWeight = msftAttr.riskContribution / msftAttr.weight;

            expect(aaplRiskPerWeight).toBeGreaterThan(msftRiskPerWeight);
        });
    });

    describe('Concentration Metrics', () => {
        it('detects high concentration in single position', () => {
            const concentratedPositions: Position[] = [
                {
                    symbol: 'AAPL',
                    quantity: 1000,
                    avgPrice: 150,
                    currentPrice: 160,
                    marketValue: 160000,
                },
                {
                    symbol: 'GOOGL',
                    quantity: 1,
                    avgPrice: 2800,
                    currentPrice: 2900,
                    marketValue: 2900,
                },
            ];

            const concentratedEngine = new FactorAttributionEngine(concentratedPositions, factorData);
            const analysis = concentratedEngine.analyzePortfolio();

            // HHI should be high (close to 10000 for single stock)
            expect(analysis.concentrationRisk).toBeGreaterThan(9000);
        });

        it('detects good diversification', () => {
            const diversifiedPositions: Position[] = [];
            const diversifiedFactors = new Map<string, SecurityFactors>();

            // Create 10 equal-weight positions
            for (let i = 0; i < 10; i++) {
                const symbol = `STOCK${i}`;
                diversifiedPositions.push({
                    symbol,
                    quantity: 100,
                    avgPrice: 100,
                    currentPrice: 100,
                    marketValue: 10000,
                });

                diversifiedFactors.set(symbol, createMockFactors(symbol));
            }

            const diversifiedEngine = new FactorAttributionEngine(diversifiedPositions, diversifiedFactors);
            const analysis = diversifiedEngine.analyzePortfolio();

            // HHI should be low (1000 for 10 equal positions)
            expect(analysis.concentrationRisk).toBeLessThan(1500);
        });
    });

    describe('Mock Factor Generation', () => {
        it('generates consistent factors for same symbol', () => {
            const factors1 = createMockFactors('TEST');
            const factors2 = createMockFactors('TEST');

            expect(factors1).toEqual(factors2);
        });

        it('generates different factors for different symbols', () => {
            const factors1 = createMockFactors('AAPL');
            const factors2 = createMockFactors('GOOGL');

            expect(factors1.beta).not.toBe(factors2.beta);
        });

        it('generates realistic factor ranges', () => {
            const factors = createMockFactors('TEST');

            expect(factors.beta).toBeGreaterThanOrEqual(0.8);
            expect(factors.beta).toBeLessThanOrEqual(1.6);
            expect(factors.pe).toBeGreaterThanOrEqual(10);
            expect(factors.pe).toBeLessThanOrEqual(40);
            expect(factors.volatility).toBeGreaterThanOrEqual(15);
            expect(factors.volatility).toBeLessThanOrEqual(50);
        });
    });
});
