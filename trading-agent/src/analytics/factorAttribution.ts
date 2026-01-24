// Portfolio factor attribution and risk exposure analysis

export type FactorType =
  | 'market'      // Market beta exposure
  | 'size'        // Small vs large cap
  | 'value'       // Value vs growth
  | 'momentum'    // Price momentum
  | 'volatility'  // Volatility factor
  | 'sector';     // Sector concentration

export type SectorType =
  | 'technology'
  | 'healthcare'
  | 'financials'
  | 'consumer'
  | 'industrials'
  | 'energy'
  | 'utilities'
  | 'materials'
  | 'real_estate'
  | 'telecom'
  | 'other';

export interface Position {
  symbol: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  marketValue: number;
}

export interface SecurityFactors {
  symbol: string;
  beta: number;           // Market beta
  marketCap: number;      // Market capitalization
  pe: number;             // P/E ratio (value indicator)
  momentum: number;       // 3-month return
  volatility: number;     // Annualized volatility
  sector: SectorType;
}

export interface FactorExposure {
  factor: FactorType;
  value: number;          // Exposure value
  contribution: number;   // Contribution to portfolio (%)
  risk: number;          // Risk contribution
}

export interface PortfolioAttribution {
  totalValue: number;
  factorExposures: FactorExposure[];
  sectorExposures: Map<SectorType, number>;
  aggregateBeta: number;
  diversificationRatio: number;
  concentrationRisk: number;
}

export interface AttributionBreakdown {
  symbol: string;
  weight: number;         // Portfolio weight (%)
  returnContribution: number;  // Contribution to return
  riskContribution: number;    // Contribution to risk
  factorContributions: Map<FactorType, number>;
}

export class FactorAttributionEngine {
  private positions: Position[];
  private factorData: Map<string, SecurityFactors>;

  constructor(positions: Position[], factorData: Map<string, SecurityFactors>) {
    this.positions = positions;
    this.factorData = factorData;
  }

  public analyzePortfolio(): PortfolioAttribution {
    const totalValue = this.calculateTotalValue();
    const factorExposures = this.calculateFactorExposures(totalValue);
    const sectorExposures = this.calculateSectorExposures(totalValue);
    const aggregateBeta = this.calculateAggregateBeta();
    const diversificationRatio = this.calculateDiversificationRatio();
    const concentrationRisk = this.calculateConcentrationRisk();

    return {
      totalValue,
      factorExposures,
      sectorExposures,
      aggregateBeta,
      diversificationRatio,
      concentrationRisk,
    };
  }

  public attributeReturns(periodReturns: Map<string, number>): AttributionBreakdown[] {
    const totalValue = this.calculateTotalValue();
    const attributions: AttributionBreakdown[] = [];

    for (const position of this.positions) {
      const factors = this.factorData.get(position.symbol);
      if (!factors) continue;

      const weight = (position.marketValue / totalValue) * 100;
      const returnContribution = ((periodReturns.get(position.symbol) || 0) * position.marketValue) / totalValue;
      const riskContribution = this.calculatePositionRiskContribution(position, totalValue);

      const factorContributions = new Map<FactorType, number>();
      factorContributions.set('market', factors.beta * weight);
      factorContributions.set('size', this.getSizeFactor(factors.marketCap) * weight);
      factorContributions.set('value', this.getValueFactor(factors.pe) * weight);
      factorContributions.set('momentum', factors.momentum * weight / 100);
      factorContributions.set('volatility', factors.volatility * weight / 100);

      attributions.push({
        symbol: position.symbol,
        weight,
        returnContribution,
        riskContribution,
        factorContributions,
      });
    }

    return attributions;
  }

  private calculateTotalValue(): number {
    return this.positions.reduce((sum, pos) => sum + pos.marketValue, 0);
  }

  private calculateFactorExposures(totalValue: number): FactorExposure[] {
    const exposures: FactorExposure[] = [];

    // Market exposure (weighted beta)
    let marketExposure = 0;
    let marketContribution = 0;
    let marketRisk = 0;

    for (const position of this.positions) {
      const factors = this.factorData.get(position.symbol);
      if (!factors) continue;

      const weight = position.marketValue / totalValue;
      marketExposure += factors.beta * weight;
      marketContribution += (factors.beta - 1) * weight * 100;
      marketRisk += Math.abs(factors.beta - 1) * weight;
    }

    exposures.push({
      factor: 'market',
      value: marketExposure,
      contribution: marketContribution,
      risk: marketRisk,
    });

    // Size exposure (market cap weighted)
    let sizeExposure = 0;
    let sizeContribution = 0;
    let sizeRisk = 0;

    for (const position of this.positions) {
      const factors = this.factorData.get(position.symbol);
      if (!factors) continue;

      const weight = position.marketValue / totalValue;
      const sizeFactor = this.getSizeFactor(factors.marketCap);
      sizeExposure += sizeFactor * weight;
      sizeContribution += sizeFactor * weight * 100;
      sizeRisk += Math.abs(sizeFactor) * weight;
    }

    exposures.push({
      factor: 'size',
      value: sizeExposure,
      contribution: sizeContribution,
      risk: sizeRisk,
    });

    // Value exposure (P/E based)
    let valueExposure = 0;
    let valueContribution = 0;
    let valueRisk = 0;

    for (const position of this.positions) {
      const factors = this.factorData.get(position.symbol);
      if (!factors) continue;

      const weight = position.marketValue / totalValue;
      const valueFactor = this.getValueFactor(factors.pe);
      valueExposure += valueFactor * weight;
      valueContribution += valueFactor * weight * 100;
      valueRisk += Math.abs(valueFactor) * weight;
    }

    exposures.push({
      factor: 'value',
      value: valueExposure,
      contribution: valueContribution,
      risk: valueRisk,
    });

    // Momentum exposure
    let momentumExposure = 0;
    let momentumContribution = 0;
    let momentumRisk = 0;

    for (const position of this.positions) {
      const factors = this.factorData.get(position.symbol);
      if (!factors) continue;

      const weight = position.marketValue / totalValue;
      momentumExposure += factors.momentum * weight;
      momentumContribution += factors.momentum * weight;
      momentumRisk += Math.abs(factors.momentum) * weight / 100;
    }

    exposures.push({
      factor: 'momentum',
      value: momentumExposure,
      contribution: momentumContribution,
      risk: momentumRisk,
    });

    // Volatility exposure
    let volExposure = 0;
    let volContribution = 0;
    let volRisk = 0;

    for (const position of this.positions) {
      const factors = this.factorData.get(position.symbol);
      if (!factors) continue;

      const weight = position.marketValue / totalValue;
      volExposure += factors.volatility * weight;
      volContribution += (factors.volatility - 20) * weight; // 20% baseline
      volRisk += factors.volatility * weight / 100;
    }

    exposures.push({
      factor: 'volatility',
      value: volExposure,
      contribution: volContribution,
      risk: volRisk,
    });

    return exposures;
  }

  private calculateSectorExposures(totalValue: number): Map<SectorType, number> {
    const exposures = new Map<SectorType, number>();

    for (const position of this.positions) {
      const factors = this.factorData.get(position.symbol);
      if (!factors) continue;

      const weight = (position.marketValue / totalValue) * 100;
      const current = exposures.get(factors.sector) || 0;
      exposures.set(factors.sector, current + weight);
    }

    return exposures;
  }

  private calculateAggregateBeta(): number {
    const totalValue = this.calculateTotalValue();
    let weightedBeta = 0;

    for (const position of this.positions) {
      const factors = this.factorData.get(position.symbol);
      if (!factors) continue;

      const weight = position.marketValue / totalValue;
      weightedBeta += factors.beta * weight;
    }

    return weightedBeta;
  }

  private calculateDiversificationRatio(): number {
    // Diversification ratio: weighted avg volatility / portfolio volatility
    const totalValue = this.calculateTotalValue();
    let weightedVol = 0;
    let sumOfSquares = 0;

    for (const position of this.positions) {
      const factors = this.factorData.get(position.symbol);
      if (!factors) continue;

      const weight = position.marketValue / totalValue;
      weightedVol += factors.volatility * weight;
      sumOfSquares += Math.pow(factors.volatility * weight, 2);
    }

    const portfolioVol = Math.sqrt(sumOfSquares);
    return portfolioVol > 0 ? weightedVol / portfolioVol : 1.0;
  }

  private calculateConcentrationRisk(): number {
    // Herfindahl-Hirschman Index (HHI)
    const totalValue = this.calculateTotalValue();
    let hhi = 0;

    for (const position of this.positions) {
      const weight = (position.marketValue / totalValue) * 100;
      hhi += Math.pow(weight, 2);
    }

    return hhi;
  }

  private calculatePositionRiskContribution(position: Position, totalValue: number): number {
    const factors = this.factorData.get(position.symbol);
    if (!factors) return 0;

    const weight = position.marketValue / totalValue;
    return factors.volatility * weight;
  }

  private getSizeFactor(marketCap: number): number {
    // Size factor: negative for large cap, positive for small cap
    // Using $10B as midpoint
    const logMidpoint = Math.log(10_000_000_000);
    const logMarketCap = Math.log(marketCap);
    return (logMidpoint - logMarketCap) / 2; // Normalized
  }

  private getValueFactor(pe: number): number {
    // Value factor: positive for low P/E (value), negative for high P/E (growth)
    // Using 20 as market average
    const avgPE = 20;
    return (avgPE - pe) / avgPE;
  }
}

export function createMockFactors(symbol: string): SecurityFactors {
  // Helper for testing - generates reasonable mock factor data
  const hash = symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

  return {
    symbol,
    beta: 0.8 + (hash % 8) / 10,              // 0.8 - 1.5
    marketCap: 1_000_000_000 * (1 + hash % 500), // $1B - $500B
    pe: 10 + (hash % 30),                     // 10 - 40
    momentum: -10 + (hash % 40),              // -10% to +30%
    volatility: 15 + (hash % 35),             // 15% - 50%
    sector: ['technology', 'healthcare', 'financials', 'consumer', 'industrials'][hash % 5] as SectorType,
  };
}
