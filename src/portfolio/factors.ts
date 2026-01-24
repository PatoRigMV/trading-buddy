export type Factor = 'MKT'|'SIZE'|'VAL'|'MOM';
export interface FactorSeries { name:Factor; dates:number[]; values:number[]; }
export interface Position { symbol:string; notional:number; beta?:number; sector?:string; size_bucket?:string; }
export function estimateExposures(positions:Position[], betasBySymbol:Record<string,number>){ const beta = positions.reduce((s,p)=> s + (betasBySymbol[p.symbol]||1)*p.notional, 0); return { beta }; }
