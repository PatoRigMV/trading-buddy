import { describe, it, expect, beforeAll } from 'vitest';
import { promText, incrementMetric } from '../src/obs/prometheus';
import { spanToOtlp, exportOtlp } from '../src/obs/otlp';
import { startMetricsApi } from '../src/api/metrics';

describe('Production Observability Integration', () => {
  describe('Prometheus Metrics', () => {
    it('should generate valid prometheus text format', () => {
      // Simulate some business metrics
      incrementMetric('orders_sent_total');
      incrementMetric('orders_filled_total');
      incrementMetric('consensus_failures_total');
      incrementMetric('provider_errors_total', 'yahoo');
      incrementMetric('provider_errors_total', 'polygon');

      const metricsText = promText();

      // Verify Prometheus format basics
      expect(metricsText).toContain('# HELP e2e_latency_ms');
      expect(metricsText).toContain('# TYPE e2e_latency_ms summary');
      expect(metricsText).toContain('e2e_latency_ms{quantile="0.5"}');
      expect(metricsText).toContain('e2e_latency_ms{quantile="0.95"}');
      expect(metricsText).toContain('e2e_latency_ms{quantile="0.99"}');

      // Verify business metrics
      expect(metricsText).toContain('consensus_failures_total 1');
      expect(metricsText).toContain('orders_sent_total 1');
      expect(metricsText).toContain('orders_filled_total 1');
      expect(metricsText).toContain('provider_errors_total{provider="yahoo"} 1');
      expect(metricsText).toContain('provider_errors_total{provider="polygon"} 1');

      // Verify format compliance
      expect(metricsText.split('\n').filter(line => line.startsWith('#')).length).toBeGreaterThan(0);
      expect(metricsText.endsWith('\n')).toBe(true);

      console.log('✅ Generated Prometheus metrics:');
      console.log(metricsText.substring(0, 500) + '...');
    });

    it('should handle provider-specific error tracking', () => {
      incrementMetric('provider_errors_total', 'twelvedata');
      incrementMetric('provider_errors_total', 'fmp');
      incrementMetric('provider_errors_total', 'twelvedata'); // Second error for same provider

      const metricsText = promText();
      expect(metricsText).toContain('provider_errors_total{provider="twelvedata"} 2');
      expect(metricsText).toContain('provider_errors_total{provider="fmp"} 1');
    });
  });

  describe('OTLP Export', () => {
    it('should create valid OTLP spans', () => {
      const traceId = 'abc123def456';
      const spanId = 'span789';
      const now = Date.now();

      const span = spanToOtlp(
        'data-fetch-decision',
        traceId,
        spanId,
        now - 150,
        now,
        {
          symbol: 'AAPL',
          stage: 'decision',
          latency_ms: 150,
          provider: 'yahoo'
        }
      );

      expect(span.name).toBe('data-fetch-decision');
      expect(span.traceId).toBe(traceId);
      expect(span.spanId).toBe(spanId);
      expect(span.startTimeUnixNano).toBeTruthy();
      expect(span.endTimeUnixNano).toBeTruthy();
      expect(span.attributes).toBeDefined();

      // Check attributes
      const attrs = span.attributes!;
      expect(attrs.find(a => a.key === 'symbol')?.value.stringValue).toBe('AAPL');
      expect(attrs.find(a => a.key === 'stage')?.value.stringValue).toBe('decision');
      expect(attrs.find(a => a.key === 'latency_ms')?.value.doubleValue).toBe(150);
      expect(attrs.find(a => a.key === 'provider')?.value.stringValue).toBe('yahoo');

      console.log('✅ Generated OTLP span:', JSON.stringify(span, null, 2));
    });

    it('should handle OTLP export gracefully when no endpoint set', async () => {
      // Should not throw when OTLP_ENDPOINT is not set
      const span = spanToOtlp('test', 'trace', 'span', Date.now()-100, Date.now());

      // This should complete without error (no endpoint configured)
      await expect(exportOtlp([span])).resolves.toBeUndefined();
    });
  });

  describe('Production Readiness Checklist', () => {
    it('should meet all SLO monitoring requirements', () => {
      const metricsText = promText();

      // Check all required SLO metrics from runbook are present
      const requiredMetrics = [
        'e2e_latency_ms',        // End-to-end latency SLO
        'decision_latency_ms',   // Decision latency SLO
        'order_ack_latency_ms',  // Order ack latency SLO
        'consensus_failures_total', // Data quality SLO
        'stale_quotes_total',    // Quote freshness SLO
        'circuit_breaker_trips_total', // Provider reliability
        'orders_sent_total',     // Execution monitoring
        'orders_filled_total',   // Execution success rate
        'provider_errors_total', // Provider health
        'system_uptime_seconds'  // System health
      ];

      for (const metric of requiredMetrics) {
        expect(metricsText).toContain(metric);
      }

      console.log('✅ All required production SLO metrics present');
    });

    it('should support production alerting thresholds', () => {
      const metricsText = promText();

      // Verify quantiles for alerting (from runbook)
      expect(metricsText).toContain('quantile="0.95"'); // p95 <= 500ms e2e
      expect(metricsText).toContain('quantile="0.99"'); // p99 <= 700ms order ack

      // Verify counter metrics for rate-based alerts
      expect(metricsText).toMatch(/consensus_failures_total \d+/);
      expect(metricsText).toMatch(/stale_quotes_total \d+/);

      console.log('✅ Production alerting metrics ready');
    });
  });

  describe('Docker Compose Integration', () => {
    it('should have complete observability stack configuration', async () => {
      // Verify Docker Compose files exist
      const fs = await import('fs');

      expect(fs.existsSync('docker-compose.yml')).toBe(true);
      expect(fs.existsSync('observability/prometheus.yml')).toBe(true);
      expect(fs.existsSync('observability/otel-collector-config.yml')).toBe(true);
      expect(fs.existsSync('observability/grafana/provisioning/datasources/datasources.yml')).toBe(true);
      expect(fs.existsSync('observability/grafana/dashboards/trading-agent-dashboard.json')).toBe(true);

      console.log('✅ Complete observability stack configured');
    });
  });
});
