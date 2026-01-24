type Metric = { name:string; labels?:Record<string,string>; value:number };

export const metrics = {
  emit(m:Metric){
    /* hook up to prom/otlp later */
    if(process.env.DEBUG_METRICS) console.log("METRIC", m);
  },

  // Provider metrics
  providerLatency(provider:string, ms:number){
    metrics.emit({name:"provider_latency_ms", labels:{provider}, value:ms});
  },
  providerError(provider:string){
    metrics.emit({name:"provider_errors_total", labels:{provider}, value:1});
  },

  // Freshness metrics
  freshness(domain:string, ms:number){
    metrics.emit({name:"freshness_ms", labels:{domain}, value:ms});
  },
  staleQuote(symbol:string){
    metrics.emit({name:"stale_quotes_total", labels:{symbol}, value:1});
  },

  // Circuit breaker metrics
  breaker(provider:string, state:string){
    metrics.emit({name:"circuit_state", labels:{provider, state}, value:1});
  },

  // WebSocket metrics
  wsReconnect(success:boolean){
    metrics.emit({name:"ws_reconnects_total", labels:{success: success.toString()}, value:1});
  },
  wsHeartbeat(latencyMs:number){
    metrics.emit({name:"ws_heartbeat_latency_ms", value:latencyMs});
  },
  wsDisconnect(reason:string){
    metrics.emit({name:"ws_disconnects_total", labels:{reason}, value:1});
  },

  // Backfill metrics
  backfillSuccess(symbol:string, provider:string){
    metrics.emit({name:"backfill_success_total", labels:{symbol, provider}, value:1});
  },
  backfillFailure(symbol:string, provider:string){
    metrics.emit({name:"backfill_failures_total", labels:{symbol, provider}, value:1});
  },
  backfillBarsCount(symbol:string, provider:string, count:number){
    metrics.emit({name:"backfill_bars_filled_total", labels:{symbol, provider}, value:count});
  },

  // Data quality metrics
  consensusFailure(symbol:string, reason:string){
    metrics.emit({name:"consensus_failures_total", labels:{symbol, reason}, value:1});
  },
  dataGap(symbol:string, provider:string, gapMs:number){
    metrics.emit({name:"data_gaps_ms", labels:{symbol, provider}, value:gapMs});
  }
};
