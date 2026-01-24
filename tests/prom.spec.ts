import { describe, it, expect } from 'vitest';
import { promText } from '../src/obs/prometheus';

describe('prometheus text', ()=>{
  it('renders valid text', ()=>{ const t = promText(); expect(t).toContain('e2e_latency_ms'); expect(t).toContain('decision_latency_ms'); });
});
