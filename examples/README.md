# Examples

Ready-to-run code examples showing how to use and extend Trading Buddy.

## Quick Start Examples

| Example | Description |
|---------|-------------|
| [basic_trade.py](basic_trade.py) | Place a paper trade via the API |
| [fetch_quotes.py](fetch_quotes.py) | Fetch real-time quotes from multiple providers |
| [custom_indicator.py](custom_indicator.py) | Add a custom technical indicator |
| [custom_agent.py](custom_agent.py) | Create a new specialized agent |
| [webhook_alerts.py](webhook_alerts.py) | Set up price alerts with webhooks |

## Running Examples

```bash
# Activate virtual environment first
source venv/bin/activate

# Run any example
python examples/basic_trade.py
python examples/fetch_quotes.py AAPL
```

## Prerequisites

Make sure you have:
1. Completed setup (`make setup`)
2. Added API keys to `.env`
3. Activated virtual environment (`source venv/bin/activate`)
