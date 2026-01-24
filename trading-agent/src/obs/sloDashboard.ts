// SLO Dashboard: Service Level Objective tracking and alerting
// Monitors SLOs for latency, error rate, and availability

import { snapshot, type LatencySnapshot } from './e2e';

export type SLOType = 'latency' | 'error_rate' | 'availability';
export type SLOStatus = 'healthy' | 'degraded' | 'breached';

export interface SLODefinition {
  name: string;
  type: SLOType;
  target: number; // Target value (e.g., 95% for availability, 500ms for latency)
  threshold: number; // Threshold for breach (e.g., 90% for availability)
  window: number; // Time window in ms for evaluation
}

export interface SLOResult {
  slo: SLODefinition;
  current: number;
  status: SLOStatus;
  errorBudget: number; // Remaining error budget (0-100%)
  breachDuration: number; // How long in breach (ms), 0 if healthy
}

export interface SLOAlert {
  slo: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: number;
  current: number;
  target: number;
}

export interface DashboardSnapshot {
  timestamp: number;
  latency: LatencySnapshot;
  slos: SLOResult[];
  alerts: SLOAlert[];
  uptime: number; // Percentage uptime in window
  errorRate: number; // Percentage of failed operations
}

// Default SLO definitions
export const DEFAULT_SLOS: SLODefinition[] = [
  {
    name: 'e2e_latency_p95',
    type: 'latency',
    target: 500, // 500ms p95 target
    threshold: 1000, // Breach at 1000ms
    window: 300000, // 5 minute window
  },
  {
    name: 'e2e_latency_p99',
    type: 'latency',
    target: 1000, // 1000ms p99 target
    threshold: 2000, // Breach at 2000ms
    window: 300000,
  },
  {
    name: 'decision_latency_p95',
    type: 'latency',
    target: 200, // 200ms p95 target
    threshold: 500, // Breach at 500ms
    window: 300000,
  },
  {
    name: 'ack_latency_p95',
    type: 'latency',
    target: 100, // 100ms p95 target
    threshold: 300, // Breach at 300ms
    window: 300000,
  },
  {
    name: 'error_rate',
    type: 'error_rate',
    target: 1.0, // 1% error rate target
    threshold: 5.0, // Breach at 5%
    window: 300000,
  },
  {
    name: 'availability',
    type: 'availability',
    target: 99.9, // 99.9% availability target
    threshold: 99.0, // Breach at 99%
    window: 3600000, // 1 hour window
  },
];

export class SLODashboard {
  private slos: SLODefinition[];
  private errorCount: number = 0;
  private successCount: number = 0;
  private downtime: number = 0; // Total downtime in ms
  private windowStart: number = Date.now();
  private breachStartTimes: Map<string, number> = new Map();

  constructor(slos: SLODefinition[] = DEFAULT_SLOS) {
    this.slos = slos;
  }

  public recordSuccess(): void {
    this.successCount++;
  }

  public recordError(): void {
    this.errorCount++;
  }

  public recordDowntime(durationMs: number): void {
    this.downtime += durationMs;
  }

  public getSnapshot(): DashboardSnapshot {
    const latency = snapshot();
    const slos = this.evaluateSLOs(latency);
    const alerts = this.generateAlerts(slos);
    const uptime = this.calculateUptime();
    const errorRate = this.calculateErrorRate();

    return {
      timestamp: Date.now(),
      latency,
      slos,
      alerts,
      uptime,
      errorRate,
    };
  }

  private evaluateSLOs(latency: LatencySnapshot): SLOResult[] {
    const results: SLOResult[] = [];

    for (const slo of this.slos) {
      let current: number;
      let status: SLOStatus;

      switch (slo.type) {
        case 'latency':
          current = this.getLatencyForSLO(slo, latency);
          status = this.getLatencyStatus(current, slo);
          break;

        case 'error_rate':
          current = this.calculateErrorRate();
          status = this.getErrorRateStatus(current, slo);
          break;

        case 'availability':
          current = this.calculateUptime();
          status = this.getAvailabilityStatus(current, slo);
          break;
      }

      const errorBudget = this.calculateErrorBudget(current, slo);
      const breachDuration = this.calculateBreachDuration(slo, status);

      results.push({
        slo,
        current,
        status,
        errorBudget,
        breachDuration,
      });
    }

    return results;
  }

  private getLatencyForSLO(slo: SLODefinition, latency: LatencySnapshot): number {
    const name = slo.name.toLowerCase();

    if (name.includes('e2e') && name.includes('p95')) {
      return latency.e2e.p95;
    } else if (name.includes('e2e') && name.includes('p99')) {
      return latency.e2e.p99;
    } else if (name.includes('decision') && name.includes('p95')) {
      return latency.decision.p95;
    } else if (name.includes('decision') && name.includes('p99')) {
      return latency.decision.p99;
    } else if (name.includes('ack') && name.includes('p95')) {
      return latency.ack.p95;
    } else if (name.includes('ack') && name.includes('p99')) {
      return latency.ack.p99;
    }

    return 0;
  }

  private getLatencyStatus(current: number, slo: SLODefinition): SLOStatus {
    if (current >= slo.threshold) return 'breached';
    if (current >= slo.target) return 'degraded';
    return 'healthy';
  }

  private getErrorRateStatus(current: number, slo: SLODefinition): SLOStatus {
    if (current >= slo.threshold) return 'breached';
    if (current >= slo.target) return 'degraded';
    return 'healthy';
  }

  private getAvailabilityStatus(current: number, slo: SLODefinition): SLOStatus {
    if (current <= slo.threshold) return 'breached';
    if (current <= slo.target) return 'degraded';
    return 'healthy';
  }

  private calculateErrorBudget(current: number, slo: SLODefinition): number {
    // Error budget is the remaining room before breach
    switch (slo.type) {
      case 'latency':
      case 'error_rate':
        // For metrics where higher is worse
        if (current >= slo.threshold) return 0;
        const remaining = slo.threshold - current;
        const total = slo.threshold - slo.target;
        if (total === 0) return 100; // No room between target and threshold
        return Math.max(0, Math.min(100, (remaining / total) * 100));

      case 'availability':
        // For metrics where lower is worse
        if (current <= slo.threshold) return 0;
        const availRemaining = current - slo.threshold;
        const availTotal = slo.target - slo.threshold;
        if (availTotal === 0) return 100;
        return Math.max(0, Math.min(100, (availRemaining / availTotal) * 100));
    }
  }

  private calculateBreachDuration(slo: SLODefinition, status: SLOStatus): number {
    if (status === 'breached') {
      const startTime = this.breachStartTimes.get(slo.name);
      if (startTime) {
        return Date.now() - startTime;
      } else {
        // First time breach detected
        this.breachStartTimes.set(slo.name, Date.now());
        return 0;
      }
    } else {
      // Not breached, clear start time
      this.breachStartTimes.delete(slo.name);
      return 0;
    }
  }

  private calculateUptime(): number {
    const now = Date.now();
    const windowDuration = now - this.windowStart;

    if (windowDuration === 0) return 100;

    const uptimePct = ((windowDuration - this.downtime) / windowDuration) * 100;
    return Math.max(0, Math.min(100, uptimePct));
  }

  private calculateErrorRate(): number {
    const total = this.errorCount + this.successCount;
    if (total === 0) return 0;
    return (this.errorCount / total) * 100;
  }

  private generateAlerts(slos: SLOResult[]): SLOAlert[] {
    const alerts: SLOAlert[] = [];
    const now = Date.now();

    for (const result of slos) {
      if (result.status === 'breached') {
        alerts.push({
          slo: result.slo.name,
          severity: 'critical',
          message: `SLO ${result.slo.name} breached: ${result.current.toFixed(2)} (threshold: ${result.slo.threshold})`,
          timestamp: now,
          current: result.current,
          target: result.slo.target,
        });
      } else if (result.status === 'degraded') {
        alerts.push({
          slo: result.slo.name,
          severity: 'warning',
          message: `SLO ${result.slo.name} degraded: ${result.current.toFixed(2)} (target: ${result.slo.target})`,
          timestamp: now,
          current: result.current,
          target: result.slo.target,
        });
      }

      // Error budget alert
      if (result.errorBudget < 10 && result.errorBudget > 0) {
        alerts.push({
          slo: result.slo.name,
          severity: 'warning',
          message: `SLO ${result.slo.name} error budget low: ${result.errorBudget.toFixed(1)}% remaining`,
          timestamp: now,
          current: result.errorBudget,
          target: 100,
        });
      } else if (result.errorBudget === 0) {
        alerts.push({
          slo: result.slo.name,
          severity: 'critical',
          message: `SLO ${result.slo.name} error budget exhausted`,
          timestamp: now,
          current: 0,
          target: 100,
        });
      }
    }

    return alerts;
  }

  public reset(): void {
    this.errorCount = 0;
    this.successCount = 0;
    this.downtime = 0;
    this.windowStart = Date.now();
    this.breachStartTimes.clear();
  }

  public getSLODefinitions(): SLODefinition[] {
    return this.slos;
  }
}

// Global dashboard instance
let globalDashboard: SLODashboard | null = null;

export function getDashboard(slos?: SLODefinition[]): SLODashboard {
  if (!globalDashboard) {
    globalDashboard = new SLODashboard(slos);
  }
  return globalDashboard;
}
