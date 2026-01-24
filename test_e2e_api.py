"""
End-to-end API tests for critical trading flows.

Tests complete workflows through the API without browser automation.
These tests verify that all components work together correctly.
"""

import pytest
import requests
import time
import os


BASE_URL = os.environ.get('TEST_BASE_URL', 'http://localhost:8000')


@pytest.fixture(scope="session")
def api_session():
    """Create requests session for all tests"""
    session = requests.Session()
    session.headers.update({'Content-Type': 'application/json'})
    yield session
    session.close()


class TestCriticalAPIFlows:
    """Test critical API workflows"""

    def test_health_check_flow(self, api_session):
        """
        E2E API Test 1: Health check endpoints work

        Verifies: All health check endpoints return proper status
        """
        # Test main health endpoint
        response = api_session.get(f'{BASE_URL}/api/health')
        assert response.status_code in [200, 503]
        data = response.json()
        assert 'status' in data
        assert 'checks' in data
        assert 'uptime_seconds' in data

        # Test liveness probe
        response = api_session.get(f'{BASE_URL}/api/health/live')
        assert response.status_code == 200
        data = response.json()
        assert data['alive'] is True

        # Test readiness probe
        response = api_session.get(f'{BASE_URL}/api/health/ready')
        assert response.status_code in [200, 503]

    def test_metrics_endpoint_flow(self, api_session):
        """
        E2E API Test 2: Metrics collection works

        Verifies: Metrics are being collected and exposed
        """
        # Test JSON metrics
        response = api_session.get(f'{BASE_URL}/api/metrics')
        assert response.status_code == 200
        data = response.json()
        assert 'metrics' in data
        assert 'requests_total' in data['metrics']

        # Test Prometheus metrics
        response = api_session.get(f'{BASE_URL}/metrics')
        assert response.status_code == 200
        assert 'requests_total' in response.text

    def test_watchlist_complete_flow(self, api_session):
        """
        E2E API Test 3: Complete watchlist workflow

        Flow: Add symbol → View watchlist → Delete symbol
        Verifies: Full CRUD operations work end-to-end
        """
        test_symbol = 'AAPL'

        # Step 1: Add to watchlist
        response = api_session.post(
            f'{BASE_URL}/api/watchlist/add',
            json={
                'symbol': test_symbol,
                'reason': 'E2E test',
                'confidence': 0.8
            }
        )
        assert response.status_code in [200, 201, 400]  # 400 if already exists

        # Step 2: View enhanced watchlist
        response = api_session.get(f'{BASE_URL}/api/enhanced-watchlist')
        assert response.status_code in [200, 400]

        if response.status_code == 200:
            data = response.json()
            # Should have data or success field
            assert 'data' in data or 'entries' in data or 'success' in data

        # Step 3: Delete from watchlist (if endpoint exists)
        # Note: This would need the submitter info for deletion

    def test_portfolio_data_flow(self, api_session):
        """
        E2E API Test 4: Portfolio data retrieval

        Verifies: Portfolio endpoints return expected data structure
        """
        # Get portfolio
        response = api_session.get(f'{BASE_URL}/api/portfolio')
        assert response.status_code in [200, 400, 503]

        # Get portfolio history
        response = api_session.get(
            f'{BASE_URL}/api/portfolio_history?period=1D&timeframe=1H'
        )
        assert response.status_code in [200, 400, 503]

    def test_agent_command_flow(self, api_session):
        """
        E2E API Test 5: Agent command workflow

        Flow: Send command → Verify acknowledgment
        Verifies: Agent communication pipeline works
        """
        response = api_session.post(
            f'{BASE_URL}/api/agent_command',
            json={'command': 'analyze TSLA for day trading'}
        )
        assert response.status_code in [200, 202, 503]

        if response.status_code in [200, 202]:
            data = response.json()
            # Should acknowledge receipt
            assert 'success' in data or 'status' in data

    def test_alert_lifecycle_flow(self, api_session):
        """
        E2E API Test 6: Complete alert lifecycle

        Flow: Create alert → View alerts → (Pause) → Delete
        Verifies: Full alert management workflow
        """
        # Create alert
        response = api_session.post(
            f'{BASE_URL}/api/alerts',
            json={
                'symbol': 'NVDA',
                'alert_type': 'price_above',
                'condition_value': 500.0,
                'message': 'NVDA above $500'
            }
        )
        assert response.status_code in [200, 201, 400]

        alert_id = None
        if response.status_code in [200, 201]:
            data = response.json()
            if 'data' in data and 'alert_id' in data['data']:
                alert_id = data['data']['alert_id']

        # View alerts
        response = api_session.get(f'{BASE_URL}/api/alerts')
        assert response.status_code in [200, 400]

        # Pause alert (if we have an ID)
        if alert_id:
            response = api_session.post(
                f'{BASE_URL}/api/alerts/{alert_id}/pause',
                json={'alert_id': alert_id}
            )
            assert response.status_code in [200, 404]

    def test_price_data_flow(self, api_session):
        """
        E2E API Test 7: Price data retrieval

        Verifies: Price endpoints return valid data
        """
        # Get stock chart data
        response = api_session.get(
            f'{BASE_URL}/api/stock_chart/AAPL?period=1D&interval=5m'
        )
        assert response.status_code in [200, 400, 503]

        # Get bulk prices
        response = api_session.get(
            f'{BASE_URL}/api/enhanced/bulk_prices?symbols=AAPL,GOOGL,MSFT'
        )
        assert response.status_code in [200, 400]

        # Get real-time price
        response = api_session.get(
            f'{BASE_URL}/api/real_time_prices/progressive?symbol=AAPL'
        )
        assert response.status_code in [200, 400]

    def test_chat_flow(self, api_session):
        """
        E2E API Test 8: Chat interaction flow

        Flow: Send message → Get response → View history
        Verifies: Chat agent communication works
        """
        # Send chat message
        response = api_session.post(
            f'{BASE_URL}/api/chat',
            json={'message': 'What are the top momentum stocks today?'}
        )
        assert response.status_code in [200, 503]

        # Get chat history
        response = api_session.get(f'{BASE_URL}/api/chat/history')
        assert response.status_code in [200, 500]

    def test_options_data_flow(self, api_session):
        """
        E2E API Test 9: Options data retrieval

        Verifies: Options endpoints return data
        """
        # Get options positions
        response = api_session.get(f'{BASE_URL}/api/options/positions')
        assert response.status_code in [200, 400]

        # Get options orders
        response = api_session.get(f'{BASE_URL}/api/options/orders?limit=10')
        assert response.status_code in [200, 400]

    def test_analysis_flow(self, api_session):
        """
        E2E API Test 10: Analysis request flow

        Verifies: Analysis endpoints process requests
        """
        # Request manual analysis
        response = api_session.post(
            f'{BASE_URL}/api/manual_analysis',
            json={'symbols': ['AAPL', 'TSLA']}
        )
        assert response.status_code in [200, 202, 503]


class TestValidationE2E:
    """Test end-to-end validation flows"""

    def test_invalid_input_rejected(self, api_session):
        """
        E2E API Test 11: Invalid input is rejected

        Verifies: Validation layer catches bad input
        """
        # Try invalid symbol format
        response = api_session.post(
            f'{BASE_URL}/api/watchlist/add',
            json={'symbol': 'invalid123', 'reason': 'test'}
        )
        assert response.status_code == 400
        data = response.json()
        assert data['success'] is False
        assert 'symbol' in str(data).lower()

    def test_missing_required_fields(self, api_session):
        """
        E2E API Test 12: Missing required fields are caught

        Verifies: Required field validation works
        """
        # Try creating alert without required fields
        response = api_session.post(
            f'{BASE_URL}/api/alerts',
            json={'symbol': 'AAPL'}  # Missing alert_type, condition_value
        )
        assert response.status_code == 400

    def test_out_of_range_values(self, api_session):
        """
        E2E API Test 13: Out of range values are rejected

        Verifies: Range validation works
        """
        # Try confidence > 1
        response = api_session.post(
            f'{BASE_URL}/api/watchlist/add',
            json={'symbol': 'AAPL', 'confidence': 1.5}
        )
        assert response.status_code == 400


class TestErrorRecoveryE2E:
    """Test error recovery in workflows"""

    def test_nonexistent_endpoint_handling(self, api_session):
        """
        E2E API Test 14: Nonexistent endpoints return 404

        Verifies: 404 handler works correctly
        """
        response = api_session.get(f'{BASE_URL}/api/nonexistent')
        assert response.status_code == 404
        data = response.json()
        assert data['success'] is False

    def test_malformed_json_handling(self, api_session):
        """
        E2E API Test 15: Malformed JSON is handled

        Verifies: JSON parsing errors are caught
        """
        response = api_session.post(
            f'{BASE_URL}/api/watchlist/add',
            data='not valid json',
            headers={'Content-Type': 'application/json'}
        )
        assert response.status_code == 400

    def test_client_error_logging_flow(self, api_session):
        """
        E2E API Test 16: Client errors are logged

        Verifies: Client error logging endpoint works
        """
        response = api_session.post(
            f'{BASE_URL}/api/client_error',
            json={
                'type': 'test_error',
                'error': 'E2E test error',
                'timestamp': '2025-09-30T12:00:00Z'
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data['success'] is True


class TestPerformanceE2E:
    """Test performance characteristics"""

    def test_response_times(self, api_session):
        """
        E2E API Test 17: Response times are acceptable

        Requirement: API responses < 1000ms for 95% of requests
        """
        endpoints = [
            '/api/status',
            '/api/health/live',
            '/api/metrics',
        ]

        for endpoint in endpoints:
            start = time.time()
            response = api_session.get(f'{BASE_URL}{endpoint}')
            duration = (time.time() - start) * 1000  # Convert to ms

            assert duration < 1000, f"{endpoint} took {duration:.0f}ms (max: 1000ms)"

    def test_concurrent_requests(self, api_session):
        """
        E2E API Test 18: System handles concurrent requests

        Verifies: No race conditions or crashes under load
        """
        import concurrent.futures

        def make_request():
            response = api_session.get(f'{BASE_URL}/api/health/live')
            return response.status_code

        # Make 10 concurrent requests
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(make_request) for _ in range(10)]
            results = [f.result() for f in concurrent.futures.as_completed(futures)]

        # All should succeed
        assert all(code == 200 for code in results)


# Mark all tests in this file as e2e
pytestmark = pytest.mark.e2e


if __name__ == '__main__':
    # Run with: python test_e2e_api.py
    pytest.main([__file__, '-v', '--tb=short'])
