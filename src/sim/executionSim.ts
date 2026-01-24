export type LiquidityBucket = 'Q1'|'Q2'|'Q3'|'Q4'|'Q5';
export interface ExecSimConfig { spreadBpsByBucket: Record<LiquidityBucket, number>; slipMeanBpsByBucket: Record<LiquidityBucket, number>; slipStdBpsByBucket: Record<LiquidityBucket, number>; feePerShare: number; }
function normal(mean:number, std:number){ // Box-Muller
  const u=Math.random(), v=Math.random(); return mean + std * Math.sqrt(-2*Math.log(u)) * Math.cos(2*Math.PI*v); }
export function simulateFill(limit:number, mid:number, side:'buy'|'sell', bucket:LiquidityBucket, cfg:ExecSimConfig){
  const baseSlip = normal(cfg.slipMeanBpsByBucket[bucket], cfg.slipStdBpsByBucket[bucket]);
  const slip = Math.max(-cfg.spreadBpsByBucket[bucket]/2, baseSlip);
  const price = side==='buy' ? Math.min(limit, mid*(1+slip/10000)) : Math.max(limit, mid*(1-slip/10000));
  return { price, slip_bps: slip };
}
