import { PerHostRateLimiter, RateLimitConfig } from './rateLimiter';
import { PerHostCircuitBreaker } from './circuitBreaker';

export interface RapidAPIConfig {
  api_key: string;
  hosts: Record<string, RateLimitConfig>;
  circuit_breaker?: {
    failLimit: number;
    coolMs: number;
    halfOpenSuccess: number;
  };
}

export class RapidAPIClient {
  private rateLimiter: PerHostRateLimiter;
  private circuitBreaker: PerHostCircuitBreaker;
  private apiKey: string;

  constructor(config: RapidAPIConfig) {
    this.apiKey = config.api_key;
    this.rateLimiter = new PerHostRateLimiter(config.hosts);
    this.circuitBreaker = new PerHostCircuitBreaker(config.circuit_breaker);
  }

  async fetchWithRetry(url: string, options: RequestInit = {}, maxRetries = 2): Promise<Response> {
    const hostname = new URL(url).hostname;

    // Check circuit breaker
    if (!this.circuitBreaker.canPass(hostname)) {
      throw new Error(`Circuit breaker open for ${hostname}`);
    }

    // Wait for rate limit capacity
    const hasCapacity = await this.rateLimiter.waitForCapacity(hostname);
    if (!hasCapacity) {
      throw new Error(`Rate limit exceeded for ${hostname}`);
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          ...options,
          headers: {
            'X-RapidAPI-Key': this.apiKey,
            'X-RapidAPI-Host': hostname,
            'Content-Type': 'application/json',
            ...options.headers
          },
          signal: AbortSignal.timeout(5000) // 5 second timeout
        });

        if (response.ok) {
          this.circuitBreaker.recordSuccess(hostname);
          return response;
        }

        // Handle different HTTP errors
        if (response.status >= 500) {
          // Server errors - should trigger circuit breaker
          this.circuitBreaker.recordFailure(hostname);
          throw new Error(`Server error ${response.status}: ${response.statusText}`);
        } else if (response.status === 429) {
          // Rate limit hit - wait and retry
          const retryAfter = response.headers.get('Retry-After');
          const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 1000;
          await new Promise(resolve => setTimeout(resolve, Math.min(waitTime, 5000)));
          continue;
        } else if (response.status >= 400) {
          // Client errors - don't trigger circuit breaker, but don't retry
          throw new Error(`Client error ${response.status}: ${response.statusText}`);
        }

      } catch (error: any) {
        lastError = error;

        if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
          this.circuitBreaker.recordFailure(hostname);
        }

        // Add jitter to retry delay
        const jitter = Math.random() * 1000;
        const delay = Math.min(1000 * Math.pow(2, attempt) + jitter, 5000);

        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    this.circuitBreaker.recordFailure(hostname);
    throw lastError || new Error(`Failed after ${maxRetries} retries`);
  }

  async get(url: string, options?: RequestInit): Promise<any> {
    const response = await this.fetchWithRetry(url, {
      method: 'GET',
      ...options
    });

    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw new Error('Response is not JSON');
    }

    return response.json();
  }

  async post(url: string, data?: any, options?: RequestInit): Promise<any> {
    const response = await this.fetchWithRetry(url, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
      ...options
    });

    return response.json();
  }

  // Health monitoring
  getStatus() {
    return {
      rateLimiter: this.rateLimiter.getAllHostStatus(),
      circuitBreaker: this.circuitBreaker.getAllHostStatus(),
      timestamp: Date.now()
    };
  }

  getHostStatus(hostname: string) {
    return {
      hostname,
      rateLimit: this.rateLimiter.getHostStatus(hostname),
      circuitBreaker: this.circuitBreaker.getHostStatus(hostname),
      timestamp: Date.now()
    };
  }
}

// Factory function for common RapidAPI hosts
export function createRapidAPIClient(apiKey: string): RapidAPIClient {
  const config: RapidAPIConfig = {
    api_key: apiKey,
    hosts: {
      'twelvedata.p.rapidapi.com': {
        requestsPerMinute: 100, // Free tier limit
        burstCapacity: 10,
        timeout_ms: 5000,
        max_retries: 2
      },
      'financialmodelingprep.p.rapidapi.com': {
        requestsPerMinute: 250, // Free tier limit
        burstCapacity: 15,
        timeout_ms: 5000,
        max_retries: 2
      }
    },
    circuit_breaker: {
      failLimit: 5,
      coolMs: 30000, // 30 second cooldown
      halfOpenSuccess: 3
    }
  };

  return new RapidAPIClient(config);
}
