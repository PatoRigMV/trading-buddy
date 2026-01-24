import crypto from 'crypto';
export type Span = { traceId: string; spanId: string; name: string; tsStart: number; tsEnd?: number; attrs?: Record<string, any> };
export function newTrace(){ return crypto.randomBytes(8).toString('hex'); }
export function newSpan(name:string, traceId?:string): Span { return { name, traceId: traceId||newTrace(), spanId: crypto.randomBytes(8).toString('hex'), tsStart: Date.now(), attrs:{} }; }
export function endSpan(s:Span){ s.tsEnd = Date.now(); return s; }
export function durationMs(s:Span){ return (s.tsEnd||Date.now()) - s.tsStart; }
