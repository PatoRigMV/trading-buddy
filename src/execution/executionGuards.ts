import { HaltState } from "../data/contracts";

export function isMarketOpen(now:Date, tzOffsetMinutes:number, holidays:Set<string>, halfDays:Set<string>): boolean {
  // Simple US RTH stub: 9:30–16:00 ET (adjusted by tzOffsetMinutes)
  // In production, pull official exchange calendar
  const local = new Date(now.getTime() + tzOffsetMinutes*60000);
  const ymd = local.toISOString().slice(0,10);
  if (holidays.has(ymd)) return false;
  const hh = local.getUTCHours(); const mm = local.getUTCMinutes();
  // crude window; replace with proper calendar logic and DST handling
  const mins = hh*60+mm; const open = 14*60+30; const close = 21*60; // UTC equivalents vary; treat tzOffset as input for now
  return mins >= open && mins < close;
}

export function canEnter(halt:HaltState|null, spread_bps:number|null, allowAuctions:boolean): { ok:boolean; reasons:string[] } {
  const reasons:string[] = [];
  if (halt?.halted) { reasons.push("halted"); }
  if (halt?.luld) { reasons.push("LULD active"); }
  if (!allowAuctions) { /* router should also check auction windows externally */ }
  if (spread_bps!=null && spread_bps > 25) reasons.push("spread too wide");
  return { ok: reasons.length===0, reasons };
}
