"""
Institutional Data Integration Layer
Connects the institutional-grade WebSocket-first ProviderRouter with the front-end
"""

import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field

# Import our institutional components
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'src'))

from src.data.ProviderRouter import ProviderRouter
from src.data.ProviderRegistry import ProviderRegistry
from src.data.types import NormalizedQuote, ProviderName

# Import existing data structures for compatibility
from enhanced_real_time_data import EnhancedMarketData, SimpleTechnicalIndicators

@dataclass
class InstitutionalMarketData:
    """Market data from institutional WebSocket-first router"""
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

    # Institutional-grade fields
    stale: bool = False
    providers_used: List[str] = field(default_factory=list)
    ws_connected: bool = True
    freshness_ms: int = 0
    consensus_confidence: float = 1.0

class InstitutionalDataManager:
    """Integration layer between institutional WebSocket-first router and web front-end"""

    def __init__(self):
        self.logger = logging.getLogger(__name__)

        # Initialize institutional components
        try:
            # Create provider registry with enhanced providers
            self.provider_registry = ProviderRegistry()

            # Initialize WebSocket-first router with institutional configuration
            self.provider_router = ProviderRouter(
                self.provider_registry,
                {
                    'freshness': {
                        'quotesMs': 2000,  # 2 second freshness for quotes
                        'bars1mMs': 60000  # 1 minute freshness for bars
                    },
                    'consensus': {
                        'floor_bps': 5,
                        'spread_multiplier': 2.0,
                        'cap_bps': 15,
                        'min_quorum': 2
                    },
                    'quorumMin': 2
                }
            )

            # Default watchlist (can be updated)
            self.default_symbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA', 'META', 'AMZN', 'BRK-B']
            self.watchlist = set(self.default_symbols)

            self.logger.info("✅ Institutional WebSocket-first data manager initialized successfully")

        except Exception as e:
            self.logger.error(f"❌ Failed to initialize institutional data manager: {str(e)}")
            raise

    async def initialize(self):
        """Initialize the institutional data systems"""
        try:
            # The ProviderRouter initializes WebSocket connections automatically
            self.logger.info("🚀 Institutional data systems ready - WebSocket-first routing active")
            return True
        except Exception as e:
            self.logger.error(f"Failed to initialize institutional systems: {str(e)}")
            return False

    async def get_current_data(self, symbols: Optional[List[str]] = None) -> Dict[str, InstitutionalMarketData]:
        """Get current market data using institutional WebSocket-first routing"""
        if symbols is None:
            symbols = list(self.watchlist)

        result = {}

        try:
            # Get connection status for monitoring
            connection_status = self.provider_router.getConnectionStatus()

            # Fetch quotes using institutional WebSocket-first router
            for symbol in symbols:
                try:
                    # Get quote with WebSocket-first logic, REST fallback, and staleness detection
                    quote_result = await self.provider_router.getQuote(symbol)

                    # Check if we should halt entries due to stale data
                    should_halt = self.provider_router.haltEntriesIfStale(symbol)

                    # Create institutional market data
                    institutional_data = InstitutionalMarketData(
                        symbol=symbol,
                        price=quote_result['mid'] if quote_result['mid'] is not None else 0.0,
                        price_sources=quote_result['providers'],
                        price_confidence=0.95 if not quote_result['stale'] else 0.7,
                        volume=0,  # Would come from detailed quote data
                        timestamp=datetime.now(),
                        stale=quote_result['stale'],
                        providers_used=quote_result['providers'],
                        ws_connected=connection_status['wsConnected'],
                        freshness_ms=0 if not quote_result['stale'] else 5000,  # Estimate based on staleness
                        consensus_confidence=0.95 if len(quote_result['providers']) >= 2 else 0.8,
                        discrepancy_warnings=[] if not should_halt else [f"Data quality issues detected for {symbol}"],
                        advanced_analytics={
                            'institutional_grade': True,
                            'websocket_first': True,
                            'connection_status': connection_status,
                            'entry_halted': should_halt,
                            'quote_staleness': quote_result['stale'],
                            'provider_count': len(quote_result['providers'])
                        }
                    )

                    result[symbol] = institutional_data

                except Exception as e:
                    self.logger.warning(f"Failed to get institutional data for {symbol}: {str(e)}")
                    # Create error data
                    result[symbol] = InstitutionalMarketData(
                        symbol=symbol,
                        price=0.0,
                        price_sources=[],
                        price_confidence=0.0,
                        stale=True,
                        ws_connected=False,
                        discrepancy_warnings=[f"Data fetch error: {str(e)}"],
                        advanced_analytics={
                            'institutional_grade': True,
                            'websocket_first': True,
                            'error': str(e)
                        }
                    )

            self.logger.info(f"📊 Retrieved institutional data for {len(result)} symbols using WebSocket-first routing")
            return result

        except Exception as e:
            self.logger.error(f"❌ Critical error in institutional data fetch: {str(e)}")
            return {}

    async def get_enhanced_symbol_data(self, symbol: str) -> InstitutionalMarketData:
        """Get enhanced data for a single symbol with full institutional features"""
        data_dict = await self.get_current_data([symbol])
        return data_dict.get(symbol)

    def get_connection_status(self) -> Dict[str, Any]:
        """Get institutional WebSocket connection status"""
        try:
            status = self.provider_router.getConnectionStatus()
            return {
                'institutional_grade': True,
                'websocket_first': True,
                'ws_connected': status['wsConnected'],
                'last_heartbeat': status['lastHeartbeat'],
                'reconnect_attempt': status['reconnectAttempt'],
                'cache_size': status['cacheSize'],
                'healthy_providers': status['healthyProviders'],
                'status': 'healthy' if status['wsConnected'] else 'reconnecting'
            }
        except Exception as e:
            return {
                'institutional_grade': True,
                'websocket_first': True,
                'status': 'error',
                'error': str(e)
            }

    def get_watchlist(self) -> List[str]:
        """Get current watchlist"""
        return list(self.watchlist)

    async def add_to_watchlist(self, symbol: str) -> bool:
        """Add symbol to watchlist"""
        try:
            self.watchlist.add(symbol.upper())
            self.logger.info(f"Added {symbol} to institutional watchlist")
            return True
        except Exception as e:
            self.logger.error(f"Failed to add {symbol} to watchlist: {str(e)}")
            return False

    async def remove_from_watchlist(self, symbol: str) -> bool:
        """Remove symbol from watchlist"""
        try:
            self.watchlist.discard(symbol.upper())
            self.logger.info(f"Removed {symbol} from institutional watchlist")
            return True
        except Exception as e:
            self.logger.error(f"Failed to remove {symbol} from watchlist: {str(e)}")
            return False

    def get_api_status(self) -> Dict[str, Any]:
        """Get API status including WebSocket health"""
        connection_status = self.get_connection_status()

        return {
            'institutional_data_manager': {
                'status': 'operational',
                'websocket_first': True,
                'connection_health': connection_status['status']
            },
            'provider_router': connection_status,
            'websocket_health': {
                'connected': connection_status['ws_connected'],
                'last_heartbeat_age_ms': datetime.now().timestamp() * 1000 - connection_status.get('last_heartbeat', 0)
            },
            'provider_registry': {
                'healthy_providers': connection_status.get('healthy_providers', []),
                'provider_count': len(connection_status.get('healthy_providers', []))
            }
        }

    async def get_price_with_validation(self, symbol: str) -> Dict[str, Any]:
        """Get price with full institutional validation"""
        data = await self.get_enhanced_symbol_data(symbol)

        if not data:
            return {'error': f'No data available for {symbol}'}

        return {
            'symbol': data.symbol,
            'price': data.price,
            'sources': data.price_sources,
            'confidence': data.price_confidence,
            'stale': data.stale,
            'providers_used': data.providers_used,
            'ws_connected': data.ws_connected,
            'freshness_ms': data.freshness_ms,
            'consensus_confidence': data.consensus_confidence,
            'warnings': data.discrepancy_warnings,
            'institutional_features': data.advanced_analytics,
            'timestamp': data.timestamp.isoformat()
        }

    async def get_comprehensive_analysis(self, symbol: str) -> Dict[str, Any]:
        """Get comprehensive analysis with institutional-grade data quality"""
        data = await self.get_enhanced_symbol_data(symbol)

        if not data:
            return {'error': f'No analysis available for {symbol}'}

        return {
            'symbol': data.symbol,
            'data_quality': {
                'institutional_grade': True,
                'websocket_first': True,
                'stale': data.stale,
                'confidence': data.price_confidence,
                'provider_count': len(data.providers_used),
                'ws_connected': data.ws_connected
            },
            'price_analysis': {
                'current_price': data.price,
                'sources': data.price_sources,
                'freshness_ms': data.freshness_ms,
                'consensus_confidence': data.consensus_confidence
            },
            'connection_health': {
                'websocket_status': 'connected' if data.ws_connected else 'disconnected',
                'data_freshness': 'fresh' if not data.stale else 'stale',
                'entry_recommendation': 'allowed' if not data.discrepancy_warnings else 'caution'
            },
            'institutional_analytics': data.advanced_analytics,
            'warnings': data.discrepancy_warnings,
            'timestamp': data.timestamp.isoformat()
        }

    def clear_expired_cache(self):
        """Clear expired cache (handled automatically by ProviderRouter)"""
        # The institutional ProviderRouter handles cache management automatically
        # This method is provided for API compatibility
        self.logger.info("Cache management handled automatically by institutional WebSocket-first router")

    def destroy(self):
        """Clean up institutional resources"""
        try:
            if hasattr(self, 'provider_router'):
                self.provider_router.destroy()
            self.logger.info("🔄 Institutional data manager resources cleaned up")
        except Exception as e:
            self.logger.error(f"Error during cleanup: {str(e)}")

# Global instance for easy import
institutional_data_manager = None

def get_institutional_data_manager() -> InstitutionalDataManager:
    """Get or create the global institutional data manager"""
    global institutional_data_manager
    if institutional_data_manager is None:
        institutional_data_manager = InstitutionalDataManager()
    return institutional_data_manager

async def initialize_institutional_systems():
    """Initialize institutional data systems"""
    manager = get_institutional_data_manager()
    return await manager.initialize()
