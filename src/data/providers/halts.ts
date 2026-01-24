import { HaltsAdapter, HaltState } from "../contracts";

export class PolygonHalts implements HaltsAdapter {
  async getHaltState(_symbol:string): Promise<HaltState|null> {
    // TODO: query Polygon status/LULD, map
    return { halted:false, luld:null };
  }
}

export class FmpHalts implements HaltsAdapter {
  async getHaltState(_symbol:string): Promise<HaltState|null> { return null; }
}

export class YahooHalts implements HaltsAdapter {
  async getHaltState(_symbol:string): Promise<HaltState|null> { return null; }
}
