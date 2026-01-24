import { describe, it, expect, beforeEach } from 'vitest';
import { PrometheusExporter } from '../src/exporters/prometheus';
import { OTLPExporter } from '../src/exporters/otlp';
import { recordE2E, recordDecision, recordAck, resetMetrics } from '../src/obs/e2e';
import { getDashboard } from '../src/obs/sloDashboard';
import { newSpan, endSpan } from '../src/obs/tracing';

describe('Prometheus Exporter', () => {
  let exporter: PrometheusExporter;

  beforeEach(() => {
    resetMetrics();
    getDashboard().reset();
    exporter = new PrometheusExporter('test-service', 'test');
  });

  describe('Metrics Format', () => {
    it('exports metrics in Prometheus text format', () => {
      // Record some latencies
      for (let i = 0; i < 10; i++) {
        recordE2E(100);
        recordDecision(50);
        recordAck(30);
      }

      const output = exporter.exportMetrics();

      expect(output).toContain('# HELP');
      expect(output).toContain('# TYPE');
      expect(output).toContain('test_e2e_latency_milliseconds');
      expect(output).toContain('test_decision_latency_milliseconds');
      expect(output).toContain('test_order_ack_latency_milliseconds');
    });

    it('includes TYPE declarations for each metric', () => {
      const output = exporter.exportMetrics();

      expect(output).toMatch(/# TYPE test_e2e_latency_milliseconds summary/);
      expect(output).toMatch(/# TYPE test_error_rate gauge/);
      expect(output).toMatch(/# TYPE test_uptime_percentage gauge/);
    });

    it('includes HELP text for each metric', () => {
      const output = exporter.exportMetrics();

      expect(output).toContain('# HELP test_e2e_latency_milliseconds');
      expect(output).toContain('# HELP test_error_rate');
      expect(output).toContain('# HELP test_uptime_percentage');
    });
  });

  describe('Latency Metrics', () => {
    it('exports e2e latency percentiles', () => {
      for (let i = 0; i < 100; i++) {
        recordE2E(100 + i);
      }

      const output = exporter.exportMetrics();

      expect(output).toContain('test_e2e_latency_milliseconds{quantile="0.5"');
      expect(output).toContain('test_e2e_latency_milliseconds{quantile="0.95"');
      expect(output).toContain('test_e2e_latency_milliseconds{quantile="0.99"');
    });

    it('exports decision latency percentiles', () => {
      for (let i = 0; i < 100; i++) {
        recordDecision(50 + i);
      }

      const output = exporter.exportMetrics();

      expect(output).toContain('test_decision_latency_milliseconds{quantile="0.5"');
      expect(output).toContain('test_decision_latency_milliseconds{quantile="0.95"');
      expect(output).toContain('test_decision_latency_milliseconds{quantile="0.99"');
    });

    it('exports order ack latency percentiles', () => {
      for (let i = 0; i < 100; i++) {
        recordAck(30 + i);
      }

      const output = exporter.exportMetrics();

      expect(output).toContain('test_order_ack_latency_milliseconds{quantile="0.5"');
      expect(output).toContain('test_order_ack_latency_milliseconds{quantile="0.95"');
      expect(output).toContain('test_order_ack_latency_milliseconds{quantile="0.99"');
    });

    it('exports latency counts', () => {
      for (let i = 0; i < 50; i++) {
        recordE2E(100);
        recordDecision(50);
        recordAck(30);
      }

      const output = exporter.exportMetrics();

      expect(output).toContain('test_e2e_latency_count');
      expect(output).toContain('test_decision_latency_count');
      expect(output).toContain('test_order_ack_latency_count');
    });
  });

  describe('SLO Metrics', () => {
    it('exports error rate', () => {
      const dashboard = getDashboard();
      dashboard.recordError();
      dashboard.recordSuccess();
      dashboard.recordSuccess();

      const output = exporter.exportMetrics();

      expect(output).toContain('test_error_rate');
      expect(output).toMatch(/test_error_rate\{service="test-service"\} \d+/);
    });

    it('exports uptime percentage', () => {
      const output = exporter.exportMetrics();

      expect(output).toContain('test_uptime_percentage');
      expect(output).toMatch(/test_uptime_percentage\{service="test-service"\} \d+/);
    });

    it('exports SLO status for each SLO', () => {
      const output = exporter.exportMetrics();

      expect(output).toContain('test_slo_status');
      expect(output).toContain('slo_name="e2e_latency_p95"');
      expect(output).toContain('slo_name="error_rate"');
      expect(output).toContain('slo_name="availability"');
    });

    it('exports SLO error budget', () => {
      const output = exporter.exportMetrics();

      expect(output).toContain('test_slo_error_budget_percent');
    });

    it('exports SLO current values', () => {
      const output = exporter.exportMetrics();

      expect(output).toContain('test_slo_current_value');
    });

    it('exports SLO breach duration', () => {
      const output = exporter.exportMetrics();

      expect(output).toContain('test_slo_breach_duration_milliseconds');
    });
  });

  describe('Alert Metrics', () => {
    it('exports alert counts by severity', () => {
      const output = exporter.exportMetrics();

      expect(output).toContain('test_alerts_total{severity="critical"');
      expect(output).toContain('test_alerts_total{severity="warning"');
      expect(output).toContain('test_alerts_total{severity="info"');
    });

    it('shows zero alerts when healthy', () => {
      for (let i = 0; i < 100; i++) {
        recordE2E(100); // Healthy latency
      }

      const output = exporter.exportMetrics();

      expect(output).toMatch(/test_alerts_total\{severity="critical"[^}]*\} 0/);
    });
  });

  describe('Labels', () => {
    it('includes service label in all metrics', () => {
      const output = exporter.exportMetrics();

      const lines = output.split('\n').filter((l) => !l.startsWith('#') && l.trim());
      const metricsWithValues = lines.filter((l) => l.includes('service="test-service"'));

      expect(metricsWithValues.length).toBeGreaterThan(0);
    });

    it('formats labels correctly', () => {
      const output = exporter.exportMetrics();

      // Check label format: {key="value",key2="value2"}
      expect(output).toMatch(/\{[^}]+="[^"]+"\}/);
    });
  });
});

describe('OTLP Exporter', () => {
  let exporter: OTLPExporter;

  beforeEach(() => {
    exporter = new OTLPExporter({
      serviceName: 'test-service',
      serviceVersion: '1.0.0',
    });
  });

  describe('Span Recording', () => {
    it('records spans', () => {
      const traceId = 'trace-123';
      const span = newSpan('test-operation', traceId);
      endSpan(span);

      exporter.recordSpan(span);

      expect(exporter.getSpanCount()).toBe(1);
    });

    it('accumulates multiple spans', () => {
      const traceId = 'trace-123';

      for (let i = 0; i < 5; i++) {
        const span = newSpan(`operation-${i}`, traceId);
        endSpan(span);
        exporter.recordSpan(span);
      }

      expect(exporter.getSpanCount()).toBe(5);
    });
  });

  describe('OTLP Format', () => {
    it('exports traces in OTLP format', () => {
      const traceId = 'trace-123';
      const span = newSpan('test-operation', traceId);
      endSpan(span);
      exporter.recordSpan(span);

      const payload = exporter.exportTraces();

      expect(payload.resourceSpans).toBeDefined();
      expect(payload.resourceSpans.length).toBe(1);
    });

    it('includes resource attributes', () => {
      const traceId = 'trace-123';
      const span = newSpan('test-operation', traceId);
      endSpan(span);
      exporter.recordSpan(span);

      const payload = exporter.exportTraces();
      const resource = payload.resourceSpans[0].resource;

      const serviceNameAttr = resource.attributes.find((a) => a.key === 'service.name');
      expect(serviceNameAttr?.value.stringValue).toBe('test-service');

      const versionAttr = resource.attributes.find((a) => a.key === 'service.version');
      expect(versionAttr?.value.stringValue).toBe('1.0.0');
    });

    it('includes scope information', () => {
      const traceId = 'trace-123';
      const span = newSpan('test-operation', traceId);
      endSpan(span);
      exporter.recordSpan(span);

      const payload = exporter.exportTraces();
      const scope = payload.resourceSpans[0].scopeSpans[0].scope;

      expect(scope.name).toBe('trading-agent-tracer');
      expect(scope.version).toBe('1.0.0');
    });

    it('converts spans to OTLP format', () => {
      const traceId = 'trace-123';
      const span = newSpan('test-operation', traceId);
      endSpan(span);
      exporter.recordSpan(span);

      const payload = exporter.exportTraces();
      const otlpSpan = payload.resourceSpans[0].scopeSpans[0].spans[0];

      expect(otlpSpan.name).toBe('test-operation');
      expect(otlpSpan.traceId).toBeDefined();
      expect(otlpSpan.spanId).toBeDefined();
      expect(otlpSpan.startTimeUnixNano).toBeDefined();
      expect(otlpSpan.endTimeUnixNano).toBeDefined();
      expect(otlpSpan.kind).toBe(1); // INTERNAL
      expect(otlpSpan.status.code).toBe(1); // OK
    });

    it('normalizes trace IDs to 32 hex chars', () => {
      const traceId = 'abc123';
      const span = newSpan('test-operation', traceId);
      endSpan(span);
      exporter.recordSpan(span);

      const payload = exporter.exportTraces();
      const otlpSpan = payload.resourceSpans[0].scopeSpans[0].spans[0];

      expect(otlpSpan.traceId).toHaveLength(32);
      expect(otlpSpan.traceId).toMatch(/^[0-9a-f]+$/);
    });

    it('normalizes span IDs to 16 hex chars', () => {
      const traceId = 'trace-123';
      const span = newSpan('test-operation', traceId);
      endSpan(span);
      exporter.recordSpan(span);

      const payload = exporter.exportTraces();
      const otlpSpan = payload.resourceSpans[0].scopeSpans[0].spans[0];

      expect(otlpSpan.spanId).toHaveLength(16);
      expect(otlpSpan.spanId).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('Span Hierarchy', () => {
    it('preserves parent-child relationships', () => {
      const traceId = 'trace-123';
      const parentSpan = newSpan('parent', traceId);
      const childSpan = newSpan('child', traceId, parentSpan.spanId);
      endSpan(childSpan);
      endSpan(parentSpan);

      exporter.recordSpan(parentSpan);
      exporter.recordSpan(childSpan);

      const payload = exporter.exportTraces();
      const spans = payload.resourceSpans[0].scopeSpans[0].spans;

      const parent = spans.find((s) => s.name === 'parent');
      const child = spans.find((s) => s.name === 'child');

      expect(parent?.parentSpanId).toBeUndefined();
      expect(child?.parentSpanId).toBeDefined();
    });
  });

  describe('Timestamp Conversion', () => {
    it('converts milliseconds to nanoseconds', () => {
      const traceId = 'trace-123';
      const span = newSpan('test-operation', traceId);
      endSpan(span);
      exporter.recordSpan(span);

      const payload = exporter.exportTraces();
      const otlpSpan = payload.resourceSpans[0].scopeSpans[0].spans[0];

      // OTLP uses nanoseconds (string format)
      expect(otlpSpan.startTimeUnixNano).toMatch(/^\d+$/);
      expect(otlpSpan.endTimeUnixNano).toMatch(/^\d+$/);

      const startNano = BigInt(otlpSpan.startTimeUnixNano);
      const endNano = BigInt(otlpSpan.endTimeUnixNano);

      expect(endNano).toBeGreaterThanOrEqual(startNano);
    });
  });

  describe('Clear and Flush', () => {
    it('clears spans', () => {
      const traceId = 'trace-123';
      const span = newSpan('test-operation', traceId);
      endSpan(span);
      exporter.recordSpan(span);

      expect(exporter.getSpanCount()).toBe(1);

      exporter.clear();

      expect(exporter.getSpanCount()).toBe(0);
    });

    it('flushes without endpoint configured', async () => {
      const traceId = 'trace-123';
      const span = newSpan('test-operation', traceId);
      endSpan(span);
      exporter.recordSpan(span);

      await exporter.flush();

      // Should clear spans even without endpoint
      expect(exporter.getSpanCount()).toBe(0);
    });
  });

  describe('Span Attributes', () => {
    it('includes span name as attribute', () => {
      const traceId = 'trace-123';
      const span = newSpan('my-operation', traceId);
      endSpan(span);
      exporter.recordSpan(span);

      const payload = exporter.exportTraces();
      const otlpSpan = payload.resourceSpans[0].scopeSpans[0].spans[0];

      const nameAttr = otlpSpan.attributes.find((a) => a.key === 'span.name');
      expect(nameAttr?.value.stringValue).toBe('my-operation');
    });

    it('includes trace ID as attribute', () => {
      const traceId = 'trace-123';
      const span = newSpan('test-operation', traceId);
      endSpan(span);
      exporter.recordSpan(span);

      const payload = exporter.exportTraces();
      const otlpSpan = payload.resourceSpans[0].scopeSpans[0].spans[0];

      const traceIdAttr = otlpSpan.attributes.find((a) => a.key === 'trace.id');
      expect(traceIdAttr?.value.stringValue).toBe(traceId);
    });
  });
});
