#!/usr/bin/env python3
"""
Demo script showing how progressive loading would work in the UI
This simulates how the frontend would fetch stocks individually and display them as they load
"""

import requests
import json
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

# Priority symbols from the expanded list
DEMO_SYMBOLS = [
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA',
    'CRM', 'ADBE', 'NFLX', 'JPM', 'V', 'MA', 'KO'
]

def fetch_symbol_progressive(symbol):
    """Fetch a single symbol using the progressive endpoint"""
    try:
        url = f"http://127.0.0.1:5003/api/real_time_prices/progressive?symbol={symbol}"

        start_time = time.time()
        response = requests.get(url, timeout=30)
        elapsed = time.time() - start_time

        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                price_data = data['data']
                return {
                    'symbol': symbol,
                    'price': price_data['price'],
                    'volume': price_data.get('volume', 'N/A'),
                    'change_percent': price_data.get('change_percent', 0),
                    'fetch_time': elapsed,
                    'success': True
                }

        return {'symbol': symbol, 'success': False, 'error': f'HTTP {response.status_code}', 'fetch_time': elapsed}

    except Exception as e:
        return {'symbol': symbol, 'success': False, 'error': str(e), 'fetch_time': time.time() - start_time}

def simulate_progressive_ui_loading():
    """Simulate how the UI would progressively load and display stocks"""
    print('🚀 Progressive Stock Loading Demo')
    print('=' * 60)
    print('This demonstrates how stocks would appear in the UI as they load...\n')

    # Track results as they come in
    results_received = 0
    total_symbols = len(DEMO_SYMBOLS)
    start_time = time.time()

    print(f'📊 Loading {total_symbols} stocks progressively...\n')

    # Use ThreadPoolExecutor to simulate concurrent AJAX requests
    with ThreadPoolExecutor(max_workers=5) as executor:
        # Submit all requests
        future_to_symbol = {executor.submit(fetch_symbol_progressive, symbol): symbol for symbol in DEMO_SYMBOLS}

        # Process results as they complete (this is the key progressive loading behavior)
        for future in as_completed(future_to_symbol):
            results_received += 1
            result = future.result()

            if result['success']:
                # This simulates how each stock would appear in the UI as it loads
                print(f"✅ {result['symbol']:<6} ${result['price']:>8.2f} "
                      f"Vol: {result['volume']:>12,} "
                      f"Change: {result['change_percent']:>6.2f}% "
                      f"({result['fetch_time']:.1f}s) "
                      f"[{results_received}/{total_symbols}]")
            else:
                print(f"❌ {result['symbol']:<6} Failed: {result['error']} "
                      f"({result['fetch_time']:.1f}s) "
                      f"[{results_received}/{total_symbols}]")

            # Show progress
            progress = (results_received / total_symbols) * 100
            print(f"   📈 Progress: {progress:.1f}% complete\n")

    total_time = time.time() - start_time
    print('=' * 60)
    print(f'🎉 All stocks loaded! Total time: {total_time:.1f}s')
    print(f'⚡ Average: {total_time/total_symbols:.1f}s per symbol')
    print('\n💡 Key Benefits of Progressive Loading:')
    print('   • Users see data immediately as it becomes available')
    print('   • No waiting for entire batch to complete')
    print('   • Better perceived performance and UX')
    print('   • Failed stocks don\'t block others from displaying')

def simulate_batch_vs_progressive():
    """Compare batch loading vs progressive loading"""
    print('\n🔄 Batch vs Progressive Loading Comparison')
    print('=' * 60)

    # Simulate traditional batch loading (how it used to work)
    print('📦 Traditional Batch Loading:')
    print('   ⏳ Wait... Wait... Wait...')
    batch_start = time.time()

    # Simulate batch request (this would take 30+ seconds for all symbols)
    print('   🕐 Fetching all stocks at once...')
    time.sleep(2)  # Simulate the wait time
    batch_time = time.time() - batch_start

    print(f'   ✅ All {len(DEMO_SYMBOLS)} stocks loaded after {batch_time:.1f}s')
    print('   📊 User sees: Nothing... Nothing... Nothing... EVERYTHING AT ONCE!\n')

    # Progressive loading experience
    print('🚀 Progressive Loading:')
    print('   ✅ AAPL appears immediately (2.1s)')
    print('   ✅ MSFT appears next (4.3s)')
    print('   ✅ GOOGL appears next (6.8s)')
    print('   ✅ ... and so on as each completes')
    print('   📊 User sees: Data flowing in continuously!')

if __name__ == "__main__":
    # Run progressive loading demo
    simulate_progressive_ui_loading()

    # Show comparison
    simulate_batch_vs_progressive()
