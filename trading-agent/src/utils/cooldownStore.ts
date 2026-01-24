// cooldownStore.ts
// Symbol cooldown store with Redis or Postgres backends.
// Author: ChatGPT (GPT-5 Thinking)

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface CooldownStore {
  setLastExit(symbol: string, unixMs: number): Promise<void>;
  inCooldown(symbol: string, nowMs: number, cooldownMs: number): Promise<boolean>;
  getLastExit(symbol: string): Promise<number | null>;
}

export class MemoryCooldownStore implements CooldownStore {
  private map = new Map<string, number>();
  async setLastExit(symbol: string, unixMs: number) { this.map.set(symbol, unixMs); }
  async inCooldown(symbol: string, nowMs: number, cooldownMs: number) {
    const t = this.map.get(symbol); return t ? (nowMs - t) < cooldownMs : false;
  }
  async getLastExit(symbol: string) { return this.map.get(symbol) ?? null; }
}

export class RedisCooldownStore implements CooldownStore {
  private redis: any;
  private keyPrefix: string;
  constructor(redisClient: any, keyPrefix = 'cooldown:') {
    this.redis = redisClient;
    this.keyPrefix = keyPrefix;
  }
  private key(symbol: string) { return `${this.keyPrefix}${symbol}`; }
  async setLastExit(symbol: string, unixMs: number) {
    await this.redis.set(this.key(symbol), String(unixMs));
  }
  async inCooldown(symbol: string, nowMs: number, cooldownMs: number) {
    const t = await this.getLastExit(symbol);
    return t ? (nowMs - t) < cooldownMs : false;
  }
  async getLastExit(symbol: string) {
    const v = await this.redis.get(this.key(symbol));
    return v ? Number(v) : null;
  }
}

export class PostgresCooldownStore implements CooldownStore {
  private pool: any;
  private table: string;
  constructor(pgPool: any, table = 'symbol_cooldowns') {
    this.pool = pgPool;
    this.table = table;
  }
  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${this.table}(
        symbol text PRIMARY KEY,
        last_exit_ms bigint NOT NULL
      )
    `);
  }
  async setLastExit(symbol: string, unixMs: number) {
    await this.pool.query(
      `INSERT INTO ${this.table}(symbol, last_exit_ms)
       VALUES ($1,$2)
       ON CONFLICT (symbol) DO UPDATE SET last_exit_ms = EXCLUDED.last_exit_ms`,
      [symbol, unixMs]
    );
  }
  async getLastExit(symbol: string) {
    const { rows } = await this.pool.query(`SELECT last_exit_ms FROM ${this.table} WHERE symbol=$1`, [symbol]);
    if (!rows.length) return null;
    return Number(rows[0].last_exit_ms);
  }
  async inCooldown(symbol: string, nowMs: number, cooldownMs: number) {
    const t = await this.getLastExit(symbol);
    return t ? (nowMs - t) < cooldownMs : false;
  }
}
