// Prometheus metrics exporter
// Exports trading system metrics in Prometheus text format

import { snapshot } from '../obs/e2e';
import { getDashboard } from '../obs/sloDashboard';

export interface PrometheusMetric {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  help: string;
  labels?: Record<string, string>;
  value: number;
  timestamp?: number;
}

export class PrometheusExporter {
  private serviceName: string;
  private namespace: string;

  constructor(serviceName: string = 'trading_agent', namespace: string = 'trading') {
    this.serviceName = serviceName;
    this.namespace = namespace;
  }

  /**
   * Export all metrics in Prometheus text format
   */
  public exportMetrics(): string {
    const metrics: PrometheusMetric[] = [];

    // Latency metrics
    this.addLatencyMetrics(metrics);

    // SLO metrics
    this.addSLOMetrics(metrics);

    // Format as Prometheus text
    return this.formatPrometheusText(metrics);
  }

  private addLatencyMetrics(metrics: PrometheusMetric[]): void {
    const latency = snapshot();

    // E2E latency percentiles
    metrics.push({
      name: `${this.namespace}_e2e_latency_milliseconds`,
      type: 'summary',
      help: 'End-to-end request latency in milliseconds',
      labels: { quantile: '0.5', service: this.serviceName },
      value: latency.e2e.p50,
    });

    metrics.push({
      name: `${this.namespace}_e2e_latency_milliseconds`,
      type: 'summary',
      help: 'End-to-end request latency in milliseconds',
      labels: { quantile: '0.95', service: this.serviceName },
      value: latency.e2e.p95,
    });

    metrics.push({
      name: `${this.namespace}_e2e_latency_milliseconds`,
      type: 'summary',
      help: 'End-to-end request latency in milliseconds',
      labels: { quantile: '0.99', service: this.serviceName },
      value: latency.e2e.p99,
    });

    metrics.push({
      name: `${this.namespace}_e2e_latency_count`,
      type: 'counter',
      help: 'Total number of e2e requests',
      labels: { service: this.serviceName },
      value: latency.e2e.n,
    });

    // Decision latency percentiles
    metrics.push({
      name: `${this.namespace}_decision_latency_milliseconds`,
      type: 'summary',
      help: 'Decision-making latency in milliseconds',
      labels: { quantile: '0.5', service: this.serviceName },
      value: latency.decision.p50,
    });

    metrics.push({
      name: `${this.namespace}_decision_latency_milliseconds`,
      type: 'summary',
      help: 'Decision-making latency in milliseconds',
      labels: { quantile: '0.95', service: this.serviceName },
      value: latency.decision.p95,
    });

    metrics.push({
      name: `${this.namespace}_decision_latency_milliseconds`,
      type: 'summary',
      help: 'Decision-making latency in milliseconds',
      labels: { quantile: '0.99', service: this.serviceName },
      value: latency.decision.p99,
    });

    metrics.push({
      name: `${this.namespace}_decision_latency_count`,
      type: 'counter',
      help: 'Total number of decisions',
      labels: { service: this.serviceName },
      value: latency.decision.n,
    });

    // Order ack latency percentiles
    metrics.push({
      name: `${this.namespace}_order_ack_latency_milliseconds`,
      type: 'summary',
      help: 'Order acknowledgment latency in milliseconds',
      labels: { quantile: '0.5', service: this.serviceName },
      value: latency.ack.p50,
    });

    metrics.push({
      name: `${this.namespace}_order_ack_latency_milliseconds`,
      type: 'summary',
      help: 'Order acknowledgment latency in milliseconds',
      labels: { quantile: '0.95', service: this.serviceName },
      value: latency.ack.p95,
    });

    metrics.push({
      name: `${this.namespace}_order_ack_latency_milliseconds`,
      type: 'summary',
      help: 'Order acknowledgment latency in milliseconds',
      labels: { quantile: '0.99', service: this.serviceName },
      value: latency.ack.p99,
    });

    metrics.push({
      name: `${this.namespace}_order_ack_latency_count`,
      type: 'counter',
      help: 'Total number of order acknowledgments',
      labels: { service: this.serviceName },
      value: latency.ack.n,
    });
  }

  private addSLOMetrics(metrics: PrometheusMetric[]): void {
    const dashboard = getDashboard();
    const snap = dashboard.getSnapshot();

    // Error rate
    metrics.push({
      name: `${this.namespace}_error_rate`,
      type: 'gauge',
      help: 'Current error rate percentage',
      labels: { service: this.serviceName },
      value: snap.errorRate,
    });

    // Uptime
    metrics.push({
      name: `${this.namespace}_uptime_percentage`,
      type: 'gauge',
      help: 'Current uptime percentage',
      labels: { service: this.serviceName },
      value: snap.uptime,
    });

    // SLO status (0 = healthy, 1 = degraded, 2 = breached)
    for (const sloResult of snap.slos) {
      const statusValue = sloResult.status === 'healthy' ? 0 : sloResult.status === 'degraded' ? 1 : 2;

      metrics.push({
        name: `${this.namespace}_slo_status`,
        type: 'gauge',
        help: 'SLO status (0=healthy, 1=degraded, 2=breached)',
        labels: { slo_name: sloResult.slo.name, service: this.serviceName },
        value: statusValue,
      });

      // Error budget
      metrics.push({
        name: `${this.namespace}_slo_error_budget_percent`,
        type: 'gauge',
        help: 'SLO error budget remaining percentage',
        labels: { slo_name: sloResult.slo.name, service: this.serviceName },
        value: sloResult.errorBudget,
      });

      // Current value
      metrics.push({
        name: `${this.namespace}_slo_current_value`,
        type: 'gauge',
        help: 'SLO current metric value',
        labels: { slo_name: sloResult.slo.name, service: this.serviceName },
        value: sloResult.current,
      });

      // Breach duration
      metrics.push({
        name: `${this.namespace}_slo_breach_duration_milliseconds`,
        type: 'gauge',
        help: 'How long SLO has been in breach (0 if healthy)',
        labels: { slo_name: sloResult.slo.name, service: this.serviceName },
        value: sloResult.breachDuration,
      });
    }

    // Alert counts by severity
    const criticalCount = snap.alerts.filter((a) => a.severity === 'critical').length;
    const warningCount = snap.alerts.filter((a) => a.severity === 'warning').length;
    const infoCount = snap.alerts.filter((a) => a.severity === 'info').length;

    metrics.push({
      name: `${this.namespace}_alerts_total`,
      type: 'gauge',
      help: 'Number of active alerts by severity',
      labels: { severity: 'critical', service: this.serviceName },
      value: criticalCount,
    });

    metrics.push({
      name: `${this.namespace}_alerts_total`,
      type: 'gauge',
      help: 'Number of active alerts by severity',
      labels: { severity: 'warning', service: this.serviceName },
      value: warningCount,
    });

    metrics.push({
      name: `${this.namespace}_alerts_total`,
      type: 'gauge',
      help: 'Number of active alerts by severity',
      labels: { severity: 'info', service: this.serviceName },
      value: infoCount,
    });
  }

  private formatPrometheusText(metrics: PrometheusMetric[]): string {
    const lines: string[] = [];
    const metricGroups = new Map<string, PrometheusMetric[]>();

    // Group metrics by name
    for (const metric of metrics) {
      if (!metricGroups.has(metric.name)) {
        metricGroups.set(metric.name, []);
      }
      metricGroups.get(metric.name)!.push(metric);
    }

    // Format each group
    for (const [name, group] of metricGroups) {
      // Add TYPE and HELP only once per metric
      lines.push(`# HELP ${name} ${group[0].help}`);
      lines.push(`# TYPE ${name} ${group[0].type}`);

      // Add all values for this metric
      for (const metric of group) {
        const labelParts: string[] = [];
        if (metric.labels) {
          for (const [key, value] of Object.entries(metric.labels)) {
            labelParts.push(`${key}="${value}"`);
          }
        }

        const labelStr = labelParts.length > 0 ? `{${labelParts.join(',')}}` : '';
        const timestampStr = metric.timestamp ? ` ${metric.timestamp}` : '';
        lines.push(`${name}${labelStr} ${metric.value}${timestampStr}`);
      }

      lines.push(''); // Blank line between metrics
    }

    return lines.join('\n');
  }

  /**
   * Get metrics endpoint handler for HTTP server
   */
  public getMetricsEndpoint(): () => string {
    return () => this.exportMetrics();
  }
}

// Global exporter instance
let globalExporter: PrometheusExporter | null = null;

export function getPrometheusExporter(serviceName?: string, namespace?: string): PrometheusExporter {
  if (!globalExporter) {
    globalExporter = new PrometheusExporter(serviceName, namespace);
  }
  return globalExporter;
}
