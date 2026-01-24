export class CircuitBreaker {
  state: "closed" | "open" | "half" = "closed";
  private failures = 0;
  private lastOpen = 0;
  private successCount = 0; // Track successes in half-open state

  constructor(private failLimit = 5, private coolMs = 15000, private halfOpenSuccess = 3) {}

  success() {
    if (this.state === "half") {
      this.successCount++;
      if (this.successCount >= this.halfOpenSuccess) {
        this.state = "closed";
        this.failures = 0;
        this.successCount = 0;
      }
    } else {
      this.failures = 0;
    }
  }

  fail() {
    this.failures++;
    this.successCount = 0; // Reset success count on failure

    if (this.failures >= this.failLimit) {
      this.state = "open";
      this.lastOpen = Date.now();
    }
  }

  canPass() {
    if (this.state === "open") {
      if ((Date.now() - this.lastOpen) > this.coolMs) {
        this.state = "half";
        this.successCount = 0;
        return true;
      }
      return false;
    }
    return true;
  }

  getStatus() {
    return {
      state: this.state,
      failures: this.failures,
      successCount: this.successCount,
      lastOpen: this.lastOpen,
      cooldownRemaining: this.state === "open" ? Math.max(0, this.coolMs - (Date.now() - this.lastOpen)) : 0
    };
  }
}

export class PerHostCircuitBreaker {
  private breakers = new Map<string, CircuitBreaker>();
  private config: { failLimit: number; coolMs: number; halfOpenSuccess: number };

  constructor(config = { failLimit: 5, coolMs: 15000, halfOpenSuccess: 3 }) {
    this.config = config;
  }

  private getBreaker(host: string): CircuitBreaker {
    if (!this.breakers.has(host)) {
      this.breakers.set(host, new CircuitBreaker(
        this.config.failLimit,
        this.config.coolMs,
        this.config.halfOpenSuccess
      ));
    }
    return this.breakers.get(host)!;
  }

  canPass(host: string): boolean {
    return this.getBreaker(host).canPass();
  }

  recordSuccess(host: string) {
    this.getBreaker(host).success();
  }

  recordFailure(host: string) {
    this.getBreaker(host).fail();
  }

  getHostStatus(host: string) {
    const breaker = this.breakers.get(host);
    return {
      host,
      ...breaker?.getStatus() || { state: "closed", failures: 0, successCount: 0, lastOpen: 0, cooldownRemaining: 0 },
      configured: !!breaker
    };
  }

  getAllHostStatus() {
    const status: Record<string, any> = {};
    for (const host of this.breakers.keys()) {
      status[host] = this.getHostStatus(host);
    }
    return status;
  }
}
