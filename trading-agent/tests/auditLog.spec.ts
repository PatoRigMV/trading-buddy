import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuditLog, type AuditEvent } from '../src/audit/auditLog';
import fs from 'fs';
import path from 'path';

const TEST_LOG_DIR = './test_audit_logs';

describe('Audit Log', () => {
    let auditLog: AuditLog;

    beforeEach(() => {
        // Clean up any existing test logs
        if (fs.existsSync(TEST_LOG_DIR)) {
            fs.rmSync(TEST_LOG_DIR, { recursive: true, force: true });
        }

        auditLog = new AuditLog({ logDir: TEST_LOG_DIR, maxFileSizeMb: 1 });
    });

    afterEach(() => {
        // Clean up test logs
        if (fs.existsSync(TEST_LOG_DIR)) {
            fs.rmSync(TEST_LOG_DIR, { recursive: true, force: true });
        }
    });

    describe('Event Logging', () => {
        it('creates audit log event with required fields', () => {
            const event = auditLog.log('AGENT_START', 'system', { version: '1.0.0' });

            expect(event.id).toBeDefined();
            expect(event.timestamp).toBeGreaterThan(0);
            expect(event.eventType).toBe('AGENT_START');
            expect(event.actor).toBe('system');
            expect(event.metadata).toEqual({ version: '1.0.0' });
            expect(event.prevHash).toBeDefined();
            expect(event.hash).toBeDefined();
        });

        it('includes trace ID when provided', () => {
            const traceId = 'trace-123';
            const event = auditLog.log('DECISION_MADE', 'system', {}, traceId);

            expect(event.traceId).toBe(traceId);
        });

        it('creates hash chain for sequential events', () => {
            const event1 = auditLog.log('AGENT_START', 'system');
            const event2 = auditLog.log('DECISION_MADE', 'system');
            const event3 = auditLog.log('ORDER_SUBMITTED', 'system');

            expect(event2.prevHash).toBe(event1.hash);
            expect(event3.prevHash).toBe(event2.hash);
        });

        it('persists events to disk', () => {
            auditLog.log('AGENT_START', 'system');
            auditLog.log('DECISION_MADE', 'system');

            const files = fs.readdirSync(TEST_LOG_DIR);
            expect(files.length).toBeGreaterThan(0);

            const logFile = path.join(TEST_LOG_DIR, files[0]);
            const content = fs.readFileSync(logFile, 'utf-8');
            const lines = content.trim().split('\n');

            expect(lines.length).toBe(2);
        });

        it('writes events in JSONL format', () => {
            auditLog.log('AGENT_START', 'system', { key: 'value' });

            const files = fs.readdirSync(TEST_LOG_DIR);
            const logFile = path.join(TEST_LOG_DIR, files[0]);
            const content = fs.readFileSync(logFile, 'utf-8');
            const lines = content.trim().split('\n');

            const event = JSON.parse(lines[0]);
            expect(event.metadata.key).toBe('value');
        });
    });

    describe('Event Query', () => {
        beforeEach(() => {
            // Create test events
            auditLog.log('AGENT_START', 'system', {}, 'trace-1');
            auditLog.log('DECISION_MADE', 'user-1', { symbol: 'AAPL' }, 'trace-2');
            auditLog.log('ORDER_SUBMITTED', 'user-1', { symbol: 'GOOGL' }, 'trace-2');
            auditLog.log('AGENT_STOP', 'system', {}, 'trace-3');
        });

        it('queries all events when no filters provided', () => {
            const results = auditLog.query({});
            expect(results.length).toBe(4);
        });

        it('filters by event type', () => {
            const results = auditLog.query({ eventTypes: ['DECISION_MADE', 'ORDER_SUBMITTED'] });
            expect(results.length).toBe(2);
            expect(results.every((e) => ['DECISION_MADE', 'ORDER_SUBMITTED'].includes(e.eventType))).toBe(true);
        });

        it('filters by actor', () => {
            const results = auditLog.query({ actor: 'user-1' });
            expect(results.length).toBe(2);
            expect(results.every((e) => e.actor === 'user-1')).toBe(true);
        });

        it('filters by trace ID', () => {
            const results = auditLog.query({ traceId: 'trace-2' });
            expect(results.length).toBe(2);
            expect(results.every((e) => e.traceId === 'trace-2')).toBe(true);
        });

        it('filters by time range', () => {
            const now = Date.now();
            const past = now - 1000;

            const results = auditLog.query({ startTime: past, endTime: now + 1000 });
            expect(results.length).toBe(4);
        });

        it('limits result count', () => {
            const results = auditLog.query({ limit: 2 });
            expect(results.length).toBe(2);
        });

        it('combines multiple filters', () => {
            const results = auditLog.query({
                actor: 'user-1',
                eventTypes: ['ORDER_SUBMITTED'],
                limit: 1,
            });

            expect(results.length).toBe(1);
            expect(results[0].eventType).toBe('ORDER_SUBMITTED');
            expect(results[0].actor).toBe('user-1');
        });
    });

    describe('Integrity Verification', () => {
        it('verifies integrity of valid event chain', () => {
            auditLog.log('AGENT_START', 'system');
            auditLog.log('DECISION_MADE', 'system');
            auditLog.log('AGENT_STOP', 'system');

            const events = auditLog.query({});
            const result = auditLog.verifyIntegrity(events);

            expect(result.valid).toBe(true);
            expect(result.errors.length).toBe(0);
        });

        it('detects tampered event hash', () => {
            auditLog.log('AGENT_START', 'system');
            auditLog.log('DECISION_MADE', 'system');

            const events = auditLog.query({});

            // Tamper with an event (change metadata but keep the original hash)
            events[1].metadata.tampered = true;
            // Don't recalculate hash - this creates a mismatch

            const result = auditLog.verifyIntegrity(events);

            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors.some(e => e.includes('hash mismatch'))).toBe(true);
        });

        it('detects broken hash chain', () => {
            auditLog.log('AGENT_START', 'system');
            auditLog.log('DECISION_MADE', 'system');
            auditLog.log('AGENT_STOP', 'system');

            const events = auditLog.query({});

            // Break the chain
            events[2].prevHash = 'invalid-hash';

            const result = auditLog.verifyIntegrity(events);

            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.errors[0]).toContain('prevHash mismatch');
        });
    });

    describe('Statistics', () => {
        it('returns correct stats for empty log', () => {
            const stats = auditLog.getStats();

            expect(stats.totalEvents).toBe(0);
            expect(stats.fileCount).toBeGreaterThan(0); // File exists but is empty
        });

        it('returns correct stats with events', () => {
            auditLog.log('AGENT_START', 'system');
            auditLog.log('DECISION_MADE', 'system');
            auditLog.log('AGENT_STOP', 'system');

            const stats = auditLog.getStats();

            expect(stats.totalEvents).toBe(3);
            expect(stats.oldestEvent).toBeDefined();
            expect(stats.newestEvent).toBeDefined();
            expect(stats.fileCount).toBeGreaterThan(0);
        });

        it('tracks events across log rotation', () => {
            // Create many events to trigger rotation (maxFileSizeMb = 1)
            for (let i = 0; i < 1000; i++) {
                auditLog.log('DECISION_MADE', 'system', { iteration: i });
            }

            const stats = auditLog.getStats();
            expect(stats.totalEvents).toBe(1000);
        });
    });

    describe('Log Persistence', () => {
        it('loads existing log file on initialization', () => {
            // Create initial events
            const log1 = new AuditLog({ logDir: TEST_LOG_DIR });
            log1.log('AGENT_START', 'system');
            log1.log('DECISION_MADE', 'system');

            // Create new instance (should load existing log)
            const log2 = new AuditLog({ logDir: TEST_LOG_DIR });
            const event3 = log2.log('AGENT_STOP', 'system');

            // Verify hash chain continuity
            const allEvents = log2.query({});
            expect(allEvents.length).toBe(3);

            const verification = log2.verifyIntegrity(allEvents);
            expect(verification.valid).toBe(true);
        });

        it('maintains hash chain across restarts', () => {
            // First session
            const log1 = new AuditLog({ logDir: TEST_LOG_DIR });
            const event1 = log1.log('AGENT_START', 'system');

            // Second session
            const log2 = new AuditLog({ logDir: TEST_LOG_DIR });
            const event2 = log2.log('AGENT_STOP', 'system');

            // Verify chain
            expect(event2.prevHash).toBe(event1.hash);
        });
    });

    describe('Event Types', () => {
        const eventTypes = [
            'AGENT_START',
            'AGENT_STOP',
            'EMERGENCY_STOP',
            'DECISION_MADE',
            'ORDER_SUBMITTED',
            'ORDER_FILLED',
            'ORDER_CANCELLED',
            'ORDER_REJECTED',
            'POSITION_ENTERED',
            'POSITION_EXITED',
            'RISK_LIMIT_BREACHED',
            'CONFIG_CHANGED',
            'MARKET_HOURS_CHANGE',
        ] as const;

        it('supports all defined event types', () => {
            eventTypes.forEach((type) => {
                const event = auditLog.log(type, 'system', {});
                expect(event.eventType).toBe(type);
            });

            const results = auditLog.query({});
            expect(results.length).toBe(eventTypes.length);
        });
    });
});
