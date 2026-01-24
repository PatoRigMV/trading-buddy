/**
 * Test script to verify market hours and holiday logic
 */

import { MarketHours } from '../engine/marketHours';
import { MarketHolidays } from '../engine/marketHolidays';

console.log('🧪 Testing Market Hours Logic\n');
console.log('=' .repeat(50));

// Test current market status
const session = MarketHours.getCurrentSession();
console.log('\n📅 Current Date/Time:', new Date().toString());
console.log('🌐 Timezone:', Intl.DateTimeFormat().resolvedOptions().timeZone);

console.log('\n📊 Market Status:');
console.log('  Status:', session.status);
console.log('  Is Open:', session.isOpen);
console.log('  Message:', session.message);
console.log('  Next Open:', session.nextOpen.toString());
console.log('  Next Close:', session.nextClose.toString());
console.log('  Time Until Next:', session.timeUntilNext);

// Test holiday detection
console.log('\n🏛️ Holiday Checks:');
const testDates = [
  new Date('2025-01-01'), // New Year's Day
  new Date('2025-07-03'), // Day before July 4th (early close)
  new Date('2025-07-04'), // July 4th
  new Date('2025-09-15'), // Regular Monday
  new Date('2025-11-27'), // Thanksgiving
  new Date('2025-11-28'), // Day after Thanksgiving (early close)
  new Date('2025-12-24'), // Christmas Eve (early close)
  new Date('2025-12-25'), // Christmas
];

testDates.forEach(date => {
  const holiday = MarketHolidays.isMarketHoliday(date);
  const dateStr = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  if (holiday) {
    console.log(`  ${dateStr}: ${holiday.name} - ${holiday.marketClosed ? 'CLOSED' : `Early close at ${holiday.earlyClose} ET`}`);
  } else {
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      console.log(`  ${dateStr}: Weekend - CLOSED`);
    } else {
      console.log(`  ${dateStr}: Regular trading day`);
    }
  }
});

// Test different times of day
console.log('\n⏰ Market Hours by Time:');
const testTimes = [
  { hour: 3, minute: 30, desc: '3:30 AM ET - Before pre-market' },
  { hour: 4, minute: 30, desc: '4:30 AM ET - Pre-market' },
  { hour: 9, minute: 0, desc: '9:00 AM ET - Still pre-market' },
  { hour: 9, minute: 30, desc: '9:30 AM ET - Market open' },
  { hour: 12, minute: 0, desc: '12:00 PM ET - Midday trading' },
  { hour: 15, minute: 45, desc: '3:45 PM ET - Near close' },
  { hour: 16, minute: 0, desc: '4:00 PM ET - Market close' },
  { hour: 16, minute: 30, desc: '4:30 PM ET - After-hours' },
  { hour: 20, minute: 0, desc: '8:00 PM ET - After-hours end' },
  { hour: 22, minute: 0, desc: '10:00 PM ET - Overnight' },
];

// Create a test date (Monday)
const monday = new Date('2025-09-15T12:00:00-04:00'); // Monday in ET

testTimes.forEach(time => {
  const testDate = new Date(monday);
  testDate.setHours(time.hour, time.minute, 0, 0);

  // For this test, we'll just show what the status would be at that time
  // (Note: This is a simplified test - actual time override would require more complex mocking)

  console.log(`  ${time.desc}`);
  console.log(`    Expected market state at this time on a regular Monday`);
});

console.log('\n✅ Market hours logic test complete!');
console.log('=' .repeat(50));
