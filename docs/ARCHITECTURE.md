# Architecture Overview

This document describes the system architecture of Trading Buddy, including component interactions, data flow, and design decisions.

---

## System Layers

Trading Buddy is organized into four primary layers:

```
┌─────────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Web UI     │  │   REST API   │  │   WebSocket  │          │
│  │  (Flask)     │  │  (Flask)     │  │   (SocketIO) │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
├─────────────────────────────────────────────────────────────────┤
│                     AGENT LAYER                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │  Chat    │ │ Analysis │ │  Risk    │ │  Trade   │          │
│  │  Agent   │ │  Engine  │ │ Manager  │ │ Executor │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
├─────────────────────────────────────────────────────────────────┤
│                   DATA LAYER                                    │
│  ┌──────────────────────────────────────────────────┐          │
│  │              Provider Router                      │          │
│  │   (Domain-Specific Routing + Validation)         │          │
│  └──────────────────────────────────────────────────┘          │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐       │
│  │Polygon │ │Finnhub │ │YCharts │ │ Tiingo │ │ Yahoo  │       │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘       │
├─────────────────────────────────────────────────────────────────┤
│                  EXECUTION LAYER                                │
│  ┌──────────────────────────────────────────────────┐          │
│  │              Alpaca Broker API                    │          │
│  │         (Paper Trading / Live Trading)           │          │
│  └──────────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Details

### 1. Presentation Layer

#### Web Application (`web_app.py`)

The main Flask application serving the web UI and REST API.

**Key Features:**
- Real-time dashboard with portfolio overview
- Interactive stock charts with technical indicators
- Watchlist management
- Trade proposal interface
- Agent status monitoring

**Endpoints:**
```
GET  /                          # Main dashboard
GET  /api/portfolio             # Portfolio status
GET  /api/quotes/<symbol>       # Real-time quotes
POST /api/trade/propose         # Propose a trade
GET  /api/watchlist             # Watchlist items
WS   /socket.io                 # Real-time updates
```

#### WebSocket (`SocketIO`)

Real-time communication for:
- Live price updates
- Trade notifications
- Agent status changes
- Alert triggers

---

### 2. Agent Layer

Each agent is a specialized component with a single responsibility:

#### Chat Agent (`chat_agent.py`)

**Purpose:** Natural language interface for user interactions

**Capabilities:**
- Intent classification (price check, analysis, trade, watchlist)
- Entity extraction (stock symbols, quantities, prices)
- Context management (conversation history)
- Response generation

**Example Flow:**
```python
user_input = "What's the price of AAPL?"
         ↓
intent = "price_check"
entities = {"symbol": "AAPL"}
         ↓
response = {"text": "AAPL is trading at $185.42", "data": {...}}
```

#### Analysis Engine (`analysis_engine.py`)

**Purpose:** Technical and fundamental analysis

**Technical Indicators:**
- Moving Averages (SMA, EMA)
- RSI (Relative Strength Index)
- MACD (Moving Average Convergence Divergence)
- Bollinger Bands
- Volume Analysis

**Fundamental Analysis:**
- P/E Ratio analysis
- Revenue growth trends
- Profit margins
- Debt-to-equity

#### Risk Manager (`risk_manager.py`)

**Purpose:** Assess and control trading risk

**Assessment Flow:**
```
Trade Proposal
      ↓
┌─────────────────┐
│ Conviction Check │ → Reject if < 10%
└────────┬────────┘
         ↓
┌─────────────────┐
│ Position Sizing  │ → Reject if > 5% portfolio
└────────┬────────┘
         ↓
┌─────────────────┐
│ Exposure Check   │ → Reject if sector > 20%
└────────┬────────┘
         ↓
┌─────────────────┐
│ Circuit Breaker  │ → Reject if loss limits hit
└────────┬────────┘
         ↓
┌─────────────────┐
│ Risk Score Calc  │ → Final 0-1 score
└────────┬────────┘
         ↓
    Approved / Rejected
```

#### Trade Executor (`trade_executor.py`)

**Purpose:** Execute approved trades

**Order Types:**
- MARKET - Immediate execution
- LIMIT - Execute at specified price or better
- TWAP - Time-Weighted Average Price
- VWAP - Volume-Weighted Average Price

**Execution Flow:**
```
Approved Trade
      ↓
Market Hours Check
      ↓
Order Creation
      ↓
Broker Submission (Alpaca)
      ↓
Fill Monitoring
      ↓
Execution Report
```

---

### 3. Data Layer

#### Provider Router (`provider_router.py`)

The intelligent routing system that manages data fetching across multiple providers.

**Domain-Specific Routing:**

```yaml
PRICES:
  primary: polygon_ws       # WebSocket for real-time
  secondary: tiingo_iex     # IEX prints
  tertiary: finnhub_rest    # REST backup
  fallback: yahoo_finance   # Always available

FUNDAMENTALS:
  primary: ycharts          # Professional analytics
  secondary: fmp_rapidapi   # Financial Modeling Prep
  tertiary: alpha_vantage   # Comprehensive data
  fallback: yahoo_finance   # Basic fundamentals
```

**Key Features:**

1. **Rate Limiting** - Per-provider leaky bucket
2. **Circuit Breakers** - Auto-disable failing providers
3. **Cross-Validation** - Multi-source consensus
4. **Automatic Failover** - Cascade through hierarchy

#### Multi-API Aggregator (`multi_api_aggregator.py`)

Aggregates and validates data from multiple sources.

**Validation Rules:**
```python
# Price validation
max_discrepancy = 0.5%  # Sources must agree within 0.5%

# Fundamental validation
cross_check_ratios = True  # Validate PE, PB across sources

# Freshness requirements
quotes_stale_after = 2 seconds
bars_stale_after = 60 seconds
fundamentals_stale_after = 90 days
```

---

### 4. Execution Layer

#### Alpaca Integration

**Paper Trading:**
```python
base_url = "https://paper-api.alpaca.markets"
```

**Live Trading:**
```python
base_url = "https://api.alpaca.markets"
```

**Supported Operations:**
- Account information
- Position management
- Order submission
- Order status
- Portfolio history
- Market data streaming

---

## Data Flow Examples

### 1. User Requests Stock Quote

```
User → Chat Agent → Provider Router → Polygon API
                                    → Finnhub API (parallel)
                         ↓
                    Aggregator validates
                         ↓
                    Response to User
```

### 2. Trade Execution Flow

```
User proposes trade
        ↓
Chat Agent extracts intent
        ↓
Risk Manager assesses
        ↓
If approved:
    Trade Executor creates order
        ↓
    Alpaca API submission
        ↓
    Monitor for fill
        ↓
    Notify user via WebSocket
```

### 3. Real-Time Price Streaming

```
Polygon WebSocket connects
        ↓
Subscribe to symbols
        ↓
Price updates received
        ↓
Broadcast via SocketIO
        ↓
Web UI updates
```

---

## Configuration

### Trading Configuration (`config.json`)

```json
{
  "risk_management": {
    "max_risk_per_trade": 0.0075,
    "max_single_security": 0.05,
    "max_asset_class": 0.20,
    "portfolio_loss_circuit_breaker": -0.10,
    "single_day_loss_circuit_breaker": -0.03
  }
}
```

### Provider Configuration (`data_providers.yaml`)

```yaml
data_providers:
  prices:
    primary: polygon_ws
    secondary: tiingo_iex
    fallback: yahoo_finance

rate_limits:
  polygon_rest:
    rpm: 300
    burst: 10
```

---

## TypeScript Trading Agent

Located in `trading-agent/`, this is an alternative implementation in TypeScript.

**Structure:**
```
trading-agent/
├── src/
│   ├── adapters/          # Broker adapters
│   │   ├── AlpacaBroker.ts
│   │   └── AlpacaOptionsBroker.ts
│   ├── analytics/         # Factor attribution
│   ├── api/              # REST server
│   ├── audit/            # Compliance logging
│   ├── cli/              # CLI agents
│   │   ├── runAgent.ts
│   │   ├── portfolioAgent.ts
│   │   └── simpleOptionsAgent.ts
│   ├── core/             # Orchestration
│   └── data/             # Market data
```

---

## Scalability Considerations

### Horizontal Scaling

- Web servers can be load-balanced
- Redis for shared state (optional)
- WebSocket sticky sessions required

### Performance Optimization

- Connection pooling for HTTP/2
- Request caching with TTL
- Async/await throughout
- Batch API requests where possible

---

## Security

### API Key Management

All API keys loaded from environment variables:
```python
api_key = os.environ.get('POLYGON_API_KEY', '')
```

### CORS Configuration

```python
ALLOWED_ORIGINS = os.environ.get('ALLOWED_ORIGINS', 'http://localhost:8000')
```

### Rate Limiting

Built-in rate limiting prevents API abuse and respects provider limits.

---

## Monitoring

### Health Checks

```
GET /api/health           # Application health
GET /api/health/providers # Data provider status
```

### Logging

Structured logging throughout:
```python
logger.info("Trade executed", extra={
    "symbol": "AAPL",
    "quantity": 10,
    "price": 185.42
})
```

### Metrics

Optional Prometheus/OTLP exporters for:
- Request latency
- API error rates
- Trade execution times
- Provider availability
