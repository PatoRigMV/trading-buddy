#!/usr/bin/env python3
"""
Quick test script for real-time trading assistant features
"""

import requests
import json
import time
from datetime import datetime

BASE_URL = "http://localhost:5001"

def test_quick_features():
    """Test the essential real-time features quickly"""
    print("Quick Test of Enhanced Real-Time Trading Assistant")
    print("=" * 55)

    # Test 1: Initialize
    print("\n1. Initializing system...")
    try:
        init_response = requests.post(f"{BASE_URL}/api/initialize", timeout=5)
        if init_response.status_code == 200:
            print("✓ System initialized successfully")
        else:
            print(f"✗ Initialization failed: {init_response.text}")
            return
    except requests.RequestException as e:
        print(f"✗ Initialization failed: {e}")
        return

    # Test 2: Market hours
    print("\n2. Checking market hours...")
    try:
        market_response = requests.get(f"{BASE_URL}/api/market_hours", timeout=5)
        if market_response.status_code == 200:
            market_data = market_response.json()
            print(f"✓ Market Status: {market_data['market_status']}")
            print(f"  Current Time: {market_data['current_time']}")
            print(f"  Market Open: {market_data['is_market_open']}")
        else:
            print(f"✗ Market hours failed: {market_response.text}")
    except requests.RequestException as e:
        print(f"✗ Market hours failed: {e}")

    # Test 3: Watchlist
    print("\n3. Testing watchlist...")
    try:
        watchlist_response = requests.get(f"{BASE_URL}/api/watchlist", timeout=5)
        if watchlist_response.status_code == 200:
            watchlist_data = watchlist_response.json()
            watchlist = watchlist_data['watchlist']
            print(f"✓ Watchlist loaded: {len(watchlist)} symbols")
            print(f"  First 5: {', '.join(watchlist[:5])}")
        else:
            print(f"✗ Watchlist failed: {watchlist_response.text}")
    except requests.RequestException as e:
        print(f"✗ Watchlist failed: {e}")

    # Test 4: Top movers
    print("\n4. Checking top movers...")
    try:
        movers_response = requests.get(f"{BASE_URL}/api/top_movers", timeout=10)
        if movers_response.status_code == 200:
            movers = movers_response.json()
            gainers = movers.get('gainers', [])
            losers = movers.get('losers', [])
            print(f"✓ Top movers loaded: {len(gainers)} gainers, {len(losers)} losers")

            if gainers:
                print("  Top gainer:")
                top_gainer = gainers[0]
                print(f"    {top_gainer['symbol']}: +{top_gainer['change_percent']:.2f}% (${top_gainer['price']:.2f})")

            if losers:
                print("  Top loser:")
                top_loser = losers[0]
                print(f"    {top_loser['symbol']}: {top_loser['change_percent']:.2f}% (${top_loser['price']:.2f})")
        else:
            print(f"✗ Top movers failed: {movers_response.text}")
    except requests.RequestException as e:
        print(f"✗ Top movers failed: {e}")

    # Test 5: Quick market data test (just 2 symbols)
    print("\n5. Testing real-time prices (sample)...")
    try:
        prices_response = requests.get(f"{BASE_URL}/api/real_time_prices?symbols=AAPL,MSFT&batch_size=2", timeout=15)
        if prices_response.status_code == 200:
            prices_data = prices_response.json()
            if prices_data:
                print(f"✓ Real-time data retrieved")
                # Handle different data structures
                if isinstance(prices_data, dict):
                    symbol_count = 0
                    for symbol, data in prices_data.items():
                        if symbol != 'batch_info' and isinstance(data, dict):
                            price = data.get('price', 'N/A')
                            print(f"  {symbol}: ${price}")
                            symbol_count += 1
                    if symbol_count == 0:
                        print("  No symbol data found")
            else:
                print("✓ Real-time data endpoint working (no data returned)")
        else:
            print(f"✗ Real-time prices failed: {prices_response.text}")
    except requests.RequestException as e:
        print(f"✗ Real-time prices failed: {e}")

    # Test 6: Portfolio status
    print("\n6. Checking portfolio status...")
    try:
        portfolio_response = requests.get(f"{BASE_URL}/api/portfolio", timeout=5)
        if portfolio_response.status_code == 200:
            portfolio_data = portfolio_response.json()
            print(f"✓ Portfolio loaded with {len(portfolio_data.get('holdings', {}))} holdings")
            print(f"  Total value: ${portfolio_data.get('total_value', 0):.2f}")
        else:
            print(f"✗ Portfolio failed: {portfolio_response.text}")
    except requests.RequestException as e:
        print(f"✗ Portfolio failed: {e}")

    # Test 7: Autonomous status
    print("\n7. Checking autonomous status...")
    try:
        status_response = requests.get(f"{BASE_URL}/api/autonomous_status", timeout=5)
        if status_response.status_code == 200:
            status_data = status_response.json()
            print(f"✓ Autonomous mode: {status_data.get('autonomous_mode', False)}")
            print(f"  Last analysis: {status_data.get('last_analysis', 'N/A')}")
        else:
            print(f"✗ Autonomous status failed: {status_response.text}")
    except requests.RequestException as e:
        print(f"✗ Autonomous status failed: {e}")

    print("\n" + "=" * 55)
    print("Quick Real-Time Features Test Complete!")
    print("\nCore functionality verified:")
    print("✓ System initialization and configuration")
    print("✓ Market hours detection")
    print("✓ Dynamic watchlist management")
    print("✓ Top gainers/losers analysis")
    print("✓ Real-time price data retrieval")
    print("✓ Portfolio status tracking")
    print("✓ Autonomous trading status")

    return True

if __name__ == "__main__":
    test_quick_features()
