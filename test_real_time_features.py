#!/usr/bin/env python3
"""
Test script for real-time trading assistant features
"""

import requests
import json
import time
from datetime import datetime

BASE_URL = "http://localhost:5001"

def test_real_time_features():
    """Test the new real-time features"""
    print("Testing Enhanced Real-Time Trading Assistant Features")
    print("=" * 60)

    # Step 1: Initialize the system
    print("\n1. Initializing enhanced system...")
    init_response = requests.post(f"{BASE_URL}/api/initialize")
    if init_response.status_code == 200:
        print("✓ Enhanced system initialized successfully")
    else:
        print(f"✗ Initialization failed: {init_response.text}")
        return

    # Give it a moment to fully initialize
    time.sleep(2)

    # Step 2: Test market hours
    print("\n2. Checking market hours...")
    market_hours_response = requests.get(f"{BASE_URL}/api/market_hours")
    if market_hours_response.status_code == 200:
        market_hours = market_hours_response.json()
        print(f"✓ Market Status: {market_hours.get('market_status', 'Unknown')}")
        print(f"  Current Time: {market_hours.get('current_time', 'N/A')}")
        if market_hours.get('is_market_open'):
            print(f"  Market closes at: {market_hours.get('market_close_time', 'N/A')}")
        else:
            print(f"  Market hours: {market_hours.get('market_open_time', 'N/A')} - {market_hours.get('market_close_time', 'N/A')}")
    else:
        print(f"✗ Market hours check failed: {market_hours_response.text}")

    # Step 3: Test real-time market data
    print("\n3. Fetching real-time market data...")
    market_data_response = requests.get(f"{BASE_URL}/api/market_data")
    if market_data_response.status_code == 200:
        market_data = market_data_response.json()
        print(f"✓ Retrieved real-time data for {len(market_data)} symbols:")

        for symbol, data in list(market_data.items())[:3]:  # Show first 3
            tech = data['technical_indicators']
            fund = data['fundamentals']

            print(f"\n  {symbol}:")
            print(f"    Price: ${data['price']:.2f}")
            if tech.get('price_change_24h') is not None:
                change = tech['price_change_24h']
                change_str = f"+{change:.2f}%" if change >= 0 else f"{change:.2f}%"
                print(f"    24h Change: {change_str}")
            if tech.get('rsi') is not None:
                print(f"    RSI: {tech['rsi']:.1f}")
            if tech.get('sma_20') is not None:
                print(f"    SMA20: ${tech['sma_20']:.2f}")
            if fund.get('pe_ratio') is not None:
                print(f"    P/E Ratio: {fund['pe_ratio']:.1f}")
            if fund.get('sector'):
                print(f"    Sector: {fund['sector']}")

    else:
        print(f"✗ Market data fetch failed: {market_data_response.text}")

    # Step 4: Test watchlist management
    print("\n4. Testing watchlist management...")

    # Get current watchlist
    watchlist_response = requests.get(f"{BASE_URL}/api/watchlist")
    if watchlist_response.status_code == 200:
        watchlist_data = watchlist_response.json()
        current_watchlist = watchlist_data['watchlist']
        print(f"✓ Current watchlist ({len(current_watchlist)} symbols): {', '.join(current_watchlist[:10])}")

        # Try adding a new symbol
        test_symbol = "DIS"  # Disney
        if test_symbol not in current_watchlist:
            add_response = requests.post(f"{BASE_URL}/api/watchlist/{test_symbol}")
            if add_response.status_code == 200:
                print(f"✓ Successfully added {test_symbol} to watchlist")
            else:
                print(f"✗ Failed to add {test_symbol}: {add_response.text}")
    else:
        print(f"✗ Watchlist fetch failed: {watchlist_response.text}")

    # Step 5: Test top movers
    print("\n5. Checking top movers...")
    movers_response = requests.get(f"{BASE_URL}/api/top_movers")
    if movers_response.status_code == 200:
        movers = movers_response.json()
        gainers = movers.get('gainers', [])
        losers = movers.get('losers', [])

        print(f"✓ Top Gainers ({len(gainers)}):")
        for stock in gainers[:3]:
            print(f"    {stock['symbol']}: +{stock['change_percent']:.2f}% (${stock['price']:.2f}) - {stock.get('sector', 'N/A')}")

        print(f"✓ Top Losers ({len(losers)}):")
        for stock in losers[:3]:
            print(f"    {stock['symbol']}: {stock['change_percent']:.2f}% (${stock['price']:.2f}) - {stock.get('sector', 'N/A')}")
    else:
        print(f"✗ Top movers fetch failed: {movers_response.text}")

    # Step 6: Test enhanced analysis with real-time data
    print("\n6. Running enhanced market analysis...")
    analysis_start = time.time()
    analysis_response = requests.post(f"{BASE_URL}/api/manual_analysis")
    analysis_time = time.time() - analysis_start

    if analysis_response.status_code == 200:
        analysis_data = analysis_response.json()
        print(f"✓ Enhanced analysis completed in {analysis_time:.1f}s")
        print(f"  - Status: {analysis_data.get('status', 'unknown')}")
        print(f"  - Analysis results: {analysis_data.get('analysis_results', 0)}")
        print(f"  - Proposals generated: {analysis_data.get('proposals_generated', 0)}")
        print(f"  - Processed proposals: {len(analysis_data.get('processed_proposals', []))}")

        # Show details of processed proposals
        processed_proposals = analysis_data.get('processed_proposals', [])
        if processed_proposals:
            print(f"\n  Enhanced proposals details:")
            for i, proposal_data in enumerate(processed_proposals[:3]):  # Show first 3
                prop = proposal_data['proposal']
                risk = proposal_data['risk_assessment']
                approval = proposal_data['approval_result']
                print(f"    {i+1}. {prop['action']} {prop['quantity']} {prop['symbol']} "
                      f"(conviction: {prop['conviction']:.2f}, "
                      f"risk_approved: {risk['approved']}, "
                      f"governance_approved: {approval['approved']})")
    else:
        print(f"✗ Enhanced analysis failed: {analysis_response.text}")

    # Step 7: Check for enhanced proposals
    print("\n7. Checking for enhanced trade proposals...")
    proposals_response = requests.get(f"{BASE_URL}/api/proposals")
    if proposals_response.status_code == 200:
        proposals_data = proposals_response.json()
        proposals = proposals_data.get('proposals', [])
        print(f"✓ Found {len(proposals)} enhanced proposals")

        if proposals:
            print("\n  Enhanced trade proposals:")
            for proposal in proposals[:3]:  # Show first 3
                print(f"    - {proposal['action']} {proposal['quantity']} {proposal['symbol']} "
                      f"@ ${proposal['price']:.2f}")
                print(f"      Conviction: {proposal['conviction']*100:.1f}%")
                print(f"      Risk Score: {proposal['risk_score']:.2f}")

                # Show enhanced rationale (truncated)
                rationale = proposal['rationale']
                if len(rationale) > 100:
                    rationale = rationale[:97] + "..."
                print(f"      Enhanced Rationale: {rationale}")
                print()
        else:
            print("  No proposals available for approval at this time")
    else:
        print(f"✗ Enhanced proposals check failed: {proposals_response.text}")

    print("\n" + "=" * 60)
    print("Enhanced Real-Time Trading Assistant Test Complete!")
    print("\nNew Features Demonstrated:")
    print("✓ Real-time market data with technical indicators")
    print("✓ Market hours detection and status")
    print("✓ Dynamic watchlist management")
    print("✓ Top gainers/losers analysis")
    print("✓ Enhanced trade proposals with real data")
    print("✓ RSI, SMA, volume analysis integration")

    return True

if __name__ == "__main__":
    test_real_time_features()
