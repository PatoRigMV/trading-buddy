"""
Enhanced Real-Time Data Manager with Multi-API Integration
Combines the existing real-time data functionality with multi-source aggregation
"""

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta


def safe_timestamp_to_iso(timestamp) -> str:
    """Safely convert timestamp to ISO string, handling different input types"""
    if isinstance(timestamp, datetime):
        return timestamp.isoformat()
    elif isinstance(timestamp, (int, float)):
        return datetime.fromtimestamp(timestamp).isoformat()
    else:
        return str(timestamp)
import pandas as pd

from simple_real_time_data import SimpleRealTimeDataManager, MarketData, SimpleTechnicalIndicators
from multi_api_aggregator import MultiAPIAggregator, APICredentials, DataType, DataSource
from redis_cache_manager import get_redis_cache, CacheConfig

@dataclass
class EnhancedMarketData:
    """Enhanced market data with multi-source validation"""
    symbol: str
    price: float
    price_sources: List[str]
    price_confidence: float
    volume: Optional[int] = None
    timestamp: datetime = field(default_factory=datetime.now)
    ohlc: Dict[str, float] = field(default_factory=dict)
    technical_indicators: Optional[SimpleTechnicalIndicators] = None
    fundamentals: Dict[str, Any] = field(default_factory=dict)
    fundamentals_sources: List[str] = field(default_factory=list)
    news_sentiment: Dict[str, Any] = field(default_factory=dict)
    market_cap: Optional[float] = None
    pe_ratio: Optional[float] = None
    beta: Optional[float] = None
    sector: Optional[str] = None
    discrepancy_warnings: List[str] = field(default_factory=list)
    advanced_analytics: Dict[str, Any] = field(default_factory=dict)

class EnhancedRealTimeDataManager:
    def __init__(self, api_credentials: APICredentials = None):
        self.logger = logging.getLogger(__name__)

        # Initialize multi-API aggregator
        self.api_aggregator = MultiAPIAggregator(api_credentials)

        # Keep the existing simple data manager as fallback
        self.fallback_manager = SimpleRealTimeDataManager()

        # Initialize Redis cache for ultra-fast data retrieval
        self.redis_cache = get_redis_cache()

        # Default watchlist
        self.default_symbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA']
        self.watchlist = set(self.default_symbols)

        # Market hours cache
        self.market_hours_cache = None
        self.market_hours_cache_time = None

        self.logger.info("Enhanced Real-Time Data Manager initialized with multi-API support and Redis caching")

    async def initialize(self):
        """Initialize both managers"""
        await self.fallback_manager.initialize()
        self.logger.info("Enhanced data manager initialization complete")

    async def get_current_data(self, symbols: List[str] = None) -> Dict[str, EnhancedMarketData]:
        """Get current market data using Redis cache first, then multi-API aggregation with Polygon batch optimization"""
        if symbols is None:
            symbols = list(self.watchlist)

        self.logger.info(f"Fetching enhanced data for {len(symbols)} symbols: {symbols}")

        enhanced_data = {}
        uncached_symbols = []

        # First, check Redis cache for all symbols
        cache_hits = 0
        for symbol in symbols:
            cached_data = self.redis_cache.get_cached_market_data(symbol)
            if cached_data:
                try:
                    # Convert cached data back to EnhancedMarketData
                    enhanced_data[symbol] = EnhancedMarketData(**cached_data)
                    cache_hits += 1
                except Exception as e:
                    self.logger.warning(f"Cache data corruption for {symbol}, will refetch: {str(e)}")
                    uncached_symbols.append(symbol)
            else:
                uncached_symbols.append(symbol)

        if cache_hits > 0:
            self.logger.info(f"🚀 Redis cache hit for {cache_hits}/{len(symbols)} symbols ({cache_hits/len(symbols)*100:.1f}%)")

        # If we have everything cached, return immediately
        if not uncached_symbols:
            self.logger.info("✅ All data served from Redis cache - zero API calls needed!")
            return enhanced_data

        # Fetch uncached symbols using existing logic
        self.logger.info(f"📡 Fetching {len(uncached_symbols)} uncached symbols from APIs")

        # Check if we have Polygon API available for batch requests
        polygon_client = None
        for client in self.api_aggregator.clients:
            if hasattr(client, 'get_batch_quotes') and hasattr(client, 'api_key') and client.api_key:
                polygon_client = client
                self.logger.info(f"🚀 Using Polygon batch API for {len(uncached_symbols)} symbols")
                break

        # Use Polygon batch endpoint if available
        if polygon_client and len(uncached_symbols) <= 50:  # Polygon supports up to 50 symbols per batch
            try:
                batch_results = await polygon_client.get_batch_quotes(uncached_symbols)
                for symbol, api_response in batch_results.items():
                    if api_response.success and api_response.data:
                        enhanced_market_data = self._convert_polygon_to_enhanced(symbol, api_response.data)
                        enhanced_data[symbol] = enhanced_market_data

                        # Cache the result for future requests
                        self._cache_enhanced_data(symbol, enhanced_market_data)

                self.logger.info(f"✅ Polygon batch fetched {len([s for s in uncached_symbols if s in enhanced_data])} symbols")

                # For any missing symbols, fall back to individual requests
                missing_symbols = set(uncached_symbols) - set(enhanced_data.keys())
                if missing_symbols:
                    self.logger.info(f"🔄 Fetching {len(missing_symbols)} missing symbols individually")
                    fallback_results = await self._get_individual_data_with_cache(list(missing_symbols))
                    enhanced_data.update(fallback_results)

                return enhanced_data

            except Exception as e:
                self.logger.error(f"Polygon batch request failed: {str(e)}, falling back to individual requests")

        # Fallback to individual requests if batch isn't available or fails
        fallback_results = await self._get_individual_data_with_cache(uncached_symbols)
        enhanced_data.update(fallback_results)

        return enhanced_data

    async def _get_individual_data(self, symbols: List[str]) -> Dict[str, EnhancedMarketData]:
        """Get data for symbols individually (fallback method)"""
        # Get data for all symbols concurrently
        tasks = []
        for symbol in symbols:
            task = self._get_enhanced_symbol_data(symbol)
            tasks.append((symbol, task))

        results = await asyncio.gather(*[task for _, task in tasks], return_exceptions=True)

        enhanced_data = {}
        for i, result in enumerate(results):
            symbol = symbols[i]
            if isinstance(result, EnhancedMarketData):
                enhanced_data[symbol] = result
            elif isinstance(result, Exception):
                self.logger.error(f"Error getting data for {symbol}: {str(result)}")
                # Fallback to simple data manager
                try:
                    fallback_data = await self.fallback_manager.get_current_data([symbol])
                    if symbol in fallback_data:
                        enhanced_data[symbol] = self._convert_to_enhanced(fallback_data[symbol])
                except Exception as e:
                    self.logger.error(f"Fallback also failed for {symbol}: {str(e)}")

        self.logger.info(f"Successfully retrieved enhanced data for {len(enhanced_data)} symbols")
        return enhanced_data

    def _convert_polygon_to_enhanced(self, symbol: str, polygon_data: Dict) -> EnhancedMarketData:
        """Convert Polygon API data to EnhancedMarketData format"""
        enhanced_data = EnhancedMarketData(
            symbol=symbol,
            price=polygon_data.get('price', 0.0),
            price_sources=['polygon'],
            price_confidence=0.95,  # High confidence for Polygon real-time data
            volume=polygon_data.get('volume', 0),
            timestamp=datetime.now()
        )

        # Add technical indicators if available
        change_percent = polygon_data.get('change_percent', 0.0)
        if abs(change_percent) > 0:
            enhanced_data.technical_indicators = SimpleTechnicalIndicators(
                price_change_24h=change_percent,
                rsi=50.0,  # Default neutral RSI
                sma_20=polygon_data.get('price', 0.0),  # Use current price as default
                sma_50=polygon_data.get('price', 0.0)
            )

        return enhanced_data

    async def _get_enhanced_symbol_data(self, symbol: str) -> EnhancedMarketData:
        """Get comprehensive data for a single symbol"""
        try:
            # Get comprehensive data with YCharts as primary source
            self.logger.info(f"Fetching comprehensive data for {symbol} using YCharts API")
            comprehensive_data = await self.api_aggregator.get_comprehensive_data(symbol)

            # Start with basic structure
            enhanced_data = EnhancedMarketData(symbol=symbol, price=0.0, price_sources=[], price_confidence=0.0)

            # Process price data
            if DataType.REAL_TIME_PRICE in comprehensive_data:
                price_data = comprehensive_data[DataType.REAL_TIME_PRICE]
                enhanced_data.price = price_data.consensus_value or 0.0
                enhanced_data.price_sources = [src.value for src in price_data.sources]
                enhanced_data.price_confidence = price_data.confidence_score

                if price_data.discrepancy_detected:
                    enhanced_data.discrepancy_warnings.append(f"Price: {price_data.discrepancy_details}")

                # Extract OHLC and volume from source data
                for source, data in price_data.source_data.items():
                    if isinstance(data, dict) and 'metadata' in data:
                        metadata = data['metadata']
                        if 'open' in metadata and metadata['open']:
                            enhanced_data.ohlc['open'] = float(metadata['open'])
                        if 'high' in metadata and metadata['high']:
                            enhanced_data.ohlc['high'] = float(metadata['high'])
                        if 'low' in metadata and metadata['low']:
                            enhanced_data.ohlc['low'] = float(metadata['low'])
                        if 'volume' in metadata and metadata['volume']:
                            enhanced_data.volume = int(metadata['volume'])
                        elif 'regularMarketVolume' in metadata and metadata['regularMarketVolume']:
                            enhanced_data.volume = int(metadata['regularMarketVolume'])

            # Process fundamental data
            if DataType.FUNDAMENTAL in comprehensive_data:
                fund_data = comprehensive_data[DataType.FUNDAMENTAL]
                enhanced_data.fundamentals = fund_data.consensus_value or {}
                enhanced_data.fundamentals_sources = [src.value for src in fund_data.sources]

                # Extract key fundamental metrics
                if isinstance(enhanced_data.fundamentals, dict):
                    enhanced_data.market_cap = self._extract_numeric_value(
                        enhanced_data.fundamentals, ['marketCap', 'MarketCapitalization']
                    )
                    enhanced_data.pe_ratio = self._extract_numeric_value(
                        enhanced_data.fundamentals, ['trailingPE', 'PERatio', 'pe_ratio']
                    )
                    enhanced_data.beta = self._extract_numeric_value(
                        enhanced_data.fundamentals, ['beta', 'Beta']
                    )
                    enhanced_data.sector = enhanced_data.fundamentals.get('sector') or enhanced_data.fundamentals.get('Sector')

            # Process technical indicators (prioritize YCharts data)
            if 'technical' in comprehensive_data and comprehensive_data['technical']:
                tech_data = comprehensive_data['technical']
                if tech_data.consensus_value:
                    # YCharts provides comprehensive technical indicators
                    ycharts_technical = tech_data.consensus_value
                    enhanced_data.advanced_analytics['technical_indicators'] = ycharts_technical
                    self.logger.info(f"Using YCharts technical indicators for {symbol}")

                    # Create SimpleTechnicalIndicators object from YCharts data
                    rsi = ycharts_technical.get('rsi_14')
                    sma_20 = ycharts_technical.get('sma_20')
                    sma_50 = ycharts_technical.get('sma_50')

                    if rsi or sma_20 or sma_50:
                        enhanced_data.technical_indicators = SimpleTechnicalIndicators(
                            rsi=rsi or 50.0,
                            sma_20=sma_20 or enhanced_data.price,
                            sma_50=sma_50 or enhanced_data.price,
                            ema_12=ycharts_technical.get('ema_12', enhanced_data.price),
                            ema_26=ycharts_technical.get('ema_26', enhanced_data.price),
                            volume_sma=enhanced_data.volume or 0,
                            bollinger_upper=ycharts_technical.get('bollinger_upper', enhanced_data.price * 1.02),
                            bollinger_lower=ycharts_technical.get('bollinger_lower', enhanced_data.price * 0.98)
                        )

            # Process sentiment data
            if DataType.NEWS_SENTIMENT in comprehensive_data:
                sentiment_data = comprehensive_data[DataType.NEWS_SENTIMENT]
                enhanced_data.news_sentiment = sentiment_data.consensus_value or {}

            # Fallback to calculated technical indicators if YCharts didn't provide them
            if not enhanced_data.technical_indicators and enhanced_data.price > 0:
                try:
                    # Use fallback manager for technical indicator calculation
                    fallback_data = await self.fallback_manager.get_current_data([symbol])
                    if symbol in fallback_data:
                        enhanced_data.technical_indicators = fallback_data[symbol].technical_indicators
                        self.logger.info(f"Using calculated technical indicators for {symbol}")
                except Exception as e:
                    self.logger.warning(f"Could not calculate technical indicators for {symbol}: {str(e)}")

            return enhanced_data

        except Exception as e:
            self.logger.error(f"Error getting enhanced data for {symbol}: {str(e)}")
            raise

    def _extract_numeric_value(self, data_dict: Dict[str, Any], possible_keys: List[str]) -> Optional[float]:
        """Extract numeric value from dict using multiple possible keys"""
        for key in possible_keys:
            if key in data_dict:
                try:
                    value = data_dict[key]
                    if isinstance(value, (int, float)) and value > 0:
                        return float(value)
                    elif isinstance(value, str):
                        # Try to parse string numbers
                        value = value.replace(',', '').replace('$', '').replace('%', '')
                        return float(value)
                except (ValueError, TypeError):
                    continue
        return None

    def _convert_to_enhanced(self, simple_data: MarketData) -> EnhancedMarketData:
        """Convert simple MarketData to EnhancedMarketData"""
        return EnhancedMarketData(
            symbol=simple_data.symbol,
            price=simple_data.price,
            price_sources=[DataSource.YAHOO_FINANCE.value],
            price_confidence=0.85,
            volume=simple_data.volume,
            timestamp=simple_data.timestamp,
            ohlc=simple_data.ohlc,
            technical_indicators=simple_data.technical_indicators,
            market_cap=simple_data.market_cap,
            pe_ratio=simple_data.pe_ratio,
            beta=simple_data.beta,
            sector=simple_data.sector
        )

    async def get_market_hours_info(self) -> Dict[str, Any]:
        """Get market hours (delegate to fallback manager)"""
        return await self.fallback_manager.get_market_hours_info()

    async def get_top_movers(self) -> Dict[str, List[Dict[str, Any]]]:
        """Get top movers (delegate to fallback manager)"""
        return await self.fallback_manager.get_top_movers()

    def get_watchlist(self) -> List[str]:
        """Get current watchlist"""
        return sorted(list(self.watchlist))

    async def add_to_watchlist(self, symbol: str) -> bool:
        """Add symbol to watchlist"""
        try:
            self.watchlist.add(symbol.upper())
            self.logger.info(f"Added {symbol} to enhanced watchlist")
            return True
        except Exception as e:
            self.logger.error(f"Error adding {symbol} to watchlist: {str(e)}")
            return False

    async def remove_from_watchlist(self, symbol: str) -> bool:
        """Remove symbol from watchlist"""
        try:
            self.watchlist.discard(symbol.upper())
            self.logger.info(f"Removed {symbol} from enhanced watchlist")
            return True
        except Exception as e:
            self.logger.error(f"Error removing {symbol} from watchlist: {str(e)}")
            return False

    async def get_price_with_validation(self, symbol: str) -> Dict[str, Any]:
        """Get price with full source attribution and validation details"""
        price_data = await self.api_aggregator.get_real_time_price(symbol)

        return {
            'symbol': symbol,
            'consensus_price': price_data.consensus_value,
            'sources': [src.value for src in price_data.sources],
            'confidence_score': price_data.confidence_score,
            'discrepancy_detected': price_data.discrepancy_detected,
            'discrepancy_details': price_data.discrepancy_details,
            'source_data': {src.value: data for src, data in price_data.source_data.items()},
            'timestamp': safe_timestamp_to_iso(price_data.timestamp)
        }

    async def get_comprehensive_analysis(self, symbol: str) -> Dict[str, Any]:
        """Get comprehensive analysis combining all data sources"""
        try:
            # Get enhanced data
            enhanced_data = await self._get_enhanced_symbol_data(symbol)

            # Format for comprehensive analysis
            # Safe timestamp handling - convert to datetime if needed
            if isinstance(enhanced_data.timestamp, datetime):
                timestamp_str = enhanced_data.timestamp.isoformat()
            elif isinstance(enhanced_data.timestamp, (int, float)):
                timestamp_str = datetime.fromtimestamp(enhanced_data.timestamp).isoformat()
            else:
                timestamp_str = str(enhanced_data.timestamp)

            analysis = {
                'symbol': symbol,
                'timestamp': timestamp_str,
                'price_analysis': {
                    'current_price': enhanced_data.price,
                    'sources': enhanced_data.price_sources,
                    'confidence': enhanced_data.price_confidence,
                    'warnings': enhanced_data.discrepancy_warnings
                },
                'fundamental_analysis': {
                    'data': enhanced_data.fundamentals,
                    'sources': enhanced_data.fundamentals_sources,
                    'key_metrics': {
                        'market_cap': enhanced_data.market_cap,
                        'pe_ratio': enhanced_data.pe_ratio,
                        'beta': enhanced_data.beta,
                        'sector': enhanced_data.sector
                    }
                },
                'technical_analysis': {},
                'sentiment_analysis': enhanced_data.news_sentiment,
                'advanced_analytics': enhanced_data.advanced_analytics
            }

            # Add technical indicators if available
            if enhanced_data.technical_indicators:
                ti = enhanced_data.technical_indicators
                analysis['technical_analysis'] = {
                    'rsi': ti.rsi,
                    'sma_20': ti.sma_20,
                    'sma_50': ti.sma_50,
                    'ema_12': ti.ema_12,
                    'price_change_24h': ti.price_change_24h,
                    'volatility_20d': ti.volatility_20d,
                    'volume_ratio': (ti.current_volume / ti.avg_volume) if ti.avg_volume else None
                }

            return analysis

        except Exception as e:
            self.logger.error(f"Error getting comprehensive analysis for {symbol}: {str(e)}")
            return {'error': str(e), 'symbol': symbol}

    def get_api_status(self) -> Dict[str, Any]:
        """Get status of all API clients and cache"""
        cache_stats = self.api_aggregator.get_cache_stats()
        redis_stats = self.redis_cache.get_cache_stats()

        return {
            'multi_api_enabled': True,
            'available_sources': [src.value for src in DataSource],
            'cache_stats': cache_stats,
            'redis_cache': redis_stats,
            'watchlist_size': len(self.watchlist),
            'fallback_available': True
        }

    def _cache_enhanced_data(self, symbol: str, enhanced_data: EnhancedMarketData):
        """Cache enhanced market data as dict for Redis storage"""
        try:
            # Convert EnhancedMarketData to dict for caching
            cache_data = {
                'symbol': enhanced_data.symbol,
                'price': enhanced_data.price,
                'price_sources': enhanced_data.price_sources,
                'price_confidence': enhanced_data.price_confidence,
                'volume': enhanced_data.volume,
                'timestamp': safe_timestamp_to_iso(enhanced_data.timestamp),
                'ohlc': enhanced_data.ohlc,
                'technical_indicators': enhanced_data.technical_indicators.__dict__ if enhanced_data.technical_indicators else None,
                'fundamentals': enhanced_data.fundamentals,
                'fundamentals_sources': enhanced_data.fundamentals_sources,
                'news_sentiment': enhanced_data.news_sentiment,
                'market_cap': enhanced_data.market_cap,
                'pe_ratio': enhanced_data.pe_ratio,
                'beta': enhanced_data.beta,
                'sector': enhanced_data.sector,
                'discrepancy_warnings': enhanced_data.discrepancy_warnings,
                'advanced_analytics': enhanced_data.advanced_analytics
            }

            self.redis_cache.cache_market_data(symbol, cache_data)
        except Exception as e:
            self.logger.error(f"Error caching data for {symbol}: {str(e)}")

    async def _get_individual_data_with_cache(self, symbols: List[str]) -> Dict[str, EnhancedMarketData]:
        """Get data for symbols individually with caching (fallback method)"""
        # Get data for all symbols concurrently
        tasks = []
        for symbol in symbols:
            task = self._get_enhanced_symbol_data_with_cache(symbol)
            tasks.append((symbol, task))

        results = await asyncio.gather(*[task for _, task in tasks], return_exceptions=True)

        enhanced_data = {}
        for i, result in enumerate(results):
            symbol = symbols[i]
            if isinstance(result, EnhancedMarketData):
                enhanced_data[symbol] = result
                # Cache the successful result
                self._cache_enhanced_data(symbol, result)
            elif isinstance(result, Exception):
                self.logger.error(f"Error getting data for {symbol}: {str(result)}")
                # Fallback to simple data manager
                try:
                    fallback_data = await self.fallback_manager.get_current_data([symbol])
                    if symbol in fallback_data:
                        enhanced_fallback = self._convert_to_enhanced(fallback_data[symbol])
                        enhanced_data[symbol] = enhanced_fallback
                        self._cache_enhanced_data(symbol, enhanced_fallback)
                except Exception as e:
                    self.logger.error(f"Fallback also failed for {symbol}: {str(e)}")

        self.logger.info(f"Successfully retrieved enhanced data for {len(enhanced_data)} symbols")
        return enhanced_data

    async def _get_enhanced_symbol_data_with_cache(self, symbol: str) -> EnhancedMarketData:
        """Get comprehensive data for a single symbol with caching"""
        try:
            # Check cache first
            cached_data = self.redis_cache.get_cached_market_data(symbol)
            if cached_data:
                try:
                    return EnhancedMarketData(**cached_data)
                except Exception as e:
                    self.logger.warning(f"Cache data corruption for {symbol}, will refetch: {str(e)}")

            # If not cached, fetch using existing method
            result = await self._get_enhanced_symbol_data(symbol)

            # Cache the result
            if result:
                self._cache_enhanced_data(symbol, result)

            return result

        except Exception as e:
            self.logger.error(f"Error getting enhanced data for {symbol}: {str(e)}")
            raise
