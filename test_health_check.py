"""
Unit tests for health check and metrics collection.

Tests the HealthCheck and MetricsCollector classes that provide
monitoring and observability for the trading assistant.
"""

import pytest
import time
from unittest.mock import Mock, patch, MagicMock
from health_check import (
    HealthStatus,
    HealthCheck,
    MetricsCollector,
    get_health_check,
    get_metrics_collector
)


class TestHealthStatus:
    """Test health status constants"""

    def test_health_status_constants(self):
        """Test that health status constants are defined"""
        assert HealthStatus.HEALTHY == "healthy"
        assert HealthStatus.DEGRADED == "degraded"
        assert HealthStatus.UNHEALTHY == "unhealthy"


class TestHealthCheck:
    """Test HealthCheck class"""

    @pytest.fixture
    def app(self):
        """Create mock Flask app"""
        return Mock()

    @pytest.fixture
    def health_check(self, app):
        """Create HealthCheck instance"""
        return HealthCheck(app)

    def test_initialization(self, health_check):
        """Test HealthCheck initialization"""
        assert health_check.app is not None
        assert health_check.start_time > 0
        assert isinstance(health_check.check_results, dict)

    def test_get_uptime(self, health_check):
        """Test uptime calculation"""
        time.sleep(0.1)
        uptime = health_check.get_uptime()
        assert uptime >= 0.1
        assert uptime < 1.0  # Should be very recent

    def test_check_memory_healthy(self, health_check):
        """Test memory check with healthy status"""
        with patch('health_check.psutil.virtual_memory') as mock_memory:
            mock_memory.return_value = Mock(
                percent=50.0,
                used=4 * 1024**3,  # 4GB
                available=4 * 1024**3,  # 4GB
                total=8 * 1024**3  # 8GB
            )

            result = health_check.check_memory()

            assert result['status'] == HealthStatus.HEALTHY
            assert result['memory_used_percent'] == 50.0
            assert 'memory_used_mb' in result
            assert 'memory_available_mb' in result

    def test_check_memory_degraded(self, health_check):
        """Test memory check with degraded status (75-90%)"""
        with patch('health_check.psutil.virtual_memory') as mock_memory:
            mock_memory.return_value = Mock(
                percent=80.0,
                used=6.4 * 1024**3,
                available=1.6 * 1024**3,
                total=8 * 1024**3
            )

            result = health_check.check_memory()

            assert result['status'] == HealthStatus.DEGRADED
            assert result['memory_used_percent'] == 80.0

    def test_check_memory_unhealthy(self, health_check):
        """Test memory check with unhealthy status (>90%)"""
        with patch('health_check.psutil.virtual_memory') as mock_memory:
            mock_memory.return_value = Mock(
                percent=95.0,
                used=7.6 * 1024**3,
                available=0.4 * 1024**3,
                total=8 * 1024**3
            )

            result = health_check.check_memory()

            assert result['status'] == HealthStatus.UNHEALTHY
            assert result['memory_used_percent'] == 95.0

    def test_check_memory_error(self, health_check):
        """Test memory check error handling"""
        with patch('health_check.psutil.virtual_memory', side_effect=Exception("Test error")):
            result = health_check.check_memory()

            assert result['status'] == HealthStatus.UNHEALTHY
            assert 'error' in result

    def test_check_cpu_healthy(self, health_check):
        """Test CPU check with healthy status"""
        with patch('health_check.psutil.cpu_percent', return_value=30.0):
            with patch('health_check.psutil.cpu_count', return_value=8):
                result = health_check.check_cpu()

                assert result['status'] == HealthStatus.HEALTHY
                assert result['cpu_percent'] == 30.0
                assert result['cpu_count'] == 8

    def test_check_cpu_degraded(self, health_check):
        """Test CPU check with degraded status (75-90%)"""
        with patch('health_check.psutil.cpu_percent', return_value=80.0):
            with patch('health_check.psutil.cpu_count', return_value=8):
                result = health_check.check_cpu()

                assert result['status'] == HealthStatus.DEGRADED
                assert result['cpu_percent'] == 80.0

    def test_check_cpu_unhealthy(self, health_check):
        """Test CPU check with unhealthy status (>90%)"""
        with patch('health_check.psutil.cpu_percent', return_value=95.0):
            with patch('health_check.psutil.cpu_count', return_value=8):
                result = health_check.check_cpu()

                assert result['status'] == HealthStatus.UNHEALTHY

    def test_check_disk_healthy(self, health_check):
        """Test disk check with healthy status"""
        with patch('health_check.psutil.disk_usage') as mock_disk:
            mock_disk.return_value = Mock(
                percent=50.0,
                used=500 * 1024**3,  # 500GB
                free=500 * 1024**3,  # 500GB
                total=1000 * 1024**3  # 1TB
            )

            result = health_check.check_disk()

            assert result['status'] == HealthStatus.HEALTHY
            assert result['disk_used_percent'] == 50.0
            assert 'disk_used_gb' in result
            assert 'disk_free_gb' in result

    def test_check_disk_degraded(self, health_check):
        """Test disk check with degraded status (80-90%)"""
        with patch('health_check.psutil.disk_usage') as mock_disk:
            mock_disk.return_value = Mock(
                percent=85.0,
                used=850 * 1024**3,
                free=150 * 1024**3,
                total=1000 * 1024**3
            )

            result = health_check.check_disk()

            assert result['status'] == HealthStatus.DEGRADED

    def test_check_disk_unhealthy(self, health_check):
        """Test disk check with unhealthy status (>90%)"""
        with patch('health_check.psutil.disk_usage') as mock_disk:
            mock_disk.return_value = Mock(
                percent=95.0,
                used=950 * 1024**3,
                free=50 * 1024**3,
                total=1000 * 1024**3
            )

            result = health_check.check_disk()

            assert result['status'] == HealthStatus.UNHEALTHY

    def test_check_typescript_bridge_healthy(self, health_check):
        """Test TypeScript bridge check when healthy"""
        mock_bridge = Mock()
        mock_bridge.check_health.return_value = True

        result = health_check.check_typescript_bridge(mock_bridge)

        assert result['status'] == HealthStatus.HEALTHY
        assert result['connected'] is True

    def test_check_typescript_bridge_degraded(self, health_check):
        """Test TypeScript bridge check when not available"""
        mock_bridge = Mock()
        mock_bridge.check_health.return_value = False

        result = health_check.check_typescript_bridge(mock_bridge)

        assert result['status'] == HealthStatus.DEGRADED
        assert result['connected'] is False

    def test_check_typescript_bridge_none(self, health_check):
        """Test TypeScript bridge check when None"""
        result = health_check.check_typescript_bridge(None)

        assert result['status'] == HealthStatus.DEGRADED
        assert result['connected'] is False

    def test_check_alpaca_api_healthy(self, health_check):
        """Test Alpaca API check when healthy"""
        with patch('requests.get') as mock_get:
            mock_response = Mock()
            mock_response.status_code = 200
            mock_get.return_value = mock_response

            result = health_check.check_alpaca_api('test_key', 'test_secret')

            assert result['status'] == HealthStatus.HEALTHY
            assert result['configured'] is True
            assert result['connected'] is True

    def test_check_alpaca_api_not_configured(self, health_check):
        """Test Alpaca API check when not configured"""
        result = health_check.check_alpaca_api('', '')

        assert result['status'] == HealthStatus.DEGRADED
        assert result['configured'] is False

    def test_check_alpaca_api_connection_failed(self, health_check):
        """Test Alpaca API check when connection fails"""
        with patch('requests.get') as mock_get:
            mock_response = Mock()
            mock_response.status_code = 401
            mock_get.return_value = mock_response

            result = health_check.check_alpaca_api('test_key', 'test_secret')

            assert result['status'] == HealthStatus.UNHEALTHY
            assert result['connected'] is False

    def test_check_polygon_api_healthy(self, health_check):
        """Test Polygon API check when healthy"""
        with patch('requests.get') as mock_get:
            mock_response = Mock()
            mock_response.status_code = 200
            mock_get.return_value = mock_response

            result = health_check.check_polygon_api('test_key')

            assert result['status'] == HealthStatus.HEALTHY
            assert result['configured'] is True
            assert result['connected'] is True

    def test_check_polygon_api_not_configured(self, health_check):
        """Test Polygon API check when not configured"""
        result = health_check.check_polygon_api('')

        assert result['status'] == HealthStatus.DEGRADED
        assert result['configured'] is False

    def test_get_comprehensive_health_all_healthy(self, health_check):
        """Test comprehensive health when all systems healthy"""
        with patch.object(health_check, 'check_memory', return_value={'status': HealthStatus.HEALTHY}):
            with patch.object(health_check, 'check_cpu', return_value={'status': HealthStatus.HEALTHY}):
                with patch.object(health_check, 'check_disk', return_value={'status': HealthStatus.HEALTHY}):
                    result = health_check.get_comprehensive_health()

                    assert result['status'] == HealthStatus.HEALTHY
                    assert 'timestamp' in result
                    assert 'uptime_seconds' in result
                    assert 'checks' in result
                    assert 'memory' in result['checks']
                    assert 'cpu' in result['checks']
                    assert 'disk' in result['checks']

    def test_get_comprehensive_health_one_unhealthy(self, health_check):
        """Test comprehensive health when one system unhealthy"""
        with patch.object(health_check, 'check_memory', return_value={'status': HealthStatus.HEALTHY}):
            with patch.object(health_check, 'check_cpu', return_value={'status': HealthStatus.UNHEALTHY}):
                with patch.object(health_check, 'check_disk', return_value={'status': HealthStatus.HEALTHY}):
                    result = health_check.get_comprehensive_health()

                    assert result['status'] == HealthStatus.UNHEALTHY

    def test_get_comprehensive_health_one_degraded(self, health_check):
        """Test comprehensive health when one system degraded"""
        with patch.object(health_check, 'check_memory', return_value={'status': HealthStatus.HEALTHY}):
            with patch.object(health_check, 'check_cpu', return_value={'status': HealthStatus.DEGRADED}):
                with patch.object(health_check, 'check_disk', return_value={'status': HealthStatus.HEALTHY}):
                    result = health_check.get_comprehensive_health()

                    assert result['status'] == HealthStatus.DEGRADED

    def test_get_readiness_ready(self, health_check):
        """Test readiness probe when ready"""
        with patch.object(health_check, 'check_memory', return_value={'status': HealthStatus.HEALTHY}):
            with patch.object(health_check, 'check_cpu', return_value={'status': HealthStatus.DEGRADED}):
                result = health_check.get_readiness()

                assert result['ready'] is True
                assert 'timestamp' in result

    def test_get_readiness_not_ready(self, health_check):
        """Test readiness probe when not ready"""
        with patch.object(health_check, 'check_memory', return_value={'status': HealthStatus.UNHEALTHY}):
            with patch.object(health_check, 'check_cpu', return_value={'status': HealthStatus.HEALTHY}):
                result = health_check.get_readiness()

                assert result['ready'] is False

    def test_get_liveness(self, health_check):
        """Test liveness probe"""
        time.sleep(0.1)
        result = health_check.get_liveness()

        assert result['alive'] is True
        assert 'timestamp' in result
        assert result['uptime_seconds'] >= 0.1


class TestMetricsCollector:
    """Test MetricsCollector class"""

    @pytest.fixture
    def metrics(self):
        """Create MetricsCollector instance"""
        return MetricsCollector()

    def test_initialization(self, metrics):
        """Test MetricsCollector initialization"""
        assert metrics.request_count == 0
        assert metrics.error_count == 0
        assert len(metrics.request_durations) == 0
        assert metrics.start_time > 0

    def test_record_request_success(self, metrics):
        """Test recording successful request"""
        metrics.record_request(100.5, 200)

        assert metrics.request_count == 1
        assert metrics.error_count == 0
        assert len(metrics.request_durations) == 1
        assert metrics.request_durations[0] == 100.5

    def test_record_request_error(self, metrics):
        """Test recording failed request (5xx)"""
        metrics.record_request(200.0, 500)

        assert metrics.request_count == 1
        assert metrics.error_count == 1

    def test_record_request_client_error(self, metrics):
        """Test recording client error (4xx) - not counted as error"""
        metrics.record_request(50.0, 400)

        assert metrics.request_count == 1
        assert metrics.error_count == 0

    def test_record_multiple_requests(self, metrics):
        """Test recording multiple requests"""
        for i in range(10):
            metrics.record_request(float(i * 10), 200)

        assert metrics.request_count == 10
        assert len(metrics.request_durations) == 10

    def test_duration_list_truncation(self, metrics):
        """Test that duration list is truncated after 1000 entries"""
        for i in range(1200):
            metrics.record_request(float(i), 200)

        assert len(metrics.request_durations) == 1000
        assert metrics.request_count == 1200

    def test_get_metrics_empty(self, metrics):
        """Test getting metrics with no requests"""
        result = metrics.get_metrics()

        assert result['requests_total'] == 0
        assert result['errors_total'] == 0
        assert result['response_time_avg_ms'] == 0
        assert result['response_time_p95_ms'] == 0
        assert result['response_time_p99_ms'] == 0

    def test_get_metrics_with_data(self, metrics):
        """Test getting metrics with request data"""
        # Add 100 requests with predictable durations
        for i in range(100):
            metrics.record_request(float(i), 200)

        # Add some errors
        metrics.record_request(100.0, 500)
        metrics.record_request(100.0, 503)

        result = metrics.get_metrics()

        assert result['requests_total'] == 102
        assert result['errors_total'] == 2
        assert result['error_rate'] == 2 / 102
        assert result['response_time_avg_ms'] > 0
        assert result['response_time_p95_ms'] > result['response_time_avg_ms']
        assert result['response_time_p99_ms'] > result['response_time_p95_ms']
        assert 'uptime_seconds' in result
        assert 'requests_per_second' in result

    def test_get_prometheus_metrics_format(self, metrics):
        """Test Prometheus metrics format"""
        metrics.record_request(100.0, 200)
        metrics.record_request(200.0, 500)

        result = metrics.get_prometheus_metrics()

        # Check format
        assert '# HELP requests_total' in result
        assert '# TYPE requests_total counter' in result
        assert 'requests_total 2' in result
        assert '# HELP errors_total' in result
        assert 'errors_total 1' in result
        assert '# HELP response_time_avg_ms' in result
        assert '# HELP uptime_seconds' in result

    def test_get_prometheus_metrics_values(self, metrics):
        """Test Prometheus metrics contain correct values"""
        for i in range(10):
            metrics.record_request(float(i * 10), 200)

        result = metrics.get_prometheus_metrics()

        assert 'requests_total 10' in result
        assert 'errors_total 0' in result
        # Check that numeric values are present
        assert 'response_time_avg_ms' in result
        assert 'response_time_p95_ms' in result
        assert 'response_time_p99_ms' in result


class TestGlobalInstances:
    """Test global instance functions"""

    def test_get_health_check(self):
        """Test getting global health check instance"""
        app = Mock()
        health1 = get_health_check(app)
        health2 = get_health_check(app)

        # Should return same instance
        assert health1 is health2

    def test_get_metrics_collector(self):
        """Test getting global metrics collector instance"""
        metrics1 = get_metrics_collector()
        metrics2 = get_metrics_collector()

        # Should return same instance
        assert metrics1 is metrics2


# Mark all tests in this file as unit tests
pytestmark = pytest.mark.unit


if __name__ == '__main__':
    # Run with: python test_health_check.py
    pytest.main([__file__, '-v', '--tb=short'])
