import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PerHostRateLimiter, RateLimitConfig } from '../src/data/rateLimiter';
import { PerHostCircuitBreaker } from '../src/data/circuitBreaker';
import { RapidAPIClient, createRapidAPIClient } from '../src/data/RapidAPIClient';

describe('RapidAPI Components', () => {
  describe('PerHostRateLimiter', () => {
    let rateLimiter: PerHostRateLimiter;

    beforeEach(() => {
      const config: Record<string, RateLimitConfig> = {
        'testhost1.com': {
          requestsPerMinute: 60,
          burstCapacity: 10,
          timeout_ms: 1000,
          max_retries: 2
        },
        'testhost2.com': {
          requestsPerMinute: 120,
          burstCapacity: 15,
          timeout_ms: 1500,
          max_retries: 3
        }
      };
      rateLimiter = new PerHostRateLimiter(config);
    });

    it('should isolate rate limits per host', async () => {
      // Host 1 should have capacity
      const canUseHost1 = await rateLimiter.waitForCapacity('testhost1.com');
      expect(canUseHost1).toBe(true);

      // Host 2 should also have capacity (isolated bucket)
      const canUseHost2 = await rateLimiter.waitForCapacity('testhost2.com');
      expect(canUseHost2).toBe(true);

      // Status should show different configs
      const status1 = rateLimiter.getHostStatus('testhost1.com');
      const status2 = rateLimiter.getHostStatus('testhost2.com');

      expect(status1.config?.requestsPerMinute).toBe(60);
      expect(status2.config?.requestsPerMinute).toBe(120);
    });

    it('should handle unconfigured hosts gracefully', async () => {
      const canUse = await rateLimiter.waitForCapacity('unknown.com');
      expect(canUse).toBe(true); // Should allow unconfigured hosts
    });

    it('should provide comprehensive status', () => {
      const allStatus = rateLimiter.getAllHostStatus();
      expect(allStatus['testhost1.com']).toBeDefined();
      expect(allStatus['testhost2.com']).toBeDefined();
      expect(allStatus['testhost1.com'].configured).toBe(true);
    });
  });

  describe('PerHostCircuitBreaker', () => {
    let circuitBreaker: PerHostCircuitBreaker;

    beforeEach(() => {
      circuitBreaker = new PerHostCircuitBreaker({
        failLimit: 3,
        coolMs: 1000, // 1 second for testing
        halfOpenSuccess: 2
      });
    });

    it('should isolate circuit breaker per host', () => {
      // Host 1 failures should not affect Host 2
      circuitBreaker.recordFailure('host1.com');
      circuitBreaker.recordFailure('host1.com');
      circuitBreaker.recordFailure('host1.com'); // Should trip circuit

      expect(circuitBreaker.canPass('host1.com')).toBe(false);
      expect(circuitBreaker.canPass('host2.com')).toBe(true); // Different host
    });

    it('should transition through circuit breaker states', async () => {
      const host = 'test.com';

      // Start in closed state
      expect(circuitBreaker.canPass(host)).toBe(true);
      expect(circuitBreaker.getHostStatus(host).state).toBe('closed');

      // Trip to open state
      for (let i = 0; i < 3; i++) {
        circuitBreaker.recordFailure(host);
      }
      expect(circuitBreaker.canPass(host)).toBe(false);
      expect(circuitBreaker.getHostStatus(host).state).toBe('open');

      // Wait for cooldown and transition to half-open
      await new Promise(resolve => setTimeout(resolve, 1100));
      expect(circuitBreaker.canPass(host)).toBe(true);
      expect(circuitBreaker.getHostStatus(host).state).toBe('half');

      // Record successes to close circuit
      circuitBreaker.recordSuccess(host);
      circuitBreaker.recordSuccess(host);
      expect(circuitBreaker.getHostStatus(host).state).toBe('closed');
    });

    it('should provide detailed status information', () => {
      const host = 'status-test.com';
      circuitBreaker.recordFailure(host);

      const status = circuitBreaker.getHostStatus(host);
      expect(status.host).toBe(host);
      expect(status.failures).toBe(1);
      expect(status.state).toBe('closed');
    });
  });

  describe('RapidAPIClient', () => {
    let client: RapidAPIClient;

    beforeEach(() => {
      client = createRapidAPIClient('test-api-key-12345');

      // Mock fetch for testing
      global.fetch = vi.fn();
    });

    it('should create client with proper configuration', () => {
      expect(client).toBeDefined();

      const status = client.getStatus();
      expect(status.rateLimiter['twelvedata.p.rapidapi.com']).toBeDefined();
      expect(status.rateLimiter['financialmodelingprep.p.rapidapi.com']).toBeDefined();
      expect(status.circuitBreaker).toBeDefined();
    });

    it('should include proper RapidAPI headers', async () => {
      const mockResponse = new Response(JSON.stringify({ test: 'data' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });

      (global.fetch as any).mockResolvedValueOnce(mockResponse);

      await client.get('https://twelvedata.p.rapidapi.com/test');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('twelvedata.p.rapidapi.com'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-RapidAPI-Key': 'test-api-key-12345',
            'X-RapidAPI-Host': 'twelvedata.p.rapidapi.com'
          })
        })
      );
    });

    it('should handle circuit breaker failures', async () => {
      const mockResponse = new Response('Server Error', {
        status: 500,
        statusText: 'Internal Server Error'
      });

      (global.fetch as any).mockResolvedValue(mockResponse);

      // Should fail and record circuit breaker failure
      await expect(client.get('https://testhost.p.rapidapi.com/fail'))
        .rejects.toThrow('Server error 500');

      const status = client.getHostStatus('testhost.p.rapidapi.com');
      expect(status.circuitBreaker.failures).toBeGreaterThan(0);
    });

    it('should handle rate limiting with retries', async () => {
      const rateLimitResponse = new Response('Rate Limited', {
        status: 429,
        headers: { 'Retry-After': '1' }
      });

      const successResponse = new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });

      (global.fetch as any)
        .mockResolvedValueOnce(rateLimitResponse)
        .mockResolvedValueOnce(successResponse);

      const result = await client.get('https://testhost.p.rapidapi.com/retry');
      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(2); // Initial + retry
    });

    it('should provide host-specific status', () => {
      const status = client.getHostStatus('twelvedata.p.rapidapi.com');

      expect(status.hostname).toBe('twelvedata.p.rapidapi.com');
      expect(status.rateLimit).toBeDefined();
      expect(status.circuitBreaker).toBeDefined();
      expect(typeof status.timestamp).toBe('number');
    });
  });

  describe('Integration', () => {
    it('should isolate different RapidAPI hosts completely', async () => {
      const client = createRapidAPIClient('integration-test-key');

      // Mock failures for one host
      const mockFailure = new Response('Server Error', { status: 500 });
      const mockSuccess = new Response(JSON.stringify({ data: 'success' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });

      (global.fetch as any)
        .mockImplementation((url: string) => {
          if (url.includes('twelvedata')) {
            return Promise.resolve(mockFailure);
          }
          return Promise.resolve(mockSuccess);
        });

      // Twelve Data should fail
      await expect(client.get('https://twelvedata.p.rapidapi.com/fail'))
        .rejects.toThrow();

      // FMP should still work
      const result = await client.get('https://financialmodelingprep.p.rapidapi.com/success');
      expect(result.data).toBe('success');

      // Verify isolation in status
      const status = client.getStatus();
      expect(status.circuitBreaker['twelvedata.p.rapidapi.com']?.failures).toBeGreaterThan(0);
      expect(status.circuitBreaker['financialmodelingprep.p.rapidapi.com']?.failures).toBe(0);
    });
  });
});
