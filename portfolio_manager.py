"""
Portfolio Management System for LLM Trading Assistant
"""

from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
import logging
from risk_manager import Position

@dataclass
class AssetAllocation:
    asset_class: str
    target_percentage: float
    current_percentage: float
    min_percentage: float = 0.0
    max_percentage: float = 1.0

@dataclass
class PortfolioSnapshot:
    timestamp: datetime
    total_value: float
    positions: Dict[str, Position]
    allocations: List[AssetAllocation]
    daily_pnl: float
    unrealized_pnl: float

class PortfolioManager:
    def __init__(self, config):
        self.config = config
        self.logger = logging.getLogger(__name__)
        self.positions: Dict[str, Position] = {}

        # Set initial capital from config or default to $100,000 for paper trading
        initial_capital = getattr(config, 'initial_capital', 100000.0)
        self.cash_balance = initial_capital
        self.total_value = initial_capital

        self.allocation_targets = self._initialize_allocation_targets()
        self.rebalancing_threshold = 0.05  # 5% drift triggers rebalancing

    def _initialize_allocation_targets(self) -> Dict[str, float]:
        """Initialize target allocations for asset classes"""
        num_classes = len(self.config.asset_classes)
        equal_weight = 1.0 / num_classes if num_classes > 0 else 0.0

        return {asset_class: equal_weight for asset_class in self.config.asset_classes}

    def get_current_positions(self) -> Dict[str, Position]:
        """Get current portfolio positions"""
        return self.positions.copy()

    def update_position(self, trade_proposal) -> None:
        """Update position after trade execution"""
        symbol = trade_proposal.symbol

        if symbol in self.positions:
            current_pos = self.positions[symbol]

            if trade_proposal.action == "BUY":
                new_quantity = current_pos.quantity + trade_proposal.quantity
                if new_quantity > 0:
                    # Update average price
                    total_cost = (current_pos.quantity * current_pos.avg_price +
                                trade_proposal.quantity * trade_proposal.price)
                    self.positions[symbol].avg_price = total_cost / new_quantity
                    self.positions[symbol].quantity = new_quantity
                else:
                    # Position closed
                    del self.positions[symbol]

            elif trade_proposal.action == "SELL":
                new_quantity = current_pos.quantity - trade_proposal.quantity
                if new_quantity > 0:
                    self.positions[symbol].quantity = new_quantity
                elif new_quantity == 0:
                    del self.positions[symbol]
                else:
                    self.logger.error(f"Cannot sell more shares than owned for {symbol}")
                    return

        else:
            # New position
            if trade_proposal.action == "BUY":
                self.positions[symbol] = Position(
                    symbol=symbol,
                    quantity=trade_proposal.quantity,
                    avg_price=trade_proposal.price,
                    current_price=trade_proposal.price,
                    unrealized_pnl=0.0,
                    sector="Unknown",  # Would be populated from market data
                    asset_class="Equities"  # Default, would be determined from security type
                )

        self._update_cash_balance(trade_proposal)
        self.logger.info(f"Position updated: {symbol} - {trade_proposal.action} {trade_proposal.quantity} @ {trade_proposal.price}")

    def _update_cash_balance(self, trade_proposal) -> None:
        """Update cash balance after trade"""
        trade_value = trade_proposal.quantity * trade_proposal.price

        if trade_proposal.action == "BUY":
            self.cash_balance -= trade_value
        elif trade_proposal.action == "SELL":
            self.cash_balance += trade_value

    def update_market_prices(self, price_updates: Dict[str, float]) -> None:
        """Update current market prices for all positions"""
        for symbol, new_price in price_updates.items():
            if symbol in self.positions:
                position = self.positions[symbol]
                position.current_price = new_price
                position.unrealized_pnl = (new_price - position.avg_price) * position.quantity

    def get_portfolio_value(self) -> float:
        """Calculate total portfolio value"""
        positions_value = sum(
            pos.quantity * pos.current_price
            for pos in self.positions.values()
        )
        return positions_value + self.cash_balance

    def get_asset_allocation(self) -> Dict[str, float]:
        """Get current asset allocation percentages"""
        total_value = self.get_portfolio_value()
        if total_value == 0:
            return {}

        allocation = {}
        for asset_class in self.config.asset_classes:
            class_value = sum(
                pos.quantity * pos.current_price
                for pos in self.positions.values()
                if pos.asset_class == asset_class
            )
            allocation[asset_class] = class_value / total_value

        return allocation

    def check_rebalancing_needed(self) -> List[str]:
        """Check if portfolio needs rebalancing"""
        current_allocation = self.get_asset_allocation()
        rebalancing_needed = []

        for asset_class, target_pct in self.allocation_targets.items():
            current_pct = current_allocation.get(asset_class, 0.0)
            drift = abs(current_pct - target_pct)

            if drift > self.rebalancing_threshold:
                rebalancing_needed.append(
                    f"{asset_class}: {current_pct:.1%} vs target {target_pct:.1%} (drift: {drift:.1%})"
                )

        return rebalancing_needed

    def get_sector_exposure(self) -> Dict[str, float]:
        """Calculate current sector exposure"""
        total_value = self.get_portfolio_value()
        if total_value == 0:
            return {}

        sector_exposure = {}
        for position in self.positions.values():
            sector = position.sector
            position_value = position.quantity * position.current_price

            if sector in sector_exposure:
                sector_exposure[sector] += position_value / total_value
            else:
                sector_exposure[sector] = position_value / total_value

        return sector_exposure

    def check_sector_limits(self) -> List[str]:
        """Check if any sector exceeds concentration limits"""
        sector_exposure = self.get_sector_exposure()
        violations = []

        for sector, exposure in sector_exposure.items():
            if exposure > self.config.sector_limit:
                violations.append(
                    f"{sector}: {exposure:.1%} exceeds limit {self.config.sector_limit:.1%}"
                )

        return violations

    def generate_portfolio_snapshot(self) -> PortfolioSnapshot:
        """Generate comprehensive portfolio snapshot"""
        current_allocation = self.get_asset_allocation()
        allocations = [
            AssetAllocation(
                asset_class=asset_class,
                target_percentage=self.allocation_targets.get(asset_class, 0.0),
                current_percentage=current_allocation.get(asset_class, 0.0)
            )
            for asset_class in self.config.asset_classes
        ]

        daily_pnl = sum(pos.unrealized_pnl for pos in self.positions.values())

        return PortfolioSnapshot(
            timestamp=datetime.now(),
            total_value=self.get_portfolio_value(),
            positions=self.positions.copy(),
            allocations=allocations,
            daily_pnl=daily_pnl,
            unrealized_pnl=daily_pnl
        )

    def get_available_buying_power(self) -> float:
        """Calculate available buying power considering margin requirements"""
        # Simplified calculation - real implementation would consider margin requirements
        return self.cash_balance * 0.9  # Keep 10% cash buffer
