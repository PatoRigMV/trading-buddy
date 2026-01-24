"""
Redis Cache Manager for Trading Assistant
Provides high-performance caching for market data, API responses, and computed analytics
"""

import redis
import json
import logging
from typing import Any, Optional, Dict, List
from datetime import datetime, timedelta
import hashlib
import pickle
from dataclasses import dataclass, field

@dataclass
class CacheConfig:
    """Configuration for Redis cache"""
    host: str = 'localhost'
    port: int = 6379
    db: int = 0
    password: Optional[str] = None
    socket_timeout: float = 5.0
    connection_pool_size: int = 20

    # TTL settings (in seconds)
    market_data_ttl: int = 30        # Market data cache for 30 seconds
    api_response_ttl: int = 300      # API responses for 5 minutes
    analytics_ttl: int = 600         # Computed analytics for 10 minutes
    fundamental_ttl: int = 3600      # Fundamental data for 1 hour
    news_ttl: int = 1800            # News data for 30 minutes

class RedisCache:
    """High-performance Redis cache manager with intelligent TTL handling"""

    def __init__(self, config: CacheConfig = None):
        self.config = config or CacheConfig()
        self.logger = logging.getLogger(__name__)
        self.redis_client = None
        self.connection_pool = None
        self._cache_hits = 0
        self._cache_misses = 0

    def initialize(self):
        """Initialize Redis connection with connection pooling"""
        try:
            # Create connection pool for better performance
            self.connection_pool = redis.ConnectionPool(
                host=self.config.host,
                port=self.config.port,
                db=self.config.db,
                password=self.config.password,
                socket_timeout=self.config.socket_timeout,
                max_connections=self.config.connection_pool_size,
                retry_on_timeout=True,
                health_check_interval=30
            )

            self.redis_client = redis.Redis(connection_pool=self.connection_pool)

            # Test connection
            self.redis_client.ping()
            self.logger.info(f"✅ Redis cache initialized successfully at {self.config.host}:{self.config.port}")
            return True

        except redis.ConnectionError as e:
            self.logger.warning(f"⚠️ Redis connection failed: {str(e)}. Cache will be disabled.")
            return False
        except Exception as e:
            self.logger.error(f"❌ Redis initialization error: {str(e)}")
            return False

    def _generate_key(self, prefix: str, *args) -> str:
        """Generate consistent cache key from prefix and arguments"""
        key_parts = [str(arg) for arg in args]
        key_suffix = hashlib.md5("_".join(key_parts).encode()).hexdigest()[:8]
        return f"trading_assistant:{prefix}:{key_suffix}"

    def get(self, key: str) -> Optional[Any]:
        """Get value from cache with automatic deserialization"""
        if not self.redis_client:
            return None

        try:
            cached_data = self.redis_client.get(key)
            if cached_data:
                self._cache_hits += 1
                # Try JSON first, then pickle for complex objects
                try:
                    return json.loads(cached_data)
                except json.JSONDecodeError:
                    return pickle.loads(cached_data)
            else:
                self._cache_misses += 1
                return None

        except Exception as e:
            self.logger.error(f"Cache get error for key {key}: {str(e)}")
            self._cache_misses += 1
            return None

    def set(self, key: str, value: Any, ttl: int = None) -> bool:
        """Set value in cache with automatic serialization"""
        if not self.redis_client:
            return False

        try:
            # Try JSON first for better performance, fallback to pickle
            try:
                serialized_data = json.dumps(value, default=str)
            except (TypeError, ValueError):
                serialized_data = pickle.dumps(value)

            if ttl:
                result = self.redis_client.setex(key, ttl, serialized_data)
            else:
                result = self.redis_client.set(key, serialized_data)

            return bool(result)

        except Exception as e:
            self.logger.error(f"Cache set error for key {key}: {str(e)}")
            return False

    def delete(self, key: str) -> bool:
        """Delete key from cache"""
        if not self.redis_client:
            return False

        try:
            return bool(self.redis_client.delete(key))
        except Exception as e:
            self.logger.error(f"Cache delete error for key {key}: {str(e)}")
            return False

    def exists(self, key: str) -> bool:
        """Check if key exists in cache"""
        if not self.redis_client:
            return False

        try:
            return bool(self.redis_client.exists(key))
        except Exception as e:
            self.logger.error(f"Cache exists error for key {key}: {str(e)}")
            return False

    # Market Data Caching Methods
    def cache_market_data(self, symbol: str, data: Dict) -> bool:
        """Cache market data with appropriate TTL"""
        key = self._generate_key("market_data", symbol)
        return self.set(key, data, self.config.market_data_ttl)

    def get_cached_market_data(self, symbol: str) -> Optional[Dict]:
        """Get cached market data"""
        key = self._generate_key("market_data", symbol)
        return self.get(key)

    def cache_batch_market_data(self, data: Dict[str, Dict]) -> int:
        """Cache multiple symbols' market data efficiently"""
        cached_count = 0

        if not self.redis_client:
            return cached_count

        try:
            # Use pipeline for better performance
            pipe = self.redis_client.pipeline()

            for symbol, symbol_data in data.items():
                key = self._generate_key("market_data", symbol)
                try:
                    serialized_data = json.dumps(symbol_data, default=str)
                    pipe.setex(key, self.config.market_data_ttl, serialized_data)
                    cached_count += 1
                except (TypeError, ValueError):
                    serialized_data = pickle.dumps(symbol_data)
                    pipe.setex(key, self.config.market_data_ttl, serialized_data)
                    cached_count += 1

            pipe.execute()
            self.logger.info(f"🚀 Cached {cached_count} symbols using Redis pipeline")

        except Exception as e:
            self.logger.error(f"Batch cache error: {str(e)}")

        return cached_count

    # API Response Caching
    def cache_api_response(self, api_name: str, endpoint: str, params: Dict, response: Any) -> bool:
        """Cache API response with endpoint-specific TTL"""
        key = self._generate_key("api_response", api_name, endpoint, str(sorted(params.items())))

        # Determine TTL based on endpoint type
        if 'fundamental' in endpoint.lower():
            ttl = self.config.fundamental_ttl
        elif 'news' in endpoint.lower():
            ttl = self.config.news_ttl
        else:
            ttl = self.config.api_response_ttl

        return self.set(key, response, ttl)

    def get_cached_api_response(self, api_name: str, endpoint: str, params: Dict) -> Optional[Any]:
        """Get cached API response"""
        key = self._generate_key("api_response", api_name, endpoint, str(sorted(params.items())))
        return self.get(key)

    # Analytics Caching
    def cache_analytics(self, symbol: str, analysis_type: str, data: Dict) -> bool:
        """Cache computed analytics"""
        key = self._generate_key("analytics", symbol, analysis_type)
        return self.set(key, data, self.config.analytics_ttl)

    def get_cached_analytics(self, symbol: str, analysis_type: str) -> Optional[Dict]:
        """Get cached analytics"""
        key = self._generate_key("analytics", symbol, analysis_type)
        return self.get(key)

    # Cache Statistics and Management
    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache performance statistics"""
        if not self.redis_client:
            return {"status": "disabled"}

        try:
            info = self.redis_client.info()
            total_requests = self._cache_hits + self._cache_misses
            hit_rate = (self._cache_hits / total_requests * 100) if total_requests > 0 else 0

            return {
                "status": "active",
                "hit_rate": f"{hit_rate:.1f}%",
                "hits": self._cache_hits,
                "misses": self._cache_misses,
                "total_requests": total_requests,
                "redis_info": {
                    "connected_clients": info.get("connected_clients", 0),
                    "used_memory_human": info.get("used_memory_human", "N/A"),
                    "keyspace_hits": info.get("keyspace_hits", 0),
                    "keyspace_misses": info.get("keyspace_misses", 0),
                    "total_commands_processed": info.get("total_commands_processed", 0)
                }
            }
        except Exception as e:
            return {"status": "error", "error": str(e)}

    def clear_cache(self, pattern: str = None) -> int:
        """Clear cache entries matching pattern"""
        if not self.redis_client:
            return 0

        try:
            if pattern:
                keys = self.redis_client.keys(f"trading_assistant:{pattern}*")
            else:
                keys = self.redis_client.keys("trading_assistant:*")

            if keys:
                deleted = self.redis_client.delete(*keys)
                self.logger.info(f"🗑️ Cleared {deleted} cache entries")
                return deleted
            return 0

        except Exception as e:
            self.logger.error(f"Cache clear error: {str(e)}")
            return 0

    def warmup_cache(self, symbols: List[str]) -> Dict[str, int]:
        """Warm up cache with popular symbols (placeholder for preloading)"""
        if not self.redis_client:
            return {"status": "disabled"}

        # This would be implemented with actual data fetching in production
        self.logger.info(f"🔥 Cache warmup initiated for {len(symbols)} symbols")

        return {
            "symbols_warmed": len(symbols),
            "cache_keys_created": 0,
            "status": "completed"
        }

    def close(self):
        """Close Redis connections"""
        try:
            if self.connection_pool:
                self.connection_pool.disconnect()
                self.logger.info("Redis connection pool closed")
        except Exception as e:
            self.logger.error(f"Error closing Redis connection: {str(e)}")

# Global cache instance
_redis_cache = None

def get_redis_cache() -> RedisCache:
    """Get or create global Redis cache instance"""
    global _redis_cache
    if _redis_cache is None:
        _redis_cache = RedisCache()
        _redis_cache.initialize()
    return _redis_cache
