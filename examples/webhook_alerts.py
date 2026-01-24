#!/usr/bin/env python3
"""
Webhook Alerts Example
======================
Demonstrates how to set up price alerts with webhook notifications.

This example shows how to:
- Create price alerts for stocks
- Monitor prices and trigger alerts
- Send notifications via webhooks (Slack, Discord, etc.)

Usage:
    python examples/webhook_alerts.py
"""

import asyncio
import aiohttp
import os
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional, Callable
from enum import Enum


class AlertType(Enum):
    """Types of price alerts."""
    PRICE_ABOVE = "price_above"
    PRICE_BELOW = "price_below"
    PERCENT_CHANGE = "percent_change"
    VOLUME_SPIKE = "volume_spike"


@dataclass
class PriceAlert:
    """Configuration for a price alert."""
    id: str
    symbol: str
    alert_type: AlertType
    threshold: float
    webhook_url: Optional[str] = None
    message: Optional[str] = None
    triggered: bool = False
    triggered_at: Optional[datetime] = None


@dataclass
class AlertNotification:
    """Notification to send when alert triggers."""
    alert: PriceAlert
    current_price: float
    timestamp: datetime


class AlertManager:
    """
    Manages price alerts and webhook notifications.

    Integrates with Trading Buddy's real-time data feeds.
    """

    def __init__(self):
        self.alerts: List[PriceAlert] = []
        self.notification_handlers: List[Callable] = []
        self._alert_counter = 0

    def add_alert(
        self,
        symbol: str,
        alert_type: AlertType,
        threshold: float,
        webhook_url: Optional[str] = None,
        message: Optional[str] = None
    ) -> PriceAlert:
        """Add a new price alert."""
        self._alert_counter += 1
        alert = PriceAlert(
            id=f"alert_{self._alert_counter}",
            symbol=symbol.upper(),
            alert_type=alert_type,
            threshold=threshold,
            webhook_url=webhook_url,
            message=message or f"{symbol} alert triggered"
        )
        self.alerts.append(alert)
        print(f"✅ Alert created: {alert.id} - {symbol} {alert_type.value} {threshold}")
        return alert

    def remove_alert(self, alert_id: str) -> bool:
        """Remove an alert by ID."""
        for i, alert in enumerate(self.alerts):
            if alert.id == alert_id:
                self.alerts.pop(i)
                print(f"🗑️ Alert removed: {alert_id}")
                return True
        return False

    def check_alerts(self, symbol: str, price: float, volume: int = 0, prev_close: float = 0) -> List[AlertNotification]:
        """
        Check if any alerts should be triggered.

        Call this method when you receive new price data.
        """
        notifications = []

        for alert in self.alerts:
            if alert.symbol != symbol.upper() or alert.triggered:
                continue

            triggered = False

            if alert.alert_type == AlertType.PRICE_ABOVE:
                triggered = price >= alert.threshold

            elif alert.alert_type == AlertType.PRICE_BELOW:
                triggered = price <= alert.threshold

            elif alert.alert_type == AlertType.PERCENT_CHANGE:
                if prev_close > 0:
                    change_pct = abs((price - prev_close) / prev_close)
                    triggered = change_pct >= alert.threshold

            elif alert.alert_type == AlertType.VOLUME_SPIKE:
                # threshold is the volume multiplier
                triggered = volume >= alert.threshold

            if triggered:
                alert.triggered = True
                alert.triggered_at = datetime.now()

                notification = AlertNotification(
                    alert=alert,
                    current_price=price,
                    timestamp=datetime.now()
                )
                notifications.append(notification)
                print(f"🔔 Alert triggered: {alert.id} - {symbol} at ${price:.2f}")

        return notifications

    async def send_webhook(self, notification: AlertNotification):
        """Send a webhook notification."""
        alert = notification.alert

        if not alert.webhook_url:
            print(f"   ⚠️ No webhook URL configured for {alert.id}")
            return

        # Build the payload (Slack/Discord compatible)
        payload = {
            "text": f"🔔 Price Alert: {alert.symbol}",
            "blocks": [
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"*{alert.symbol}* - {alert.message}"
                    }
                },
                {
                    "type": "section",
                    "fields": [
                        {"type": "mrkdwn", "text": f"*Alert Type:*\n{alert.alert_type.value}"},
                        {"type": "mrkdwn", "text": f"*Threshold:*\n{alert.threshold}"},
                        {"type": "mrkdwn", "text": f"*Current Price:*\n${notification.current_price:.2f}"},
                        {"type": "mrkdwn", "text": f"*Time:*\n{notification.timestamp.strftime('%H:%M:%S')}"}
                    ]
                }
            ]
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(alert.webhook_url, json=payload) as response:
                    if response.status == 200:
                        print(f"   ✅ Webhook sent successfully")
                    else:
                        print(f"   ❌ Webhook failed: {response.status}")
        except Exception as e:
            print(f"   ❌ Webhook error: {e}")

    def get_active_alerts(self, symbol: Optional[str] = None) -> List[PriceAlert]:
        """Get all active (non-triggered) alerts."""
        alerts = [a for a in self.alerts if not a.triggered]
        if symbol:
            alerts = [a for a in alerts if a.symbol == symbol.upper()]
        return alerts


# =============================================================================
# INTEGRATION EXAMPLE
# =============================================================================

class TradingBuddyAlertIntegration:
    """
    Example of how to integrate alerts with Trading Buddy.

    This shows how to hook into the real-time data feed.
    """

    def __init__(self, alert_manager: AlertManager):
        self.alert_manager = alert_manager

    async def on_price_update(self, data: dict):
        """
        Called when new price data is received.

        This method would be connected to Trading Buddy's
        real-time WebSocket feed.
        """
        symbol = data.get("symbol")
        price = data.get("price")
        volume = data.get("volume", 0)
        prev_close = data.get("prev_close", 0)

        # Check alerts
        notifications = self.alert_manager.check_alerts(
            symbol=symbol,
            price=price,
            volume=volume,
            prev_close=prev_close
        )

        # Send webhooks for triggered alerts
        for notification in notifications:
            await self.alert_manager.send_webhook(notification)


# =============================================================================
# DEMO
# =============================================================================

async def demo():
    """Demonstrate the alert system."""
    print("=" * 60)
    print("Trading Buddy - Webhook Alerts Example")
    print("=" * 60)

    # Create alert manager
    manager = AlertManager()

    # Set up some alerts
    print("\n📋 Setting up alerts...")
    print("-" * 60)

    # Price alerts
    manager.add_alert(
        symbol="AAPL",
        alert_type=AlertType.PRICE_ABOVE,
        threshold=190.00,
        message="AAPL broke above $190!"
    )

    manager.add_alert(
        symbol="AAPL",
        alert_type=AlertType.PRICE_BELOW,
        threshold=180.00,
        message="AAPL dropped below $180!"
    )

    manager.add_alert(
        symbol="TSLA",
        alert_type=AlertType.PERCENT_CHANGE,
        threshold=0.05,  # 5%
        message="TSLA moved 5%!"
    )

    # With webhook (example - won't actually send)
    manager.add_alert(
        symbol="NVDA",
        alert_type=AlertType.PRICE_ABOVE,
        threshold=900.00,
        webhook_url="https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
        message="NVDA hit $900!"
    )

    # Show active alerts
    print(f"\n📊 Active alerts: {len(manager.get_active_alerts())}")

    # Simulate price updates
    print("\n📈 Simulating price updates...")
    print("-" * 60)

    price_updates = [
        {"symbol": "AAPL", "price": 185.00, "prev_close": 184.00},
        {"symbol": "AAPL", "price": 188.00, "prev_close": 184.00},
        {"symbol": "AAPL", "price": 191.00, "prev_close": 184.00},  # Should trigger!
        {"symbol": "TSLA", "price": 250.00, "prev_close": 250.00},
        {"symbol": "TSLA", "price": 265.00, "prev_close": 250.00},  # 6% move - should trigger!
        {"symbol": "NVDA", "price": 875.00, "prev_close": 870.00},
        {"symbol": "NVDA", "price": 905.00, "prev_close": 870.00},  # Should trigger!
    ]

    for update in price_updates:
        print(f"\n   {update['symbol']}: ${update['price']:.2f}")
        notifications = manager.check_alerts(
            symbol=update["symbol"],
            price=update["price"],
            prev_close=update["prev_close"]
        )

        # In production, you'd send the webhooks
        for notification in notifications:
            print(f"   → Would send webhook: {notification.alert.message}")

    # Show remaining alerts
    print("\n" + "-" * 60)
    print("SUMMARY")
    print("-" * 60)
    active = manager.get_active_alerts()
    triggered = [a for a in manager.alerts if a.triggered]

    print(f"\n   Active alerts:    {len(active)}")
    print(f"   Triggered alerts: {len(triggered)}")

    if triggered:
        print("\n   Triggered:")
        for alert in triggered:
            print(f"      • {alert.symbol}: {alert.message}")

    # Integration example
    print("\n" + "=" * 60)
    print("INTEGRATION WITH TRADING BUDDY")
    print("=" * 60)
    print("""
    To integrate alerts into Trading Buddy:

    1. Add the AlertManager to your web_app.py:

       from examples.webhook_alerts import AlertManager, AlertType

       alert_manager = AlertManager()

    2. Create API endpoints:

       @app.route('/api/alerts', methods=['POST'])
       def create_alert():
           data = request.json
           alert = alert_manager.add_alert(
               symbol=data['symbol'],
               alert_type=AlertType[data['type']],
               threshold=data['threshold'],
               webhook_url=data.get('webhook_url')
           )
           return jsonify({"id": alert.id})

    3. Connect to real-time data:

       async def on_websocket_message(data):
           notifications = alert_manager.check_alerts(
               symbol=data['symbol'],
               price=data['price']
           )
           for n in notifications:
               await alert_manager.send_webhook(n)

    4. Example webhook URLs:
       - Slack: https://hooks.slack.com/services/T00/B00/XXX
       - Discord: https://discord.com/api/webhooks/XXX/YYY
       - Custom: https://your-server.com/webhook
    """)


if __name__ == "__main__":
    asyncio.run(demo())
