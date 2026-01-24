// OTLP (OpenTelemetry Protocol) trace exporter
// Exports distributed traces in OTLP JSON format

import type { Span } from '../obs/tracing';

export interface OTLPSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number; // 0=UNSPECIFIED, 1=INTERNAL, 2=SERVER, 3=CLIENT
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OTLPAttribute[];
  status: {
    code: number; // 0=UNSET, 1=OK, 2=ERROR
  };
}

export interface OTLPAttribute {
  key: string;
  value: {
    stringValue?: string;
    intValue?: string;
    doubleValue?: number;
    boolValue?: boolean;
  };
}

export interface OTLPResourceSpan {
  resource: {
    attributes: OTLPAttribute[];
  };
  scopeSpans: Array<{
    scope: {
      name: string;
      version: string;
    };
    spans: OTLPSpan[];
  }>;
}

export interface OTLPTracePayload {
  resourceSpans: OTLPResourceSpan[];
}

export interface OTLPExporterConfig {
  serviceName: string;
  serviceVersion: string;
  endpoint?: string; // Optional OTLP collector endpoint
  headers?: Record<string, string>; // Auth headers, etc.
}

const DEFAULT_CONFIG: OTLPExporterConfig = {
  serviceName: 'trading-agent',
  serviceVersion: '1.0.0',
};

export class OTLPExporter {
  private config: OTLPExporterConfig;
  private spans: Span[] = [];

  constructor(config: Partial<OTLPExporterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Record a span for export
   */
  public recordSpan(span: Span): void {
    this.spans.push(span);
  }

  /**
   * Convert internal span to OTLP format
   */
  private convertSpan(span: Span): OTLPSpan {
    // Convert milliseconds to nanoseconds (OTLP uses nanoseconds)
    const startNano = (span.tsStart * 1_000_000).toString();
    const endNano = ((span.tsEnd || Date.now()) * 1_000_000).toString();

    const attributes: OTLPAttribute[] = [
      {
        key: 'span.name',
        value: { stringValue: span.name },
      },
    ];

    // Add trace ID as attribute
    attributes.push({
      key: 'trace.id',
      value: { stringValue: span.traceId },
    });

    return {
      traceId: this.normalizeTraceId(span.traceId),
      spanId: this.normalizeSpanId(span.spanId),
      parentSpanId: span.parentSpanId ? this.normalizeSpanId(span.parentSpanId) : undefined,
      name: span.name,
      kind: 1, // INTERNAL
      startTimeUnixNano: startNano,
      endTimeUnixNano: endNano,
      attributes,
      status: {
        code: 1, // OK (could be enhanced to check for errors)
      },
    };
  }

  /**
   * Normalize trace ID to 32 hex characters (OTLP format)
   */
  private normalizeTraceId(id: string): string {
    // Remove dashes and pad/truncate to 32 chars
    const clean = id.replace(/-/g, '');
    if (clean.length >= 32) {
      return clean.substring(0, 32);
    }
    return clean.padEnd(32, '0');
  }

  /**
   * Normalize span ID to 16 hex characters (OTLP format)
   */
  private normalizeSpanId(id: string): string {
    // Remove dashes and pad/truncate to 16 chars
    const clean = id.replace(/-/g, '');
    if (clean.length >= 16) {
      return clean.substring(0, 16);
    }
    return clean.padEnd(16, '0');
  }

  /**
   * Export spans in OTLP JSON format
   */
  public exportTraces(): OTLPTracePayload {
    const otlpSpans = this.spans.map((span) => this.convertSpan(span));

    const payload: OTLPTracePayload = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              {
                key: 'service.name',
                value: { stringValue: this.config.serviceName },
              },
              {
                key: 'service.version',
                value: { stringValue: this.config.serviceVersion },
              },
            ],
          },
          scopeSpans: [
            {
              scope: {
                name: 'trading-agent-tracer',
                version: '1.0.0',
              },
              spans: otlpSpans,
            },
          ],
        },
      ],
    };

    return payload;
  }

  /**
   * Export and send traces to OTLP collector (if endpoint configured)
   */
  public async flush(): Promise<void> {
    if (!this.config.endpoint) {
      // No endpoint configured, just clear spans
      this.spans = [];
      return;
    }

    const payload = this.exportTraces();

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.error(`OTLP export failed: ${response.status} ${response.statusText}`);
      }

      // Clear exported spans
      this.spans = [];
    } catch (error) {
      console.error('OTLP export error:', error);
    }
  }

  /**
   * Get current span count
   */
  public getSpanCount(): number {
    return this.spans.length;
  }

  /**
   * Get all recorded spans (for testing)
   */
  public getSpans(): Span[] {
    return [...this.spans];
  }

  /**
   * Clear all spans
   */
  public clear(): void {
    this.spans = [];
  }
}

// Global exporter instance
let globalExporter: OTLPExporter | null = null;

export function getOTLPExporter(config?: Partial<OTLPExporterConfig>): OTLPExporter {
  if (!globalExporter) {
    globalExporter = new OTLPExporter(config);
  }
  return globalExporter;
}

/**
 * Auto-export integration - records spans as they complete
 */
export function enableOTLPAutoExport(config?: Partial<OTLPExporterConfig>): OTLPExporter {
  const exporter = getOTLPExporter(config);

  // Set up periodic flush (every 30 seconds)
  setInterval(() => {
    exporter.flush().catch((err) => {
      console.error('OTLP auto-export flush failed:', err);
    });
  }, 30000);

  return exporter;
}
