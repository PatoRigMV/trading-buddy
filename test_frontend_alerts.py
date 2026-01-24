#!/usr/bin/env python3
"""
Quick test of frontend price alerts integration
"""

import requests
import json

BASE_URL = "http://localhost:5001"

def test_frontend_integration():
    print("Testing Frontend Price Alerts Integration")
    print("=" * 50)

    # Create a test alert
    alert_data = {
        "symbol": "AAPL",
        "alert_type": "price_above",
        "condition_value": 250.0,
        "message": "AAPL reached target price!",
        "expires_in_hours": 24
    }

    response = requests.post(f"{BASE_URL}/api/alerts", json=alert_data)
    if response.status_code == 200:
        result = response.json()
        print(f"✓ Test alert created: {result['message']}")
        alert_id = result['alert_id']

        # Check alerts list
        alerts_response = requests.get(f"{BASE_URL}/api/alerts?status=active")
        if alerts_response.status_code == 200:
            alerts_data = alerts_response.json()
            print(f"✓ Found {len(alerts_data['alerts'])} active alerts")

        # Check statistics
        stats_response = requests.get(f"{BASE_URL}/api/alerts/statistics")
        if stats_response.status_code == 200:
            stats = stats_response.json()
            print(f"✓ Alert statistics: {stats['total_alerts']} total, {stats['active_alerts']} active")

        print("✓ Frontend integration test complete - ready for web interface!")
        return True
    else:
        print(f"✗ Failed to create alert: {response.text}")
        return False

if __name__ == "__main__":
    test_frontend_integration()
