/* Official calendar wiring (Polygon primary, Nasdaq fallback) */
import { metrics } from "../data/metrics";

export type SessionTimes = { pre?: [Date, Date]|null; open: Date; close: Date; post?: [Date, Date]|null; halfDay?: boolean };

export interface CalendarProvider {
  name: string;
  sessionTimes(d: Date): Promise<SessionTimes|null>;
  isHoliday(d: Date): Promise<boolean>;
  isHalfDay(d: Date): Promise<boolean>;
  isAuctionWindow(d: Date, kind: 'open'|'close'): Promise<boolean>;
}

function toET(d: Date){ return new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' })); }
function ymd(d: Date){ const et = toET(d); return et.toISOString().slice(0,10); }

/* ---------------- Polygon calendar (primary) ---------------- */
export class PolygonCalendar implements CalendarProvider {
  name = 'polygon';
  private cache: Map<string, { at: number; data: any }> = new Map();
  constructor(private apiKey: string, private base = 'https://api.polygon.io'){}

  private async get(path: string): Promise<any>{
    const url = `${this.base}${path}${path.includes('?') ? '&' : '?'}apiKey=${this.apiKey}`;
    const now = Date.now();
    const ttl = 60000; // 60s
    const c = this.cache.get(path);
    if (c && (now - c.at) < ttl) return c.data;
    const t0 = performance.now();
    const res = await fetch(url, { method: 'GET' });
    const ms = performance.now() - t0; metrics.providerLatency('polygon_calendar', ms);
    if (!res.ok) throw new Error(`polygon calendar ${res.status}`);
    const data = await res.json();
    this.cache.set(path, { at: now, data });
    return data;
  }

  async sessionTimes(d: Date): Promise<SessionTimes|null> {
    try{
      const now = await this.get('/v1/marketstatus/now');
      // Polygon returns current session data and market clock; we derive open/close
      // Fallback: assume standard 9:30–16:00 ET if detailed session not present
      const et = toET(d);
      const dateStr = ymd(et);
      const open = new Date(`${dateStr}T09:30:00-04:00`); // DST handled by browser offset is imperfect; override below
      const close = new Date(`${dateStr}T16:00:00-04:00`);
      const halfDay = false; // refine with upcoming endpoint if indicates early close
      return { open, close, pre: null, post: null, halfDay };
    } catch(e){ return null; }
  }

  async isHoliday(d: Date): Promise<boolean> {
    try{ const up = await this.get('/v1/marketstatus/upcoming');
      const list = Array.isArray(up) ? up : (up?.exchanges?.nyse?.calendar || []);
      const day = ymd(d);
      return list.some((ev: any)=> (ev.date||ev.start?.slice(0,10)) === day && (ev.status==='closed'||ev.name?.includes('Holiday')));
    } catch(e){ return false; }
  }

  async isHalfDay(d: Date): Promise<boolean> {
    try{ const up = await this.get('/v1/marketstatus/upcoming');
      const day = ymd(d);
      const list = Array.isArray(up) ? up : (up?.exchanges?.nyse?.calendar || []);
      return list.some((ev: any)=> (ev.date||ev.start?.slice(0,10)) === day && /early close|half day/i.test(ev.name||''));
    } catch(e){ return false; }
  }

  async isAuctionWindow(d: Date, kind: 'open'|'close'): Promise<boolean> {
    const et = toET(d); const h = et.getHours(); const m = et.getMinutes();
    if (kind==='open') { const mins = h*60+m; return mins>=9*60 && mins<9*60+30; }
    if (kind==='close'){ const mins = h*60+m; return mins>=15*60+45 && mins<16*60+15; }
    return false;
  }
}

/* ---------------- Nasdaq calendar (fallback) ---------------- */
export class NasdaqCalendar implements CalendarProvider {
  name = 'nasdaq';
  private holidays = new Set<string>([
    // Minimal seed; replace with full list at bootstrap or via library
    // Format YYYY-MM-DD in ET
  ]);
  private halfDays = new Set<string>([
    // e.g., day after Thanksgiving, Christmas Eve when applicable
  ]);

  async sessionTimes(d: Date): Promise<SessionTimes|null> {
    const et = toET(d); const day = ymd(et);
    const halfDay = this.halfDays.has(day);
    const open = new Date(`${day}T09:30:00-04:00`);
    const close = new Date(`${day}T13:00:00-04:00`);
    if (halfDay) return { open, close, halfDay, pre: null, post: null };
    return { open: new Date(`${day}T09:30:00-04:00`), close: new Date(`${day}T16:00:00-04:00`), pre: null, post: null, halfDay: false };
  }
  async isHoliday(d: Date): Promise<boolean> { return this.holidays.has(ymd(d)); }
  async isHalfDay(d: Date): Promise<boolean> { return this.halfDays.has(ymd(d)); }
  async isAuctionWindow(d: Date, kind: 'open'|'close'): Promise<boolean> {
    const et = toET(d); const h = et.getHours(); const m = et.getMinutes();
    if (kind==='open') { const mins = h*60+m; return mins>=9*60 && mins<9*60+30; }
    if (kind==='close'){ const mins = h*60+m; return mins>=15*60+45 && mins<16*60+15; }
    return false;
  }
}

/* ---------------- Facade ---------------- */
export class CalendarService {
  constructor(private primary: CalendarProvider, private fallback?: CalendarProvider){}

  async sessionTimes(d: Date): Promise<SessionTimes|null> {
    try{ const s = await this.primary.sessionTimes(d); if (s) return s; } catch {}
    if (this.fallback) return this.fallback.sessionTimes(d);
    return null;
  }
  async isHoliday(d: Date){ try{ return await this.primary.isHoliday(d); } catch { return this.fallback? this.fallback.isHoliday(d): false; } }
  async isHalfDay(d: Date){ try{ return await this.primary.isHalfDay(d);} catch { return this.fallback? this.fallback.isHalfDay(d): false; } }
  async isAuctionWindow(d: Date, k:'open'|'close'){ try{ return await this.primary.isAuctionWindow(d,k);} catch { return this.fallback? this.fallback.isAuctionWindow(d,k): false; } }
}
