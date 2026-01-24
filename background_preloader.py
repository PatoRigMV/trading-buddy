"""
Background Data Preloader
Intelligently preloads popular symbols and frequently accessed data to minimize latency
"""

import asyncio
import logging
from typing import Dict, List, Set, Optional, Any, Tuple
from datetime import datetime, timedelta, time as dt_time
from dataclasses import dataclass, field
import json
from collections import defaultdict, Counter
import time

@dataclass
class PreloadConfig:
    """Configuration for background preloading"""
    # Preloading schedule
    market_open: dt_time = dt_time(9, 30)  # 9:30 AM market open
    market_close: dt_time = dt_time(16, 0)  # 4:00 PM market close
    preload_interval: int = 300  # 5 minutes between preloads during market hours
    off_hours_interval: int = 1800  # 30 minutes during off hours

    # Symbol selection
    max_preload_symbols: int = 50  # Maximum symbols to preload
    popular_symbols_weight: float = 0.7  # Weight for popular symbols
    recent_access_weight: float = 0.3  # Weight for recently accessed symbols

    # Data types to preload
    preload_real_time: bool = True
    preload_fundamentals: bool = True
    preload_technical_analysis: bool = True
    preload_news_sentiment: bool = False  # Can be expensive

    # Performance settings
    concurrent_preloads: int = 10  # Concurrent preload operations
    preload_timeout: float = 30.0  # Timeout for each preload operation

@dataclass
class AccessPattern:
    """Tracks access patterns for intelligent preloading"""
    symbol: str
    access_count: int = 0
    last_access: datetime = field(default_factory=datetime.now)
    access_frequency: float = 0.0  # Accesses per hour
    data_types_accessed: Set[str] = field(default_factory=set)

class BackgroundDataPreloader:
    """Intelligent background data preloader"""

    def __init__(self, enhanced_data_manager, config: PreloadConfig = None):
        self.config = config or PreloadConfig()
        self.enhanced_data_manager = enhanced_data_manager
        self.logger = logging.getLogger(__name__)

        # Access tracking
        self.access_patterns: Dict[str, AccessPattern] = {}
        self.access_history: List[Tuple[str, datetime, str]] = []  # (symbol, timestamp, data_type)

        # Popular symbols (S&P 500 most active)
        self.popular_symbols = [
            'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'BRK.B', 'TSLA', 'META',
            'V', 'JPM', 'JNJ', 'WMT', 'PG', 'HD', 'UNH', 'MA', 'DIS', 'BAC',
            'KO', 'NFLX', 'VZ', 'CSCO', 'PFE', 'INTC', 'ADBE', 'CRM', 'ORCL',
            'AMD', 'COST', 'PEP', 'TMO', 'CVX', 'ABT', 'AVGO', 'ACN', 'CMCSA',
            'XOM', 'DHR', 'NKE', 'TXN', 'LLY', 'QCOM', 'LIN', 'HON', 'MCD',
            'NEE', 'UPS', 'BMY', 'PM'
        ]

        # Preloading state
        self.preloading_active = False
        self.last_preload = None
        self.preload_stats = {
            'total_preloads': 0,
            'successful_preloads': 0,
            'cache_hits_generated': 0,
            'average_preload_time': 0.0
        }

        self.logger.info("Background Data Preloader initialized")

    def track_access(self, symbol: str, data_type: str = 'real_time'):
        """Track data access for intelligent preloading"""
        now = datetime.now()

        # Add to access history
        self.access_history.append((symbol, now, data_type))

        # Update access patterns
        if symbol not in self.access_patterns:
            self.access_patterns[symbol] = AccessPattern(symbol=symbol)

        pattern = self.access_patterns[symbol]
        pattern.access_count += 1
        pattern.last_access = now
        pattern.data_types_accessed.add(data_type)

        # Calculate access frequency (simple moving average)
        recent_accesses = [
            access for access in self.access_history
            if access[0] == symbol and access[1] > now - timedelta(hours=1)
        ]
        pattern.access_frequency = len(recent_accesses)

        # Clean old history (keep last 1000 entries)
        if len(self.access_history) > 1000:
            self.access_history = self.access_history[-1000:]

        self.logger.debug(f"📊 Tracked access: {symbol} ({data_type}) - frequency: {pattern.access_frequency}/hr")

    def _calculate_preload_priority(self, symbol: str) -> float:
        """Calculate preload priority score for a symbol"""
        if symbol not in self.access_patterns:
            # Base score for popular symbols
            return 0.5 if symbol in self.popular_symbols else 0.1

        pattern = self.access_patterns[symbol]

        # Popular symbol bonus
        popularity_score = 1.0 if symbol in self.popular_symbols else 0.5

        # Recent access score (decay over time)
        hours_since_access = (datetime.now() - pattern.last_access).total_seconds() / 3600
        recency_score = max(0.1, 1.0 - (hours_since_access / 24))  # Decay over 24 hours

        # Frequency score
        frequency_score = min(1.0, pattern.access_frequency / 10)  # Normalize to 0-1

        # Combined score
        priority_score = (
            self.config.popular_symbols_weight * popularity_score +
            self.config.recent_access_weight * (recency_score + frequency_score)
        )

        return priority_score

    def _get_preload_symbols(self) -> List[str]:
        """Get symbols to preload based on priority"""
        # Calculate priorities for all known symbols
        symbol_priorities = {}

        # Add popular symbols
        for symbol in self.popular_symbols:
            symbol_priorities[symbol] = self._calculate_preload_priority(symbol)

        # Add recently accessed symbols
        for symbol in self.access_patterns:
            symbol_priorities[symbol] = self._calculate_preload_priority(symbol)

        # Sort by priority and take top N
        sorted_symbols = sorted(symbol_priorities.items(), key=lambda x: x[1], reverse=True)
        top_symbols = [symbol for symbol, priority in sorted_symbols[:self.config.max_preload_symbols]]

        self.logger.info(f"🎯 Selected {len(top_symbols)} symbols for preloading based on priority")
        return top_symbols

    def _is_market_hours(self) -> bool:
        """Check if current time is during market hours"""
        now = datetime.now().time()
        return self.config.market_open <= now <= self.config.market_close

    async def _preload_symbol_data(self, symbol: str) -> Dict[str, bool]:
        """Preload data for a single symbol"""
        preload_results = {}
        start_time = time.time()

        try:
            if self.config.preload_real_time:
                try:
                    # This will cache the data in Redis
                    data = await self.enhanced_data_manager.get_current_data([symbol])
                    preload_results['real_time'] = symbol in data
                except Exception as e:
                    self.logger.debug(f"Failed to preload real-time data for {symbol}: {str(e)}")
                    preload_results['real_time'] = False

            if self.config.preload_fundamentals:
                try:
                    # Preload fundamental analysis
                    analysis = await self.enhanced_data_manager.get_comprehensive_analysis(symbol)
                    preload_results['fundamentals'] = 'error' not in analysis
                except Exception as e:
                    self.logger.debug(f"Failed to preload fundamentals for {symbol}: {str(e)}")
                    preload_results['fundamentals'] = False

            preload_time = time.time() - start_time

            # Update stats
            successful_preloads = sum(1 for result in preload_results.values() if result)
            if successful_preloads > 0:
                self.preload_stats['successful_preloads'] += successful_preloads
                self.preload_stats['cache_hits_generated'] += successful_preloads

                # Update average preload time
                alpha = 0.1
                self.preload_stats['average_preload_time'] = (
                    alpha * preload_time +
                    (1 - alpha) * self.preload_stats['average_preload_time']
                )

            self.logger.debug(f"✅ Preloaded {symbol}: {preload_results} in {preload_time:.2f}s")

        except Exception as e:
            self.logger.error(f"❌ Error preloading {symbol}: {str(e)}")
            preload_results['error'] = str(e)

        return preload_results

    async def run_preload_cycle(self):
        """Run a single preload cycle"""
        if self.preloading_active:
            self.logger.debug("⏳ Preload cycle already active, skipping")
            return

        self.preloading_active = True
        cycle_start = time.time()

        try:
            symbols_to_preload = self._get_preload_symbols()

            if not symbols_to_preload:
                self.logger.info("📭 No symbols selected for preloading")
                return

            self.logger.info(f"🚀 Starting preload cycle for {len(symbols_to_preload)} symbols")

            # Use semaphore to limit concurrent preloads
            semaphore = asyncio.Semaphore(self.config.concurrent_preloads)

            async def bounded_preload(symbol):
                async with semaphore:
                    return await self._preload_symbol_data(symbol)

            # Execute preloads concurrently
            tasks = [bounded_preload(symbol) for symbol in symbols_to_preload]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            # Process results
            successful_symbols = 0
            for i, result in enumerate(results):
                symbol = symbols_to_preload[i]
                if isinstance(result, Exception):
                    self.logger.error(f"Preload task failed for {symbol}: {str(result)}")
                elif isinstance(result, dict) and any(result.values()):
                    successful_symbols += 1

            cycle_time = time.time() - cycle_start
            self.preload_stats['total_preloads'] += 1
            self.last_preload = datetime.now()

            self.logger.info(
                f"✅ Preload cycle completed: {successful_symbols}/{len(symbols_to_preload)} symbols "
                f"in {cycle_time:.2f}s"
            )

        except Exception as e:
            self.logger.error(f"❌ Preload cycle failed: {str(e)}")

        finally:
            self.preloading_active = False

    async def start_background_preloading(self):
        """Start the background preloading service"""
        self.logger.info("🎬 Starting background data preloading service")

        while True:
            try:
                # Determine interval based on market hours
                if self._is_market_hours():
                    interval = self.config.preload_interval
                    self.logger.debug("📈 Market hours - using normal preload interval")
                else:
                    interval = self.config.off_hours_interval
                    self.logger.debug("🌙 After hours - using extended preload interval")

                # Run preload cycle
                await self.run_preload_cycle()

                # Wait for next cycle
                await asyncio.sleep(interval)

            except asyncio.CancelledError:
                self.logger.info("🛑 Background preloading cancelled")
                break
            except Exception as e:
                self.logger.error(f"❌ Background preloading error: {str(e)}")
                await asyncio.sleep(60)  # Wait 1 minute before retry

    def get_preload_stats(self) -> Dict[str, Any]:
        """Get preloading statistics"""
        now = datetime.now()

        # Calculate hit rate (approximate)
        total_accesses = sum(pattern.access_count for pattern in self.access_patterns.values())
        estimated_cache_hits = self.preload_stats['cache_hits_generated']
        hit_rate = (estimated_cache_hits / total_accesses * 100) if total_accesses > 0 else 0

        return {
            'status': 'active' if self.preloading_active else 'idle',
            'last_preload': self.last_preload.isoformat() if self.last_preload else 'Never',
            'total_preload_cycles': self.preload_stats['total_preloads'],
            'successful_preloads': self.preload_stats['successful_preloads'],
            'average_preload_time': f"{self.preload_stats['average_preload_time']:.3f}s",
            'estimated_cache_hit_rate': f"{hit_rate:.1f}%",
            'tracked_symbols': len(self.access_patterns),
            'popular_symbols_count': len(self.popular_symbols),
            'max_preload_symbols': self.config.max_preload_symbols,
            'market_hours_active': self._is_market_hours(),
            'config': {
                'preload_interval': self.config.preload_interval,
                'off_hours_interval': self.config.off_hours_interval,
                'concurrent_preloads': self.config.concurrent_preloads,
                'preload_real_time': self.config.preload_real_time,
                'preload_fundamentals': self.config.preload_fundamentals
            }
        }

    def get_access_patterns(self) -> Dict[str, Dict]:
        """Get access patterns for analysis"""
        patterns = {}
        for symbol, pattern in self.access_patterns.items():
            patterns[symbol] = {
                'access_count': pattern.access_count,
                'last_access': pattern.last_access.isoformat(),
                'access_frequency': pattern.access_frequency,
                'data_types': list(pattern.data_types_accessed),
                'priority_score': self._calculate_preload_priority(symbol)
            }

        return patterns

# Global preloader instance
_preloader = None

def get_preloader(enhanced_data_manager=None) -> BackgroundDataPreloader:
    """Get or create global preloader instance"""
    global _preloader
    if _preloader is None and enhanced_data_manager:
        _preloader = BackgroundDataPreloader(enhanced_data_manager)
    return _preloader

def start_preloading_service(enhanced_data_manager):
    """Start the background preloading service"""
    preloader = get_preloader(enhanced_data_manager)
    if preloader:
        # Start the background task
        asyncio.create_task(preloader.start_background_preloading())
        return preloader
    return None
