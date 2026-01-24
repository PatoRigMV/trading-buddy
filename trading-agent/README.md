# Autonomous Trading Agent (Paper-First)

An autonomous trading agent that scores **buy** and **sell** confidence for equities using weighted signals, executes with **risk controls**, and logs all decisions for **auditability**.

⚠️ Default mode is **paper trading only**. Live orders require explicit flags.

---

## Features
- Confidence-based decision engine (0–1 scale)
- Weighted signals: EMA cross, RSI, ATR, volume, breakout, regime filter
- Risk management:
  - Max 1% equity risk per trade
  - ATR-based stops
  - Daily loss kill switch
  - Exposure caps
- State machine: Idle → Entry → Position → Exit
- Broker adapter: Alpaca (paper first)
- Market data adapter: Alpaca or Yahoo
- Backtesting with PnL, Sharpe, MaxDD reports
- SQLite + Prisma persistence
- REST API for status + metrics
- CLI tools: run agent, backtest, report

---

## Requirements
- Node.js 20+
- pnpm (`npm install -g pnpm`)
- SQLite
- Alpaca API key (paper)

---

## Setup
```bash
git clone <this-repo>
cd trading-agent
pnpm install
cp .env.example .env   # add Alpaca paper API keys
```

---

## Run Agent
```bash
pnpm agent --config config/strategy.yaml
```

---

## Backtest
```bash
pnpm backtest --config config/strategy.yaml --from 2023-01-01 --to 2025-08-31
pnpm report --run latest
```

---

## API
```bash
pnpm api
```

Endpoints:
- `GET /health`
- `GET /positions`
- `GET /pnl/daily`
- `GET /decisions?symbol=AAPL`

---

## Project Layout
```
/src
  /adapters
    Broker.ts
    AlpacaBroker.ts
  /data
    MarketData.ts
    AlpacaData.ts
    YahooData.ts
  /engine
    indicators.ts
    scorer.ts
    risk.ts
    stateMachine.ts
    agent.ts
  /cli
    runAgent.ts
    backtest.ts
  /api
    server.ts
  /db
    prisma.ts
/config
  strategy.yaml
  schema.json
/tests
  scorer.test.ts
  risk.test.ts
.env.example
README.md
```

---

## Safety
- Starts in **paper** mode always
- Live trading requires:
  - `TRADING_MODE=live`
  - CLI flag `--confirm-live`
- `BLOCK_NEW_ORDERS=true` stops agent immediately
