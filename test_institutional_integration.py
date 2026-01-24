#!/usr/bin/env python3
"""
Test script for institutional WebSocket-first integration
"""

import sys
import os
import asyncio

# Add src path
sys.path.append(os.path.join(os.path.dirname(__file__), 'src'))

async def test_integration():
    print('🚀 Testing institutional WebSocket-first integration...')

    try:
        from institutional_data_integration import get_institutional_data_manager

        manager = get_institutional_data_manager()
        print('✅ Institutional manager created')

        # Initialize
        success = await manager.initialize()
        print(f'✅ Initialization: {success}')

        # Test connection status
        status = manager.get_connection_status()
        print(f'📊 Connection status: {status["status"]}')

        # Test data fetch for a small set
        test_symbols = ['AAPL', 'MSFT']
        data = await manager.get_current_data(test_symbols)
        print(f'📈 Data fetch result: {len(data)} symbols')

        for symbol, market_data in data.items():
            print(f'   {symbol}: ${market_data.price:.2f} (stale: {market_data.stale}, ws_connected: {market_data.ws_connected})')

        # Test API status
        api_status = manager.get_api_status()
        print(f'🔧 API Status: {api_status["institutional_data_manager"]["status"]}')

        print('✅ Institutional WebSocket-first integration test PASSED')
        return True

    except Exception as e:
        print(f'❌ Integration test FAILED: {str(e)}')
        import traceback
        traceback.print_exc()
        return False
    finally:
        if 'manager' in locals():
            manager.destroy()

if __name__ == "__main__":
    result = asyncio.run(test_integration())
    print(f'🏁 Final result: {"SUCCESS" if result else "FAILED"}')
    exit(0 if result else 1)
