#!/usr/bin/env python3
import requests
import json

def test_api_response():
    print('🔍 Testing API response for real data...')

    try:
        # Test the real-time prices endpoint
        url = "http://127.0.0.1:5002/api/real_time_prices?symbols=AAPL&batch_size=1"
        response = requests.get(url)

        if response.status_code == 200:
            data = response.json()
            print('=== API Response Analysis ===')
            print(f'Response structure: {list(data.keys())}')

            if 'prices' in data and data['prices']:
                for symbol, price_data in data['prices'].items():
                    print(f'{symbol}: ${price_data.get("price", "N/A")}')
                    if 'institutional_grade' in price_data:
                        print(f'  ✅ Institutional: {price_data["institutional_grade"]}')
                        quality = price_data.get("data_quality", {})
                        print(f'  📡 WebSocket: {quality.get("ws_connected", "N/A")}')
                        print(f'  🎯 Confidence: {quality.get("confidence", "N/A")}')
                        print(f'  ⚡ Freshness: {quality.get("freshness_ms", "N/A")}ms')
                    else:
                        print('  ❌ Not institutional grade data')
            else:
                print('❌ No price data in response')
                print(f'Full response: {json.dumps(data, indent=2)}')
        else:
            print(f'❌ API error: {response.status_code}')
            print(f'Response: {response.text}')

    except Exception as e:
        print(f'❌ Test failed: {str(e)}')

if __name__ == "__main__":
    test_api_response()
