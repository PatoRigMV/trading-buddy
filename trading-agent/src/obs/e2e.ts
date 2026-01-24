import { newSpan, endSpan, durationMs } from "./tracing";
import { HdrLike } from "./histogram";

const e2e = new HdrLike();
const decision = new HdrLike();
const ack = new HdrLike();

export function recordE2E(ms: number): void {
    e2e.add(ms);
}

export function recordDecision(ms: number): void {
    decision.add(ms);
}

export function recordAck(ms: number): void {
    ack.add(ms);
}

export interface LatencySnapshot {
    e2e: {
        p50: number;
        p95: number;
        p99: number;
        n: number;
    };
    decision: {
        p50: number;
        p95: number;
        p99: number;
        n: number;
    };
    ack: {
        p50: number;
        p95: number;
        p99: number;
        n: number;
    };
}

export function snapshot(): LatencySnapshot {
    return {
        e2e: {
            p50: e2e.p(50),
            p95: e2e.p(95),
            p99: e2e.p(99),
            n: e2e.count(),
        },
        decision: {
            p50: decision.p(50),
            p95: decision.p(95),
            p99: decision.p(99),
            n: decision.count(),
        },
        ack: {
            p50: ack.p(50),
            p95: ack.p(95),
            p99: ack.p(99),
            n: ack.count(),
        },
    };
}

export function resetMetrics(): void {
    e2e.reset();
    decision.reset();
    ack.reset();
}

export { newSpan, endSpan, durationMs };
