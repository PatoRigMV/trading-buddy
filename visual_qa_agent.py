#!/usr/bin/env python3
"""
Visual QA Agent - Screenshot-based visual regression testing
Uses Playwright to take actual screenshots and analyze visual layout issues
"""

import asyncio
import json
import time
import logging
import sys
from datetime import datetime
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, asdict
from playwright.async_api import async_playwright
import base64
import io
from PIL import Image, ImageDraw

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('Visual_QA_Agent')

@dataclass
class VisualTestResult:
    test_name: str
    category: str
    status: str  # PASS, FAIL, WARN
    message: str
    execution_time: float
    screenshot_path: Optional[str] = None
    details: Optional[Dict] = None

class VisualQAAgent:
    def __init__(self, base_url: str = "http://127.0.0.1:8000"):
        self.base_url = base_url
        self.browser = None
        self.page = None
        self.test_results: List[VisualTestResult] = []

    def add_result(self, test_name: str, category: str, status: str,
                   message: str, execution_time: float, screenshot_path: Optional[str] = None,
                   details: Optional[Dict] = None):
        """Add a test result"""
        result = VisualTestResult(
            test_name=test_name,
            category=category,
            status=status,
            message=message,
            execution_time=execution_time,
            screenshot_path=screenshot_path,
            details=details or {}
        )
        self.test_results.append(result)

        # Log result
        status_icon = "✅" if status == "PASS" else "❌" if status == "FAIL" else "⚠️"
        logger.info(f"{status_icon} {test_name}: {message} ({execution_time:.2f}s)")

    async def setup_browser(self):
        """Initialize Playwright browser"""
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(headless=True)
        self.page = await self.browser.new_page()
        await self.page.set_viewport_size({"width": 1280, "height": 720})

    async def cleanup_browser(self):
        """Cleanup Playwright resources"""
        if self.page:
            await self.page.close()
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()

    async def test_tab_spacing_visual(self) -> Dict[str, Any]:
        """Test tab spacing by taking screenshots and analyzing actual layout"""
        logger.info("📸 Testing Tab Spacing Visually...")

        results = {}
        start_time = time.time()

        try:
            # Navigate to the page
            await self.page.goto(self.base_url)
            await self.page.wait_for_load_state('networkidle')

            # Test each tab
            tabs_to_test = [
                {"name": "OPTIONS", "selector": "button:has-text('OPTIONS')"},
                {"name": "ANALYSIS", "selector": "button:has-text('ANALYSIS')"},
                {"name": "ALERTS", "selector": "button:has-text('ALERTS')"}
            ]

            tab_spacing_issues = []

            for tab in tabs_to_test:
                try:
                    # Click the tab
                    await self.page.click(tab["selector"])
                    await self.page.wait_for_timeout(500)  # Wait for tab content to load

                    # Take screenshot
                    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                    screenshot_path = f"tab_spacing_{tab['name'].lower()}_{timestamp}.png"
                    await self.page.screenshot(path=screenshot_path)

                    # Analyze tab content spacing using DOM measurements
                    spacing_analysis = await self.page.evaluate("""
                        () => {
                            const tabContainer = document.querySelector('.tab-container');
                            const tabContent = document.querySelector('.tab-content.active');
                            const terminalContainer = document.querySelector('.terminal-container');

                            if (!tabContainer || !tabContent) {
                                return { error: 'Tab elements not found' };
                            }

                            const tabContainerRect = tabContainer.getBoundingClientRect();
                            const tabContentRect = tabContent.getBoundingClientRect();

                            // Calculate the gap between tab container and content
                            const gap = tabContentRect.top - tabContainerRect.bottom;

                            // Get computed styles
                            const tabContentStyles = window.getComputedStyle(tabContent);
                            const terminalHeader = document.querySelector('.terminal-header');
                            const headerStyles = terminalHeader ? window.getComputedStyle(terminalHeader) : null;

                            // CRITICAL: Check terminal-container dimensions and styles
                            const terminalContainerStyles = terminalContainer ? window.getComputedStyle(terminalContainer) : null;
                            const terminalContainerRect = terminalContainer ? terminalContainer.getBoundingClientRect() : null;

                            return {
                                gap: gap,
                                tabContentMarginTop: tabContentStyles.marginTop,
                                tabContentPaddingTop: tabContentStyles.paddingTop,
                                headerPaddingBottom: headerStyles ? headerStyles.paddingBottom : null,
                                headerMarginBottom: headerStyles ? headerStyles.marginBottom : null,
                                tabContainerBottom: tabContainerRect.bottom,
                                tabContentTop: tabContentRect.top,
                                viewportHeight: window.innerHeight,
                                // Enhanced terminal-container inspection
                                terminalContainerHeight: terminalContainerRect ? terminalContainerRect.height : null,
                                terminalContainerMinHeight: terminalContainerStyles ? terminalContainerStyles.minHeight : null,
                                terminalContainerPaddingTop: terminalContainerStyles ? terminalContainerStyles.paddingTop : null,
                                terminalContainerPaddingBottom: terminalContainerStyles ? terminalContainerStyles.paddingBottom : null,
                                criticalIssue: terminalContainerStyles && terminalContainerStyles.minHeight === '100vh' ? 'min-height-100vh-detected' : null
                            };
                        }
                    """)

                    if 'error' in spacing_analysis:
                        tab_spacing_issues.append({
                            "tab": tab["name"],
                            "issue": spacing_analysis['error'],
                            "screenshot": screenshot_path
                        })
                        continue

                    # CRITICAL: Check for min-height: 100vh issue first
                    if spacing_analysis.get('criticalIssue') == 'min-height-100vh-detected':
                        tab_spacing_issues.append({
                            "tab": tab["name"],
                            "issue": f"CRITICAL: terminal-container has min-height: 100vh causing {spacing_analysis.get('terminalContainerHeight', 'unknown')}px forced height",
                            "severity": "HIGH",
                            "solution": "Remove min-height: 100vh from .terminal-container CSS",
                            "terminalContainerHeight": spacing_analysis.get('terminalContainerHeight'),
                            "details": spacing_analysis,
                            "screenshot": screenshot_path
                        })

                    # Check for excessive container height (likely indicates min-height issues)
                    container_height = spacing_analysis.get('terminalContainerHeight', 0)
                    if container_height > 1000:  # Anything over 1000px is suspicious
                        tab_spacing_issues.append({
                            "tab": tab["name"],
                            "issue": f"Excessive terminal-container height: {container_height:.1f}px",
                            "severity": "HIGH",
                            "recommendation": "Check for min-height: 100vh or other height CSS causing forced container sizing",
                            "details": spacing_analysis,
                            "screenshot": screenshot_path
                        })

                    # Analyze the gap - anything over 50px is likely excessive
                    gap = spacing_analysis['gap']
                    if gap > 50:
                        tab_spacing_issues.append({
                            "tab": tab["name"],
                            "issue": f"Excessive gap of {gap:.1f}px between tabs and content",
                            "gap": gap,
                            "details": spacing_analysis,
                            "screenshot": screenshot_path
                        })

                except Exception as e:
                    tab_spacing_issues.append({
                        "tab": tab["name"],
                        "issue": f"Error testing tab: {str(e)}",
                        "screenshot": None
                    })

            execution_time = time.time() - start_time

            # Determine overall result
            if not tab_spacing_issues:
                self.add_result(
                    "Visual Tab Spacing Analysis",
                    "Visual",
                    "PASS",
                    "All tabs have proper spacing",
                    execution_time,
                    details={"tabs_tested": len(tabs_to_test)}
                )
                results["visual_tab_spacing"] = True
            else:
                self.add_result(
                    "Visual Tab Spacing Analysis",
                    "Visual",
                    "FAIL",
                    f"Found spacing issues in {len(tab_spacing_issues)} tabs",
                    execution_time,
                    details={"spacing_issues": tab_spacing_issues}
                )
                results["visual_tab_spacing"] = False

        except Exception as e:
            execution_time = time.time() - start_time
            self.add_result(
                "Visual Tab Spacing Analysis",
                "Visual",
                "FAIL",
                f"Visual test exception: {str(e)}",
                execution_time
            )
            results["visual_tab_spacing"] = False

        return results

    async def test_overall_layout_visual(self) -> Dict[str, Any]:
        """Test overall layout and take baseline screenshots"""
        logger.info("📸 Testing Overall Layout Visually...")

        results = {}
        start_time = time.time()

        try:
            # Navigate to the page
            await self.page.goto(self.base_url)
            await self.page.wait_for_load_state('networkidle')

            # Take full page screenshot
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            screenshot_path = f"full_layout_{timestamp}.png"
            await self.page.screenshot(path=screenshot_path, full_page=True)

            # Analyze overall layout metrics
            layout_analysis = await self.page.evaluate("""
                () => {
                    const body = document.body;
                    const terminalContainer = document.querySelector('.terminal-container');
                    const terminalHeader = document.querySelector('.terminal-header');
                    const tabButtons = document.querySelector('.tab-buttons');
                    const tabContent = document.querySelector('.tab-content');

                    if (!terminalContainer || !terminalHeader || !tabButtons) {
                        return { error: 'Required layout elements not found' };
                    }

                    const containerRect = terminalContainer.getBoundingClientRect();
                    const headerRect = terminalHeader.getBoundingClientRect();
                    const tabButtonsRect = tabButtons.getBoundingClientRect();
                    const tabContentRect = tabContent ? tabContent.getBoundingClientRect() : null;

                    // Calculate spacing ratios
                    const headerToTabsGap = tabButtonsRect.top - headerRect.bottom;
                    const tabsToContentGap = tabContentRect ? (tabContentRect.top - tabButtonsRect.bottom) : 0;
                    const totalVerticalSpace = containerRect.height;

                    return {
                        headerHeight: headerRect.height,
                        headerToTabsGap: headerToTabsGap,
                        tabsHeight: tabButtonsRect.height,
                        tabsToContentGap: tabsToContentGap,
                        contentHeight: tabContentRect ? tabContentRect.height : 0,
                        totalVerticalSpace: totalVerticalSpace,
                        excessiveSpacingRatio: (headerToTabsGap + tabsToContentGap) / totalVerticalSpace,
                        viewportWidth: window.innerWidth,
                        viewportHeight: window.innerHeight
                    };
                }
            """)

            execution_time = time.time() - start_time

            if 'error' in layout_analysis:
                self.add_result(
                    "Visual Layout Analysis",
                    "Visual",
                    "FAIL",
                    layout_analysis['error'],
                    execution_time,
                    screenshot_path
                )
                results["visual_layout"] = False
            else:
                # Check if excessive spacing ratio is too high (> 15% of total space is just gaps)
                spacing_ratio = layout_analysis.get('excessiveSpacingRatio', 0)
                if spacing_ratio > 0.15:
                    self.add_result(
                        "Visual Layout Analysis",
                        "Visual",
                        "FAIL",
                        f"Excessive spacing detected: {spacing_ratio:.1%} of vertical space is gaps",
                        execution_time,
                        screenshot_path,
                        layout_analysis
                    )
                    results["visual_layout"] = False
                else:
                    self.add_result(
                        "Visual Layout Analysis",
                        "Visual",
                        "PASS",
                        f"Layout spacing is reasonable: {spacing_ratio:.1%} gap ratio",
                        execution_time,
                        screenshot_path,
                        layout_analysis
                    )
                    results["visual_layout"] = True

        except Exception as e:
            execution_time = time.time() - start_time
            self.add_result(
                "Visual Layout Analysis",
                "Visual",
                "FAIL",
                f"Visual layout test exception: {str(e)}",
                execution_time
            )
            results["visual_layout"] = False

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

    async def run_visual_tests(self) -> Dict[str, Any]:
        """Run all visual tests"""

        try:
            logger.info("🎯 Starting Visual QA Testing...")
            logger.info(f"🌐 Target URL: {self.base_url}")
            logger.info("=" * 80)

            # Setup browser
            await self.setup_browser()

            # Run visual test suites
            await self.test_overall_layout_visual()
            await self.test_tab_spacing_visual()

            # Generate summary
            summary = self.generate_summary()

            # Print summary
            logger.info("=" * 80)
            logger.info("🏁 Visual QA Testing Complete")
            logger.info(f"📊 Results: {summary['summary']['passed']}/{summary['summary']['total_tests']} PASSED " +
                       f"({summary['summary']['success_rate']:.1f}%)")
            logger.info(f"🎯 Overall Status: {summary['summary']['overall_status']}")
            logger.info(f"⏱️ Average Execution Time: {summary['summary']['avg_execution_time']:.2f}s")

            # Save detailed report
            report_filename = f"visual_qa_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            with open(report_filename, 'w') as f:
                json.dump(summary, f, indent=2)
            logger.info(f"📄 Detailed report saved to: {report_filename}")

            return summary

        finally:
            await self.cleanup_browser()

async def main():
    """Main entry point"""
    try:
        qa_agent = VisualQAAgent()
        results = await qa_agent.run_visual_tests()

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
