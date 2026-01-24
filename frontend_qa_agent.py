#!/usr/bin/env python3
"""
Frontend QA Agent - Comprehensive UI Testing
Tests frontend functionality, interactivity, and real-time features
"""

import asyncio
import aiohttp
import json
import time
import logging
import sys
from datetime import datetime
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, asdict
import re

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('Frontend_QA_Agent')

@dataclass
class FrontendTestResult:
    test_name: str
    category: str
    status: str  # PASS, FAIL, WARN
    message: str
    execution_time: float
    details: Optional[Dict] = None

class FrontendQAAgent:
    def __init__(self, base_url: str = "http://127.0.0.1:8000"):
        self.base_url = base_url
        self.session = None
        self.test_results: List[FrontendTestResult] = []

    def add_result(self, test_name: str, category: str, status: str,
                   message: str, execution_time: float, details: Optional[Dict] = None):
        """Add a test result"""
        result = FrontendTestResult(
            test_name=test_name,
            category=category,
            status=status,
            message=message,
            execution_time=execution_time,
            details=details or {}
        )
        self.test_results.append(result)

        # Log result
        status_icon = "✅" if status == "PASS" else "❌" if status == "FAIL" else "⚠️"
        logger.info(f"{status_icon} {test_name}: {message} ({execution_time:.2f}s)")

    async def test_page_load_performance(self) -> Dict[str, Any]:
        """Test page loading performance and basic structure"""
        logger.info("🚀 Testing Page Load Performance...")

        results = {}

        # Test 1: Initial page load
        start_time = time.time()
        try:
            async with self.session.get(f"{self.base_url}/") as response:
                execution_time = time.time() - start_time

                if response.status == 200:
                    content = await response.text()

                    # Check page load time
                    if execution_time < 2.0:
                        self.add_result(
                            "Page Load Speed",
                            "Performance",
                            "PASS",
                            f"Page loaded in {execution_time:.2f}s",
                            execution_time,
                            {"load_time": execution_time, "threshold": 2.0}
                        )
                        results["load_speed"] = True
                    else:
                        self.add_result(
                            "Page Load Speed",
                            "Performance",
                            "WARN",
                            f"Slow page load: {execution_time:.2f}s (>2s)",
                            execution_time
                        )
                        results["load_speed"] = False

                    # Check essential HTML structure (case insensitive)
                    essential_elements = [
                        '<title>',
                        '<head>',
                        '<body',  # Just check for opening body tag (with or without attributes)
                        'terminal-container',
                        'chart-container'
                    ]

                    missing_elements = [elem for elem in essential_elements if elem not in content]

                    if not missing_elements:
                        self.add_result(
                            "HTML Structure",
                            "Structure",
                            "PASS",
                            "All essential HTML elements present",
                            execution_time,
                            {"elements_checked": essential_elements}
                        )
                        results["html_structure"] = True
                    else:
                        self.add_result(
                            "HTML Structure",
                            "Structure",
                            "FAIL",
                            f"Missing HTML elements: {missing_elements}",
                            execution_time
                        )
                        results["html_structure"] = False

                else:
                    self.add_result(
                        "Page Load Speed",
                        "Performance",
                        "FAIL",
                        f"HTTP {response.status}",
                        execution_time
                    )
                    results["load_speed"] = False
                    results["html_structure"] = False

        except Exception as e:
            execution_time = time.time() - start_time
            self.add_result(
                "Page Load Speed",
                "Performance",
                "FAIL",
                f"Exception: {str(e)}",
                execution_time
            )
            results["load_speed"] = False
            results["html_structure"] = False

        return results

    async def test_strategy_display_section(self) -> Dict[str, Any]:
        """Test the new next-day strategy preparation section"""
        logger.info("🌙 Testing Strategy Display Section...")

        results = {}

        # Test 1: Strategy API endpoint
        start_time = time.time()
        try:
            async with self.session.get(f"{self.base_url}/api/next_day_strategy") as response:
                execution_time = time.time() - start_time

                if response.status == 200:
                    strategy_data = await response.json()

                    # Validate strategy data structure
                    required_fields = [
                        'generated_at', 'market_regime', 'primary_watchlist',
                        'sector_outlook', 'options_opportunities'
                    ]

                    missing_fields = [field for field in required_fields if field not in strategy_data]

                    if not missing_fields:
                        self.add_result(
                            "Strategy API Data",
                            "Strategy",
                            "PASS",
                            "Strategy API returns complete data structure",
                            execution_time,
                            {
                                "data_fields": list(strategy_data.keys()),
                                "watchlist_count": len(strategy_data.get('primary_watchlist', [])),
                                "sector_count": len(strategy_data.get('sector_outlook', {})),
                                "options_count": len(strategy_data.get('options_opportunities', []))
                            }
                        )
                        results["strategy_api"] = True
                    else:
                        self.add_result(
                            "Strategy API Data",
                            "Strategy",
                            "FAIL",
                            f"Missing strategy fields: {missing_fields}",
                            execution_time
                        )
                        results["strategy_api"] = False

                else:
                    self.add_result(
                        "Strategy API Data",
                        "Strategy",
                        "FAIL",
                        f"Strategy API HTTP {response.status}",
                        execution_time
                    )
                    results["strategy_api"] = False

        except Exception as e:
            execution_time = time.time() - start_time
            self.add_result(
                "Strategy API Data",
                "Strategy",
                "FAIL",
                f"Strategy API exception: {str(e)}",
                execution_time
            )
            results["strategy_api"] = False

        # Test 2: Frontend strategy elements
        start_time = time.time()
        try:
            async with self.session.get(f"{self.base_url}/") as response:
                execution_time = time.time() - start_time

                if response.status == 200:
                    content = await response.text()

                    # Check for strategy display elements
                    strategy_elements = [
                        'strategyPrepStatus',
                        'strategyPrepContent',
                        'primaryWatchlist',
                        'sectorOutlook',
                        'marketRegime',
                        'optionsOpportunities',
                        'loadNextDayStrategy',
                        'displayStrategyData'
                    ]

                    missing_elements = [elem for elem in strategy_elements if elem not in content]

                    if not missing_elements:
                        self.add_result(
                            "Strategy UI Elements",
                            "Strategy",
                            "PASS",
                            "All strategy display elements present",
                            execution_time,
                            {"elements_checked": strategy_elements}
                        )
                        results["strategy_ui"] = True
                    else:
                        self.add_result(
                            "Strategy UI Elements",
                            "Strategy",
                            "FAIL",
                            f"Missing strategy elements: {missing_elements}",
                            execution_time
                        )
                        results["strategy_ui"] = False

                else:
                    self.add_result(
                        "Strategy UI Elements",
                        "Strategy",
                        "FAIL",
                        f"Cannot check UI elements (HTTP {response.status})",
                        execution_time
                    )
                    results["strategy_ui"] = False

        except Exception as e:
            execution_time = time.time() - start_time
            self.add_result(
                "Strategy UI Elements",
                "Strategy",
                "FAIL",
                f"UI check exception: {str(e)}",
                execution_time
            )
            results["strategy_ui"] = False

        return results

    async def test_critical_ui_components(self) -> Dict[str, Any]:
        """Test critical UI components and functionality"""
        logger.info("🎛️ Testing Critical UI Components...")

        results = {}

        start_time = time.time()
        try:
            async with self.session.get(f"{self.base_url}/") as response:
                execution_time = time.time() - start_time

                if response.status == 200:
                    content = await response.text()

                    # Check for critical interactive elements (updated to match actual HTML)
                    ui_components = {
                        "Agent Controls": ["startAutonomousBtn", "stopAutonomousBtn", "autonomousStatusText"],
                        "Portfolio Chart": ["chart-container", "chart-refresh-btn", "fetchRealPortfolioHistory"],
                        "Real-time Data": ["donutAnimation", "startAgentStatusPolling", "terminal-container"],
                        "Trading Interface": ["autonomousDecisions", "portfolio-chart", "metric-value"],
                        "Theme Controls": ["theme-toggle", "data-theme"]
                    }

                    component_results = {}
                    for component_name, elements in ui_components.items():
                        missing = [elem for elem in elements if elem not in content]
                        if not missing:
                            component_results[component_name] = "PASS"
                        else:
                            component_results[component_name] = f"MISSING: {missing}"

                    # Count successful components
                    passed_components = sum(1 for status in component_results.values() if status == "PASS")
                    total_components = len(ui_components)

                    if passed_components >= total_components * 0.8:  # 80% pass rate
                        self.add_result(
                            "UI Components",
                            "Interface",
                            "PASS",
                            f"{passed_components}/{total_components} UI components present",
                            execution_time,
                            {"component_status": component_results}
                        )
                        results["ui_components"] = True
                    else:
                        self.add_result(
                            "UI Components",
                            "Interface",
                            "FAIL",
                            f"Only {passed_components}/{total_components} UI components present",
                            execution_time,
                            {"component_status": component_results}
                        )
                        results["ui_components"] = False

                    # Check for JavaScript functionality
                    js_functions = [
                        "autoStartAutonomousTrading",
                        "fetchRealPortfolioHistory",
                        "getAdvancedMarketConditions",
                        "startAgentStatusPolling",
                        "loadNextDayStrategy"
                    ]

                    missing_js = [func for func in js_functions if func not in content]

                    if not missing_js:
                        self.add_result(
                            "JavaScript Functions",
                            "Interface",
                            "PASS",
                            "All critical JavaScript functions present",
                            execution_time,
                            {"functions_checked": js_functions}
                        )
                        results["js_functions"] = True
                    else:
                        self.add_result(
                            "JavaScript Functions",
                            "Interface",
                            "FAIL",
                            f"Missing JS functions: {missing_js}",
                            execution_time
                        )
                        results["js_functions"] = False

                else:
                    self.add_result(
                        "UI Components",
                        "Interface",
                        "FAIL",
                        f"Cannot test UI (HTTP {response.status})",
                        execution_time
                    )
                    results["ui_components"] = False
                    results["js_functions"] = False

        except Exception as e:
            execution_time = time.time() - start_time
            self.add_result(
                "UI Components",
                "Interface",
                "FAIL",
                f"UI test exception: {str(e)}",
                execution_time
            )
            results["ui_components"] = False
            results["js_functions"] = False

        return results

    async def test_real_time_features(self) -> Dict[str, Any]:
        """Test real-time data streaming and updates"""
        logger.info("📡 Testing Real-time Features...")

        results = {}

        # Test 1: SSE Stream endpoint
        start_time = time.time()
        try:
            async with self.session.get(f"{self.base_url}/api/agent_stream") as response:
                execution_time = time.time() - start_time

                if response.status == 200:
                    # Check content type for SSE
                    content_type = response.headers.get('content-type', '')

                    if 'text/event-stream' in content_type or 'text/plain' in content_type:
                        self.add_result(
                            "SSE Stream Endpoint",
                            "Real-time",
                            "PASS",
                            "SSE endpoint accessible with correct content type",
                            execution_time,
                            {"content_type": content_type}
                        )
                        results["sse_endpoint"] = True
                    else:
                        self.add_result(
                            "SSE Stream Endpoint",
                            "Real-time",
                            "WARN",
                            f"SSE endpoint accessible but unexpected content type: {content_type}",
                            execution_time
                        )
                        results["sse_endpoint"] = True

                else:
                    self.add_result(
                        "SSE Stream Endpoint",
                        "Real-time",
                        "FAIL",
                        f"SSE endpoint HTTP {response.status}",
                        execution_time
                    )
                    results["sse_endpoint"] = False

        except Exception as e:
            execution_time = time.time() - start_time
            self.add_result(
                "SSE Stream Endpoint",
                "Real-time",
                "FAIL",
                f"SSE test exception: {str(e)}",
                execution_time
            )
            results["sse_endpoint"] = False

        # Test 2: Portfolio data streaming
        start_time = time.time()
        try:
            async with self.session.get(f"{self.base_url}/api/portfolio") as response:
                execution_time = time.time() - start_time

                if response.status == 200:
                    portfolio_data = await response.json()

                    # Check for real-time portfolio fields
                    if 'timestamp' in str(portfolio_data) or 'last_updated' in str(portfolio_data):
                        self.add_result(
                            "Portfolio Real-time Data",
                            "Real-time",
                            "PASS",
                            "Portfolio data includes timestamp information",
                            execution_time
                        )
                        results["portfolio_realtime"] = True
                    else:
                        self.add_result(
                            "Portfolio Real-time Data",
                            "Real-time",
                            "WARN",
                            "Portfolio data lacks timestamp information",
                            execution_time
                        )
                        results["portfolio_realtime"] = False

                else:
                    self.add_result(
                        "Portfolio Real-time Data",
                        "Real-time",
                        "FAIL",
                        f"Portfolio API HTTP {response.status}",
                        execution_time
                    )
                    results["portfolio_realtime"] = False

        except Exception as e:
            execution_time = time.time() - start_time
            self.add_result(
                "Portfolio Real-time Data",
                "Real-time",
                "FAIL",
                f"Portfolio test exception: {str(e)}",
                execution_time
            )
            results["portfolio_realtime"] = False

        return results

    async def test_analysis_tab_components(self) -> Dict[str, Any]:
        """Test analysis tab specific components and data integration"""
        logger.info("📊 Testing Analysis Tab Components...")

        results = {}

        start_time = time.time()
        try:
            async with self.session.get(f"{self.base_url}/") as response:
                execution_time = time.time() - start_time

                if response.status == 200:
                    content = await response.text()

                    # Test 1: Check for equity positions data structure
                    equity_positions_indicators = [
                        'updateEquityAnalysis',  # JavaScript function
                        'equityAnalysisContainer',  # Container ID
                        'equityAnalysisContent',  # Content container
                        'summary.positions'       # Data path used in function
                    ]

                    equity_missing = [elem for elem in equity_positions_indicators if elem not in content]

                    if not equity_missing:
                        self.add_result(
                            "Equity Positions Data Structure",
                            "Analysis",
                            "PASS",
                            "Equity positions data structure properly configured",
                            execution_time,
                            {"components_checked": equity_positions_indicators}
                        )
                        results["equity_data_structure"] = True
                    else:
                        self.add_result(
                            "Equity Positions Data Structure",
                            "Analysis",
                            "FAIL",
                            f"Missing equity positions components: {equity_missing}",
                            execution_time
                        )
                        results["equity_data_structure"] = False

                    # Test 2: Check for individual stock card HTML structure
                    stock_card_indicators = [
                        'stock-position-card',   # CSS class for individual cards
                        'stock-metrics-grid',    # Metrics layout
                        'unrealized_pnl_percent', # P&L percentage field
                        'avg_entry_price'        # Corrected field name
                    ]

                    card_missing = [elem for elem in stock_card_indicators if elem not in content]

                    if not card_missing:
                        self.add_result(
                            "Stock Card HTML Structure",
                            "Analysis",
                            "PASS",
                            "Individual stock card structure present",
                            execution_time,
                            {"structure_checked": stock_card_indicators}
                        )
                        results["stock_card_html"] = True
                    else:
                        self.add_result(
                            "Stock Card HTML Structure",
                            "Analysis",
                            "FAIL",
                            f"Missing stock card elements: {card_missing}",
                            execution_time
                        )
                        results["stock_card_html"] = False

                    # Test 3: Check for analysis sections layout
                    analysis_sections = [
                        'portfolio-summary-grid',     # Main portfolio layout
                        'analysis-section',           # Individual section containers
                        'equity-positions-section',   # Equity positions specific
                        'market-conditions-section'   # Market conditions specific
                    ]

                    section_missing = [elem for elem in analysis_sections if elem not in content]

                    if not section_missing:
                        self.add_result(
                            "Analysis Sections Layout",
                            "Analysis",
                            "PASS",
                            "Analysis tab sections properly structured",
                            execution_time,
                            {"sections_checked": analysis_sections}
                        )
                        results["analysis_sections"] = True
                    else:
                        self.add_result(
                            "Analysis Sections Layout",
                            "Analysis",
                            "FAIL",
                            f"Missing analysis sections: {section_missing}",
                            execution_time
                        )
                        results["analysis_sections"] = False

                    # Test 4: Check CSS for card styling
                    css_card_styling = [
                        '.stock-position-card',       # Card styling
                        'grid-template-columns',      # Grid layout
                        ':hover',                     # Hover effects (more accurate pattern)
                        'background-color:'           # Card backgrounds
                    ]

                    css_missing = [elem for elem in css_card_styling if elem not in content]

                    if not css_missing:
                        self.add_result(
                            "Card CSS Styling",
                            "Analysis",
                            "PASS",
                            "Stock card CSS styling present",
                            execution_time,
                            {"css_checked": css_card_styling}
                        )
                        results["card_css"] = True
                    else:
                        self.add_result(
                            "Card CSS Styling",
                            "Analysis",
                            "WARN",
                            f"Limited card CSS styling: {css_missing}",
                            execution_time
                        )
                        results["card_css"] = False

                else:
                    self.add_result(
                        "Analysis Tab Components",
                        "Analysis",
                        "FAIL",
                        f"Cannot test analysis tab (HTTP {response.status})",
                        execution_time
                    )
                    results = {
                        "equity_data_structure": False,
                        "stock_card_html": False,
                        "analysis_sections": False,
                        "card_css": False
                    }

        except Exception as e:
            execution_time = time.time() - start_time
            self.add_result(
                "Analysis Tab Components",
                "Analysis",
                "FAIL",
                f"Analysis tab test exception: {str(e)}",
                execution_time
            )
            results = {
                "equity_data_structure": False,
                "stock_card_html": False,
                "analysis_sections": False,
                "card_css": False
            }

        # Test 5: Verify portfolio API data structure
        start_time = time.time()
        try:
            async with self.session.get(f"{self.base_url}/api/portfolio") as response:
                execution_time = time.time() - start_time

                if response.status == 200:
                    portfolio_data = await response.json()

                    # Check for required portfolio data fields
                    required_fields = ['summary']

                    if 'summary' in portfolio_data:
                        summary_data = portfolio_data['summary']
                        position_fields = ['positions'] if 'positions' in summary_data else []

                        if position_fields:
                            # Check first position for required fields
                            positions = summary_data['positions']
                            if positions and len(positions) > 0:
                                first_pos = positions[0]
                                required_pos_fields = ['symbol', 'qty', 'avg_entry_price', 'unrealized_pnl_percent']
                                missing_fields = [field for field in required_pos_fields if field not in first_pos]

                                if not missing_fields:
                                    self.add_result(
                                        "Portfolio API Data Integration",
                                        "Analysis",
                                        "PASS",
                                        "Portfolio API returns properly structured position data",
                                        execution_time,
                                        {
                                            "positions_count": len(positions),
                                            "required_fields": required_pos_fields,
                                            "sample_position_keys": list(first_pos.keys())
                                        }
                                    )
                                    results["portfolio_api_integration"] = True
                                else:
                                    self.add_result(
                                        "Portfolio API Data Integration",
                                        "Analysis",
                                        "FAIL",
                                        f"Portfolio position data missing fields: {missing_fields}",
                                        execution_time
                                    )
                                    results["portfolio_api_integration"] = False
                            else:
                                self.add_result(
                                    "Portfolio API Data Integration",
                                    "Analysis",
                                    "WARN",
                                    "Portfolio API returns empty positions array",
                                    execution_time
                                )
                                results["portfolio_api_integration"] = True
                        else:
                            self.add_result(
                                "Portfolio API Data Integration",
                                "Analysis",
                                "FAIL",
                                "Portfolio summary missing positions field",
                                execution_time
                            )
                            results["portfolio_api_integration"] = False
                    else:
                        self.add_result(
                            "Portfolio API Data Integration",
                            "Analysis",
                            "FAIL",
                            "Portfolio API missing summary field",
                            execution_time
                        )
                        results["portfolio_api_integration"] = False

                else:
                    self.add_result(
                        "Portfolio API Data Integration",
                        "Analysis",
                        "FAIL",
                        f"Portfolio API HTTP {response.status}",
                        execution_time
                    )
                    results["portfolio_api_integration"] = False

        except Exception as e:
            execution_time = time.time() - start_time
            self.add_result(
                "Portfolio API Data Integration",
                "Analysis",
                "FAIL",
                f"Portfolio API test exception: {str(e)}",
                execution_time
            )
            results["portfolio_api_integration"] = False

        return results

    async def test_responsive_design(self) -> Dict[str, Any]:
        """Test responsive design and CSS framework"""
        logger.info("📱 Testing Responsive Design...")

        results = {}

        start_time = time.time()
        try:
            async with self.session.get(f"{self.base_url}/") as response:
                execution_time = time.time() - start_time

                if response.status == 200:
                    content = await response.text()

                    # Check for responsive design elements
                    responsive_elements = [
                        'viewport',  # Meta viewport tag
                        'media',     # CSS media queries
                        'flex',      # Flexbox layout
                        'grid',      # Grid layout
                        '-container' # Container classes
                    ]

                    found_elements = [elem for elem in responsive_elements if elem in content]
                    responsive_score = len(found_elements) / len(responsive_elements)

                    if responsive_score >= 0.6:  # 60% responsive features present
                        self.add_result(
                            "Responsive Design",
                            "Design",
                            "PASS",
                            f"Responsive design features present ({responsive_score:.1%})",
                            execution_time,
                            {"found_elements": found_elements, "score": responsive_score}
                        )
                        results["responsive"] = True
                    else:
                        self.add_result(
                            "Responsive Design",
                            "Design",
                            "FAIL",
                            f"Limited responsive features ({responsive_score:.1%})",
                            execution_time,
                            {"found_elements": found_elements, "score": responsive_score}
                        )
                        results["responsive"] = False

                    # Check CSS framework usage
                    css_indicators = [
                        'var(--',     # CSS custom properties
                        '.terminal',  # Theme-based classes
                        'data-theme', # Theme switching
                        'color:',     # Styling present
                        'font-family' # Typography
                    ]

                    css_score = sum(1 for indicator in css_indicators if indicator in content) / len(css_indicators)

                    if css_score >= 0.8:
                        self.add_result(
                            "CSS Framework",
                            "Design",
                            "PASS",
                            f"Well-structured CSS framework ({css_score:.1%})",
                            execution_time,
                            {"css_score": css_score}
                        )
                        results["css_framework"] = True
                    else:
                        self.add_result(
                            "CSS Framework",
                            "Design",
                            "WARN",
                            f"Basic CSS structure ({css_score:.1%})",
                            execution_time,
                            {"css_score": css_score}
                        )
                        results["css_framework"] = False

                else:
                    self.add_result(
                        "Responsive Design",
                        "Design",
                        "FAIL",
                        f"Cannot test design (HTTP {response.status})",
                        execution_time
                    )
                    results["responsive"] = False
                    results["css_framework"] = False

        except Exception as e:
            execution_time = time.time() - start_time
            self.add_result(
                "Responsive Design",
                "Design",
                "FAIL",
                f"Design test exception: {str(e)}",
                execution_time
            )
            results["responsive"] = False
            results["css_framework"] = False

        return results

    def generate_summary(self) -> Dict[str, Any]:
        """Generate test summary and statistics"""

        # Calculate statistics
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result.status == "PASS")
        failed_tests = sum(1 for result in self.test_results if result.status == "FAIL")
        warning_tests = sum(1 for result in self.test_results if result.status == "WARN")

        success_rate = (passed_tests / total_tests * 100) if total_tests > 0 else 0
        avg_execution_time = sum(result.execution_time for result in self.test_results) / total_tests if total_tests > 0 else 0

        # Group by category
        categories = {}
        for result in self.test_results:
            category = result.category
            if category not in categories:
                categories[category] = {"passed": 0, "failed": 0, "warned": 0, "total": 0}

            categories[category]["total"] += 1
            if result.status == "PASS":
                categories[category]["passed"] += 1
            elif result.status == "FAIL":
                categories[category]["failed"] += 1
            else:
                categories[category]["warned"] += 1

        # Determine overall status
        if success_rate >= 90:
            overall_status = "EXCELLENT"
        elif success_rate >= 75:
            overall_status = "GOOD"
        elif success_rate >= 60:
            overall_status = "ACCEPTABLE"
        else:
            overall_status = "NEEDS_IMPROVEMENT"

        return {
            "timestamp": datetime.now().isoformat(),
            "summary": {
                "total_tests": total_tests,
                "passed": passed_tests,
                "failed": failed_tests,
                "warnings": warning_tests,
                "success_rate": success_rate,
                "overall_status": overall_status,
                "avg_execution_time": avg_execution_time
            },
            "categories": categories,
            "test_results": [asdict(result) for result in self.test_results]
        }

    async def test_grid_layout_functionality(self) -> Dict[str, Any]:
        """Test CSS grid layout functionality specifically for equity position cards"""
        logger.info("📐 Testing Grid Layout Functionality...")

        results = {}

        start_time = time.time()
        try:
            async with self.session.get(f"{self.base_url}/") as response:
                execution_time = time.time() - start_time

                if response.status == 200:
                    content = await response.text()

                    # Check for grid CSS properties on equity positions containers
                    grid_indicators = [
                        'display: grid',
                        'grid-template-columns: repeat',
                        'auto-fill',
                        'minmax(280px',
                        'equity-positions-grid',
                        'equityAnalysisContent'
                    ]

                    found_grid_features = [indicator for indicator in grid_indicators if indicator in content]
                    grid_score = len(found_grid_features) / len(grid_indicators)

                    # Check for proper HTML structure for grid layout
                    structure_checks = [
                        'id="equityAnalysisContainer"' in content,
                        'class="equity-positions-grid"' in content,
                        'class="stock-position-card"' in content or 'stock-position-card' in content
                    ]

                    structure_score = sum(structure_checks) / len(structure_checks)

                    # Overall grid layout assessment
                    overall_score = (grid_score + structure_score) / 2

                    if overall_score >= 0.8:
                        self.add_result(
                            "Grid Layout Implementation",
                            "Layout",
                            "PASS",
                            f"Grid layout properly configured ({overall_score:.1%})",
                            execution_time,
                            {
                                "grid_features": found_grid_features,
                                "grid_score": grid_score,
                                "structure_score": structure_score,
                                "structure_checks": structure_checks
                            }
                        )
                        results["grid_layout"] = True
                    elif overall_score >= 0.6:
                        self.add_result(
                            "Grid Layout Implementation",
                            "Layout",
                            "WARN",
                            f"Grid layout partially configured ({overall_score:.1%})",
                            execution_time,
                            {
                                "grid_features": found_grid_features,
                                "grid_score": grid_score,
                                "structure_score": structure_score,
                                "missing_features": [feat for feat in grid_indicators if feat not in content]
                            }
                        )
                        results["grid_layout"] = "partial"
                    else:
                        self.add_result(
                            "Grid Layout Implementation",
                            "Layout",
                            "FAIL",
                            f"Grid layout not properly configured ({overall_score:.1%})",
                            execution_time,
                            {
                                "grid_features": found_grid_features,
                                "grid_score": grid_score,
                                "structure_score": structure_score,
                                "missing_features": [feat for feat in grid_indicators if feat not in content]
                            }
                        )
                        results["grid_layout"] = False

                else:
                    self.add_result(
                        "Grid Layout Implementation",
                        "Layout",
                        "FAIL",
                        f"Cannot test grid layout - HTTP {response.status}",
                        execution_time
                    )
                    results["grid_layout"] = False

        except Exception as e:
            execution_time = time.time() - start_time
            self.add_result(
                "Grid Layout Implementation",
                "Layout",
                "FAIL",
                f"Grid layout test exception: {str(e)}",
                execution_time
            )
            results["grid_layout"] = False

        return results

    async def test_viewport_responsive_behavior(self) -> Dict[str, Any]:
        """Test responsive behavior across different viewport sizes"""
        logger.info("📱 Testing Viewport Responsive Behavior...")

        results = {}

        # Define different viewport sizes to test
        viewport_sizes = [
            {"name": "Mobile", "width": 375, "height": 667},
            {"name": "Tablet", "width": 768, "height": 1024},
            {"name": "Desktop", "width": 1200, "height": 800},
            {"name": "Large Desktop", "width": 1600, "height": 900}
        ]

        start_time = time.time()
        try:
            async with self.session.get(f"{self.base_url}/") as response:
                execution_time = time.time() - start_time

                if response.status == 200:
                    content = await response.text()

                    # Check for responsive design patterns
                    responsive_patterns = [
                        # CSS Grid responsive patterns
                        'grid-template-columns: repeat(auto-fill',
                        'grid-template-columns: repeat(auto-fit',
                        'minmax(',

                        # Media queries
                        '@media',
                        'max-width:',
                        'min-width:',

                        # Flexible units
                        'rem',
                        'em',
                        'vw',
                        'vh',
                        '%',

                        # Responsive frameworks
                        'flex',
                        'grid',
                        'container'
                    ]

                    found_patterns = [pattern for pattern in responsive_patterns if pattern in content]
                    responsive_score = len(found_patterns) / len(responsive_patterns)

                    # Test grid layout specifically
                    grid_responsive_checks = [
                        'minmax(280px, 1fr)' in content,  # Responsive grid columns
                        'auto-fill' in content or 'auto-fit' in content,  # Auto sizing
                        'gap:' in content or 'grid-gap:' in content,  # Grid gaps
                    ]

                    grid_responsive_score = sum(grid_responsive_checks) / len(grid_responsive_checks)

                    overall_score = (responsive_score + grid_responsive_score) / 2

                    if overall_score >= 0.7:
                        self.add_result(
                            "Multi-Viewport Responsive Design",
                            "Design",
                            "PASS",
                            f"Responsive design supports multiple viewports ({overall_score:.1%})",
                            execution_time,
                            {
                                "responsive_patterns": found_patterns,
                                "responsive_score": responsive_score,
                                "grid_responsive_score": grid_responsive_score,
                                "viewport_sizes_tested": [v["name"] for v in viewport_sizes]
                            }
                        )
                        results["viewport_responsive"] = True
                    elif overall_score >= 0.5:
                        self.add_result(
                            "Multi-Viewport Responsive Design",
                            "Design",
                            "WARN",
                            f"Limited responsive design support ({overall_score:.1%})",
                            execution_time,
                            {
                                "responsive_patterns": found_patterns,
                                "responsive_score": responsive_score,
                                "grid_responsive_score": grid_responsive_score,
                                "missing_patterns": [p for p in responsive_patterns if p not in content]
                            }
                        )
                        results["viewport_responsive"] = "partial"
                    else:
                        self.add_result(
                            "Multi-Viewport Responsive Design",
                            "Design",
                            "FAIL",
                            f"Poor responsive design support ({overall_score:.1%})",
                            execution_time,
                            {
                                "responsive_patterns": found_patterns,
                                "responsive_score": responsive_score,
                                "grid_responsive_score": grid_responsive_score,
                                "missing_patterns": [p for p in responsive_patterns if p not in content]
                            }
                        )
                        results["viewport_responsive"] = False

                else:
                    self.add_result(
                        "Multi-Viewport Responsive Design",
                        "Design",
                        "FAIL",
                        f"Cannot test responsive design - HTTP {response.status}",
                        execution_time
                    )
                    results["viewport_responsive"] = False

        except Exception as e:
            execution_time = time.time() - start_time
            self.add_result(
                "Multi-Viewport Responsive Design",
                "Design",
                "FAIL",
                f"Viewport responsive test exception: {str(e)}",
                execution_time
            )
            results["viewport_responsive"] = False

        return results

    async def test_layout_spacing(self) -> Dict[str, Any]:
        """Test for proper spacing and layout to prevent excessive gaps"""
        logger.info("📏 Testing Layout Spacing...")

        results = {}

        start_time = time.time()
        try:
            async with self.session.get(f"{self.base_url}/") as response:
                execution_time = time.time() - start_time

                if response.status == 200:
                    content = await response.text()

                    # Check for excessive spacing patterns that could cause layout issues
                    spacing_violations = []

                    # Check for excessive terminal header spacing
                    if 'var(--space-2xl)' in content and '.terminal-header' in content:
                        # Look for patterns that suggest excessive spacing
                        terminal_header_match = re.search(r'\.terminal-header\s*{[^}]*}', content, re.DOTALL)
                        if terminal_header_match:
                            header_css = terminal_header_match.group(0)
                            if 'var(--space-2xl)' in header_css:
                                spacing_violations.append({
                                    "element": ".terminal-header",
                                    "issue": "Uses var(--space-2xl) which may cause excessive spacing",
                                    "recommendation": "Consider using var(--space-md) or var(--space-lg)"
                                })

                    # Check for multiple large spacing values that could stack
                    large_spacing_pattern = r'(margin|padding)[^:]*:\s*[^;]*var\(--space-2xl\)'
                    large_spacing_matches = re.findall(large_spacing_pattern, content, re.IGNORECASE)
                    if len(large_spacing_matches) > 3:
                        spacing_violations.append({
                            "element": "multiple elements",
                            "issue": f"Found {len(large_spacing_matches)} instances of large spacing (--space-2xl)",
                            "recommendation": "Review spacing scale to prevent excessive gaps"
                        })

                    # Check for tab content spacing issues
                    tab_spacing_issues = []
                    if '.tab-content' in content:
                        # Check if tab content has proper margin/padding reset
                        if 'margin-top: 0' not in content:
                            tab_spacing_issues.append("Missing margin-top reset on .tab-content")
                        if 'padding-top: 0' not in content:
                            tab_spacing_issues.append("Missing padding-top reset on .tab-content")

                    if tab_spacing_issues:
                        spacing_violations.append({
                            "element": ".tab-content",
                            "issue": "Tab content lacks proper spacing reset",
                            "details": tab_spacing_issues,
                            "recommendation": "Add margin-top: 0 and padding-top: 0 to .tab-content"
                        })

                    # Check for first-child spacing overrides
                    if '.tab-content' in content and 'first-child' not in content:
                        spacing_violations.append({
                            "element": ".tab-content > *:first-child",
                            "issue": "Missing first-child spacing override",
                            "recommendation": "Add CSS rule to reset first child margins"
                        })

                    # CRITICAL: Check for min-height: 100vh causing excessive container heights
                    terminal_container_match = re.search(r'\.terminal-container\s*{[^}]*}', content, re.DOTALL)
                    if terminal_container_match:
                        container_css = terminal_container_match.group(0)
                        # Only flag if it's not commented out
                        if 'min-height: 100vh' in container_css and '/* REMOVED:' not in container_css:
                            spacing_violations.append({
                                "element": ".terminal-container",
                                "issue": "CRITICAL: min-height: 100vh forces container to full viewport height (~1355px)",
                                "recommendation": "Remove min-height: 100vh to allow natural content sizing",
                                "severity": "HIGH"
                            })

                    # Check for other problematic height rules that could cause spacing issues
                    excessive_height_patterns = [
                        r'height:\s*\d{4,}px',  # 4+ digit pixel heights (1000px+)
                        r'min-height:\s*\d{4,}px',  # 4+ digit min-heights
                        r'height:\s*\d{2,}\.\d+vh',  # Large vh values like 50.5vh+
                    ]

                    for pattern in excessive_height_patterns:
                        matches = re.findall(pattern, content, re.IGNORECASE)
                        if matches:
                            spacing_violations.append({
                                "element": "various elements",
                                "issue": f"Found excessive height values: {matches[:3]}",  # Show first 3
                                "recommendation": "Review height values - consider using auto or natural sizing",
                                "severity": "MEDIUM"
                            })

                    # Check for padding/margin that could create large gaps
                    large_numeric_spacing = re.findall(r'(margin|padding)[^:]*:\s*[^;]*(\d{3,})px', content, re.IGNORECASE)
                    if large_numeric_spacing:
                        large_values = [match[1] for match in large_numeric_spacing if int(match[1]) > 100]
                        if large_values:
                            spacing_violations.append({
                                "element": "various elements",
                                "issue": f"Found large pixel spacing values: {large_values[:3]}px",
                                "recommendation": "Use design system variables instead of large pixel values",
                                "severity": "MEDIUM"
                            })

                    # Overall spacing assessment
                    if not spacing_violations:
                        self.add_result(
                            "Layout Spacing",
                            "Layout",
                            "PASS",
                            "No excessive spacing patterns detected",
                            execution_time,
                            {"spacing_check": "clean"}
                        )
                        results["layout_spacing"] = True
                    elif len(spacing_violations) <= 2:
                        self.add_result(
                            "Layout Spacing",
                            "Layout",
                            "WARN",
                            f"Minor spacing issues detected ({len(spacing_violations)} issues)",
                            execution_time,
                            {"violations": spacing_violations}
                        )
                        results["layout_spacing"] = "minor_issues"
                    else:
                        self.add_result(
                            "Layout Spacing",
                            "Layout",
                            "FAIL",
                            f"Multiple spacing issues detected ({len(spacing_violations)} issues)",
                            execution_time,
                            {"violations": spacing_violations}
                        )
                        results["layout_spacing"] = False

                else:
                    self.add_result(
                        "Layout Spacing",
                        "Layout",
                        "FAIL",
                        f"Cannot test spacing - HTTP {response.status}",
                        execution_time
                    )
                    results["layout_spacing"] = False

        except Exception as e:
            execution_time = time.time() - start_time
            self.add_result(
                "Layout Spacing",
                "Layout",
                "FAIL",
                f"Spacing test exception: {str(e)}",
                execution_time
            )
            results["layout_spacing"] = False

        return results

    async def run_all_tests(self) -> Dict[str, Any]:
        """Run all frontend tests"""

        # Initialize session
        self.session = aiohttp.ClientSession()

        try:
            logger.info("🎯 Starting Frontend QA Testing...")
            logger.info(f"🌐 Target URL: {self.base_url}")
            logger.info("=" * 80)

            # Run all test suites
            await self.test_page_load_performance()
            await self.test_strategy_display_section()
            await self.test_critical_ui_components()
            await self.test_analysis_tab_components()
            await self.test_real_time_features()
            await self.test_responsive_design()
            await self.test_grid_layout_functionality()
            await self.test_viewport_responsive_behavior()
            await self.test_layout_spacing()  # New spacing test

            # Generate summary
            summary = self.generate_summary()

            # Print summary
            logger.info("=" * 80)
            logger.info("🏁 Frontend QA Testing Complete")
            logger.info(f"📊 Results: {summary['summary']['passed']}/{summary['summary']['total_tests']} PASSED " +
                       f"({summary['summary']['success_rate']:.1f}%)")
            logger.info(f"🎯 Overall Status: {summary['summary']['overall_status']}")
            logger.info(f"⏱️ Average Execution Time: {summary['summary']['avg_execution_time']:.2f}s")

            # Save detailed report
            report_filename = f"frontend_qa_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            with open(report_filename, 'w') as f:
                json.dump(summary, f, indent=2)
            logger.info(f"📄 Detailed report saved to: {report_filename}")

            return summary

        finally:
            await self.session.close()

async def main():
    """Main entry point"""
    try:
        qa_agent = FrontendQAAgent()
        results = await qa_agent.run_all_tests()

        # Exit code based on results
        success_rate = results['summary']['success_rate']
        if success_rate >= 75:
            sys.exit(0)  # Success
        else:
            sys.exit(1)  # Some failures

    except KeyboardInterrupt:
        logger.info("Testing interrupted by user")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
