// metrics.ts
// Minimal metrics hooks to track combo ladder attempts, slippage, and fill%.
// Pluggable sinks: console, in-memory, or your telemetry pipeline (Datadog, Prom, etc).
// Author: ChatGPT (GPT-5 Thinking)

export type LadderAttemptMetric = {
  tag: string;              // clientTag or strategy id
  attemptIndex: number;     // optional; if you version attempts
  targetNetPrice: number;
  achievedNetPrice: number;
  slippageBps: number;
  filled: boolean;
  filledQty: number;
  reason?: string;
  ts?: number;
};

export interface Metrics {
  recordLadderAttempt(m: LadderAttemptMetric): void;
  flush?(): Promise<void>;
}

export class ConsoleMetrics implements Metrics {
  recordLadderAttempt(m: LadderAttemptMetric): void {
    const ts = m.ts ?? Date.now();
    // Compute fill% if you have target qty in your outer context.
    // Here we just log the rung stats.
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ type: 'ladder_attempt', ts, ...m }));
  }
  async flush() { /* no-op */ }
}

export class MemoryMetrics implements Metrics {
  private events: LadderAttemptMetric[] = [];
  recordLadderAttempt(m: LadderAttemptMetric): void {
    this.events.push({ ...m, ts: m.ts ?? Date.now() });
  }
  async flush() { /* expose events for scraping or tests */ }
  getEvents() { return this.events.slice(); }
}

// Example: Datadog/Prom adapter stubs for future wiring
export class DatadogMetrics implements Metrics {
  private dd: any;
  constructor(datadogClient: any) { this.dd = datadogClient; }
  recordLadderAttempt(m: LadderAttemptMetric): void {
    // this.dd.gauge('options.ladder.slippage_bps', m.slippageBps, { tag: m.tag });
    // this.dd.increment('options.ladder.attempts', 1, { filled: String(m.filled) });
  }
  async flush() { /* this.dd.flush() */ }
}
