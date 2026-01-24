import { MarketHolidays } from './marketHolidays';

export interface MarketSession {
  isOpen: boolean;
  status: 'pre-market' | 'market-hours' | 'after-hours' | 'closed';
  nextOpen: Date;
  nextClose: Date;
  timeUntilNext: string;
  message: string;
}

export class MarketHours {
  /**
   * Get current market session with proper timezone and holiday handling
   */
  static getCurrentSession(): MarketSession {
    const now = new Date();

    // Get current time in ET (Eastern Time - handles EDT/EST automatically)
    const etNow = this.getETTime(now);

    // Check for holidays first
    const holidayStatus = MarketHolidays.getHolidayStatus(etNow);
    if (MarketHolidays.isMarketClosed(etNow)) {
      const nextOpen = this.getNextMarketOpen(etNow);
      return {
        isOpen: false,
        status: 'closed',
        nextOpen,
        nextClose: this.getMarketClose(nextOpen),
        timeUntilNext: this.getTimeUntil(nextOpen),
        message: holidayStatus
      };
    }

    // Get current time components
    const currentHour = etNow.getHours();
    const currentMinute = etNow.getMinutes();
    const currentTime = currentHour * 60 + currentMinute;
    const dayOfWeek = etNow.getDay(); // 0 = Sunday, 6 = Saturday

    // Check for early close
    const earlyCloseTime = MarketHolidays.getEarlyCloseTime(etNow);
    const marketCloseTime = earlyCloseTime ? this.parseTime(earlyCloseTime) : 16 * 60; // 4:00 PM or early close

    // Market times in ET (minutes from midnight)
    const preMarketStart = 4 * 60; // 4:00 AM ET
    const marketOpen = 9 * 60 + 30; // 9:30 AM ET
    const afterHoursEnd = 20 * 60; // 8:00 PM ET

    // Check if it's weekend
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      const nextMonday = this.getNextMarketOpen(etNow);
      return {
        isOpen: false,
        status: 'closed',
        nextOpen: nextMonday,
        nextClose: this.getMarketClose(nextMonday),
        timeUntilNext: this.getTimeUntil(nextMonday),
        message: '📅 Markets closed for weekend - analyzing for next week'
      };
    }

    // Check market status during weekdays
    if (currentTime < preMarketStart) {
      // Before pre-market
      const nextOpen = this.getTodayAtET(preMarketStart);
      return {
        isOpen: false,
        status: 'closed',
        nextOpen,
        nextClose: this.getTodayAtET(marketCloseTime),
        timeUntilNext: this.getTimeUntil(nextOpen),
        message: '🌙 Markets closed - pre-market opens at 4:00 AM ET'
      };
    } else if (currentTime < marketOpen) {
      // Pre-market hours
      const nextOpen = this.getTodayAtET(marketOpen);
      return {
        isOpen: false,
        status: 'pre-market',
        nextOpen,
        nextClose: this.getTodayAtET(marketCloseTime),
        timeUntilNext: this.getTimeUntil(nextOpen),
        message: '🌅 Pre-market session - regular trading opens at 9:30 AM ET'
      };
    } else if (currentTime < marketCloseTime) {
      // Regular market hours
      const nextClose = this.getTodayAtET(marketCloseTime);
      const closeMessage = earlyCloseTime ?
        `🔔 Markets are OPEN - early close at ${earlyCloseTime} ET today` :
        '🔔 Markets are OPEN - active trading session';

      return {
        isOpen: true,
        status: 'market-hours',
        nextOpen: this.getNextMarketOpen(etNow),
        nextClose,
        timeUntilNext: this.getTimeUntil(nextClose),
        message: closeMessage
      };
    } else if (currentTime < afterHoursEnd) {
      // After-hours trading
      const nextOpen = this.getNextMarketOpen(etNow);
      return {
        isOpen: false,
        status: 'after-hours',
        nextOpen,
        nextClose: this.getMarketClose(nextOpen),
        timeUntilNext: this.getTimeUntil(nextOpen),
        message: '🌆 After-hours trading session - limited liquidity'
      };
    } else {
      // Late night/early morning
      const nextOpen = this.getNextMarketOpen(etNow);
      return {
        isOpen: false,
        status: 'closed',
        nextOpen,
        nextClose: this.getMarketClose(nextOpen),
        timeUntilNext: this.getTimeUntil(nextOpen),
        message: '🌙 Markets closed - analyzing overnight for pre-market'
      };
    }
  }

  /**
   * Convert any date to Eastern Time
   */
  private static getETTime(date: Date): Date {
    // Use Intl.DateTimeFormat to get proper ET time
    const etString = date.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    // Parse the ET string back to a Date object
    // Format: MM/DD/YYYY, HH:MM:SS
    const [datePart, timePart] = etString.split(', ');
    const [month, day, year] = datePart.split('/');
    const [hour, minute, second] = timePart.split(':');

    const etDate = new Date();
    etDate.setFullYear(parseInt(year), parseInt(month) - 1, parseInt(day));
    etDate.setHours(parseInt(hour), parseInt(minute), parseInt(second), 0);

    return etDate;
  }

  /**
   * Get a date object for today at specific ET time
   */
  private static getTodayAtET(minutes: number): Date {
    const now = new Date();
    const etNow = this.getETTime(now);

    const target = new Date(etNow);
    target.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);

    // If the target time has passed today, it's for tomorrow
    if (target < etNow) {
      target.setDate(target.getDate() + 1);
    }

    return target;
  }

  /**
   * Get next market open date/time
   */
  private static getNextMarketOpen(fromDate: Date): Date {
    const nextDate = MarketHolidays.getNextMarketOpenDate(fromDate);

    // Set to 9:30 AM ET
    nextDate.setHours(9, 30, 0, 0);

    // For pre-market, open at 4:00 AM ET
    const preMarketOpen = new Date(nextDate);
    preMarketOpen.setHours(4, 0, 0, 0);

    return preMarketOpen;
  }

  /**
   * Get market close time for a given date
   */
  private static getMarketClose(date: Date): Date {
    const closeDate = new Date(date);

    // Check for early close
    const earlyClose = MarketHolidays.getEarlyCloseTime(date);
    if (earlyClose) {
      const [hour, minute] = earlyClose.split(':');
      closeDate.setHours(parseInt(hour), parseInt(minute), 0, 0);
    } else {
      closeDate.setHours(16, 0, 0, 0); // 4:00 PM ET
    }

    return closeDate;
  }

  /**
   * Parse time string (HH:MM) to minutes from midnight
   */
  private static parseTime(timeStr: string): number {
    const [hour, minute] = timeStr.split(':').map(n => parseInt(n));
    return hour * 60 + minute;
  }

  /**
   * Get human-readable time until next event
   */
  private static getTimeUntil(targetDate: Date): string {
    const now = new Date();
    const diff = targetDate.getTime() - now.getTime();

    if (diff < 0) {
      return 'Now';
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days} day${days > 1 ? 's' : ''}`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  /**
   * Check if markets are currently open (considering holidays and special hours)
   */
  static isMarketOpen(): boolean {
    const session = this.getCurrentSession();
    return session.isOpen;
  }

  /**
   * Get market status message
   */
  static getMarketStatus(): string {
    const session = this.getCurrentSession();
    return session.message;
  }
}
