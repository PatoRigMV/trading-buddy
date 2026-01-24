/**
 * NYSE Market Holidays and Special Hours
 * Maintains list of market holidays and early close days
 */

export interface MarketHoliday {
  date: string; // YYYY-MM-DD format
  name: string;
  marketClosed: boolean;
  earlyClose?: string; // Time market closes early (e.g., "13:00")
}

export class MarketHolidays {
  // 2025 NYSE Holiday Schedule
  private static holidays2025: MarketHoliday[] = [
    { date: '2025-01-01', name: "New Year's Day", marketClosed: true },
    { date: '2025-01-20', name: 'Martin Luther King Jr. Day', marketClosed: true },
    { date: '2025-02-17', name: "Presidents' Day", marketClosed: true },
    { date: '2025-04-18', name: 'Good Friday', marketClosed: true },
    { date: '2025-05-26', name: 'Memorial Day', marketClosed: true },
    { date: '2025-06-19', name: 'Juneteenth', marketClosed: true },
    { date: '2025-07-03', name: 'Independence Day (Early Close)', marketClosed: false, earlyClose: '13:00' },
    { date: '2025-07-04', name: 'Independence Day', marketClosed: true },
    { date: '2025-09-01', name: 'Labor Day', marketClosed: true },
    { date: '2025-11-27', name: 'Thanksgiving Day', marketClosed: true },
    { date: '2025-11-28', name: 'Day After Thanksgiving (Early Close)', marketClosed: false, earlyClose: '13:00' },
    { date: '2025-12-24', name: 'Christmas Eve (Early Close)', marketClosed: false, earlyClose: '13:00' },
    { date: '2025-12-25', name: 'Christmas Day', marketClosed: true }
  ];

  // 2026 NYSE Holiday Schedule (add more years as needed)
  private static holidays2026: MarketHoliday[] = [
    { date: '2026-01-01', name: "New Year's Day", marketClosed: true },
    { date: '2026-01-19', name: 'Martin Luther King Jr. Day', marketClosed: true },
    { date: '2026-02-16', name: "Presidents' Day", marketClosed: true },
    { date: '2026-04-03', name: 'Good Friday', marketClosed: true },
    { date: '2026-05-25', name: 'Memorial Day', marketClosed: true },
    { date: '2026-06-19', name: 'Juneteenth', marketClosed: true },
    { date: '2026-07-03', name: 'Independence Day (Observed)', marketClosed: true },
    { date: '2026-09-07', name: 'Labor Day', marketClosed: true },
    { date: '2026-11-26', name: 'Thanksgiving Day', marketClosed: true },
    { date: '2026-11-27', name: 'Day After Thanksgiving (Early Close)', marketClosed: false, earlyClose: '13:00' },
    { date: '2026-12-25', name: 'Christmas Day', marketClosed: true }
  ];

  /**
   * Get all holidays for a specific year
   */
  static getHolidaysForYear(year: number): MarketHoliday[] {
    switch (year) {
      case 2025:
        return this.holidays2025;
      case 2026:
        return this.holidays2026;
      default:
        console.warn(`No holiday data for year ${year}, using empty list`);
        return [];
    }
  }

  /**
   * Check if a specific date is a market holiday
   */
  static isMarketHoliday(date: Date): MarketHoliday | null {
    const year = date.getFullYear();
    const holidays = this.getHolidaysForYear(year);

    // Format date as YYYY-MM-DD for comparison
    const dateStr = this.formatDate(date);

    const holiday = holidays.find(h => h.date === dateStr);
    return holiday || null;
  }

  /**
   * Check if market is closed on a specific date
   */
  static isMarketClosed(date: Date): boolean {
    const holiday = this.isMarketHoliday(date);
    return holiday ? holiday.marketClosed : false;
  }

  /**
   * Get early close time if applicable
   */
  static getEarlyCloseTime(date: Date): string | null {
    const holiday = this.isMarketHoliday(date);
    return holiday?.earlyClose || null;
  }

  /**
   * Format date as YYYY-MM-DD
   */
  private static formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Get next market open date (skipping weekends and holidays)
   */
  static getNextMarketOpenDate(fromDate: Date): Date {
    const nextDate = new Date(fromDate);
    nextDate.setDate(nextDate.getDate() + 1);

    // Keep advancing until we find a market open day
    while (this.isWeekend(nextDate) || this.isMarketClosed(nextDate)) {
      nextDate.setDate(nextDate.getDate() + 1);
    }

    return nextDate;
  }

  /**
   * Check if date is a weekend
   */
  private static isWeekend(date: Date): boolean {
    const day = date.getDay();
    return day === 0 || day === 6; // Sunday = 0, Saturday = 6
  }

  /**
   * Get human-readable holiday status
   */
  static getHolidayStatus(date: Date): string {
    const holiday = this.isMarketHoliday(date);
    if (!holiday) {
      return '';
    }

    if (holiday.marketClosed) {
      return `🏛️ Market closed for ${holiday.name}`;
    } else if (holiday.earlyClose) {
      return `⏰ Early close at ${holiday.earlyClose} ET for ${holiday.name}`;
    }

    return '';
  }
}
