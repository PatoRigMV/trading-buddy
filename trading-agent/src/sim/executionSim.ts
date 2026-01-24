export type LiquidityBucket = "Q1" | "Q2" | "Q3" | "Q4" | "Q5";

export interface ExecSimConfig {
    spreadBpsByBucket: Record<LiquidityBucket, number>;
    slipMeanBpsByBucket: Record<LiquidityBucket, number>;
    slipStdBpsByBucket: Record<LiquidityBucket, number>;
    feePerShare: number;
}

// Box-Muller transform for generating normal distribution
function normal(mean: number, std: number): number {
    const u = Math.random();
    const v = Math.random();
    return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface FillResult {
    price: number;
    slip_bps: number;
    fee: number;
}

export function simulateFill(
    limit: number,
    mid: number,
    side: "buy" | "sell",
    qty: number,
    bucket: LiquidityBucket,
    cfg: ExecSimConfig
): FillResult {
    const baseSlip = normal(cfg.slipMeanBpsByBucket[bucket], cfg.slipStdBpsByBucket[bucket]);
    const slip = Math.max(-cfg.spreadBpsByBucket[bucket] / 2, baseSlip);

    const price =
        side === "buy"
            ? Math.min(limit, mid * (1 + slip / 10000))
            : Math.max(limit, mid * (1 - slip / 10000));

    const fee = qty * cfg.feePerShare;

    return {
        price,
        slip_bps: slip,
        fee,
    };
}

// Default configuration based on typical market conditions
export const DEFAULT_EXEC_CONFIG: ExecSimConfig = {
    spreadBpsByBucket: {
        Q1: 2, // Most liquid
        Q2: 5,
        Q3: 10,
        Q4: 20,
        Q5: 40, // Least liquid
    },
    slipMeanBpsByBucket: {
        Q1: 1,
        Q2: 3,
        Q3: 6,
        Q4: 12,
        Q5: 25,
    },
    slipStdBpsByBucket: {
        Q1: 0.5,
        Q2: 1.5,
        Q3: 3,
        Q4: 6,
        Q5: 12,
    },
    feePerShare: 0.0005, // $0.0005 per share
};
