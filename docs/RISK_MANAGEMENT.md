# Risk Management Guide

Trading Buddy includes comprehensive risk management features to protect your capital. This document explains all safety features and how to configure them.

---

## Risk Management Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      RISK MANAGEMENT PIPELINE                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Trade Proposal                                                         │
│       │                                                                 │
│       ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  1. CONVICTION CHECK                                             │   │
│  │     Is the trade signal strong enough?                           │   │
│  │     Default threshold: 10% (configurable)                        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│       │                                                                 │
│       ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  2. POSITION SIZING                                              │   │
│  │     Would this position be too large?                            │   │
│  │     Max per security: 5% of portfolio                            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│       │                                                                 │
│       ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  3. EXPOSURE CHECK                                               │   │
│  │     Is sector/asset class exposure acceptable?                   │   │
│  │     Max per sector: 20% of portfolio                             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│       │                                                                 │
│       ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  4. CIRCUIT BREAKER CHECK                                        │   │
│  │     Have loss limits been hit?                                   │   │
│  │     Daily: -3% | Portfolio: -10%                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│       │                                                                 │
│       ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  5. RISK SCORE CALCULATION                                       │   │
│  │     Overall trade risk score (0-1)                               │   │
│  │     Threshold: 0.7                                               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│       │                                                                 │
│       ▼                                                                 │
│  APPROVED or REJECTED                                                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Default Risk Parameters

| Parameter | Default Value | Description |
|-----------|---------------|-------------|
| `max_risk_per_trade` | 0.75% | Maximum capital at risk per trade |
| `max_single_security` | 5% | Maximum position size |
| `max_asset_class` | 20% | Maximum allocation per asset class |
| `max_sector_exposure` | 20% | Maximum allocation per sector |
| `conviction_threshold` | 10% | Minimum confidence to execute |
| `portfolio_loss_limit` | -10% | Emergency stop threshold |
| `daily_loss_limit` | -3% | Daily trading halt threshold |
| `risk_score_threshold` | 0.7 | Maximum acceptable risk score |

---

## Configuration

### config.json

```json
{
  "trading_assistant_spec": {
    "risk_management": {
      "position_sizing": {
        "max_risk_per_trade": 0.0075,
        "methods": ["Kelly Criterion", "Fixed Fractional"],
        "stop_loss": "Always defined pre-trade"
      },
      "portfolio_exposure": {
        "max_single_security": 0.05,
        "max_asset_class": 0.2,
        "diversification": "Across sectors, geographies, factors"
      },
      "monitoring": {
        "metrics": ["Sharpe", "Sortino", "Max Drawdown"],
        "circuit_breakers": {
          "portfolio_loss": -0.1,
          "single_day_loss": -0.03
        },
        "stress_tests": ["2008 crisis", "COVID crash"]
      }
    }
  }
}
```

---

## Risk Checks Explained

### 1. Conviction Check

Ensures trades have sufficient confidence before execution.

```python
# In risk_manager.py
if proposal.conviction < 0.10:  # 10% minimum
    return RiskAssessment(
        approved=False,
        reason=f"Conviction too low: {proposal.conviction:.2f} < 0.10",
        risk_score=1.0
    )
```

**Conviction Sources:**
- Technical indicator signals
- Fundamental analysis
- Sentiment analysis
- ML model predictions

### 2. Position Sizing

Prevents overconcentration in single securities.

```python
def _check_position_sizing(self, proposal: TradeProposal) -> Tuple[bool, str]:
    """Check if proposed position size is within limits"""

    position_value = proposal.quantity * proposal.price
    position_pct = position_value / self.portfolio_value

    # Check max single security limit (default 5%)
    if position_pct > self.config.risk_management.max_single_security:
        return (False, f"Position size {position_pct:.1%} exceeds limit")

    return (True, "Position size acceptable")
```

**Kelly Criterion Option:**

```python
def kelly_criterion(win_prob: float, win_loss_ratio: float) -> float:
    """Calculate optimal position size using Kelly Criterion"""
    return (win_prob * (win_loss_ratio + 1) - 1) / win_loss_ratio
```

### 3. Exposure Limits

Prevents overexposure to sectors or asset classes.

```python
def _check_portfolio_exposure(self, proposal: TradeProposal) -> Tuple[bool, str]:
    """Check sector and asset class exposure"""

    # Calculate current sector exposure
    sector_exposure = self._calculate_sector_exposure()

    # Check if trade would exceed sector limit
    proposed_sector = self._get_sector(proposal.symbol)
    new_exposure = sector_exposure.get(proposed_sector, 0) + position_pct

    if new_exposure > self.config.risk_management.max_asset_class:
        return (False, f"Sector {proposed_sector} exposure would be {new_exposure:.1%}")

    return (True, "Exposure within limits")
```

### 4. Circuit Breakers

Automatic trading halts when loss limits are hit.

```python
def _check_circuit_breakers(self) -> bool:
    """Check if any circuit breakers are triggered"""

    # Daily loss circuit breaker
    if self.daily_pnl / self.portfolio_value < -0.03:
        self.logger.warning("Daily loss circuit breaker triggered!")
        return True

    # Portfolio loss circuit breaker
    total_return = (self.portfolio_value - self.initial_value) / self.initial_value
    if total_return < -0.10:
        self.logger.critical("Portfolio loss circuit breaker triggered!")
        return True

    return False
```

**Circuit Breaker States:**

| State | Condition | Action |
|-------|-----------|--------|
| Normal | No limits hit | Trading allowed |
| Yellow | Daily loss > 2% | Reduced position sizes |
| Red | Daily loss > 3% | No new trades |
| Emergency | Portfolio loss > 10% | All trading halted |

### 5. Risk Score Calculation

Comprehensive risk assessment combining multiple factors.

```python
def _calculate_risk_score(self, proposal: TradeProposal) -> float:
    """Calculate overall trade risk score (0-1, lower is better)"""

    scores = []

    # Volatility risk
    volatility = self._get_volatility(proposal.symbol)
    scores.append(min(volatility / 0.5, 1.0))  # 50% vol = max score

    # Concentration risk
    position_pct = (proposal.quantity * proposal.price) / self.portfolio_value
    scores.append(position_pct / 0.05)  # 5% = max score

    # Stop loss distance
    stop_distance = abs(proposal.price - proposal.stop_loss) / proposal.price
    scores.append(min(stop_distance / 0.10, 1.0))  # 10% stop = max score

    # Liquidity risk
    avg_volume = self._get_average_volume(proposal.symbol)
    if proposal.quantity > avg_volume * 0.01:  # >1% of volume
        scores.append(0.8)
    else:
        scores.append(0.2)

    return sum(scores) / len(scores)
```

---

## Stop Loss Strategies

### Fixed Stop Loss

```python
stop_loss = entry_price * (1 - stop_percentage)
# e.g., $100 entry with 5% stop = $95 stop loss
```

### ATR-Based Stop Loss

```python
def atr_stop_loss(prices: List[float], atr_multiplier: float = 2.0) -> float:
    """Calculate stop loss using Average True Range"""
    atr = calculate_atr(prices, period=14)
    return current_price - (atr * atr_multiplier)
```

### Trailing Stop Loss

```python
class TrailingStop:
    def __init__(self, initial_stop: float, trail_pct: float):
        self.stop_price = initial_stop
        self.trail_pct = trail_pct
        self.highest_price = initial_stop

    def update(self, current_price: float):
        if current_price > self.highest_price:
            self.highest_price = current_price
            self.stop_price = current_price * (1 - self.trail_pct)
```

---

## Position Sizing Methods

### 1. Fixed Fractional

```python
def fixed_fractional(portfolio_value: float, risk_pct: float = 0.01) -> float:
    """Risk 1% of portfolio per trade"""
    return portfolio_value * risk_pct
```

### 2. Kelly Criterion

```python
def kelly_position_size(
    win_probability: float,
    avg_win: float,
    avg_loss: float,
    portfolio_value: float,
    fraction: float = 0.25  # Use 25% of Kelly for safety
) -> float:
    """Calculate position size using fractional Kelly"""

    win_loss_ratio = avg_win / avg_loss
    kelly_pct = (win_probability * (win_loss_ratio + 1) - 1) / win_loss_ratio
    kelly_pct = max(0, kelly_pct)  # Can't be negative

    return portfolio_value * kelly_pct * fraction
```

### 3. Volatility-Adjusted

```python
def volatility_adjusted_size(
    portfolio_value: float,
    target_volatility: float,
    stock_volatility: float
) -> float:
    """Size position to achieve target volatility contribution"""

    # If stock is 2x more volatile than target, take half position
    adjustment = target_volatility / stock_volatility
    base_position = portfolio_value * 0.05  # 5% base

    return base_position * adjustment
```

---

## Monitoring & Alerts

### Real-Time Monitoring

```python
class RiskMonitor:
    def __init__(self):
        self.alert_thresholds = {
            'daily_pnl': -0.02,      # Alert at 2% daily loss
            'position_size': 0.04,   # Alert at 4% position
            'sector_exposure': 0.15  # Alert at 15% sector
        }

    def check_portfolio(self, portfolio: Portfolio) -> List[Alert]:
        alerts = []

        if portfolio.daily_pnl_pct < self.alert_thresholds['daily_pnl']:
            alerts.append(Alert(
                level='WARNING',
                message=f"Daily loss approaching limit: {portfolio.daily_pnl_pct:.1%}"
            ))

        return alerts
```

### Alert Channels

- WebSocket notifications (real-time UI)
- Email alerts (configurable)
- Slack/Discord webhooks (optional)

---

## Stress Testing

### Historical Scenarios

```python
STRESS_SCENARIOS = {
    '2008_financial_crisis': {
        'market_drop': -0.50,
        'volatility_spike': 3.0,
        'correlation_increase': 0.9
    },
    '2020_covid_crash': {
        'market_drop': -0.35,
        'volatility_spike': 4.0,
        'duration_days': 30
    },
    'flash_crash': {
        'market_drop': -0.10,
        'duration_minutes': 30,
        'recovery': True
    }
}

def run_stress_test(portfolio: Portfolio, scenario: str) -> StressTestResult:
    """Simulate portfolio under stress scenario"""
    params = STRESS_SCENARIOS[scenario]

    # Apply market drop to all positions
    stressed_value = portfolio.value * (1 + params['market_drop'])

    return StressTestResult(
        scenario=scenario,
        initial_value=portfolio.value,
        stressed_value=stressed_value,
        loss_pct=params['market_drop'],
        survives=stressed_value > portfolio.margin_requirement
    )
```

---

## Compliance Integration

Risk management integrates with compliance:

```python
class ComplianceRiskCheck:
    def check_trade(self, trade: Trade) -> ComplianceResult:
        checks = [
            self._check_wash_sale(trade),
            self._check_pattern_day_trader(trade),
            self._check_restricted_list(trade),
            self._check_concentration(trade)
        ]

        return ComplianceResult(
            passed=all(c.passed for c in checks),
            checks=checks
        )
```

---

## Best Practices

### 1. Always Use Stop Losses

Every trade should have a predefined exit point:

```python
proposal = TradeProposal(
    symbol="AAPL",
    action="BUY",
    quantity=10,
    price=185.00,
    stop_loss=180.00,      # Required!
    profit_target=195.00,
    conviction=0.75,
    rationale="Technical breakout"
)
```

### 2. Diversify

Don't put all eggs in one basket:

```python
# Good: Multiple positions across sectors
positions = {
    "AAPL": 0.04,   # Tech - 4%
    "JPM": 0.04,    # Finance - 4%
    "JNJ": 0.04,    # Healthcare - 4%
    "XOM": 0.04,    # Energy - 4%
}

# Bad: Concentrated in one sector
positions = {
    "AAPL": 0.05,
    "MSFT": 0.05,
    "GOOGL": 0.05,
    "NVDA": 0.05,   # All tech - 20%!
}
```

### 3. Size for Volatility

Adjust position sizes based on stock volatility:

```python
# High volatility stock (TSLA: ~50% annual vol)
position_size = base_size * 0.5

# Low volatility stock (JNJ: ~15% annual vol)
position_size = base_size * 1.5
```

### 4. Regular Rebalancing

Review and rebalance periodically:

```python
def suggest_rebalancing(portfolio: Portfolio) -> List[Adjustment]:
    """Suggest trades to rebalance portfolio"""
    adjustments = []

    for position in portfolio.positions:
        current_weight = position.value / portfolio.total_value
        target_weight = portfolio.targets.get(position.symbol, 0)

        drift = current_weight - target_weight

        if abs(drift) > 0.02:  # 2% drift threshold
            adjustments.append(Adjustment(
                symbol=position.symbol,
                current=current_weight,
                target=target_weight,
                action="SELL" if drift > 0 else "BUY"
            ))

    return adjustments
```

### 5. Paper Trade First

Always test strategies in paper trading before live:

```bash
# Paper trading
TRADING_MODE=paper
APCA_API_BASE_URL=https://paper-api.alpaca.markets

# Only switch to live after thorough testing
# TRADING_MODE=live
# APCA_API_BASE_URL=https://api.alpaca.markets
```
