#!/usr/bin/env python3

import asyncio
import aiohttp
import json
import time
import sys
from datetime import datetime
from typing import Dict, List, Any, Optional

class LightQAAgent:
    def __init__(self):
        self.base_url = "http://localhost:8000"
        self.session = None
        self.test_results = {}

    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()

    async def quick_health_check(self) -> Dict[str, Any]:
        """Quick health check - basic connectivity and response times"""
        results = {
            "test_name": "Quick Health Check",
            "timestamp": datetime.now().isoformat(),
            "status": "PASS",
            "details": {},
            "errors": []
        }

        try:
            # Test main page
            start_time = time.time()
            async with self.session.get(f"{self.base_url}/") as response:
                response_time = (time.time() - start_time) * 1000
                results["details"]["main_page"] = {
                    "status_code": response.status,
                    "response_time_ms": round(response_time, 2),
                    "pass": response.status == 200 and response_time < 2000
                }
                if not results["details"]["main_page"]["pass"]:
                    results["status"] = "FAIL"
                    results["errors"].append(f"Main page issues: {response.status}, {response_time}ms")

        except Exception as e:
            results["status"] = "FAIL"
            results["errors"].append(f"Main page error: {str(e)}")

        return results

    async def test_critical_apis(self) -> Dict[str, Any]:
        """Test only the most critical API endpoints quickly"""
        results = {
            "test_name": "Critical APIs",
            "timestamp": datetime.now().isoformat(),
            "status": "PASS",
            "details": {},
            "errors": []
        }

        critical_endpoints = [
            "/api/portfolio_history_real?period=1D",
            "/api/portfolio",
            "/api/autonomous_status",
            "/api/trending_stocks"
        ]

        for endpoint in critical_endpoints:
            try:
                start_time = time.time()
                async with self.session.get(f"{self.base_url}{endpoint}") as response:
                    response_time = (time.time() - start_time) * 1000

                    endpoint_result = {
                        "status_code": response.status,
                        "response_time_ms": round(response_time, 2),
                        "pass": response.status in [200, 201] and response_time < 5000
                    }

                    results["details"][endpoint] = endpoint_result

                    if not endpoint_result["pass"]:
                        results["status"] = "FAIL"
                        results["errors"].append(f"{endpoint}: {response.status}, {response_time}ms")

            except Exception as e:
                results["status"] = "FAIL"
                results["errors"].append(f"{endpoint} error: {str(e)}")
                results["details"][endpoint] = {"error": str(e), "pass": False}

        return results

    async def test_agent_status(self) -> Dict[str, Any]:
        """Quick check if trading agents are responsive"""
        results = {
            "test_name": "Agent Status",
            "timestamp": datetime.now().isoformat(),
            "status": "PASS",
            "details": {},
            "errors": []
        }

        try:
            # Test autonomous status endpoint
            async with self.session.get(f"{self.base_url}/api/autonomous_status") as response:
                if response.status == 200:
                    data = await response.json()
                    results["details"]["autonomous_status"] = {
                        "status_code": response.status,
                        "trading_active": data.get("trading_active", False),
                        "pass": True
                    }
                else:
                    results["status"] = "FAIL"
                    results["errors"].append(f"Autonomous status endpoint failed: {response.status}")

        except Exception as e:
            results["status"] = "FAIL"
            results["errors"].append(f"Agent status error: {str(e)}")

        return results

    async def test_frontend_load(self) -> Dict[str, Any]:
        """Quick frontend functionality test"""
        results = {
            "test_name": "Frontend Load",
            "timestamp": datetime.now().isoformat(),
            "status": "PASS",
            "details": {},
            "errors": []
        }

        try:
            # Test main page loads and contains expected elements
            async with self.session.get(f"{self.base_url}/") as response:
                if response.status == 200:
                    content = await response.text()

                    # Check for key frontend elements
                    checks = {
                        "chart_container": "chart-container" in content or "chartContainer" in content,
                        "agent_controls": "autonomous" in content and "trading" in content,
                        "sse_connection": "EventSource" in content,
                        "api_calls": "fetchRealPortfolioHistory" in content
                    }

                    results["details"]["frontend_elements"] = checks

                    if not all(checks.values()):
                        results["status"] = "FAIL"
                        failed_checks = [k for k, v in checks.items() if not v]
                        results["errors"].append(f"Missing frontend elements: {failed_checks}")

                else:
                    results["status"] = "FAIL"
                    results["errors"].append(f"Frontend load failed: {response.status}")

        except Exception as e:
            results["status"] = "FAIL"
            results["errors"].append(f"Frontend load error: {str(e)}")

        return results

    async def run_light_qa(self) -> Dict[str, Any]:
        """Run light-touch QA suite - fast and focused"""
        print("🔍 Starting Light QA Agent...")
        print("=" * 50)

        start_time = time.time()

        # Run tests concurrently for speed
        test_tasks = [
            self.quick_health_check(),
            self.test_critical_apis(),
            self.test_agent_status(),
            self.test_frontend_load()
        ]

        test_results = await asyncio.gather(*test_tasks, return_exceptions=True)

        # Compile results
        total_time = time.time() - start_time
        passed_tests = 0
        failed_tests = 0
        all_errors = []

        compiled_results = {
            "qa_type": "light",
            "timestamp": datetime.now().isoformat(),
            "total_duration_seconds": round(total_time, 2),
            "tests": {},
            "summary": {},
            "recommendations": []
        }

        for i, result in enumerate(test_results):
            if isinstance(result, Exception):
                test_name = f"test_{i}"
                compiled_results["tests"][test_name] = {
                    "status": "ERROR",
                    "error": str(result)
                }
                failed_tests += 1
                all_errors.append(str(result))
            else:
                test_name = result["test_name"].lower().replace(" ", "_")
                compiled_results["tests"][test_name] = result

                if result["status"] == "PASS":
                    passed_tests += 1
                else:
                    failed_tests += 1
                    all_errors.extend(result.get("errors", []))

        # Generate summary
        total_tests = passed_tests + failed_tests
        pass_rate = (passed_tests / total_tests * 100) if total_tests > 0 else 0

        compiled_results["summary"] = {
            "total_tests": total_tests,
            "passed": passed_tests,
            "failed": failed_tests,
            "pass_rate": round(pass_rate, 1),
            "overall_status": "PASS" if failed_tests == 0 else "FAIL",
            "execution_time": f"{total_time:.2f}s"
        }

        # Generate recommendations
        if failed_tests > 0:
            compiled_results["recommendations"].append("⚠️  Some tests failed - check error details")
            compiled_results["recommendations"].append("🔧 Consider running full QA audit for deeper analysis")

        if pass_rate == 100:
            compiled_results["recommendations"].append("✅ All tests passed - system is healthy")
        elif pass_rate >= 75:
            compiled_results["recommendations"].append("⚡ Most tests passed - minor issues detected")
        else:
            compiled_results["recommendations"].append("🚨 Multiple test failures - investigate immediately")

        # Print results
        self.print_light_results(compiled_results)

        return compiled_results

    def print_light_results(self, results: Dict[str, Any]):
        """Print concise results for light QA"""
        print(f"\n📊 Light QA Results")
        print(f"⏱️  Execution Time: {results['summary']['execution_time']}")
        print(f"✅ Pass Rate: {results['summary']['pass_rate']}% ({results['summary']['passed']}/{results['summary']['total_tests']})")
        print(f"🎯 Overall Status: {results['summary']['overall_status']}")

        if results['summary']['failed'] > 0:
            print(f"\n❌ Failed Tests:")
            for test_name, test_result in results['tests'].items():
                if test_result.get('status') != 'PASS':
                    print(f"   • {test_name}: {test_result.get('status', 'UNKNOWN')}")

        print(f"\n💡 Recommendations:")
        for rec in results['recommendations']:
            print(f"   {rec}")

        print("\n" + "=" * 50)

async def main():
    """Main entry point for light QA agent"""
    if len(sys.argv) > 1 and sys.argv[1] == "--json":
        # JSON output mode for automation
        async with LightQAAgent() as qa:
            results = await qa.run_light_qa()
            print(json.dumps(results, indent=2))
    else:
        # Human-readable output mode
        async with LightQAAgent() as qa:
            results = await qa.run_light_qa()

            # Save results to file
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"/Users/ryanhaigh/trading_assistant/qa_reports/light_qa_{timestamp}.json"

            try:
                import os
                os.makedirs(os.path.dirname(filename), exist_ok=True)
                with open(filename, 'w') as f:
                    json.dump(results, f, indent=2)
                print(f"📄 Report saved: {filename}")
            except Exception as e:
                print(f"⚠️  Could not save report: {e}")

if __name__ == "__main__":
    asyncio.run(main())
