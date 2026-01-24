#!/usr/bin/env python3
"""
Test script for institutional WebSocket-first bridge integration
"""

import asyncio

async def test_bridge_integration():
    print('🚀 Testing institutional WebSocket-first bridge integration...')

    try:
        from institutional_data_bridge import get_institutional_bridge
        from enhanced_real_time_data import EnhancedRealTimeDataManager
        from multi_api_aggregator import APICredentials

        # Initialize with fallback like the web app does
        api_credentials = APICredentials()
        enhanced_manager = EnhancedRealTimeDataManager(api_credentials)
        await enhanced_manager.initialize()

        bridge = get_institutional_bridge(enhanced_manager)
        print('✅ Institutional bridge created with fallback manager')

        # Initialize
        success = await bridge.initialize()
        print(f'✅ Bridge initialization: {success}')

        # Test connection status
        status = bridge.get_connection_status()
        print(f'📊 Connection status: {status["status"]} (WebSocket: {status["ws_connected"]})')

        # Test data fetch for a small set
        test_symbols = ['AAPL', 'MSFT']
        data = await bridge.get_current_data(test_symbols)
        print(f'📈 Data fetch result: {len(data)} symbols')

        for symbol, market_data in data.items():
            quality_info = f"stale: {market_data.stale}, ws_connected: {market_data.ws_connected}, confidence: {market_data.price_confidence:.2f}"
            print(f'   {symbol}: ${market_data.price:.2f} ({quality_info})')

        # Test API status
        api_status = bridge.get_api_status()
        print(f'🔧 API Status: {api_status["institutional_data_manager"]["status"]}')
        print(f'🎯 Institutional features: {len(api_status["institutional_features"])} active')

        # Test price validation
        price_validation = await bridge.get_price_with_validation('AAPL')
        print(f'💰 Price validation for AAPL: ${price_validation["price"]:.2f} (confidence: {price_validation["confidence"]:.2f})')

        print('✅ Institutional WebSocket-first bridge integration test PASSED')
        return True

    except Exception as e:
        print(f'❌ Bridge integration test FAILED: {str(e)}')
        import traceback
        traceback.print_exc()
        return False
    finally:
        if 'bridge' in locals():
            bridge.destroy()

if __name__ == "__main__":
    result = asyncio.run(test_bridge_integration())
    print(f'🏁 Final result: {"SUCCESS" if result else "FAILED"}')
    exit(0 if result else 1)
