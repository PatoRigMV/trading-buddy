"""
Input validation schemas for Trading Assistant API endpoints.

Uses marshmallow for robust input validation to prevent:
- SQL injection (when database is added)
- Invalid data types causing crashes
- Malformed symbols/quantities
- Missing required fields
"""

import re
from functools import wraps

from flask import jsonify, request
from marshmallow import Schema, ValidationError, fields, validate

# ============================================================================
# CUSTOM VALIDATORS
# ============================================================================


def validate_symbol(symbol: str) -> str:
    """Validate stock symbol format."""
    if not re.match(r"^[A-Z]{1,5}$", symbol):
        raise ValidationError("Symbol must be 1-5 uppercase letters")
    return symbol


def validate_quantity(quantity) -> int:
    """Validate trading quantity."""
    try:
        qty = int(quantity)
        if qty <= 0:
            raise ValidationError("Quantity must be positive")
        if qty > 10000:
            raise ValidationError("Quantity cannot exceed 10,000 shares")
        return qty
    except (ValueError, TypeError):
        raise ValidationError("Quantity must be a valid integer")


def validate_price(price) -> float:
    """Validate price value."""
    try:
        p = float(price)
        if p <= 0:
            raise ValidationError("Price must be positive")
        if p > 1000000:
            raise ValidationError("Price cannot exceed $1,000,000")
        return p
    except (ValueError, TypeError):
        raise ValidationError("Price must be a valid number")


# ============================================================================
# VALIDATION SCHEMAS
# ============================================================================


class SymbolSchema(Schema):
    """Validate single stock symbol."""

    symbol = fields.Str(
        required=True, validate=validate.Regexp(r"^[A-Z]{1,5}$", error="Symbol must be 1-5 uppercase letters")
    )


class SymbolsListSchema(Schema):
    """Validate list of stock symbols."""

    symbols = fields.List(
        fields.Str(validate=validate.Regexp(r"^[A-Z]{1,5}$")),
        required=True,
        validate=validate.Length(min=1, max=100, error="Must provide 1-100 symbols"),
    )


class WatchlistAddSchema(Schema):
    """Validate watchlist add request."""

    symbol = fields.Str(required=True, validate=validate.Regexp(r"^[A-Z]{1,5}$"))
    reason = fields.Str(required=False, validate=validate.Length(max=500, error="Reason cannot exceed 500 characters"))
    submitter = fields.Str(required=False, validate=validate.Length(max=100, error="Submitter name too long"))
    confidence = fields.Float(
        required=False, validate=validate.Range(min=0, max=1, error="Confidence must be between 0 and 1")
    )
    priority = fields.Str(
        required=False,
        validate=validate.OneOf(["high", "medium", "low"], error="Priority must be high, medium, or low"),
    )


class ProposalActionSchema(Schema):
    """Validate proposal approval/rejection."""

    proposal_id = fields.Str(required=True, validate=validate.Length(min=1, max=100))
    approver = fields.Str(required=True, validate=validate.Length(min=1, max=100))
    notes = fields.Str(required=False, validate=validate.Length(max=1000))


class AgentCommandSchema(Schema):
    """Validate agent command input."""

    command = fields.Str(
        required=True, validate=validate.Length(min=1, max=500, error="Command must be 1-500 characters")
    )


class OrderSchema(Schema):
    """Validate trading order parameters."""

    symbol = fields.Str(required=True, validate=validate.Regexp(r"^[A-Z]{1,5}$"))
    quantity = fields.Int(required=True, validate=validate.Range(min=1, max=10000))
    side = fields.Str(required=True, validate=validate.OneOf(["buy", "sell"]))
    order_type = fields.Str(required=False, validate=validate.OneOf(["market", "limit", "stop", "stop_limit"]))
    limit_price = fields.Float(required=False, validate=validate.Range(min=0.01, max=1000000))
    stop_price = fields.Float(required=False, validate=validate.Range(min=0.01, max=1000000))


class OptionsOrderSchema(Schema):
    """Validate options trading order."""

    symbol = fields.Str(required=True, validate=validate.Regexp(r"^[A-Z]{1,5}$"))
    option_symbol = fields.Str(required=True, validate=validate.Length(min=1, max=50))
    quantity = fields.Int(required=True, validate=validate.Range(min=1, max=100))
    side = fields.Str(required=True, validate=validate.OneOf(["buy", "sell", "buy_to_open", "sell_to_close"]))
    option_type = fields.Str(required=True, validate=validate.OneOf(["call", "put"]))


class PaginationSchema(Schema):
    """Validate pagination parameters."""

    limit = fields.Int(required=False, validate=validate.Range(min=1, max=100), load_default=20)
    offset = fields.Int(required=False, validate=validate.Range(min=0), load_default=0)


class TimeframeSchema(Schema):
    """Validate timeframe parameter."""

    timeframe = fields.Str(
        required=False, validate=validate.OneOf(["1m", "5m", "15m", "1h", "4h", "1d", "1w"]), load_default="1d"
    )


class TradingModeSchema(Schema):
    """Validate trading mode."""

    mode = fields.Str(
        required=False, validate=validate.OneOf(["autonomous", "assisted", "paper", "live"]), load_default="autonomous"
    )


class WatchlistDeleteSchema(Schema):
    """Validate watchlist delete request."""

    symbol = fields.Str(required=True, validate=validate.Regexp(r"^[A-Z]{1,5}$"))
    submitter = fields.Str(required=True, validate=validate.Length(min=1, max=100))


class ChatMessageSchema(Schema):
    """Validate chat message."""

    message = fields.Str(
        required=True, validate=validate.Length(min=1, max=5000, error="Message must be 1-5000 characters")
    )
    context = fields.Str(required=False, validate=validate.Length(max=1000))


class AlertCreateSchema(Schema):
    """Validate alert creation."""

    symbol = fields.Str(required=True, validate=validate.Regexp(r"^[A-Z]{1,5}$"))
    alert_type = fields.Str(required=True, validate=validate.Length(min=1, max=50))
    condition_value = fields.Float(required=True, validate=validate.Range(min=0))
    message = fields.Str(required=False, validate=validate.Length(max=500))
    expires_in_hours = fields.Int(required=False, validate=validate.Range(min=1, max=168))  # 1 hour to 1 week
    notify_channels = fields.List(fields.Str(), required=False, load_default=["web"])


class AlertActionSchema(Schema):
    """Validate alert pause/resume."""

    alert_id = fields.Str(required=True, validate=validate.Length(min=1, max=100))


class OptionsQuoteSchema(Schema):
    """Validate options quote request."""

    symbol = fields.Str(required=True, validate=validate.Regexp(r"^[A-Z]{1,5}$"))
    expiration = fields.Str(required=True, validate=validate.Length(min=10, max=10))  # YYYY-MM-DD format
    option_type = fields.Str(required=True, validate=validate.OneOf(["call", "put"]))
    strike = fields.Float(required=True, validate=validate.Range(min=0.01, max=100000))


class EmptySchema(Schema):
    """Schema for endpoints that don't require request body."""

    pass


class OptionsQuotesListSchema(Schema):
    """Validate multiple options symbols."""

    symbols = fields.List(
        fields.Str(validate=validate.Length(min=1, max=50)), required=True, validate=validate.Length(min=1, max=100)
    )


class AnalysisRequestSchema(Schema):
    """Validate analysis request."""

    symbols = fields.List(
        fields.Str(validate=validate.Regexp(r"^[A-Z]{1,5}$")), required=False, validate=validate.Length(max=50)
    )
    timeframe = fields.Str(required=False, validate=validate.OneOf(["1d", "1w", "1m", "3m", "6m", "1y"]))
    analysis_type = fields.Str(required=False, validate=validate.OneOf(["technical", "fundamental", "comprehensive"]))


class OptionsStrategySchema(Schema):
    """Validate options strategy request."""

    symbol = fields.Str(required=True, validate=validate.Regexp(r"^[A-Z]{1,5}$"))
    strategy_type = fields.Str(
        required=True,
        validate=validate.OneOf(
            ["covered_call", "cash_secured_put", "iron_condor", "butterfly", "straddle", "strangle", "vertical_spread"]
        ),
    )
    max_risk = fields.Float(required=False, validate=validate.Range(min=1, max=100000))
    target_return = fields.Float(required=False, validate=validate.Range(min=0.01, max=10))  # 1% to 1000%


# ============================================================================
# QUERY PARAMETER SCHEMAS (for GET endpoints)
# ============================================================================


class WatchlistQuerySchema(Schema):
    """Validate enhanced watchlist query parameters."""

    submitter_type = fields.Str(required=False, validate=validate.OneOf(["agent", "user", "system"]))
    entry_type = fields.Str(required=False, validate=validate.OneOf(["momentum", "breakout", "reversal", "manual"]))
    status = fields.Str(
        required=False, validate=validate.OneOf(["active", "expired", "removed"]), load_default="active"
    )
    min_confidence = fields.Float(required=False, validate=validate.Range(min=0, max=1))
    limit = fields.Int(required=False, validate=validate.Range(min=1, max=100), load_default=50)


class AlertsQuerySchema(Schema):
    """Validate alerts query parameters."""

    symbol = fields.Str(required=False, validate=validate.Regexp(r"^[A-Z]{1,5}$"))
    status = fields.Str(required=False, validate=validate.OneOf(["active", "triggered", "paused", "expired"]))


class NotificationsQuerySchema(Schema):
    """Validate notifications query parameters."""

    limit = fields.Int(required=False, validate=validate.Range(min=1, max=100), load_default=20)


class ChartQuerySchema(Schema):
    """Validate stock chart query parameters."""

    period = fields.Str(
        required=False, validate=validate.OneOf(["1D", "5D", "1M", "3M", "6M", "1Y", "5Y", "MAX"]), load_default="1D"
    )
    interval = fields.Str(
        required=False, validate=validate.OneOf(["1m", "5m", "15m", "30m", "1h", "1d", "1wk", "1mo"]), load_default="1d"
    )


class BulkPricesQuerySchema(Schema):
    """Validate bulk prices query parameters."""

    symbols = fields.Str(required=False, validate=validate.Length(max=1000))  # Max length for comma-separated symbols
    batch_size = fields.Int(required=False, validate=validate.Range(min=1, max=50), load_default=5)
    batch = fields.Int(required=False, validate=validate.Range(min=0, max=1000), load_default=0)


class LiveSignalsQuerySchema(Schema):
    """Validate live signals query parameters."""

    limit = fields.Int(required=False, validate=validate.Range(min=1, max=100), load_default=15)


class PortfolioHistoryQuerySchema(Schema):
    """Validate portfolio history query parameters."""

    period = fields.Str(
        required=False, validate=validate.OneOf(["1D", "5D", "1M", "3M", "6M", "1Y", "5Y", "MAX"]), load_default="1D"
    )
    timeframe = fields.Str(
        required=False, validate=validate.OneOf(["1Min", "5Min", "15Min", "1H", "1D"]), load_default="15Min"
    )


class SymbolQuerySchema(Schema):
    """Validate single symbol query parameter."""

    symbol = fields.Str(required=True, validate=validate.Regexp(r"^[A-Z]{1,5}$"))


class RealTimePricesQuerySchema(Schema):
    """Validate real-time prices query parameters."""

    symbols = fields.Str(required=False, validate=validate.Length(max=500))  # Comma-separated symbols
    batch_size = fields.Int(required=False, validate=validate.Range(min=1, max=20), load_default=5)
    batch = fields.Int(required=False, validate=validate.Range(min=0, max=100), load_default=0)


class OptionsOrdersQuerySchema(Schema):
    """Validate options orders query parameters."""

    limit = fields.Int(required=False, validate=validate.Range(min=1, max=200), load_default=50)


class MarketDataQuerySchema(Schema):
    """Validate market data query parameters."""

    symbols = fields.List(fields.Str(validate=validate.Regexp(r"^[A-Z]{1,5}$")), required=False)


# ============================================================================
# VALIDATION HELPERS
# ============================================================================


def validate_request(schema_class, data):
    """
    Validate request data against schema.

    Args:
        schema_class: Marshmallow schema class
        data: Data to validate (dict or request.json)

    Returns:
        Validated data dict

    Raises:
        ValidationError: If validation fails
    """
    schema = schema_class()
    return schema.load(data)


def get_validation_errors(schema_class, data):
    """
    Get validation errors without raising exception.

    Args:
        schema_class: Marshmallow schema class
        data: Data to validate

    Returns:
        dict: Validation errors or empty dict if valid
    """
    schema = schema_class()
    try:
        schema.load(data)
        return {}
    except ValidationError as e:
        return e.messages


# ============================================================================
# DECORATOR FOR ROUTE VALIDATION
# ============================================================================


def validate_json(schema_class):
    """
    Decorator to validate request JSON against schema.

    Usage:
        @app.route('/api/watchlist/add', methods=['POST'])
        @validate_json(WatchlistAddSchema)
        def add_to_watchlist():
            # request.validated_data contains validated data
            data = request.validated_data
            ...
    """

    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            if not request.is_json:
                return jsonify({"success": False, "error": "Content-Type must be application/json"}), 400

            try:
                validated_data = validate_request(schema_class, request.json)
                # Attach validated data to request object
                request.validated_data = validated_data
                return f(*args, **kwargs)
            except ValidationError as e:
                return jsonify({"success": False, "error": "Validation failed", "details": e.messages}), 400

        return wrapper

    return decorator


def validate_query_params(schema_class):
    """
    Decorator to validate query parameters against schema.

    Usage:
        @app.route('/api/data')
        @validate_query_params(PaginationSchema)
        def get_data():
            # request.validated_params contains validated params
            params = request.validated_params
            ...
    """

    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            try:
                validated_params = validate_request(schema_class, request.args.to_dict())
                request.validated_params = validated_params
                return f(*args, **kwargs)
            except ValidationError as e:
                return jsonify({"success": False, "error": "Invalid query parameters", "details": e.messages}), 400

        return wrapper

    return decorator
