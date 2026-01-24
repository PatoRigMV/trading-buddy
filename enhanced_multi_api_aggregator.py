"""
Enhanced Multi-API Aggregator with Professional Domain-Specific Routing
Integrates with ProviderRouter for execution-grade data reliability
"""

import asyncio
import aiohttp
import logging
import json
import time
import websockets
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, field
from enum import Enum

from provider_router import ProviderRouter, DataDomain, ProviderResponse, ValidationResult

# Enhanced data types
@dataclass
class EnhancedDataPoint:
    """Enhanced data point with validation and attribution"""
    symbol: str
    domain: DataDomain
    data: Any
    timestamp: datetime
    providers_used: List[str]
    validation_result: ValidationResult
    latency_ms: float
    confidence_score: float
    is_source_of_truth: bool = False
    metadata: Dict[str, Any] = field(default_factory=dict)

class MarketDataType(Enum):
    REAL_TIME_QUOTE = "real_time_quote"
    INTRADAY_BARS = "intraday_bars"
    CORPORATE_ACTIONS = "corporate_actions"
    FUNDAMENTAL_METRICS = "fundamental_metrics"
    NEWS_SENTIMENT = "news_sentiment"
    SOCIAL_SENTIMENT = "social_sentiment"
    MACRO_INDICATORS = "macro_indicators"

class EnhancedMultiAPIAggregator:
    """Professional-grade multi-API aggregator with domain-specific routing"""

    def __init__(self, config_path: str = "data_providers.yaml"):
        self.logger = logging.getLogger(__name__)
        self.router = ProviderRouter(config_path)
        self.session = None

        # Market hours tracking
        self.market_hours = {
            'is_open': False,
            'next_open': None,
            'next_close': None,
            'extended_hours': False
        }

        # Execution guards
        self.execution_guards = {
            'halts': set(),  # Symbols currently halted
            'luld_events': {},  # Symbol -> LULD status
            'earnings_blackout': set(),  # Symbols in earnings blackout
            'wide_spreads': set()  # Symbols with wide spreads
        }

        self.logger.info("Enhanced Multi-API Aggregator initialized")

    async def __aenter__(self):
        """Async context manager entry"""
        self.session = aiohttp.ClientSession()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        if self.session:
            await self.session.close()

    # CORE DATA RETRIEVAL METHODS

    async def get_real_time_quote(self, symbol: str, validate: bool = True) -> EnhancedDataPoint:
        """Get real-time quote with cross-provider validation"""
        try:
            # Get primary data
            primary_response = await self.router.get_data(DataDomain.PRICES, symbol)

            responses = [primary_response]

            # Get additional data for validation if requested
            if validate:
                secondary_responses = await self._get_validation_data(DataDomain.PRICES, symbol, exclude_provider=primary_response.provider)
                responses.extend(secondary_responses)

            # Validate across providers
            validation_result = await self.router.validate_cross_provider_data(DataDomain.PRICES, symbol, responses)

            # Create enhanced data point
            data_point = EnhancedDataPoint(
                symbol=symbol,
                domain=DataDomain.PRICES,
                data=validation_result.consensus_value or primary_response.data,
                timestamp=primary_response.timestamp,
                providers_used=[r.provider for r in responses],
                validation_result=validation_result,
                latency_ms=primary_response.latency_ms,
                confidence_score=validation_result.confidence,
                is_source_of_truth=primary_response.source_of_truth,
                metadata={
                    'market_hours_check': self._is_market_hours_valid(),
                    'execution_guards': self._check_execution_guards(symbol)
                }
            )

            # Update execution guards based on data
            await self._update_execution_guards(symbol, data_point)

            return data_point

        except Exception as e:
            self.logger.error(f"Failed to get real-time quote for {symbol}: {e}")
            raise

    async def get_fundamental_data(self, symbol: str, validate: bool = True) -> EnhancedDataPoint:
        """Get fundamental data with cross-provider validation"""
        try:
            primary_response = await self.router.get_data(DataDomain.FUNDAMENTALS, symbol)
            responses = [primary_response]

            if validate:
                secondary_responses = await self._get_validation_data(DataDomain.FUNDAMENTALS, symbol, exclude_provider=primary_response.provider)
                responses.extend(secondary_responses)

            validation_result = await self.router.validate_cross_provider_data(DataDomain.FUNDAMENTALS, symbol, responses)

            return EnhancedDataPoint(
                symbol=symbol,
                domain=DataDomain.FUNDAMENTALS,
                data=validation_result.consensus_value or primary_response.data,
                timestamp=primary_response.timestamp,
                providers_used=[r.provider for r in responses],
                validation_result=validation_result,
                latency_ms=primary_response.latency_ms,
                confidence_score=validation_result.confidence,
                is_source_of_truth=primary_response.source_of_truth
            )

        except Exception as e:
            self.logger.error(f"Failed to get fundamental data for {symbol}: {e}")
            raise

    async def get_corporate_actions(self, symbol: str) -> EnhancedDataPoint:
        """Get corporate actions (splits, dividends, halts)"""
        try:
            primary_response = await self.router.get_data(DataDomain.CORPORATE_ACTIONS, symbol)

            # Corporate actions require confirmation from secondary source
            secondary_responses = await self._get_validation_data(DataDomain.CORPORATE_ACTIONS, symbol, exclude_provider=primary_response.provider)

            all_responses = [primary_response] + secondary_responses
            validation_result = await self.router.validate_cross_provider_data(DataDomain.CORPORATE_ACTIONS, symbol, all_responses)

            data_point = EnhancedDataPoint(
                symbol=symbol,
                domain=DataDomain.CORPORATE_ACTIONS,
                data=validation_result.consensus_value or primary_response.data,
                timestamp=primary_response.timestamp,
                providers_used=[r.provider for r in all_responses],
                validation_result=validation_result,
                latency_ms=primary_response.latency_ms,
                confidence_score=validation_result.confidence,
                metadata={'requires_confirmation': True}
            )

            # Update execution guards for halts/LULD
            await self._process_corporate_actions(symbol, data_point)

            return data_point

        except Exception as e:
            self.logger.error(f"Failed to get corporate actions for {symbol}: {e}")
            raise

    async def get_news_sentiment(self, symbol: str, company_name: str = None) -> EnhancedDataPoint:
        """Get news and sentiment analysis"""
        try:
            primary_response = await self.router.get_data(DataDomain.NEWS, symbol, company_name=company_name)

            return EnhancedDataPoint(
                symbol=symbol,
                domain=DataDomain.NEWS,
                data=primary_response.data,
                timestamp=primary_response.timestamp,
                providers_used=[primary_response.provider],
                validation_result=ValidationResult(passed=True, confidence=0.8),
                latency_ms=primary_response.latency_ms,
                confidence_score=0.8,
                metadata={'company_name': company_name}
            )

        except Exception as e:
            self.logger.error(f"Failed to get news sentiment for {symbol}: {e}")
            raise

    async def get_social_sentiment(self, symbol: str) -> EnhancedDataPoint:
        """Get social media sentiment"""
        try:
            primary_response = await self.router.get_data(DataDomain.SENTIMENT, symbol)

            return EnhancedDataPoint(
                symbol=symbol,
                domain=DataDomain.SENTIMENT,
                data=primary_response.data,
                timestamp=primary_response.timestamp,
                providers_used=[primary_response.provider],
                validation_result=ValidationResult(passed=True, confidence=0.7),
                latency_ms=primary_response.latency_ms,
                confidence_score=0.7
            )

        except Exception as e:
            self.logger.error(f"Failed to get social sentiment for {symbol}: {e}")
            raise

    async def get_macro_indicators(self, indicators: List[str]) -> Dict[str, EnhancedDataPoint]:
        """Get macro economic indicators"""
        results = {}

        for indicator in indicators:
            try:
                response = await self.router.get_data(DataDomain.MACRO, indicator)

                results[indicator] = EnhancedDataPoint(
                    symbol=indicator,
                    domain=DataDomain.MACRO,
                    data=response.data,
                    timestamp=response.timestamp,
                    providers_used=[response.provider],
                    validation_result=ValidationResult(passed=True, confidence=0.9),
                    latency_ms=response.latency_ms,
                    confidence_score=0.9
                )

            except Exception as e:
                self.logger.error(f"Failed to get macro indicator {indicator}: {e}")
                continue

        return results

    # BATCH OPERATIONS

    async def get_multiple_quotes(self, symbols: List[str], validate: bool = False) -> Dict[str, EnhancedDataPoint]:
        """Get multiple real-time quotes efficiently"""
        tasks = []
        for symbol in symbols:
            task = asyncio.create_task(self.get_real_time_quote(symbol, validate))
            tasks.append((symbol, task))

        results = {}
        for symbol, task in tasks:
            try:
                result = await task
                results[symbol] = result
            except Exception as e:
                self.logger.error(f"Failed to get quote for {symbol}: {e}")
                continue

        return results

    async def get_comprehensive_analysis(self, symbol: str) -> Dict[str, EnhancedDataPoint]:
        """Get comprehensive analysis combining all data types"""
        tasks = {
            'quote': asyncio.create_task(self.get_real_time_quote(symbol)),
            'fundamentals': asyncio.create_task(self.get_fundamental_data(symbol)),
            'corporate_actions': asyncio.create_task(self.get_corporate_actions(symbol)),
            'news_sentiment': asyncio.create_task(self.get_news_sentiment(symbol)),
            'social_sentiment': asyncio.create_task(self.get_social_sentiment(symbol))
        }

        results = {}
        for data_type, task in tasks.items():
            try:
                result = await task
                results[data_type] = result
            except Exception as e:
                self.logger.error(f"Failed to get {data_type} for {symbol}: {e}")
                continue

        return results

    # VALIDATION AND HELPERS

    async def _get_validation_data(self, domain: DataDomain, symbol: str, exclude_provider: str = None, max_providers: int = 2) -> List[ProviderResponse]:
        """Get additional data from other providers for validation"""
        domain_config = self.router.config['data_providers'][domain.value]
        hierarchy = self.router._get_provider_hierarchy(domain_config)

        # Skip the primary provider and get next available
        validation_providers = [p for p in hierarchy if p != exclude_provider][:max_providers]

        tasks = []
        for provider in validation_providers:
            # Skip if circuit breaker is open
            if not self.router.circuit_breakers[provider].can_attempt():
                continue

            task = asyncio.create_task(self._get_from_specific_provider(provider, domain, symbol))
            tasks.append(task)

        responses = []
        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for result in results:
                if isinstance(result, ProviderResponse):
                    responses.append(result)

        return responses

    async def _get_from_specific_provider(self, provider: str, domain: DataDomain, symbol: str) -> Optional[ProviderResponse]:
        """Get data from a specific provider"""
        try:
            # Rate limit check
            if provider in self.router.rate_limiters:
                await self.router.rate_limiters[provider].wait_if_needed()

            start_time = time.time()
            data = await self.router._fetch_from_provider(provider, domain, symbol)
            latency_ms = (time.time() - start_time) * 1000

            if data:
                return ProviderResponse(
                    domain=domain,
                    provider=provider,
                    data=data,
                    timestamp=datetime.now(),
                    latency_ms=latency_ms
                )
        except Exception as e:
            self.logger.debug(f"Validation request failed for {provider}: {e}")

        return None

    # EXECUTION GUARDS

    def _is_market_hours_valid(self) -> Dict[str, Any]:
        """Check if current time is within valid trading hours"""
        now = datetime.now()

        # Basic market hours check (9:30 AM - 4:00 PM ET)
        # This should be enhanced with proper timezone handling
        market_open = now.replace(hour=9, minute=30, second=0, microsecond=0)
        market_close = now.replace(hour=16, minute=0, second=0, microsecond=0)

        is_market_hours = market_open <= now <= market_close
        is_weekday = now.weekday() < 5  # Monday = 0, Friday = 4

        return {
            'is_market_hours': is_market_hours and is_weekday,
            'is_extended_hours': not is_market_hours and is_weekday,
            'current_time': now.isoformat()
        }

    def _check_execution_guards(self, symbol: str) -> Dict[str, Any]:
        """Check execution guards for a symbol"""
        return {
            'is_halted': symbol in self.execution_guards['halts'],
            'has_luld_event': symbol in self.execution_guards['luld_events'],
            'in_earnings_blackout': symbol in self.execution_guards['earnings_blackout'],
            'has_wide_spread': symbol in self.execution_guards['wide_spreads']
        }

    async def _update_execution_guards(self, symbol: str, data_point: EnhancedDataPoint):
        """Update execution guards based on market data"""
        if data_point.domain == DataDomain.PRICES and data_point.data:
            # Check spread width
            if 'bid' in data_point.data and 'ask' in data_point.data:
                bid = float(data_point.data['bid'])
                ask = float(data_point.data['ask'])
                mid = (bid + ask) / 2
                spread_bps = ((ask - bid) / mid) * 10000

                max_spread = self.router.config.get('execution_guards', {}).get('max_spread_bps', 50)

                if spread_bps > max_spread:
                    self.execution_guards['wide_spreads'].add(symbol)
                else:
                    self.execution_guards['wide_spreads'].discard(symbol)

    async def _process_corporate_actions(self, symbol: str, data_point: EnhancedDataPoint):
        """Process corporate actions and update guards"""
        if data_point.data and isinstance(data_point.data, dict):
            # Check for halt status
            if data_point.data.get('is_halted'):
                self.execution_guards['halts'].add(symbol)
                self.logger.warning(f"Trading halt detected for {symbol}")
            else:
                self.execution_guards['halts'].discard(symbol)

            # Check for LULD events
            luld_status = data_point.data.get('luld_status')
            if luld_status:
                self.execution_guards['luld_events'][symbol] = luld_status
                self.logger.warning(f"LULD event for {symbol}: {luld_status}")
            elif symbol in self.execution_guards['luld_events']:
                del self.execution_guards['luld_events'][symbol]

    # STATUS AND MONITORING

    async def get_system_status(self) -> Dict[str, Any]:
        """Get comprehensive system status"""
        provider_health = await self.router.health_check()

        return {
            'timestamp': datetime.now().isoformat(),
            'provider_router': provider_health,
            'execution_guards': {
                'halted_symbols': list(self.execution_guards['halts']),
                'luld_events_count': len(self.execution_guards['luld_events']),
                'earnings_blackout_count': len(self.execution_guards['earnings_blackout']),
                'wide_spreads_count': len(self.execution_guards['wide_spreads'])
            },
            'market_hours': self.market_hours,
            'session_active': self.session is not None and not self.session.closed
        }

    def clear_execution_guards(self, symbol: Optional[str] = None):
        """Clear execution guards for symbol or all symbols"""
        if symbol:
            self.execution_guards['halts'].discard(symbol)
            self.execution_guards['luld_events'].pop(symbol, None)
            self.execution_guards['earnings_blackout'].discard(symbol)
            self.execution_guards['wide_spreads'].discard(symbol)
            self.logger.info(f"Cleared execution guards for {symbol}")
        else:
            for guard_set in self.execution_guards.values():
                if isinstance(guard_set, set):
                    guard_set.clear()
                elif isinstance(guard_set, dict):
                    guard_set.clear()
            self.logger.info("Cleared all execution guards")

    def can_trade_symbol(self, symbol: str) -> Tuple[bool, List[str]]:
        """Check if symbol is safe to trade based on execution guards"""
        guards = self._check_execution_guards(symbol)
        reasons = []

        if guards['is_halted']:
            reasons.append("Symbol is halted")

        if guards['has_luld_event']:
            reasons.append("LULD event active")

        if guards['in_earnings_blackout']:
            reasons.append("Earnings blackout period")

        if guards['has_wide_spread']:
            reasons.append("Spread too wide")

        market_status = self._is_market_hours_valid()
        if not market_status['is_market_hours'] and not market_status['is_extended_hours']:
            reasons.append("Market closed")

        can_trade = len(reasons) == 0
        return can_trade, reasons

    async def close(self):
        """Clean shutdown"""
        if self.session and not self.session.closed:
            await self.session.close()

        # Close any WebSocket connections
        for ws in getattr(self, 'ws_connections', {}).values():
            if hasattr(ws, 'close'):
                await ws.close()

        self.logger.info("Enhanced Multi-API Aggregator shutdown complete")
