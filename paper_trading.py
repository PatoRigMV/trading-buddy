"""
Paper Trading Integration for Testing Trading Assistant
"""

import asyncio
import logging
import json
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
from trade_executor import Order, OrderStatus, OrderType

@dataclass
class PaperAccount:
    account_id: str
    cash_balance: float
    buying_power: float
    positions: Dict[str, int]  # symbol -> quantity
    total_value: float
    unrealized_pnl: float
    realized_pnl: float

@dataclass
class PaperTrade:
    trade_id: str
    symbol: str
    action: str
    quantity: int
    price: float
    timestamp: datetime
    commission: float = 1.0

class PaperTradingAPI:
    def __init__(self, initial_cash: float = 100000):
        self.logger = logging.getLogger(__name__)
        self.account = PaperAccount(
            account_id="PAPER_001",
            cash_balance=initial_cash,
            buying_power=initial_cash,
            positions={},
            total_value=initial_cash,
            unrealized_pnl=0.0,
            realized_pnl=0.0
        )

        self.trade_history: List[PaperTrade] = []
        self.order_history: List[Order] = []
        self.market_prices: Dict[str, float] = {}

        # Load market data simulation
        self._initialize_market_data()

    def _initialize_market_data(self):
        """Initialize simulated market prices"""
        self.market_prices = {
            'AAPL': 150.0,
            'GOOGL': 2500.0,
            'MSFT': 300.0,
            'TSLA': 800.0,
            'NVDA': 400.0,
            'SPY': 450.0,
            'QQQ': 350.0
        }

    async def submit_order(self, order: Order) -> bool:
        """Submit order to paper trading system"""
        try:
            # Validate order
            if not self._validate_order(order):
                order.status = OrderStatus.REJECTED
                return False

            # Execute immediately for paper trading
            success = await self._execute_order(order)

            if success:
                order.status = OrderStatus.FILLED
                order.filled_at = datetime.now()
                self.logger.info(f"Paper trade executed: {order.symbol} {order.action} {order.quantity}")
            else:
                order.status = OrderStatus.REJECTED

            self.order_history.append(order)
            return success

        except Exception as e:
            self.logger.error(f"Order submission failed: {e}")
            order.status = OrderStatus.REJECTED
            return False

    def _validate_order(self, order: Order) -> bool:
        """Validate order for paper trading"""
        # Check if symbol has market data
        if order.symbol not in self.market_prices:
            self.logger.error(f"No market data for {order.symbol}")
            return False

        # Check buying power for buy orders
        if order.action == "BUY":
            current_price = self.market_prices[order.symbol]
            trade_value = order.quantity * current_price

            if trade_value > self.account.buying_power:
                self.logger.error(f"Insufficient buying power: need {trade_value}, have {self.account.buying_power}")
                return False

        # Check position for sell orders
        elif order.action == "SELL":
            current_position = self.account.positions.get(order.symbol, 0)
            if order.quantity > current_position:
                self.logger.error(f"Insufficient position to sell: need {order.quantity}, have {current_position}")
                return False

        return True

    async def _execute_order(self, order: Order) -> bool:
        """Execute order in paper trading account"""
        try:
            current_price = self.market_prices[order.symbol]

            # Apply slippage (simplified)
            slippage = 0.001  # 0.1%
            if order.action == "BUY":
                execution_price = current_price * (1 + slippage)
            else:
                execution_price = current_price * (1 - slippage)

            trade_value = order.quantity * execution_price
            commission = 1.0  # $1 commission

            # Update order
            order.avg_fill_price = execution_price
            order.filled_quantity = order.quantity

            # Update account
            if order.action == "BUY":
                # Deduct cash and commission
                self.account.cash_balance -= (trade_value + commission)
                self.account.buying_power = self.account.cash_balance

                # Add to position
                current_position = self.account.positions.get(order.symbol, 0)
                self.account.positions[order.symbol] = current_position + order.quantity

            elif order.action == "SELL":
                # Add cash minus commission
                self.account.cash_balance += (trade_value - commission)
                self.account.buying_power = self.account.cash_balance

                # Reduce position
                current_position = self.account.positions[order.symbol]
                new_position = current_position - order.quantity

                if new_position == 0:
                    del self.account.positions[order.symbol]
                else:
                    self.account.positions[order.symbol] = new_position

            # Record trade
            trade = PaperTrade(
                trade_id=f"T_{datetime.now().strftime('%Y%m%d%H%M%S')}",
                symbol=order.symbol,
                action=order.action,
                quantity=order.quantity,
                price=execution_price,
                timestamp=datetime.now(),
                commission=commission
            )

            self.trade_history.append(trade)

            # Update account totals
            self._update_account_value()

            return True

        except Exception as e:
            self.logger.error(f"Order execution failed: {e}")
            return False

    def _update_account_value(self):
        """Update total account value"""
        position_value = 0
        unrealized_pnl = 0

        for symbol, quantity in self.account.positions.items():
            current_price = self.market_prices.get(symbol, 0)
            position_value += quantity * current_price

            # Calculate unrealized P&L (simplified - would need cost basis)
            # For now, assume break-even

        self.account.total_value = self.account.cash_balance + position_value
        self.account.unrealized_pnl = unrealized_pnl

    def get_account_info(self) -> PaperAccount:
        """Get current account information"""
        self._update_account_value()
        return self.account

    def get_positions(self) -> Dict[str, Dict[str, Any]]:
        """Get current positions with market values"""
        positions = {}

        for symbol, quantity in self.account.positions.items():
            current_price = self.market_prices.get(symbol, 0)
            positions[symbol] = {
                'quantity': quantity,
                'current_price': current_price,
                'market_value': quantity * current_price,
                'unrealized_pnl': 0  # Simplified
            }

        return positions

    def get_trade_history(self, days: int = 30) -> List[PaperTrade]:
        """Get recent trade history"""
        cutoff_date = datetime.now() - timedelta(days=days)
        return [
            trade for trade in self.trade_history
            if trade.timestamp > cutoff_date
        ]

    def update_market_price(self, symbol: str, price: float):
        """Update market price for simulation"""
        self.market_prices[symbol] = price
        self._update_account_value()

    def reset_account(self, initial_cash: float = 100000):
        """Reset paper trading account"""
        self.account = PaperAccount(
            account_id="PAPER_001",
            cash_balance=initial_cash,
            buying_power=initial_cash,
            positions={},
            total_value=initial_cash,
            unrealized_pnl=0.0,
            realized_pnl=0.0
        )

        self.trade_history.clear()
        self.order_history.clear()
        self.logger.info(f"Paper trading account reset with ${initial_cash}")

    def generate_performance_report(self) -> Dict[str, Any]:
        """Generate paper trading performance report"""
        self._update_account_value()

        # Calculate returns
        initial_value = 100000  # Default starting value
        total_return = (self.account.total_value - initial_value) / initial_value

        # Calculate trade statistics
        total_trades = len(self.trade_history)
        buy_trades = len([t for t in self.trade_history if t.action == "BUY"])
        sell_trades = len([t for t in self.trade_history if t.action == "SELL"])

        total_commissions = sum(t.commission for t in self.trade_history)

        report = {
            "account_summary": asdict(self.account),
            "performance": {
                "total_return": f"{total_return:.2%}",
                "total_return_dollars": self.account.total_value - initial_value,
                "unrealized_pnl": self.account.unrealized_pnl,
                "realized_pnl": self.account.realized_pnl
            },
            "trading_activity": {
                "total_trades": total_trades,
                "buy_orders": buy_trades,
                "sell_orders": sell_trades,
                "total_commissions": total_commissions
            },
            "current_positions": self.get_positions(),
            "generated_at": datetime.now().isoformat()
        }

        # Save report
        filename = f"paper_trading_report_{datetime.now().strftime('%Y%m%d')}.json"
        with open(filename, 'w') as f:
            json.dump(report, f, indent=2, default=str)

        self.logger.info(f"Paper trading report generated: {filename}")
        return report
