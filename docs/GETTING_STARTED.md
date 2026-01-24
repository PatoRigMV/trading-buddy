# Getting Started Guide

This guide walks you through setting up Trading Buddy from scratch.

---

## Prerequisites

- **Python 3.9+**
- **Node.js 18+** (optional, for TypeScript agent)
- **Git**

---

## Step 1: Clone the Repository

```bash
git clone https://github.com/heyhaigh/trading-buddy.git
cd trading-buddy
```

---

## Step 2: Set Up Python Environment

### Option A: Using venv (Recommended)

```bash
# Create virtual environment
python -m venv venv

# Activate it
source venv/bin/activate  # Linux/Mac
# or
venv\Scripts\activate     # Windows

# Install dependencies
pip install -r requirements.txt
```

### Option B: Using conda

```bash
conda create -n trading-buddy python=3.11
conda activate trading-buddy
pip install -r requirements.txt
```

---

## Step 3: Configure Environment Variables

### Create .env File

```bash
cp .env.example .env
```

### Generate Secret Key

```bash
python -c 'import secrets; print(secrets.token_hex(32))'
```

Copy the output and paste it as your `SECRET_KEY` in `.env`.

### Get API Keys

At minimum, you need:

#### 1. Alpaca (Required for Trading)

1. Go to [alpaca.markets](https://alpaca.markets)
2. Create a free account
3. Navigate to "API Keys" in your dashboard
4. Generate paper trading keys

```bash
APCA_API_KEY_ID=your_key_here
APCA_API_SECRET_KEY=your_secret_here
APCA_API_BASE_URL=https://paper-api.alpaca.markets
```

#### 2. Market Data (At least one)

**Option A: Polygon.io**

1. Go to [polygon.io](https://polygon.io)
2. Create account and get API key

```bash
POLYGON_API_KEY=your_polygon_key
```

**Option B: Finnhub**

1. Go to [finnhub.io](https://finnhub.io)
2. Create free account

```bash
FINNHUB_API_KEY=your_finnhub_key
```

### Complete .env Example

```bash
# Required
SECRET_KEY=your_generated_secret_key_here
ENVIRONMENT=development
ALLOWED_ORIGINS=http://localhost:8000

# Trading (Required)
APCA_API_KEY_ID=your_alpaca_key
APCA_API_SECRET_KEY=your_alpaca_secret
APCA_API_BASE_URL=https://paper-api.alpaca.markets
TRADING_MODE=paper

# Market Data (At least one)
POLYGON_API_KEY=your_polygon_key
FINNHUB_API_KEY=your_finnhub_key

# Optional
ALPHA_VANTAGE_API_KEY=
TIINGO_API_TOKEN=
NEWSAPI_KEY=
```

---

## Step 4: Verify Installation

### Run Tests

```bash
pytest tests/ -v
```

### Check Configuration

```bash
python -c "from config import TradingConfig; print('Config OK')"
```

---

## Step 5: Start the Application

### Development Mode

```bash
python run_web.py
```

You should see:

```
 * Running on http://127.0.0.1:8000
 * Restarting with stat
 * Debugger is active!
```

### Open in Browser

Navigate to [http://localhost:8000](http://localhost:8000)

---

## Step 6: Explore the Interface

### Dashboard

The main dashboard shows:
- Portfolio overview
- Watchlist
- Recent trades
- Agent status

### Try These Actions

1. **Add to Watchlist**: Type a symbol (e.g., "AAPL") and click Add
2. **Get Quote**: Click on a watchlist item to see details
3. **View Chart**: Technical analysis charts with indicators
4. **Check Portfolio**: See your paper trading positions

---

## Step 7: Make Your First Paper Trade

### Via Web Interface

1. Search for a stock (e.g., "AAPL")
2. Click "Trade"
3. Enter quantity and price
4. Submit order

### Via API

```bash
curl -X POST http://localhost:8000/api/trade/propose \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "AAPL",
    "action": "BUY",
    "quantity": 10,
    "price": 185.00
  }'
```

### Via Python

```python
import requests

response = requests.post('http://localhost:8000/api/trade/propose', json={
    "symbol": "AAPL",
    "action": "BUY",
    "quantity": 10,
    "price": 185.00
})

print(response.json())
```

---

## Optional: TypeScript Agent

If you want to use the TypeScript trading agent:

### Install Dependencies

```bash
cd trading-agent
pnpm install  # or npm install
```

### Build

```bash
pnpm build
```

### Run Portfolio Agent

```bash
npx ts-node src/cli/portfolioAgent.ts
```

---

## Project Structure Overview

```
trading-buddy/
│
├── run_web.py              # Entry point - start here!
├── web_app.py              # Flask application
│
├── # Core Components
├── multi_api_aggregator.py # Data aggregation
├── provider_router.py      # API routing
├── risk_manager.py         # Risk controls
├── trade_executor.py       # Order execution
│
├── # Agents
├── chat_agent.py           # NL interface
├── analysis_engine.py      # Analysis
├── agent_watchdog.py       # Process monitor
│
├── # Configuration
├── config.json             # Trading rules
├── data_providers.yaml     # API config
├── .env                    # Your API keys
│
└── # Documentation
    └── docs/               # You are here!
```

---

## Common Issues

### "SECRET_KEY must be set"

Generate a secret key:
```bash
python -c 'import secrets; print(secrets.token_hex(32))'
```

Add it to your `.env` file.

### "No module named 'xxx'"

Install missing dependencies:
```bash
pip install -r requirements.txt
```

### "API rate limit exceeded"

You're making too many requests. The system will automatically back off and retry.

### "Cannot connect to Alpaca"

1. Check your API keys are correct
2. Ensure you're using paper trading URL for paper keys
3. Verify your account is active

### Port 8000 Already in Use

Change the port:
```bash
python run_web.py --port 8080
```

Or kill the existing process:
```bash
lsof -i :8000  # Find PID
kill -9 <PID>
```

---

## Next Steps

1. **Read the Documentation**
   - [Architecture](ARCHITECTURE.md) - Understand the system
   - [Agents](AGENTS.md) - Learn about agents
   - [API Integrations](API_INTEGRATIONS.md) - Configure data providers
   - [Risk Management](RISK_MANAGEMENT.md) - Safety features

2. **Customize Configuration**
   - Edit `config.json` for trading rules
   - Edit `data_providers.yaml` for data sources

3. **Add More API Keys**
   - More data sources = better data quality
   - See [API Integrations](API_INTEGRATIONS.md)

4. **Build Your Strategy**
   - Extend `analysis_engine.py`
   - Add custom indicators
   - Implement your trading logic

5. **Test Thoroughly**
   - Use paper trading extensively
   - Run backtests
   - Monitor performance

---

## Getting Help

- **GitHub Issues**: [Report bugs](https://github.com/heyhaigh/trading-buddy/issues)
- **Discussions**: [Ask questions](https://github.com/heyhaigh/trading-buddy/discussions)
- **Documentation**: Check the `docs/` folder

---

## Quick Reference

### Start Application
```bash
python run_web.py
```

### Run Tests
```bash
pytest
```

### Check Logs
```bash
tail -f logs/trading_web.log
```

### API Endpoints
```
GET  /                    # Dashboard
GET  /api/portfolio       # Portfolio status
GET  /api/quotes/<symbol> # Get quote
POST /api/trade/propose   # Propose trade
GET  /api/watchlist       # Watchlist
```
