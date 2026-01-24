import { BarsAdapter } from "../contracts"; import { NormalizedBar } from "../types";

export class PolygonBars implements BarsAdapter {
  async getBars(symbol:string, interval:"1m"|"5m"|"1d", fromMs:number, toMs:number): Promise<NormalizedBar[]> {
    // TODO: call Polygon aggregates, normalize, set adjusted=true if back-adjusted
    return [];
  }
}

export class TiingoBars implements BarsAdapter {
  async getBars(symbol:string, interval:"1m"|"5m"|"1d", fromMs:number, toMs:number): Promise<NormalizedBar[]> { return []; }
}

export class FinnhubBars implements BarsAdapter {
  async getBars(symbol:string, interval:"1m"|"5m"|"1d", fromMs:number, toMs:number): Promise<NormalizedBar[]> { return []; }
}
