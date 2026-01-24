"""
Structured logging configuration for Trading Assistant.

Provides JSON-formatted logs for production monitoring and debugging.
"""

import logging
import json
import sys
from datetime import datetime
from typing import Any, Dict


class JSONFormatter(logging.Formatter):
    """
    Custom JSON formatter for structured logging.

    Outputs logs in JSON format for easy parsing by log aggregators
    like ELK Stack, Splunk, or CloudWatch.
    """

    def format(self, record: logging.LogRecord) -> str:
        """Format log record as JSON"""
        log_data: Dict[str, Any] = {
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
            'module': record.module,
            'function': record.funcName,
            'line': record.lineno,
        }

        # Add exception info if present
        if record.exc_info:
            log_data['exception'] = self.formatException(record.exc_info)

        # Add extra fields if present
        if hasattr(record, 'extra_fields'):
            log_data.update(record.extra_fields)

        # Add custom fields from LogRecord
        for key, value in record.__dict__.items():
            if key not in ['name', 'msg', 'args', 'created', 'filename', 'funcName',
                           'levelname', 'levelno', 'lineno', 'module', 'msecs',
                           'message', 'pathname', 'process', 'processName', 'relativeCreated',
                           'thread', 'threadName', 'exc_info', 'exc_text', 'stack_info',
                           'extra_fields']:
                log_data[key] = value

        return json.dumps(log_data)


class ColoredConsoleFormatter(logging.Formatter):
    """
    Colored console formatter for development.

    Uses ANSI color codes for better readability in terminal.
    """

    COLORS = {
        'DEBUG': '\033[36m',      # Cyan
        'INFO': '\033[32m',       # Green
        'WARNING': '\033[33m',    # Yellow
        'ERROR': '\033[31m',      # Red
        'CRITICAL': '\033[35m',   # Magenta
    }
    RESET = '\033[0m'

    def format(self, record: logging.LogRecord) -> str:
        """Format log record with colors"""
        color = self.COLORS.get(record.levelname, self.RESET)
        record.levelname = f"{color}{record.levelname}{self.RESET}"
        return super().format(record)


def setup_logging(app, environment: str = 'development'):
    """
    Configure structured logging for the application.

    Args:
        app: Flask application instance
        environment: 'development', 'staging', or 'production'
    """
    # Clear existing handlers
    app.logger.handlers.clear()

    # Set log level based on environment
    if environment == 'production':
        log_level = logging.INFO
    elif environment == 'staging':
        log_level = logging.DEBUG
    else:  # development
        log_level = logging.DEBUG

    app.logger.setLevel(log_level)

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(log_level)

    if environment == 'production':
        # JSON format for production (parseable by log aggregators)
        console_handler.setFormatter(JSONFormatter())
    else:
        # Colored format for development (human-readable)
        formatter = ColoredConsoleFormatter(
            fmt='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        console_handler.setFormatter(formatter)

    app.logger.addHandler(console_handler)

    # File handler for persistent logs
    try:
        file_handler = logging.FileHandler('logs/trading_assistant.log')
        file_handler.setLevel(logging.INFO)
        file_handler.setFormatter(JSONFormatter())
        app.logger.addHandler(file_handler)
    except (FileNotFoundError, PermissionError):
        app.logger.warning("Could not create log file - directory may not exist")

    # Error file handler for errors only
    try:
        error_handler = logging.FileHandler('logs/errors.log')
        error_handler.setLevel(logging.ERROR)
        error_handler.setFormatter(JSONFormatter())
        app.logger.addHandler(error_handler)
    except (FileNotFoundError, PermissionError):
        app.logger.warning("Could not create error log file")

    app.logger.info(f"Logging configured for {environment} environment", extra={
        'environment': environment,
        'log_level': logging.getLevelName(log_level)
    })


class RequestLogger:
    """
    Middleware for logging HTTP requests with timing and status.
    """

    def __init__(self, app):
        self.app = app

    def __call__(self, environ, start_response):
        """Log request details"""
        import time
        from flask import request

        start_time = time.time()

        def custom_start_response(status, headers, exc_info=None):
            # Log after response
            duration = (time.time() - start_time) * 1000  # ms

            # Skip health check logs in production
            if environ.get('PATH_INFO') != '/api/health':
                self.app.logger.info('HTTP Request', extra={
                    'method': environ.get('REQUEST_METHOD'),
                    'path': environ.get('PATH_INFO'),
                    'status': int(status.split()[0]),
                    'duration_ms': round(duration, 2),
                    'ip': environ.get('REMOTE_ADDR'),
                    'user_agent': environ.get('HTTP_USER_AGENT', '')[:100],
                })

            return start_response(status, headers, exc_info)

        return self.app(environ, custom_start_response)


def log_with_context(logger, level: str, message: str, **context):
    """
    Helper function to log with additional context.

    Usage:
        log_with_context(app.logger, 'info', 'Trade executed',
                         symbol='AAPL', quantity=100, price=150.25)
    """
    log_func = getattr(logger, level.lower())
    log_func(message, extra=context)


# Example usage patterns for different scenarios
def log_trade_execution(logger, symbol: str, quantity: int, price: float, side: str):
    """Log trade execution with structured data"""
    log_with_context(
        logger, 'info', 'Trade executed',
        event_type='trade_execution',
        symbol=symbol,
        quantity=quantity,
        price=price,
        side=side,
        total_value=quantity * price
    )


def log_error_with_context(logger, error: Exception, **context):
    """Log error with full context"""
    logger.error(
        f"Error: {str(error)}",
        exc_info=True,
        extra={
            'error_type': type(error).__name__,
            'error_message': str(error),
            **context
        }
    )


def log_performance(logger, operation: str, duration_ms: float, **context):
    """Log performance metrics"""
    level = 'warning' if duration_ms > 1000 else 'info'
    log_with_context(
        logger, level, f'Performance: {operation}',
        event_type='performance',
        operation=operation,
        duration_ms=duration_ms,
        **context
    )


def log_security_event(logger, event: str, severity: str, **context):
    """Log security-related events"""
    log_with_context(
        logger, severity, f'Security event: {event}',
        event_type='security',
        security_event=event,
        **context
    )


# Rate limiting for noisy logs
class RateLimitedLogger:
    """
    Wrapper to rate-limit log messages.

    Prevents log spam from repeated errors.
    """

    def __init__(self, logger, max_per_minute: int = 10):
        self.logger = logger
        self.max_per_minute = max_per_minute
        self.message_counts = {}
        self.last_reset = datetime.now()

    def _reset_if_needed(self):
        """Reset counters every minute"""
        now = datetime.now()
        if (now - self.last_reset).seconds >= 60:
            self.message_counts.clear()
            self.last_reset = now

    def log(self, level: str, message: str, **kwargs):
        """Log message with rate limiting"""
        self._reset_if_needed()

        message_key = f"{level}:{message}"
        count = self.message_counts.get(message_key, 0)

        if count < self.max_per_minute:
            log_func = getattr(self.logger, level.lower())
            log_func(message, **kwargs)
            self.message_counts[message_key] = count + 1
        elif count == self.max_per_minute:
            self.logger.warning(f"Rate limit reached for message: {message[:50]}...")
            self.message_counts[message_key] = count + 1


# Export helper functions
__all__ = [
    'setup_logging',
    'JSONFormatter',
    'ColoredConsoleFormatter',
    'RequestLogger',
    'log_with_context',
    'log_trade_execution',
    'log_error_with_context',
    'log_performance',
    'log_security_event',
    'RateLimitedLogger',
]
