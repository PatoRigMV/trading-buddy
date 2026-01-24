"""
HTTP/2 Connection Manager with Connection Pooling
Provides high-performance HTTP connections with multiplexing and persistent connections
"""

import httpx
import asyncio
import logging
from typing import Dict, Any, Optional, List, Union
from datetime import datetime, timedelta
from dataclasses import dataclass, field
import time

@dataclass
class ConnectionPoolConfig:
    """Configuration for HTTP/2 connection pooling"""
    # Connection pool settings
    max_connections: int = 100          # Maximum total connections
    max_keepalive_connections: int = 20 # Keep-alive connections to maintain
    keepalive_expiry: float = 30.0      # Keep-alive timeout in seconds

    # HTTP/2 specific settings
    http2: bool = True                  # Enable HTTP/2
    retries: int = 3                    # Retry attempts
    timeout: float = 30.0               # Request timeout in seconds

    # Connection optimization
    tcp_keepalive: bool = True          # Enable TCP keep-alive
    socket_options: List = field(default_factory=list)

@dataclass
class ConnectionStats:
    """Connection statistics for monitoring"""
    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    average_response_time: float = 0.0
    active_connections: int = 0
    connection_reuse_rate: float = 0.0
    http2_usage_rate: float = 0.0

    def update_request(self, success: bool, response_time: float):
        """Update request statistics"""
        self.total_requests += 1
        if success:
            self.successful_requests += 1
        else:
            self.failed_requests += 1

        # Update average response time using exponential moving average
        alpha = 0.1  # Smoothing factor
        self.average_response_time = (
            alpha * response_time +
            (1 - alpha) * self.average_response_time
        )

class HTTP2ConnectionManager:
    """High-performance HTTP/2 connection manager with connection pooling"""

    def __init__(self, config: ConnectionPoolConfig = None):
        self.config = config or ConnectionPoolConfig()
        self.logger = logging.getLogger(__name__)

        # Connection pools by domain
        self._clients: Dict[str, httpx.AsyncClient] = {}
        self._client_stats: Dict[str, ConnectionStats] = {}

        # Global statistics
        self.global_stats = ConnectionStats()

        # Connection monitoring
        self._last_cleanup = datetime.now()
        self._cleanup_interval = timedelta(minutes=5)

        self.logger.info("HTTP/2 Connection Manager initialized")

    async def _get_or_create_client(self, base_url: str) -> httpx.AsyncClient:
        """Get existing client or create new one for domain"""
        domain = httpx.URL(base_url).host

        if domain not in self._clients:
            # Create new client with optimized settings
            limits = httpx.Limits(
                max_connections=self.config.max_connections,
                max_keepalive_connections=self.config.max_keepalive_connections,
                keepalive_expiry=self.config.keepalive_expiry
            )

            timeout = httpx.Timeout(self.config.timeout)

            client = httpx.AsyncClient(
                limits=limits,
                timeout=timeout,
                http2=self.config.http2,
                verify=True,
                follow_redirects=True,
                trust_env=True
            )

            self._clients[domain] = client
            self._client_stats[domain] = ConnectionStats()

            self.logger.info(f"🚀 Created HTTP/2 client for {domain} with connection pooling")

        return self._clients[domain]

    async def request(
        self,
        method: str,
        url: str,
        headers: Dict[str, str] = None,
        params: Dict[str, Any] = None,
        json_data: Dict[str, Any] = None,
        data: Union[str, bytes] = None,
        stream: bool = False
    ) -> httpx.Response:
        """Make HTTP request with connection pooling and HTTP/2 multiplexing"""
        start_time = time.time()
        domain = httpx.URL(url).host
        success = False

        try:
            client = await self._get_or_create_client(url)

            # Prepare request arguments
            kwargs = {
                'method': method,
                'url': url,
                'headers': headers or {},
                'params': params
            }

            # Only add stream parameter if it's True (httpx default is False)
            if stream:
                kwargs['stream'] = stream

            if json_data:
                kwargs['json'] = json_data
            elif data:
                kwargs['content'] = data

            # Make request with retries
            for attempt in range(self.config.retries + 1):
                try:
                    response = await client.request(**kwargs)

                    # Check for successful status codes
                    if response.is_success:
                        success = True
                        response_time = time.time() - start_time

                        # Update statistics
                        self._client_stats[domain].update_request(True, response_time)
                        self.global_stats.update_request(True, response_time)

                        # Log HTTP version used
                        http_version = getattr(response, 'http_version', 'HTTP/1.1')
                        if http_version.startswith('HTTP/2'):
                            self.logger.debug(f"✅ HTTP/2 request to {domain}: {response.status_code}")

                        return response
                    else:
                        self.logger.warning(f"⚠️ HTTP {response.status_code} from {domain}")
                        if attempt == self.config.retries:
                            # Last attempt failed
                            break
                        await asyncio.sleep(0.5 * (attempt + 1))  # Exponential backoff

                except httpx.RequestError as e:
                    self.logger.warning(f"Request error (attempt {attempt + 1}): {str(e)}")
                    if attempt == self.config.retries:
                        raise
                    await asyncio.sleep(1.0 * (attempt + 1))

            # If we get here, all retries failed
            response_time = time.time() - start_time
            self._client_stats[domain].update_request(False, response_time)
            self.global_stats.update_request(False, response_time)

            raise httpx.HTTPStatusError(
                f"Request failed after {self.config.retries + 1} attempts",
                request=kwargs,
                response=None
            )

        except Exception as e:
            response_time = time.time() - start_time
            if domain in self._client_stats:
                self._client_stats[domain].update_request(False, response_time)
            self.global_stats.update_request(False, response_time)

            self.logger.error(f"❌ Request failed to {domain}: {str(e)}")
            raise

        finally:
            # Periodic cleanup of idle connections
            await self._cleanup_idle_connections()

    async def get(self, url: str, **kwargs) -> httpx.Response:
        """HTTP GET request"""
        return await self.request('GET', url, **kwargs)

    async def post(self, url: str, **kwargs) -> httpx.Response:
        """HTTP POST request"""
        return await self.request('POST', url, **kwargs)

    async def put(self, url: str, **kwargs) -> httpx.Response:
        """HTTP PUT request"""
        return await self.request('PUT', url, **kwargs)

    async def delete(self, url: str, **kwargs) -> httpx.Response:
        """HTTP DELETE request"""
        return await self.request('DELETE', url, **kwargs)

    async def batch_requests(
        self,
        requests: List[Dict[str, Any]],
        max_concurrent: int = 10
    ) -> List[httpx.Response]:
        """Execute multiple requests concurrently with HTTP/2 multiplexing"""
        semaphore = asyncio.Semaphore(max_concurrent)

        async def _bounded_request(req_data):
            async with semaphore:
                method = req_data.pop('method', 'GET')
                url = req_data.pop('url')
                return await self.request(method, url, **req_data)

        self.logger.info(f"🚀 Executing {len(requests)} concurrent HTTP/2 requests")

        tasks = [_bounded_request(req.copy()) for req in requests]
        responses = await asyncio.gather(*tasks, return_exceptions=True)

        # Filter out exceptions and log them
        valid_responses = []
        for i, response in enumerate(responses):
            if isinstance(response, Exception):
                self.logger.error(f"Batch request {i} failed: {str(response)}")
            else:
                valid_responses.append(response)

        self.logger.info(f"✅ Completed {len(valid_responses)}/{len(requests)} batch requests")
        return valid_responses

    async def _cleanup_idle_connections(self):
        """Clean up idle connections periodically"""
        now = datetime.now()
        if now - self._last_cleanup < self._cleanup_interval:
            return

        self._last_cleanup = now
        cleaned_count = 0

        # Close clients with no recent activity
        domains_to_remove = []
        for domain, stats in self._client_stats.items():
            # Simple heuristic: if no requests in last 10 minutes, consider for cleanup
            if stats.total_requests == 0:  # This is a simplified check
                domains_to_remove.append(domain)

        for domain in domains_to_remove:
            if domain in self._clients:
                await self._clients[domain].aclose()
                del self._clients[domain]
                del self._client_stats[domain]
                cleaned_count += 1

        if cleaned_count > 0:
            self.logger.info(f"🧹 Cleaned up {cleaned_count} idle HTTP connections")

    def get_connection_stats(self) -> Dict[str, Any]:
        """Get connection pool statistics"""
        domain_stats = {}
        total_active_connections = 0

        for domain, client in self._clients.items():
            stats = self._client_stats.get(domain, ConnectionStats())

            # Get connection pool info from httpx client
            pool_stats = {
                'total_requests': stats.total_requests,
                'success_rate': (stats.successful_requests / stats.total_requests * 100)
                              if stats.total_requests > 0 else 0,
                'avg_response_time': f"{stats.average_response_time:.3f}s",
                'active_connections': len(getattr(client, '_transport', {}).get('_connections', {})) if hasattr(client, '_transport') else 0
            }

            domain_stats[domain] = pool_stats
            total_active_connections += pool_stats['active_connections']

        return {
            'global_stats': {
                'total_requests': self.global_stats.total_requests,
                'success_rate': f"{(self.global_stats.successful_requests / self.global_stats.total_requests * 100):.1f}%"
                               if self.global_stats.total_requests > 0 else "0%",
                'avg_response_time': f"{self.global_stats.average_response_time:.3f}s",
                'total_clients': len(self._clients),
                'total_active_connections': total_active_connections,
                'http2_enabled': self.config.http2,
                'connection_pooling': True
            },
            'domain_stats': domain_stats,
            'config': {
                'max_connections': self.config.max_connections,
                'keepalive_connections': self.config.max_keepalive_connections,
                'keepalive_expiry': self.config.keepalive_expiry,
                'timeout': self.config.timeout,
                'retries': self.config.retries
            }
        }

    async def close_all(self):
        """Close all client connections"""
        closed_count = 0
        for domain, client in self._clients.items():
            try:
                await client.aclose()
                closed_count += 1
            except Exception as e:
                self.logger.error(f"Error closing client for {domain}: {str(e)}")

        self._clients.clear()
        self._client_stats.clear()

        self.logger.info(f"🔒 Closed {closed_count} HTTP/2 connections")

# Global connection manager instance
_connection_manager = None

def get_connection_manager() -> HTTP2ConnectionManager:
    """Get or create global HTTP/2 connection manager"""
    global _connection_manager
    if _connection_manager is None:
        _connection_manager = HTTP2ConnectionManager()
    return _connection_manager

async def optimize_api_clients():
    """Upgrade existing API clients to use HTTP/2 connection pooling"""
    manager = get_connection_manager()

    # This would be called to upgrade existing clients
    # Implementation would depend on specific API client architecture
    return manager
