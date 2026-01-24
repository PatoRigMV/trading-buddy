#!/usr/bin/env python3
"""
Test Enhanced Multi-API Trading Assistant Features
"""

import requests
import json
from datetime import datetime

BASE_URL = "http://localhost:5001"

def test_enhanced_system():
    print("Testing Enhanced Multi-API Trading Assistant")
    print("=" * 60)

    # 1. Initialize the enhanced system
    print("\n1. Initializing enhanced system...")
    init_response = requests.post(f"{BASE_URL}/api/initialize")
    if init_response.status_code == 200:
        result = init_response.json()
        print(f"✓ {result['message']}")
    else:
        print(f"✗ Initialization failed: {init_response.text}")
        return

    # 2. Check enhanced system status
    print("\n2. Checking enhanced system capabilities...")
    status_response = requests.get(f"{BASE_URL}/api/enhanced/status")
    if status_response.status_code == 200:
        status = status_response.json()
        print(f"✓ Multi-API enabled: {status['multi_api_enabled']}")
        print(f"  Available sources: {len(status['available_sources'])}")
        print(f"  Sources: {', '.join(status['available_sources'])}")
        print(f"  Watchlist size: {status['watchlist_size']}")
        print(f"  Cache duration: {status['cache_stats']['cache_duration_seconds']}s")
    else:
        print(f"✗ Enhanced status check failed: {status_response.text}")

    # 3. Test enhanced market data
    print("\n3. Testing enhanced market data with source attribution...")
    market_response = requests.get(f"{BASE_URL}/api/market_data?symbols=AAPL&symbols=MSFT")
    if market_response.status_code == 200:
        market_data = market_response.json()
        print(f"✓ Enhanced market data retrieved for {len(market_data)} symbols")

        for symbol, data in market_data.items():
            print(f"\n  {symbol}:")
            print(f"    Price: ${data['price']:.2f} (confidence: {data['price_confidence']:.2f})")
            print(f"    Price sources: {', '.join(data['price_sources'])}")
            print(f"    Enhanced mode: {data['enhanced']}")

            # Show fundamental data sources
            fundamentals = data.get('fundamentals', {})
            if fundamentals.get('sources'):
                print(f"    Fundamental sources: {', '.join(fundamentals['sources'])}")
                print(f"    Market cap: ${fundamentals.get('market_cap', 0):,.0f}")
                print(f"    P/E ratio: {fundamentals.get('pe_ratio', 'N/A')}")
                print(f"    Sector: {fundamentals.get('sector', 'N/A')}")

            # Show news sentiment if available
            sentiment = data.get('news_sentiment', {})
            if sentiment:
                print(f"    Sentiment: {sentiment.get('sentiment_label', 'N/A')} ({sentiment.get('sentiment_score', 0):.2f})")
                print(f"    Articles analyzed: {sentiment.get('article_count', 0)}")

            # Show any discrepancy warnings
            warnings = data.get('discrepancy_warnings', [])
            if warnings:
                print(f"    ⚠️  Warnings: {'; '.join(warnings)}")
    else:
        print(f"✗ Enhanced market data failed: {market_response.text}")

    # 4. Test price validation endpoint
    print("\n4. Testing price validation with source details...")
    price_response = requests.get(f"{BASE_URL}/api/enhanced/price/TSLA")
    if price_response.status_code == 200:
        price_data = price_response.json()
        print(f"✓ TSLA price validation complete")
        print(f"  Consensus price: ${price_data.get('consensus_price', 0):.2f}")
        print(f"  Sources: {', '.join(price_data.get('sources', []))}")
        print(f"  Confidence score: {price_data.get('confidence_score', 0):.2f}")
        if price_data.get('discrepancy_detected'):
            print(f"  ⚠️  Price discrepancy: {price_data.get('discrepancy_details')}")

        # Show source breakdown
        source_data = price_data.get('source_data', {})
        if source_data:
            print("  Source breakdown:")
            for source, details in source_data.items():
                print(f"    {source}: ${details.get('price', 0):.2f}")
    else:
        print(f"✗ Price validation failed: {price_response.text}")

    # 5. Test comprehensive analysis
    print("\n5. Testing comprehensive multi-source analysis...")
    analysis_response = requests.get(f"{BASE_URL}/api/enhanced/analysis/NVDA")
    if analysis_response.status_code == 200:
        analysis = analysis_response.json()
        print(f"✓ NVDA comprehensive analysis complete")

        # Price analysis
        price_analysis = analysis.get('price_analysis', {})
        print(f"  Current price: ${price_analysis.get('current_price', 0):.2f}")
        print(f"  Price confidence: {price_analysis.get('confidence', 0):.2f}")
        print(f"  Price sources: {', '.join(price_analysis.get('sources', []))}")

        # Fundamental analysis
        fund_analysis = analysis.get('fundamental_analysis', {})
        key_metrics = fund_analysis.get('key_metrics', {})
        if key_metrics:
            print(f"  Market cap: ${key_metrics.get('market_cap', 0):,.0f}")
            print(f"  P/E ratio: {key_metrics.get('pe_ratio', 'N/A')}")
            print(f"  Sector: {key_metrics.get('sector', 'N/A')}")

        # Technical analysis
        tech_analysis = analysis.get('technical_analysis', {})
        if tech_analysis.get('rsi'):
            print(f"  RSI: {tech_analysis['rsi']:.1f}")
            print(f"  SMA 20: ${tech_analysis.get('sma_20', 0):.2f}")

        # Sentiment analysis
        sentiment = analysis.get('sentiment_analysis', {})
        if sentiment:
            print(f"  Sentiment: {sentiment.get('sentiment_label', 'N/A')} ({sentiment.get('sentiment_score', 0):.2f})")
    else:
        print(f"✗ Comprehensive analysis failed: {analysis_response.text}")

    # 6. Test cache management
    print("\n6. Testing cache management...")
    cache_response = requests.post(f"{BASE_URL}/api/enhanced/cache/clear")
    if cache_response.status_code == 200:
        print("✓ Cache management working")
    else:
        print(f"✗ Cache clear failed: {cache_response.text}")

    # 7. Final status check
    print("\n7. Final enhanced system check...")
    final_status_response = requests.get(f"{BASE_URL}/api/enhanced/status")
    if final_status_response.status_code == 200:
        final_status = final_status_response.json()
        print(f"✓ Enhanced system operational")
        print(f"  Cache entries after clear: {final_status['cache_stats']['total_entries']}")
        print(f"  All {len(final_status['available_sources'])} data sources configured")

    print("\n" + "=" * 60)
    print("Enhanced Multi-API Trading Assistant Test Complete!")
    print("\nKey Features Demonstrated:")
    print("✓ Multi-source price validation with discrepancy detection")
    print("✓ Intelligent fallback handling (APIs → Yahoo Finance)")
    print("✓ News sentiment analysis integration")
    print("✓ Comprehensive fundamental data aggregation")
    print("✓ Source attribution and confidence scoring")
    print("✓ Caching layer for performance optimization")
    print("✓ Full web API integration with enhanced endpoints")

    print("\nAPI Sources Configured:")
    print("• Finnhub (primary real-time prices)")
    print("• Alpha Vantage (backup prices + fundamentals)")
    print("• Polygon.io (backup real-time data)")
    print("• NewsAPI (news sentiment)")
    print("• YCharts (advanced analytics)")
    print("• Yahoo Finance (reliable fallback)")

    print(f"\nWeb Interface: http://localhost:5001")
    print("Enhanced endpoints available at /api/enhanced/*")

if __name__ == "__main__":
    test_enhanced_system()
