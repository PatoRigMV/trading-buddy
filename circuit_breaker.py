"""
Circuit Breaker and Error Recovery System
Provides resilience patterns for API failures and automatic recovery mechanisms
"""

import asyncio
import logging
import time
from typing import Dict, Any, Callable, Optional, List, Tuple
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from functools import wraps
import json

class CircuitState(Enum):
    CLOSED = "closed"      # Normal operation
    OPEN = "open"          # Circuit is open, requests are blocked
    HALF_OPEN = "half_open"  # Testing if service has recovered

@dataclass
class CircuitBreakerConfig:
    """Configuration for circuit breaker"""
    failure_threshold: int = 5       # Number of failures before opening circuit
    recovery_timeout: float = 60.0   # Time to wait before trying half-open (seconds)
    success_threshold: int = 2       # Successes needed in half-open to close circuit
    timeout: float = 30.0            # Request timeout
    expected_exception: tuple = (Exception,)  # Exceptions that count as failures

@dataclass
class CircuitBreakerStats:
    """Circuit breaker statistics"""
    state: CircuitState = CircuitState.CLOSED
    failure_count: int = 0
    success_count: int = 0
    last_failure_time: Optional[datetime] = None
    total_requests: int = 0
    total_failures: int = 0
    total_successes: int = 0
    state_changed_at: datetime = field(default_factory=datetime.now)

class CircuitBreaker:
    """Circuit breaker implementation with exponential backoff"""

    def __init__(self, name: str, config: CircuitBreakerConfig = None):
        self.name = name
        self.config = config or CircuitBreakerConfig()
        self.stats = CircuitBreakerStats()
        self.logger = logging.getLogger(f"{__name__}.{name}")
        self._lock = asyncio.Lock()

        self.logger.info(f"Circuit breaker '{name}' initialized")

    async def call(self, func: Callable, *args, **kwargs) -> Any:
        """Execute function with circuit breaker protection"""
        async with self._lock:
            self.stats.total_requests += 1

            # Check circuit state
            if self.stats.state == CircuitState.OPEN:
                if self._should_attempt_reset():
                    self._move_to_half_open()
                else:
                    raise CircuitBreakerOpenException(f"Circuit breaker '{self.name}' is OPEN")

            try:
                # Add timeout to the function call
                result = await asyncio.wait_for(func(*args, **kwargs), timeout=self.config.timeout)
                await self._on_success()
                return result

            except self.config.expected_exception as e:
                await self._on_failure(e)
                raise

    def _should_attempt_reset(self) -> bool:
        """Check if circuit should attempt to reset"""
        if self.stats.last_failure_time is None:
            return False

        time_since_failure = (datetime.now() - self.stats.last_failure_time).total_seconds()
        return time_since_failure >= self.config.recovery_timeout

    def _move_to_half_open(self):
        """Move circuit to half-open state"""
        self.stats.state = CircuitState.HALF_OPEN
        self.stats.success_count = 0
        self.stats.state_changed_at = datetime.now()
        self.logger.info(f"Circuit breaker '{self.name}' moved to HALF_OPEN")

    async def _on_success(self):
        """Handle successful call"""
        self.stats.total_successes += 1

        if self.stats.state == CircuitState.HALF_OPEN:
            self.stats.success_count += 1
            if self.stats.success_count >= self.config.success_threshold:
                self._move_to_closed()
        elif self.stats.state == CircuitState.CLOSED:
            # Reset failure count on success
            self.stats.failure_count = 0

    async def _on_failure(self, exception: Exception):
        """Handle failed call"""
        self.stats.total_failures += 1
        self.stats.failure_count += 1
        self.stats.last_failure_time = datetime.now()

        self.logger.warning(f"Circuit breaker '{self.name}' failure #{self.stats.failure_count}: {str(exception)}")

        if self.stats.state == CircuitState.HALF_OPEN:
            # Go back to open on any failure in half-open
            self._move_to_open()
        elif self.stats.state == CircuitState.CLOSED:
            if self.stats.failure_count >= self.config.failure_threshold:
                self._move_to_open()

    def _move_to_closed(self):
        """Move circuit to closed state"""
        self.stats.state = CircuitState.CLOSED
        self.stats.failure_count = 0
        self.stats.success_count = 0
        self.stats.state_changed_at = datetime.now()
        self.logger.info(f"Circuit breaker '{self.name}' moved to CLOSED - service recovered")

    def _move_to_open(self):
        """Move circuit to open state"""
        self.stats.state = CircuitState.OPEN
        self.stats.state_changed_at = datetime.now()
        self.logger.error(f"Circuit breaker '{self.name}' moved to OPEN - service degraded")

    def get_stats(self) -> Dict[str, Any]:
        """Get circuit breaker statistics"""
        uptime = (datetime.now() - self.stats.state_changed_at).total_seconds()
        success_rate = (
            self.stats.total_successes / self.stats.total_requests * 100
            if self.stats.total_requests > 0 else 0
        )

        return {
            'name': self.name,
            'state': self.stats.state.value,
            'failure_count': self.stats.failure_count,
            'success_count': self.stats.success_count,
            'total_requests': self.stats.total_requests,
            'success_rate': f"{success_rate:.1f}%",
            'last_failure': self.stats.last_failure_time.isoformat() if self.stats.last_failure_time else None,
            'state_uptime': f"{uptime:.1f}s",
            'config': {
                'failure_threshold': self.config.failure_threshold,
                'recovery_timeout': self.config.recovery_timeout,
                'success_threshold': self.config.success_threshold,
                'timeout': self.config.timeout
            }
        }

class CircuitBreakerOpenException(Exception):
    """Exception raised when circuit breaker is open"""
    pass

class ErrorRecoveryManager:
    """Manages circuit breakers and error recovery strategies"""

    def __init__(self):
        self.circuit_breakers: Dict[str, CircuitBreaker] = {}
        self.logger = logging.getLogger(__name__)

        # Recovery strategies
        self.retry_configs = {
            'api_calls': {
                'max_attempts': 3,
                'backoff_multiplier': 2.0,
                'initial_delay': 1.0
            },
            'database': {
                'max_attempts': 5,
                'backoff_multiplier': 1.5,
                'initial_delay': 0.5
            },
            'cache': {
                'max_attempts': 2,
                'backoff_multiplier': 1.0,
                'initial_delay': 0.1
            }
        }

        self.logger.info("Error Recovery Manager initialized")

    def get_circuit_breaker(self, name: str, config: CircuitBreakerConfig = None) -> CircuitBreaker:
        """Get or create circuit breaker"""
        if name not in self.circuit_breakers:
            self.circuit_breakers[name] = CircuitBreaker(name, config)
        return self.circuit_breakers[name]

    async def with_circuit_breaker(self, name: str, func: Callable, *args, **kwargs) -> Any:
        """Execute function with circuit breaker protection"""
        circuit_breaker = self.get_circuit_breaker(name)
        return await circuit_breaker.call(func, *args, **kwargs)

    async def with_retry(self,
                        func: Callable,
                        strategy: str = 'api_calls',
                        *args, **kwargs) -> Any:
        """Execute function with retry logic and exponential backoff"""
        config = self.retry_configs.get(strategy, self.retry_configs['api_calls'])

        last_exception = None
        for attempt in range(config['max_attempts']):
            try:
                return await func(*args, **kwargs)

            except Exception as e:
                last_exception = e

                if attempt < config['max_attempts'] - 1:  # Don't delay after last attempt
                    delay = config['initial_delay'] * (config['backoff_multiplier'] ** attempt)
                    self.logger.warning(
                        f"Attempt {attempt + 1} failed for {func.__name__}: {str(e)}. "
                        f"Retrying in {delay:.2f}s..."
                    )
                    await asyncio.sleep(delay)
                else:
                    self.logger.error(
                        f"All {config['max_attempts']} attempts failed for {func.__name__}: {str(e)}"
                    )

        # Re-raise the last exception if all attempts failed
        raise last_exception

    async def with_fallback(self,
                           primary_func: Callable,
                           fallback_func: Callable,
                           *args, **kwargs) -> Tuple[Any, str]:
        """Execute function with fallback on failure"""
        try:
            result = await primary_func(*args, **kwargs)
            return result, 'primary'

        except Exception as e:
            self.logger.warning(f"Primary function failed: {str(e)}, using fallback")
            try:
                result = await fallback_func(*args, **kwargs)
                return result, 'fallback'
            except Exception as fallback_error:
                self.logger.error(f"Fallback also failed: {str(fallback_error)}")
                raise e  # Raise original exception

    def circuit_breaker_decorator(self, name: str, config: CircuitBreakerConfig = None):
        """Decorator to add circuit breaker protection to functions"""
        def decorator(func: Callable):
            @wraps(func)
            async def wrapper(*args, **kwargs):
                return await self.with_circuit_breaker(name, func, *args, **kwargs)
            return wrapper
        return decorator

    def retry_decorator(self, strategy: str = 'api_calls'):
        """Decorator to add retry logic to functions"""
        def decorator(func: Callable):
            @wraps(func)
            async def wrapper(*args, **kwargs):
                return await self.with_retry(func, strategy, *args, **kwargs)
            return wrapper
        return decorator

    def get_system_health(self) -> Dict[str, Any]:
        """Get overall system health status"""
        circuit_stats = {}
        degraded_services = []
        total_circuits = len(self.circuit_breakers)
        healthy_circuits = 0

        for name, circuit in self.circuit_breakers.items():
            stats = circuit.get_stats()
            circuit_stats[name] = stats

            if stats['state'] == CircuitState.OPEN.value:
                degraded_services.append(name)
            elif stats['state'] == CircuitState.CLOSED.value:
                healthy_circuits += 1

        health_score = (healthy_circuits / total_circuits * 100) if total_circuits > 0 else 100

        return {
            'overall_health': 'healthy' if health_score >= 80 else 'degraded' if health_score >= 50 else 'critical',
            'health_score': f"{health_score:.1f}%",
            'total_circuits': total_circuits,
            'healthy_circuits': healthy_circuits,
            'degraded_services': degraded_services,
            'circuit_breakers': circuit_stats,
            'timestamp': datetime.now().isoformat()
        }

# Global error recovery manager
_error_recovery_manager = None

def get_error_recovery_manager() -> ErrorRecoveryManager:
    """Get or create global error recovery manager"""
    global _error_recovery_manager
    if _error_recovery_manager is None:
        _error_recovery_manager = ErrorRecoveryManager()
    return _error_recovery_manager

# Convenience decorators
def circuit_breaker(name: str, config: CircuitBreakerConfig = None):
    """Circuit breaker decorator"""
    return get_error_recovery_manager().circuit_breaker_decorator(name, config)

def retry(strategy: str = 'api_calls'):
    """Retry decorator"""
    return get_error_recovery_manager().retry_decorator(strategy)
