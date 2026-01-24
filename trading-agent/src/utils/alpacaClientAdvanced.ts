// alpacaClient.ts
// Minimal Alpaca REST client for options quotes & orders.
// NOTE: Endpoints may differ across environments; keep BASE URLs configurable.
// Author: ChatGPT (GPT-5 Thinking)

/* eslint-disable @typescript-eslint/no-explicit-any */

export type AlpacaConfig = {
  keyId: string;
  secretKey: string;
  paper?: boolean;
  dataBaseUrl?: string;     // default: https://data.alpaca.markets
  tradingBaseUrl?: string;  // default: https://paper-api.alpaca.markets or https://api.alpaca.markets
};

export type OptionQuoteResp = {
  symbol: string;
  bid_price: number;
  ask_price: number;
  last_price?: number;
  implied_volatility?: number;
  conditions?: string[];
  // add other fields as needed
};

export type PlaceOrderReq = {
  symbol: string;
  qty: number;
  side: 'buy'|'sell';
  type: 'limit'|'market';
  time_in_force: 'ioc'|'day'|'gtc'|'fok';
  limit_price?: number;
  // for options
  class?: 'option';
  // client order id for idempotency
  client_order_id?: string;
};

export type OrderResp = {
  id: string;
  status: 'accepted'|'new'|'filled'|'partially_filled'|'canceled'|'expired'|'rejected';
  filled_qty: string;
  filled_avg_price?: string;
  symbol: string;
  side: 'buy'|'sell';
  type: string;
  time_in_force: string;
  limit_price?: string;
  created_at: string;
  updated_at?: string;
  // add other fields as needed
};

export class AlpacaClient {
  private cfg: AlpacaConfig;
  private fetchImpl: any;

  constructor(cfg: AlpacaConfig, fetchImpl?: any) {
    this.cfg = cfg;
    this.fetchImpl = fetchImpl || (globalThis as any).fetch;
    if (!this.cfg.dataBaseUrl) this.cfg.dataBaseUrl = 'https://data.alpaca.markets';
    if (!this.cfg.tradingBaseUrl) this.cfg.tradingBaseUrl = (cfg.paper ?? true) ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets';
  }

  private headers(json=true) {
    const h: any = {
      'APCA-API-KEY-ID': this.cfg.keyId,
      'APCA-API-SECRET-KEY': this.cfg.secretKey,
    };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  // Fetch a single option quote (use v1beta1 data API; adjust symbol formatting per your stack)
  async getOptionQuote(symbol: string): Promise<OptionQuoteResp> {
    const url = `${this.cfg.dataBaseUrl}/v1beta1/options/quotes?symbols=${encodeURIComponent(symbol)}&limit=1`;
    const r = await this.fetchImpl(url, { headers: this.headers(false) });
    if (!r.ok) throw new Error(`Alpaca data error: ${r.status}`);
    const j = await r.json();
    // Response typically includes 'quotes' keyed by symbol
    const quoteArr = j.quotes?.[symbol] || j.quotes || [];
    const q = Array.isArray(quoteArr) ? quoteArr[0] : quoteArr;
    if (!q) throw new Error('No quote for symbol');
    return {
      symbol,
      bid_price: Number(q.bid_price ?? q.bp ?? q.bid ?? 0),
      ask_price: Number(q.ask_price ?? q.ap ?? q.ask ?? 0),
      last_price: Number(q.last_price ?? q.lp ?? q.last ?? 0),
      implied_volatility: Number(q.implied_volatility ?? q.iv ?? 0),
    };
  }

  // Place an options order (Alpaca orders live under /v2/orders with class=option)
  async placeOptionsOrder(req: PlaceOrderReq): Promise<OrderResp> {
    const url = `${this.cfg.tradingBaseUrl}/v2/orders`;
    const payload = { ...req, class: 'option' };
    const r = await this.fetchImpl(url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload)
    });
    const txt = await r.text();
    if (!r.ok) throw new Error(`order error ${r.status}: ${txt}`);
    return JSON.parse(txt);
  }

  async getOrder(orderId: string): Promise<OrderResp> {
    const url = `${this.cfg.tradingBaseUrl}/v2/orders/${orderId}`;
    const r = await this.fetchImpl(url, { headers: this.headers(false) });
    if (!r.ok) throw new Error(`getOrder error: ${r.status}`);
    return await r.json();
  }

  async cancelOrder(orderId: string): Promise<void> {
    const url = `${this.cfg.tradingBaseUrl}/v2/orders/${orderId}`;
    const r = await this.fetchImpl(url, { method: 'DELETE', headers: this.headers(false) });
    if (!r.ok) throw new Error(`cancel error: ${r.status}`);
  }
}
