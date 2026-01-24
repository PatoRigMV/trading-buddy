#!/usr/bin/env python3

import asyncio
import os
from multi_api_aggregator import MultiAPIAggregator, DataSource, DataType

async def test_polygon_api():
    """Test Polygon API integration"""
    print("🧪 Testing Polygon API integration...")

    # Initialize aggregator with Polygon API key
    aggregator = MultiAPIAggregator()

    # Check source priorities
    priorities = aggregator.source_priorities.get(DataType.REAL_TIME_PRICE, [])
    print(f"📊 Real-time price source priorities: {[s.name for s in priorities]}")

    if DataSource.POLYGON in priorities:
        print("✅ Polygon is in the priority list")
        polygon_position = priorities.index(DataSource.POLYGON)
        print(f"🎯 Polygon priority position: {polygon_position + 1}")
    else:
        print("❌ Polygon is NOT in the priority list")
        return

    # Test direct Polygon API call
    try:
        print("\n🔍 Testing direct Polygon API call for AAPL...")
        result = await aggregator.get_real_time_price("AAPL")

        if result:
            print(f"✅ Got aggregated data: ${result.consensus_value}")
            print(f"📊 Sources used: {[s.name for s in result.sources]}")
            if result.discrepancy_detected:
                print(f"⚠️ Price discrepancy: {result.discrepancy_details}")
            print(f"🎯 Confidence score: {result.confidence_score:.2f}")
            print(f"📈 Source data: {result.source_data}")
        else:
            print("❌ No data received")

    except Exception as e:
        print(f"❌ Error testing Polygon API: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_polygon_api())
