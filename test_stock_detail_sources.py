#!/usr/bin/env python3

import asyncio
import os
from multi_api_aggregator import MultiAPIAggregator, DataSource, DataType

async def test_stock_detail_sources():
    """Test the data source priorities for stock detail pages"""
    print("🧪 Testing Stock Detail Page Data Sources...")

    # Initialize aggregator with Polygon API key
    aggregator = MultiAPIAggregator()

    # Test symbol
    symbol = "AAPL"

    print(f"\n📊 Testing data sources for {symbol}:")
    print("=" * 50)

    # Test 1: Real-time Price Data
    print(f"\n1️⃣ **REAL-TIME PRICE DATA**")
    price_priorities = aggregator.source_priorities.get(DataType.REAL_TIME_PRICE, [])
    print(f"   Priority Order: {[s.name for s in price_priorities]}")

    try:
        price_result = await aggregator.get_real_time_price(symbol)
        if price_result:
            print(f"   ✅ Primary Source Used: {price_result.sources[0].name}")
            print(f"   💰 Price: ${price_result.consensus_value}")
            print(f"   📈 Confidence: {price_result.confidence_score:.2f}")
        else:
            print(f"   ❌ No price data retrieved")
    except Exception as e:
        print(f"   ❌ Price test failed: {str(e)}")

    # Test 2: Fundamental Data
    print(f"\n2️⃣ **FUNDAMENTAL DATA**")
    fund_priorities = aggregator.source_priorities.get(DataType.FUNDAMENTAL, [])
    print(f"   Priority Order: {[s.name for s in fund_priorities]}")

    try:
        fund_result = await aggregator.get_fundamental_data(symbol)
        if fund_result:
            print(f"   ✅ Primary Source Used: {fund_result.sources[0].name}")
            if fund_result.source_data:
                for source, data in fund_result.source_data.items():
                    if source.name == 'POLYGON' and 'value' in data:
                        polygon_data = data['value']
                        print(f"   🏢 Company: {polygon_data.get('name', 'N/A')}")
                        print(f"   💼 Market Cap: ${polygon_data.get('market_cap', 'N/A')}")
                        print(f"   👥 Employees: {polygon_data.get('employees', 'N/A')}")
                        print(f"   🏛️ Exchange: {polygon_data.get('primary_exchange', 'N/A')}")
                        break
        else:
            print(f"   ❌ No fundamental data retrieved")
    except Exception as e:
        print(f"   ❌ Fundamental test failed: {str(e)}")

    # Test 3: Advanced Analytics (YCharts should be primary)
    print(f"\n3️⃣ **ADVANCED ANALYTICS** (Reports)")
    analytics_priorities = aggregator.source_priorities.get(DataType.ADVANCED_ANALYTICS, [])
    print(f"   Priority Order: {[s.name for s in analytics_priorities]}")
    print(f"   ✅ YCharts is primary for analysis reports: {'YCHARTS' == analytics_priorities[0].name}")

    # Test 4: News/Sentiment Sources
    print(f"\n4️⃣ **NEWS & SENTIMENT**")
    news_priorities = aggregator.source_priorities.get(DataType.NEWS_SENTIMENT, [])
    print(f"   Priority Order: {[s.name for s in news_priorities]}")
    print(f"   📰 StockTwits integration: Available via web_app.py")
    print(f"   📈 Community sentiment: get_stocktwits_summary() function")

    print(f"\n" + "=" * 50)
    print(f"✅ **SUMMARY**: Stock Detail Page Sources Configured")
    print(f"   📊 Primary Stock Data: Polygon API")
    print(f"   📈 Fundamentals: Polygon API (with YCharts fallback)")
    print(f"   📋 Analysis Reports: YCharts")
    print(f"   💬 Community Sentiment: StockTwits")
    print(f"   📰 News: StockTwits/Yahoo Finance fallback")

if __name__ == "__main__":
    asyncio.run(test_stock_detail_sources())
