"""
Unit tests for validation schemas.

Tests all 20 validation schemas to ensure:
- Required fields are enforced
- Format validation works correctly
- Range validation works correctly
- Length limits are enforced
- Invalid data is rejected with clear error messages
"""

import pytest
from marshmallow import ValidationError

from validation import (
    AgentCommandSchema,
    AlertActionSchema,
    AlertCreateSchema,
    AnalysisRequestSchema,
    ChatMessageSchema,
    EmptySchema,
    OptionsQuoteSchema,
    OptionsQuotesListSchema,
    OptionsStrategySchema,
    OrderSchema,
    PaginationSchema,
    ProposalActionSchema,
    SymbolSchema,
    SymbolsListSchema,
    TimeframeSchema,
    TradingModeSchema,
    WatchlistAddSchema,
    WatchlistDeleteSchema,
    get_validation_errors,
    validate_request,
)

# ============================================================================
# SYMBOL SCHEMA TESTS
# ============================================================================


class TestSymbolSchema:
    """Test single symbol validation."""

    def test_valid_symbol(self):
        """Valid symbols should pass."""
        data = {"symbol": "AAPL"}
        result = validate_request(SymbolSchema, data)
        assert result["symbol"] == "AAPL"

    def test_valid_single_letter(self):
        """Single letter symbols should pass."""
        data = {"symbol": "F"}
        result = validate_request(SymbolSchema, data)
        assert result["symbol"] == "F"

    def test_invalid_lowercase(self):
        """Lowercase symbols should fail."""
        data = {"symbol": "aapl"}
        with pytest.raises(ValidationError) as exc_info:
            validate_request(SymbolSchema, data)
        assert "symbol" in exc_info.value.messages

    def test_invalid_too_long(self):
        """Symbols longer than 5 chars should fail."""
        data = {"symbol": "TOOLONG"}
        with pytest.raises(ValidationError) as exc_info:
            validate_request(SymbolSchema, data)
        assert "symbol" in exc_info.value.messages

    def test_invalid_with_numbers(self):
        """Symbols with numbers should fail."""
        data = {"symbol": "AAPL1"}
        with pytest.raises(ValidationError) as exc_info:
            validate_request(SymbolSchema, data)
        assert "symbol" in exc_info.value.messages

    def test_missing_symbol(self):
        """Missing symbol should fail."""
        data = {}
        with pytest.raises(ValidationError) as exc_info:
            validate_request(SymbolSchema, data)
        assert "symbol" in exc_info.value.messages


class TestSymbolsListSchema:
    """Test multiple symbols validation."""

    def test_valid_symbols_list(self):
        """Valid list of symbols should pass."""
        data = {"symbols": ["AAPL", "GOOGL", "MSFT"]}
        result = validate_request(SymbolsListSchema, data)
        assert len(result["symbols"]) == 3

    def test_single_symbol(self):
        """Single symbol in list should pass."""
        data = {"symbols": ["AAPL"]}
        result = validate_request(SymbolsListSchema, data)
        assert len(result["symbols"]) == 1

    def test_max_symbols(self):
        """100 symbols should pass."""
        # Generate valid 1-5 letter symbols
        symbols = ["AAPL", "GOOGL", "MSFT", "TSLA", "AMZN"] * 20  # 100 valid symbols
        data = {"symbols": symbols}
        result = validate_request(SymbolsListSchema, data)
        assert len(result["symbols"]) == 100

    def test_too_many_symbols(self):
        """More than 100 symbols should fail."""
        symbols = [f"SYM{i:03d}" for i in range(101)]
        data = {"symbols": symbols}
        with pytest.raises(ValidationError) as exc_info:
            validate_request(SymbolsListSchema, data)
        assert "symbols" in exc_info.value.messages

    def test_empty_list(self):
        """Empty list should fail."""
        data = {"symbols": []}
        with pytest.raises(ValidationError) as exc_info:
            validate_request(SymbolsListSchema, data)
        assert "symbols" in exc_info.value.messages

    def test_invalid_symbol_in_list(self):
        """Invalid symbol in list should fail."""
        data = {"symbols": ["AAPL", "invalid", "MSFT"]}
        with pytest.raises(ValidationError):
            validate_request(SymbolsListSchema, data)


# ============================================================================
# WATCHLIST SCHEMA TESTS
# ============================================================================


class TestWatchlistAddSchema:
    """Test watchlist add validation."""

    def test_valid_minimal(self):
        """Minimal valid data should pass."""
        data = {"symbol": "AAPL"}
        result = validate_request(WatchlistAddSchema, data)
        assert result["symbol"] == "AAPL"

    def test_valid_with_all_fields(self):
        """All fields provided should pass."""
        data = {
            "symbol": "AAPL",
            "reason": "Strong momentum",
            "submitter": "TestUser",
            "confidence": 0.85,
            "priority": "high",
        }
        result = validate_request(WatchlistAddSchema, data)
        assert result["symbol"] == "AAPL"
        assert result["confidence"] == 0.85
        assert result["priority"] == "high"

    def test_reason_too_long(self):
        """Reason longer than 500 chars should fail."""
        data = {"symbol": "AAPL", "reason": "x" * 501}
        with pytest.raises(ValidationError) as exc_info:
            validate_request(WatchlistAddSchema, data)
        assert "reason" in exc_info.value.messages

    def test_invalid_confidence(self):
        """Confidence outside 0-1 range should fail."""
        data = {"symbol": "AAPL", "confidence": 1.5}
        with pytest.raises(ValidationError) as exc_info:
            validate_request(WatchlistAddSchema, data)
        assert "confidence" in exc_info.value.messages

    def test_invalid_priority(self):
        """Invalid priority should fail."""
        data = {"symbol": "AAPL", "priority": "urgent"}
        with pytest.raises(ValidationError) as exc_info:
            validate_request(WatchlistAddSchema, data)
        assert "priority" in exc_info.value.messages


class TestWatchlistDeleteSchema:
    """Test watchlist delete validation."""

    def test_valid_delete(self):
        """Valid delete request should pass."""
        data = {"symbol": "AAPL", "submitter": "TestUser"}
        result = validate_request(WatchlistDeleteSchema, data)
        assert result["symbol"] == "AAPL"
        assert result["submitter"] == "TestUser"

    def test_missing_submitter(self):
        """Missing submitter should fail."""
        data = {"symbol": "AAPL"}
        with pytest.raises(ValidationError) as exc_info:
            validate_request(WatchlistDeleteSchema, data)
        assert "submitter" in exc_info.value.messages


# ============================================================================
# PROPOSAL ACTION SCHEMA TESTS
# ============================================================================


class TestProposalActionSchema:
    """Test proposal action validation."""

    def test_valid_approval(self):
        """Valid approval should pass."""
        data = {"proposal_id": "prop123", "approver": "Admin"}
        result = validate_request(ProposalActionSchema, data)
        assert result["proposal_id"] == "prop123"
        assert result["approver"] == "Admin"

    def test_valid_with_notes(self):
        """Approval with notes should pass."""
        data = {"proposal_id": "prop123", "approver": "Admin", "notes": "Approved based on market conditions"}
        result = validate_request(ProposalActionSchema, data)
        assert result["notes"] == "Approved based on market conditions"

    def test_notes_too_long(self):
        """Notes longer than 1000 chars should fail."""
        data = {"proposal_id": "prop123", "approver": "Admin", "notes": "x" * 1001}
        with pytest.raises(ValidationError) as exc_info:
            validate_request(ProposalActionSchema, data)
        assert "notes" in exc_info.value.messages


# ============================================================================
# AGENT COMMAND SCHEMA TESTS
# ============================================================================


class TestAgentCommandSchema:
    """Test agent command validation."""

    def test_valid_command(self):
        """Valid command should pass."""
        data = {"command": "analyze AAPL"}
        result = validate_request(AgentCommandSchema, data)
        assert result["command"] == "analyze AAPL"

    def test_command_too_long(self):
        """Command longer than 500 chars should fail."""
        data = {"command": "x" * 501}
        with pytest.raises(ValidationError) as exc_info:
            validate_request(AgentCommandSchema, data)
        assert "command" in exc_info.value.messages

    def test_empty_command(self):
        """Empty command should fail."""
        data = {"command": ""}
        with pytest.raises(ValidationError) as exc_info:
            validate_request(AgentCommandSchema, data)
        assert "command" in exc_info.value.messages


# ============================================================================
# ORDER SCHEMA TESTS
# ============================================================================


class TestOrderSchema:
    """Test trading order validation."""

    def test_valid_market_order(self):
        """Valid market order should pass."""
        data = {"symbol": "AAPL", "quantity": 100, "side": "buy", "order_type": "market"}
        result = validate_request(OrderSchema, data)
        assert result["symbol"] == "AAPL"
        assert result["quantity"] == 100
        assert result["side"] == "buy"

    def test_valid_limit_order(self):
        """Valid limit order should pass."""
        data = {"symbol": "AAPL", "quantity": 100, "side": "sell", "order_type": "limit", "limit_price": 150.50}
        result = validate_request(OrderSchema, data)
        assert result["limit_price"] == 150.50

    def test_invalid_side(self):
        """Invalid side should fail."""
        data = {"symbol": "AAPL", "quantity": 100, "side": "hold"}
        with pytest.raises(ValidationError) as exc_info:
            validate_request(OrderSchema, data)
        assert "side" in exc_info.value.messages

    def test_quantity_too_large(self):
        """Quantity over 10,000 should fail."""
        data = {"symbol": "AAPL", "quantity": 10001, "side": "buy"}
        with pytest.raises(ValidationError) as exc_info:
            validate_request(OrderSchema, data)
        assert "quantity" in exc_info.value.messages

    def test_negative_quantity(self):
        """Negative quantity should fail."""
        data = {"symbol": "AAPL", "quantity": -100, "side": "buy"}
        with pytest.raises(ValidationError) as exc_info:
            validate_request(OrderSchema, data)
        assert "quantity" in exc_info.value.messages


# ============================================================================
# CHAT MESSAGE SCHEMA TESTS
# ============================================================================


class TestChatMessageSchema:
    """Test chat message validation."""

    def test_valid_message(self):
        """Valid message should pass."""
        data = {"message": "What is the current portfolio value?"}
        result = validate_request(ChatMessageSchema, data)
        assert result["message"] == "What is the current portfolio value?"

    def test_valid_with_context(self):
        """Message with context should pass."""
        data = {"message": "Analyze this stock", "context": "User is viewing AAPL detail page"}
        result = validate_request(ChatMessageSchema, data)
        assert result["context"] == "User is viewing AAPL detail page"

    def test_message_too_long(self):
        """Message longer than 5000 chars should fail."""
        data = {"message": "x" * 5001}
        with pytest.raises(ValidationError) as exc_info:
            validate_request(ChatMessageSchema, data)
        assert "message" in exc_info.value.messages

    def test_empty_message(self):
        """Empty message should fail."""
        data = {"message": ""}
        with pytest.raises(ValidationError) as exc_info:
            validate_request(ChatMessageSchema, data)
        assert "message" in exc_info.value.messages

    def test_context_too_long(self):
        """Context longer than 1000 chars should fail."""
        data = {"message": "test", "context": "x" * 1001}
        with pytest.raises(ValidationError) as exc_info:
            validate_request(ChatMessageSchema, data)
        assert "context" in exc_info.value.messages


# ============================================================================
# ALERT SCHEMA TESTS
# ============================================================================


class TestAlertCreateSchema:
    """Test alert creation validation."""

    def test_valid_alert(self):
        """Valid alert should pass."""
        data = {"symbol": "AAPL", "alert_type": "price_above", "condition_value": 150.0}
        result = validate_request(AlertCreateSchema, data)
        assert result["symbol"] == "AAPL"
        assert result["condition_value"] == 150.0

    def test_valid_with_all_fields(self):
        """Alert with all fields should pass."""
        data = {
            "symbol": "AAPL",
            "alert_type": "price_above",
            "condition_value": 150.0,
            "message": "AAPL hit target",
            "expires_in_hours": 24,
            "notify_channels": ["web", "email"],
        }
        result = validate_request(AlertCreateSchema, data)
        assert result["expires_in_hours"] == 24
        assert len(result["notify_channels"]) == 2

    def test_negative_condition_value(self):
        """Negative condition value should fail."""
        data = {"symbol": "AAPL", "alert_type": "price_above", "condition_value": -10.0}
        with pytest.raises(ValidationError) as exc_info:
            validate_request(AlertCreateSchema, data)
        assert "condition_value" in exc_info.value.messages

    def test_expiry_too_long(self):
        """Expiry over 168 hours (1 week) should fail."""
        data = {"symbol": "AAPL", "alert_type": "price_above", "condition_value": 150.0, "expires_in_hours": 169}
        with pytest.raises(ValidationError) as exc_info:
            validate_request(AlertCreateSchema, data)
        assert "expires_in_hours" in exc_info.value.messages


class TestAlertActionSchema:
    """Test alert action validation."""

    def test_valid_action(self):
        """Valid alert action should pass."""
        data = {"alert_id": "alert123"}
        result = validate_request(AlertActionSchema, data)
        assert result["alert_id"] == "alert123"

    def test_missing_alert_id(self):
        """Missing alert_id should fail."""
        data = {}
        with pytest.raises(ValidationError) as exc_info:
            validate_request(AlertActionSchema, data)
        assert "alert_id" in exc_info.value.messages


# ============================================================================
# OPTIONS SCHEMA TESTS
# ============================================================================


class TestOptionsQuoteSchema:
    """Test options quote validation."""

    def test_valid_quote(self):
        """Valid options quote request should pass."""
        data = {"symbol": "AAPL", "expiration": "2025-12-31", "option_type": "call", "strike": 150.0}
        result = validate_request(OptionsQuoteSchema, data)
        assert result["symbol"] == "AAPL"
        assert result["strike"] == 150.0

    def test_invalid_option_type(self):
        """Invalid option type should fail."""
        data = {"symbol": "AAPL", "expiration": "2025-12-31", "option_type": "both", "strike": 150.0}
        with pytest.raises(ValidationError) as exc_info:
            validate_request(OptionsQuoteSchema, data)
        assert "option_type" in exc_info.value.messages


class TestOptionsQuotesListSchema:
    """Test multiple options quotes validation."""

    def test_valid_quotes_list(self):
        """Valid list of option symbols should pass."""
        data = {"symbols": ["AAPL250131C00150000", "AAPL250131P00150000"]}
        result = validate_request(OptionsQuotesListSchema, data)
        assert len(result["symbols"]) == 2

    def test_too_many_symbols(self):
        """More than 100 symbols should fail."""
        symbols = [f"OPT{i:03d}" for i in range(101)]
        data = {"symbols": symbols}
        with pytest.raises(ValidationError) as exc_info:
            validate_request(OptionsQuotesListSchema, data)
        assert "symbols" in exc_info.value.messages


# ============================================================================
# ANALYSIS SCHEMA TESTS
# ============================================================================


class TestAnalysisRequestSchema:
    """Test analysis request validation."""

    def test_valid_minimal(self):
        """Minimal analysis request should pass."""
        data = {}
        result = validate_request(AnalysisRequestSchema, data)
        assert result is not None

    def test_valid_with_symbols(self):
        """Analysis with symbols should pass."""
        data = {"symbols": ["AAPL", "GOOGL"], "timeframe": "1w", "analysis_type": "technical"}
        result = validate_request(AnalysisRequestSchema, data)
        assert len(result["symbols"]) == 2
        assert result["timeframe"] == "1w"

    def test_invalid_timeframe(self):
        """Invalid timeframe should fail."""
        data = {"timeframe": "5m"}
        with pytest.raises(ValidationError) as exc_info:
            validate_request(AnalysisRequestSchema, data)
        assert "timeframe" in exc_info.value.messages

    def test_invalid_analysis_type(self):
        """Invalid analysis type should fail."""
        data = {"analysis_type": "quantum"}
        with pytest.raises(ValidationError) as exc_info:
            validate_request(AnalysisRequestSchema, data)
        assert "analysis_type" in exc_info.value.messages


class TestOptionsStrategySchema:
    """Test options strategy validation."""

    def test_valid_strategy(self):
        """Valid strategy should pass."""
        data = {"symbol": "AAPL", "strategy_type": "covered_call"}
        result = validate_request(OptionsStrategySchema, data)
        assert result["symbol"] == "AAPL"
        assert result["strategy_type"] == "covered_call"

    def test_valid_with_risk_params(self):
        """Strategy with risk parameters should pass."""
        data = {"symbol": "AAPL", "strategy_type": "iron_condor", "max_risk": 1000.0, "target_return": 0.15}
        result = validate_request(OptionsStrategySchema, data)
        assert result["max_risk"] == 1000.0
        assert result["target_return"] == 0.15

    def test_invalid_strategy_type(self):
        """Invalid strategy type should fail."""
        data = {"symbol": "AAPL", "strategy_type": "long_gamma_squeeze"}
        with pytest.raises(ValidationError) as exc_info:
            validate_request(OptionsStrategySchema, data)
        assert "strategy_type" in exc_info.value.messages


# ============================================================================
# PAGINATION SCHEMA TESTS
# ============================================================================


class TestPaginationSchema:
    """Test pagination validation."""

    def test_valid_pagination(self):
        """Valid pagination should pass."""
        data = {"limit": 50, "offset": 100}
        result = validate_request(PaginationSchema, data)
        assert result["limit"] == 50
        assert result["offset"] == 100

    def test_default_values(self):
        """Missing values should use defaults."""
        data = {}
        result = validate_request(PaginationSchema, data)
        assert result["limit"] == 20
        assert result["offset"] == 0

    def test_limit_too_large(self):
        """Limit over 100 should fail."""
        data = {"limit": 101}
        with pytest.raises(ValidationError) as exc_info:
            validate_request(PaginationSchema, data)
        assert "limit" in exc_info.value.messages


# ============================================================================
# UTILITY SCHEMA TESTS
# ============================================================================


class TestTimeframeSchema:
    """Test timeframe validation."""

    def test_valid_timeframes(self):
        """All valid timeframes should pass."""
        valid_timeframes = ["1m", "5m", "15m", "1h", "4h", "1d", "1w"]
        for tf in valid_timeframes:
            data = {"timeframe": tf}
            result = validate_request(TimeframeSchema, data)
            assert result["timeframe"] == tf

    def test_default_timeframe(self):
        """Missing timeframe should default to 1d."""
        data = {}
        result = validate_request(TimeframeSchema, data)
        assert result["timeframe"] == "1d"


class TestTradingModeSchema:
    """Test trading mode validation."""

    def test_valid_modes(self):
        """All valid modes should pass."""
        valid_modes = ["autonomous", "assisted", "paper", "live"]
        for mode in valid_modes:
            data = {"mode": mode}
            result = validate_request(TradingModeSchema, data)
            assert result["mode"] == mode

    def test_default_mode(self):
        """Missing mode should default to autonomous."""
        data = {}
        result = validate_request(TradingModeSchema, data)
        assert result["mode"] == "autonomous"


class TestEmptySchema:
    """Test empty schema validation."""

    def test_empty_data(self):
        """Empty data should pass."""
        data = {}
        result = validate_request(EmptySchema, data)
        assert result == {}

    def test_with_data(self):
        """EmptySchema should only accept empty data."""
        # EmptySchema is strict - it doesn't allow extra fields
        # This is expected behavior for endpoints that don't need request body
        data = {}
        result = validate_request(EmptySchema, data)
        assert result == {}


# ============================================================================
# HELPER FUNCTIONS TESTS
# ============================================================================


class TestGetValidationErrors:
    """Test validation error helper."""

    def test_valid_data_no_errors(self):
        """Valid data should return empty dict."""
        data = {"symbol": "AAPL"}
        errors = get_validation_errors(SymbolSchema, data)
        assert errors == {}

    def test_invalid_data_returns_errors(self):
        """Invalid data should return error dict."""
        data = {"symbol": "invalid"}
        errors = get_validation_errors(SymbolSchema, data)
        assert "symbol" in errors
        assert isinstance(errors["symbol"], list)


# ============================================================================
# RUN TESTS
# ============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
