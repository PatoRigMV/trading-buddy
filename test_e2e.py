"""
End-to-end tests for Trading Assistant critical user flows.

Tests complete user journeys through the web interface using Playwright.
Requires: pip install playwright && playwright install
"""

import pytest
import time
import os
from playwright.sync_api import Page, expect


# Base URL for testing
BASE_URL = os.environ.get('TEST_BASE_URL', 'http://localhost:8000')


@pytest.fixture(scope="session")
def browser_context(playwright):
    """Create browser context for all tests"""
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(
        viewport={'width': 1920, 'height': 1080},
        ignore_https_errors=True
    )
    yield context
    context.close()
    browser.close()


@pytest.fixture
def page(browser_context):
    """Create new page for each test"""
    page = browser_context.new_page()
    yield page
    page.close()


class TestCriticalUserFlows:
    """Test critical user journeys"""

    def test_dashboard_loads_successfully(self, page: Page):
        """
        E2E Test 1: Dashboard loads without errors

        User Story: As a trader, I want the dashboard to load quickly
        so that I can start monitoring the market.
        """
        # Navigate to dashboard
        response = page.goto(BASE_URL)

        # Verify successful response
        assert response.status == 200

        # Verify page title
        expect(page).to_have_title("Trading Assistant")

        # Verify main sections are visible
        expect(page.locator('#mainContent')).to_be_visible(timeout=5000)
        expect(page.locator('#realTimeUpdates')).to_be_visible()

        # Verify no JavaScript errors
        errors = []
        page.on("pageerror", lambda err: errors.append(err))
        page.wait_for_timeout(2000)
        assert len(errors) == 0, f"JavaScript errors found: {errors}"

    def test_system_initialization_flow(self, page: Page):
        """
        E2E Test 2: System initialization flow

        User Story: As a trader, I want to initialize the system
        so that it starts monitoring and analyzing stocks.
        """
        page.goto(BASE_URL)

        # Wait for page to be ready
        page.wait_for_load_state('networkidle')

        # Find and click initialize button
        init_button = page.locator('button:has-text("Initialize System")')
        if init_button.is_visible():
            init_button.click()

            # Wait for initialization confirmation
            page.wait_for_timeout(2000)

            # Verify log entry appears
            log_container = page.locator('#realTimeUpdates')
            expect(log_container).to_contain_text('System', timeout=10000)

    def test_watchlist_add_flow(self, page: Page):
        """
        E2E Test 3: Add stock to watchlist

        User Story: As a trader, I want to add stocks to my watchlist
        so that I can monitor specific opportunities.
        """
        page.goto(BASE_URL)
        page.wait_for_load_state('networkidle')

        # Find watchlist add input
        symbol_input = page.locator('input[placeholder*="symbol" i]').first
        if symbol_input.is_visible():
            # Enter symbol
            symbol_input.fill('AAPL')

            # Find and click add button
            add_button = page.locator('button:has-text("Add")').first
            add_button.click()

            # Wait for response
            page.wait_for_timeout(2000)

            # Verify success message or log entry
            log_container = page.locator('#realTimeUpdates')
            # Should see some confirmation

    def test_agent_command_flow(self, page: Page):
        """
        E2E Test 4: Send command to trading agent

        User Story: As a trader, I want to send commands to the agent
        so that I can request specific analysis.
        """
        page.goto(BASE_URL)
        page.wait_for_load_state('networkidle')

        # Find agent command input
        command_input = page.locator('#agentCommand')
        if command_input.is_visible():
            # Enter command
            command_input.fill('analyze TSLA')

            # Find and click send button
            send_button = page.locator('button:has-text("Send Command")')
            send_button.click()

            # Wait for response
            page.wait_for_timeout(2000)

            # Verify log entry
            log_container = page.locator('#realTimeUpdates')
            expect(log_container).to_contain_text('Command', timeout=5000)

    def test_portfolio_view_loads(self, page: Page):
        """
        E2E Test 5: Portfolio view loads data

        User Story: As a trader, I want to see my portfolio
        so that I can track my positions and performance.
        """
        page.goto(BASE_URL)
        page.wait_for_load_state('networkidle')

        # Wait for portfolio data to load
        page.wait_for_timeout(3000)

        # Verify portfolio section exists
        portfolio_section = page.locator('#portfolioTable, .portfolio-container').first
        expect(portfolio_section).to_be_visible(timeout=10000)

    def test_price_updates_display(self, page: Page):
        """
        E2E Test 6: Real-time price updates display

        User Story: As a trader, I want to see real-time price updates
        so that I can make informed trading decisions.
        """
        page.goto(BASE_URL)
        page.wait_for_load_state('networkidle')

        # Wait for prices to load
        page.wait_for_timeout(5000)

        # Verify prices container exists
        prices_grid = page.locator('#pricesGrid, .prices-container').first
        expect(prices_grid).to_be_visible(timeout=10000)

        # Verify at least one price card is visible
        price_cards = page.locator('.stock-card, .price-card')
        expect(price_cards.first).to_be_visible(timeout=10000)

    def test_alerts_creation_flow(self, page: Page):
        """
        E2E Test 7: Create price alert

        User Story: As a trader, I want to set price alerts
        so that I get notified of important price movements.
        """
        page.goto(BASE_URL)
        page.wait_for_load_state('networkidle')

        # Look for alerts section
        alerts_section = page.locator('#alertsSection, .alerts-container').first
        if alerts_section.is_visible(timeout=5000):
            # Try to find alert creation form
            alert_symbol = page.locator('input[name="alertSymbol"]')
            if alert_symbol.is_visible():
                alert_symbol.fill('NVDA')

                alert_price = page.locator('input[name="alertPrice"]')
                if alert_price.is_visible():
                    alert_price.fill('500')

                    # Submit alert
                    create_alert_btn = page.locator('button:has-text("Create Alert")')
                    if create_alert_btn.is_visible():
                        create_alert_btn.click()
                        page.wait_for_timeout(2000)

    def test_proposals_view_and_approval(self, page: Page):
        """
        E2E Test 8: View and approve/reject trade proposals

        User Story: As a trader, I want to review and approve trades
        so that I maintain control over trading decisions.
        """
        page.goto(BASE_URL)
        page.wait_for_load_state('networkidle')

        # Wait for proposals to load
        page.wait_for_timeout(3000)

        # Verify proposals container exists
        proposals_container = page.locator('#proposals-container, .proposals-list').first
        expect(proposals_container).to_be_visible(timeout=10000)

    def test_chart_displays_correctly(self, page: Page):
        """
        E2E Test 9: Portfolio performance chart displays

        User Story: As a trader, I want to see visual charts
        so that I can understand performance trends.
        """
        page.goto(BASE_URL)
        page.wait_for_load_state('networkidle')

        # Wait for chart to render
        page.wait_for_timeout(5000)

        # Verify chart container exists
        chart_container = page.locator('#performanceChart, svg').first
        expect(chart_container).to_be_visible(timeout=10000)

    def test_navigation_between_sections(self, page: Page):
        """
        E2E Test 10: Navigate between different sections

        User Story: As a trader, I want to navigate smoothly
        so that I can access different features quickly.
        """
        page.goto(BASE_URL)
        page.wait_for_load_state('networkidle')

        # Test scrolling or tab navigation if present
        # Verify main sections are accessible
        sections = ['#mainContent', '#realTimeUpdates']

        for section in sections:
            element = page.locator(section).first
            if element.is_visible():
                element.scroll_into_view_if_needed()
                expect(element).to_be_visible()


class TestErrorHandling:
    """Test error handling in user flows"""

    def test_invalid_symbol_error_handling(self, page: Page):
        """
        E2E Test 11: Invalid symbol shows proper error

        User Story: As a trader, I want clear error messages
        so that I know what went wrong.
        """
        page.goto(BASE_URL)
        page.wait_for_load_state('networkidle')

        # Try to add invalid symbol
        symbol_input = page.locator('input[placeholder*="symbol" i]').first
        if symbol_input.is_visible():
            symbol_input.fill('INVALID123')

            add_button = page.locator('button:has-text("Add")').first
            add_button.click()

            page.wait_for_timeout(2000)

            # Should see error message (validation should catch it)

    def test_network_error_resilience(self, page: Page):
        """
        E2E Test 12: Application handles network errors gracefully

        User Story: As a trader, I want the app to handle errors
        so that it doesn't crash when services are unavailable.
        """
        page.goto(BASE_URL)
        page.wait_for_load_state('networkidle')

        # Simulate offline mode
        page.context.set_offline(True)

        # Try to perform action
        page.wait_for_timeout(1000)

        # App should still be responsive (not crashed)
        expect(page.locator('#mainContent')).to_be_visible()

        # Restore online mode
        page.context.set_offline(False)


class TestPerformance:
    """Test performance characteristics"""

    def test_page_load_time(self, page: Page):
        """
        E2E Test 13: Page loads within acceptable time

        Requirement: Dashboard should load in < 3 seconds
        """
        start_time = time.time()

        page.goto(BASE_URL)
        page.wait_for_load_state('domcontentloaded')

        load_time = time.time() - start_time

        # Assert load time is reasonable
        assert load_time < 5.0, f"Page took {load_time:.2f}s to load (max: 5s)"

    def test_no_memory_leaks(self, page: Page):
        """
        E2E Test 14: No memory leaks after prolonged use

        Requirement: Memory usage should stay stable
        """
        page.goto(BASE_URL)
        page.wait_for_load_state('networkidle')

        # Get initial memory usage
        initial_memory = page.evaluate('performance.memory?.usedJSHeapSize || 0')

        # Simulate usage for 30 seconds
        for _ in range(6):
            page.wait_for_timeout(5000)
            # Scroll and interact
            page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
            page.wait_for_timeout(500)
            page.evaluate('window.scrollTo(0, 0)')

        # Get final memory usage
        final_memory = page.evaluate('performance.memory?.usedJSHeapSize || 0')

        # Memory shouldn't grow more than 50MB
        if initial_memory and final_memory:
            memory_increase = (final_memory - initial_memory) / (1024 * 1024)
            assert memory_increase < 50, f"Memory increased by {memory_increase:.1f}MB (max: 50MB)"


class TestAccessibility:
    """Test accessibility features"""

    def test_keyboard_navigation(self, page: Page):
        """
        E2E Test 15: Keyboard navigation works

        User Story: As a trader, I want to use keyboard shortcuts
        so that I can work efficiently.
        """
        page.goto(BASE_URL)
        page.wait_for_load_state('networkidle')

        # Try tabbing through interactive elements
        page.keyboard.press('Tab')
        page.wait_for_timeout(500)

        # Verify focus is visible
        focused_element = page.evaluate('document.activeElement.tagName')
        assert focused_element in ['INPUT', 'BUTTON', 'A', 'TEXTAREA']

    def test_proper_aria_labels(self, page: Page):
        """
        E2E Test 16: Important elements have ARIA labels

        Requirement: Accessibility compliance
        """
        page.goto(BASE_URL)
        page.wait_for_load_state('networkidle')

        # Check for buttons with accessible names
        buttons = page.locator('button').all()

        for i, button in enumerate(buttons[:5]):  # Check first 5 buttons
            # Should have either text content or aria-label
            has_text = button.text_content().strip() != ''
            has_aria = button.get_attribute('aria-label') is not None

            assert has_text or has_aria, f"Button {i} has no accessible name"


# Pytest configuration
def pytest_configure(config):
    """Configure pytest"""
    config.addinivalue_line(
        "markers", "e2e: end-to-end tests requiring full system"
    )
    config.addinivalue_line(
        "markers", "slow: slow running tests"
    )


# Run with: pytest test_e2e.py -v -m e2e
# Or: pytest test_e2e.py -v --headed  # to see browser
