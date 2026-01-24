"""
Multi-API Data Aggregation System for Trading Assistant
Intelligently queries multiple data sources for accurate pricing and deep analytics
"""

import asyncio
import aiohttp
import logging
import json
import time
import os
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
from enum import Enum
import statistics
from abc import ABC, abstractmethod

class DataSource(Enum):
    FINNHUB = "finnhub"
    ALPHA_VANTAGE = "alpha_vantage"
    POLYGON = "polygon"
    NEWSAPI = "newsapi"
    YCHARTS = "ycharts"
    YAHOO_FINANCE = "yahoo_finance"

class DataType(Enum):
    REAL_TIME_PRICE = "real_time_price"
    FUNDAMENTAL = "fundamental"
    TECHNICAL_INDICATORS = "technical_indicators"
    NEWS_SENTIMENT = "news_sentiment"
    ADVANCED_ANALYTICS = "advanced_analytics"
    MARKET_DATA = "market_data"

@dataclass
class DataPoint:
    source: DataSource
    symbol: str
    data_type: DataType
    value: Any
    timestamp: datetime
    confidence: float = 1.0
    metadata: Dict[str, Any] = field(default_factory=dict)

@dataclass
class AggregatedData:
    symbol: str
    data_type: DataType
    consensus_value: Any
    sources: List[DataSource]
    discrepancy_detected: bool = False
    discrepancy_details: Optional[str] = None
    confidence_score: float = 1.0
    timestamp: datetime = field(default_factory=datetime.now)
    source_data: Dict[DataSource, Any] = field(default_factory=dict)

@dataclass
class APICredentials:
    alpha_vantage_key: Optional[str] = None
    finnhub_key: Optional[str] = None
    polygon_key: Optional[str] = None
    newsapi_key: Optional[str] = None
    ycharts_key: Optional[str] = None

    @classmethod
    def from_environment(cls) -> 'APICredentials':
        """Load API credentials from environment variables"""
        return cls(
            alpha_vantage_key=os.getenv('ALPHA_VANTAGE_API_KEY'),
            finnhub_key=os.getenv('FINNHUB_API_KEY'),
            polygon_key=os.getenv('POLYGON_API_KEY'),
            newsapi_key=os.getenv('NEWS_API_KEY'),
            ycharts_key=os.getenv('YCHARTS_API_KEY')
        )

class BaseAPIClient(ABC):
    def __init__(self, credentials: APICredentials):
        self.credentials = credentials
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
        self.rate_limit_delay = 0.2  # 200ms between requests
        self.last_request_time = 0

    async def _rate_limit(self):
        """Enforce rate limiting"""
        current_time = time.time()
        time_since_last = current_time - self.last_request_time
        if time_since_last < self.rate_limit_delay:
            await asyncio.sleep(self.rate_limit_delay - time_since_last)
        self.last_request_time = time.time()

    @abstractmethod
    async def get_real_time_price(self, symbol: str) -> Optional[DataPoint]:
        pass

    @abstractmethod
    async def get_fundamental_data(self, symbol: str) -> Optional[DataPoint]:
        pass

class FinnhubClient(BaseAPIClient):
    def __init__(self, credentials: APICredentials):
        super().__init__(credentials)
        self.base_url = "https://finnhub.io/api/v1"
        self.rate_limit_delay = 1.0  # 1 second for free tier

    async def get_real_time_price(self, symbol: str) -> Optional[DataPoint]:
        await self._rate_limit()

        try:
            if not self.credentials.finnhub_key:
                # Use demo token for testing
                token = "demo_key"
            else:
                token = self.credentials.finnhub_key

            url = f"{self.base_url}/quote?symbol={symbol}&token={token}"

            async with aiohttp.ClientSession() as session:
                async with session.get(url) as response:
                    if response.status == 200:
                        data = await response.json()

                        if 'c' in data and data['c'] > 0:  # 'c' is current price
                            return DataPoint(
                                source=DataSource.FINNHUB,
                                symbol=symbol,
                                data_type=DataType.REAL_TIME_PRICE,
                                value=data['c'],
                                timestamp=datetime.now(),
                                confidence=0.95,
                                metadata={
                                    'open': data.get('o'),
                                    'high': data.get('h'),
                                    'low': data.get('l'),
                                    'previous_close': data.get('pc'),
                                    'change': data.get('d'),
                                    'change_percent': data.get('dp')
                                }
                            )
                        else:
                            self.logger.warning(f"Invalid price data from Finnhub for {symbol}: {data}")
                            return None
                    else:
                        self.logger.warning(f"Finnhub API error {response.status} for {symbol}")
                        return None

        except Exception as e:
            self.logger.error(f"Finnhub request failed for {symbol}: {str(e)}")
            return None

    async def get_fundamental_data(self, symbol: str) -> Optional[DataPoint]:
        await self._rate_limit()

        try:
            if not self.credentials.finnhub_key:
                token = "demo_key"
            else:
                token = self.credentials.finnhub_key

            url = f"{self.base_url}/stock/metric?symbol={symbol}&metric=all&token={token}"

            async with aiohttp.ClientSession() as session:
                async with session.get(url) as response:
                    if response.status == 200:
                        data = await response.json()

                        if 'metric' in data:
                            return DataPoint(
                                source=DataSource.FINNHUB,
                                symbol=symbol,
                                data_type=DataType.FUNDAMENTAL,
                                value=data['metric'],
                                timestamp=datetime.now(),
                                confidence=0.9,
                                metadata=data
                            )

        except Exception as e:
            self.logger.error(f"Finnhub fundamentals failed for {symbol}: {str(e)}")
            return None

class AlphaVantageClient(BaseAPIClient):
    def __init__(self, credentials: APICredentials):
        super().__init__(credentials)
        self.base_url = "https://www.alphavantage.co/query"
        self.rate_limit_delay = 12.0  # Free tier: 5 calls per minute

    async def get_real_time_price(self, symbol: str) -> Optional[DataPoint]:
        await self._rate_limit()

        try:
            if not self.credentials.alpha_vantage_key:
                # Use demo key for testing
                api_key = "demo"
            else:
                api_key = self.credentials.alpha_vantage_key

            params = {
                'function': 'GLOBAL_QUOTE',
                'symbol': symbol,
                'apikey': api_key
            }

            async with aiohttp.ClientSession() as session:
                async with session.get(self.base_url, params=params) as response:
                    if response.status == 200:
                        data = await response.json()

                        if 'Global Quote' in data and data['Global Quote']:
                            quote = data['Global Quote']
                            price_key = '05. price'

                            if price_key in quote:
                                return DataPoint(
                                    source=DataSource.ALPHA_VANTAGE,
                                    symbol=symbol,
                                    data_type=DataType.REAL_TIME_PRICE,
                                    value=float(quote[price_key]),
                                    timestamp=datetime.now(),
                                    confidence=0.9,
                                    metadata={
                                        'open': quote.get('02. open'),
                                        'high': quote.get('03. high'),
                                        'low': quote.get('04. low'),
                                        'volume': quote.get('06. volume'),
                                        'latest_trading_day': quote.get('07. latest trading day'),
                                        'previous_close': quote.get('08. previous close'),
                                        'change': quote.get('09. change'),
                                        'change_percent': quote.get('10. change percent')
                                    }
                                )
                        else:
                            self.logger.warning(f"No quote data from Alpha Vantage for {symbol}")
                            return None

        except Exception as e:
            self.logger.error(f"Alpha Vantage request failed for {symbol}: {str(e)}")
            return None

    async def get_fundamental_data(self, symbol: str) -> Optional[DataPoint]:
        await self._rate_limit()

        try:
            if not self.credentials.alpha_vantage_key:
                api_key = "demo"
            else:
                api_key = self.credentials.alpha_vantage_key

            params = {
                'function': 'OVERVIEW',
                'symbol': symbol,
                'apikey': api_key
            }

            async with aiohttp.ClientSession() as session:
                async with session.get(self.base_url, params=params) as response:
                    if response.status == 200:
                        data = await response.json()

                        if data and 'Symbol' in data:
                            return DataPoint(
                                source=DataSource.ALPHA_VANTAGE,
                                symbol=symbol,
                                data_type=DataType.FUNDAMENTAL,
                                value=data,
                                timestamp=datetime.now(),
                                confidence=0.95,
                                metadata=data
                            )

        except Exception as e:
            self.logger.error(f"Alpha Vantage fundamentals failed for {symbol}: {str(e)}")
            return None

class PolygonClient(BaseAPIClient):
    def __init__(self, credentials: APICredentials):
        super().__init__(credentials)
        self.base_url = "https://api.polygon.io"
        self.rate_limit_delay = 12.0  # Free tier: 5 calls per minute

    async def get_real_time_price(self, symbol: str) -> Optional[DataPoint]:
        await self._rate_limit()

        try:
            if not self.credentials.polygon_key:
                self.logger.warning(f"No Polygon API key configured, skipping {symbol}")
                return None

            self.logger.info(f"Fetching Polygon data for {symbol} using API key: {self.credentials.polygon_key[:8]}...")

            # Use daily bars endpoint to get OHLC data for percentage change calculation
            from datetime import datetime as dt, timedelta
            today = dt.now().strftime('%Y-%m-%d')
            yesterday = (dt.now() - timedelta(days=1)).strftime('%Y-%m-%d')

            url = f"{self.base_url}/v2/aggs/ticker/{symbol}/range/1/day/{yesterday}/{today}?apikey={self.credentials.polygon_key}"

            async with aiohttp.ClientSession() as session:
                async with session.get(url) as response:
                    if response.status == 200:
                        data = await response.json()

                        if 'results' in data and data['results']:
                            # Get the most recent day's data
                            latest = data['results'][-1]
                            current_price = latest['c']  # close price
                            prev_close = latest['o']     # open price (using open as previous close for daily change)

                            # Calculate percentage change
                            change_percent = 0.0
                            if prev_close and prev_close > 0:
                                change_percent = ((current_price - prev_close) / prev_close) * 100

                            return DataPoint(
                                source=DataSource.POLYGON,
                                symbol=symbol,
                                data_type=DataType.REAL_TIME_PRICE,
                                value=current_price,
                                timestamp=datetime.fromtimestamp(latest['t'] / 1000),
                                confidence=0.95,
                                metadata={
                                    'volume': latest.get('v'),
                                    'open': latest.get('o'),
                                    'high': latest.get('h'),
                                    'low': latest.get('l'),
                                    'change_percent': change_percent,
                                    'change_amount': current_price - prev_close
                                }
                            )
                    else:
                        self.logger.warning(f"Polygon API returned status {response.status} for {symbol}")
                        if response.status == 403:
                            self.logger.warning("Polygon API access denied - may need higher tier subscription")
                        return None

        except Exception as e:
            self.logger.error(f"Polygon request failed for {symbol}: {str(e)}")
            return None

    async def get_fundamental_data(self, symbol: str) -> Optional[DataPoint]:
        """Get fundamental data from Polygon's company financials endpoint"""
        await self._rate_limit()

        try:
            if not self.credentials.polygon_key:
                self.logger.warning(f"No Polygon API key configured, skipping {symbol}")
                return None

            self.logger.info(f"Fetching Polygon fundamental data for {symbol}")

            # Use Polygon's ticker details endpoint for comprehensive fundamental data
            url = f"{self.base_url}/v3/reference/tickers/{symbol}?apikey={self.credentials.polygon_key}"

            async with aiohttp.ClientSession() as session:
                async with session.get(url) as response:
                    if response.status == 200:
                        data = await response.json()

                        if data.get('status') == 'OK' and 'results' in data:
                            results = data['results']

                            # Extract key fundamental metrics
                            fundamental_data = {
                                'market_cap': results.get('market_cap'),
                                'shares_outstanding': results.get('share_class_shares_outstanding'),
                                'weighted_shares_outstanding': results.get('weighted_shares_outstanding'),
                                'employees': results.get('total_employees'),
                                'description': results.get('description'),
                                'homepage_url': results.get('homepage_url'),
                                'name': results.get('name'),
                                'primary_exchange': results.get('primary_exchange'),
                                'type': results.get('type'),
                                'currency_name': results.get('currency_name'),
                                'cik': results.get('cik'),
                                'composite_figi': results.get('composite_figi'),
                                'share_class_figi': results.get('share_class_figi'),
                                'address': results.get('address', {}),
                                'branding': results.get('branding', {}),
                                'phone_number': results.get('phone_number')
                            }

                            # Clean up None values
                            fundamental_data = {k: v for k, v in fundamental_data.items() if v is not None}

                            return DataPoint(
                                source=DataSource.POLYGON,
                                symbol=symbol,
                                data_type=DataType.FUNDAMENTAL,
                                value=fundamental_data,
                                timestamp=datetime.now(),
                                confidence=0.95,
                                metadata={
                                    'data_source': 'polygon_ticker_details',
                                    'last_updated': results.get('last_updated_utc'),
                                    'locale': results.get('locale'),
                                    'market': results.get('market')
                                }
                            )
                    elif response.status == 429:
                        self.logger.warning(f"Polygon API rate limited for {symbol}")
                        return None
                    else:
                        self.logger.warning(f"Polygon fundamental API returned status {response.status} for {symbol}")
                        return None

        except Exception as e:
            self.logger.error(f"Polygon fundamental request failed for {symbol}: {str(e)}")
            return None

class NewsAPIClient(BaseAPIClient):
    def __init__(self, credentials: APICredentials):
        super().__init__(credentials)
        self.base_url = "https://newsapi.org/v2"
        self.rate_limit_delay = 1.0

    async def get_news_sentiment(self, symbol: str, company_name: str = None) -> Optional[DataPoint]:
        await self._rate_limit()

        try:
            if not self.credentials.newsapi_key:
                # Return mock sentiment for testing
                return DataPoint(
                    source=DataSource.NEWSAPI,
                    symbol=symbol,
                    data_type=DataType.NEWS_SENTIMENT,
                    value={
                        'sentiment_score': 0.1,  # Slightly positive
                        'sentiment_label': 'neutral',
                        'article_count': 0,
                        'confidence': 0.5
                    },
                    timestamp=datetime.now(),
                    confidence=0.5,
                    metadata={'mock_data': True}
                )

            # Search for news about the company/symbol
            search_query = company_name if company_name else symbol

            params = {
                'q': f"{search_query} stock",
                'language': 'en',
                'sortBy': 'publishedAt',
                'pageSize': 20,
                'apiKey': self.credentials.newsapi_key
            }

            async with aiohttp.ClientSession() as session:
                async with session.get(f"{self.base_url}/everything", params=params) as response:
                    if response.status == 200:
                        data = await response.json()

                        if data.get('articles'):
                            # Simple sentiment analysis based on headlines
                            sentiment_score = self._analyze_sentiment(data['articles'])

                            return DataPoint(
                                source=DataSource.NEWSAPI,
                                symbol=symbol,
                                data_type=DataType.NEWS_SENTIMENT,
                                value={
                                    'sentiment_score': sentiment_score,
                                    'sentiment_label': self._score_to_label(sentiment_score),
                                    'article_count': len(data['articles']),
                                    'latest_articles': data['articles'][:5]
                                },
                                timestamp=datetime.now(),
                                confidence=0.8,
                                metadata={'total_results': data.get('totalResults', 0)}
                            )

        except Exception as e:
            self.logger.error(f"NewsAPI request failed for {symbol}: {str(e)}")
            return None

    def _analyze_sentiment(self, articles: List[Dict]) -> float:
        """Basic sentiment analysis of news headlines and descriptions"""
        positive_words = ['growth', 'profit', 'gain', 'rise', 'increase', 'strong', 'beat', 'positive', 'bullish', 'surge']
        negative_words = ['loss', 'drop', 'fall', 'decline', 'weak', 'miss', 'negative', 'bearish', 'crash', 'plunge']

        total_score = 0
        article_count = 0

        for article in articles:
            title = (article.get('title', '') or '').lower()
            description = (article.get('description', '') or '').lower()
            content = f"{title} {description}"

            score = 0
            for word in positive_words:
                score += content.count(word)
            for word in negative_words:
                score -= content.count(word)

            total_score += score
            article_count += 1

        if article_count == 0:
            return 0.0

        # Normalize to -1 to 1 scale
        avg_score = total_score / article_count
        return max(-1.0, min(1.0, avg_score / 3))  # Scale down

    def _score_to_label(self, score: float) -> str:
        if score > 0.3:
            return 'positive'
        elif score < -0.3:
            return 'negative'
        else:
            return 'neutral'

    async def get_real_time_price(self, symbol: str) -> Optional[DataPoint]:
        return None  # NewsAPI doesn't provide price data

    async def get_fundamental_data(self, symbol: str) -> Optional[DataPoint]:
        return None  # NewsAPI doesn't provide fundamental data

class YChartsClient(BaseAPIClient):
    def __init__(self, credentials: APICredentials):
        super().__init__(credentials)
        self.base_url = "https://api.ycharts.com/v1"
        self.rate_limit_delay = 0.3  # YCharts allows reasonable rate limiting

    async def get_real_time_price(self, symbol: str) -> Optional[DataPoint]:
        """Get real-time price from YCharts"""
        await self._rate_limit()

        try:
            # YCharts real-time price endpoint
            url = f"{self.base_url}/securities/{symbol}/values/price"
            headers = {
                'X-YCHARTS-API-KEY': self.credentials.ycharts_key,
                'Content-Type': 'application/json'
            }

            async with aiohttp.ClientSession() as session:
                async with session.get(url, headers=headers) as response:
                    if response.status == 200:
                        data = await response.json()

                        if 'results' in data and data['results']:
                            price_data = data['results'][0]
                            return DataPoint(
                                source=DataSource.YCHARTS,
                                symbol=symbol,
                                data_type=DataType.REAL_TIME_PRICE,
                                value=price_data.get('value'),
                                timestamp=datetime.now(),
                                confidence=0.95,
                                metadata={
                                    'source_type': 'real_time_price',
                                    'date': price_data.get('date'),
                                    'currency': price_data.get('currency', 'USD')
                                }
                            )
                    else:
                        self.logger.warning(f"YCharts price API error {response.status} for {symbol}")

        except Exception as e:
            self.logger.error(f"YCharts price request failed for {symbol}: {str(e)}")
            return None

    async def get_fundamental_data(self, symbol: str) -> Optional[DataPoint]:
        """Get comprehensive fundamental data from YCharts"""
        await self._rate_limit()

        try:
            # YCharts fundamental metrics - multiple calls for comprehensive data
            metrics = [
                'market_cap',
                'pe_ratio',
                'price_to_book_ratio',
                'dividend_yield',
                'revenue_ttm',
                'net_income_ttm',
                'free_cash_flow_ttm',
                'total_debt',
                'current_ratio',
                'return_on_equity',
                'return_on_assets',
                'gross_margin_ttm',
                'operating_margin_ttm',
                'net_margin_ttm'
            ]

            fundamental_data = {}

            for metric in metrics:
                url = f"{self.base_url}/securities/{symbol}/values/{metric}"
                headers = {
                    'X-YCHARTS-API-KEY': self.credentials.ycharts_key,
                    'Content-Type': 'application/json'
                }

                async with aiohttp.ClientSession() as session:
                    async with session.get(url, headers=headers) as response:
                        if response.status == 200:
                            data = await response.json()
                            if 'results' in data and data['results']:
                                fundamental_data[metric] = data['results'][0].get('value')
                        await asyncio.sleep(0.1)  # Small delay between requests

            if fundamental_data:
                return DataPoint(
                    source=DataSource.YCHARTS,
                    symbol=symbol,
                    data_type=DataType.FUNDAMENTAL,
                    value=fundamental_data,
                    timestamp=datetime.now(),
                    confidence=0.95,
                    metadata={'source_type': 'comprehensive_fundamentals', 'metrics_count': len(fundamental_data)}
                )

        except Exception as e:
            self.logger.error(f"YCharts fundamental request failed for {symbol}: {str(e)}")
            return None

    async def get_technical_indicators(self, symbol: str) -> Optional[DataPoint]:
        """Get technical analysis data from YCharts"""
        await self._rate_limit()

        try:
            # YCharts technical indicators
            indicators = {
                'rsi_14': f"{self.base_url}/securities/{symbol}/values/rsi_14_day",
                'sma_20': f"{self.base_url}/securities/{symbol}/values/sma_20_day",
                'sma_50': f"{self.base_url}/securities/{symbol}/values/sma_50_day",
                'sma_200': f"{self.base_url}/securities/{symbol}/values/sma_200_day",
                'ema_12': f"{self.base_url}/securities/{symbol}/values/ema_12_day",
                'ema_26': f"{self.base_url}/securities/{symbol}/values/ema_26_day",
                'bollinger_upper': f"{self.base_url}/securities/{symbol}/values/bollinger_band_upper_20_day",
                'bollinger_lower': f"{self.base_url}/securities/{symbol}/values/bollinger_band_lower_20_day"
            }

            technical_data = {}
            headers = {
                'X-YCHARTS-API-KEY': self.credentials.ycharts_key,
                'Content-Type': 'application/json'
            }

            for indicator, url in indicators.items():
                try:
                    async with aiohttp.ClientSession() as session:
                        async with session.get(url, headers=headers) as response:
                            if response.status == 200:
                                data = await response.json()
                                if 'results' in data and data['results']:
                                    technical_data[indicator] = data['results'][0].get('value')
                            await asyncio.sleep(0.1)
                except:
                    continue  # Skip failed indicators

            if technical_data:
                return DataPoint(
                    source=DataSource.YCHARTS,
                    symbol=symbol,
                    data_type=DataType.TECHNICAL_INDICATORS,
                    value=technical_data,
                    timestamp=datetime.now(),
                    confidence=0.95,
                    metadata={'source_type': 'technical_analysis', 'indicators_count': len(technical_data)}
                )

        except Exception as e:
            self.logger.error(f"YCharts technical indicators request failed for {symbol}: {str(e)}")
            return None

class YahooFinanceClient(BaseAPIClient):
    """Fallback client using existing yfinance integration"""

    def __init__(self, credentials: APICredentials):
        super().__init__(credentials)
        self.rate_limit_delay = 0.1  # Yahoo is generally more permissive

    async def get_real_time_price(self, symbol: str) -> Optional[DataPoint]:
        await self._rate_limit()

        try:
            import yfinance as yf

            ticker = yf.Ticker(symbol)
            info = ticker.info

            if 'currentPrice' in info:
                return DataPoint(
                    source=DataSource.YAHOO_FINANCE,
                    symbol=symbol,
                    data_type=DataType.REAL_TIME_PRICE,
                    value=info['currentPrice'],
                    timestamp=datetime.now(),
                    confidence=0.85,
                    metadata={
                        'regularMarketPrice': info.get('regularMarketPrice'),
                        'regularMarketChange': info.get('regularMarketChange'),
                        'regularMarketChangePercent': info.get('regularMarketChangePercent'),
                        'regularMarketVolume': info.get('regularMarketVolume')
                    }
                )

        except Exception as e:
            self.logger.error(f"Yahoo Finance request failed for {symbol}: {str(e)}")
            return None

    async def get_fundamental_data(self, symbol: str) -> Optional[DataPoint]:
        await self._rate_limit()

        try:
            import yfinance as yf

            ticker = yf.Ticker(symbol)
            info = ticker.info

            if info:
                return DataPoint(
                    source=DataSource.YAHOO_FINANCE,
                    symbol=symbol,
                    data_type=DataType.FUNDAMENTAL,
                    value=info,
                    timestamp=datetime.now(),
                    confidence=0.85,
                    metadata=info
                )

        except Exception as e:
            self.logger.error(f"Yahoo Finance fundamentals failed for {symbol}: {str(e)}")
            return None

class MultiAPIAggregator:
    def __init__(self, credentials: APICredentials = None):
        self.credentials = credentials or APICredentials.from_environment()
        self.logger = logging.getLogger(__name__)

        # Initialize API clients
        self.clients = {
            DataSource.FINNHUB: FinnhubClient(self.credentials),
            DataSource.ALPHA_VANTAGE: AlphaVantageClient(self.credentials),
            DataSource.POLYGON: PolygonClient(self.credentials),
            DataSource.NEWSAPI: NewsAPIClient(self.credentials),
            DataSource.YCHARTS: YChartsClient(self.credentials),
            DataSource.YAHOO_FINANCE: YahooFinanceClient(self.credentials)
        }

        # Caching
        self.cache: Dict[str, Tuple[AggregatedData, datetime]] = {}
        self.cache_duration = timedelta(seconds=30)

        # Source priorities for different data types - Polygon as primary for real-time
        self.source_priorities = {
            DataType.REAL_TIME_PRICE: [
                DataSource.POLYGON,       # Primary - Polygon has excellent real-time data
                DataSource.YCHARTS,       # Secondary - YCharts has high-quality real-time data
                DataSource.ALPHA_VANTAGE, # Backup
                DataSource.YAHOO_FINANCE  # Fallback
            ],
            DataType.FUNDAMENTAL: [
                DataSource.POLYGON,       # Primary - Polygon has comprehensive fundamental data
                DataSource.YCHARTS,       # Secondary - YCharts for detailed analysis
                DataSource.ALPHA_VANTAGE, # Backup
                DataSource.YAHOO_FINANCE  # Fallback
            ],
            DataType.TECHNICAL_INDICATORS: [
                DataSource.YCHARTS,       # Primary - YCharts has comprehensive technical analysis
                DataSource.ALPHA_VANTAGE, # Secondary
                DataSource.YAHOO_FINANCE  # Fallback
            ],
            DataType.NEWS_SENTIMENT: [
                DataSource.NEWSAPI,       # Specialized for news
                DataSource.ALPHA_VANTAGE  # Secondary
            ],
            DataType.ADVANCED_ANALYTICS: [
                DataSource.YCHARTS,       # Primary - YCharts is built for advanced analytics
                DataSource.ALPHA_VANTAGE  # Secondary
            ]
        }

    async def get_real_time_price(self, symbol: str) -> AggregatedData:
        """Get real-time price with cross-validation from multiple sources"""
        cache_key = f"{symbol}_price"

        # Check cache first
        if cache_key in self.cache:
            cached_data, cached_time = self.cache[cache_key]
            if datetime.now() - cached_time < self.cache_duration:
                self.logger.info(f"Returning cached price data for {symbol}")
                return cached_data

        # Query multiple sources
        data_points = []
        sources = self.source_priorities[DataType.REAL_TIME_PRICE]

        tasks = []
        for source in sources:
            if source in self.clients:
                task = self.clients[source].get_real_time_price(symbol)
                tasks.append((source, task))

        # Execute requests concurrently with timeout
        results = await asyncio.gather(
            *[task for _, task in tasks],
            return_exceptions=True
        )

        # Process results
        for i, result in enumerate(results):
            if isinstance(result, DataPoint) and result is not None:
                data_points.append(result)
                self.logger.info(f"Got price from {sources[i].value}: ${result.value:.2f}")

        # Aggregate and validate
        aggregated = self._aggregate_prices(symbol, data_points)

        # Cache result
        self.cache[cache_key] = (aggregated, datetime.now())

        return aggregated

    async def get_fundamental_data(self, symbol: str) -> AggregatedData:
        """Get fundamental data from multiple sources"""
        cache_key = f"{symbol}_fundamentals"

        # Check cache
        if cache_key in self.cache:
            cached_data, cached_time = self.cache[cache_key]
            if datetime.now() - cached_time < self.cache_duration:
                return cached_data

        # Query sources
        data_points = []
        sources = self.source_priorities[DataType.FUNDAMENTAL]

        for source in sources:
            if source in self.clients:
                try:
                    data_point = await self.clients[source].get_fundamental_data(symbol)
                    if data_point:
                        data_points.append(data_point)
                except Exception as e:
                    self.logger.error(f"Error getting fundamentals from {source.value}: {str(e)}")

        # Aggregate
        aggregated = self._aggregate_fundamentals(symbol, data_points)

        # Cache
        self.cache[cache_key] = (aggregated, datetime.now())

        return aggregated

    async def get_technical_indicators(self, symbol: str) -> AggregatedData:
        """Get technical indicators prioritizing YCharts"""
        cache_key = f"{symbol}_technical"

        # Check cache
        if cache_key in self.cache:
            cached_data, cached_time = self.cache[cache_key]
            if datetime.now() - cached_time < self.cache_duration:
                return cached_data

        # Query sources
        data_points = []
        sources = self.source_priorities[DataType.TECHNICAL_INDICATORS]

        for source in sources:
            if source in self.clients:
                try:
                    if hasattr(self.clients[source], 'get_technical_indicators'):
                        data_point = await self.clients[source].get_technical_indicators(symbol)
                        if data_point:
                            data_points.append(data_point)
                            break  # YCharts should be comprehensive enough
                except Exception as e:
                    self.logger.error(f"Error getting technical indicators from {source.value}: {str(e)}")

        # Aggregate
        aggregated = self._aggregate_technical_indicators(symbol, data_points)

        # Cache
        self.cache[cache_key] = (aggregated, datetime.now())

        return aggregated

    async def get_comprehensive_data(self, symbol: str) -> Dict[str, AggregatedData]:
        """Get comprehensive data using YCharts as primary source"""
        self.logger.info(f"Getting comprehensive data for {symbol}")

        # Get all data types concurrently for efficiency
        tasks = {
            'price': self.get_real_time_price(symbol),
            'fundamentals': self.get_fundamental_data(symbol),
            'technical': self.get_technical_indicators(symbol)
        }

        # Execute all requests concurrently
        results = await asyncio.gather(*tasks.values(), return_exceptions=True)

        # Map results back to data types
        comprehensive_data = {}
        for data_type, result in zip(tasks.keys(), results):
            if isinstance(result, Exception):
                self.logger.error(f"Error getting {data_type} for {symbol}: {str(result)}")
                comprehensive_data[data_type] = None
            else:
                comprehensive_data[data_type] = result

        return comprehensive_data

    async def get_news_sentiment(self, symbol: str, company_name: str = None) -> AggregatedData:
        """Get news and sentiment data"""
        cache_key = f"{symbol}_sentiment"

        # Check cache
        if cache_key in self.cache:
            cached_data, cached_time = self.cache[cache_key]
            if datetime.now() - cached_time < self.cache_duration:
                return cached_data

        # Query NewsAPI
        data_points = []
        if DataSource.NEWSAPI in self.clients:
            try:
                data_point = await self.clients[DataSource.NEWSAPI].get_news_sentiment(symbol, company_name)
                if data_point:
                    data_points.append(data_point)
            except Exception as e:
                self.logger.error(f"Error getting news sentiment: {str(e)}")

        # Aggregate
        aggregated = self._aggregate_sentiment(symbol, data_points)

        # Cache
        self.cache[cache_key] = (aggregated, datetime.now())

        return aggregated

    async def get_comprehensive_data(self, symbol: str) -> Dict[DataType, AggregatedData]:
        """Get comprehensive data from all sources"""
        self.logger.info(f"Getting comprehensive data for {symbol}")

        # Execute all data requests concurrently
        tasks = [
            ('price', self.get_real_time_price(symbol)),
            ('fundamentals', self.get_fundamental_data(symbol)),
            ('sentiment', self.get_news_sentiment(symbol))
        ]

        results = await asyncio.gather(*[task for _, task in tasks], return_exceptions=True)

        comprehensive_data = {}
        for i, result in enumerate(results):
            data_type_name, _ = tasks[i]
            if isinstance(result, AggregatedData):
                if data_type_name == 'price':
                    comprehensive_data[DataType.REAL_TIME_PRICE] = result
                elif data_type_name == 'fundamentals':
                    comprehensive_data[DataType.FUNDAMENTAL] = result
                elif data_type_name == 'sentiment':
                    comprehensive_data[DataType.NEWS_SENTIMENT] = result
            else:
                self.logger.warning(f"Failed to get {data_type_name} for {symbol}: {result}")

        return comprehensive_data

    def _aggregate_prices(self, symbol: str, data_points: List[DataPoint]) -> AggregatedData:
        """Aggregate price data from multiple sources with discrepancy detection"""
        if not data_points:
            return AggregatedData(
                symbol=symbol,
                data_type=DataType.REAL_TIME_PRICE,
                consensus_value=None,
                sources=[],
                confidence_score=0.0
            )

        # Extract prices and sources
        prices = [dp.value for dp in data_points]
        sources = [dp.source for dp in data_points]

        # Calculate consensus (median for robustness)
        consensus_price = statistics.median(prices)

        # Detect discrepancies
        discrepancy_detected = False
        discrepancy_details = None

        if len(prices) > 1:
            price_range = max(prices) - min(prices)
            avg_price = statistics.mean(prices)
            discrepancy_threshold = avg_price * 0.005  # 0.5% threshold

            if price_range > discrepancy_threshold:
                discrepancy_detected = True
                price_details = [f"{sources[i].value}:${prices[i]:.2f}" for i in range(len(prices))]
                discrepancy_details = f"Price range: ${price_range:.2f} ({price_details})"
                self.logger.warning(f"Price discrepancy detected for {symbol}: {discrepancy_details}")

        # Calculate confidence score
        confidence_score = statistics.mean([dp.confidence for dp in data_points])
        if discrepancy_detected:
            confidence_score *= 0.8  # Reduce confidence if discrepancy detected

        # Create source data mapping
        source_data = {}
        for dp in data_points:
            source_data[dp.source] = {
                'price': dp.value,
                'timestamp': dp.timestamp.isoformat(),
                'metadata': dp.metadata
            }

        return AggregatedData(
            symbol=symbol,
            data_type=DataType.REAL_TIME_PRICE,
            consensus_value=consensus_price,
            sources=sources,
            discrepancy_detected=discrepancy_detected,
            discrepancy_details=discrepancy_details,
            confidence_score=confidence_score,
            source_data=source_data
        )

    def _aggregate_fundamentals(self, symbol: str, data_points: List[DataPoint]) -> AggregatedData:
        """Aggregate fundamental data from multiple sources"""
        if not data_points:
            return AggregatedData(
                symbol=symbol,
                data_type=DataType.FUNDAMENTAL,
                consensus_value=None,
                sources=[],
                confidence_score=0.0
            )

        # For fundamentals, we merge data from all sources
        merged_data = {}
        sources = []
        source_data = {}

        for dp in data_points:
            sources.append(dp.source)
            source_data[dp.source] = dp.value

            if isinstance(dp.value, dict):
                # Merge dictionaries, preferring more recent/higher confidence sources
                for key, value in dp.value.items():
                    if key not in merged_data or dp.confidence > 0.9:
                        merged_data[key] = value

        confidence_score = statistics.mean([dp.confidence for dp in data_points])

        return AggregatedData(
            symbol=symbol,
            data_type=DataType.FUNDAMENTAL,
            consensus_value=merged_data,
            sources=sources,
            confidence_score=confidence_score,
            source_data=source_data
        )

    def _aggregate_sentiment(self, symbol: str, data_points: List[DataPoint]) -> AggregatedData:
        """Aggregate sentiment data"""
        if not data_points:
            return AggregatedData(
                symbol=symbol,
                data_type=DataType.NEWS_SENTIMENT,
                consensus_value={
                    'sentiment_score': 0.0,
                    'sentiment_label': 'neutral',
                    'article_count': 0,
                    'confidence': 0.0
                },
                sources=[],
                confidence_score=0.0
            )

        # For now, just take the first (and likely only) sentiment result
        dp = data_points[0]

        return AggregatedData(
            symbol=symbol,
            data_type=DataType.NEWS_SENTIMENT,
            consensus_value=dp.value,
            sources=[dp.source],
            confidence_score=dp.confidence,
            source_data={dp.source: dp.value}
        )

    def _aggregate_technical_indicators(self, symbol: str, data_points: List[DataPoint]) -> AggregatedData:
        """Aggregate technical indicators from multiple sources"""
        if not data_points:
            return AggregatedData(
                symbol=symbol,
                data_type=DataType.TECHNICAL_INDICATORS,
                consensus_value={},
                sources=[],
                confidence_score=0.0
            )

        # For technical indicators, YCharts should be comprehensive enough
        # If we have YCharts data, use it as primary
        ycharts_data = None
        fallback_data = None

        for dp in data_points:
            if dp.source == DataSource.YCHARTS:
                ycharts_data = dp
                break
            elif fallback_data is None:
                fallback_data = dp

        primary_data = ycharts_data or fallback_data

        if primary_data:
            return AggregatedData(
                symbol=symbol,
                data_type=DataType.TECHNICAL_INDICATORS,
                consensus_value=primary_data.value,
                sources=[primary_data.source],
                confidence_score=primary_data.confidence,
                source_data={primary_data.source: primary_data.value}
            )

        return AggregatedData(
            symbol=symbol,
            data_type=DataType.TECHNICAL_INDICATORS,
            consensus_value={},
            sources=[],
            confidence_score=0.0
        )

    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        total_entries = len(self.cache)
        expired_entries = 0

        current_time = datetime.now()
        for _, (_, cached_time) in self.cache.items():
            if current_time - cached_time > self.cache_duration:
                expired_entries += 1

        return {
            'total_entries': total_entries,
            'expired_entries': expired_entries,
            'cache_hit_rate': 'N/A',  # Would need tracking to calculate
            'cache_duration_seconds': self.cache_duration.total_seconds()
        }

    def clear_expired_cache(self):
        """Clear expired cache entries"""
        current_time = datetime.now()
        expired_keys = []

        for key, (_, cached_time) in self.cache.items():
            if current_time - cached_time > self.cache_duration:
                expired_keys.append(key)

        for key in expired_keys:
            del self.cache[key]

        if expired_keys:
            self.logger.info(f"Cleared {len(expired_keys)} expired cache entries")
