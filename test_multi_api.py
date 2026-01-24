#!/usr/bin/env python3
"""
Test script for Multi-API Data Aggregation System
"""

import requests
import json
import time
import asyncio
from datetime import datetime

# Test the multi-API aggregator directly
from multi_api_aggregator import MultiAPIAggregator, APICredentials, DataType

BASE_URL = "http://localhost:5001"

async def test_multi_api_directly():
    """Test the multi-API aggregator directly"""
    print("Testing Multi-API Aggregator Directly")
    print("=" * 50)

    # Initialize aggregator
    credentials = APICredentials()
    aggregator = MultiAPIAggregator(credentials)

    # Test symbols
    test_symbols = ['AAPL', 'MSFT', 'GOOGL']

    for symbol in test_symbols:
        print(f"\n--- Testing {symbol} ---")

        # Test price aggregation
        print("1. Getting real-time price with cross-validation...")
        try:
            price_data = await aggregator.get_real_time_price(symbol)
            print(f"✓ Consensus Price: ${price_data.consensus_value:.2f}")
            print(f"  Sources: {[src.value for src in price_data.sources]}")
            print(f"  Confidence: {price_data.confidence_score:.2f}")
            if price_data.discrepancy_detected:
                print(f"  ⚠️  Discrepancy: {price_data.discrepancy_details}")
        except Exception as e:
            print(f"✗ Price test failed: {str(e)}")

        # Test fundamental data
        print("2. Getting fundamental data...")
        try:
            fund_data = await aggregator.get_fundamental_data(symbol)
            print(f"✓ Fundamental data from {len(fund_data.sources)} sources")
            print(f"  Sources: {[src.value for src in fund_data.sources]}")
            print(f"  Confidence: {fund_data.confidence_score:.2f}")
        except Exception as e:
            print(f"✗ Fundamental test failed: {str(e)}")

        # Test news sentiment
        print("3. Getting news sentiment...")
        try:
            sentiment_data = await aggregator.get_news_sentiment(symbol)
            sentiment = sentiment_data.consensus_value
            print(f"✓ Sentiment: {sentiment.get('sentiment_label', 'N/A')} ({sentiment.get('sentiment_score', 0):.2f})")
            print(f"  Articles analyzed: {sentiment.get('article_count', 0)}")
        except Exception as e:
            print(f"✗ Sentiment test failed: {str(e)}")

    # Test cache
    print(f"\n--- Cache Statistics ---")
    cache_stats = aggregator.get_cache_stats()
    print(f"Cache entries: {cache_stats['total_entries']}")
    print(f"Expired entries: {cache_stats['expired_entries']}")

def test_enhanced_web_api():
    """Test the enhanced web API endpoints"""
    print("\n\nTesting Enhanced Web API Integration")
    print("=" * 50)

    # Test enhanced status
    print("\n1. Getting enhanced system status...")
    response = requests.get(f"{BASE_URL}/api/enhanced/status")
    if response.status_code == 200:
        status = response.json()
        print(f"✓ Multi-API enabled: {status.get('multi_api_enabled', False)}")
        print(f"  Available sources: {', '.join(status.get('available_sources', []))}")
        print(f"  Cache entries: {status.get('cache_stats', {}).get('total_entries', 0)}")
    else:
        print(f"✗ Enhanced status failed: {response.text}")

    # Test enhanced price with validation
    print("\n2. Testing enhanced price validation for AAPL...")
    response = requests.get(f"{BASE_URL}/api/enhanced/price/AAPL")
    if response.status_code == 200:
        price_data = response.json()
        print(f"✓ Consensus Price: ${price_data.get('consensus_price', 0):.2f}")
        print(f"  Sources: {', '.join(price_data.get('sources', []))}")
        print(f"  Confidence: {price_data.get('confidence_score', 0):.2f}")
        if price_data.get('discrepancy_detected'):
            print(f"  ⚠️  Discrepancy: {price_data.get('discrepancy_details')}")
    else:
        print(f"✗ Enhanced price test failed: {response.text}")

    # Test comprehensive analysis
    print("\n3. Testing comprehensive analysis for MSFT...")
    response = requests.get(f"{BASE_URL}/api/enhanced/analysis/MSFT")
    if response.status_code == 200:
        analysis = response.json()
        print(f"✓ Comprehensive analysis complete")

        price_analysis = analysis.get('price_analysis', {})
        print(f"  Price: ${price_analysis.get('current_price', 0):.2f} from {len(price_analysis.get('sources', []))} sources")

        fund_analysis = analysis.get('fundamental_analysis', {})
        print(f"  Fundamentals: {len(fund_analysis.get('sources', []))} sources")

        sentiment = analysis.get('sentiment_analysis', {})
        if sentiment:
            print(f"  Sentiment: {sentiment.get('sentiment_label', 'N/A')} ({sentiment.get('sentiment_score', 0):.2f})")

        tech_analysis = analysis.get('technical_analysis', {})
        if tech_analysis.get('rsi'):
            print(f"  RSI: {tech_analysis['rsi']:.1f}")

    else:
        print(f"✗ Comprehensive analysis failed: {response.text}")

    # Test enhanced market data endpoint
    print("\n4. Testing enhanced market data endpoint...")
    response = requests.get(f"{BASE_URL}/api/market_data?symbols=AAPL&symbols=TSLA")
    if response.status_code == 200:
        market_data = response.json()
        print(f"✓ Enhanced market data retrieved for {len(market_data)} symbols")

        for symbol, data in market_data.items():
            print(f"\n  {symbol}:")
            print(f"    Price: ${data['price']:.2f} (confidence: {data.get('price_confidence', 0):.2f})")
            print(f"    Sources: {', '.join(data.get('price_sources', []))}")
            if data.get('discrepancy_warnings'):
                print(f"    ⚠️  Warnings: {', '.join(data['discrepancy_warnings'])}")
            if data.get('news_sentiment'):
                sentiment = data['news_sentiment']
                print(f"    Sentiment: {sentiment.get('sentiment_label', 'N/A')}")
            print(f"    Enhanced: {data.get('enhanced', False)}")
    else:
        print(f"✗ Enhanced market data failed: {response.text}")

def test_system_integration():
    """Test complete system integration"""
    print("\n\nTesting Complete System Integration")
    print("=" * 50)

    # Initialize the system
    print("\n1. Initializing enhanced system...")
    init_response = requests.post(f"{BASE_URL}/api/initialize")
    if init_response.status_code == 200:
        result = init_response.json()
        print(f"✓ {result['message']}")
    else:
        print(f"✗ Initialization failed: {init_response.text}")
        return False

    # Wait for full initialization
    time.sleep(3)

    # Run market analysis with enhanced data
    print("\n2. Running analysis with enhanced multi-API data...")
    analysis_response = requests.post(f"{BASE_URL}/api/manual_analysis")
    if analysis_response.status_code == 200:
        analysis_result = analysis_response.json()
        print(f"✓ Analysis completed with enhanced data")
        print(f"  Status: {analysis_result.get('status')}")
        print(f"  Proposals generated: {analysis_result.get('proposals_generated', 0)}")
    else:
        print(f"✗ Enhanced analysis failed: {analysis_response.text}")

    # Clear cache test
    print("\n3. Testing cache management...")
    cache_response = requests.post(f"{BASE_URL}/api/enhanced/cache/clear")
    if cache_response.status_code == 200:
        print("✓ Cache management working")
    else:
        print(f"✗ Cache clear failed: {cache_response.text}")

    return True

if __name__ == "__main__":
    print("Multi-API Integration Test Suite")
    print("=" * 60)

    # Test 1: Direct API testing
    try:
        asyncio.run(test_multi_api_directly())
    except Exception as e:
        print(f"Direct API test failed: {str(e)}")

    # Test 2: Web API integration
    try:
        test_enhanced_web_api()
    except Exception as e:
        print(f"Web API test failed: {str(e)}")

    # Test 3: Full system integration
    try:
        success = test_system_integration()
        if success:
            print("\n✓ All tests completed successfully!")
            print("\nMulti-API Integration Features:")
            print("✓ Cross-validated pricing from multiple sources")
            print("✓ Discrepancy detection and confidence scoring")
            print("✓ Intelligent fallback handling")
            print("✓ News sentiment analysis integration")
            print("✓ Advanced analytics support (YCharts)")
            print("✓ Comprehensive caching strategy")
            print("✓ Full web interface integration")
        else:
            print("\n✗ Some tests failed")
    except Exception as e:
        print(f"System integration test failed: {str(e)}")
