#!/usr/bin/env python3
"""
Basic Trade Example
===================
Demonstrates how to place a paper trade using the Trading Buddy API.

Usage:
    python examples/basic_trade.py

Prerequisites:
    - Trading Buddy server running (make run)
    - Alpaca paper trading keys in .env
"""

import requests
import json

# Configuration
BASE_URL = "http://localhost:8000"


def get_quote(symbol: str) -> dict:
    """Fetch current quote for a symbol."""
    response = requests.get(f"{BASE_URL}/api/quotes/{symbol}")
    return response.json()


def propose_trade(symbol: str, action: str, quantity: int, price: float) -> dict:
    """
    Propose a trade for risk assessment.

    The trade goes through the risk manager before execution.
    """
    payload = {
        "symbol": symbol,
        "action": action,      # "BUY" or "SELL"
        "quantity": quantity,
        "price": price,
        "conviction": 0.75,    # Confidence level (0-1)
        "rationale": "Example trade from basic_trade.py"
    }

    response = requests.post(
        f"{BASE_URL}/api/trade/propose",
        json=payload,
        headers={"Content-Type": "application/json"}
    )
    return response.json()


def get_portfolio() -> dict:
    """Get current portfolio status."""
    response = requests.get(f"{BASE_URL}/api/portfolio")
    return response.json()


def main():
    print("=" * 50)
    print("Trading Buddy - Basic Trade Example")
    print("=" * 50)

    # 1. Check portfolio status
    print("\n📊 Current Portfolio:")
    portfolio = get_portfolio()
    if "error" not in portfolio:
        print(f"   Cash: ${portfolio.get('cash', 0):,.2f}")
        print(f"   Equity: ${portfolio.get('equity', 0):,.2f}")
    else:
        print(f"   Error: {portfolio.get('error')}")

    # 2. Get a quote
    symbol = "AAPL"
    print(f"\n📈 Getting quote for {symbol}...")
    quote = get_quote(symbol)

    if "error" not in quote:
        price = quote.get("price", 0)
        print(f"   Current Price: ${price:.2f}")
    else:
        print(f"   Error: {quote.get('error')}")
        price = 185.00  # Fallback for demo

    # 3. Propose a trade
    print(f"\n🔄 Proposing trade: BUY 10 shares of {symbol}...")
    trade_result = propose_trade(
        symbol=symbol,
        action="BUY",
        quantity=10,
        price=price
    )

    print("\n📋 Trade Proposal Result:")
    print(json.dumps(trade_result, indent=2))

    # 4. Check if approved
    if trade_result.get("approved"):
        print("\n✅ Trade was APPROVED by risk manager")
        print(f"   Risk Score: {trade_result.get('risk_score', 'N/A')}")
    else:
        print("\n❌ Trade was REJECTED by risk manager")
        print(f"   Reason: {trade_result.get('reason', 'Unknown')}")


if __name__ == "__main__":
    main()
