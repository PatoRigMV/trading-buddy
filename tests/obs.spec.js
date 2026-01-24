import { describe, it, expect } from 'vitest';
import { newSpan, endSpan, durationMs } from '../src/obs/e2e';
describe('tracing', () => { it('measures durations', () => { const s = newSpan('t'); const e = endSpan(s); expect(durationMs(e)).toBeGreaterThanOrEqual(0); }); });
