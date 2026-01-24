import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export type AuditEventType =
  | 'AGENT_START'
  | 'AGENT_STOP'
  | 'EMERGENCY_STOP'
  | 'DECISION_MADE'
  | 'ORDER_SUBMITTED'
  | 'ORDER_FILLED'
  | 'ORDER_CANCELLED'
  | 'ORDER_REJECTED'
  | 'POSITION_ENTERED'
  | 'POSITION_EXITED'
  | 'RISK_LIMIT_BREACHED'
  | 'CONFIG_CHANGED'
  | 'MARKET_HOURS_CHANGE';

export interface AuditEvent {
  id: string; // UUID
  timestamp: number; // Unix milliseconds
  eventType: AuditEventType;
  actor: string; // 'system' or user ID
  traceId?: string; // Optional correlation ID
  metadata: Record<string, any>; // Event-specific data
  prevHash: string; // SHA-256 hash of previous event (blockchain-style)
  hash: string; // SHA-256 hash of this event
}

export interface AuditLogConfig {
  logDir: string;
  maxFileSizeMb: number; // Rotate when file exceeds this size
  retentionDays: number; // Keep logs for this many days
}

const DEFAULT_CONFIG: AuditLogConfig = {
  logDir: './audit_logs',
  maxFileSizeMb: 100,
  retentionDays: 2555, // ~7 years (regulatory requirement)
};

export class AuditLog {
  private config: AuditLogConfig;
  private currentFile: string;
  private lastHash: string = '0000000000000000'; // Genesis hash
  private eventCount: number = 0;

  constructor(config: Partial<AuditLogConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Ensure log directory exists
    if (!fs.existsSync(this.config.logDir)) {
      fs.mkdirSync(this.config.logDir, { recursive: true });
    }

    // Initialize current log file
    this.currentFile = this.getOrCreateLogFile();

    // Load last hash from existing log
    this.loadLastHash();
  }

  private getOrCreateLogFile(): string {
    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(this.config.logDir, `audit_${today}.jsonl`);

    if (!fs.existsSync(logFile)) {
      fs.writeFileSync(logFile, '', { flag: 'a' });
    }

    return logFile;
  }

  private loadLastHash(): void {
    try {
      const content = fs.readFileSync(this.currentFile, 'utf-8');
      const lines = content.trim().split('\n').filter((l) => l);

      if (lines.length > 0) {
        const lastEvent: AuditEvent = JSON.parse(lines[lines.length - 1]);
        this.lastHash = lastEvent.hash;
        this.eventCount = lines.length;
      }
    } catch (error) {
      // Fresh log file, use genesis hash
    }
  }

  private generateHash(event: Omit<AuditEvent, 'hash'>): string {
    // Create a canonical representation for consistent hashing
    const canonical = {
      id: event.id,
      timestamp: event.timestamp,
      eventType: event.eventType,
      actor: event.actor,
      traceId: event.traceId || '',
      metadata: JSON.stringify(event.metadata, Object.keys(event.metadata).sort()),
      prevHash: event.prevHash,
    };
    const data = JSON.stringify(canonical);
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  public log(
    eventType: AuditEventType,
    actor: string,
    metadata: Record<string, any> = {},
    traceId?: string
  ): AuditEvent {
    const eventWithoutHash: Omit<AuditEvent, 'hash'> = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      eventType,
      actor,
      traceId,
      metadata,
      prevHash: this.lastHash,
    };

    const hash = this.generateHash(eventWithoutHash);
    const event: AuditEvent = { ...eventWithoutHash, hash };

    // Append to log file (JSONL format - one JSON object per line)
    const logLine = JSON.stringify(event) + '\n';
    fs.appendFileSync(this.currentFile, logLine, { flag: 'a' });

    // Update state
    this.lastHash = hash;
    this.eventCount++;

    // Check if file rotation needed
    this.checkRotation();

    return event;
  }

  private checkRotation(): void {
    const stats = fs.statSync(this.currentFile);
    const fileSizeMb = stats.size / (1024 * 1024);

    if (fileSizeMb > this.config.maxFileSizeMb) {
      // Rotate to new file with timestamp
      const timestamp = Date.now();
      const today = new Date().toISOString().split('T')[0];
      const newFile = path.join(this.config.logDir, `audit_${today}_${timestamp}.jsonl`);

      this.currentFile = newFile;
      fs.writeFileSync(newFile, '', { flag: 'a' });
    }
  }

  public query(options: {
    startTime?: number;
    endTime?: number;
    eventTypes?: AuditEventType[];
    actor?: string;
    traceId?: string;
    limit?: number;
  }): AuditEvent[] {
    const results: AuditEvent[] = [];

    // Read all log files in directory
    const files = fs
      .readdirSync(this.config.logDir)
      .filter((f) => f.startsWith('audit_') && f.endsWith('.jsonl'))
      .sort();

    for (const file of files) {
      const filePath = path.join(this.config.logDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.trim().split('\n').filter((l) => l);

      for (const line of lines) {
        try {
          const event: AuditEvent = JSON.parse(line);

          // Apply filters
          if (options.startTime && event.timestamp < options.startTime) continue;
          if (options.endTime && event.timestamp > options.endTime) continue;
          if (options.eventTypes && !options.eventTypes.includes(event.eventType)) continue;
          if (options.actor && event.actor !== options.actor) continue;
          if (options.traceId && event.traceId !== options.traceId) continue;

          results.push(event);

          if (options.limit && results.length >= options.limit) {
            return results;
          }
        } catch (error) {
          // Skip malformed lines
        }
      }
    }

    return results;
  }

  public verifyIntegrity(events: AuditEvent[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (let i = 0; i < events.length; i++) {
      const event = events[i];

      // Verify hash chain
      if (i > 0) {
        const prevEvent = events[i - 1];
        if (event.prevHash !== prevEvent.hash) {
          errors.push(`Event ${event.id} prevHash mismatch (expected ${prevEvent.hash}, got ${event.prevHash})`);
        }
      }

      // Verify event hash
      const { hash, ...eventWithoutHash } = event;
      const calculatedHash = this.generateHash(eventWithoutHash);
      if (calculatedHash !== hash) {
        errors.push(`Event ${event.id} hash mismatch (expected ${calculatedHash}, got ${hash})`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  public getStats(): {
    totalEvents: number;
    oldestEvent?: Date;
    newestEvent?: Date;
    fileCount: number;
  } {
    let totalEvents = 0;
    let oldestTimestamp: number | undefined;
    let newestTimestamp: number | undefined;

    const files = fs
      .readdirSync(this.config.logDir)
      .filter((f) => f.startsWith('audit_') && f.endsWith('.jsonl'));

    for (const file of files) {
      const filePath = path.join(this.config.logDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.trim().split('\n').filter((l) => l);

      totalEvents += lines.length;

      if (lines.length > 0) {
        try {
          const firstEvent: AuditEvent = JSON.parse(lines[0]);
          const lastEvent: AuditEvent = JSON.parse(lines[lines.length - 1]);

          if (!oldestTimestamp || firstEvent.timestamp < oldestTimestamp) {
            oldestTimestamp = firstEvent.timestamp;
          }
          if (!newestTimestamp || lastEvent.timestamp > newestTimestamp) {
            newestTimestamp = lastEvent.timestamp;
          }
        } catch (error) {
          // Skip
        }
      }
    }

    return {
      totalEvents,
      oldestEvent: oldestTimestamp ? new Date(oldestTimestamp) : undefined,
      newestEvent: newestTimestamp ? new Date(newestTimestamp) : undefined,
      fileCount: files.length,
    };
  }
}

// Singleton instance for global use
let globalAuditLog: AuditLog | null = null;

export function getAuditLog(config?: Partial<AuditLogConfig>): AuditLog {
  if (!globalAuditLog) {
    globalAuditLog = new AuditLog(config);
  }
  return globalAuditLog;
}
