# Trading Buddy

An open-source autonomous trading platform with multi-agent architecture, intelligent data aggregation, and comprehensive risk management.

Built for developers who want to create their own algorithmic trading systems.

---

## What is Trading Buddy?

Trading Buddy is a production-ready framework for building autonomous stock trading systems. It combines:

- **Multi-Agent Architecture**: Specialized agents for different trading tasks
- **Intelligent Data Aggregation**: 10+ market data providers with automatic failover
- **Risk Management**: Circuit breakers, position limits, and exposure controls
- **Paper Trading**: Full Alpaca integration for risk-free testing
- **Real-Time Monitoring**: WebSocket streaming, watchlists, and alerts

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              TRADING BUDDY                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │    Chat     │  │  Analysis   │  │    Risk     │  │   Trade     │        │
│  │   Agent     │  │   Engine    │  │  Manager    │  │  Executor   │        │
│  │             │  │             │  │             │  │             │        │
│  │ • NL Query  │  │ • Technical │  │ • Position  │  │ • Order     │        │
│  │ • Intent    │  │ • Fundmtl   │  │   Sizing    │  │   Routing   │        │
│  │ • Response  │  │ • Sentiment │  │ • Circuit   │  │ • TWAP/VWAP │        │
│  └──────┬──────┘  └──────┬──────┘  │   Breakers  │  │ • Slippage  │        │
│         │                │         └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                │               │
│  ┌──────┴────────────────┴────────────────┴────────────────┴──────┐        │
│  │                     PROVIDER ROUTER                             │        │
│  │            (Domain-Specific Data Routing + Validation)          │        │
│  └─────┬──────────┬──────────┬──────────┬──────────┬─────────────┘        │
│        │          │          │          │          │                       │
│   ┌────┴────┐┌────┴────┐┌────┴────┐┌────┴────┐┌────┴────┐                 │
│   │ Polygon ││ Finnhub ││ YCharts ││ Tiingo  ││  Yahoo  │                 │
│   │ (Price) ││ (Quote) ││ (Fund.) ││ (News)  ││(Fallbck)│                 │
│   └─────────┘└─────────┘└─────────┘└─────────┘└─────────┘                 │
│                                                                            │
└────────────────────────────────┬───────────────────────────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │    ALPACA BROKER API   │
                    │    (Paper / Live)      │
                    └────────────────────────┘
```

---

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/heyhaigh/trading-buddy.git
cd trading-buddy
```

### 2. Install Dependencies

```bash
# Python dependencies
pip install -r requirements.txt

# TypeScript agent (optional)
cd trading-agent && pnpm install && cd ..
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Generate a secure secret key:
```bash
python -c 'import secrets; print(secrets.token_hex(32))'
```

Edit `.env` with your API keys (see [API Integrations](docs/API_INTEGRATIONS.md)).

### 4. Run the Application

```bash
python run_web.py
```

Visit `http://localhost:8000` in your browser.

---

## Documentation

| Document | Description |
|----------|-------------|
| **[Architecture](docs/ARCHITECTURE.md)** | System design, data flow, component interactions |
| **[Agents Guide](docs/AGENTS.md)** | All specialized agents, their roles, and how they coordinate |
| **[API Integrations](docs/API_INTEGRATIONS.md)** | Data providers, configuration, and rate limits |
| **[Risk Management](docs/RISK_MANAGEMENT.md)** | Safety features, circuit breakers, position controls |
| **[Getting Started](docs/GETTING_STARTED.md)** | Step-by-step setup guide |

---

## Key Features

### Multi-Source Data Aggregation

Trading Buddy intelligently routes data requests to the best available provider with automatic failover:

| Data Domain | Primary | Secondary | Tertiary | Fallback |
|-------------|---------|-----------|----------|----------|
| **Prices** | Polygon WS | Tiingo IEX | Finnhub | Yahoo Finance |
| **Fundamentals** | YCharts | FMP | Alpha Vantage | Yahoo Finance |
| **News** | Benzinga | Tiingo News | NewsAPI | - |
| **Sentiment** | Tiingo NLP | StockTwits | - | - |
| **Corporate Actions** | Polygon | FMP | Tiingo | - |
| **Macro Data** | YCharts | FRED | - | - |

### Specialized Agents

| Agent | File | Purpose |
|-------|------|---------|
| **Chat Agent** | `chat_agent.py` | Natural language interface for queries and commands |
| **Analysis Engine** | `analysis_engine.py` | Technical indicators, fundamental analysis |
| **Risk Manager** | `risk_manager.py` | Position sizing, exposure limits, circuit breakers |
| **Trade Executor** | `trade_executor.py` | Order routing, execution algorithms (TWAP/VWAP) |
| **Agent Watchdog** | `agent_watchdog.py` | Process monitoring, auto-restart on failure |
| **YCharts Agent** | `ycharts_market_agent.py` | Professional financial analytics |
| **Portfolio Manager** | `portfolio_manager.py` | Portfolio tracking, rebalancing |

### Risk Management

Built-in safety features protect your capital:

| Feature | Default | Description |
|---------|---------|-------------|
| **Daily Loss Limit** | 3% | Halt trading if daily P&L drops below threshold |
| **Portfolio Loss Limit** | 10% | Emergency stop if total drawdown exceeds limit |
| **Max Position Size** | 5% | Maximum allocation per security |
| **Max Sector Exposure** | 20% | Maximum allocation per sector |
| **Conviction Threshold** | 60% | Minimum confidence score for trade execution |

### Paper Trading

Full integration with Alpaca's paper trading API for risk-free testing:

```python
# Environment variables
APCA_API_KEY_ID=your_paper_key
APCA_API_SECRET_KEY=your_paper_secret
APCA_API_BASE_URL=https://paper-api.alpaca.markets
TRADING_MODE=paper
```

---

## Project Structure

```
trading-buddy/
├── docs/                          # Comprehensive documentation
│   ├── ARCHITECTURE.md            # System design
│   ├── AGENTS.md                  # Agent documentation
│   ├── API_INTEGRATIONS.md        # Data provider setup
│   ├── RISK_MANAGEMENT.md         # Safety features
│   └── GETTING_STARTED.md         # Setup guide
│
├── trading-agent/                 # TypeScript trading agent
│   ├── src/
│   │   ├── adapters/             # Broker adapters (Alpaca)
│   │   ├── analytics/            # Factor attribution
│   │   ├── api/                  # REST API server
│   │   ├── audit/                # Compliance logging
│   │   ├── cli/                  # CLI agents
│   │   ├── core/                 # Orchestration
│   │   └── data/                 # Market data providers
│   └── package.json
│
├── templates/                     # Web UI (Flask templates)
├── tests/                         # Test suite
│
├── # Core Python Components
├── web_app.py                    # Flask application (225KB, main entry)
├── multi_api_aggregator.py       # Data source aggregation
├── provider_router.py            # Intelligent routing with failover
├── analysis_engine.py            # Technical/fundamental analysis
├── risk_manager.py               # Risk assessment and controls
├── trade_executor.py             # Order execution engine
├── portfolio_manager.py          # Portfolio tracking
├── compliance.py                 # Regulatory compliance
├── paper_trading.py              # Paper trading simulation
│
├── # Specialized Agents
├── agent_watchdog.py             # Process monitoring
├── chat_agent.py                 # Natural language interface
├── ycharts_market_agent.py       # Professional analytics
├── dough_report_agent.py         # Market reports
│
├── # Configuration
├── config.json                   # Trading rules and parameters
├── data_providers.yaml           # Provider configuration
├── .env.example                  # Environment template
│
└── # Infrastructure
    ├── requirements.txt          # Python dependencies
    ├── docker-compose.yml        # Container orchestration
    └── pytest.ini               # Test configuration
```

---

## API Keys Required

### Required (Pick at least one data source)

| Service | Purpose | Free Tier | Link |
|---------|---------|-----------|------|
| **Alpaca** | Paper/Live Trading | Yes | [alpaca.markets](https://alpaca.markets) |
| **Polygon** | Real-time Prices | Limited | [polygon.io](https://polygon.io) |
| **Finnhub** | Quotes & Fundamentals | Yes | [finnhub.io](https://finnhub.io) |

### Recommended

| Service | Purpose | Free Tier | Link |
|---------|---------|-----------|------|
| **Alpha Vantage** | Backup Data | Yes | [alphavantage.co](https://www.alphavantage.co) |
| **Tiingo** | News & IEX Data | Yes | [tiingo.com](https://www.tiingo.com) |
| **NewsAPI** | News Articles | Yes | [newsapi.org](https://newsapi.org) |

### Professional (Optional)

| Service | Purpose | Link |
|---------|---------|------|
| **YCharts** | Professional Analytics | [ycharts.com](https://ycharts.com) |
| **Benzinga** | Pro News Feed | [benzinga.com](https://www.benzinga.com) |
| **RapidAPI** | Twelve Data, FMP, StockTwits | [rapidapi.com](https://rapidapi.com) |

---

## Testing

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=. --cov-report=html

# Run specific test file
pytest tests/test_risk_manager.py

# Run integration tests
pytest tests/test_api_integration.py
```

---

## Deployment

### Development

```bash
python run_web.py
```

### Production with Docker

```bash
docker-compose up -d
```

### Environment Variables

See `.env.example` for all configuration options.

---

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md).

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

MIT License - See [LICENSE](LICENSE) for details.

---

## Disclaimer

**This software is for educational and research purposes only.**

- This is not financial advice
- Trading involves substantial risk of loss
- Past performance does not guarantee future results
- Always do your own research (DYOR)
- Consult a qualified financial advisor before investing real money
- The authors are not responsible for any financial losses

---

## Acknowledgments

- [Alpaca](https://alpaca.markets) - Commission-free trading API
- [Polygon.io](https://polygon.io) - Real-time market data
- [YCharts](https://ycharts.com) - Professional financial analytics

---

Built with care by [@heyhaigh](https://github.com/heyhaigh)
