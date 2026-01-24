import { Position } from './factors';
export function sectorAttribution(positions:Position[], returnsBySymbol:Record<string,number>, sectorBySymbol:Record<string,string>){
  const bucket: Record<string,{ contrib:number; notional:number }> = {};
  for(const p of positions){ const sec = sectorBySymbol[p.symbol]||'UNK'; bucket[sec] ||= { contrib:0, notional:0 }; bucket[sec].notional += p.notional; bucket[sec].contrib += (returnsBySymbol[p.symbol]||0)*p.notional; }
  return Object.entries(bucket).map(([sector,v])=> ({ sector, contrib:v.contrib, weight: v.notional / Math.max(1, Object.values(bucket).reduce((s,b)=>s+b.notional,0)) }));
}
