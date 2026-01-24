import { newSpan, endSpan, durationMs } from './tracing'; import { HdrLike } from './histogram';
const e2e = new HdrLike(), decision = new HdrLike(), ack = new HdrLike();
export function recordE2E(ms:number){ e2e.add(ms); } export function recordDecision(ms:number){ decision.add(ms); } export function recordAck(ms:number){ ack.add(ms); }
export function snapshot(){ return { e2e:{p50:e2e.p(50), p95:e2e.p(95), p99:e2e.p(99), n:e2e.count()}, decision:{p50:decision.p(50), p95:decision.p(95), p99:decision.p(99), n:decision.count()}, ack:{p50:ack.p(50), p95:ack.p(95), p99:ack.p(99), n:ack.count()} }; }
export { newSpan, endSpan, durationMs };
