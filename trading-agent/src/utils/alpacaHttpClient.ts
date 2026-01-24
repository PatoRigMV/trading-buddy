// alpacaHttpClient.ts
// Direct HTTP implementation of Alpaca API calls
// Bypasses package installation issues and provides real API connectivity

import https from 'https';

export interface AlpacaConfig {
  keyId: string;
  secretKey: string;
  baseUrl?: string; // defaults to paper trading
  dataUrl?: string; // defaults to data API
}

export interface AlpacaQuote {
  bid: number;
  bidsize: number;
  ask: number;
  asksize: number;
  timestamp: string;
}

export interface AlpacaOrder {
  id: string;
  symbol: string;
  qty: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  time_in_force: string;
  limit_price?: string;
  status: string;
  filled_at?: string;
  filled_avg_price?: string;
  filled_qty?: string;
}

export class AlpacaHttpClient {
  private keyId: string;
  private secretKey: string;
  private baseUrl: string;
  private dataUrl: string;

  constructor(config: AlpacaConfig) {
    this.keyId = config.keyId;
    this.secretKey = config.secretKey;
    this.baseUrl = config.baseUrl || 'https://paper-api.alpaca.markets';
    this.dataUrl = config.dataUrl || 'https://data.alpaca.markets';
  }

  private async makeRequest(method: string, url: string, data?: any, isDataApi = false): Promise<any> {
    return new Promise((resolve, reject) => {
      const apiUrl = isDataApi ? this.dataUrl : this.baseUrl;
      const fullUrl = new URL(url, apiUrl);

      const options = {
        hostname: fullUrl.hostname,
        port: 443,
        path: fullUrl.pathname + fullUrl.search,
        method,
        headers: {
          'APCA-API-KEY-ID': this.keyId,
          'APCA-API-SECRET-KEY': this.secretKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      };

      const req = https.request(options, (res) => {
        let body = '';

        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          try {
            const response = body ? JSON.parse(body) : {};

            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(response);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(response)}`));
            }
          } catch (error) {
            reject(new Error(`Parse error: ${error instanceof Error ? error.message : String(error)}, Body: ${body}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      if (data) {
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }

  // Get options quote for a specific contract
  async getOptionsQuote(symbol: string): Promise<AlpacaQuote> {
    try {
      const response = await this.makeRequest(
        'GET',
        `/v1beta1/options/quotes/latest?symbols=${encodeURIComponent(symbol)}&feed=indicative`,
        null,
        true // use data API
      );

      const quote = response.quotes?.[symbol];
      if (!quote) {
        throw new Error(`No quote data for symbol ${symbol}`);
      }

      return {
        bid: parseFloat(quote.bp) || 0,
        bidsize: parseInt(quote.bs) || 0,
        ask: parseFloat(quote.ap) || 0,
        asksize: parseInt(quote.as) || 0,
        timestamp: quote.t || new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Failed to get options quote for ${symbol}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Place a single options order
  async placeOrder(order: {
    symbol: string;
    qty: number;
    side: 'buy' | 'sell';
    type: 'market' | 'limit';
    limit_price?: number;
    time_in_force?: string;
    client_order_id?: string;
  }): Promise<AlpacaOrder> {
    const orderData = {
      symbol: order.symbol,
      qty: order.qty.toString(),
      side: order.side,
      type: order.type,
      time_in_force: order.time_in_force || 'day',
      ...(order.limit_price && { limit_price: order.limit_price.toString() }),
      ...(order.client_order_id && { client_order_id: order.client_order_id })
    };

    try {
      const response = await this.makeRequest('POST', '/v2/orders', orderData);
      return response;
    } catch (error) {
      throw new Error(`Failed to place order for ${order.symbol}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Get order status
  async getOrder(orderId: string): Promise<AlpacaOrder> {
    try {
      const response = await this.makeRequest('GET', `/v2/orders/${orderId}`);
      return response;
    } catch (error) {
      throw new Error(`Failed to get order ${orderId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Cancel order
  async cancelOrder(orderId: string): Promise<void> {
    try {
      await this.makeRequest('DELETE', `/v2/orders/${orderId}`);
    } catch (error) {
      throw new Error(`Failed to cancel order ${orderId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Get account information
  async getAccount(): Promise<any> {
    try {
      const response = await this.makeRequest('GET', '/v2/account');
      return response;
    } catch (error) {
      throw new Error(`Failed to get account info: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Get positions
  async getPositions(): Promise<any[]> {
    try {
      const response = await this.makeRequest('GET', '/v2/positions');
      return response;
    } catch (error) {
      throw new Error(`Failed to get positions: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
