#!/usr/bin/env python3
"""
QA Audit Agent for Trading System
Comprehensive testing and validation system for autonomous hedge fund operations
"""

import asyncio
import aiohttp
import json
import time
import logging
import sys
import traceback
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime, timedelta
import subprocess
import os
import signal

@dataclass
class TestResult:
    name: str
    status: str  # 'PASS', 'FAIL', 'WARNING', 'SKIP'
    message: str
    execution_time: float
    details: Optional[Dict] = None
    timestamp: str = ""

    def __post_init__(self):
        if not self.timestamp:
            self.timestamp = datetime.now().isoformat()

class QAAuditAgent:
    def __init__(self, base_url: str = "http://127.0.0.1:8000"):
        self.base_url = base_url
        self.results: List[TestResult] = []
        self.logger = self._setup_logger()
        self.session: Optional[aiohttp.ClientSession] = None

        # Test configuration
        self.timeout = aiohttp.ClientTimeout(total=30)
        self.test_symbols = ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'SPY']

        # System health thresholds
        self.max_response_time = 5.0  # seconds
        self.min_uptime_percentage = 99.0

    def _setup_logger(self) -> logging.Logger:
        """Setup comprehensive logging"""
        logger = logging.getLogger('QA_Audit_Agent')
        logger.setLevel(logging.INFO)

        # Console handler
        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.INFO)

        # File handler
        file_handler = logging.FileHandler(f'qa_audit_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log')
        file_handler.setLevel(logging.DEBUG)

        # Formatter
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        console_handler.setFormatter(formatter)
        file_handler.setFormatter(formatter)

        logger.addHandler(console_handler)
        logger.addHandler(file_handler)

        return logger

    async def __aenter__(self):
        """Async context manager entry"""
        self.session = aiohttp.ClientSession(timeout=self.timeout)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        if self.session:
            await self.session.close()

    def add_result(self, name: str, status: str, message: str, execution_time: float, details: Optional[Dict] = None):
        """Add test result to collection"""
        result = TestResult(name, status, message, execution_time, details)
        self.results.append(result)

        # Log result
        status_emoji = {
            'PASS': '✅',
            'FAIL': '❌',
            'WARNING': '⚠️',
            'SKIP': '⏭️'
        }.get(status, '❓')

        self.logger.info(f"{status_emoji} {name}: {message} ({execution_time:.2f}s)")

        if details:
            self.logger.debug(f"Details: {json.dumps(details, indent=2)}")

    async def test_system_health(self) -> Dict[str, Any]:
        """Test overall system health and availability"""
        self.logger.info("🏥 Testing System Health...")

        health_results = {}

        # Test 1: Basic connectivity
        start_time = time.time()
        try:
            async with self.session.get(f"{self.base_url}/") as response:
                execution_time = time.time() - start_time

                if response.status == 200:
                    self.add_result(
                        "System Connectivity",
                        "PASS",
                        f"System accessible (HTTP {response.status})",
                        execution_time,
                        {"status_code": response.status, "response_time": execution_time}
                    )
                    health_results["connectivity"] = True
                else:
                    self.add_result(
                        "System Connectivity",
                        "FAIL",
                        f"Unexpected status code: {response.status}",
                        execution_time
                    )
                    health_results["connectivity"] = False
        except Exception as e:
            execution_time = time.time() - start_time
            self.add_result(
                "System Connectivity",
                "FAIL",
                f"Connection failed: {str(e)}",
                execution_time
            )
            health_results["connectivity"] = False

        # Test 2: Response time performance
        response_times = []
        for i in range(5):
            start_time = time.time()
            try:
                async with self.session.get(f"{self.base_url}/api/portfolio") as response:
                    response_time = time.time() - start_time
                    response_times.append(response_time)
            except Exception as e:
                self.logger.warning(f"Performance test iteration {i+1} failed: {e}")

        if response_times:
            avg_response_time = sum(response_times) / len(response_times)
            max_response_time = max(response_times)

            if avg_response_time < self.max_response_time:
                self.add_result(
                    "Response Time Performance",
                    "PASS",
                    f"Avg: {avg_response_time:.2f}s, Max: {max_response_time:.2f}s",
                    avg_response_time,
                    {"average": avg_response_time, "maximum": max_response_time, "samples": response_times}
                )
                health_results["performance"] = True
            else:
                self.add_result(
                    "Response Time Performance",
                    "WARNING",
                    f"Slow response times - Avg: {avg_response_time:.2f}s (threshold: {self.max_response_time}s)",
                    avg_response_time
                )
                health_results["performance"] = False

        return health_results

    async def test_backend_apis(self) -> Dict[str, Any]:
        """Comprehensive backend API testing"""
        self.logger.info("🔧 Testing Backend APIs...")

        api_results = {}

        # Critical API endpoints to test
        critical_apis = [
            {"path": "/api/portfolio", "method": "GET", "name": "Portfolio Data"},
            {"path": "/api/portfolio_history_real", "method": "GET", "name": "Portfolio History", "params": {"period": "1D", "timeframe": "15Min"}},
            {"path": "/api/trending_stocks", "method": "GET", "name": "Trending Stocks"},
            {"path": "/api/autonomous_status", "method": "GET", "name": "Agent Status"},
            {"path": "/api/proposals", "method": "GET", "name": "Trade Proposals"},
            {"path": "/api/live_signals", "method": "GET", "name": "Live Signals", "params": {"limit": "10"}},
        ]

        for api in critical_apis:
            start_time = time.time()
            try:
                url = f"{self.base_url}{api['path']}"
                params = api.get('params', {})

                if api['method'] == 'GET':
                    async with self.session.get(url, params=params) as response:
                        execution_time = time.time() - start_time

                        if response.status == 200:
                            data = await response.json()
                            self.add_result(
                                f"API: {api['name']}",
                                "PASS",
                                f"Valid response received (HTTP {response.status})",
                                execution_time,
                                {"status_code": response.status, "data_keys": list(data.keys()) if isinstance(data, dict) else "non-dict"}
                            )
                            api_results[api['name']] = True
                        else:
                            self.add_result(
                                f"API: {api['name']}",
                                "FAIL",
                                f"HTTP {response.status}: {await response.text()}",
                                execution_time
                            )
                            api_results[api['name']] = False

            except Exception as e:
                execution_time = time.time() - start_time
                self.add_result(
                    f"API: {api['name']}",
                    "FAIL",
                    f"Exception: {str(e)}",
                    execution_time
                )
                api_results[api['name']] = False

        return api_results

    async def test_autonomous_agents(self) -> Dict[str, Any]:
        """Test autonomous trading agent functionality"""
        self.logger.info("🤖 Testing Autonomous Agents...")

        agent_results = {}

        # Test 1: Agent Status Endpoint
        start_time = time.time()
        try:
            async with self.session.get(f"{self.base_url}/api/autonomous_status") as response:
                execution_time = time.time() - start_time

                if response.status == 200:
                    status_data = await response.json()
                    self.add_result(
                        "Agent Status Check",
                        "PASS",
                        "Agent status endpoint responsive",
                        execution_time,
                        {"status_data": status_data}
                    )
                    agent_results["status_endpoint"] = True
                else:
                    self.add_result(
                        "Agent Status Check",
                        "FAIL",
                        f"Status endpoint returned HTTP {response.status}",
                        execution_time
                    )
                    agent_results["status_endpoint"] = False
        except Exception as e:
            execution_time = time.time() - start_time
            self.add_result(
                "Agent Status Check",
                "FAIL",
                f"Exception: {str(e)}",
                execution_time
            )
            agent_results["status_endpoint"] = False

        # Test 2: Start Trading API
        start_time = time.time()
        try:
            payload = {"mode": "autonomous"}
            async with self.session.post(
                f"{self.base_url}/api/start_trading",
                json=payload,
                headers={"Content-Type": "application/json"}
            ) as response:
                execution_time = time.time() - start_time

                if response.status == 200:
                    result_data = await response.json()
                    self.add_result(
                        "Autonomous Trading Start",
                        "PASS",
                        f"Trading start API responsive: {result_data.get('status', 'unknown')}",
                        execution_time,
                        {"response": result_data}
                    )
                    agent_results["start_trading"] = True
                else:
                    error_text = await response.text()
                    self.add_result(
                        "Autonomous Trading Start",
                        "FAIL",
                        f"HTTP {response.status}: {error_text}",
                        execution_time
                    )
                    agent_results["start_trading"] = False
        except Exception as e:
            execution_time = time.time() - start_time
            self.add_result(
                "Autonomous Trading Start",
                "FAIL",
                f"Exception: {str(e)}",
                execution_time
            )
            agent_results["start_trading"] = False

        # Test 3: SSE Stream Connectivity (brief test)
        try:
            start_time = time.time()
            # Test SSE endpoint accessibility
            async with self.session.get(f"{self.base_url}/api/agent_stream") as response:
                execution_time = time.time() - start_time

                if response.status == 200:
                    self.add_result(
                        "SSE Stream Endpoint",
                        "PASS",
                        "SSE endpoint accessible",
                        execution_time,
                        {"content_type": response.headers.get('content-type')}
                    )
                    agent_results["sse_stream"] = True
                else:
                    self.add_result(
                        "SSE Stream Endpoint",
                        "WARNING",
                        f"SSE endpoint returned HTTP {response.status}",
                        execution_time
                    )
                    agent_results["sse_stream"] = False
        except Exception as e:
            execution_time = time.time() - start_time
            self.add_result(
                "SSE Stream Endpoint",
                "FAIL",
                f"Exception: {str(e)}",
                execution_time
            )
            agent_results["sse_stream"] = False

        return agent_results

    async def test_market_data_integration(self) -> Dict[str, Any]:
        """Test market data feeds and external integrations"""
        self.logger.info("📊 Testing Market Data Integration...")

        market_results = {}

        # Test 1: Real-time price data
        for symbol in self.test_symbols[:3]:  # Test first 3 symbols
            start_time = time.time()
            try:
                async with self.session.get(f"{self.base_url}/api/stock/{symbol}") as response:
                    execution_time = time.time() - start_time

                    if response.status == 200:
                        data = await response.json()
                        self.add_result(
                            f"Market Data: {symbol}",
                            "PASS",
                            f"Price data received for {symbol}",
                            execution_time,
                            {"symbol": symbol, "has_price": "price" in str(data).lower()}
                        )
                        market_results[f"{symbol}_data"] = True
                    else:
                        self.add_result(
                            f"Market Data: {symbol}",
                            "WARNING",
                            f"No data for {symbol} (HTTP {response.status})",
                            execution_time
                        )
                        market_results[f"{symbol}_data"] = False
            except Exception as e:
                execution_time = time.time() - start_time
                self.add_result(
                    f"Market Data: {symbol}",
                    "FAIL",
                    f"Exception: {str(e)}",
                    execution_time
                )
                market_results[f"{symbol}_data"] = False

        return market_results

    async def test_portfolio_management(self) -> Dict[str, Any]:
        """Test portfolio management functionality"""
        self.logger.info("💼 Testing Portfolio Management...")

        portfolio_results = {}

        # Test 1: Portfolio data retrieval
        start_time = time.time()
        try:
            async with self.session.get(f"{self.base_url}/api/portfolio") as response:
                execution_time = time.time() - start_time

                if response.status == 200:
                    portfolio_data = await response.json()

                    # Validate portfolio data structure
                    required_fields = ['account', 'positions']
                    missing_fields = [field for field in required_fields if field not in portfolio_data]

                    if not missing_fields:
                        self.add_result(
                            "Portfolio Data Structure",
                            "PASS",
                            "All required portfolio fields present",
                            execution_time,
                            {
                                "fields_present": list(portfolio_data.keys()),
                                "account_equity": portfolio_data.get('account', {}).get('equity'),
                                "positions_count": len(portfolio_data.get('positions', {}))
                            }
                        )
                        portfolio_results["data_structure"] = True
                    else:
                        self.add_result(
                            "Portfolio Data Structure",
                            "FAIL",
                            f"Missing required fields: {missing_fields}",
                            execution_time
                        )
                        portfolio_results["data_structure"] = False

                else:
                    self.add_result(
                        "Portfolio Data Structure",
                        "FAIL",
                        f"HTTP {response.status}",
                        execution_time
                    )
                    portfolio_results["data_structure"] = False

        except Exception as e:
            execution_time = time.time() - start_time
            self.add_result(
                "Portfolio Data Structure",
                "FAIL",
                f"Exception: {str(e)}",
                execution_time
            )
            portfolio_results["data_structure"] = False

        # Test 2: Portfolio history data
        start_time = time.time()
        try:
            params = {"period": "1D", "timeframe": "15Min"}
            async with self.session.get(f"{self.base_url}/api/portfolio_history_real", params=params) as response:
                execution_time = time.time() - start_time

                if response.status == 200:
                    history_data = await response.json()

                    # Validate history data
                    if 'equity' in history_data and 'timestamp' in history_data:
                        equity_points = len(history_data.get('equity', []))
                        timestamp_points = len(history_data.get('timestamp', []))

                        if equity_points > 0 and equity_points == timestamp_points:
                            self.add_result(
                                "Portfolio History Data",
                                "PASS",
                                f"Valid history data with {equity_points} data points",
                                execution_time,
                                {"data_points": equity_points, "timeframe": params["timeframe"]}
                            )
                            portfolio_results["history_data"] = True
                        else:
                            self.add_result(
                                "Portfolio History Data",
                                "FAIL",
                                f"Data mismatch - equity: {equity_points}, timestamps: {timestamp_points}",
                                execution_time
                            )
                            portfolio_results["history_data"] = False
                    else:
                        self.add_result(
                            "Portfolio History Data",
                            "FAIL",
                            "Missing required fields in history data",
                            execution_time
                        )
                        portfolio_results["history_data"] = False
                else:
                    self.add_result(
                        "Portfolio History Data",
                        "FAIL",
                        f"HTTP {response.status}",
                        execution_time
                    )
                    portfolio_results["history_data"] = False

        except Exception as e:
            execution_time = time.time() - start_time
            self.add_result(
                "Portfolio History Data",
                "FAIL",
                f"Exception: {str(e)}",
                execution_time
            )
            portfolio_results["history_data"] = False

        return portfolio_results

    async def test_frontend_integration(self) -> Dict[str, Any]:
        """Test frontend functionality and integration"""
        self.logger.info("🖥️ Testing Frontend Integration...")

        frontend_results = {}

        # Test 1: Main page loads
        start_time = time.time()
        try:
            async with self.session.get(f"{self.base_url}/") as response:
                execution_time = time.time() - start_time

                if response.status == 200:
                    content = await response.text()

                    # Check for critical frontend elements
                    critical_elements = [
                        'autoStartAutonomousTrading',  # Auto-start function
                        'fetchRealPortfolioHistory',   # Chart data function
                        'getAdvancedMarketConditions', # Market hours logic
                        'chart-refresh-btn',           # Manual refresh button
                        'startAgentStatusPolling'      # Agent status streaming
                    ]

                    missing_elements = [elem for elem in critical_elements if elem not in content]

                    if not missing_elements:
                        self.add_result(
                            "Frontend Critical Functions",
                            "PASS",
                            "All critical frontend functions present",
                            execution_time,
                            {"elements_checked": critical_elements}
                        )
                        frontend_results["critical_functions"] = True
                    else:
                        self.add_result(
                            "Frontend Critical Functions",
                            "FAIL",
                            f"Missing elements: {missing_elements}",
                            execution_time
                        )
                        frontend_results["critical_functions"] = False

                else:
                    self.add_result(
                        "Frontend Critical Functions",
                        "FAIL",
                        f"Frontend not accessible (HTTP {response.status})",
                        execution_time
                    )
                    frontend_results["critical_functions"] = False

        except Exception as e:
            execution_time = time.time() - start_time
            self.add_result(
                "Frontend Critical Functions",
                "FAIL",
                f"Exception: {str(e)}",
                execution_time
            )
            frontend_results["critical_functions"] = False

        return frontend_results

    def generate_comprehensive_report(self) -> Dict[str, Any]:
        """Generate comprehensive QA audit report"""
        total_tests = len(self.results)
        passed_tests = len([r for r in self.results if r.status == 'PASS'])
        failed_tests = len([r for r in self.results if r.status == 'FAIL'])
        warning_tests = len([r for r in self.results if r.status == 'WARNING'])
        skipped_tests = len([r for r in self.results if r.status == 'SKIP'])

        success_rate = (passed_tests / total_tests * 100) if total_tests > 0 else 0

        # Calculate average execution time
        avg_execution_time = sum(r.execution_time for r in self.results) / len(self.results) if self.results else 0

        # Identify critical failures
        critical_failures = [r for r in self.results if r.status == 'FAIL' and any(
            keyword in r.name.lower() for keyword in ['connectivity', 'trading', 'portfolio', 'agent']
        )]

        report = {
            'timestamp': datetime.now().isoformat(),
            'summary': {
                'total_tests': total_tests,
                'passed': passed_tests,
                'failed': failed_tests,
                'warnings': warning_tests,
                'skipped': skipped_tests,
                'success_rate': round(success_rate, 2),
                'avg_execution_time': round(avg_execution_time, 3)
            },
            'system_status': 'HEALTHY' if success_rate >= 85 and not critical_failures else 'CRITICAL' if critical_failures else 'DEGRADED',
            'critical_failures': [
                {
                    'name': f.name,
                    'message': f.message,
                    'timestamp': f.timestamp
                } for f in critical_failures
            ],
            'recommendations': self._generate_recommendations(),
            'detailed_results': [
                {
                    'name': r.name,
                    'status': r.status,
                    'message': r.message,
                    'execution_time': r.execution_time,
                    'timestamp': r.timestamp,
                    'details': r.details
                } for r in self.results
            ]
        }

        return report

    def _generate_recommendations(self) -> List[str]:
        """Generate actionable recommendations based on test results"""
        recommendations = []

        # Check for performance issues
        slow_tests = [r for r in self.results if r.execution_time > self.max_response_time]
        if slow_tests:
            recommendations.append(f"⚡ Performance optimization needed - {len(slow_tests)} tests exceeded {self.max_response_time}s threshold")

        # Check for connectivity issues
        connectivity_failures = [r for r in self.results if r.status == 'FAIL' and 'connect' in r.name.lower()]
        if connectivity_failures:
            recommendations.append("🔌 Network connectivity issues detected - check system availability")

        # Check for API failures
        api_failures = [r for r in self.results if r.status == 'FAIL' and 'api' in r.name.lower()]
        if api_failures:
            recommendations.append(f"🔧 API endpoint failures detected - {len(api_failures)} endpoints need attention")

        # Check for agent issues
        agent_failures = [r for r in self.results if r.status == 'FAIL' and 'agent' in r.name.lower()]
        if agent_failures:
            recommendations.append("🤖 Autonomous agent issues detected - verify agent processes are running")

        # Success case
        if not recommendations:
            recommendations.append("✅ System operating within acceptable parameters - continue monitoring")

        return recommendations

    async def run_full_audit(self) -> Dict[str, Any]:
        """Run comprehensive end-to-end audit"""
        self.logger.info("🚀 Starting Comprehensive QA Audit...")
        audit_start_time = time.time()

        try:
            # Run all test suites
            await self.test_system_health()
            await self.test_backend_apis()
            await self.test_autonomous_agents()
            await self.test_market_data_integration()
            await self.test_portfolio_management()
            await self.test_frontend_integration()

            # Generate comprehensive report
            report = self.generate_comprehensive_report()
            total_audit_time = time.time() - audit_start_time

            self.logger.info(f"🏁 QA Audit Completed in {total_audit_time:.2f}s")
            self.logger.info(f"📊 Results: {report['summary']['passed']}/{report['summary']['total_tests']} PASSED ({report['summary']['success_rate']}%)")
            self.logger.info(f"🎯 System Status: {report['system_status']}")

            # Save report to file
            report_filename = f"qa_audit_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            with open(report_filename, 'w') as f:
                json.dump(report, f, indent=2)

            self.logger.info(f"📄 Detailed report saved to: {report_filename}")

            return report

        except Exception as e:
            self.logger.error(f"❌ Audit failed with exception: {str(e)}")
            self.logger.error(traceback.format_exc())
            raise

def print_report_summary(report: Dict[str, Any]):
    """Print a formatted summary of the QA report"""
    print("\n" + "="*80)
    print("🔍 QA AUDIT REPORT SUMMARY")
    print("="*80)

    summary = report['summary']
    print(f"📊 Total Tests: {summary['total_tests']}")
    print(f"✅ Passed: {summary['passed']}")
    print(f"❌ Failed: {summary['failed']}")
    print(f"⚠️ Warnings: {summary['warnings']}")
    print(f"⏭️ Skipped: {summary['skipped']}")
    print(f"🎯 Success Rate: {summary['success_rate']}%")
    print(f"⏱️ Avg Execution Time: {summary['avg_execution_time']:.3f}s")
    print(f"🏥 System Status: {report['system_status']}")

    if report['critical_failures']:
        print(f"\n🚨 CRITICAL FAILURES ({len(report['critical_failures'])}):")
        for failure in report['critical_failures']:
            print(f"  ❌ {failure['name']}: {failure['message']}")

    if report['recommendations']:
        print(f"\n💡 RECOMMENDATIONS:")
        for rec in report['recommendations']:
            print(f"  {rec}")

    print("="*80)

async def main():
    """Main execution function"""
    if len(sys.argv) > 1:
        base_url = sys.argv[1]
    else:
        base_url = "http://127.0.0.1:8000"

    print(f"🎯 Starting QA Audit for: {base_url}")

    async with QAAuditAgent(base_url) as qa_agent:
        try:
            report = await qa_agent.run_full_audit()
            print_report_summary(report)

            # Exit with appropriate code
            if report['system_status'] == 'HEALTHY':
                sys.exit(0)
            elif report['system_status'] == 'DEGRADED':
                sys.exit(1)
            else:  # CRITICAL
                sys.exit(2)

        except Exception as e:
            print(f"❌ QA Audit failed: {str(e)}")
            sys.exit(3)

if __name__ == "__main__":
    asyncio.run(main())
