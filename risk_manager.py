"""
Risk Management Framework for LLM Trading Assistant
"""

import math
import numpy as np
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
import logging

@dataclass
class TradeProposal:
    symbol: str
    action: str  # 'BUY', 'SELL'
    quantity: int
    price: float
    stop_loss: float
    profit_target: float
    conviction: float  # 0-1 scale
    rationale: str
    timestamp: datetime

@dataclass
class RiskAssessment:
    approved: bool
    reason: str
    risk_score: float
    position_size_adjustment: float = 1.0
    max_loss_per_trade: float = 0.0

@dataclass
class Position:
    symbol: str
    quantity: int
    avg_price: float
    current_price: float
    unrealized_pnl: float
    sector: str
    asset_class: str

class RiskManager:
    def __init__(self, config):
        self.config = config
        self.logger = logging.getLogger(__name__)
        self.portfolio_value = 0.0
        self.daily_pnl = 0.0
        self.positions: Dict[str, Position] = {}

    def assess_trade(self, proposal: TradeProposal, portfolio_value: float,
                    current_positions: Dict[str, Position]) -> RiskAssessment:
        """Comprehensive risk assessment for trade proposal"""
        self.portfolio_value = portfolio_value
        self.positions = current_positions

        # Check conviction threshold - extremely low for maximum activity
        if proposal.conviction < 0.10:
            return RiskAssessment(
                approved=False,
                reason=f"Conviction too low: {proposal.conviction:.2f} < 0.10",
                risk_score=1.0
            )

        # Position sizing check
        position_size_result = self._check_position_sizing(proposal)
        if not position_size_result[0]:
            return RiskAssessment(
                approved=False,
                reason=position_size_result[1],
                risk_score=1.0
            )

        # Portfolio exposure limits
        exposure_result = self._check_portfolio_exposure(proposal)
        if not exposure_result[0]:
            return RiskAssessment(
                approved=False,
                reason=exposure_result[1],
                risk_score=1.0
            )

        # Circuit breaker check
        if self._check_circuit_breakers():
            return RiskAssessment(
                approved=False,
                reason="Circuit breaker activated - portfolio loss limits exceeded",
                risk_score=1.0
            )

        # Calculate risk score
        risk_score = self._calculate_risk_score(proposal)

        # Determine final approval
        approved = risk_score <= 0.7  # Risk threshold

        return RiskAssessment(
            approved=approved,
            reason="Trade approved" if approved else f"Risk score too high: {risk_score:.2f}",
            risk_score=risk_score,
            position_size_adjustment=self._get_position_size_adjustment(proposal),
            max_loss_per_trade=self.config.max_risk_per_trade * portfolio_value
        )

    def _check_position_sizing(self, proposal: TradeProposal) -> Tuple[bool, str]:
        """Check if position size adheres to risk limits"""
        trade_value = proposal.quantity * proposal.price
        max_trade_value = self.portfolio_value * self.config.max_risk_per_trade

        if trade_value > max_trade_value:
            return False, f"Trade size {trade_value:.2f} exceeds max risk per trade {max_trade_value:.2f}"

        # Check stop loss is defined
        if proposal.stop_loss == 0:
            return False, "Stop loss must be defined for all trades"

        # Calculate actual risk based on stop loss
        if proposal.action == "BUY":
            actual_risk = (proposal.price - proposal.stop_loss) * proposal.quantity
        else:  # SELL
            actual_risk = (proposal.stop_loss - proposal.price) * proposal.quantity

        max_acceptable_risk = self.portfolio_value * self.config.max_risk_per_trade

        if actual_risk > max_acceptable_risk:
            return False, f"Actual risk {actual_risk:.2f} exceeds max acceptable risk {max_acceptable_risk:.2f}"

        return True, "Position sizing approved"

    def _check_portfolio_exposure(self, proposal: TradeProposal) -> Tuple[bool, str]:
        """Check portfolio exposure limits"""
        # Check single security limit
        current_exposure = 0
        if proposal.symbol in self.positions:
            current_exposure = self.positions[proposal.symbol].quantity * self.positions[proposal.symbol].current_price

        new_exposure = current_exposure + (proposal.quantity * proposal.price)
        max_single_security = self.portfolio_value * self.config.max_single_security

        if new_exposure > max_single_security:
            return False, f"Single security exposure {new_exposure:.2f} exceeds limit {max_single_security:.2f}"

        # Check asset class exposure (would need additional metadata)
        # This is a simplified check - real implementation would need sector/asset class mapping

        return True, "Portfolio exposure limits satisfied"

    def _check_circuit_breakers(self) -> bool:
        """Check if circuit breakers should activate"""
        # Daily loss check
        if self.daily_pnl <= (self.portfolio_value * self.config.single_day_loss_circuit_breaker):
            self.logger.warning("Daily loss circuit breaker activated")
            return True

        # Portfolio loss check (would need to calculate from initial value)
        # This is simplified - real implementation would track portfolio performance over time

        return False

    def _calculate_risk_score(self, proposal: TradeProposal) -> float:
        """Calculate comprehensive risk score for the trade"""
        risk_factors = []

        # Conviction factor (higher conviction = lower risk)
        conviction_risk = (1 - proposal.conviction) * 0.3
        risk_factors.append(conviction_risk)

        # Position size factor
        trade_value = proposal.quantity * proposal.price
        if self.portfolio_value > 0:
            size_risk = (trade_value / self.portfolio_value) / self.config.max_risk_per_trade * 0.25
        else:
            # If portfolio value is zero, assume maximum risk for position sizing
            size_risk = 1.0
        risk_factors.append(size_risk)

        # Stop loss distance factor
        if proposal.action == "BUY":
            stop_distance = abs(proposal.price - proposal.stop_loss) / proposal.price
        else:
            stop_distance = abs(proposal.stop_loss - proposal.price) / proposal.price

        stop_risk = min(stop_distance * 2, 0.3)  # Cap at 0.3
        risk_factors.append(stop_risk)

        # Portfolio concentration risk
        concentration_risk = len([p for p in self.positions.values() if p.quantity > 0]) / 20 * 0.15
        risk_factors.append(concentration_risk)

        return sum(risk_factors)

    def _get_position_size_adjustment(self, proposal: TradeProposal) -> float:
        """Calculate position size adjustment based on various factors"""
        # Kelly Criterion implementation (simplified)
        if "Kelly Criterion" in self.config.position_sizing_methods:
            win_rate = proposal.conviction
            avg_win = abs(proposal.profit_target - proposal.price) / proposal.price
            avg_loss = abs(proposal.price - proposal.stop_loss) / proposal.price

            if avg_loss > 0:
                kelly_fraction = (win_rate * avg_win - (1 - win_rate) * avg_loss) / avg_win
                kelly_fraction = max(0, min(kelly_fraction, 0.25))  # Cap Kelly at 25%
                return kelly_fraction / self.config.max_risk_per_trade

        # Volatility adjustment
        if "Volatility-adjusted sizing" in self.config.position_sizing_methods:
            # This would use historical volatility data
            # Simplified: assume higher conviction = lower volatility adjustment
            return proposal.conviction

        return 1.0  # No adjustment

    def calculate_var(self, positions: Dict[str, Position], confidence_level: float = 0.05) -> float:
        """Calculate Value at Risk for current portfolio"""
        if not positions:
            return 0.0

        # Simplified VaR calculation
        # Real implementation would use historical returns, correlations, etc.
        total_value = sum(pos.quantity * pos.current_price for pos in positions.values())
        portfolio_volatility = 0.15  # Assume 15% annual volatility
        daily_volatility = portfolio_volatility / math.sqrt(252)

        # Normal distribution assumption
        z_score = 1.645 if confidence_level == 0.05 else 2.33  # 95% or 99% confidence
        var = total_value * daily_volatility * z_score

        return var

    def update_daily_pnl(self, pnl: float):
        """Update daily P&L for circuit breaker monitoring"""
        self.daily_pnl = pnl
