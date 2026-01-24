#!/usr/bin/env python3
"""
Fetch Quotes Example
====================
Demonstrates how to fetch market data from multiple providers.

Usage:
    python examples/fetch_quotes.py AAPL
    python examples/fetch_quotes.py AAPL MSFT GOOGL

Prerequisites:
    - At least one market data API key in .env (POLYGON_API_KEY or FINNHUB_API_KEY)
"""

import os
import sys
import asyncio
import aiohttp
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


class QuoteFetcher:
    """Fetch quotes from multiple providers with fallback."""

    def __init__(self):
        self.polygon_key = os.getenv("POLYGON_API_KEY")
        self.finnhub_key = os.getenv("FINNHUB_API_KEY")
        self.alpha_vantage_key = os.getenv("ALPHA_VANTAGE_API_KEY")

    async def fetch_polygon(self, session: aiohttp.ClientSession, symbol: str) -> dict:
        """Fetch from Polygon.io"""
        if not self.polygon_key:
            return {"error": "POLYGON_API_KEY not set"}

        url = f"https://api.polygon.io/v2/last/trade/{symbol}"
        params = {"apiKey": self.polygon_key}

        try:
            async with session.get(url, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    if data.get("results"):
                        return {
                            "source": "Polygon",
                            "symbol": symbol,
                            "price": data["results"].get("p"),
                            "size": data["results"].get("s"),
                            "timestamp": datetime.now().isoformat()
                        }
                return {"error": f"Polygon returned {response.status}"}
        except Exception as e:
            return {"error": str(e)}

    async def fetch_finnhub(self, session: aiohttp.ClientSession, symbol: str) -> dict:
        """Fetch from Finnhub"""
        if not self.finnhub_key:
            return {"error": "FINNHUB_API_KEY not set"}

        url = "https://finnhub.io/api/v1/quote"
        params = {"symbol": symbol, "token": self.finnhub_key}

        try:
            async with session.get(url, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    if data.get("c"):  # Current price
                        return {
                            "source": "Finnhub",
                            "symbol": symbol,
                            "price": data["c"],
                            "open": data.get("o"),
                            "high": data.get("h"),
                            "low": data.get("l"),
                            "prev_close": data.get("pc"),
                            "change": data.get("d"),
                            "change_pct": data.get("dp"),
                            "timestamp": datetime.now().isoformat()
                        }
                return {"error": f"Finnhub returned {response.status}"}
        except Exception as e:
            return {"error": str(e)}

    async def fetch_all(self, symbol: str) -> dict:
        """Fetch from all available providers."""
        async with aiohttp.ClientSession() as session:
            tasks = [
                self.fetch_polygon(session, symbol),
                self.fetch_finnhub(session, symbol),
            ]
            results = await asyncio.gather(*tasks)

            return {
                "symbol": symbol,
                "polygon": results[0],
                "finnhub": results[1],
                "best_price": self._get_best_price(results)
            }

    def _get_best_price(self, results: list) -> float:
        """Get the most reliable price from results."""
        prices = []
        for r in results:
            if "price" in r and r["price"]:
                prices.append(r["price"])

        if prices:
            # Return average if multiple sources
            return sum(prices) / len(prices)
        return None


async def main(symbols: list):
    print("=" * 60)
    print("Trading Buddy - Multi-Provider Quote Fetcher")
    print("=" * 60)

    fetcher = QuoteFetcher()

    # Show which APIs are configured
    print("\n📡 Configured Providers:")
    print(f"   Polygon:       {'✅' if fetcher.polygon_key else '❌'}")
    print(f"   Finnhub:       {'✅' if fetcher.finnhub_key else '❌'}")
    print(f"   Alpha Vantage: {'✅' if fetcher.alpha_vantage_key else '❌'}")

    for symbol in symbols:
        print(f"\n{'─' * 60}")
        print(f"📈 Fetching quotes for: {symbol}")
        print("─" * 60)

        results = await fetcher.fetch_all(symbol)

        # Polygon results
        polygon = results["polygon"]
        if "error" not in polygon:
            print(f"\n   Polygon.io:")
            print(f"      Price: ${polygon['price']:.2f}")
        else:
            print(f"\n   Polygon.io: {polygon['error']}")

        # Finnhub results
        finnhub = results["finnhub"]
        if "error" not in finnhub:
            print(f"\n   Finnhub:")
            print(f"      Price:  ${finnhub['price']:.2f}")
            print(f"      Change: {finnhub.get('change_pct', 0):.2f}%")
            print(f"      Range:  ${finnhub.get('low', 0):.2f} - ${finnhub.get('high', 0):.2f}")
        else:
            print(f"\n   Finnhub: {finnhub['error']}")

        # Best price (consensus)
        if results["best_price"]:
            print(f"\n   💰 Best Price (consensus): ${results['best_price']:.2f}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python examples/fetch_quotes.py SYMBOL [SYMBOL2 ...]")
        print("Example: python examples/fetch_quotes.py AAPL MSFT")
        sys.exit(1)

    symbols = [s.upper() for s in sys.argv[1:]]
    asyncio.run(main(symbols))
