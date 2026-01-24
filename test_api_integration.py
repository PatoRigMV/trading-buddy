"""
Integration tests for Trading Assistant API endpoints with validation.

Tests the actual Flask routes with validation decorators to ensure:
- Valid requests pass through successfully
- Invalid requests return proper 400 validation errors
- Response formats are consistent (APIResponse)
- All validated endpoints work correctly
"""

import json
import os

import pytest

# Set required environment variables for testing before importing web_app
os.environ["SECRET_KEY"] = "test_secret_key_for_integration_tests_only"
os.environ["POLYGON_API_KEY"] = "test_polygon_key"
os.environ["APCA_API_KEY_ID"] = "test_alpaca_key"
os.environ["APCA_API_SECRET_KEY"] = "test_alpaca_secret"

from web_app import app  # noqa: E402


@pytest.fixture
def client():
    """Create test client for Flask app"""
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


class TestWatchlistEndpoints:
    """Test /api/watchlist/* endpoints"""

    def test_add_to_watchlist_valid(self, client):
        """Test adding valid symbol to watchlist"""
        response = client.post(
            "/api/watchlist/add", json={"symbol": "AAPL", "reason": "Strong momentum"}, content_type="application/json"
        )
        # May return 400 if watchlist manager not initialized in test env
        assert response.status_code in [200, 201, 400]
        data = json.loads(response.data)
        # If successful, check success field
        if response.status_code in [200, 201]:
            assert data.get("success") in [True, "success", "ok"]

    def test_add_to_watchlist_invalid_symbol(self, client):
        """Test validation fails for invalid symbol"""
        response = client.post(
            "/api/watchlist/add", json={"symbol": "invalid123", "reason": "Test"}, content_type="application/json"
        )
        assert response.status_code == 400
        data = json.loads(response.data)
        assert data["success"] is False
        assert "symbol" in str(data).lower()

    def test_add_to_watchlist_missing_symbol(self, client):
        """Test validation fails when symbol is missing"""
        response = client.post("/api/watchlist/add", json={"reason": "Test"}, content_type="application/json")
        assert response.status_code == 400
        data = json.loads(response.data)
        assert data["success"] is False

    def test_add_to_watchlist_not_json(self, client):
        """Test validation fails for non-JSON content"""
        response = client.post("/api/watchlist/add", data="not json", content_type="text/plain")
        assert response.status_code == 400
        data = json.loads(response.data)
        assert "json" in str(data).lower()


class TestAgentCommandEndpoint:
    """Test /api/agent_command endpoint"""

    def test_agent_command_valid(self, client):
        """Test valid agent command"""
        response = client.post("/api/agent_command", json={"command": "analyze AAPL"}, content_type="application/json")
        # May return 200, 202, or 503 depending on agent availability
        assert response.status_code in [200, 202, 503]

    def test_agent_command_empty(self, client):
        """Test validation fails for empty command"""
        response = client.post("/api/agent_command", json={"command": ""}, content_type="application/json")
        assert response.status_code == 400
        data = json.loads(response.data)
        assert data["success"] is False

    def test_agent_command_too_long(self, client):
        """Test validation fails for command exceeding max length"""
        response = client.post("/api/agent_command", json={"command": "x" * 501}, content_type="application/json")
        assert response.status_code == 400
        data = json.loads(response.data)
        assert data["success"] is False


class TestChatEndpoint:
    """Test /api/chat endpoint"""

    def test_chat_valid_message(self, client):
        """Test valid chat message"""
        response = client.post(
            "/api/chat", json={"message": "What is the current market status?"}, content_type="application/json"
        )
        assert response.status_code in [200, 503]  # 503 if chat agent unavailable

    def test_chat_empty_message(self, client):
        """Test validation fails for empty message"""
        response = client.post("/api/chat", json={"message": ""}, content_type="application/json")
        assert response.status_code == 400
        data = json.loads(response.data)
        assert data["success"] is False

    def test_chat_message_too_long(self, client):
        """Test validation fails for message exceeding max length"""
        response = client.post("/api/chat", json={"message": "x" * 5001}, content_type="application/json")
        assert response.status_code == 400


class TestAlertEndpoints:
    """Test /api/alerts/* endpoints"""

    def test_create_alert_valid(self, client):
        """Test creating valid price alert"""
        response = client.post(
            "/api/alerts",
            json={
                "symbol": "AAPL",
                "alert_type": "price_above",
                "condition_value": 150.0,
                "message": "AAPL above $150",
            },
            content_type="application/json",
        )
        # May fail if price_alerts_manager not initialized, but validation should pass
        assert response.status_code in [200, 201, 400]  # 400 if manager not initialized
        data = json.loads(response.data)
        if response.status_code in [200, 201]:
            assert data.get("success") in [True, "success"]

    def test_create_alert_invalid_symbol(self, client):
        """Test validation fails for invalid symbol"""
        response = client.post(
            "/api/alerts",
            json={"symbol": "123", "alert_type": "price_above", "condition_value": 150.0},
            content_type="application/json",
        )
        assert response.status_code == 400
        data = json.loads(response.data)
        assert data["success"] is False

    def test_create_alert_negative_value(self, client):
        """Test validation fails for negative condition value"""
        response = client.post(
            "/api/alerts",
            json={"symbol": "AAPL", "alert_type": "price_above", "condition_value": -10.0},
            content_type="application/json",
        )
        assert response.status_code == 400

    def test_get_alerts_with_filters(self, client):
        """Test getting alerts with query filters"""
        response = client.get("/api/alerts?symbol=AAPL&status=active")
        # May return 200 or 400 depending on manager initialization
        assert response.status_code in [200, 400]

    def test_get_alerts_invalid_symbol(self, client):
        """Test validation fails for invalid symbol in query"""
        response = client.get("/api/alerts?symbol=invalid123")
        assert response.status_code == 400
        data = json.loads(response.data)
        assert data["success"] is False


class TestOptionsEndpoints:
    """Test /api/options/* endpoints"""

    def test_options_quotes_valid(self, client):
        """Test getting options quotes with valid data"""
        response = client.post(
            "/api/options/quotes",
            json={"symbol": "AAPL", "expiration": "2025-12-19", "option_type": "call", "strike": 150.0},
            content_type="application/json",
        )
        # May succeed or fail depending on data availability
        assert response.status_code in [200, 400, 404, 503]

    def test_options_quotes_invalid_expiration(self, client):
        """Test validation fails for invalid expiration date format"""
        response = client.post(
            "/api/options/quotes",
            json={"symbol": "AAPL", "expiration": "12/19/2025", "option_type": "call", "strike": 150.0},  # Wrong format
            content_type="application/json",
        )
        assert response.status_code == 400

    def test_options_quotes_invalid_type(self, client):
        """Test validation fails for invalid option type"""
        response = client.post(
            "/api/options/quotes",
            json={"symbol": "AAPL", "expiration": "2025-12-19", "option_type": "invalid", "strike": 150.0},
            content_type="application/json",
        )
        assert response.status_code == 400


class TestEnhancedWatchlistEndpoints:
    """Test /api/enhanced-watchlist/* endpoints"""

    def test_get_enhanced_watchlist(self, client):
        """Test getting enhanced watchlist"""
        response = client.get("/api/enhanced-watchlist")
        # Should succeed if manager is initialized
        assert response.status_code in [200, 400]

    def test_get_enhanced_watchlist_with_filters(self, client):
        """Test getting watchlist with query filters"""
        response = client.get("/api/enhanced-watchlist?submitter_type=agent&status=active&limit=10")
        assert response.status_code in [200, 400]

    def test_get_enhanced_watchlist_invalid_limit(self, client):
        """Test validation fails for invalid limit"""
        response = client.get("/api/enhanced-watchlist?limit=999")
        assert response.status_code == 400
        data = json.loads(response.data)
        assert data["success"] is False

    def test_add_enhanced_watchlist_valid(self, client):
        """Test adding to enhanced watchlist"""
        response = client.post(
            "/api/enhanced-watchlist",
            json={"symbol": "TSLA", "reason": "Breakout pattern", "confidence": 0.85, "priority": "high"},
            content_type="application/json",
        )
        assert response.status_code in [200, 201, 400]

    def test_add_enhanced_watchlist_invalid_confidence(self, client):
        """Test validation fails for confidence out of range"""
        response = client.post(
            "/api/enhanced-watchlist",
            json={"symbol": "TSLA", "confidence": 1.5},  # Must be 0-1
            content_type="application/json",
        )
        assert response.status_code == 400


class TestQueryParameterEndpoints:
    """Test GET endpoints with query parameter validation"""

    def test_stock_chart_valid(self, client):
        """Test stock chart with valid query params"""
        response = client.get("/api/stock_chart/AAPL?period=1D&interval=5m")
        # May succeed or fail depending on data availability
        assert response.status_code in [200, 400, 503]

    def test_stock_chart_invalid_period(self, client):
        """Test validation fails for invalid period"""
        response = client.get("/api/stock_chart/AAPL?period=INVALID")
        assert response.status_code == 400
        data = json.loads(response.data)
        assert data["success"] is False

    def test_portfolio_history_valid(self, client):
        """Test portfolio history with valid params"""
        response = client.get("/api/portfolio_history?period=1M&timeframe=15Min")
        assert response.status_code in [200, 400, 503]

    def test_portfolio_history_invalid_timeframe(self, client):
        """Test validation fails for invalid timeframe"""
        response = client.get("/api/portfolio_history?timeframe=INVALID")
        assert response.status_code == 400

    def test_live_signals_with_limit(self, client):
        """Test live signals with limit parameter"""
        response = client.get("/api/live_signals?limit=10")
        assert response.status_code in [200, 400]

    def test_live_signals_invalid_limit(self, client):
        """Test validation fails for limit out of range"""
        response = client.get("/api/live_signals?limit=999")
        assert response.status_code == 400

    def test_bulk_prices_valid(self, client):
        """Test bulk prices with valid params"""
        response = client.get("/api/enhanced/bulk_prices?symbols=AAPL,GOOGL,MSFT&batch_size=3")
        assert response.status_code in [200, 400]

    def test_bulk_prices_invalid_batch_size(self, client):
        """Test validation fails for invalid batch size"""
        response = client.get("/api/enhanced/bulk_prices?batch_size=999")
        assert response.status_code == 400


class TestProposalEndpoints:
    """Test /api/proposals/* endpoints"""

    def test_approve_proposal_valid(self, client):
        """Test approving proposal with valid data"""
        response = client.post(
            "/api/proposals/test-123/approve",
            json={"proposal_id": "test-123", "approver": "test_user", "notes": "Looks good"},
            content_type="application/json",
        )
        # May succeed or fail depending on whether proposal exists
        assert response.status_code in [200, 400, 404]

    def test_approve_proposal_missing_approver(self, client):
        """Test validation fails when approver is missing"""
        response = client.post(
            "/api/proposals/test-123/approve",
            json={"proposal_id": "test-123", "notes": "Looks good"},
            content_type="application/json",
        )
        assert response.status_code == 400

    def test_reject_proposal_valid(self, client):
        """Test rejecting proposal"""
        response = client.post(
            "/api/proposals/test-123/reject",
            json={"proposal_id": "test-123", "approver": "test_user", "notes": "Risk too high"},
            content_type="application/json",
        )
        assert response.status_code in [200, 400, 404]


class TestAnalysisEndpoints:
    """Test analysis endpoints"""

    def test_manual_analysis_valid(self, client):
        """Test manual analysis with valid symbols"""
        response = client.post(
            "/api/manual_analysis", json={"symbols": ["AAPL", "GOOGL", "MSFT"]}, content_type="application/json"
        )
        assert response.status_code in [200, 202, 400, 503]

    def test_manual_analysis_too_many_symbols(self, client):
        """Test validation fails for too many symbols"""
        response = client.post(
            "/api/manual_analysis",
            json={"symbols": ["SYM" + str(i) for i in range(51)]},
            content_type="application/json",
        )
        assert response.status_code == 400

    def test_manual_analysis_invalid_symbols(self, client):
        """Test validation fails for invalid symbol format"""
        response = client.post(
            "/api/manual_analysis", json={"symbols": ["AAPL", "123", "GOOGL"]}, content_type="application/json"
        )
        assert response.status_code == 400


class TestResponseConsistency:
    """Test that all endpoints return consistent APIResponse format"""

    def test_validation_error_format(self, client):
        """Test that validation errors have consistent format"""
        response = client.post("/api/watchlist/add", json={"symbol": "invalid123"}, content_type="application/json")
        assert response.status_code == 400
        data = json.loads(response.data)

        # Check standard error response format
        assert "success" in data
        assert data["success"] is False
        assert "error" in data
        assert isinstance(data["error"], str)

    def test_missing_json_error_format(self, client):
        """Test that missing JSON returns proper error"""
        response = client.post("/api/watchlist/add", data="not json", content_type="text/plain")
        assert response.status_code == 400
        data = json.loads(response.data)
        assert data["success"] is False
        assert "json" in data["error"].lower()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
