import { CalendarService } from "./calendars";

export async function isBlockedByAuctions(cal: CalendarService, now = new Date(), allowAuctions = false) {
  if (allowAuctions) return { blocked:false, reason:null };
  const inOpen = await cal.isAuctionWindow(now, 'open');
  const inClose = await cal.isAuctionWindow(now, 'close');
  if (inOpen) return { blocked:true, reason:'open_auction' };
  if (inClose) return { blocked:true, reason:'close_auction' };
  return { blocked:false, reason:null };
}
