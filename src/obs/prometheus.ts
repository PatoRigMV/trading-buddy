import { snapshot } from './e2e';

// Global counters for critical metrics (would be initialized in main app)
let globalMetrics = {
  consensus_failures_total: 0,
  stale_quotes_total: 0,
  orders_sent_total: 0,
  orders_filled_total: 0,
  circuit_breaker_trips_total: 0,
  provider_errors_total: new Map<string, number>(),
  last_update: Date.now()
};

export function incrementMetric(metric: keyof typeof globalMetrics, provider?: string) {
  if (metric === 'provider_errors_total' && provider) {
    const current = globalMetrics.provider_errors_total.get(provider) || 0;
    globalMetrics.provider_errors_total.set(provider, current + 1);
  } else if (typeof globalMetrics[metric] === 'number') {
    (globalMetrics[metric] as number)++;
  }
  globalMetrics.last_update = Date.now();
}

// Enhanced Prometheus text endpoint with comprehensive metrics
export function promText(){
  const s = snapshot();
  const now = Date.now();
  const lines: string[] = [];

  // Latency histograms
  lines.push('# HELP e2e_latency_ms End-to-end latency quantiles');
  lines.push('# TYPE e2e_latency_ms summary');
  lines.push(`e2e_latency_ms{quantile="0.5"} ${s.e2e.p50}`);
  lines.push(`e2e_latency_ms{quantile="0.95"} ${s.e2e.p95}`);
  lines.push(`e2e_latency_ms{quantile="0.99"} ${s.e2e.p99}`);
  lines.push(`e2e_latency_ms_count ${s.e2e.n}`);

  lines.push('# HELP decision_latency_ms Decision latency quantiles');
  lines.push('# TYPE decision_latency_ms summary');
  lines.push(`decision_latency_ms{quantile="0.5"} ${s.decision.p50}`);
  lines.push(`decision_latency_ms{quantile="0.95"} ${s.decision.p95}`);
  lines.push(`decision_latency_ms{quantile="0.99"} ${s.decision.p99}`);
  lines.push(`decision_latency_ms_count ${s.decision.n}`);

  lines.push('# HELP order_ack_latency_ms Order ack latency quantiles');
  lines.push('# TYPE order_ack_latency_ms summary');
  lines.push(`order_ack_latency_ms{quantile="0.5"} ${s.ack.p50}`);
  lines.push(`order_ack_latency_ms{quantile="0.95"} ${s.ack.p95}`);
  lines.push(`order_ack_latency_ms{quantile="0.99"} ${s.ack.p99}`);
  lines.push(`order_ack_latency_ms_count ${s.ack.n}`);

  // Critical business metrics
  lines.push('# HELP consensus_failures_total Number of consensus validation failures');
  lines.push('# TYPE consensus_failures_total counter');
  lines.push(`consensus_failures_total ${globalMetrics.consensus_failures_total}`);

  lines.push('# HELP stale_quotes_total Number of stale quote events');
  lines.push('# TYPE stale_quotes_total counter');
  lines.push(`stale_quotes_total ${globalMetrics.stale_quotes_total}`);

  lines.push('# HELP orders_sent_total Total orders sent to broker');
  lines.push('# TYPE orders_sent_total counter');
  lines.push(`orders_sent_total ${globalMetrics.orders_sent_total}`);

  lines.push('# HELP orders_filled_total Total orders filled by broker');
  lines.push('# TYPE orders_filled_total counter');
  lines.push(`orders_filled_total ${globalMetrics.orders_filled_total}`);

  lines.push('# HELP circuit_breaker_trips_total Circuit breaker activations');
  lines.push('# TYPE circuit_breaker_trips_total counter');
  lines.push(`circuit_breaker_trips_total ${globalMetrics.circuit_breaker_trips_total}`);

  // Provider-specific errors
  lines.push('# HELP provider_errors_total Errors by provider');
  lines.push('# TYPE provider_errors_total counter');
  for (const [provider, count] of globalMetrics.provider_errors_total) {
    lines.push(`provider_errors_total{provider="${provider}"} ${count}`);
  }

  // System health
  lines.push('# HELP system_uptime_seconds System uptime in seconds');
  lines.push('# TYPE system_uptime_seconds gauge');
  lines.push(`system_uptime_seconds ${Math.floor((now - globalMetrics.last_update) / 1000)}`);

  return lines.join('\n') + '\n';
}

export async function startPromServer(port=8788){
  const app = Fastify();
  app.get('/metrics', async (_req, res)=> { res.header('Content-Type', 'text/plain; version=0.0.4'); res.send(promText()); });
  await app.listen({ port, host:'0.0.0.0' });
  // eslint-disable-next-line no-console
  console.log(`[prometheus] listening on :${port}/metrics`);
}
