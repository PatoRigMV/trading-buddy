export type Side = "buy"|"sell";
export interface OrderIntent { symbol:string; side:Side; qty:number; notional:number; mid:number; spread_bps:number; luld?:{upper:number; lower:number}|null; }
export interface RoutedOrder { client_order_id:string; symbol:string; side:Side; qty:number; type:"limit"; limit:number; timeInForce:"IOC"|"DAY"; sliceId?:number; totalSlices?:number; }
export interface ExecConfig {
  min_band_bps:number; band_spread_multiplier:number; band_cap_bps:number;
  open_close_auction_entries:boolean; participation_target:number; twap_slice_secs:number; adv_slice_threshold: number; // fraction of 1m ADV
}
