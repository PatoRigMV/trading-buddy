# options_risk_manager.py
# Python mirror of TypeScript guard logic for parity with Flask front-end.
# Author: ChatGPT (GPT-5 Thinking)

from dataclasses import dataclass
from math import erf, sqrt, log
from typing import Dict, List, Optional, Tuple

def normal_cdf(x: float) -> float:
    return 0.5 * (1.0 + erf(x / sqrt(2.0)))

def call_itm_prob(S: float, K: float, DTE: int, iv: float, r: float, q: float) -> float:
    T = max(DTE, 1) / 365.0
    sigma = max(iv, 1e-6)
    volT = sigma * sqrt(T)
    mu = (r - q - 0.5 * sigma * sigma) * T
    d2 = (log(S / K) + mu) / volT
    return normal_cdf(d2)

def pin_risk_level(S: float, K: float, hours_to_expiry: float) -> str:
    pct = abs(S - K) / max(K, 1e-6)
    if hours_to_expiry < 3 and pct < 0.005:
        return 'high'
    if hours_to_expiry < 24 and pct < 0.01:
        return 'med'
    return 'low'

def short_call_early_exercise_likely(extrinsic: float, dividend: float, days_to_exdiv: int) -> bool:
    return (days_to_exdiv <= 2) and (extrinsic < dividend)

def contracts_for_spread(max_loss_per_contract: float, equity: float, risk_frac: float, gap_buffer: float) -> int:
    risk_budget = max(equity * risk_frac, 0.0)
    if max_loss_per_contract <= 0:
        return 0
    n = int(risk_budget // (max_loss_per_contract * gap_buffer))
    return max(1, n)

def adjusted_vega_limit(base_max_vega: float, portfolio_iv_rank: float, low_thr: float, high_thr: float, low_scaler: float, high_scaler: float) -> float:
    if portfolio_iv_rank >= high_thr:
        return base_max_vega * high_scaler
    if portfolio_iv_rank <= low_thr:
        return base_max_vega * low_scaler
    return base_max_vega

def iv_rank_gating(is_long_premium: bool, iv_rank: float, long_max_iv_rank: float, short_min_iv_rank: float) -> bool:
    if is_long_premium and iv_rank > long_max_iv_rank:
        return False
    if (not is_long_premium) and iv_rank < short_min_iv_rank:
        return False
    return True

def in_earnings_blackout(days_to_earnings: Optional[int], before: int, after: int) -> bool:
    if days_to_earnings is None:
        return False
    return (-after <= days_to_earnings <= before)

def min_credit_ok(net_credit: float, width: float, min_ratio: float) -> bool:
    if width <= 0:
        return False
    return (net_credit / width) >= min_ratio

@dataclass
class Contract:
    symbol: str
    underlying: str
    expirationDate: str
    strikePrice: float
    contractType: str
    multiplier: int
    openInterest: Optional[int] = None

@dataclass
class Quote:
    bid: float
    ask: float
    last: Optional[float] = None
    volume: Optional[int] = None
    impliedVolatility: float = 0.0
    nbboAgeMs: Optional[int] = None

@dataclass
class Playbook:
    liquidity: dict
    exposure: dict
    portfolioGreeksLimits: dict
    ivRankRules: dict
    dteRules: dict
    earningsAndMacro: dict
    spreadSanity: dict
    circuitBreakers: dict

def pass_liquidity(contract: Contract, quote: Quote, pb: Playbook) -> bool:
    oi = contract.openInterest or 0
    vol = quote.volume or 0
    mid = (quote.bid + quote.ask) / 2
    if oi < pb.liquidity['minOpenInterest']: return False
    if vol < pb.liquidity['minVolume']: return False
    if mid < pb.liquidity['minMidPrice']: return False
    spread_pct = (quote.ask - quote.bid) / max(mid, 1e-6)
    if spread_pct > pb.liquidity['maxSpreadPct']: return False
    nbbo_age = quote.nbboAgeMs or 0
    if nbbo_age > pb.liquidity['maxNbboAgeMs']: return False
    return True

def approve_options_trade(args: dict, pb: Playbook) -> Tuple[bool, List[str]]:
    reasons: List[str] = []

    # Liquidity
    if not pass_liquidity(args['contract'], args['quote'], pb):
        reasons.append('liquidity_gate_failed')

    # IV rank gating
    if not iv_rank_gating(args['isLongPremium'], args['portfolioIvRank'], pb.ivRankRules['longPremiumMaxIvRank'], pb.ivRankRules['shortPremiumMinIvRank']):
        reasons.append('iv_rank_gate_failed')

    # DTE
    if args['dte'] < pb.dteRules['minDte'] or args['dte'] > pb.dteRules['maxDte']:
        reasons.append('dte_out_of_bounds')

    # Near-expiry short gamma cap (advisory – external enforcement)
    if args['dte'] < pb.dteRules['nearExpiryDte'] and not args['isLongPremium']:
        if pb.dteRules['maxShortGammaExposurePctNearExpiry'] <= 0:
            reasons.append('near_expiry_short_gamma_blocked')

    # Earnings blackout
    days_to_earn = args['earnings'].get('daysToEarnings')
    if in_earnings_blackout(days_to_earn, pb.earningsAndMacro['earningsBlackoutDaysBefore'], pb.earningsAndMacro['earningsBlackoutDaysAfter']):
        reasons.append('earnings_blackout')

    # Macro pause
    if args['macro'].get('hasMajorEventNow'):
        reasons.append('macro_event_pause')

    # Per-underlying risk cap
    if args['perUnderlyingRiskPct'] > pb.exposure['maxPerUnderlyingRiskPct']:
        reasons.append('per_underlying_risk_cap')

    # Spread sanity
    spread_width = args.get('spreadWidth')
    net_credit = args.get('proposedNetCredit')
    underlying_atr = args.get('underlyingATR', 0.0)
    if spread_width is not None and net_credit is not None:
        if not min_credit_ok(net_credit, spread_width, pb.spreadSanity['minCreditToWidthRatio']):
            reasons.append('min_credit_ratio_failed')
        if underlying_atr > 0 and spread_width < pb.spreadSanity['minWingWidthToATR'] * underlying_atr:
            reasons.append('wings_too_tight_vs_atr')

    # Early exercise risk (short call ex-div)
    extrinsic = args.get('extrinsicValueShortCall')
    exdiv_days = args['earnings'].get('daysToExDividend')
    dividend_cash = args['earnings'].get('nextDividendCash')
    if extrinsic is not None and exdiv_days is not None and dividend_cash:
        if short_call_early_exercise_likely(float(extrinsic), float(dividend_cash), int(exdiv_days)):
            reasons.append('early_exercise_risk_exdiv')

    # Pin risk advisory
    hours_to_exp = args.get('hoursToExpiry')
    if hours_to_exp is not None:
        S = args['quote'].get('last') or (args['quote']['bid'] + args['quote']['ask'])/2
        K = args['contract'].strikePrice
        pin = pin_risk_level(float(S), float(K), float(hours_to_exp))
        if pin != 'low':
            reasons.append(f'pin_risk_{pin}')

    return (len(reasons) == 0, reasons)
