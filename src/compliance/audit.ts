import crypto from 'crypto';
interface AuditRec { id?:number; ts:number; trace_id:string; symbol:string; state:string; reason_codes:string[]; ev_bps:number|null; consensus_snapshot:any; risk_snapshot:any; order_ref?:string|null; prev_hash:string|null; hash:string; }
function h(obj:any){ return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex'); }
export class AuditLog { private lastHash:string|null=null; constructor(private write:(rec:AuditRec)=>Promise<void>){ }
  async append(partial: Omit<AuditRec,'hash'|'prev_hash'|'ts'>){ const rec:any = { ...partial, ts: Date.now(), prev_hash: this.lastHash }; rec.hash = h({ ...rec, hash: undefined }); await this.write(rec); this.lastHash = rec.hash; return rec; }
}
export function verifyChain(records:AuditRec[]){ let prev:null|string=null; for(const r of records){ const expect = h({ ...r, hash: undefined }); if(r.hash!==expect || r.prev_hash!==prev) return false; prev = r.hash; } return true; }
