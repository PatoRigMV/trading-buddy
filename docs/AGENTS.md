# Specialized Agents Guide

Trading Buddy uses a multi-agent architecture where each agent has a specific responsibility. This document details each agent, its role, and how they work together.

---

## Agent Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          AGENT ECOSYSTEM                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   USER INPUT                                                            │
│       │                                                                 │
│       ▼                                                                 │
│   ┌─────────────────┐                                                  │
│   │   Chat Agent    │ ◄── Natural Language Processing                  │
│   │                 │     Intent Classification                         │
│   └────────┬────────┘     Entity Extraction                            │
│            │                                                            │
│            ▼                                                            │
│   ┌─────────────────┐     ┌─────────────────┐                         │
│   │ Analysis Engine │ ◄──►│   YCharts Agent │                         │
│   │                 │     │                 │                         │
│   │ • Technical     │     │ • Pro Analytics │                         │
│   │ • Fundamental   │     │ • Market Data   │                         │
│   └────────┬────────┘     └─────────────────┘                         │
│            │                                                            │
│            ▼                                                            │
│   ┌─────────────────┐                                                  │
│   │  Risk Manager   │ ◄── Position Sizing                              │
│   │                 │     Circuit Breakers                              │
│   │                 │     Exposure Limits                               │
│   └────────┬────────┘                                                  │
│            │                                                            │
│            ▼                                                            │
│   ┌─────────────────┐     ┌─────────────────┐                         │
│   │ Trade Executor  │ ───►│ Alpaca Broker   │                         │
│   │                 │     │                 │                         │
│   │ • TWAP/VWAP    │     │ • Paper/Live    │                         │
│   │ • Slippage     │     │ • Order Mgmt    │                         │
│   └────────┬────────┘     └─────────────────┘                         │
│            │                                                            │
│            ▼                                                            │
│   ┌─────────────────┐                                                  │
│   │ Agent Watchdog  │ ◄── Process Monitoring                           │
│   │                 │     Auto-Restart                                  │
│   │                 │     Health Checks                                 │
│   └─────────────────┘                                                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Python Agents

### 1. Chat Agent

**File:** `chat_agent.py`

**Purpose:** Natural language interface that interprets user queries and routes them to appropriate handlers.

**Key Classes:**
```python
class ChatAgent:
    def process_message(self, message: str) -> Dict[str, Any]
    def analyze_intent(self, message: str) -> Tuple[str, Dict]
    def extract_symbols(self, message: str) -> List[str]
    def generate_response(self, intent: str, entities: Dict, message: str) -> Dict
```

**Supported Intents:**
| Intent | Trigger Words | Example |
|--------|---------------|---------|
| `price_check` | price, cost, quote, trading at | "What's AAPL trading at?" |
| `analysis` | analyze, research, tell me about | "Analyze NVDA" |
| `watchlist` | watchlist, watch, monitor | "Add TSLA to watchlist" |
| `portfolio` | portfolio, holdings, positions | "Show my portfolio" |
| `trade` | buy, sell, trade | "Buy 10 shares of MSFT" |
| `market_status` | market, open, closed | "Is the market open?" |
| `news` | news, headlines | "Show news for AAPL" |

**Example Usage:**
```python
agent = ChatAgent()
response = agent.process_message("What's the price of AAPL?")
# Returns: {"text": "AAPL is trading at $185.42", "intent": "price_check", ...}
```

---

### 2. Analysis Engine

**File:** `analysis_engine.py`

**Purpose:** Perform technical and fundamental analysis on securities.

**Technical Analysis:**
```python
class TechnicalAnalyzer:
    def calculate_sma(self, prices: List[float], period: int) -> float
    def calculate_ema(self, prices: List[float], period: int) -> float
    def calculate_rsi(self, prices: List[float], period: int = 14) -> float
    def calculate_macd(self, prices: List[float]) -> Dict[str, float]
    def calculate_bollinger_bands(self, prices: List[float]) -> Dict[str, float]
```

**Fundamental Analysis:**
```python
class FundamentalAnalyzer:
    def analyze_valuation(self, symbol: str) -> Dict
    def analyze_growth(self, symbol: str) -> Dict
    def analyze_profitability(self, symbol: str) -> Dict
    def calculate_intrinsic_value(self, symbol: str) -> float
```

**Signal Generation:**
```python
# Example signal output
{
    "symbol": "AAPL",
    "signal": "BUY",
    "confidence": 0.75,
    "reasons": [
        "RSI oversold (28)",
        "Price above 200 SMA",
        "MACD bullish crossover"
    ]
}
```

---

### 3. Risk Manager

**File:** `risk_manager.py`

**Purpose:** Assess trade risk and enforce position limits.

**Core Classes:**
```python
@dataclass
class TradeProposal:
    symbol: str
    action: str          # 'BUY' or 'SELL'
    quantity: int
    price: float
    stop_loss: float
    profit_target: float
    conviction: float    # 0-1 scale
    rationale: str

@dataclass
class RiskAssessment:
    approved: bool
    reason: str
    risk_score: float
    position_size_adjustment: float
    max_loss_per_trade: float

class RiskManager:
    def assess_trade(self, proposal: TradeProposal, ...) -> RiskAssessment
```

**Risk Checks:**

| Check | Threshold | Behavior |
|-------|-----------|----------|
| Conviction | > 10% | Reject if too low |
| Position Size | < 5% of portfolio | Reject if too large |
| Sector Exposure | < 20% of portfolio | Reject if overexposed |
| Daily Loss | > -3% | Halt all trading |
| Portfolio Loss | > -10% | Emergency stop |

**Example:**
```python
risk_manager = RiskManager(config)

proposal = TradeProposal(
    symbol="AAPL",
    action="BUY",
    quantity=10,
    price=185.00,
    stop_loss=180.00,
    profit_target=195.00,
    conviction=0.75,
    rationale="Strong technical setup"
)

assessment = risk_manager.assess_trade(proposal, portfolio_value, positions)

if assessment.approved:
    # Proceed with trade
else:
    print(f"Rejected: {assessment.reason}")
```

---

### 4. Trade Executor

**File:** `trade_executor.py`

**Purpose:** Execute approved trades through the broker API.

**Order Types:**
```python
class OrderType(Enum):
    LIMIT = "LIMIT"
    MARKET = "MARKET"
    TWAP = "TWAP"    # Time-Weighted Average Price
    VWAP = "VWAP"    # Volume-Weighted Average Price
```

**Execution Flow:**
```python
class TradeExecutor:
    async def execute_trade(self, proposal: TradeProposal) -> ExecutionReport

    def _determine_order_type(self, proposal: TradeProposal) -> OrderType
    def _is_market_open(self) -> bool
    def _calculate_slippage(self, expected: float, actual: float) -> float
```

**TWAP Execution:**
```python
# Splits large orders across time intervals
async def execute_twap(self, symbol: str, quantity: int, duration_minutes: int):
    intervals = 10
    quantity_per_interval = quantity // intervals

    for i in range(intervals):
        await self.submit_order(symbol, quantity_per_interval)
        await asyncio.sleep(duration_minutes * 60 / intervals)
```

---

### 5. Agent Watchdog

**File:** `agent_watchdog.py`

**Purpose:** Monitor agent processes and automatically restart on failure.

**Features:**
- Process health monitoring
- Automatic restart on crash
- Market hours awareness
- Error pattern detection
- Heartbeat tracking

**Key Classes:**
```python
class AgentProcess:
    def is_alive(self) -> bool
    def update_heartbeat(self)
    def time_since_heartbeat(self) -> timedelta
    def is_market_hours(self) -> bool

class AgentWatchdog:
    def start_agent(self, agent_id: str) -> bool
    def stop_agent(self, agent_id: str) -> bool
    def restart_agent(self, agent_id: str) -> bool
    def health_check(self) -> Dict[str, Any]
```

**Restart Policy:**
```python
# Exponential backoff for restarts
restart_delays = [5, 15, 30, 60, 120]  # seconds

# Max consecutive failures before giving up
max_consecutive_failures = 5
```

---

### 6. YCharts Market Agent

**File:** `ycharts_market_agent.py`

**Purpose:** Interface with YCharts API for professional financial analytics.

**Capabilities:**
- Advanced financial ratios
- Industry comparisons
- Macro economic indicators
- Historical data analysis

```python
class YChartsMarketAgent:
    def __init__(self):
        self.api_key = os.environ.get('YCHARTS_API_KEY', '')

    async def get_financial_ratios(self, symbol: str) -> Dict
    async def get_industry_comparison(self, symbol: str) -> Dict
    async def get_macro_indicators(self) -> Dict
```

---

### 7. Portfolio Manager

**File:** `portfolio_manager.py`

**Purpose:** Track portfolio performance and manage allocations.

**Features:**
- Real-time P&L tracking
- Position management
- Rebalancing recommendations
- Performance attribution

```python
class PortfolioManager:
    def get_positions(self) -> List[Position]
    def calculate_exposure(self, by: str = "sector") -> Dict[str, float]
    def suggest_rebalancing(self) -> List[Recommendation]
    def calculate_metrics(self) -> PortfolioMetrics
```

---

### 8. Compliance Agent

**File:** `compliance.py`

**Purpose:** Ensure regulatory compliance and maintain audit trails.

**Features:**
- Trade logging
- Regulatory checks
- ESG screening (optional)
- Audit trail generation

```python
class ComplianceChecker:
    def check_trade(self, trade: Trade) -> ComplianceResult
    def log_trade(self, trade: Trade, result: ComplianceResult)
    def generate_audit_report(self, start: datetime, end: datetime) -> Report
```

---

## TypeScript Agents

Located in `trading-agent/src/cli/`:

### Portfolio Agent (`portfolioAgent.ts`)

**Purpose:** Manage portfolio operations from CLI.

```typescript
// Run with: npx ts-node src/cli/portfolioAgent.ts

async function main() {
    const agent = new PortfolioAgent();
    await agent.showPositions();
    await agent.showPerformance();
}
```

### Options Agent (`simpleOptionsAgent.ts`)

**Purpose:** Options trading strategies.

```typescript
// Supports:
// - Covered calls
// - Cash-secured puts
// - Spreads
```

### Agent Coordinator (`agentCoordinator.ts`)

**Purpose:** Orchestrate multiple agents.

```typescript
class AgentCoordinator {
    async runTradingCycle(): Promise<void>
    async executeStrategy(strategy: Strategy): Promise<void>
    async handleSignal(signal: TradingSignal): Promise<void>
}
```

---

## Agent Communication

Agents communicate through:

### 1. Direct Method Calls

```python
# Synchronous
result = analysis_engine.analyze(symbol)
assessment = risk_manager.assess_trade(proposal)
```

### 2. Event System

```python
# Publish
event_bus.publish("trade_executed", trade_data)

# Subscribe
@event_bus.subscribe("trade_executed")
def on_trade_executed(data):
    compliance.log_trade(data)
```

### 3. WebSocket (Real-time)

```python
# Emit to clients
socketio.emit("price_update", {"symbol": "AAPL", "price": 185.42})
```

---

## Adding New Agents

### Step 1: Create Agent Class

```python
# my_agent.py
class MyAgent:
    def __init__(self, config):
        self.config = config
        self.logger = logging.getLogger(__name__)

    async def process(self, input_data: Dict) -> Dict:
        # Agent logic here
        return result
```

### Step 2: Register in Web App

```python
# web_app.py
from my_agent import MyAgent

my_agent = MyAgent(config)

@app.route('/api/my-agent', methods=['POST'])
def my_agent_endpoint():
    result = my_agent.process(request.json)
    return jsonify(result)
```

### Step 3: Add to Watchdog (Optional)

```python
# agent_watchdog.py
AGENTS = {
    'my_agent': {
        'module': 'my_agent',
        'class': 'MyAgent',
        'restart_on_failure': True
    }
}
```

---

## Best Practices

### 1. Single Responsibility

Each agent should have one clear purpose. Don't create "god agents" that do everything.

### 2. Error Handling

```python
class MyAgent:
    async def process(self, data):
        try:
            result = await self._do_work(data)
            return {"success": True, "data": result}
        except Exception as e:
            self.logger.error(f"Agent error: {e}")
            return {"success": False, "error": str(e)}
```

### 3. Configuration

```python
class MyAgent:
    def __init__(self, config):
        self.threshold = config.get('threshold', 0.5)
        self.enabled = config.get('enabled', True)
```

### 4. Logging

```python
self.logger.info("Processing request", extra={
    "symbol": symbol,
    "action": action
})
```

### 5. Testing

```python
# test_my_agent.py
def test_agent_process():
    agent = MyAgent(config)
    result = agent.process({"symbol": "AAPL"})
    assert result["success"] == True
```
