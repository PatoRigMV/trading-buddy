"""
Bridge module to connect Python Flask API to TypeScript Trading API
"""

import requests
import logging
from typing import Dict, List, Any, Optional
from datetime import datetime

class TypeScriptAPIBridge:
    def __init__(self, typescript_api_url: str = "http://localhost:3001"):
        self.typescript_api_url = typescript_api_url
        self.logger = logging.getLogger(__name__)
        self.timeout = 5  # 5 second timeout for API calls

    def _make_request(self, endpoint: str, method: str = "GET", **kwargs) -> Optional[Dict[str, Any]]:
        """Make request to TypeScript API with error handling"""
        try:
            url = f"{self.typescript_api_url}{endpoint}"
            response = requests.request(
                method=method,
                url=url,
                timeout=self.timeout,
                **kwargs
            )

            if response.status_code == 200:
                return response.json()
            else:
                self.logger.error(f"TypeScript API error: {response.status_code} - {response.text}")
                return None

        except requests.exceptions.RequestException as e:
            self.logger.error(f"Failed to connect to TypeScript API: {e}")
            return None

    def check_health(self) -> bool:
        """Check if TypeScript API is running"""
        result = self._make_request("/health")
        return result is not None and result.get("status") == "healthy"

    def get_positions(self) -> List[Dict[str, Any]]:
        """Get current trading positions from TypeScript API"""
        result = self._make_request("/positions")
        if result and "positions" in result:
            return result["positions"]
        return []

    def get_orders(self, status: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
        """Get order history from TypeScript API"""
        params = {"limit": str(limit)}
        if status:
            params["status"] = status

        result = self._make_request("/orders", params=params)
        if result and "orders" in result:
            return result["orders"]
        return []

    def get_account(self) -> Dict[str, Any]:
        """Get account information from TypeScript API"""
        result = self._make_request("/account")
        if result and "account" in result:
            return result["account"]
        return {}

    def get_pnl_daily(self) -> Dict[str, Any]:
        """Get daily P&L from TypeScript API"""
        result = self._make_request("/pnl/daily")
        if result:
            return result
        return {}

    def emergency_stop(self) -> Dict[str, Any]:
        """Execute emergency stop via TypeScript API"""
        result = self._make_request("/emergency-stop", method="POST")
        if result:
            return result
        return {"error": "Failed to execute emergency stop"}

    def transform_positions_for_frontend(self, positions: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Transform TypeScript API positions into frontend format"""
        portfolio_positions = {}
        total_value = 0
        total_pnl = 0

        for pos in positions:
            symbol = pos["symbol"]
            market_value = pos["marketValue"]
            unrealized_pnl = pos["unrealizedPl"]

            portfolio_positions[symbol] = {
                "quantity": pos["qty"],
                "avg_price": pos["avgEntryPrice"],
                "current_price": market_value / pos["qty"] if pos["qty"] > 0 else 0,
                "market_value": market_value,
                "unrealized_pnl": unrealized_pnl,
                "unrealized_pnl_pct": pos["unrealizedPlpc"] * 100,  # Convert to percentage
                "side": pos["side"],
                "cost_basis": pos["costBasis"],
                "asset_class": pos.get("assetClass", "us_equity")
            }

            total_value += market_value
            total_pnl += unrealized_pnl

        return {
            "positions": portfolio_positions,
            "summary": {
                "total_positions": len(portfolio_positions),
                "total_market_value": total_value,
                "total_unrealized_pnl": total_pnl,
                "total_unrealized_pnl_pct": (total_pnl / (total_value - total_pnl)) * 100 if (total_value - total_pnl) > 0 else 0
            }
        }

    def transform_account_for_frontend(self, account: Dict[str, Any]) -> Dict[str, Any]:
        """Transform TypeScript API account into frontend format"""
        if not account:
            return {
                "account_value": 100000,
                "cash": 100000,
                "buying_power": 100000,
                "equity": 100000,
                "status": "UNKNOWN"
            }

        return {
            "account_value": account.get("portfolioValue", 100000),
            "cash": account.get("cash", 0),
            "buying_power": account.get("buyingPower", 0),
            "equity": account.get("equity", 100000),
            "status": account.get("status", "ACTIVE"),
            "currency": account.get("currency", "USD"),
            "daytrade_count": account.get("daytradeCount", 0)
        }

    def transform_orders_for_frontend(self, orders: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Transform TypeScript API orders into frontend format"""
        frontend_orders = []

        for order in orders:
            frontend_order = {
                "id": order["id"],
                "symbol": order["symbol"],
                "side": order["side"],
                "quantity": order["qty"],
                "status": order["status"],
                "filled_qty": order["filledQty"],
                "avg_fill_price": order.get("avgFillPrice"),
                "submitted_at": order["submittedAt"],
                "filled_at": order.get("filledAt"),
                "order_type": "limit",  # Default, could be enhanced
                "time_in_force": "day"  # Default, could be enhanced
            }
            frontend_orders.append(frontend_order)

        return frontend_orders

    # Options Trading Methods
    def get_options_positions(self) -> List[Dict[str, Any]]:
        """Get current options positions from TypeScript API"""
        result = self._make_request("/options/positions")
        if result and "positions" in result:
            return result["positions"]
        return []

    def get_options_chain(self, symbol: str) -> Dict[str, Any]:
        """Get options chain for a symbol"""
        result = self._make_request(f"/options/chain/{symbol}")
        if result:
            return result
        return {"calls": [], "puts": [], "expirations": []}

    def get_portfolio_greeks(self) -> Dict[str, Any]:
        """Get portfolio Greeks summary"""
        result = self._make_request("/options/portfolio-greeks")
        if result:
            return result
        return {"delta": 0, "gamma": 0, "theta": 0, "vega": 0, "rho": 0}

    def get_options_quotes(self, symbols: List[str]) -> List[Dict[str, Any]]:
        """Get quotes for multiple options symbols"""
        result = self._make_request("/options/quotes", method="POST", json={"symbols": symbols})
        if result and "quotes" in result:
            return result["quotes"]
        return []

    def get_options_analysis(self, symbol: str) -> Dict[str, Any]:
        """Get options analysis for a symbol"""
        result = self._make_request(f"/options/analysis/{symbol}")
        if result:
            return result
        return {"strategies": [], "iv_rank": 0, "volatility_analysis": {}}

    def get_iv_rank(self, symbol: str) -> Dict[str, Any]:
        """Get implied volatility rank for a symbol"""
        result = self._make_request(f"/options/iv-rank/{symbol}")
        if result:
            return result
        return {"iv_rank": 0, "iv_percentile": 0, "current_iv": 0}

    def analyze_options_strategy(self, strategy_data: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze an options strategy"""
        result = self._make_request("/options/strategies/analyze", method="POST", json=strategy_data)
        if result:
            return result
        return {"profit_loss": [], "break_even_points": [], "max_profit": 0, "max_loss": 0}

    def execute_options_strategy(self, strategy_data: Dict[str, Any]) -> Dict[str, Any]:
        """Execute an options trading strategy"""
        result = self._make_request("/options/strategies/execute", method="POST", json=strategy_data)
        if result:
            return result
        return {"success": False, "error": "Failed to execute strategy"}

    def get_options_orders(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Get options order history"""
        result = self._make_request(f"/options/orders?limit={limit}")
        if result and "orders" in result:
            return result["orders"]
        return []

    def transform_options_positions_for_frontend(self, positions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Transform options positions data for frontend display"""
        frontend_positions = []

        for position in positions:
            frontend_position = {
                'symbol': position.get('symbol', 'Unknown'),
                'option_type': position.get('option_type', 'call'),
                'strike': position.get('strike', 0),
                'expiration': position.get('expiration_date', ''),
                'quantity': int(position.get('qty', 0)),
                'avg_cost': float(position.get('avg_entry_price', 0)),
                'current_price': float(position.get('market_value', 0)) / int(position.get('qty', 1)) if position.get('qty', 1) != 0 else 0,
                'unrealized_pl': float(position.get('unrealized_pl', 0)),
                'unrealized_plpc': float(position.get('unrealized_plpc', 0)),
                'greeks': position.get('greeks', {}),
                'days_to_expiration': position.get('days_to_expiration', 0),
                'iv': position.get('implied_volatility', 0)
            }
            frontend_positions.append(frontend_position)

        return frontend_positions

    def get_portfolio_history(self, period: str = '1D') -> List[Dict[str, Any]]:
        """Get portfolio history - placeholder for now, returns current snapshot"""
        # For now, return current portfolio value as a single data point
        # In the future, this could be enhanced to store/retrieve historical snapshots
        account = self.get_account()
        current_time = datetime.now().isoformat()
        current_value = account.get('equity', 100000)

        # Return single current data point
        return [{
            'timestamp': current_time,
            'value': current_value,
            'return_pct': 0
        }]

# Global instance
typescript_bridge = TypeScriptAPIBridge()
