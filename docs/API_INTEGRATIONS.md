# API Integrations Guide

This document details all supported market data providers, their configuration, rate limits, and usage patterns.

---

## Provider Overview

Trading Buddy integrates with 10+ market data providers, organized by data domain:

| Domain | Primary | Secondary | Tertiary | Fallback |
|--------|---------|-----------|----------|----------|
| **Real-Time Prices** | Polygon WS | Tiingo IEX | Finnhub | Yahoo Finance |
| **Fundamentals** | YCharts | FMP | Alpha Vantage | Yahoo Finance |
| **News** | Benzinga | Tiingo News | NewsAPI | - |
| **Sentiment** | Tiingo NLP | StockTwits | - | - |
| **Corporate Actions** | Polygon | FMP | - | - |
| **Macro/Yields** | YCharts | FRED | - | - |

---

## Required APIs

### 1. Alpaca (Trading)

**Purpose:** Order execution (paper and live trading)

**Free Tier:** Yes (paper trading)

**Sign Up:** [alpaca.markets](https://alpaca.markets)

**Environment Variables:**
```bash
APCA_API_KEY_ID=your_key_id
APCA_API_SECRET_KEY=your_secret_key
APCA_API_BASE_URL=https://paper-api.alpaca.markets  # Paper trading
# APCA_API_BASE_URL=https://api.alpaca.markets     # Live trading
```

**Capabilities:**
- Paper trading (unlimited)
- Live trading (commission-free)
- Market data (limited free tier)
- Account management
- Order management
- Position tracking

---

### 2. Polygon.io (Market Data)

**Purpose:** Real-time prices, market status, corporate actions

**Free Tier:** Limited (delayed data, market status)

**Sign Up:** [polygon.io](https://polygon.io)

**Environment Variables:**
```bash
POLYGON_API_KEY=your_polygon_key
```

**Rate Limits:**
| Tier | Requests/Min | WebSocket |
|------|--------------|-----------|
| Free | 5 | No |
| Starter | 300 | Yes |
| Developer | 1000 | Yes |

**Endpoints Used:**
```
GET /v1/marketstatus/now         # Market status
GET /v2/aggs/ticker/{symbol}     # Price bars
GET /v3/reference/tickers        # Ticker details
WS  wss://socket.polygon.io      # Real-time streaming
```

**Usage Example:**
```python
# In provider_router.py
async def _fetch_polygon_price(self, symbol: str):
    url = f"https://api.polygon.io/v2/last/trade/{symbol}"
    params = {"apiKey": os.environ.get('POLYGON_API_KEY')}
    async with session.get(url, params=params) as response:
        return await response.json()
```

---

### 3. Finnhub (Quotes & Fundamentals)

**Purpose:** Real-time quotes, company profiles, basic fundamentals

**Free Tier:** Yes (60 calls/minute)

**Sign Up:** [finnhub.io](https://finnhub.io)

**Environment Variables:**
```bash
FINNHUB_API_KEY=your_finnhub_key
```

**Rate Limits:**
| Tier | Calls/Min |
|------|-----------|
| Free | 60 |
| Paid | 300-600 |

**Endpoints Used:**
```
GET /api/v1/quote?symbol={symbol}           # Real-time quote
GET /api/v1/stock/profile2?symbol={symbol}  # Company profile
GET /api/v1/company-news?symbol={symbol}    # Company news
GET /api/v1/stock/metric?symbol={symbol}    # Basic fundamentals
```

---

## Recommended APIs

### 4. Alpha Vantage (Backup Data)

**Purpose:** Historical prices, technical indicators, fundamentals

**Free Tier:** Yes (25 calls/day)

**Sign Up:** [alphavantage.co](https://www.alphavantage.co/support/#api-key)

**Environment Variables:**
```bash
ALPHA_VANTAGE_API_KEY=your_av_key
```

**Rate Limits:**
| Tier | Calls/Min | Calls/Day |
|------|-----------|-----------|
| Free | 5 | 25 |
| Premium | 75 | Unlimited |

**Endpoints Used:**
```
GET /query?function=GLOBAL_QUOTE&symbol={symbol}
GET /query?function=TIME_SERIES_DAILY&symbol={symbol}
GET /query?function=OVERVIEW&symbol={symbol}
```

---

### 5. Tiingo (IEX Data & News)

**Purpose:** IEX real-time data, news, fundamentals

**Free Tier:** Yes (limited)

**Sign Up:** [tiingo.com](https://www.tiingo.com)

**Environment Variables:**
```bash
TIINGO_API_TOKEN=your_tiingo_token
```

**Capabilities:**
- IEX real-time prices
- Historical end-of-day
- News with sentiment
- Fundamentals

**Endpoints Used:**
```
GET /iex/?tickers={symbol}                    # IEX prices
GET /tiingo/news?tickers={symbol}             # News
WS  wss://api.tiingo.com/iex                  # WebSocket
```

---

### 6. NewsAPI (News Articles)

**Purpose:** News aggregation, headlines

**Free Tier:** Yes (100 calls/day)

**Sign Up:** [newsapi.org](https://newsapi.org)

**Environment Variables:**
```bash
NEWSAPI_KEY=your_newsapi_key
```

**Rate Limits:**
| Tier | Calls/Day |
|------|-----------|
| Developer (Free) | 100 |
| Business | 1000 |

---

## Professional APIs

### 7. YCharts (Professional Analytics)

**Purpose:** Advanced financial analytics, ratios, industry comparisons

**Free Tier:** No (professional subscription required)

**Contact:** [ycharts.com](https://ycharts.com)

**Environment Variables:**
```bash
YCHARTS_API_KEY=your_ycharts_key
```

**Capabilities:**
- Cleaned fundamental data
- Financial ratios
- Industry comparisons
- Macro indicators
- Historical timeseries

---

### 8. RapidAPI Services

Single API key for multiple services:

**Environment Variables:**
```bash
RAPIDAPI_KEY=your_rapidapi_key
```

#### Twelve Data (via RapidAPI)

**Purpose:** Price quotes, technical indicators

```
Host: twelve-data1.p.rapidapi.com
GET /price?symbol={symbol}
GET /time_series?symbol={symbol}
```

#### Financial Modeling Prep (via RapidAPI)

**Purpose:** Fundamentals, financial statements

```
Host: financialmodelingprep.p.rapidapi.com
GET /api/v3/quote/{symbol}
GET /api/v3/profile/{symbol}
```

#### StockTwits (via RapidAPI)

**Purpose:** Social sentiment, retail trader activity

```
Host: stocktwits-sentiment.p.rapidapi.com
GET /sentiment?symbol={symbol}
```

---

### 9. Benzinga (Professional News)

**Purpose:** Low-latency news for trading

**Free Tier:** No

**Contact:** [benzinga.com](https://www.benzinga.com)

**Environment Variables:**
```bash
BENZINGA_API_KEY=your_benzinga_key
```

---

## Configuration

### Provider Configuration (`data_providers.yaml`)

```yaml
data_providers:
  prices:
    primary: polygon_ws
    secondary: tiingo_iex
    tertiary: finnhub_rest
    fallback: yahoo_finance

    validation:
      max_price_discrepancy_pct: 0.3
      freshness_ms:
        quotes: 2000
        bars_1m: 60000

  fundamentals:
    primary: ycharts
    secondary: fmp_rapidapi
    tertiary: alpha_vantage
    fallback: yahoo_finance

    validation:
      staleness_days: 90
      cross_check_key_ratios: true

credentials:
  polygon_key: "${POLYGON_API_KEY}"
  finnhub_key: "${FINNHUB_API_KEY}"
  tiingo_token: "${TIINGO_API_TOKEN}"
  alpha_vantage_key: "${ALPHA_VANTAGE_API_KEY}"
  ycharts_key: "${YCHARTS_API_KEY}"
  rapidapi_key: "${RAPIDAPI_KEY}"
  newsapi_key: "${NEWSAPI_KEY}"
  benzinga_key: "${BENZINGA_API_KEY}"

rate_limits:
  polygon_rest:
    rpm: 300
    burst: 10

  finnhub_rest:
    rpm: 60
    burst: 5

  alpha_vantage:
    rpm: 5
    daily_limit: 25
```

---

## Rate Limiting

The Provider Router implements per-provider rate limiting:

```python
class RateLimiter:
    """Leaky bucket rate limiter"""

    def __init__(self, rpm: int, burst: int = 5):
        self.rpm = rpm           # Requests per minute
        self.burst = burst       # Max burst requests
        self.tokens = burst
        self.last_update = time.time()

    async def acquire(self) -> bool:
        """Returns True if request is allowed"""
        # Refill tokens based on time elapsed
        now = time.time()
        tokens_to_add = (now - self.last_update) * (self.rpm / 60.0)
        self.tokens = min(self.burst, self.tokens + tokens_to_add)
        self.last_update = now

        if self.tokens >= 1:
            self.tokens -= 1
            return True
        return False
```

---

## Circuit Breakers

Automatic failover when providers fail:

```python
class CircuitBreaker:
    """Disable failing providers automatically"""

    def __init__(self, failure_threshold: int = 3, reset_timeout: int = 60):
        self.failure_threshold = failure_threshold
        self.reset_timeout = reset_timeout
        self.failures = 0
        self.state = "CLOSED"  # CLOSED, OPEN, HALF_OPEN
        self.last_failure = None

    def record_failure(self):
        self.failures += 1
        self.last_failure = time.time()

        if self.failures >= self.failure_threshold:
            self.state = "OPEN"

    def is_available(self) -> bool:
        if self.state == "CLOSED":
            return True

        if self.state == "OPEN":
            # Check if reset timeout has passed
            if time.time() - self.last_failure > self.reset_timeout:
                self.state = "HALF_OPEN"
                return True
            return False

        return True  # HALF_OPEN allows one request
```

---

## Data Validation

Multi-source validation ensures data accuracy:

```python
class DataValidator:
    """Cross-validate data from multiple sources"""

    def validate_price(self, prices: Dict[str, float]) -> ValidationResult:
        """Ensure prices from different sources agree"""
        values = list(prices.values())

        if len(values) < 2:
            return ValidationResult(passed=True, confidence=0.5)

        # Calculate deviation
        mean = statistics.mean(values)
        max_deviation = max(abs(v - mean) / mean for v in values)

        if max_deviation > 0.005:  # 0.5% threshold
            return ValidationResult(
                passed=False,
                confidence=1 - max_deviation,
                discrepancies=[f"Price deviation: {max_deviation:.2%}"]
            )

        return ValidationResult(passed=True, confidence=1.0)
```

---

## Adding New Providers

### Step 1: Add Configuration

```yaml
# data_providers.yaml
credentials:
  new_provider_key: "${NEW_PROVIDER_API_KEY}"

rate_limits:
  new_provider:
    rpm: 100
    burst: 10
```

### Step 2: Implement Client

```python
# In provider_router.py or separate file

class NewProviderClient:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.newprovider.com"

    async def get_quote(self, symbol: str) -> Dict:
        async with aiohttp.ClientSession() as session:
            url = f"{self.base_url}/quote/{symbol}"
            headers = {"Authorization": f"Bearer {self.api_key}"}

            async with session.get(url, headers=headers) as response:
                return await response.json()
```

### Step 3: Register in Router

```python
# In provider_router.py

self.providers["new_provider"] = NewProviderClient(
    os.environ.get('NEW_PROVIDER_API_KEY')
)
```

---

## Environment Variables Summary

```bash
# Required
SECRET_KEY=your_secret_key
APCA_API_KEY_ID=your_alpaca_key
APCA_API_SECRET_KEY=your_alpaca_secret

# Market Data (at least one)
POLYGON_API_KEY=your_polygon_key
FINNHUB_API_KEY=your_finnhub_key
ALPHA_VANTAGE_API_KEY=your_av_key

# Optional but Recommended
TIINGO_API_TOKEN=your_tiingo_token
NEWSAPI_KEY=your_newsapi_key
RAPIDAPI_KEY=your_rapidapi_key

# Professional (Optional)
YCHARTS_API_KEY=your_ycharts_key
BENZINGA_API_KEY=your_benzinga_key
```

---

## Troubleshooting

### API Returns 401 Unauthorized

- Verify API key is set in environment
- Check key hasn't expired
- Ensure key has correct permissions

### Rate Limit Exceeded (429)

- Check rate limit configuration
- Reduce request frequency
- Upgrade to higher tier

### Data Discrepancy Detected

- This is normal - different providers have slightly different data
- System will use consensus value
- Check logs for details

### Provider Timeout

- Circuit breaker will activate after 3 failures
- System will failover to secondary provider
- Provider will be retried after 60 seconds
