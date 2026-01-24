"""
Live Signals Parser - Extracts trading signals from agent logs in real-time
"""

import re
import subprocess
import json
from datetime import datetime
from typing import List, Dict, Any
from dataclasses import dataclass
import logging

@dataclass
class LiveSignal:
    symbol: str
    action: str  # "entering", "analyzing", "in_position"
    price: float
    confidence: float
    reasoning: str
    timestamp: datetime
    rsi: float = 50.0
    momentum: float = 50.0

class LiveSignalsParser:
    def __init__(self):
        self.logger = logging.getLogger(__name__)

    def get_recent_buy_signals(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Get recent buy signals from agent logs"""
        try:
            # Get last 500 lines from agent log to capture recent activity
            result = subprocess.run(
                ["tail", "-n", "500", "/Users/ryanhaigh/trading_assistant/trading-agent/agent.log"],
                capture_output=True,
                text=True,
                timeout=5
            )

            if result.returncode != 0:
                return []

            log_lines = result.stdout.strip().split('\n')
            signals = []
            current_analysis = {}

            for line in log_lines[-200:]:  # Focus on last 200 lines for performance
                # Parse analysis lines with price and indicators (updated pattern)
                analysis_match = re.search(r'\[(\w+)\].*Analyzing (\w+) @ \$(\d+\.?\d*) - checking RSI, EMA, ATR patterns', line)
                if analysis_match:
                    symbol = analysis_match.group(1)
                    price = float(analysis_match.group(3))
                    current_analysis[symbol] = {"price": price}

                # Parse confidence/decision lines (updated pattern)
                confidence_match = re.search(r'🔍 (\w+): decision=(\w+), confidence: buy=(\d+\.?\d*), sell=(\d+\.?\d*)', line)
                if confidence_match:
                    symbol = confidence_match.group(1)
                    decision = confidence_match.group(2)
                    buy_conf = float(confidence_match.group(3))
                    current_analysis[symbol] = current_analysis.get(symbol, {})
                    current_analysis[symbol].update({
                        "decision": decision,
                        "buy_confidence": buy_conf
                    })

                    # If this is a buy decision, create a signal immediately
                    if decision == "buy" and buy_conf > 0.5:  # Only strong buy signals
                        price = current_analysis[symbol].get("price", 0.0)
                        reasoning = self._generate_reasoning(symbol, buy_conf)

                        signals.append({
                            "symbol": symbol,
                            "action": "BUY SIGNAL",
                            "price": price,
                            "confidence": f"{buy_conf:.1%}",
                            "reasoning": reasoning,
                            "timestamp": datetime.now().strftime("%H:%M:%S"),
                            "status": "Analysis Complete"
                        })

                # Parse state transitions showing buy signals
                entering_match = re.search(r'\[(\w+)\] analyzing -> entering: Entering buy position', line)
                if entering_match:
                    symbol = entering_match.group(1)
                    price = current_analysis.get(symbol, {}).get("price", 0.0)
                    confidence = current_analysis.get(symbol, {}).get("buy_confidence", 0.5)

                    # Generate reasoning based on confidence and current market
                    reasoning = self._generate_reasoning(symbol, confidence)

                    signals.append({
                        "symbol": symbol,
                        "action": "ENTERING POSITION",
                        "price": price,
                        "confidence": f"{confidence:.1%}",
                        "reasoning": reasoning,
                        "timestamp": datetime.now().strftime("%H:%M:%S"),
                        "status": "Entering Position"
                    })

                # Parse order placed confirmations
                order_match = re.search(r'\[(\w+)\] entering -> in_position: Order placed', line)
                if order_match:
                    symbol = order_match.group(1)
                    price = current_analysis.get(symbol, {}).get("price", 0.0)

                    signals.append({
                        "symbol": symbol,
                        "action": "ORDER EXECUTED",
                        "price": price,
                        "confidence": "100%",
                        "reasoning": "Position successfully entered",
                        "timestamp": datetime.now().strftime("%H:%M:%S"),
                        "status": "Order Executed"
                    })

            # Return most recent signals first, limit results
            return list(reversed(signals))[-limit:]

        except Exception as e:
            self.logger.error(f"Error parsing live signals: {e}")
            return []

    def _generate_reasoning(self, symbol: str, confidence: float) -> str:
        """Generate reasoning text based on confidence level"""
        if confidence >= 0.8:
            return f"Strong bullish indicators detected. High confidence buy signal with technical momentum favoring {symbol}."
        elif confidence >= 0.6:
            return f"Moderate buy signal. Technical analysis shows positive momentum for {symbol} entry."
        elif confidence >= 0.4:
            return f"Weak buy signal. Technical indicators suggest potential upside for {symbol}."
        else:
            return f"Low confidence signal. Market conditions suggest possible opportunity in {symbol}."

    def get_analysis_summary(self) -> Dict[str, Any]:
        """Get summary of current analysis activity"""
        try:
            result = subprocess.run(
                ["tail", "-n", "50", "/Users/ryanhaigh/trading_assistant/trading-agent/agent.log"],
                capture_output=True,
                text=True,
                timeout=5
            )

            if result.returncode != 0:
                return {"analyzing_count": 0, "entering_count": 0, "status": "unknown"}

            log_lines = result.stdout.strip().split('\n')
            analyzing_count = 0
            entering_count = 0

            for line in log_lines[-20:]:  # Check last 20 lines
                if "analyzing" in line and "Analyzing" in line:
                    analyzing_count += 1
                elif "entering: Entering buy position" in line:
                    entering_count += 1

            return {
                "analyzing_count": analyzing_count,
                "entering_count": entering_count,
                "status": "active" if analyzing_count > 0 or entering_count > 0 else "idle",
                "last_update": datetime.now().strftime("%H:%M:%S")
            }

        except Exception as e:
            self.logger.error(f"Error getting analysis summary: {e}")
            return {"analyzing_count": 0, "entering_count": 0, "status": "error"}

# Global instance
live_signals_parser = LiveSignalsParser()
