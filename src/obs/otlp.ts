/* Minimal OTLP HTTP exporter (traces).
   - Set OTLP_ENDPOINT=https://otel-collector:4318/v1/traces
   - Optional: OTLP_HEADERS='Authorization=Bearer xxx,User-Agent=agent' */
export type OtlpSpan = { traceId:string; spanId:string; name:string; startTimeUnixNano:string; endTimeUnixNano:string; attributes?:{key:string; value:{stringValue?:string; intValue?:string; doubleValue?:number}}[] };

function ns(ms:number){ return String(BigInt(Math.floor(ms)) * 1000000n); }
function headersFromEnv(){ const h:Record<string,string>={ 'content-type':'application/json' }; const raw=process.env.OTLP_HEADERS||''; raw.split(',').map(x=>x.trim()).filter(Boolean).forEach(kv=>{ const [k,...rest]=kv.split('='); h[k.trim()]=rest.join('='); }); return h; }

export async function exportOtlp(spans:OtlpSpan[]){
  const url = process.env.OTLP_ENDPOINT; if(!url || spans.length===0) return;
  const body = { resourceSpans:[{ resource:{ attributes:[] }, scopeSpans:[{ scope:{ name:'agent' }, spans }] }] };
  try{ const r = await fetch(url, { method:'POST', headers: headersFromEnv(), body: JSON.stringify(body) }); if(!r.ok){ /* swallow or log */ } } catch { /* network errors ignored */ }
}

export function spanToOtlp(name:string, traceId:string, spanId:string, tsStart:number, tsEnd:number, attrs?:Record<string,any>): OtlpSpan{
  const attributes = Object.entries(attrs||{}).map(([key,val])=>({ key, value: typeof val==='number'? { doubleValue: val }: { stringValue: String(val) } }));
  return { name, traceId, spanId, startTimeUnixNano: ns(tsStart), endTimeUnixNano: ns(tsEnd), attributes };
}
