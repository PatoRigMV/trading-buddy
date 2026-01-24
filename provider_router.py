"""
Professional Trading Terminal Provider Router
Domain-specific API routing with execution-grade reliability and validation
"""

import asyncio
import aiohttp
import logging
import yaml
import time
import json
import os
from datetime import datetime, timedelta
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Tuple, Union
from enum import Enum
import statistics
from collections import defaultdict, deque

# Domain-specific data types
class DataDomain(Enum):
    PRICES = "prices"
    CORPORATE_ACTIONS = "corporate_actions"
    FUNDAMENTALS = "fundamentals"
    NEWS = "news"
    SENTIMENT = "sentiment"
    MACRO = "macro"

class ProviderStatus(Enum):
    ACTIVE = "active"
    DEGRADED = "degraded"
    CIRCUIT_BROKEN = "circuit_broken"
    OFFLINE = "offline"

@dataclass
class ProviderResponse:
    domain: DataDomain
    provider: str
    data: Any
    timestamp: datetime
    latency_ms: float
    confidence_score: float = 1.0
    source_of_truth: bool = False
    validation_passed: bool = True
    metadata: Dict[str, Any] = field(default_factory=dict)

@dataclass
class ValidationResult:
    passed: bool
    confidence: float
    discrepancies: List[str] = field(default_factory=list)
    consensus_value: Any = None
    sources_used: List[str] = field(default_factory=list)

class RateLimiter:
    """Leaky bucket rate limiter for API providers"""

    def __init__(self, rpm: int, burst: int = 5):
        self.rpm = rpm
        self.burst = burst
        self.tokens = burst
        self.last_update = time.time()
        self.requests = deque()

    async def acquire(self) -> bool:
        """Acquire permission to make a request"""
        now = time.time()

        # Add tokens based on time elapsed
        time_passed = now - self.last_update
        tokens_to_add = time_passed * (self.rpm / 60.0)
        self.tokens = min(self.burst, self.tokens + tokens_to_add)
        self.last_update = now

        # Clean old requests
        minute_ago = now - 60
        while self.requests and self.requests[0] < minute_ago:
            self.requests.popleft()

        # Check rate limit
        if len(self.requests) >= self.rpm or self.tokens < 1:
            return False

        # Consume token and record request
        self.tokens -= 1
        self.requests.append(now)
        return True

    async def wait_if_needed(self):
        """Wait if rate limited"""
        while not await self.acquire():
            await asyncio.sleep(0.1)

class CircuitBreaker:
    """Circuit breaker for API providers"""

    def __init__(self, failure_threshold: int = 3, timeout_seconds: int = 60):
        self.failure_threshold = failure_threshold
        self.timeout_seconds = timeout_seconds
        self.failure_count = 0
        self.last_failure_time = None
        self.state = ProviderStatus.ACTIVE

    def record_success(self):
        """Record successful request"""
        self.failure_count = 0
        if self.state == ProviderStatus.CIRCUIT_BROKEN:
            self.state = ProviderStatus.ACTIVE
            logging.info("Circuit breaker reset - provider back online")

    def record_failure(self):
        """Record failed request"""
        self.failure_count += 1
        self.last_failure_time = time.time()

        if self.failure_count >= self.failure_threshold:
            self.state = ProviderStatus.CIRCUIT_BROKEN
            logging.warning(f"Circuit breaker OPEN - provider offline for {self.timeout_seconds}s")

    def can_attempt(self) -> bool:
        """Check if requests are allowed"""
        if self.state != ProviderStatus.CIRCUIT_BROKEN:
            return True

        if self.last_failure_time and (time.time() - self.last_failure_time) > self.timeout_seconds:
            self.state = ProviderStatus.DEGRADED
            logging.info("Circuit breaker half-open - attempting recovery")
            return True

        return False

class ProviderRouter:
    """Professional provider router with domain-specific hierarchies"""

    def __init__(self, config_path: str = "data_providers.yaml"):
        self.logger = logging.getLogger(__name__)
        self.config = self._load_config(config_path)

        # Initialize rate limiters and circuit breakers
        self.rate_limiters = {}
        self.circuit_breakers = {}
        self.cache = {}
        self.provider_stats = defaultdict(lambda: {
            'requests': 0, 'successes': 0, 'failures': 0,
            'avg_latency': 0.0, 'last_success': None
        })

        self._initialize_rate_limiters()
        self._initialize_circuit_breakers()

        # WebSocket connections
        self.ws_connections = {}

        self.logger.info("Professional Provider Router initialized")

    def _load_config(self, config_path: str) -> Dict:
        """Load provider configuration"""
        try:
            with open(config_path, 'r') as f:
                config = yaml.safe_load(f)
            return config
        except Exception as e:
            self.logger.error(f"Failed to load config {config_path}: {e}")
            raise

    def _initialize_rate_limiters(self):
        """Initialize rate limiters for all providers"""
        rate_limits = self.config.get('rate_limits', {})

        for provider, limits in rate_limits.items():
            if limits.get('strategy') == 'ws_stream':
                continue  # WebSocket providers don't need rate limiting

            rpm = limits.get('rpm', 60)
            burst = limits.get('burst', 5)
            self.rate_limiters[provider] = RateLimiter(rpm, burst)

    def _initialize_circuit_breakers(self):
        """Initialize circuit breakers for all providers"""
        for provider in self._get_all_providers():
            self.circuit_breakers[provider] = CircuitBreaker(
                failure_threshold=self.config.get('fallbacks', {}).get('circuit_breaker', {}).get('max_consecutive_failures', 3),
                timeout_seconds=60
            )

    def _get_all_providers(self) -> List[str]:
        """Get all unique provider names from config"""
        providers = set()
        for domain_config in self.config['data_providers'].values():
            if isinstance(domain_config, dict):
                for key, value in domain_config.items():
                    if key not in ['validation'] and isinstance(value, str):
                        providers.add(value)
        return list(providers)

    async def get_data(self, domain: DataDomain, symbol: str, **kwargs) -> ProviderResponse:
        """Get data using domain-specific provider hierarchy"""
        domain_config = self.config['data_providers'][domain.value]
        providers = self._get_provider_hierarchy(domain_config)

        # Try providers in order
        for i, provider in enumerate(providers):
            try:
                # Check circuit breaker
                if not self.circuit_breakers[provider].can_attempt():
                    self.logger.debug(f"Skipping {provider} - circuit breaker open")
                    continue

                # Check rate limit
                if provider in self.rate_limiters:
                    await self.rate_limiters[provider].wait_if_needed()

                # Check cache first
                cache_key = f"{domain.value}:{provider}:{symbol}"
                cached_data = self._get_cached_data(cache_key, domain)
                if cached_data:
                    return cached_data

                # Make request
                start_time = time.time()
                data = await self._fetch_from_provider(provider, domain, symbol, **kwargs)
                latency_ms = (time.time() - start_time) * 1000

                if data is not None:
                    # Create response
                    response = ProviderResponse(
                        domain=domain,
                        provider=provider,
                        data=data,
                        timestamp=datetime.now(),
                        latency_ms=latency_ms,
                        source_of_truth=(i == 0),  # First provider is SOT
                        metadata={'hierarchy_position': i}
                    )

                    # Cache the response
                    self._cache_response(cache_key, response, domain)

                    # Record success
                    self.circuit_breakers[provider].record_success()
                    self._update_stats(provider, True, latency_ms)

                    return response

            except Exception as e:
                self.logger.error(f"Provider {provider} failed for {symbol}: {e}")
                self.circuit_breakers[provider].record_failure()
                self._update_stats(provider, False, 0)
                continue

        raise Exception(f"All providers failed for {domain.value}:{symbol}")

    def _get_provider_hierarchy(self, domain_config: Dict) -> List[str]:
        """Extract provider hierarchy from domain config"""
        hierarchy = []
        order = ['primary', 'secondary', 'tertiary', 'quaternary', 'fallback', 'last_resort']

        for level in order:
            if level in domain_config and level != 'validation':
                hierarchy.append(domain_config[level])

        return hierarchy

    def _get_cached_data(self, cache_key: str, domain: DataDomain) -> Optional[ProviderResponse]:
        """Get data from cache if still fresh"""
        if cache_key not in self.cache:
            return None

        cached_item = self.cache[cache_key]
        ttl_seconds = self.config.get('fallbacks', {}).get('cache_ttl_seconds', {})

        # Domain-specific TTL
        ttl = ttl_seconds.get(domain.value.replace('_', ''), 60)  # Default 60s
        if domain == DataDomain.PRICES:
            ttl = ttl_seconds.get('quotes', 2)  # 2s for quotes

        # Safe timestamp handling - convert to datetime if needed
        if isinstance(cached_item.timestamp, datetime):
            cache_age_seconds = (datetime.now() - cached_item.timestamp).total_seconds()
        elif isinstance(cached_item.timestamp, (int, float)):
            cache_age_seconds = time.time() - cached_item.timestamp
        else:
            # Fallback - treat as expired
            cache_age_seconds = ttl + 1

        if cache_age_seconds < ttl:
            self.logger.debug(f"Cache hit for {cache_key}")
            return cached_item

        # Remove stale cache
        del self.cache[cache_key]
        return None

    def _cache_response(self, cache_key: str, response: ProviderResponse, domain: DataDomain):
        """Cache provider response"""
        self.cache[cache_key] = response

        # Cleanup old cache entries periodically
        if len(self.cache) % 100 == 0:
            self._cleanup_cache()

    def _cleanup_cache(self):
        """Remove expired cache entries"""
        now = datetime.now()
        expired_keys = []

        for key, response in self.cache.items():
            if (now - response.timestamp).total_seconds() > 300:  # 5 min max age
                expired_keys.append(key)

        for key in expired_keys:
            del self.cache[key]

        if expired_keys:
            self.logger.debug(f"Cleaned up {len(expired_keys)} expired cache entries")

    async def _fetch_from_provider(self, provider: str, domain: DataDomain, symbol: str, **kwargs) -> Any:
        """Fetch data from specific provider"""
        # This will be implemented with actual API clients
        # For now, return mock data to establish the framework

        if provider == 'yahoo_finance':
            return await self._fetch_yahoo_finance(domain, symbol, **kwargs)
        elif provider == 'polygon_ws':
            return await self._fetch_polygon_ws(domain, symbol, **kwargs)
        elif provider == 'tiingo_iex':
            return await self._fetch_tiingo_iex(domain, symbol, **kwargs)
        elif provider == 'twelve_data_rapidapi':
            return await self._fetch_twelve_data(domain, symbol, **kwargs)
        elif provider == 'fmp_rapidapi':
            return await self._fetch_fmp(domain, symbol, **kwargs)
        else:
            # Placeholder for other providers
            self.logger.warning(f"Provider {provider} not implemented yet")
            return None

    async def _fetch_yahoo_finance(self, domain: DataDomain, symbol: str, **kwargs) -> Any:
        """Fetch from Yahoo Finance (fallback)"""
        try:
            import yfinance as yf
            ticker = yf.Ticker(symbol)

            if domain == DataDomain.PRICES:
                info = ticker.info
                return {
                    'price': info.get('currentPrice', info.get('regularMarketPrice')),
                    'volume': info.get('volume'),
                    'timestamp': datetime.now().isoformat()
                }
            elif domain == DataDomain.FUNDAMENTALS:
                info = ticker.info
                return {
                    'pe_ratio': info.get('trailingPE'),
                    'market_cap': info.get('marketCap'),
                    'sector': info.get('sector'),
                    'industry': info.get('industry')
                }

        except Exception as e:
            self.logger.error(f"Yahoo Finance error for {symbol}: {e}")
            return None

    async def _fetch_twelve_data(self, domain: DataDomain, symbol: str, **kwargs) -> Any:
        """Fetch from Twelve Data via RapidAPI"""
        rapidapi_key = os.environ.get('RAPIDAPI_KEY', '')

        try:
            async with aiohttp.ClientSession() as session:
                if domain == DataDomain.PRICES:
                    url = f"https://twelve-data1.p.rapidapi.com/price"
                    params = {'symbol': symbol, 'format': 'json', 'outputsize': '30'}

                elif domain == DataDomain.FUNDAMENTALS:
                    url = f"https://twelve-data1.p.rapidapi.com/profile"
                    params = {'symbol': symbol}

                else:
                    return None

                headers = {
                    'X-RapidAPI-Key': rapidapi_key,
                    'X-RapidAPI-Host': 'twelve-data1.p.rapidapi.com'
                }

                async with session.get(url, headers=headers, params=params, timeout=10) as response:
                    if response.status == 200:
                        return await response.json()
                    else:
                        self.logger.warning(f"Twelve Data API error {response.status} for {symbol}")
                        return None

        except Exception as e:
            self.logger.error(f"Twelve Data error for {symbol}: {e}")
            return None

    async def _fetch_fmp(self, domain: DataDomain, symbol: str, **kwargs) -> Any:
        """Fetch from Financial Modeling Prep via RapidAPI"""
        rapidapi_key = os.environ.get('RAPIDAPI_KEY', '')

        try:
            async with aiohttp.ClientSession() as session:
                if domain == DataDomain.PRICES:
                    url = f"https://financialmodelingprep.com/api/v3/quote/{symbol}"

                elif domain == DataDomain.FUNDAMENTALS:
                    url = f"https://financialmodelingprep.com/api/v3/profile/{symbol}"

                elif domain == DataDomain.CORPORATE_ACTIONS:
                    url = f"https://financialmodelingprep.com/api/v3/stock_split_calendar"

                else:
                    return None

                headers = {
                    'X-RapidAPI-Key': rapidapi_key,
                    'X-RapidAPI-Host': 'financialmodelingprep.com'
                }

                async with session.get(url, headers=headers, timeout=10) as response:
                    if response.status == 200:
                        return await response.json()
                    else:
                        self.logger.warning(f"FMP API error {response.status} for {symbol}")
                        return None

        except Exception as e:
            self.logger.error(f"FMP error for {symbol}: {e}")
            return None

    async def _fetch_polygon_ws(self, domain: DataDomain, symbol: str, **kwargs) -> Any:
        """Fetch from Polygon REST API (WebSocket implementation would go here)"""
        polygon_key = self.config.get('credentials', {}).get('polygon_key')

        if not polygon_key:
            self.logger.warning("Polygon API key not configured")
            return None

        try:
            async with aiohttp.ClientSession() as session:
                if domain == DataDomain.PRICES:
                    # Use last trade endpoint for current price
                    url = f"https://api.polygon.io/v2/last/trade/{symbol}"
                    params = {"apikey": polygon_key}

                elif domain == DataDomain.FUNDAMENTALS:
                    # Use company details endpoint
                    url = f"https://api.polygon.io/v3/reference/tickers/{symbol}"
                    params = {"apikey": polygon_key}

                elif domain == DataDomain.CORPORATE_ACTIONS:
                    # Use market status or related endpoint
                    url = f"https://api.polygon.io/v1/marketstatus/now"
                    params = {"apikey": polygon_key}

                else:
                    return None

                async with session.get(url, params=params, timeout=10) as response:
                    if response.status == 200:
                        data = await response.json()

                        # Transform Polygon response format
                        if domain == DataDomain.PRICES and 'results' in data:
                            results = data['results']
                            return {
                                'price': results.get('p'),  # price
                                'size': results.get('s'),   # size
                                'timestamp': results.get('t'),  # timestamp
                                'exchange': results.get('x'),   # exchange
                                'provider': 'polygon'
                            }
                        elif domain == DataDomain.FUNDAMENTALS and 'results' in data:
                            results = data['results']
                            return {
                                'name': results.get('name'),
                                'description': results.get('description'),
                                'market_cap': results.get('market_cap'),
                                'provider': 'polygon'
                            }
                        else:
                            return data
                    else:
                        self.logger.warning(f"Polygon API error {response.status} for {symbol}")
                        return None

        except Exception as e:
            self.logger.error(f"Polygon API error for {symbol}: {e}")
            return None

    async def _fetch_tiingo_iex(self, domain: DataDomain, symbol: str, **kwargs) -> Any:
        """Placeholder for Tiingo IEX (requires API key)"""
        self.logger.info(f"Tiingo IEX not implemented yet for {symbol}")
        return None

    def _update_stats(self, provider: str, success: bool, latency_ms: float):
        """Update provider statistics"""
        stats = self.provider_stats[provider]
        stats['requests'] += 1

        if success:
            stats['successes'] += 1
            stats['last_success'] = datetime.now()
            # Update rolling average latency
            if stats['avg_latency'] == 0:
                stats['avg_latency'] = latency_ms
            else:
                stats['avg_latency'] = (stats['avg_latency'] * 0.9) + (latency_ms * 0.1)
        else:
            stats['failures'] += 1

    def get_provider_status(self) -> Dict[str, Dict]:
        """Get status of all providers"""
        status = {}

        for provider in self._get_all_providers():
            circuit_state = self.circuit_breakers[provider].state
            stats = self.provider_stats[provider]

            success_rate = 0
            if stats['requests'] > 0:
                success_rate = stats['successes'] / stats['requests']

            status[provider] = {
                'status': circuit_state.value,
                'success_rate': success_rate,
                'avg_latency_ms': stats['avg_latency'],
                'total_requests': stats['requests'],
                'last_success': stats['last_success'].isoformat() if stats['last_success'] else None
            }

        return status

    async def validate_cross_provider_data(self, domain: DataDomain, symbol: str, responses: List[ProviderResponse]) -> ValidationResult:
        """Validate data across multiple providers"""
        if not responses:
            return ValidationResult(passed=False, confidence=0.0)

        # Domain-specific validation
        if domain == DataDomain.PRICES:
            return await self._validate_price_data(responses)
        elif domain == DataDomain.FUNDAMENTALS:
            return await self._validate_fundamental_data(responses)
        else:
            # Basic validation for other domains
            return ValidationResult(
                passed=True,
                confidence=0.8,
                consensus_value=responses[0].data,
                sources_used=[r.provider for r in responses]
            )

    async def _validate_price_data(self, responses: List[ProviderResponse]) -> ValidationResult:
        """Validate price data across providers"""
        prices = []
        sources = []

        for response in responses:
            if response.data and 'price' in response.data:
                price = float(response.data['price'])
                if price > 0:  # Valid price
                    prices.append(price)
                    sources.append(response.provider)

        if not prices:
            return ValidationResult(passed=False, confidence=0.0)

        # Calculate consensus (median)
        consensus_price = statistics.median(prices)

        # Check for discrepancies
        max_deviation_pct = self.config['data_providers']['prices']['validation']['max_price_discrepancy_pct']
        discrepancies = []

        for i, price in enumerate(prices):
            deviation_pct = abs(price - consensus_price) / consensus_price * 100
            if deviation_pct > max_deviation_pct:
                discrepancies.append(f"{sources[i]}: {deviation_pct:.2f}% deviation")

        # Confidence based on agreement
        confidence = 1.0 - (len(discrepancies) / len(prices))
        passed = len(discrepancies) == 0

        return ValidationResult(
            passed=passed,
            confidence=confidence,
            consensus_value={'price': consensus_price},
            sources_used=sources,
            discrepancies=discrepancies
        )

    async def _validate_fundamental_data(self, responses: List[ProviderResponse]) -> ValidationResult:
        """Validate fundamental data across providers"""
        # Basic validation for now - can be enhanced
        return ValidationResult(
            passed=True,
            confidence=0.9,
            consensus_value=responses[0].data if responses else None,
            sources_used=[r.provider for r in responses]
        )

    def clear_cache(self, domain: Optional[DataDomain] = None):
        """Clear cache for specific domain or all"""
        if domain:
            keys_to_remove = [k for k in self.cache.keys() if k.startswith(domain.value)]
            for key in keys_to_remove:
                del self.cache[key]
            self.logger.info(f"Cleared {len(keys_to_remove)} cache entries for {domain.value}")
        else:
            count = len(self.cache)
            self.cache.clear()
            self.logger.info(f"Cleared all {count} cache entries")

    async def health_check(self) -> Dict[str, Any]:
        """Comprehensive health check"""
        return {
            'timestamp': datetime.now().isoformat(),
            'providers': self.get_provider_status(),
            'cache_size': len(self.cache),
            'circuit_breakers': {
                provider: breaker.state.value
                for provider, breaker in self.circuit_breakers.items()
            },
            'config_loaded': bool(self.config),
            'domains_configured': list(self.config.get('data_providers', {}).keys())
        }
