import { simulateFill, ExecSimConfig, LiquidityBucket } from './executionSim';

export type RoutingStrategy = 'single_shot' | 'twap' | 'pov';

export interface MarketContext {
  currentPrice: number;
  adv: number; // Average daily volume
  spreadBps: number;
  volatilityBps: number;
  bucket: LiquidityBucket;
}

export interface RoutingResult {
  strategy: RoutingStrategy;
  avgPrice: number;
  totalSlippageBps: number;
  totalFees: number;
  totalCost: number; // Fees + slippage in dollars
  executionTimeMs: number;
  numSlices: number;
  marketImpactBps: number;
}

export interface RoutingComparison {
  singleShot: RoutingResult;
  twap: RoutingResult;
  pov: RoutingResult;
  recommendation: RoutingStrategy;
  reason: string;
}

// Single-shot execution: all shares in one order
export function simulateSingleShot(
  qty: number,
  ctx: MarketContext,
  cfg: ExecSimConfig
): RoutingResult {
  const limit = ctx.currentPrice * (1 + ctx.spreadBps / 10000);
  const result = simulateFill(limit, ctx.currentPrice, 'buy', qty, ctx.bucket, cfg);

  // Market impact increases with order size relative to ADV
  const advPct = (qty / ctx.adv) * 100;
  const marketImpact = advPct * 2; // 2bps per 1% of ADV

  return {
    strategy: 'single_shot',
    avgPrice: result.price,
    totalSlippageBps: result.slip_bps + marketImpact,
    totalFees: result.fee,
    totalCost: result.fee + (ctx.currentPrice * qty * (result.slip_bps + marketImpact) / 10000),
    executionTimeMs: 500, // ~500ms for single order
    numSlices: 1,
    marketImpactBps: marketImpact,
  };
}

// TWAP: Time-Weighted Average Price - split evenly over time
export function simulateTWAP(
  qty: number,
  ctx: MarketContext,
  cfg: ExecSimConfig,
  durationMs: number = 300000, // Default 5 minutes
  sliceIntervalMs: number = 30000 // Default 30 seconds
): RoutingResult {
  const numSlices = Math.ceil(durationMs / sliceIntervalMs);
  const sliceQty = Math.floor(qty / numSlices);
  const remainder = qty % numSlices;

  let totalPrice = 0;
  let totalSlippage = 0;
  let totalFees = 0;
  let totalShares = 0;

  for (let i = 0; i < numSlices; i++) {
    const currentSliceQty = i === numSlices - 1 ? sliceQty + remainder : sliceQty;

    // Price drift over time (random walk)
    const drift = ((Math.random() - 0.5) * ctx.volatilityBps * Math.sqrt(i / numSlices));
    const priceAtSlice = ctx.currentPrice * (1 + drift / 10000);

    const limit = priceAtSlice * (1 + ctx.spreadBps / 10000);
    const result = simulateFill(limit, priceAtSlice, 'buy', currentSliceQty, ctx.bucket, cfg);

    // Lower market impact per slice
    const advPct = (currentSliceQty / ctx.adv) * 100;
    const marketImpact = advPct * 1.5; // Less impact than single-shot

    totalPrice += result.price * currentSliceQty;
    totalSlippage += (result.slip_bps + marketImpact) * currentSliceQty;
    totalFees += result.fee;
    totalShares += currentSliceQty;
  }

  const avgPrice = totalPrice / totalShares;
  const avgSlippage = totalSlippage / totalShares;
  const marketImpact = avgSlippage - (totalSlippage / totalShares - avgSlippage);

  return {
    strategy: 'twap',
    avgPrice,
    totalSlippageBps: avgSlippage,
    totalFees,
    totalCost: totalFees + (ctx.currentPrice * qty * avgSlippage / 10000),
    executionTimeMs: durationMs,
    numSlices,
    marketImpactBps: marketImpact,
  };
}

// POV: Percentage of Volume - participate at X% of market volume
export function simulatePOV(
  qty: number,
  ctx: MarketContext,
  cfg: ExecSimConfig,
  targetPovPct: number = 10, // Target 10% participation
  maxDurationMs: number = 600000 // Max 10 minutes
): RoutingResult {
  // Estimate slices based on POV target
  const assumedVolumePerMin = ctx.adv / (6.5 * 60); // ADV over trading day
  const targetQtyPerMin = assumedVolumePerMin * (targetPovPct / 100);
  const estimatedMinutes = Math.ceil(qty / targetQtyPerMin);
  const actualDurationMs = Math.min(estimatedMinutes * 60000, maxDurationMs);

  const numSlices = Math.ceil(actualDurationMs / 60000); // 1 slice per minute
  const sliceQty = Math.floor(qty / numSlices);
  const remainder = qty % numSlices;

  let totalPrice = 0;
  let totalSlippage = 0;
  let totalFees = 0;
  let totalShares = 0;

  for (let i = 0; i < numSlices; i++) {
    const currentSliceQty = i === numSlices - 1 ? sliceQty + remainder : sliceQty;

    // Price drift over time
    const drift = ((Math.random() - 0.5) * ctx.volatilityBps * Math.sqrt(i / numSlices));
    const priceAtSlice = ctx.currentPrice * (1 + drift / 10000);

    const limit = priceAtSlice * (1 + ctx.spreadBps / 10000);
    const result = simulateFill(limit, priceAtSlice, 'buy', currentSliceQty, ctx.bucket, cfg);

    // Lowest market impact - blending with natural volume
    const advPct = (currentSliceQty / ctx.adv) * 100;
    const marketImpact = advPct * 1.0; // Minimal impact

    totalPrice += result.price * currentSliceQty;
    totalSlippage += (result.slip_bps + marketImpact) * currentSliceQty;
    totalFees += result.fee;
    totalShares += currentSliceQty;
  }

  const avgPrice = totalPrice / totalShares;
  const avgSlippage = totalSlippage / totalShares;
  const marketImpact = avgSlippage - (totalSlippage / totalShares - avgSlippage);

  return {
    strategy: 'pov',
    avgPrice,
    totalSlippageBps: avgSlippage,
    totalFees,
    totalCost: totalFees + (ctx.currentPrice * qty * avgSlippage / 10000),
    executionTimeMs: actualDurationMs,
    numSlices,
    marketImpactBps: marketImpact,
  };
}

// Compare all routing strategies and recommend best approach
export function compareRoutingStrategies(
  qty: number,
  ctx: MarketContext,
  cfg: ExecSimConfig
): RoutingComparison {
  const singleShot = simulateSingleShot(qty, ctx, cfg);
  const twap = simulateTWAP(qty, ctx, cfg);
  const pov = simulatePOV(qty, ctx, cfg);

  // Decision logic: balance cost vs execution time
  const advPct = (qty / ctx.adv) * 100;

  let recommendation: RoutingStrategy;
  let reason: string;

  if (advPct < 1) {
    // Small order relative to ADV - single shot is fine
    recommendation = 'single_shot';
    reason = `Order is ${advPct.toFixed(2)}% of ADV - single shot has lowest total cost`;
  } else if (advPct < 5) {
    // Medium order - TWAP balances cost and execution
    recommendation = 'twap';
    reason = `Order is ${advPct.toFixed(2)}% of ADV - TWAP reduces market impact while maintaining reasonable execution time`;
  } else {
    // Large order - POV minimizes impact
    recommendation = 'pov';
    reason = `Order is ${advPct.toFixed(2)}% of ADV - POV minimizes market impact for large order`;
  }

  // Override if total cost savings are significant (>10bps)
  const costs = [
    { strategy: 'single_shot' as RoutingStrategy, cost: singleShot.totalCost },
    { strategy: 'twap' as RoutingStrategy, cost: twap.totalCost },
    { strategy: 'pov' as RoutingStrategy, cost: pov.totalCost },
  ];

  const minCost = Math.min(...costs.map(c => c.cost));
  const recommendedCost = costs.find(c => c.strategy === recommendation)!.cost;
  const costDiffBps = ((recommendedCost - minCost) / (ctx.currentPrice * qty)) * 10000;

  if (costDiffBps > 10) {
    const bestCost = costs.find(c => c.cost === minCost)!;
    recommendation = bestCost.strategy;
    reason = `${bestCost.strategy} has ${costDiffBps.toFixed(1)}bps lower total cost`;
  }

  return {
    singleShot,
    twap,
    pov,
    recommendation,
    reason,
  };
}
