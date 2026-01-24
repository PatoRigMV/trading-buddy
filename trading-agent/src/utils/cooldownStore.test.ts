// cooldownStore.test.ts
import { describe, test, expect, beforeEach } from 'vitest';
import { MemoryCooldownStore, CooldownStore } from './cooldownStore';

describe('MemoryCooldownStore', () => {
  let store: CooldownStore;

  beforeEach(() => {
    store = new MemoryCooldownStore();
  });

  test('setLastExit and getLastExit work correctly', async () => {
    const symbol = 'AAPL';
    const timestamp = Date.now();

    await store.setLastExit(symbol, timestamp);
    const retrieved = await store.getLastExit(symbol);

    expect(retrieved).toBe(timestamp);
  });

  test('getLastExit returns null for non-existent symbol', async () => {
    const retrieved = await store.getLastExit('NONEXISTENT');

    expect(retrieved).toBeNull();
  });

  test('inCooldown returns false when no previous exit', async () => {
    const nowMs = Date.now();
    const cooldownMs = 5 * 60 * 1000; // 5 minutes

    const inCooldown = await store.inCooldown('AAPL', nowMs, cooldownMs);

    expect(inCooldown).toBe(false);
  });

  test('inCooldown returns true when within cooldown period', async () => {
    const symbol = 'AAPL';
    const exitTime = Date.now();
    const nowMs = exitTime + 2 * 60 * 1000; // 2 minutes later
    const cooldownMs = 5 * 60 * 1000; // 5 minute cooldown

    await store.setLastExit(symbol, exitTime);
    const inCooldown = await store.inCooldown(symbol, nowMs, cooldownMs);

    expect(inCooldown).toBe(true);
  });

  test('inCooldown returns false when cooldown period has expired', async () => {
    const symbol = 'AAPL';
    const exitTime = Date.now();
    const nowMs = exitTime + 10 * 60 * 1000; // 10 minutes later
    const cooldownMs = 5 * 60 * 1000; // 5 minute cooldown

    await store.setLastExit(symbol, exitTime);
    const inCooldown = await store.inCooldown(symbol, nowMs, cooldownMs);

    expect(inCooldown).toBe(false);
  });

  test('different symbols have independent cooldowns', async () => {
    const symbolA = 'AAPL';
    const symbolB = 'GOOGL';
    const exitTime = Date.now();
    const nowMs = exitTime + 2 * 60 * 1000; // 2 minutes later
    const cooldownMs = 5 * 60 * 1000; // 5 minute cooldown

    await store.setLastExit(symbolA, exitTime);

    const inCooldownA = await store.inCooldown(symbolA, nowMs, cooldownMs);
    const inCooldownB = await store.inCooldown(symbolB, nowMs, cooldownMs);

    expect(inCooldownA).toBe(true);
    expect(inCooldownB).toBe(false);
  });

  test('updating exit time overwrites previous value', async () => {
    const symbol = 'AAPL';
    const firstExit = Date.now();
    const secondExit = firstExit + 60 * 1000; // 1 minute later

    await store.setLastExit(symbol, firstExit);
    await store.setLastExit(symbol, secondExit);

    const retrieved = await store.getLastExit(symbol);

    expect(retrieved).toBe(secondExit);
  });
});
