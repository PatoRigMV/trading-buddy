#!/usr/bin/env python3
"""
Custom Indicator Example
========================
Demonstrates how to add a custom technical indicator to the analysis engine.

This example implements a simple VWAP (Volume Weighted Average Price) indicator
and shows how to integrate it with the existing analysis pipeline.

Usage:
    python examples/custom_indicator.py
"""

import numpy as np
from dataclasses import dataclass
from typing import List, Optional
from datetime import datetime


@dataclass
class PriceBar:
    """Single price bar (OHLCV)."""
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: int


@dataclass
class IndicatorResult:
    """Result from an indicator calculation."""
    name: str
    value: float
    signal: str  # "BUY", "SELL", or "NEUTRAL"
    confidence: float  # 0-1


class CustomIndicator:
    """Base class for custom indicators."""

    def __init__(self, name: str):
        self.name = name

    def calculate(self, bars: List[PriceBar]) -> IndicatorResult:
        """Override this method to implement your indicator."""
        raise NotImplementedError


class VWAPIndicator(CustomIndicator):
    """
    Volume Weighted Average Price (VWAP)

    VWAP = Cumulative(Price * Volume) / Cumulative(Volume)

    Signals:
    - BUY when price is below VWAP (potentially undervalued)
    - SELL when price is significantly above VWAP (potentially overvalued)
    """

    def __init__(self, threshold_pct: float = 0.02):
        super().__init__("VWAP")
        self.threshold_pct = threshold_pct  # 2% threshold for signals

    def calculate(self, bars: List[PriceBar]) -> IndicatorResult:
        if not bars:
            return IndicatorResult(
                name=self.name,
                value=0,
                signal="NEUTRAL",
                confidence=0
            )

        # Calculate VWAP
        cumulative_tp_vol = 0
        cumulative_vol = 0

        for bar in bars:
            typical_price = (bar.high + bar.low + bar.close) / 3
            cumulative_tp_vol += typical_price * bar.volume
            cumulative_vol += bar.volume

        vwap = cumulative_tp_vol / cumulative_vol if cumulative_vol > 0 else 0

        # Get current price
        current_price = bars[-1].close

        # Calculate deviation from VWAP
        deviation = (current_price - vwap) / vwap if vwap > 0 else 0

        # Generate signal
        if deviation < -self.threshold_pct:
            signal = "BUY"
            confidence = min(abs(deviation) / 0.05, 1.0)  # Max confidence at 5% below
        elif deviation > self.threshold_pct:
            signal = "SELL"
            confidence = min(abs(deviation) / 0.05, 1.0)
        else:
            signal = "NEUTRAL"
            confidence = 0.5

        return IndicatorResult(
            name=self.name,
            value=round(vwap, 2),
            signal=signal,
            confidence=round(confidence, 2)
        )


class RSIIndicator(CustomIndicator):
    """
    Relative Strength Index (RSI)

    RSI = 100 - (100 / (1 + RS))
    RS = Average Gain / Average Loss
    """

    def __init__(self, period: int = 14):
        super().__init__("RSI")
        self.period = period

    def calculate(self, bars: List[PriceBar]) -> IndicatorResult:
        if len(bars) < self.period + 1:
            return IndicatorResult(
                name=self.name,
                value=50,
                signal="NEUTRAL",
                confidence=0
            )

        # Calculate price changes
        changes = []
        for i in range(1, len(bars)):
            changes.append(bars[i].close - bars[i-1].close)

        # Get recent changes for the period
        recent_changes = changes[-(self.period):]

        # Separate gains and losses
        gains = [c if c > 0 else 0 for c in recent_changes]
        losses = [abs(c) if c < 0 else 0 for c in recent_changes]

        # Calculate averages
        avg_gain = sum(gains) / self.period
        avg_loss = sum(losses) / self.period

        # Calculate RSI
        if avg_loss == 0:
            rsi = 100
        else:
            rs = avg_gain / avg_loss
            rsi = 100 - (100 / (1 + rs))

        # Generate signal
        if rsi < 30:
            signal = "BUY"  # Oversold
            confidence = (30 - rsi) / 30
        elif rsi > 70:
            signal = "SELL"  # Overbought
            confidence = (rsi - 70) / 30
        else:
            signal = "NEUTRAL"
            confidence = 0.5

        return IndicatorResult(
            name=self.name,
            value=round(rsi, 2),
            signal=signal,
            confidence=round(min(confidence, 1.0), 2)
        )


class IndicatorEngine:
    """
    Engine to run multiple indicators and combine signals.

    This is how you would integrate custom indicators into Trading Buddy.
    """

    def __init__(self):
        self.indicators: List[CustomIndicator] = []

    def add_indicator(self, indicator: CustomIndicator):
        """Add a custom indicator to the engine."""
        self.indicators.append(indicator)
        print(f"✅ Added indicator: {indicator.name}")

    def analyze(self, bars: List[PriceBar]) -> dict:
        """Run all indicators and combine results."""
        results = []

        for indicator in self.indicators:
            result = indicator.calculate(bars)
            results.append(result)

        # Combine signals
        buy_signals = sum(1 for r in results if r.signal == "BUY")
        sell_signals = sum(1 for r in results if r.signal == "SELL")

        # Calculate overall conviction
        avg_confidence = sum(r.confidence for r in results) / len(results) if results else 0

        if buy_signals > sell_signals:
            overall_signal = "BUY"
        elif sell_signals > buy_signals:
            overall_signal = "SELL"
        else:
            overall_signal = "NEUTRAL"

        return {
            "indicators": [
                {
                    "name": r.name,
                    "value": r.value,
                    "signal": r.signal,
                    "confidence": r.confidence
                }
                for r in results
            ],
            "overall_signal": overall_signal,
            "buy_signals": buy_signals,
            "sell_signals": sell_signals,
            "conviction": round(avg_confidence, 2)
        }


def generate_sample_data() -> List[PriceBar]:
    """Generate sample price data for testing."""
    import random
    random.seed(42)

    bars = []
    price = 150.0

    for i in range(100):
        # Random walk
        change = random.gauss(0, 2)
        price = max(100, price + change)

        bar = PriceBar(
            timestamp=datetime.now(),
            open=price - random.uniform(0, 1),
            high=price + random.uniform(0, 2),
            low=price - random.uniform(0, 2),
            close=price,
            volume=random.randint(100000, 1000000)
        )
        bars.append(bar)

    return bars


def main():
    print("=" * 60)
    print("Trading Buddy - Custom Indicator Example")
    print("=" * 60)

    # Create the indicator engine
    engine = IndicatorEngine()

    # Add custom indicators
    print("\n📊 Adding custom indicators...")
    engine.add_indicator(VWAPIndicator(threshold_pct=0.02))
    engine.add_indicator(RSIIndicator(period=14))

    # Generate sample data
    print("\n📈 Generating sample price data...")
    bars = generate_sample_data()
    print(f"   Generated {len(bars)} price bars")
    print(f"   Latest close: ${bars[-1].close:.2f}")

    # Run analysis
    print("\n🔍 Running indicator analysis...")
    results = engine.analyze(bars)

    # Display results
    print("\n" + "─" * 60)
    print("INDICATOR RESULTS")
    print("─" * 60)

    for indicator in results["indicators"]:
        signal_emoji = {"BUY": "🟢", "SELL": "🔴", "NEUTRAL": "⚪"}.get(indicator["signal"], "⚪")
        print(f"\n   {indicator['name']}:")
        print(f"      Value:      {indicator['value']}")
        print(f"      Signal:     {signal_emoji} {indicator['signal']}")
        print(f"      Confidence: {indicator['confidence']:.0%}")

    print("\n" + "─" * 60)
    print("OVERALL ANALYSIS")
    print("─" * 60)
    overall_emoji = {"BUY": "🟢", "SELL": "🔴", "NEUTRAL": "⚪"}.get(results["overall_signal"], "⚪")
    print(f"\n   Signal:     {overall_emoji} {results['overall_signal']}")
    print(f"   Buy votes:  {results['buy_signals']}")
    print(f"   Sell votes: {results['sell_signals']}")
    print(f"   Conviction: {results['conviction']:.0%}")

    # Show how to integrate with Trading Buddy
    print("\n" + "─" * 60)
    print("INTEGRATION WITH TRADING BUDDY")
    print("─" * 60)
    print("""
    To integrate this indicator into Trading Buddy:

    1. Add your indicator class to analysis_engine.py

    2. Register it in the AnalysisEngine.__init__():

       self.custom_indicators = [
           VWAPIndicator(threshold_pct=0.02),
           RSIIndicator(period=14),
       ]

    3. Call from the analyze() method:

       for indicator in self.custom_indicators:
           result = indicator.calculate(price_bars)
           analysis['indicators'].append(result)

    4. The risk manager will use these signals for trade decisions.
    """)


if __name__ == "__main__":
    main()
