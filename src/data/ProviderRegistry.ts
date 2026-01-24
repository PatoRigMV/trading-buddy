import { QuotesAdapter, BarsAdapter, HaltsAdapter } from './contracts';
import { ProviderName } from './types';
import { PolygonAdapter } from './providers/polygon';
import { YahooAdapter } from './providers/yahoo';

interface ProviderConfig {
  polygon?: { api_key: string; };
  yahoo?: {};
  // Add other providers as needed
}

export class ProviderRegistry {
  private adapters: Map<ProviderName, QuotesAdapter & BarsAdapter & HaltsAdapter> = new Map();
  private health: Map<ProviderName, { healthy: boolean; lastCheck: number; }> = new Map();

  constructor(config: ProviderConfig) {
    this.initializeProviders(config);
  }

  private initializeProviders(config: ProviderConfig) {
    if (config.polygon?.api_key) {
      const adapter = new PolygonAdapter(config.polygon);
      this.adapters.set('polygon', adapter as any);
      this.health.set('polygon', { healthy: true, lastCheck: 0 });
    }

    // Yahoo Finance is always available (no API key required)
    const yahooAdapter = new YahooAdapter(config.yahoo || {});
    this.adapters.set('yahoo', yahooAdapter as any);
    this.health.set('yahoo', { healthy: true, lastCheck: 0 });
  }

  getQuoteAdapter(provider: ProviderName): QuotesAdapter | null {
    return this.adapters.get(provider) || null;
  }

  getBarsAdapter(provider: ProviderName): BarsAdapter | null {
    return this.adapters.get(provider) || null;
  }

  getHaltsAdapter(provider: ProviderName): HaltsAdapter | null {
    return this.adapters.get(provider) || null;
  }

  getHealthyProviders(): ProviderName[] {
    const healthy: ProviderName[] = [];
    for (const [provider, health] of this.health.entries()) {
      if (health.healthy) {
        healthy.push(provider);
      }
    }
    return healthy;
  }

  async updateHealth(provider: ProviderName): Promise<boolean> {
    const adapter = this.adapters.get(provider);
    if (!adapter) return false;

    try {
      const isHealthy = await (adapter as any).healthCheck();
      this.health.set(provider, { healthy: isHealthy, lastCheck: Date.now() });
      return isHealthy;
    } catch {
      this.health.set(provider, { healthy: false, lastCheck: Date.now() });
      return false;
    }
  }

  async healthCheckAll(): Promise<Map<ProviderName, boolean>> {
    const results = new Map<ProviderName, boolean>();

    for (const provider of this.adapters.keys()) {
      const isHealthy = await this.updateHealth(provider);
      results.set(provider, isHealthy);
    }

    return results;
  }

  getAvailableProviders(): ProviderName[] {
    return Array.from(this.adapters.keys());
  }
}
