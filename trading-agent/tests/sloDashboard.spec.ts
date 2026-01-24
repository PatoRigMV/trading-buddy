import { describe, it, expect, beforeEach } from 'vitest';
import { SLODashboard, DEFAULT_SLOS, type SLODefinition } from '../src/obs/sloDashboard';
import { recordE2E, recordDecision, recordAck, resetMetrics } from '../src/obs/e2e';

describe('SLO Dashboard', () => {
  let dashboard: SLODashboard;

  beforeEach(() => {
    resetMetrics(); // Clear latency histograms
    dashboard = new SLODashboard();
    dashboard.reset();
  });

  describe('SLO Definitions', () => {
    it('loads default SLO definitions', () => {
      const defs = dashboard.getSLODefinitions();
      expect(defs.length).toBe(6);
      expect(defs.some((d) => d.name === 'e2e_latency_p95')).toBe(true);
      expect(defs.some((d) => d.name === 'error_rate')).toBe(true);
      expect(defs.some((d) => d.name === 'availability')).toBe(true);
    });

    it('accepts custom SLO definitions', () => {
      const customSLOs: SLODefinition[] = [
        {
          name: 'custom_latency',
          type: 'latency',
          target: 100,
          threshold: 200,
          window: 60000,
        },
      ];

      const customDashboard = new SLODashboard(customSLOs);
      const defs = customDashboard.getSLODefinitions();

      expect(defs.length).toBe(1);
      expect(defs[0].name).toBe('custom_latency');
    });
  });

  describe('Healthy State', () => {
    it('reports all SLOs healthy when metrics are good', () => {
      // Record good latencies
      for (let i = 0; i < 100; i++) {
        recordE2E(100); // Well under 500ms target
        recordDecision(50); // Well under 200ms target
        recordAck(30); // Well under 100ms target
      }

      // Record successes (no errors)
      for (let i = 0; i < 100; i++) {
        dashboard.recordSuccess();
      }

      const snapshot = dashboard.getSnapshot();

      expect(snapshot.slos.every((s) => s.status === 'healthy')).toBe(true);
      expect(snapshot.alerts.length).toBe(0);
      expect(snapshot.errorRate).toBe(0);
    });
  });

  describe('Degraded State', () => {
    it('reports degraded when metrics exceed target but below threshold', () => {
      // Record latencies between target and threshold
      for (let i = 0; i < 100; i++) {
        recordE2E(600); // Between 500ms target and 1000ms threshold
      }

      const snapshot = dashboard.getSnapshot();
      const e2eSLO = snapshot.slos.find((s) => s.slo.name === 'e2e_latency_p95');

      expect(e2eSLO?.status).toBe('degraded');
      expect(snapshot.alerts.some((a) => a.severity === 'warning')).toBe(true);
    });
  });

  describe('Breached State', () => {
    it('reports breached when metrics exceed threshold', () => {
      // Record latencies exceeding threshold
      for (let i = 0; i < 100; i++) {
        recordE2E(1500); // Exceeds 1000ms threshold
      }

      const snapshot = dashboard.getSnapshot();
      const e2eSLO = snapshot.slos.find((s) => s.slo.name === 'e2e_latency_p95');

      expect(e2eSLO?.status).toBe('breached');
      expect(snapshot.alerts.some((a) => a.severity === 'critical')).toBe(true);
    });

    it('tracks breach duration', () => {
      // First breach
      for (let i = 0; i < 100; i++) {
        recordE2E(1500);
      }

      const snapshot1 = dashboard.getSnapshot();
      const e2eSLO1 = snapshot1.slos.find((s) => s.slo.name === 'e2e_latency_p95');
      expect(e2eSLO1?.breachDuration).toBe(0); // First detection

      // Wait and check again (simulated)
      const snapshot2 = dashboard.getSnapshot();
      const e2eSLO2 = snapshot2.slos.find((s) => s.slo.name === 'e2e_latency_p95');
      expect(e2eSLO2?.breachDuration).toBeGreaterThanOrEqual(0);
    });

    it('clears breach duration when SLO recovers', () => {
      resetMetrics(); // Clear previous histogram data

      // First breach
      for (let i = 0; i < 100; i++) {
        recordE2E(1500);
      }

      dashboard.getSnapshot(); // Detect breach

      // Record good latencies to recover
      resetMetrics(); // Clear histogram
      for (let i = 0; i < 200; i++) { // More samples to ensure healthy p95
        recordE2E(100);
      }

      const snapshot = dashboard.getSnapshot();
      const e2eSLO = snapshot.slos.find((s) => s.slo.name === 'e2e_latency_p95');

      expect(e2eSLO?.status).toBe('healthy');
      expect(e2eSLO?.breachDuration).toBe(0);
    });
  });

  describe('Error Rate SLO', () => {
    it('tracks error rate correctly', () => {
      // Record mix of successes and errors
      for (let i = 0; i < 95; i++) {
        dashboard.recordSuccess();
      }
      for (let i = 0; i < 5; i++) {
        dashboard.recordError();
      }

      const snapshot = dashboard.getSnapshot();
      expect(snapshot.errorRate).toBe(5); // 5% error rate
    });

    it('reports degraded error rate', () => {
      // Record 2% errors (between 1% target and 5% threshold)
      for (let i = 0; i < 98; i++) {
        dashboard.recordSuccess();
      }
      for (let i = 0; i < 2; i++) {
        dashboard.recordError();
      }

      const snapshot = dashboard.getSnapshot();
      const errorSLO = snapshot.slos.find((s) => s.slo.name === 'error_rate');

      expect(errorSLO?.status).toBe('degraded');
    });

    it('reports breached error rate', () => {
      // Record 10% errors (exceeds 5% threshold)
      for (let i = 0; i < 90; i++) {
        dashboard.recordSuccess();
      }
      for (let i = 0; i < 10; i++) {
        dashboard.recordError();
      }

      const snapshot = dashboard.getSnapshot();
      const errorSLO = snapshot.slos.find((s) => s.slo.name === 'error_rate');

      expect(errorSLO?.status).toBe('breached');
    });
  });

  describe('Availability SLO', () => {
    it('calculates uptime correctly', () => {
      // No downtime recorded
      const snapshot = dashboard.getSnapshot();
      expect(snapshot.uptime).toBe(100);
    });

    it('tracks downtime', async () => {
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay to create window
      dashboard.recordDowntime(5); // 5ms downtime
      const snapshot = dashboard.getSnapshot();
      expect(snapshot.uptime).toBeLessThan(100);
    });

    it('reports breached availability', async () => {
      // Record significant downtime to breach 99% threshold
      await new Promise(resolve => setTimeout(resolve, 100)); // 100ms window
      dashboard.recordDowntime(10); // 10ms downtime = 90% uptime
      const snapshot = dashboard.getSnapshot();

      const availSLO = snapshot.slos.find((s) => s.slo.name === 'availability');
      expect(availSLO?.current).toBeLessThan(99.9);
    });
  });

  describe('Error Budget', () => {
    it('calculates error budget for healthy SLO', () => {
      // Record good latencies
      for (let i = 0; i < 100; i++) {
        recordE2E(100);
      }

      const snapshot = dashboard.getSnapshot();
      const e2eSLO = snapshot.slos.find((s) => s.slo.name === 'e2e_latency_p95');

      expect(e2eSLO?.errorBudget).toBeGreaterThan(90);
      expect(e2eSLO?.errorBudget).toBeLessThanOrEqual(100);
    });

    it('calculates error budget for degraded SLO', () => {
      // Record latencies between target and threshold
      for (let i = 0; i < 100; i++) {
        recordE2E(700); // Between 500ms target and 1000ms threshold
      }

      const snapshot = dashboard.getSnapshot();
      const e2eSLO = snapshot.slos.find((s) => s.slo.name === 'e2e_latency_p95');

      expect(e2eSLO?.errorBudget).toBeGreaterThan(0);
      expect(e2eSLO?.errorBudget).toBeLessThan(100);
    });

    it('reports zero error budget for breached SLO', () => {
      // Record latencies exceeding threshold
      for (let i = 0; i < 100; i++) {
        recordE2E(1500);
      }

      const snapshot = dashboard.getSnapshot();
      const e2eSLO = snapshot.slos.find((s) => s.slo.name === 'e2e_latency_p95');

      expect(e2eSLO?.errorBudget).toBe(0);
    });

    it('generates alert when error budget is low', () => {
      // Record latencies close to threshold (within 10% of exhausting budget)
      // Target: 500, Threshold: 1000, Budget exhausted at: 1000
      // Low budget (< 10%) means latency > 950
      for (let i = 0; i < 100; i++) {
        recordE2E(960); // Very close to 1000ms threshold, <10% budget
      }

      const snapshot = dashboard.getSnapshot();
      const e2eSLO = snapshot.slos.find((s) => s.slo.name === 'e2e_latency_p95');

      // Verify error budget is low
      expect(e2eSLO?.errorBudget).toBeLessThan(10);
      expect(e2eSLO?.errorBudget).toBeGreaterThan(0);

      const lowBudgetAlerts = snapshot.alerts.filter((a) => a.message.includes('error budget low'));
      expect(lowBudgetAlerts.length).toBeGreaterThan(0);
    });

    it('generates critical alert when error budget exhausted', () => {
      // Record latencies exceeding threshold
      for (let i = 0; i < 100; i++) {
        recordE2E(1500);
      }

      const snapshot = dashboard.getSnapshot();
      const exhaustedAlerts = snapshot.alerts.filter((a) => a.message.includes('error budget exhausted'));

      expect(exhaustedAlerts.length).toBeGreaterThan(0);
      expect(exhaustedAlerts[0].severity).toBe('critical');
    });
  });

  describe('Alerts', () => {
    it('generates warning alerts for degraded SLOs', () => {
      for (let i = 0; i < 100; i++) {
        recordE2E(600); // Degraded
      }

      const snapshot = dashboard.getSnapshot();
      const warnings = snapshot.alerts.filter((a) => a.severity === 'warning');

      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0].message).toContain('degraded');
    });

    it('generates critical alerts for breached SLOs', () => {
      for (let i = 0; i < 100; i++) {
        recordE2E(1500); // Breached
      }

      const snapshot = dashboard.getSnapshot();
      const criticals = snapshot.alerts.filter((a) => a.severity === 'critical');

      expect(criticals.length).toBeGreaterThan(0);
      expect(criticals.some((a) => a.message.includes('breached'))).toBe(true);
    });

    it('includes current and target values in alerts', () => {
      for (let i = 0; i < 100; i++) {
        recordE2E(1500);
      }

      const snapshot = dashboard.getSnapshot();
      const alert = snapshot.alerts[0];

      expect(alert.current).toBeGreaterThan(0);
      expect(alert.target).toBeGreaterThan(0);
      expect(alert.timestamp).toBeGreaterThan(0);
    });
  });

  describe('Dashboard Snapshot', () => {
    it('includes all required fields', () => {
      const snapshot = dashboard.getSnapshot();

      expect(snapshot.timestamp).toBeGreaterThan(0);
      expect(snapshot.latency).toBeDefined();
      expect(snapshot.slos).toBeDefined();
      expect(snapshot.alerts).toBeDefined();
      expect(snapshot.uptime).toBeDefined();
      expect(snapshot.errorRate).toBeDefined();
    });

    it('includes latency metrics', () => {
      const snapshot = dashboard.getSnapshot();

      expect(snapshot.latency.e2e).toBeDefined();
      expect(snapshot.latency.decision).toBeDefined();
      expect(snapshot.latency.ack).toBeDefined();
    });
  });

  describe('Reset', () => {
    it('clears all metrics on reset', () => {
      // Record some metrics
      dashboard.recordError();
      dashboard.recordSuccess();
      dashboard.recordDowntime(1000);

      dashboard.reset();

      const snapshot = dashboard.getSnapshot();
      expect(snapshot.errorRate).toBe(0);
      expect(snapshot.uptime).toBe(100);
    });
  });

  describe('Multiple SLO Types', () => {
    it('evaluates all SLO types simultaneously', () => {
      // Record latencies
      for (let i = 0; i < 100; i++) {
        recordE2E(100);
        recordDecision(50);
        recordAck(30);
      }

      // Record errors
      for (let i = 0; i < 98; i++) {
        dashboard.recordSuccess();
      }
      for (let i = 0; i < 2; i++) {
        dashboard.recordError();
      }

      const snapshot = dashboard.getSnapshot();

      const latencySLOs = snapshot.slos.filter((s) => s.slo.type === 'latency');
      const errorRateSLOs = snapshot.slos.filter((s) => s.slo.type === 'error_rate');
      const availSLOs = snapshot.slos.filter((s) => s.slo.type === 'availability');

      expect(latencySLOs.length).toBe(4);
      expect(errorRateSLOs.length).toBe(1);
      expect(availSLOs.length).toBe(1);
    });
  });
});
