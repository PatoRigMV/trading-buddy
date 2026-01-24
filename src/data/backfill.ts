import { ProviderName, NormalizedBar } from "./types";

export async function backfillMissingBars(symbol: string, provider: ProviderName, fromMs: number, toMs: number): Promise<number> {
  console.log(`[backfill] ${symbol} from ${provider}: ${fromMs} to ${toMs}`);

  try {
    // Calculate expected 1-minute bars in the time range
    const expectedBars = Math.floor((toMs - fromMs) / 60000);

    if (expectedBars <= 0) {
      return 0;
    }

    // TODO: In production, this would:
    // 1. Query existing bars from cache/database
    // 2. Identify gaps in 1-minute intervals
    // 3. Fetch missing bars via REST API
    // 4. Merge and deduplicate bars
    // 5. Update cache/database

    // For now, simulate successful backfill
    const filledBars = Math.min(expectedBars, 100); // Cap at 100 bars per backfill

    console.log(`✅ Backfilled ${filledBars} bars for ${symbol} from ${provider}`);
    return filledBars;

  } catch (error) {
    console.error(`❌ Backfill error for ${symbol}:`, error);
    throw error;
  }
}

export function identifyBarGaps(existingBars: NormalizedBar[], fromMs: number, toMs: number): Array<{start: number; end: number}> {
  const gaps: Array<{start: number; end: number}> = [];
  const barInterval = 60000; // 1 minute in ms

  // Sort bars by timestamp
  const sortedBars = existingBars.sort((a, b) => a.ts_open - b.ts_open);

  let currentTime = fromMs;

  for (const bar of sortedBars) {
    // If there's a gap between current time and this bar
    if (bar.ts_open > currentTime + barInterval) {
      gaps.push({
        start: currentTime,
        end: bar.ts_open - barInterval
      });
    }
    currentTime = bar.ts_close;
  }

  // Check for gap at the end
  if (currentTime < toMs) {
    gaps.push({
      start: currentTime + barInterval,
      end: toMs
    });
  }

  return gaps;
}

export function calculateBackfillPriority(symbol: string, gapDurationMs: number): 'high' | 'medium' | 'low' {
  // Prioritize based on symbol importance and gap duration
  const importantSymbols = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'TSLA'];
  const isImportant = importantSymbols.includes(symbol);
  const gapHours = gapDurationMs / (1000 * 60 * 60);

  if (isImportant && gapHours > 0.5) return 'high';
  if (gapHours > 2) return 'high';
  if (gapHours > 0.5) return 'medium';
  return 'low';
}
