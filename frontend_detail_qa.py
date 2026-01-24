#!/usr/bin/env python3

import asyncio
import aiohttp
import json
from datetime import datetime
from typing import Dict, List, Any

class FrontendDetailQA:
    def __init__(self, base_url: str = "http://127.0.0.1:8000"):
        self.base_url = base_url
        self.session = None

    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()

    async def test_main_frontend(self) -> Dict[str, Any]:
        """Test main frontend loads and contains all tab elements"""
        print("🖥️ Testing Main Frontend Structure...")

        try:
            async with self.session.get(f"{self.base_url}/") as response:
                if response.status != 200:
                    return {"status": "FAIL", "error": f"Frontend returned {response.status}"}

                content = await response.text()

                # Check for main tabs and sections
                tab_checks = {
                    "portfolio_tab": "portfolio" in content.lower(),
                    "watchlist_tab": "watchlist" in content.lower(),
                    "trending_tab": "trending" in content.lower(),
                    "analysis_tab": "analysis" in content.lower(),
                    "chart_container": "chart" in content.lower(),
                    "stock_detail_modal": "modal" in content.lower() or "detail" in content.lower(),
                    "refresh_functionality": "refresh" in content.lower(),
                    "autonomous_controls": "autonomous" in content.lower()
                }

                return {
                    "status": "PASS" if all(tab_checks.values()) else "PARTIAL",
                    "tab_elements": tab_checks,
                    "missing_elements": [k for k, v in tab_checks.items() if not v]
                }

        except Exception as e:
            return {"status": "FAIL", "error": str(e)}

    async def test_stock_detail_apis(self) -> Dict[str, Any]:
        """Test stock detail APIs that feed the frontend"""
        print("📊 Testing Stock Detail APIs...")

        test_symbols = ["AAPL", "MSFT", "GOOGL", "NVDA"]
        results = {}

        for symbol in test_symbols:
            try:
                # Test detailed stock API
                async with self.session.get(f"{self.base_url}/api/stock_detail/{symbol}") as response:
                    if response.status == 200:
                        data = await response.json()

                        # Check required data fields
                        required_fields = [
                            "price_data", "company_info", "financial_metrics",
                            "technical_analysis", "analyst_data"
                        ]

                        missing_fields = [field for field in required_fields if field not in data]

                        # Check price data specifically
                        price_valid = (
                            "current_price" in data.get("price_data", {}) and
                            data["price_data"]["current_price"] > 0
                        )

                        results[symbol] = {
                            "status": "PASS" if not missing_fields and price_valid else "FAIL",
                            "current_price": data.get("price_data", {}).get("current_price", "N/A"),
                            "missing_fields": missing_fields,
                            "price_valid": price_valid,
                            "company_name": data.get("company_info", {}).get("name", "N/A")
                        }
                    else:
                        results[symbol] = {
                            "status": "FAIL",
                            "error": f"HTTP {response.status}",
                            "current_price": "N/A"
                        }

            except Exception as e:
                results[symbol] = {
                    "status": "FAIL",
                    "error": str(e),
                    "current_price": "N/A"
                }

        return results

    async def test_enhanced_watchlist(self) -> Dict[str, Any]:
        """Test enhanced watchlist functionality"""
        print("📋 Testing Enhanced Watchlist...")

        try:
            async with self.session.get(f"{self.base_url}/api/enhanced-watchlist") as response:
                if response.status == 200:
                    data = await response.json()

                    return {
                        "status": "PASS",
                        "symbols_count": len(data.get("symbols", [])),
                        "has_recommendations": "recommendations" in data,
                        "data_structure": list(data.keys()) if isinstance(data, dict) else "Invalid"
                    }
                else:
                    return {"status": "FAIL", "error": f"HTTP {response.status}"}

        except Exception as e:
            return {"status": "FAIL", "error": str(e)}

    async def test_trending_stocks(self) -> Dict[str, Any]:
        """Test trending stocks data"""
        print("🔥 Testing Trending Stocks...")

        try:
            async with self.session.get(f"{self.base_url}/api/trending_stocks") as response:
                if response.status == 200:
                    data = await response.json()

                    symbols = data.get("trending_symbols", [])

                    return {
                        "status": "PASS",
                        "trending_count": len(symbols),
                        "has_symbols": len(symbols) > 0,
                        "sample_symbols": symbols[:5] if symbols else []
                    }
                else:
                    return {"status": "FAIL", "error": f"HTTP {response.status}"}

        except Exception as e:
            return {"status": "FAIL", "error": str(e)}

    async def test_chart_data_integration(self) -> Dict[str, Any]:
        """Test portfolio chart data integration"""
        print("📈 Testing Chart Data Integration...")

        try:
            async with self.session.get(f"{self.base_url}/api/portfolio_history_real?period=1D") as response:
                if response.status == 200:
                    data = await response.json()

                    # Check data structure
                    has_equity = "equity" in data
                    has_timestamps = "timestamp" in data

                    equity_data = data.get("equity", [])
                    timestamp_data = data.get("timestamp", [])

                    return {
                        "status": "PASS" if has_equity and has_timestamps and len(equity_data) > 0 else "FAIL",
                        "data_points": len(equity_data),
                        "has_equity": has_equity,
                        "has_timestamps": has_timestamps,
                        "latest_value": equity_data[-1] if equity_data else "N/A",
                        "timeframe": data.get("timeframe", "N/A")
                    }
                else:
                    return {"status": "FAIL", "error": f"HTTP {response.status}"}

        except Exception as e:
            return {"status": "FAIL", "error": str(e)}

    async def run_frontend_detail_qa(self) -> Dict[str, Any]:
        """Run comprehensive frontend detail QA"""
        print("🔍 Starting Frontend Detail QA...")
        print("=" * 60)

        # Run all tests concurrently
        test_tasks = [
            self.test_main_frontend(),
            self.test_stock_detail_apis(),
            self.test_enhanced_watchlist(),
            self.test_trending_stocks(),
            self.test_chart_data_integration()
        ]

        results = await asyncio.gather(*test_tasks, return_exceptions=True)

        # Compile results
        compiled_results = {
            "timestamp": datetime.now().isoformat(),
            "tests": {
                "main_frontend": results[0],
                "stock_detail_apis": results[1],
                "enhanced_watchlist": results[2],
                "trending_stocks": results[3],
                "chart_data": results[4]
            },
            "summary": {}
        }

        # Calculate summary
        total_tests = 0
        passed_tests = 0

        for test_name, result in compiled_results["tests"].items():
            if isinstance(result, Exception):
                print(f"❌ {test_name}: Exception - {result}")
                continue

            if test_name == "stock_detail_apis":
                # Special handling for multiple symbol tests
                for symbol, symbol_result in result.items():
                    total_tests += 1
                    if symbol_result.get("status") == "PASS":
                        passed_tests += 1
                        print(f"✅ {symbol} Detail API: ${symbol_result.get('current_price', 'N/A')} - {symbol_result.get('company_name', 'N/A')}")
                    else:
                        print(f"❌ {symbol} Detail API: {symbol_result.get('error', 'Unknown error')}")
            else:
                total_tests += 1
                status = result.get("status", "UNKNOWN")
                if status == "PASS":
                    passed_tests += 1
                    print(f"✅ {test_name.replace('_', ' ').title()}: Working correctly")
                else:
                    print(f"❌ {test_name.replace('_', ' ').title()}: {result.get('error', 'Failed')}")

        pass_rate = (passed_tests / total_tests * 100) if total_tests > 0 else 0

        compiled_results["summary"] = {
            "total_tests": total_tests,
            "passed": passed_tests,
            "failed": total_tests - passed_tests,
            "pass_rate": round(pass_rate, 1),
            "overall_status": "PASS" if pass_rate >= 90 else "PARTIAL" if pass_rate >= 70 else "FAIL"
        }

        # Print summary
        print("\n" + "=" * 60)
        print(f"📊 Frontend Detail QA Summary")
        print(f"✅ Pass Rate: {pass_rate:.1f}% ({passed_tests}/{total_tests})")
        print(f"🎯 Overall Status: {compiled_results['summary']['overall_status']}")

        if pass_rate < 100:
            print(f"\n💡 Recommendations:")
            print(f"   - Check failed tests above for specific issues")
            print(f"   - Verify frontend properly displays API data")
            print(f"   - Test manual navigation through all tabs")

        return compiled_results

async def main():
    """Main entry point"""
    async with FrontendDetailQA() as qa:
        results = await qa.run_frontend_detail_qa()

        # Save results
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"frontend_detail_qa_{timestamp}.json"

        try:
            with open(filename, 'w') as f:
                json.dump(results, f, indent=2)
            print(f"\n📄 Detailed report saved: {filename}")
        except Exception as e:
            print(f"\n⚠️ Could not save report: {e}")

if __name__ == "__main__":
    asyncio.run(main())
