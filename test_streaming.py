#!/usr/bin/env python3
"""
Test script for streaming real-time prices API
"""

import requests
import json
import time

def test_streaming_api():
    print('🚀 Testing progressive streaming API...')

    try:
        url = "http://127.0.0.1:5002/api/real_time_prices/stream?symbols=AAPL,MSFT,GOOGL,AMZN,NVDA"

        print('📡 Connecting to streaming endpoint...')
        response = requests.get(url, stream=True)

        if response.status_code != 200:
            print(f'❌ HTTP Error: {response.status_code}')
            return

        print('✅ Connected! Receiving progressive data...\n')

        start_time = time.time()
        data_received = 0

        for line in response.iter_lines():
            if line:
                line_str = line.decode('utf-8')
                if line_str.startswith('data: '):
                    try:
                        data = json.loads(line_str[6:])  # Remove 'data: ' prefix

                        if data.get('type') == 'metadata':
                            print(f"📊 Starting fetch for {data['total_symbols']} symbols")

                        elif data.get('type') == 'price_data':
                            symbol = data['symbol']
                            price = data['data']['price']
                            progress = data['progress']
                            elapsed = time.time() - start_time

                            print(f"✅ {symbol}: ${price:.2f} "
                                  f"({progress['completed']}/{progress['total']} - "
                                  f"{progress['percentage']:.1f}% - {elapsed:.1f}s)")

                            data_received += 1

                        elif data.get('type') == 'complete':
                            total_time = time.time() - start_time
                            print(f"\n🎉 Complete! Received {data_received} prices in {total_time:.1f}s")
                            print(f"⚡ Average: {total_time/data_received:.1f}s per symbol")
                            break

                        elif data.get('type') == 'error':
                            print(f"❌ Error for {data['symbol']}: {data['error']}")

                    except json.JSONDecodeError as e:
                        print(f"❌ JSON decode error: {e}")

        print('\n🏁 Streaming test completed!')

    except Exception as e:
        print(f'❌ Test failed: {str(e)}')

if __name__ == "__main__":
    test_streaming_api()
