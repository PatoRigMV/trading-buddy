"""
Price Alerts System for Real-Time Trading Assistant
Provides comprehensive alerting for price movements, technical indicators, and market events
"""

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Callable
from datetime import datetime, timedelta
from enum import Enum
import json
import threading
import time

class AlertType(Enum):
    PRICE_ABOVE = "price_above"
    PRICE_BELOW = "price_below"
    PRICE_CHANGE_PERCENT = "price_change_percent"
    RSI_OVERBOUGHT = "rsi_overbought"
    RSI_OVERSOLD = "rsi_oversold"
    VOLUME_SPIKE = "volume_spike"
    TECHNICAL_BREAKOUT = "technical_breakout"
    SUPPORT_RESISTANCE = "support_resistance"

class AlertStatus(Enum):
    ACTIVE = "active"
    TRIGGERED = "triggered"
    EXPIRED = "expired"
    PAUSED = "paused"

@dataclass
class PriceAlert:
    id: str
    symbol: str
    alert_type: AlertType
    condition_value: float
    current_value: Optional[float] = None
    message: str = ""
    created_at: datetime = field(default_factory=datetime.now)
    triggered_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    status: AlertStatus = AlertStatus.ACTIVE
    notify_channels: List[str] = field(default_factory=lambda: ["web"])
    repeat_interval: Optional[int] = None  # minutes between repeat notifications
    last_notified: Optional[datetime] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

@dataclass
class AlertNotification:
    alert_id: str
    symbol: str
    alert_type: str
    message: str
    current_value: float
    target_value: float
    timestamp: datetime
    priority: str = "normal"  # low, normal, high, critical

class PriceAlertsManager:
    def __init__(self, real_time_data_manager, socketio=None):
        self.real_time_data_manager = real_time_data_manager
        self.socketio = socketio
        self.logger = logging.getLogger(__name__)

        # Storage
        self.alerts: Dict[str, PriceAlert] = {}
        self.notifications: List[AlertNotification] = []
        self.max_notifications = 100

        # Monitoring
        self.monitoring_active = False
        self.monitoring_interval = 30  # seconds
        self.monitoring_thread = None

        # Callbacks for different channels
        self.notification_callbacks: Dict[str, Callable] = {}

    def create_alert(self, symbol: str, alert_type: AlertType, condition_value: float,
                    message: str = "", expires_in_hours: Optional[int] = None,
                    notify_channels: List[str] = None) -> str:
        """Create a new price alert"""
        try:
            # Generate unique ID
            alert_id = f"ALERT_{symbol}_{alert_type.value}_{int(time.time())}"

            # Set expiration
            expires_at = None
            if expires_in_hours:
                expires_at = datetime.now() + timedelta(hours=expires_in_hours)

            # Default notification channels
            if notify_channels is None:
                notify_channels = ["web"]

            # Generate default message if not provided
            if not message:
                message = self._generate_default_message(symbol, alert_type, condition_value)

            # Create alert
            alert = PriceAlert(
                id=alert_id,
                symbol=symbol.upper(),
                alert_type=alert_type,
                condition_value=condition_value,
                message=message,
                expires_at=expires_at,
                notify_channels=notify_channels
            )

            # Store alert
            self.alerts[alert_id] = alert

            self.logger.info(f"Created alert {alert_id}: {symbol} {alert_type.value} {condition_value}")
            return alert_id

        except Exception as e:
            self.logger.error(f"Error creating alert: {str(e)}")
            raise

    def _generate_default_message(self, symbol: str, alert_type: AlertType, condition_value: float) -> str:
        """Generate default alert message"""
        messages = {
            AlertType.PRICE_ABOVE: f"{symbol} price moved above ${condition_value:.2f}",
            AlertType.PRICE_BELOW: f"{symbol} price dropped below ${condition_value:.2f}",
            AlertType.PRICE_CHANGE_PERCENT: f"{symbol} price changed by {condition_value:+.1f}%",
            AlertType.RSI_OVERBOUGHT: f"{symbol} RSI is overbought (>{condition_value})",
            AlertType.RSI_OVERSOLD: f"{symbol} RSI is oversold (<{condition_value})",
            AlertType.VOLUME_SPIKE: f"{symbol} volume spike detected ({condition_value}x average)",
            AlertType.TECHNICAL_BREAKOUT: f"{symbol} technical breakout detected",
            AlertType.SUPPORT_RESISTANCE: f"{symbol} hit support/resistance level ${condition_value:.2f}"
        }
        return messages.get(alert_type, f"{symbol} alert triggered")

    def delete_alert(self, alert_id: str) -> bool:
        """Delete an alert"""
        try:
            if alert_id in self.alerts:
                del self.alerts[alert_id]
                self.logger.info(f"Deleted alert {alert_id}")
                return True
            return False
        except Exception as e:
            self.logger.error(f"Error deleting alert {alert_id}: {str(e)}")
            return False

    def pause_alert(self, alert_id: str) -> bool:
        """Pause an alert"""
        try:
            if alert_id in self.alerts:
                self.alerts[alert_id].status = AlertStatus.PAUSED
                self.logger.info(f"Paused alert {alert_id}")
                return True
            return False
        except Exception as e:
            self.logger.error(f"Error pausing alert {alert_id}: {str(e)}")
            return False

    def resume_alert(self, alert_id: str) -> bool:
        """Resume a paused alert"""
        try:
            if alert_id in self.alerts and self.alerts[alert_id].status == AlertStatus.PAUSED:
                self.alerts[alert_id].status = AlertStatus.ACTIVE
                self.logger.info(f"Resumed alert {alert_id}")
                return True
            return False
        except Exception as e:
            self.logger.error(f"Error resuming alert {alert_id}: {str(e)}")
            return False

    def get_alerts(self, symbol: str = None, status: AlertStatus = None) -> List[PriceAlert]:
        """Get alerts with optional filtering"""
        try:
            alerts = list(self.alerts.values())

            if symbol:
                alerts = [a for a in alerts if a.symbol == symbol.upper()]

            if status:
                alerts = [a for a in alerts if a.status == status]

            return sorted(alerts, key=lambda x: x.created_at, reverse=True)
        except Exception as e:
            self.logger.error(f"Error getting alerts: {str(e)}")
            return []

    def get_notifications(self, limit: int = 20) -> List[AlertNotification]:
        """Get recent notifications"""
        try:
            return sorted(self.notifications[-limit:], key=lambda x: x.timestamp, reverse=True)
        except Exception as e:
            self.logger.error(f"Error getting notifications: {str(e)}")
            return []

    def start_monitoring(self):
        """Start the alert monitoring system"""
        try:
            if not self.monitoring_active:
                self.monitoring_active = True
                self.monitoring_thread = threading.Thread(target=self._monitoring_loop, daemon=True)
                self.monitoring_thread.start()
                self.logger.info("Price alerts monitoring started")
        except Exception as e:
            self.logger.error(f"Error starting monitoring: {str(e)}")

    def stop_monitoring(self):
        """Stop the alert monitoring system"""
        try:
            self.monitoring_active = False
            if self.monitoring_thread:
                self.monitoring_thread.join(timeout=5)
            self.logger.info("Price alerts monitoring stopped")
        except Exception as e:
            self.logger.error(f"Error stopping monitoring: {str(e)}")

    def _monitoring_loop(self):
        """Main monitoring loop that checks alerts"""
        while self.monitoring_active:
            try:
                # Check all active alerts
                asyncio.run(self._check_all_alerts())

                # Sleep for monitoring interval
                for _ in range(self.monitoring_interval):
                    if not self.monitoring_active:
                        break
                    time.sleep(1)

            except Exception as e:
                self.logger.error(f"Error in monitoring loop: {str(e)}")
                time.sleep(5)  # Wait before retrying

    async def _check_all_alerts(self):
        """Check all active alerts against current market data"""
        try:
            # Get unique symbols from active alerts
            active_alerts = [a for a in self.alerts.values() if a.status == AlertStatus.ACTIVE]

            if not active_alerts:
                return

            # Group alerts by symbol
            alerts_by_symbol = {}
            for alert in active_alerts:
                if alert.symbol not in alerts_by_symbol:
                    alerts_by_symbol[alert.symbol] = []
                alerts_by_symbol[alert.symbol].append(alert)

            # Get market data for all symbols
            symbols = list(alerts_by_symbol.keys())
            market_data = await self.real_time_data_manager.get_current_data(symbols)

            # Check each alert
            for symbol, symbol_alerts in alerts_by_symbol.items():
                if symbol in market_data:
                    data = market_data[symbol]

                    for alert in symbol_alerts:
                        await self._check_single_alert(alert, data)

        except Exception as e:
            self.logger.error(f"Error checking alerts: {str(e)}")

    async def _check_single_alert(self, alert: PriceAlert, market_data):
        """Check a single alert against market data"""
        try:
            # Check if alert has expired
            if alert.expires_at and datetime.now() > alert.expires_at:
                alert.status = AlertStatus.EXPIRED
                return

            # Get current values
            current_price = market_data.price
            tech_indicators = market_data.technical_indicators

            # Check alert condition based on type
            triggered = False
            current_value = None

            if alert.alert_type == AlertType.PRICE_ABOVE:
                current_value = current_price
                triggered = current_price > alert.condition_value

            elif alert.alert_type == AlertType.PRICE_BELOW:
                current_value = current_price
                triggered = current_price < alert.condition_value

            elif alert.alert_type == AlertType.PRICE_CHANGE_PERCENT:
                if tech_indicators.price_change_24h is not None:
                    current_value = tech_indicators.price_change_24h
                    if alert.condition_value > 0:
                        triggered = current_value >= alert.condition_value
                    else:
                        triggered = current_value <= alert.condition_value

            elif alert.alert_type == AlertType.RSI_OVERBOUGHT:
                if tech_indicators.rsi is not None:
                    current_value = tech_indicators.rsi
                    triggered = current_value > alert.condition_value

            elif alert.alert_type == AlertType.RSI_OVERSOLD:
                if tech_indicators.rsi is not None:
                    current_value = tech_indicators.rsi
                    triggered = current_value < alert.condition_value

            elif alert.alert_type == AlertType.VOLUME_SPIKE:
                if (tech_indicators.current_volume and tech_indicators.avg_volume and
                    tech_indicators.avg_volume > 0):
                    volume_ratio = tech_indicators.current_volume / tech_indicators.avg_volume
                    current_value = volume_ratio
                    triggered = volume_ratio >= alert.condition_value

            # Update alert with current value
            alert.current_value = current_value

            # If triggered, send notification
            if triggered and alert.status == AlertStatus.ACTIVE:
                await self._trigger_alert(alert, current_value)

        except Exception as e:
            self.logger.error(f"Error checking alert {alert.id}: {str(e)}")

    async def _trigger_alert(self, alert: PriceAlert, current_value: float):
        """Trigger an alert and send notifications"""
        try:
            # Check repeat interval
            if (alert.repeat_interval and alert.last_notified and
                datetime.now() - alert.last_notified < timedelta(minutes=alert.repeat_interval)):
                return

            # Update alert status
            if not alert.repeat_interval:
                alert.status = AlertStatus.TRIGGERED
            alert.triggered_at = datetime.now()
            alert.last_notified = datetime.now()

            # Determine priority
            priority = self._determine_priority(alert.alert_type, current_value, alert.condition_value)

            # Create notification
            notification = AlertNotification(
                alert_id=alert.id,
                symbol=alert.symbol,
                alert_type=alert.alert_type.value,
                message=alert.message,
                current_value=current_value,
                target_value=alert.condition_value,
                timestamp=datetime.now(),
                priority=priority
            )

            # Store notification
            self.notifications.append(notification)

            # Trim notifications if needed
            if len(self.notifications) > self.max_notifications:
                self.notifications = self.notifications[-self.max_notifications:]

            # Send notifications through all channels
            for channel in alert.notify_channels:
                await self._send_notification(notification, channel)

            self.logger.info(f"Alert triggered: {alert.id} - {alert.symbol} {alert.alert_type.value}")

        except Exception as e:
            self.logger.error(f"Error triggering alert {alert.id}: {str(e)}")

    def _determine_priority(self, alert_type: AlertType, current_value: float, target_value: float) -> str:
        """Determine notification priority based on alert type and values"""
        try:
            # Critical alerts
            if alert_type in [AlertType.RSI_EXTREMELY_OVERBOUGHT, AlertType.RSI_EXTREMELY_OVERSOLD]:
                return "critical"

            # High priority alerts
            if alert_type == AlertType.VOLUME_SPIKE and current_value > 5:
                return "high"

            if alert_type == AlertType.PRICE_CHANGE_PERCENT and abs(current_value) > 10:
                return "high"

            # Normal priority for most alerts
            return "normal"

        except:
            return "normal"

    async def _send_notification(self, notification: AlertNotification, channel: str):
        """Send notification through specified channel"""
        try:
            if channel == "web" and self.socketio:
                # Send WebSocket notification
                self.socketio.emit('price_alert', {
                    'alert_id': notification.alert_id,
                    'symbol': notification.symbol,
                    'type': notification.alert_type,
                    'message': notification.message,
                    'current_value': notification.current_value,
                    'target_value': notification.target_value,
                    'priority': notification.priority,
                    'timestamp': notification.timestamp.isoformat()
                })

            elif channel in self.notification_callbacks:
                # Send through custom callback
                callback = self.notification_callbacks[channel]
                await callback(notification)

        except Exception as e:
            self.logger.error(f"Error sending notification via {channel}: {str(e)}")

    def add_notification_callback(self, channel: str, callback: Callable):
        """Add a custom notification callback for a channel"""
        self.notification_callbacks[channel] = callback
        self.logger.info(f"Added notification callback for channel: {channel}")

    def create_smart_alerts_for_symbol(self, symbol: str) -> List[str]:
        """Create smart alerts based on current market conditions"""
        try:
            alert_ids = []

            # Get current market data
            market_data = asyncio.run(self.real_time_data_manager.get_current_data([symbol]))

            if symbol not in market_data:
                return alert_ids

            data = market_data[symbol]
            current_price = data.price
            tech_indicators = data.technical_indicators

            # Price movement alerts (±5% from current price)
            upper_price = current_price * 1.05
            lower_price = current_price * 0.95

            alert_ids.append(self.create_alert(
                symbol, AlertType.PRICE_ABOVE, upper_price,
                f"{symbol} broke above ${upper_price:.2f} (+5%)", 24
            ))

            alert_ids.append(self.create_alert(
                symbol, AlertType.PRICE_BELOW, lower_price,
                f"{symbol} dropped below ${lower_price:.2f} (-5%)", 24
            ))

            # RSI alerts if available
            if tech_indicators.rsi is not None:
                if tech_indicators.rsi < 70:  # Only set overbought alert if not already overbought
                    alert_ids.append(self.create_alert(
                        symbol, AlertType.RSI_OVERBOUGHT, 70,
                        f"{symbol} RSI indicates overbought conditions", 48
                    ))

                if tech_indicators.rsi > 30:  # Only set oversold alert if not already oversold
                    alert_ids.append(self.create_alert(
                        symbol, AlertType.RSI_OVERSOLD, 30,
                        f"{symbol} RSI indicates oversold conditions", 48
                    ))

            # Volume spike alert
            alert_ids.append(self.create_alert(
                symbol, AlertType.VOLUME_SPIKE, 3.0,
                f"{symbol} unusual volume activity detected", 12
            ))

            self.logger.info(f"Created {len(alert_ids)} smart alerts for {symbol}")
            return alert_ids

        except Exception as e:
            self.logger.error(f"Error creating smart alerts for {symbol}: {str(e)}")
            return []

    def get_alert_statistics(self) -> Dict[str, Any]:
        """Get statistics about alerts"""
        try:
            total_alerts = len(self.alerts)
            active_alerts = len([a for a in self.alerts.values() if a.status == AlertStatus.ACTIVE])
            triggered_alerts = len([a for a in self.alerts.values() if a.status == AlertStatus.TRIGGERED])

            # Alerts by symbol
            alerts_by_symbol = {}
            for alert in self.alerts.values():
                symbol = alert.symbol
                if symbol not in alerts_by_symbol:
                    alerts_by_symbol[symbol] = 0
                alerts_by_symbol[symbol] += 1

            # Recent notifications count
            recent_notifications = len([n for n in self.notifications
                                     if datetime.now() - n.timestamp < timedelta(hours=24)])

            return {
                'total_alerts': total_alerts,
                'active_alerts': active_alerts,
                'triggered_alerts': triggered_alerts,
                'alerts_by_symbol': alerts_by_symbol,
                'recent_notifications': recent_notifications,
                'monitoring_active': self.monitoring_active
            }

        except Exception as e:
            self.logger.error(f"Error getting alert statistics: {str(e)}")
            return {}
