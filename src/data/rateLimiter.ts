export class LeakyBucket {
  private cap: number;
  private ratePerSec: number;
  private tokens: number;
  private last: number;

  constructor(cap: number, ratePerSec: number) {
    this.cap = cap;
    this.ratePerSec = ratePerSec;
    this.tokens = cap;
    this.last = Date.now();
  }

  tryRemove(cost = 1) {
    const now = Date.now();
    const dt = (now - this.last) / 1000;
    this.tokens = Math.min(this.cap, this.tokens + dt * this.ratePerSec);
    this.last = now;

    if (this.tokens >= cost) {
      this.tokens -= cost;
      return true;
    }
    return false;
  }

  getStatus() {
    return {
      tokens: this.tokens,
      capacity: this.cap,
      rate: this.ratePerSec,
      lastUpdate: this.last
    };
  }
}

export interface RateLimitConfig {
  requestsPerMinute: number;
  burstCapacity: number;
  timeout_ms: number;
  max_retries: number;
}

export class PerHostRateLimiter {
  private buckets = new Map<string, LeakyBucket>();
  private config = new Map<string, RateLimitConfig>();

  constructor(hostConfigs: Record<string, RateLimitConfig>) {
    for (const [host, config] of Object.entries(hostConfigs)) {
      this.config.set(host, config);
      this.buckets.set(host, new LeakyBucket(
        config.burstCapacity,
        config.requestsPerMinute / 60
      ));
    }
  }

  async waitForCapacity(host: string): Promise<boolean> {
    const bucket = this.buckets.get(host);
    const config = this.config.get(host);

    if (!bucket || !config) {
      console.warn(`No rate limit config for host: ${host}`);
      return true; // Allow if unconfigured
    }

    const maxWaitMs = 5000; // Maximum wait time
    const startTime = Date.now();

    while (!bucket.tryRemove(1)) {
      const elapsed = Date.now() - startTime;
      if (elapsed > maxWaitMs) {
        return false; // Timeout waiting for capacity
      }

      // Wait for the next token to be available
      const waitTime = Math.min(1000 / (config.requestsPerMinute / 60), 100);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    return true;
  }

  getHostStatus(host: string) {
    const bucket = this.buckets.get(host);
    const config = this.config.get(host);

    return {
      host,
      bucket: bucket?.getStatus() || null,
      config: config || null,
      configured: !!bucket && !!config
    };
  }

  getAllHostStatus() {
    const status: Record<string, any> = {};
    for (const host of this.buckets.keys()) {
      status[host] = this.getHostStatus(host);
    }
    return status;
  }
}
