import crypto from "crypto";

export type Span = {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    name: string;
    tsStart: number;
    tsEnd?: number;
    attrs?: Record<string, any>;
};

export function newTrace(): string {
    return crypto.randomBytes(8).toString("hex");
}

export function newSpan(name: string, traceId?: string, parentSpanId?: string): Span {
    return {
        name,
        traceId: traceId || newTrace(),
        spanId: crypto.randomBytes(8).toString("hex"),
        parentSpanId,
        tsStart: Date.now(),
        attrs: {},
    };
}

export function endSpan(s: Span): Span {
    s.tsEnd = Date.now();
    return s;
}

export function durationMs(s: Span): number {
    return (s.tsEnd || Date.now()) - s.tsStart;
}
