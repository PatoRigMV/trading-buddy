import { describe, it, expect, vi, beforeEach } from "vitest";
import { CalendarService, PolygonCalendar, NasdaqCalendar } from "../src/execution/calendars";
const POLY_JSON = { market: { status: "open" } };
global.fetch = vi.fn(async () => ({ ok: true, json: async () => POLY_JSON }));
describe('calendars', () => {
    beforeEach(() => fetch.mockClear());
    it('falls back when polygon fails', async () => {
        fetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
        const svc = new CalendarService(new PolygonCalendar('KEY'), new NasdaqCalendar());
        const st = await svc.sessionTimes(new Date());
        expect(st).toBeTruthy();
    });
    it('detects auction windows roughly', async () => {
        const svc = new CalendarService(new PolygonCalendar('KEY'));
        const am = new Date('2025-09-06T13:35:00.000Z'); // not necessarily ET; just smoke test
        const openAuction = await svc.isAuctionWindow(am, 'open');
        expect(typeof openAuction).toBe('boolean');
    });
});
