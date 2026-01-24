"""
Generate OpenAPI 3.0 specification from validation schemas.

This script introspects the validation schemas and API endpoints
to automatically generate an OpenAPI specification file.
"""

import json

import yaml
from marshmallow import fields

from validation import (  # noqa: F401
    AgentCommandSchema,
    AlertActionSchema,
    AlertCreateSchema,
    AlertsQuerySchema,
    AnalysisRequestSchema,
    BulkPricesQuerySchema,
    ChartQuerySchema,
    ChatMessageSchema,
    LiveSignalsQuerySchema,
    MarketDataQuerySchema,
    NotificationsQuerySchema,
    OptionsOrderSchema,
    OptionsOrdersQuerySchema,
    OptionsQuoteSchema,
    OptionsQuotesListSchema,
    OptionsStrategySchema,
    OrderSchema,
    PaginationSchema,
    PortfolioHistoryQuerySchema,
    ProposalActionSchema,
    RealTimePricesQuerySchema,
    SymbolQuerySchema,
    SymbolSchema,
    SymbolsListSchema,
    TimeframeSchema,
    TradingModeSchema,
    WatchlistAddSchema,
    WatchlistDeleteSchema,
    WatchlistQuerySchema,
)


def get_openapi_type(field):
    """Convert marshmallow field to OpenAPI type"""
    type_mapping = {
        fields.String: {"type": "string"},
        fields.Str: {"type": "string"},
        fields.Integer: {"type": "integer"},
        fields.Int: {"type": "integer"},
        fields.Float: {"type": "number", "format": "float"},
        fields.Boolean: {"type": "boolean"},
        fields.Bool: {"type": "boolean"},
        fields.List: {"type": "array"},
        fields.Dict: {"type": "object"},
    }

    field_class = type(field)
    return type_mapping.get(field_class, {"type": "string"})


def schema_to_openapi(schema_class):
    """Convert marshmallow schema to OpenAPI schema"""
    schema = schema_class()
    properties = {}
    required = []

    for field_name, field_obj in schema.fields.items():
        prop = get_openapi_type(field_obj)

        # Add description from field
        if hasattr(field_obj, "metadata") and "description" in field_obj.metadata:
            prop["description"] = field_obj.metadata["description"]

        # Add format/pattern from validators
        if hasattr(field_obj, "validators"):
            for validator in field_obj.validators:
                if hasattr(validator, "regex"):
                    prop["pattern"] = str(validator.regex.pattern)
                elif hasattr(validator, "choices"):
                    prop["enum"] = list(validator.choices)
                elif hasattr(validator, "min") and hasattr(validator, "max"):
                    prop["minimum"] = validator.min
                    prop["maximum"] = validator.max

        # Check if required
        if field_obj.required:
            required.append(field_name)

        # Add default if present (check for marshmallow._Missing type)
        if hasattr(field_obj, "load_default"):
            from marshmallow import missing as marshmallow_missing

            if field_obj.load_default is not marshmallow_missing:
                prop["default"] = field_obj.load_default

        properties[field_name] = prop

    return {"type": "object", "properties": properties, "required": required if required else []}


def generate_openapi_spec():
    """Generate complete OpenAPI specification"""

    spec = {
        "openapi": "3.0.0",
        "info": {
            "title": "Trading Assistant API",
            "version": "1.0.0",
            "description": "RESTful API for algorithmic trading with AI-powered analysis",
            "contact": {"name": "Trading Assistant Support", "email": "support@tradingassistant.com"},
        },
        "servers": [{"url": "http://localhost:8000", "description": "Development server"}],
        "paths": {},
        "components": {
            "schemas": {},
            "responses": {
                "SuccessResponse": {
                    "description": "Successful operation",
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "success": {"type": "boolean", "example": True},
                                    "data": {"type": "object"},
                                    "message": {"type": "string"},
                                },
                            }
                        }
                    },
                },
                "ErrorResponse": {
                    "description": "Error response",
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "success": {"type": "boolean", "example": False},
                                    "error": {"type": "string"},
                                    "details": {"type": "object"},
                                },
                            }
                        }
                    },
                },
                "ValidationError": {
                    "description": "Validation error",
                    "content": {
                        "application/json": {
                            "schema": {
                                "type": "object",
                                "properties": {
                                    "success": {"type": "boolean", "example": False},
                                    "error": {"type": "string", "example": "Validation failed"},
                                    "details": {"type": "object"},
                                },
                            }
                        }
                    },
                },
            },
        },
    }

    # Add all schemas
    schemas_map = {
        "SymbolSchema": SymbolSchema,
        "SymbolsListSchema": SymbolsListSchema,
        "WatchlistAddSchema": WatchlistAddSchema,
        "WatchlistDeleteSchema": WatchlistDeleteSchema,
        "WatchlistQuerySchema": WatchlistQuerySchema,
        "ProposalActionSchema": ProposalActionSchema,
        "AgentCommandSchema": AgentCommandSchema,
        "OrderSchema": OrderSchema,
        "OptionsOrderSchema": OptionsOrderSchema,
        "PaginationSchema": PaginationSchema,
        "TimeframeSchema": TimeframeSchema,
        "TradingModeSchema": TradingModeSchema,
        "ChatMessageSchema": ChatMessageSchema,
        "AlertCreateSchema": AlertCreateSchema,
        "AlertActionSchema": AlertActionSchema,
        "AlertsQuerySchema": AlertsQuerySchema,
        "OptionsQuoteSchema": OptionsQuoteSchema,
        "OptionsQuotesListSchema": OptionsQuotesListSchema,
        "AnalysisRequestSchema": AnalysisRequestSchema,
        "OptionsStrategySchema": OptionsStrategySchema,
        "NotificationsQuerySchema": NotificationsQuerySchema,
        "ChartQuerySchema": ChartQuerySchema,
        "BulkPricesQuerySchema": BulkPricesQuerySchema,
        "LiveSignalsQuerySchema": LiveSignalsQuerySchema,
        "PortfolioHistoryQuerySchema": PortfolioHistoryQuerySchema,
        "SymbolQuerySchema": SymbolQuerySchema,
        "RealTimePricesQuerySchema": RealTimePricesQuerySchema,
        "OptionsOrdersQuerySchema": OptionsOrdersQuerySchema,
        "MarketDataQuerySchema": MarketDataQuerySchema,
    }

    for schema_name, schema_class in schemas_map.items():
        spec["components"]["schemas"][schema_name] = schema_to_openapi(schema_class)

    # Define endpoints
    endpoints = {
        "/api/watchlist/add": {
            "post": {
                "summary": "Add symbol to watchlist",
                "tags": ["Watchlist"],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/WatchlistAddSchema"}}},
                },
                "responses": {
                    "200": {"$ref": "#/components/responses/SuccessResponse"},
                    "400": {"$ref": "#/components/responses/ValidationError"},
                },
            }
        },
        "/api/enhanced-watchlist": {
            "get": {
                "summary": "Get enhanced watchlist",
                "tags": ["Watchlist"],
                "parameters": [
                    {
                        "name": "submitter_type",
                        "in": "query",
                        "schema": {"type": "string", "enum": ["agent", "user", "system"]},
                    },
                    {
                        "name": "status",
                        "in": "query",
                        "schema": {"type": "string", "enum": ["active", "expired", "removed"], "default": "active"},
                    },
                    {
                        "name": "limit",
                        "in": "query",
                        "schema": {"type": "integer", "minimum": 1, "maximum": 100, "default": 50},
                    },
                ],
                "responses": {
                    "200": {"$ref": "#/components/responses/SuccessResponse"},
                    "400": {"$ref": "#/components/responses/ErrorResponse"},
                },
            }
        },
        "/api/agent_command": {
            "post": {
                "summary": "Send command to trading agent",
                "tags": ["Agent"],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/AgentCommandSchema"}}},
                },
                "responses": {
                    "200": {"$ref": "#/components/responses/SuccessResponse"},
                    "400": {"$ref": "#/components/responses/ValidationError"},
                },
            }
        },
        "/api/chat": {
            "post": {
                "summary": "Send chat message to AI agent",
                "tags": ["Chat"],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/ChatMessageSchema"}}},
                },
                "responses": {
                    "200": {"$ref": "#/components/responses/SuccessResponse"},
                    "400": {"$ref": "#/components/responses/ValidationError"},
                },
            }
        },
        "/api/alerts": {
            "get": {
                "summary": "Get price alerts",
                "tags": ["Alerts"],
                "parameters": [
                    {"name": "symbol", "in": "query", "schema": {"type": "string", "pattern": "^[A-Z]{1,5}$"}},
                    {
                        "name": "status",
                        "in": "query",
                        "schema": {"type": "string", "enum": ["active", "triggered", "paused", "expired"]},
                    },
                ],
                "responses": {
                    "200": {"$ref": "#/components/responses/SuccessResponse"},
                    "400": {"$ref": "#/components/responses/ValidationError"},
                },
            },
            "post": {
                "summary": "Create price alert",
                "tags": ["Alerts"],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/AlertCreateSchema"}}},
                },
                "responses": {
                    "201": {"$ref": "#/components/responses/SuccessResponse"},
                    "400": {"$ref": "#/components/responses/ValidationError"},
                },
            },
        },
        "/api/options/quotes": {
            "post": {
                "summary": "Get options quotes",
                "tags": ["Options"],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/OptionsQuoteSchema"}}},
                },
                "responses": {
                    "200": {"$ref": "#/components/responses/SuccessResponse"},
                    "400": {"$ref": "#/components/responses/ValidationError"},
                },
            }
        },
        "/api/stock_chart/{symbol}": {
            "get": {
                "summary": "Get stock chart data",
                "tags": ["Market Data"],
                "parameters": [
                    {
                        "name": "symbol",
                        "in": "path",
                        "required": True,
                        "schema": {"type": "string", "pattern": "^[A-Z]{1,5}$"},
                    },
                    {
                        "name": "period",
                        "in": "query",
                        "schema": {
                            "type": "string",
                            "enum": ["1D", "5D", "1M", "3M", "6M", "1Y", "5Y", "MAX"],
                            "default": "1D",
                        },
                    },
                    {
                        "name": "interval",
                        "in": "query",
                        "schema": {
                            "type": "string",
                            "enum": ["1m", "5m", "15m", "30m", "1h", "1d", "1wk", "1mo"],
                            "default": "1d",
                        },
                    },
                ],
                "responses": {
                    "200": {"$ref": "#/components/responses/SuccessResponse"},
                    "400": {"$ref": "#/components/responses/ValidationError"},
                },
            }
        },
        "/api/portfolio_history": {
            "get": {
                "summary": "Get portfolio performance history",
                "tags": ["Portfolio"],
                "parameters": [
                    {
                        "name": "period",
                        "in": "query",
                        "schema": {
                            "type": "string",
                            "enum": ["1D", "5D", "1M", "3M", "6M", "1Y", "5Y", "MAX"],
                            "default": "1D",
                        },
                    },
                    {
                        "name": "timeframe",
                        "in": "query",
                        "schema": {"type": "string", "enum": ["1Min", "5Min", "15Min", "1H", "1D"], "default": "15Min"},
                    },
                ],
                "responses": {
                    "200": {"$ref": "#/components/responses/SuccessResponse"},
                    "400": {"$ref": "#/components/responses/ErrorResponse"},
                },
            }
        },
        "/api/manual_analysis": {
            "post": {
                "summary": "Request manual analysis",
                "tags": ["Analysis"],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/AnalysisRequestSchema"}}},
                },
                "responses": {
                    "200": {"$ref": "#/components/responses/SuccessResponse"},
                    "400": {"$ref": "#/components/responses/ValidationError"},
                },
            }
        },
    }

    spec["paths"] = endpoints

    return spec


def main():
    """Generate and save OpenAPI specification"""
    spec = generate_openapi_spec()

    # Save as JSON
    with open("openapi.json", "w") as f:
        json.dump(spec, f, indent=2)

    # Save as YAML
    with open("openapi.yaml", "w") as f:
        yaml.dump(spec, f, default_flow_style=False, sort_keys=False)

    print("✅ Generated OpenAPI specification:")
    print("   - openapi.json")
    print("   - openapi.yaml")
    print("\n📊 Statistics:")
    print(f"   - {len(spec['components']['schemas'])} schemas")
    print(f"   - {len(spec['paths'])} endpoints")
    print("\n🌐 View at: https://editor.swagger.io/")
    print("   (Paste openapi.yaml contents)")


if __name__ == "__main__":
    main()
