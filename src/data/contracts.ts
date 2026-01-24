import { NormalizedBar, NormalizedQuote } from "./types";

export interface QuotesAdapter { getQuote(symbol:string): Promise<NormalizedQuote|null>; }
export interface BarsAdapter { getBars(symbol:string, interval:"1m"|"5m"|"1d", fromMs:number, toMs:number): Promise<NormalizedBar[]>; }
export interface HaltState { halted:boolean; luld?:{ upper:number; lower:number }|null; ts_exchange?:number; }
export interface HaltsAdapter { getHaltState(symbol:string): Promise<HaltState|null>; }
