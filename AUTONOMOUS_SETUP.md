# 🤖 Autonomous Trading Agent Setup Guide

Your existing trading assistant now supports **fully autonomous trading** - no human approval required!

## How It Works

When you click "Start Trading", the system now:

1. **🧠 Analyzes market data** using technical indicators (RSI, EMA, ATR, volume, momentum)
2. **📊 Scores confidence** for buy/sell/hold decisions (0-1 scale)
3. **⚖️ Applies risk management** (position sizing, exposure limits, stop losses)
4. **🚀 Executes trades automatically** when confidence thresholds are met
5. **📈 Monitors positions** and exits based on sell signals or stop losses

**No human intervention needed** - the AI makes all decisions autonomously based on your configured risk parameters.

## Setup Steps

### 1. Install Dependencies

```bash
cd trading-agent
npm install -g pnpm
pnpm install
```

### 2. Set Up Alpaca Paper Trading

1. Go to [Alpaca Markets](https://alpaca.markets) and create a free paper trading account
2. Get your Paper Trading API credentials
3. Copy the example environment file:
   ```bash
   cd trading-agent
   cp .env.example .env
   ```
4. Edit `.env` and add your credentials:
   ```env
   APCA_API_KEY_ID=your_paper_key_here
   APCA_API_SECRET_KEY=your_paper_secret_here
   APCA_API_BASE_URL=https://paper-api.alpaca.markets
   TRADING_MODE=paper
   ```

### 3. Configure Trading Strategy

Edit `trading-agent/config/strategy.yaml`:

```yaml
symbols: [AAPL, MSFT, GOOGL, NVDA]  # Stocks to trade
interval: 5min                       # Analysis timeframe
mode: paper                          # paper or live
equity_start: 100000                 # Starting capital

risk:
  per_trade: 0.01                    # 1% risk per trade
  max_daily_loss: 0.03               # 3% max daily loss
  max_positions: 5                   # Max concurrent positions
  max_exposure_symbol: 0.10          # 10% max per symbol

thresholds:
  buy_enter: 0.65                    # Buy when confidence ≥ 65%
  sell_exit: 0.70                    # Sell when confidence ≥ 70%
```

### 4. Initialize Database

```bash
cd trading-agent
npx prisma generate
npx prisma db push
```

## How to Use

### Option 1: Via Web Interface (Recommended)

1. Start your web interface: `python3 web_app.py`
2. Open http://127.0.0.1:5001
3. Click "Initialize"
4. Click "Start Trading"
5. **You're done!** The AI agent will trade autonomously

The web interface will show:
- 🤖 "Autonomous trading started - AI agent will trade independently"
- ✅ "No human approval required - AI makes all trading decisions"

### Option 2: Direct CLI

```bash
cd trading-agent
pnpm agent --config config/strategy.yaml
```

## Monitoring

### Real-Time Updates
The web interface shows:
- Trade executions
- Risk management decisions
- Market analysis results
- Position changes
- P&L updates

### API Endpoints
- `GET /health` - Agent status
- `GET /positions` - Current positions
- `GET /decisions` - Decision history
- `POST /emergency-stop` - Emergency stop

### Emergency Stop
- **Web Interface**: Emergency stop button
- **CLI**: Press Ctrl+C twice quickly
- **API**: `POST /api/emergency_stop`

## Safety Features

✅ **Paper Trading First** - Always starts in paper mode
✅ **Risk Limits** - Position sizing, daily loss limits, exposure caps
✅ **Stop Losses** - ATR-based automatic stop losses
✅ **Audit Trail** - All decisions logged to database
✅ **Emergency Stop** - Instantly close all positions
✅ **Fail-Safe** - Multiple confirmation layers for live trading

## Trading Logic

The agent uses a **confidence-based scoring system**:

### Buy Signals (weighted):
- 📈 **Momentum** (25%): Recent price direction
- ⚡ **EMA Fast** (20%): Short-term trend
- 📊 **EMA Slow** (15%): Long-term trend
- 🎯 **RSI** (15%): Oversold conditions
- 📊 **Volume** (10%): Volume confirmation
- 🚀 **Breakout** (10%): Price breakouts
- 📉 **Low Volatility** (5%): Stability preference

### Risk Management:
- **Position Size**: Based on ATR and confidence score
- **Stop Loss**: ATR-based (typically 2-3% below entry)
- **Take Profit**: Risk/reward ratio of 1:2
- **Daily Loss Limit**: Stops trading if daily loss exceeds threshold

### Example Decision Process:
1. **Market Data** → RSI=25 (oversold), EMA signals bullish, volume spike
2. **Confidence Score** → Buy confidence = 0.72 (above 0.65 threshold)
3. **Risk Check** → Position size = 50 shares (1% portfolio risk)
4. **Execute** → Buy 50 AAPL @ $150, stop loss @ $147

## Backtesting

Test your strategy on historical data:

```bash
cd trading-agent
pnpm backtest --from 2023-01-01 --to 2024-12-31
```

## Configuration Tips

### Conservative Setup:
```yaml
thresholds:
  buy_enter: 0.75    # Higher confidence required
  sell_exit: 0.65    # Quicker exits
risk:
  per_trade: 0.005   # 0.5% risk per trade
```

### Aggressive Setup:
```yaml
thresholds:
  buy_enter: 0.60    # Lower confidence threshold
  sell_exit: 0.75    # Hold longer
risk:
  per_trade: 0.02    # 2% risk per trade
```

## Troubleshooting

**Agent won't start?**
- Check `.env` file has correct Alpaca credentials
- Verify `pnpm install` completed successfully
- Check `trading-agent.log` for errors

**No trades executed?**
- Lower confidence thresholds in `strategy.yaml`
- Check market hours (agent only trades when markets are open)
- Verify symbols are valid and liquid

**Want to paper trade first?**
- Keep `TRADING_MODE=paper` in `.env`
- Use Alpaca paper trading credentials
- All trades use virtual money

---

## 🎯 You're Ready!

Your trading assistant is now fully autonomous. Click "Start Trading" and watch the AI trade independently based on market conditions and your risk parameters.

No more approving individual trades - the AI handles everything automatically! 🚀
