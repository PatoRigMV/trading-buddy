"""
Enhanced API Clients for Professional Trading Data Providers
Implements Polygon, Tiingo, Twelve Data, and FMP clients with proper error handling
"""

import asyncio
import aiohttp
import websockets
import json
import logging
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass
from abc import ABC, abstractmethod
from http2_connection_manager import get_connection_manager
from circuit_breaker import get_error_recovery_manager, CircuitBreakerConfig

@dataclass
class APIResponse:
    """Standardized API response"""
    success: bool
    data: Any
    latency_ms: float
    provider: str
    timestamp: datetime
    error_message: Optional[str] = None
    rate_limited: bool = False

class BaseEnhancedAPIClient(ABC):
    """Enhanced base API client with professional error handling"""

    def __init__(self, api_key: str, name: str):
        self.api_key = api_key
        self.name = name
        self.logger = logging.getLogger(f"{__name__}.{name}")
        self.session = None
        self.request_count = 0
        self.error_count = 0
        self.last_request_time = 0

        # Initialize error recovery with circuit breaker
        self.error_recovery = get_error_recovery_manager()
        circuit_config = CircuitBreakerConfig(
            failure_threshold=3,
            recovery_timeout=30.0,
            success_threshold=2,
            timeout=30.0
        )
        self.circuit_breaker = self.error_recovery.get_circuit_breaker(f"api_{name.lower()}", circuit_config)

    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()

    async def _make_request(self, url: str, headers: Dict = None, params: Dict = None, timeout: int = 10) -> APIResponse:
        """Make HTTP/2 request with circuit breaker protection, connection pooling, error handling and timing"""
        start_time = time.time()

        async def _protected_request():
            # Use HTTP/2 connection manager for better performance
            http2_manager = get_connection_manager()

            self.request_count += 1
            self.last_request_time = time.time()

            # Make request using HTTP/2 connection pooling
            return await http2_manager.get(url, headers=headers, params=params)

        try:
            # Execute request with circuit breaker protection and retry logic
            response = await self.error_recovery.with_circuit_breaker(
                f"api_{self.name.lower()}_request",
                self.error_recovery.with_retry,
                _protected_request,
                'api_calls'
            )

            latency_ms = (time.time() - start_time) * 1000

            if response.status_code == 200:
                data = response.json()
                return APIResponse(
                    success=True,
                    data=data,
                    latency_ms=latency_ms,
                    provider=self.name,
                    timestamp=datetime.now()
                )
            elif response.status_code == 429:
                self.logger.warning(f"{self.name} rate limited - HTTP/2 connection reused")
                return APIResponse(
                    success=False,
                    data=None,
                    latency_ms=latency_ms,
                    provider=self.name,
                    timestamp=datetime.now(),
                    error_message="Rate limited",
                    rate_limited=True
                )
            else:
                error_msg = f"HTTP {response.status_code}"
                self.error_count += 1
                return APIResponse(
                    success=False,
                    data=None,
                    latency_ms=latency_ms,
                    provider=self.name,
                    timestamp=datetime.now(),
                    error_message=error_msg
                )

        except asyncio.TimeoutError:
            latency_ms = (time.time() - start_time) * 1000
            self.error_count += 1
            return APIResponse(
                success=False,
                data=None,
                latency_ms=latency_ms,
                provider=self.name,
                timestamp=datetime.now(),
                error_message="Timeout"
            )
        except Exception as e:
            latency_ms = (time.time() - start_time) * 1000
            self.error_count += 1
            self.logger.error(f"{self.name} request failed: {e}")
            return APIResponse(
                success=False,
                data=None,
                latency_ms=latency_ms,
                provider=self.name,
                timestamp=datetime.now(),
                error_message=str(e)
            )

class PolygonClient(BaseEnhancedAPIClient):
    """Polygon.io API client with WebSocket support"""

    def __init__(self, api_key: str):
        super().__init__(api_key, "Polygon")
        self.base_url = "https://api.polygon.io"
        self.ws_url = "wss://socket.polygon.io/stocks"
        self.ws_connection = None
        self.subscriptions = set()

    async def get_last_trade(self, symbol: str) -> APIResponse:
        """Get last trade for symbol"""
        url = f"{self.base_url}/v2/last/trade/{symbol}"
        params = {"apikey": self.api_key}

        response = await self._make_request(url, params=params)

        if response.success and response.data:
            # Transform to standard format
            results = response.data.get('results', {})
            transformed_data = {
                'price': results.get('p'),  # price
                'size': results.get('s'),   # size
                'timestamp': results.get('t'),  # timestamp
                'exchange': results.get('x'),   # exchange
                'conditions': results.get('c', [])  # conditions
            }
            response.data = transformed_data

        return response

    async def get_last_quote(self, symbol: str) -> APIResponse:
        """Get last quote (bid/ask) for symbol"""
        url = f"{self.base_url}/v2/last/nbbo/{symbol}"
        params = {"apikey": self.api_key}

        response = await self._make_request(url, params=params)

        if response.success and response.data:
            results = response.data.get('results', {})
            transformed_data = {
                'bid': results.get('P'),  # bid price
                'ask': results.get('p'),  # ask price
                'bid_size': results.get('S'),  # bid size
                'ask_size': results.get('s'),  # ask size
                'timestamp': results.get('t')
            }
            response.data = transformed_data

        return response

    async def get_batch_quotes(self, symbols: List[str]) -> Dict[str, APIResponse]:
        """Get batch quotes for multiple symbols efficiently"""
        results = {}

        # Polygon supports batch requests through comma-separated symbols in snapshots endpoint
        if len(symbols) > 50:  # Split large batches
            batches = [symbols[i:i+50] for i in range(0, len(symbols), 50)]
        else:
            batches = [symbols]

        for batch in batches:
            symbols_param = ','.join(batch)
            url = f"{self.base_url}/v2/snapshot/locale/us/markets/stocks/tickers"
            params = {"tickers": symbols_param, "apikey": self.api_key}

            response = await self._make_request(url, params=params)

            if response.success and response.data:
                tickers = response.data.get('tickers', [])
                for ticker_data in tickers:
                    symbol = ticker_data.get('ticker')
                    if symbol:
                        # Transform to standard format
                        last_trade = ticker_data.get('day', {})
                        last_quote = ticker_data.get('lastQuote', {})

                        transformed_data = {
                            'price': last_trade.get('c') or ticker_data.get('lastTrade', {}).get('p', 0),
                            'change': last_trade.get('c', 0) - last_trade.get('o', 0),
                            'change_percent': ((last_trade.get('c', 0) - last_trade.get('o', 0)) / last_trade.get('o', 1)) * 100 if last_trade.get('o', 0) > 0 else 0,
                            'volume': last_trade.get('v', 0),
                            'bid': last_quote.get('p'),
                            'ask': last_quote.get('P'),
                            'timestamp': ticker_data.get('updated')
                        }

                        # Create APIResponse for this symbol
                        symbol_response = APIResponse(
                            success=True,
                            data=transformed_data,
                            error=None,
                            response_time=response.response_time,
                            source="Polygon"
                        )
                        results[symbol] = symbol_response

        return results

    async def get_company_details(self, symbol: str) -> APIResponse:
        """Get company details/fundamentals"""
        url = f"{self.base_url}/v3/reference/tickers/{symbol}"
        params = {"apikey": self.api_key}

        response = await self._make_request(url, params=params)

        if response.success and response.data:
            results = response.data.get('results', {})
            transformed_data = {
                'name': results.get('name'),
                'description': results.get('description'),
                'market_cap': results.get('market_cap'),
                'share_class_shares_outstanding': results.get('share_class_shares_outstanding'),
                'sic_code': results.get('sic_code'),
                'homepage_url': results.get('homepage_url'),
                'total_employees': results.get('total_employees')
            }
            response.data = transformed_data

        return response

    async def get_market_status(self) -> APIResponse:
        """Get market status"""
        url = f"{self.base_url}/v1/marketstatus/now"
        params = {"apikey": self.api_key}
        return await self._make_request(url, params=params)

    # WebSocket methods
    async def connect_websocket(self) -> bool:
        """Connect to Polygon WebSocket"""
        try:
            if not self.api_key:
                self.logger.error("Polygon API key required for WebSocket")
                return False

            self.ws_connection = await websockets.connect(
                f"{self.ws_url}?apikey={self.api_key}",
                ping_interval=20,
                ping_timeout=10
            )

            self.logger.info("Connected to Polygon WebSocket")
            return True

        except Exception as e:
            self.logger.error(f"Failed to connect to Polygon WebSocket: {e}")
            return False

    async def subscribe_to_symbols(self, symbols: List[str], callback=None) -> bool:
        """Subscribe to real-time data for multiple symbols"""
        if not self.ws_connection:
            if not await self.connect_websocket():
                return False

        try:
            # Subscribe to trades and quotes for all symbols
            for symbol in symbols:
                trade_sub = {"action": "subscribe", "params": f"T.{symbol}"}
                quote_sub = {"action": "subscribe", "params": f"Q.{symbol}"}

                await self.ws_connection.send(json.dumps(trade_sub))
                await self.ws_connection.send(json.dumps(quote_sub))

                self.subscriptions.add(f"T.{symbol}")
                self.subscriptions.add(f"Q.{symbol}")

            self.logger.info(f"🚀 Subscribed to real-time data for {len(symbols)} symbols")

            # Start listening for messages
            if callback:
                asyncio.create_task(self._listen_for_messages(callback))

            return True

        except Exception as e:
            self.logger.error(f"Failed to subscribe to symbols: {e}")
            return False

    async def _listen_for_messages(self, callback):
        """Listen for WebSocket messages and process them"""
        try:
            async for message in self.ws_connection:
                try:
                    data = json.loads(message)

                    # Handle different message types
                    if isinstance(data, list):
                        for item in data:
                            await self._process_market_data(item, callback)
                    else:
                        await self._process_market_data(data, callback)

                except json.JSONDecodeError:
                    self.logger.warning(f"Invalid JSON received: {message}")
                except Exception as e:
                    self.logger.error(f"Error processing message: {e}")

        except websockets.exceptions.ConnectionClosed:
            self.logger.warning("WebSocket connection closed, attempting to reconnect...")
            await self._reconnect(callback)
        except Exception as e:
            self.logger.error(f"WebSocket listening error: {e}")

    async def _process_market_data(self, data, callback):
        """Process and transform market data from WebSocket"""
        try:
            msg_type = data.get('ev')  # Event type

            if msg_type == 'T':  # Trade data
                symbol = data.get('sym')
                transformed = {
                    'symbol': symbol,
                    'price': data.get('p'),
                    'size': data.get('s'),
                    'timestamp': data.get('t'),
                    'type': 'trade'
                }

                if callback:
                    await callback(transformed)

            elif msg_type == 'Q':  # Quote data
                symbol = data.get('sym')
                transformed = {
                    'symbol': symbol,
                    'bid': data.get('bp'),
                    'ask': data.get('ap'),
                    'bid_size': data.get('bs'),
                    'ask_size': data.get('as'),
                    'timestamp': data.get('t'),
                    'type': 'quote'
                }

                if callback:
                    await callback(transformed)

        except Exception as e:
            self.logger.error(f"Error processing market data: {e}")

    async def _reconnect(self, callback):
        """Reconnect WebSocket with exponential backoff"""
        max_retries = 5
        base_delay = 1

        for attempt in range(max_retries):
            try:
                delay = base_delay * (2 ** attempt)
                self.logger.info(f"Reconnecting in {delay}s (attempt {attempt + 1}/{max_retries})")
                await asyncio.sleep(delay)

                if await self.connect_websocket():
                    # Re-subscribe to all symbols
                    symbols = [sub.split('.')[1] for sub in self.subscriptions if sub.startswith('T.')]
                    if await self.subscribe_to_symbols(symbols, callback):
                        self.logger.info("✅ WebSocket reconnected and subscriptions restored")
                        return

            except Exception as e:
                self.logger.error(f"Reconnection attempt {attempt + 1} failed: {e}")

        self.logger.error("❌ All reconnection attempts failed")

    async def disconnect_websocket(self):
        """Disconnect WebSocket"""
        if self.ws_connection:
            try:
                await self.ws_connection.close()
                self.logger.info("WebSocket disconnected")
            except Exception as e:
                self.logger.error(f"Error disconnecting WebSocket: {e}")
            finally:
                self.ws_connection = None
                self.subscriptions.clear()

    async def subscribe_trades(self, symbols: List[str]):
        """Subscribe to real-time trades"""
        if not self.ws_connection:
            await self.connect_websocket()

        if self.ws_connection:
            subscription = {
                "action": "subscribe",
                "params": f"T.{','.join(symbols)}"  # T = trades
            }

            await self.ws_connection.send(json.dumps(subscription))
            self.subscriptions.update(symbols)
            self.logger.info(f"Subscribed to trades for: {symbols}")

    async def subscribe_quotes(self, symbols: List[str]):
        """Subscribe to real-time quotes"""
        if not self.ws_connection:
            await self.connect_websocket()

        if self.ws_connection:
            subscription = {
                "action": "subscribe",
                "params": f"Q.{','.join(symbols)}"  # Q = quotes
            }

            await self.ws_connection.send(json.dumps(subscription))
            self.subscriptions.update(symbols)
            self.logger.info(f"Subscribed to quotes for: {symbols}")

    async def listen_websocket(self, callback=None):
        """Listen for WebSocket messages"""
        if not self.ws_connection:
            self.logger.error("WebSocket not connected")
            return

        try:
            async for message in self.ws_connection:
                data = json.loads(message)
                if callback:
                    await callback(data)
                else:
                    self.logger.debug(f"Polygon WebSocket data: {data}")

        except websockets.exceptions.ConnectionClosed:
            self.logger.warning("Polygon WebSocket connection closed")
        except Exception as e:
            self.logger.error(f"Polygon WebSocket error: {e}")

class TiingoClient(BaseEnhancedAPIClient):
    """Tiingo API client for IEX and fundamental data"""

    def __init__(self, api_key: str):
        super().__init__(api_key, "Tiingo")
        self.base_url = "https://api.tiingo.com/v1"
        self.iex_url = "https://api.tiingo.com/iex"

    async def get_iex_quote(self, symbol: str) -> APIResponse:
        """Get IEX real-time quote"""
        url = f"{self.iex_url}/{symbol}"
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Token {self.api_key}'
        }

        response = await self._make_request(url, headers=headers)

        if response.success and response.data:
            # Tiingo returns list, get first item
            if isinstance(response.data, list) and len(response.data) > 0:
                data = response.data[0]
                transformed_data = {
                    'price': data.get('last'),
                    'bid': data.get('bidPrice'),
                    'ask': data.get('askPrice'),
                    'volume': data.get('volume'),
                    'timestamp': data.get('timestamp'),
                    'high': data.get('high'),
                    'low': data.get('low'),
                    'open': data.get('open'),
                    'prev_close': data.get('prevClose')
                }
                response.data = transformed_data

        return response

    async def get_fundamentals(self, symbol: str) -> APIResponse:
        """Get fundamental data"""
        url = f"{self.base_url}/daily/{symbol}"
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Token {self.api_key}'
        }
        params = {
            'format': 'json',
            'resampleFreq': 'daily',
            'columns': 'adjClose,adjHigh,adjLow,adjOpen,adjVolume,close,date,divCash,high,low,open,splitFactor,volume'
        }

        response = await self._make_request(url, headers=headers, params=params)

        if response.success and response.data:
            # Get metadata for company info
            meta = response.data.get('meta', {})
            transformed_data = {
                'name': meta.get('name'),
                'description': meta.get('description'),
                'exchange': meta.get('exchangeCode'),
                'start_date': meta.get('startDate'),
                'end_date': meta.get('endDate')
            }
            response.data = transformed_data

        return response

    async def get_news(self, symbol: str, start_date: str = None) -> APIResponse:
        """Get news for symbol"""
        url = f"{self.base_url}/news"
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Token {self.api_key}'
        }

        params = {
            'tickers': symbol,
            'sortBy': 'publishedDate'
        }

        if start_date:
            params['startDate'] = start_date

        return await self._make_request(url, headers=headers, params=params)

class TwelveDataClient(BaseEnhancedAPIClient):
    """Twelve Data API client via RapidAPI"""

    def __init__(self, rapidapi_key: str):
        super().__init__(rapidapi_key, "TwelveData")
        self.base_url = "https://twelve-data1.p.rapidapi.com"

    async def get_price(self, symbol: str) -> APIResponse:
        """Get current price"""
        url = f"{self.base_url}/price"
        headers = {
            'X-RapidAPI-Key': self.api_key,
            'X-RapidAPI-Host': 'twelve-data1.p.rapidapi.com'
        }
        params = {
            'symbol': symbol,
            'format': 'json',
            'outputsize': '30'
        }

        response = await self._make_request(url, headers=headers, params=params)

        if response.success and response.data:
            # Twelve Data price format
            if 'price' in response.data:
                price_str = response.data['price']
                try:
                    price = float(price_str)
                    response.data = {'price': price, 'timestamp': datetime.now().isoformat()}
                except (ValueError, TypeError):
                    response.success = False
                    response.error_message = "Invalid price format"

        return response

    async def get_quote(self, symbol: str) -> APIResponse:
        """Get real-time quote"""
        url = f"{self.base_url}/quote"
        headers = {
            'X-RapidAPI-Key': self.api_key,
            'X-RapidAPI-Host': 'twelve-data1.p.rapidapi.com'
        }
        params = {'symbol': symbol}

        response = await self._make_request(url, headers=headers, params=params)

        if response.success and response.data:
            transformed_data = {
                'price': response.data.get('close'),
                'open': response.data.get('open'),
                'high': response.data.get('high'),
                'low': response.data.get('low'),
                'volume': response.data.get('volume'),
                'timestamp': response.data.get('datetime')
            }
            response.data = transformed_data

        return response

    async def get_profile(self, symbol: str) -> APIResponse:
        """Get company profile"""
        url = f"{self.base_url}/profile"
        headers = {
            'X-RapidAPI-Key': self.api_key,
            'X-RapidAPI-Host': 'twelve-data1.p.rapidapi.com'
        }
        params = {'symbol': symbol}

        return await self._make_request(url, headers=headers, params=params)

class FMPClient(BaseEnhancedAPIClient):
    """Financial Modeling Prep API client via RapidAPI"""

    def __init__(self, rapidapi_key: str):
        super().__init__(rapidapi_key, "FMP")
        self.base_url = "https://financialmodelingprep.com/api/v3"

    async def get_quote(self, symbol: str) -> APIResponse:
        """Get real-time quote"""
        url = f"{self.base_url}/quote/{symbol}"
        headers = {
            'X-RapidAPI-Key': self.api_key,
            'X-RapidAPI-Host': 'financialmodelingprep.com'
        }

        response = await self._make_request(url, headers=headers)

        if response.success and response.data:
            # FMP returns array, get first item
            if isinstance(response.data, list) and len(response.data) > 0:
                quote = response.data[0]
                transformed_data = {
                    'price': quote.get('price'),
                    'volume': quote.get('volume'),
                    'avg_volume': quote.get('avgVolume'),
                    'market_cap': quote.get('marketCap'),
                    'pe': quote.get('pe'),
                    'eps': quote.get('eps'),
                    'timestamp': quote.get('timestamp')
                }
                response.data = transformed_data

        return response

    async def get_profile(self, symbol: str) -> APIResponse:
        """Get company profile"""
        url = f"{self.base_url}/profile/{symbol}"
        headers = {
            'X-RapidAPI-Key': self.api_key,
            'X-RapidAPI-Host': 'financialmodelingprep.com'
        }

        response = await self._make_request(url, headers=headers)

        if response.success and response.data:
            # FMP returns array, get first item
            if isinstance(response.data, list) and len(response.data) > 0:
                profile = response.data[0]
                transformed_data = {
                    'name': profile.get('companyName'),
                    'description': profile.get('description'),
                    'industry': profile.get('industry'),
                    'sector': profile.get('sector'),
                    'website': profile.get('website'),
                    'market_cap': profile.get('mktCap'),
                    'employees': profile.get('fullTimeEmployees')
                }
                response.data = transformed_data

        return response

    async def get_financial_ratios(self, symbol: str) -> APIResponse:
        """Get financial ratios"""
        url = f"{self.base_url}/ratios/{symbol}"
        headers = {
            'X-RapidAPI-Key': self.api_key,
            'X-RapidAPI-Host': 'financialmodelingprep.com'
        }

        response = await self._make_request(url, headers=headers)

        if response.success and response.data:
            # Get most recent ratios (first item)
            if isinstance(response.data, list) and len(response.data) > 0:
                ratios = response.data[0]
                transformed_data = {
                    'pe_ratio': ratios.get('priceEarningsRatio'),
                    'pb_ratio': ratios.get('priceToBookRatio'),
                    'debt_ratio': ratios.get('debtRatio'),
                    'current_ratio': ratios.get('currentRatio'),
                    'roe': ratios.get('returnOnEquity'),
                    'roa': ratios.get('returnOnAssets'),
                    'date': ratios.get('date')
                }
                response.data = transformed_data

        return response

    async def get_stock_splits(self, symbol: str) -> APIResponse:
        """Get stock splits (corporate actions)"""
        url = f"{self.base_url}/historical-price-full/stock_split/{symbol}"
        headers = {
            'X-RapidAPI-Key': self.api_key,
            'X-RapidAPI-Host': 'financialmodelingprep.com'
        }

        return await self._make_request(url, headers=headers)

# Factory function to create clients
def create_enhanced_clients(credentials: Dict[str, str]) -> Dict[str, BaseEnhancedAPIClient]:
    """Create all enhanced API clients"""
    clients = {}

    if credentials.get('polygon_key'):
        clients['polygon'] = PolygonClient(credentials['polygon_key'])

    if credentials.get('tiingo_token'):
        clients['tiingo'] = TiingoClient(credentials['tiingo_token'])

    if credentials.get('twelve_data_rapidapi_key'):
        clients['twelve_data'] = TwelveDataClient(credentials['twelve_data_rapidapi_key'])

    if credentials.get('fmp_rapidapi_key'):
        clients['fmp'] = FMPClient(credentials['fmp_rapidapi_key'])

    return clients
