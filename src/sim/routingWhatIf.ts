import { simulateFill, ExecSimConfig } from './executionSim';
export function compareStrategies(mid:number, side:'buy'|'sell', qty:number, bucket:'Q1'|'Q2'|'Q3'|'Q4'|'Q5', cfg:ExecSimConfig){
  const single = simulateFill(mid*1.001, mid, side, bucket, cfg);
  const twap = Array.from({length:4}, (_,i)=> simulateFill(mid*1.0005, mid, side, bucket, cfg));
  const pov = Array.from({length:4}, (_,i)=> simulateFill(mid*1.0007, mid, side, bucket, cfg));
  const avg = (xs:any[])=> xs.reduce((a,b)=>a+b.price,0)/xs.length;
  return { single_px: single.price, twap_px: avg(twap), pov_px: avg(pov) };
}
