# test_options_risk_manager.py
from options_risk_manager import (
    call_itm_prob, approve_options_trade, Playbook, Contract, Quote
)

def test_prob_mid_iv():
    p = call_itm_prob(100, 100, 30, 0.3, 0.02, 0.01)
    assert 0.45 < p < 0.55

def test_approve_pass_and_fail():
    pb = Playbook(
        liquidity={'minOpenInterest': 500, 'minVolume': 50, 'maxSpreadPct': 0.03, 'minMidPrice': 0.1, 'maxNbboAgeMs': 500},
        exposure={'maxTotalOptionsExposure': 0.25, 'maxSingleOptionsExposure': 0.05, 'maxPositions': 10, 'maxPerUnderlyingRiskPct': 0.05},
        portfolioGreeksLimits={'baseMaxDelta':200,'baseMaxGamma':20,'baseMaxTheta':-100,'baseMaxVega':400,'vegaLimitScalerByIvRankHigh':0.6,'vegaLimitScalerByIvRankLow':1.2,'highIvRankThreshold':70,'lowIvRankThreshold':30},
        ivRankRules={'longPremiumMaxIvRank':70,'shortPremiumMinIvRank':30},
        dteRules={'minDte':14,'maxDte':60,'nearExpiryDte':7,'maxShortGammaExposurePctNearExpiry':0.02},
        earningsAndMacro={'earningsBlackoutDaysBefore':2,'earningsBlackoutDaysAfter':1,'macroPauseMinutes':60},
        spreadSanity={'minCreditToWidthRatio':0.3,'minWingWidthToATR':1.0,'gapBuffer':1.2},
        circuitBreakers={'cautiousDrawdownPct':0.02,'haltDrawdownPct':0.04}
    )

    ok_args = {
        'contract': Contract(symbol='TEST 2025-10-18 100 C', underlying='TEST', expirationDate='2025-10-18', strikePrice=100, contractType='call', multiplier=100, openInterest=1000),
        'quote': Quote(bid=1.0, ask=1.02, impliedVolatility=0.3, volume=100, nbboAgeMs=100, last=1.01),
        'greeks': {'delta':0.4,'gamma':0.02,'theta':-0.03,'vega':0.1},
        'portfolioGreeks': {'totalDelta':0,'totalGamma':0,'totalTheta':0,'totalVega':0},
        'equity': 100000,
        'portfolioIvRank': 40,
        'isLongPremium': True,
        'dte': 30,
        'underlyingATR': 3.0,
        'earnings': {'daysToEarnings': 5, 'daysToExDividend': 10, 'nextDividendCash': 0.2, 'dividendYield': 0.005},
        'macro': {'hasMajorEventNow': False},
        'perUnderlyingRiskPct': 0.01,
        'proposedMaxLossPerContract': 200,
        'proposedNetCredit': None,
        'spreadWidth': None,
        'extrinsicValueShortCall': None,
        'hoursToExpiry': 48
    }
    ok, reasons = approve_options_trade(ok_args, pb)
    assert ok and not reasons

    bad_args = {
        'contract': Contract(symbol='TEST 2025-10-18 100 C', underlying='TEST', expirationDate='2025-10-18', strikePrice=100, contractType='call', multiplier=100, openInterest=10),
        'quote': Quote(bid=1.0, ask=1.2, impliedVolatility=0.3, volume=5, nbboAgeMs=2000, last=1.1),
        'greeks': {'delta':0.4,'gamma':0.02,'theta':-0.03,'vega':0.1},
        'portfolioGreeks': {'totalDelta':0,'totalGamma':0,'totalTheta':0,'totalVega':0},
        'equity': 100000,
        'portfolioIvRank': 80,
        'isLongPremium': True,
        'dte': 5,
        'underlyingATR': 1.0,
        'earnings': {'daysToEarnings': 1, 'daysToExDividend': 1, 'nextDividendCash': 0.5, 'dividendYield': 0.01},
        'macro': {'hasMajorEventNow': True},
        'perUnderlyingRiskPct': 0.2,
        'proposedMaxLossPerContract': 200,
        'proposedNetCredit': 0.1,
        'spreadWidth': 0.5,
        'extrinsicValueShortCall': 0.1,
        'hoursToExpiry': 1
    }
    ok2, reasons2 = approve_options_trade(bad_args, pb)
    assert not ok2
    assert 'liquidity_gate_failed' in reasons2
