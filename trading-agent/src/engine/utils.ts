export function clamp(x: number, min: number, max: number): number {
  return Math.min(Math.max(x, min), max);
}

export function sma(values: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = period - 1; i < values.length; i++) {
    const sum = values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    result.push(sum / period);
  }
  return result;
}

export function ema(values: number[], period: number): number[] {
  const result: number[] = [];
  const alpha = 2 / (period + 1);

  if (values.length === 0) return result;

  result[0] = values[0];
  for (let i = 1; i < values.length; i++) {
    result[i] = alpha * values[i] + (1 - alpha) * result[i - 1];
  }

  return result;
}

export function atr(high: number[], low: number[], close: number[], period: number): number[] {
  const trueRanges: number[] = [];

  for (let i = 1; i < high.length; i++) {
    const tr1 = high[i] - low[i];
    const tr2 = Math.abs(high[i] - close[i - 1]);
    const tr3 = Math.abs(low[i] - close[i - 1]);
    trueRanges.push(Math.max(tr1, tr2, tr3));
  }

  return sma(trueRanges, period);
}
