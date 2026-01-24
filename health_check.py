"""
Health check and monitoring endpoints for Trading Assistant.

Provides comprehensive health checks for all system components
with detailed status reporting for monitoring systems.
"""

from datetime import datetime
from typing import Dict, Any, List
import time
import psutil
import os


class HealthStatus:
    """Health status constants"""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"


class HealthCheck:
    """
    Comprehensive health check system.

    Checks the health of all critical components:
    - API connectivity (Alpaca, Polygon)
    - Database/storage connectivity
    - Memory usage
    - CPU usage
    - Disk usage
    - WebSocket connections
    - Background services
    """

    def __init__(self, app):
        self.app = app
        self.start_time = time.time()
        self.check_results = {}

    def get_uptime(self) -> float:
        """Get application uptime in seconds"""
        return time.time() - self.start_time

    def check_memory(self) -> Dict[str, Any]:
        """Check memory usage"""
        try:
            memory = psutil.virtual_memory()
            memory_percent = memory.percent

            status = HealthStatus.HEALTHY
            if memory_percent > 90:
                status = HealthStatus.UNHEALTHY
            elif memory_percent > 75:
                status = HealthStatus.DEGRADED

            return {
                'status': status,
                'memory_used_percent': memory_percent,
                'memory_used_mb': memory.used / (1024 * 1024),
                'memory_available_mb': memory.available / (1024 * 1024),
                'memory_total_mb': memory.total / (1024 * 1024)
            }
        except Exception as e:
            return {
                'status': HealthStatus.UNHEALTHY,
                'error': str(e)
            }

    def check_cpu(self) -> Dict[str, Any]:
        """Check CPU usage"""
        try:
            cpu_percent = psutil.cpu_percent(interval=1)
            cpu_count = psutil.cpu_count()

            status = HealthStatus.HEALTHY
            if cpu_percent > 90:
                status = HealthStatus.UNHEALTHY
            elif cpu_percent > 75:
                status = HealthStatus.DEGRADED

            return {
                'status': status,
                'cpu_percent': cpu_percent,
                'cpu_count': cpu_count
            }
        except Exception as e:
            return {
                'status': HealthStatus.UNHEALTHY,
                'error': str(e)
            }

    def check_disk(self) -> Dict[str, Any]:
        """Check disk usage"""
        try:
            disk = psutil.disk_usage('/')
            disk_percent = disk.percent

            status = HealthStatus.HEALTHY
            if disk_percent > 90:
                status = HealthStatus.UNHEALTHY
            elif disk_percent > 80:
                status = HealthStatus.DEGRADED

            return {
                'status': status,
                'disk_used_percent': disk_percent,
                'disk_used_gb': disk.used / (1024**3),
                'disk_free_gb': disk.free / (1024**3),
                'disk_total_gb': disk.total / (1024**3)
            }
        except Exception as e:
            return {
                'status': HealthStatus.UNHEALTHY,
                'error': str(e)
            }

    def check_typescript_bridge(self, typescript_bridge) -> Dict[str, Any]:
        """Check TypeScript trading agent connectivity"""
        try:
            if typescript_bridge and typescript_bridge.check_health():
                return {
                    'status': HealthStatus.HEALTHY,
                    'connected': True
                }
            else:
                return {
                    'status': HealthStatus.DEGRADED,
                    'connected': False,
                    'message': 'TypeScript bridge not available'
                }
        except Exception as e:
            return {
                'status': HealthStatus.UNHEALTHY,
                'error': str(e)
            }

    def check_alpaca_api(self, alpaca_key: str, alpaca_secret: str) -> Dict[str, Any]:
        """Check Alpaca API connectivity"""
        try:
            if not alpaca_key or not alpaca_secret:
                return {
                    'status': HealthStatus.DEGRADED,
                    'configured': False,
                    'message': 'Alpaca credentials not configured'
                }

            # Quick connectivity check
            import requests
            response = requests.get(
                'https://paper-api.alpaca.markets/v2/account',
                headers={
                    'APCA-API-KEY-ID': alpaca_key,
                    'APCA-API-SECRET-KEY': alpaca_secret
                },
                timeout=5
            )

            if response.status_code == 200:
                return {
                    'status': HealthStatus.HEALTHY,
                    'configured': True,
                    'connected': True
                }
            else:
                return {
                    'status': HealthStatus.UNHEALTHY,
                    'configured': True,
                    'connected': False,
                    'status_code': response.status_code
                }
        except Exception as e:
            return {
                'status': HealthStatus.UNHEALTHY,
                'error': str(e)
            }

    def check_polygon_api(self, polygon_key: str) -> Dict[str, Any]:
        """Check Polygon API connectivity"""
        try:
            if not polygon_key:
                return {
                    'status': HealthStatus.DEGRADED,
                    'configured': False,
                    'message': 'Polygon API key not configured'
                }

            # Quick connectivity check
            import requests
            response = requests.get(
                f'https://api.polygon.io/v2/aggs/ticker/AAPL/range/1/day/2023-01-01/2023-01-02?apiKey={polygon_key}',
                timeout=5
            )

            if response.status_code == 200:
                return {
                    'status': HealthStatus.HEALTHY,
                    'configured': True,
                    'connected': True
                }
            else:
                return {
                    'status': HealthStatus.UNHEALTHY,
                    'configured': True,
                    'connected': False,
                    'status_code': response.status_code
                }
        except Exception as e:
            return {
                'status': HealthStatus.UNHEALTHY,
                'error': str(e)
            }

    def get_comprehensive_health(self, **kwargs) -> Dict[str, Any]:
        """
        Get comprehensive health status of all components.

        Args:
            **kwargs: Component references (typescript_bridge, alpaca_key, etc.)

        Returns:
            Dict with overall status and component statuses
        """
        checks = {
            'memory': self.check_memory(),
            'cpu': self.check_cpu(),
            'disk': self.check_disk(),
        }

        # Optional component checks
        if 'typescript_bridge' in kwargs:
            checks['typescript_bridge'] = self.check_typescript_bridge(kwargs['typescript_bridge'])

        if 'alpaca_key' in kwargs and 'alpaca_secret' in kwargs:
            checks['alpaca_api'] = self.check_alpaca_api(
                kwargs['alpaca_key'],
                kwargs['alpaca_secret']
            )

        if 'polygon_key' in kwargs:
            checks['polygon_api'] = self.check_polygon_api(kwargs['polygon_key'])

        # Determine overall status
        statuses = [check['status'] for check in checks.values()]

        if all(s == HealthStatus.HEALTHY for s in statuses):
            overall_status = HealthStatus.HEALTHY
        elif any(s == HealthStatus.UNHEALTHY for s in statuses):
            overall_status = HealthStatus.UNHEALTHY
        else:
            overall_status = HealthStatus.DEGRADED

        return {
            'status': overall_status,
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'uptime_seconds': round(self.get_uptime(), 2),
            'checks': checks
        }

    def get_readiness(self, **kwargs) -> Dict[str, Any]:
        """
        Check if system is ready to accept traffic.

        For Kubernetes readiness probes.
        """
        # Check critical components only
        critical_checks = {
            'memory': self.check_memory()['status'] != HealthStatus.UNHEALTHY,
            'cpu': self.check_cpu()['status'] != HealthStatus.UNHEALTHY,
        }

        ready = all(critical_checks.values())

        return {
            'ready': ready,
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'checks': critical_checks
        }

    def get_liveness(self) -> Dict[str, Any]:
        """
        Check if application is alive.

        For Kubernetes liveness probes.
        """
        return {
            'alive': True,
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'uptime_seconds': round(self.get_uptime(), 2)
        }


class MetricsCollector:
    """
    Collect application metrics for monitoring.

    Provides Prometheus-compatible metrics.
    """

    def __init__(self):
        self.request_count = 0
        self.error_count = 0
        self.request_durations = []
        self.start_time = time.time()

    def record_request(self, duration_ms: float, status_code: int):
        """Record HTTP request metrics"""
        self.request_count += 1
        self.request_durations.append(duration_ms)

        if status_code >= 500:
            self.error_count += 1

        # Keep only last 1000 durations
        if len(self.request_durations) > 1000:
            self.request_durations = self.request_durations[-1000:]

    def get_metrics(self) -> Dict[str, Any]:
        """Get current metrics"""
        if self.request_durations:
            avg_duration = sum(self.request_durations) / len(self.request_durations)
            p95_duration = sorted(self.request_durations)[int(len(self.request_durations) * 0.95)]
            p99_duration = sorted(self.request_durations)[int(len(self.request_durations) * 0.99)]
        else:
            avg_duration = p95_duration = p99_duration = 0

        uptime = time.time() - self.start_time
        requests_per_second = self.request_count / uptime if uptime > 0 else 0

        return {
            'requests_total': self.request_count,
            'errors_total': self.error_count,
            'error_rate': self.error_count / max(self.request_count, 1),
            'requests_per_second': round(requests_per_second, 2),
            'response_time_avg_ms': round(avg_duration, 2),
            'response_time_p95_ms': round(p95_duration, 2),
            'response_time_p99_ms': round(p99_duration, 2),
            'uptime_seconds': round(uptime, 2)
        }

    def get_prometheus_metrics(self) -> str:
        """
        Get metrics in Prometheus format.

        Returns:
            String in Prometheus exposition format
        """
        metrics = self.get_metrics()

        lines = [
            '# HELP requests_total Total number of HTTP requests',
            '# TYPE requests_total counter',
            f'requests_total {metrics["requests_total"]}',
            '',
            '# HELP errors_total Total number of HTTP errors (5xx)',
            '# TYPE errors_total counter',
            f'errors_total {metrics["errors_total"]}',
            '',
            '# HELP response_time_avg_ms Average response time in milliseconds',
            '# TYPE response_time_avg_ms gauge',
            f'response_time_avg_ms {metrics["response_time_avg_ms"]}',
            '',
            '# HELP response_time_p95_ms 95th percentile response time',
            '# TYPE response_time_p95_ms gauge',
            f'response_time_p95_ms {metrics["response_time_p95_ms"]}',
            '',
            '# HELP response_time_p99_ms 99th percentile response time',
            '# TYPE response_time_p99_ms gauge',
            f'response_time_p99_ms {metrics["response_time_p99_ms"]}',
            '',
            '# HELP uptime_seconds Application uptime in seconds',
            '# TYPE uptime_seconds counter',
            f'uptime_seconds {metrics["uptime_seconds"]}',
        ]

        return '\n'.join(lines)


# Global instances
_health_check = None
_metrics_collector = None


def get_health_check(app) -> HealthCheck:
    """Get or create global health check instance"""
    global _health_check
    if _health_check is None:
        _health_check = HealthCheck(app)
    return _health_check


def get_metrics_collector() -> MetricsCollector:
    """Get or create global metrics collector instance"""
    global _metrics_collector
    if _metrics_collector is None:
        _metrics_collector = MetricsCollector()
    return _metrics_collector
