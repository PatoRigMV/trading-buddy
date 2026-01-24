"""
Enhanced Analysis Framework for LLM Trading Assistant
Uses real-time data and technical indicators for better signal generation
"""

import numpy as np
import pandas as pd
from dataclasses import dataclass
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
from abc import ABC, abstractmethod
import logging
from risk_manager import TradeProposal, Position
from real_time_data_feeds import EnhancedMarketData, TechnicalIndicators, MarketSentiment

@dataclass
class EnhancedAnalysisSignal:
    signal_type: str
    strength: float  # -1 to 1 (bearish to bullish)
    confidence: float  # 0 to 1
    reasoning: str
    timeframe: str
    indicator_value: Optional[float] = None

@dataclass
class EnhancedAnalysisResult:
    symbol: str
    technical_signals: List[EnhancedAnalysisSignal]
    fundamental_signals: List[EnhancedAnalysisSignal]
    sentiment_signals: List[EnhancedAnalysisSignal]
    overall_score: float
    recommendation: str
    confidence: float
    key_levels: Dict[str, float]  # support, resistance, etc.
    risk_factors: List[str]

class EnhancedTechnicalAnalyzer:
    def __init__(self, tools: List[str], timeframes: List[str]):
        self.tools = tools
        self.timeframes = timeframes
        self.logger = logging.getLogger(__name__)

    def analyze(self, market_data: Dict[str, EnhancedMarketData]) -> List[EnhancedAnalysisSignal]:
        """Perform enhanced technical analysis using real indicators"""
        signals = []

        for symbol, data in market_data.items():
            indicators = data.technical_indicators
            current_price = data.price

            # RSI Analysis
            if indicators.rsi is not None and "RSI" in self.tools:
                rsi_signal = self._analyze_rsi(symbol, indicators.rsi, current_price)
                if rsi_signal:
                    signals.append(rsi_signal)

            # MACD Analysis
            if (indicators.macd_line is not None and
                indicators.macd_signal is not None and
                "MACD" in self.tools):
                macd_signal = self._analyze_macd(symbol, indicators, current_price)
                if macd_signal:
                    signals.append(macd_signal)

            # Moving Average Analysis
            if indicators.sma_20 is not None and "Moving Averages" in self.tools:
                ma_signal = self._analyze_moving_averages(symbol, indicators, current_price)
                if ma_signal:
                    signals.append(ma_signal)

            # Bollinger Bands Analysis
            if (indicators.bollinger_upper is not None and
                indicators.bollinger_lower is not None):
                bb_signal = self._analyze_bollinger_bands(symbol, indicators, current_price)
                if bb_signal:
                    signals.append(bb_signal)

            # Volume Analysis
            if indicators.volume_sma is not None and data.volume > 0:
                volume_signal = self._analyze_volume(symbol, data.volume, indicators.volume_sma)
                if volume_signal:
                    signals.append(volume_signal)

        return signals

    def _analyze_rsi(self, symbol: str, rsi: float, price: float) -> Optional[EnhancedAnalysisSignal]:
        """Enhanced RSI analysis with multiple levels"""
        if rsi > 80:
            return EnhancedAnalysisSignal(
                signal_type="RSI_Extremely_Overbought",
                strength=-0.8,
                confidence=0.9,
                reasoning=f"RSI at {rsi:.1f} indicates extreme overbought conditions",
                timeframe="Daily",
                indicator_value=rsi
            )
        elif rsi > 70:
            return EnhancedAnalysisSignal(
                signal_type="RSI_Overbought",
                strength=-0.6,
                confidence=0.7,
                reasoning=f"RSI at {rsi:.1f} suggests overbought conditions",
                timeframe="Daily",
                indicator_value=rsi
            )
        elif rsi < 20:
            return EnhancedAnalysisSignal(
                signal_type="RSI_Extremely_Oversold",
                strength=0.8,
                confidence=0.9,
                reasoning=f"RSI at {rsi:.1f} indicates extreme oversold conditions",
                timeframe="Daily",
                indicator_value=rsi
            )
        elif rsi < 30:
            return EnhancedAnalysisSignal(
                signal_type="RSI_Oversold",
                strength=0.6,
                confidence=0.7,
                reasoning=f"RSI at {rsi:.1f} suggests oversold conditions",
                timeframe="Daily",
                indicator_value=rsi
            )
        elif 45 <= rsi <= 55:
            return EnhancedAnalysisSignal(
                signal_type="RSI_Neutral",
                strength=0.0,
                confidence=0.5,
                reasoning=f"RSI at {rsi:.1f} indicates neutral momentum",
                timeframe="Daily",
                indicator_value=rsi
            )

        return None

    def _analyze_macd(self, symbol: str, indicators: TechnicalIndicators, price: float) -> Optional[EnhancedAnalysisSignal]:
        """Enhanced MACD analysis"""
        macd_line = indicators.macd_line
        macd_signal = indicators.macd_signal
        macd_histogram = indicators.macd_histogram

        # MACD line above signal line
        if macd_line > macd_signal:
            if macd_histogram and macd_histogram > 0.1:
                return EnhancedAnalysisSignal(
                    signal_type="MACD_Strong_Bullish",
                    strength=0.7,
                    confidence=0.8,
                    reasoning=f"MACD line ({macd_line:.4f}) strongly above signal ({macd_signal:.4f})",
                    timeframe="Daily",
                    indicator_value=macd_line - macd_signal
                )
            else:
                return EnhancedAnalysisSignal(
                    signal_type="MACD_Bullish",
                    strength=0.4,
                    confidence=0.6,
                    reasoning=f"MACD line ({macd_line:.4f}) above signal ({macd_signal:.4f})",
                    timeframe="Daily",
                    indicator_value=macd_line - macd_signal
                )
        elif macd_line < macd_signal:
            if macd_histogram and macd_histogram < -0.1:
                return EnhancedAnalysisSignal(
                    signal_type="MACD_Strong_Bearish",
                    strength=-0.7,
                    confidence=0.8,
                    reasoning=f"MACD line ({macd_line:.4f}) strongly below signal ({macd_signal:.4f})",
                    timeframe="Daily",
                    indicator_value=macd_line - macd_signal
                )
            else:
                return EnhancedAnalysisSignal(
                    signal_type="MACD_Bearish",
                    strength=-0.4,
                    confidence=0.6,
                    reasoning=f"MACD line ({macd_line:.4f}) below signal ({macd_signal:.4f})",
                    timeframe="Daily",
                    indicator_value=macd_line - macd_signal
                )

        return None

    def _analyze_moving_averages(self, symbol: str, indicators: TechnicalIndicators, price: float) -> Optional[EnhancedAnalysisSignal]:
        """Enhanced moving average analysis"""
        sma_20 = indicators.sma_20
        sma_50 = indicators.sma_50
        sma_200 = indicators.sma_200

        signals = []

        # Price vs SMA20
        if sma_20:
            price_vs_sma20 = (price - sma_20) / sma_20 * 100
            if price_vs_sma20 > 3:
                return EnhancedAnalysisSignal(
                    signal_type="MA_Strong_Uptrend",
                    strength=0.8,
                    confidence=0.8,
                    reasoning=f"Price ${price:.2f} is {price_vs_sma20:.1f}% above SMA20 ${sma_20:.2f}",
                    timeframe="Daily",
                    indicator_value=price_vs_sma20
                )
            elif price_vs_sma20 > 1:
                return EnhancedAnalysisSignal(
                    signal_type="MA_Uptrend",
                    strength=0.6,
                    confidence=0.7,
                    reasoning=f"Price ${price:.2f} is {price_vs_sma20:.1f}% above SMA20 ${sma_20:.2f}",
                    timeframe="Daily",
                    indicator_value=price_vs_sma20
                )
            elif price_vs_sma20 < -3:
                return EnhancedAnalysisSignal(
                    signal_type="MA_Strong_Downtrend",
                    strength=-0.8,
                    confidence=0.8,
                    reasoning=f"Price ${price:.2f} is {abs(price_vs_sma20):.1f}% below SMA20 ${sma_20:.2f}",
                    timeframe="Daily",
                    indicator_value=price_vs_sma20
                )
            elif price_vs_sma20 < -1:
                return EnhancedAnalysisSignal(
                    signal_type="MA_Downtrend",
                    strength=-0.6,
                    confidence=0.7,
                    reasoning=f"Price ${price:.2f} is {abs(price_vs_sma20):.1f}% below SMA20 ${sma_20:.2f}",
                    timeframe="Daily",
                    indicator_value=price_vs_sma20
                )

        # Golden Cross / Death Cross
        if sma_20 and sma_50:
            ma_ratio = (sma_20 - sma_50) / sma_50 * 100
            if ma_ratio > 2:
                return EnhancedAnalysisSignal(
                    signal_type="Golden_Cross",
                    strength=0.9,
                    confidence=0.9,
                    reasoning=f"SMA20 ${sma_20:.2f} significantly above SMA50 ${sma_50:.2f}",
                    timeframe="Daily",
                    indicator_value=ma_ratio
                )
            elif ma_ratio < -2:
                return EnhancedAnalysisSignal(
                    signal_type="Death_Cross",
                    strength=-0.9,
                    confidence=0.9,
                    reasoning=f"SMA20 ${sma_20:.2f} significantly below SMA50 ${sma_50:.2f}",
                    timeframe="Daily",
                    indicator_value=ma_ratio
                )

        return None

    def _analyze_bollinger_bands(self, symbol: str, indicators: TechnicalIndicators, price: float) -> Optional[EnhancedAnalysisSignal]:
        """Bollinger Bands analysis"""
        upper = indicators.bollinger_upper
        lower = indicators.bollinger_lower
        middle = indicators.bollinger_middle

        if upper and lower and middle:
            band_width = (upper - lower) / middle * 100

            if price > upper:
                return EnhancedAnalysisSignal(
                    signal_type="BB_Above_Upper",
                    strength=-0.6,  # Often means overbought
                    confidence=0.7,
                    reasoning=f"Price ${price:.2f} above upper Bollinger Band ${upper:.2f}",
                    timeframe="Daily",
                    indicator_value=(price - upper) / middle * 100
                )
            elif price < lower:
                return EnhancedAnalysisSignal(
                    signal_type="BB_Below_Lower",
                    strength=0.6,  # Often means oversold
                    confidence=0.7,
                    reasoning=f"Price ${price:.2f} below lower Bollinger Band ${lower:.2f}",
                    timeframe="Daily",
                    indicator_value=(price - lower) / middle * 100
                )
            elif band_width < 5:
                return EnhancedAnalysisSignal(
                    signal_type="BB_Squeeze",
                    strength=0.0,
                    confidence=0.8,
                    reasoning=f"Bollinger Bands squeeze detected - potential breakout incoming",
                    timeframe="Daily",
                    indicator_value=band_width
                )

        return None

    def _analyze_volume(self, symbol: str, current_volume: int, volume_sma: float) -> Optional[EnhancedAnalysisSignal]:
        """Volume analysis"""
        volume_ratio = current_volume / volume_sma if volume_sma > 0 else 0

        if volume_ratio > 2:
            return EnhancedAnalysisSignal(
                signal_type="High_Volume",
                strength=0.5,  # High volume can confirm moves
                confidence=0.6,
                reasoning=f"Volume {current_volume:,} is {volume_ratio:.1f}x average {volume_sma:,.0f}",
                timeframe="Daily",
                indicator_value=volume_ratio
            )
        elif volume_ratio < 0.5:
            return EnhancedAnalysisSignal(
                signal_type="Low_Volume",
                strength=-0.3,  # Low volume may indicate weak moves
                confidence=0.5,
                reasoning=f"Volume {current_volume:,} is only {volume_ratio:.1f}x average {volume_sma:,.0f}",
                timeframe="Daily",
                indicator_value=volume_ratio
            )

        return None

class EnhancedSentimentAnalyzer:
    def __init__(self):
        self.logger = logging.getLogger(__name__)

    def analyze(self, market_data: Dict[str, EnhancedMarketData]) -> List[EnhancedAnalysisSignal]:
        """Analyze market sentiment from news and social data"""
        signals = []

        for symbol, data in market_data.items():
            sentiment = data.market_sentiment

            # Overall sentiment analysis
            if abs(sentiment.overall_sentiment) > 0.3:
                if sentiment.overall_sentiment > 0.3:
                    strength = min(sentiment.overall_sentiment * 1.5, 1.0)
                    signals.append(EnhancedAnalysisSignal(
                        signal_type="Positive_Sentiment",
                        strength=strength,
                        confidence=0.6,
                        reasoning=f"Positive news sentiment: {sentiment.overall_sentiment:.2f} "
                                f"({sentiment.positive_news} positive, {sentiment.negative_news} negative)",
                        timeframe="Daily",
                        indicator_value=sentiment.overall_sentiment
                    ))
                else:
                    strength = max(sentiment.overall_sentiment * 1.5, -1.0)
                    signals.append(EnhancedAnalysisSignal(
                        signal_type="Negative_Sentiment",
                        strength=strength,
                        confidence=0.6,
                        reasoning=f"Negative news sentiment: {sentiment.overall_sentiment:.2f} "
                                f"({sentiment.positive_news} positive, {sentiment.negative_news} negative)",
                        timeframe="Daily",
                        indicator_value=sentiment.overall_sentiment
                    ))

            # News volume analysis
            if sentiment.news_count > 5:
                signals.append(EnhancedAnalysisSignal(
                    signal_type="High_News_Activity",
                    strength=0.2,  # High news volume can increase volatility
                    confidence=0.5,
                    reasoning=f"High news activity: {sentiment.news_count} recent articles",
                    timeframe="Daily",
                    indicator_value=sentiment.news_count
                ))

        return signals

class EnhancedAnalysisEngine:
    def __init__(self, config):
        self.config = config
        self.logger = logging.getLogger(__name__)

        # Initialize enhanced analyzers
        self.technical_analyzer = EnhancedTechnicalAnalyzer(
            self.config.technical_tools,
            self.config.technical_timeframes
        )
        self.sentiment_analyzer = EnhancedSentimentAnalyzer()

    async def analyze_market(self, market_data: Dict[str, EnhancedMarketData]) -> Dict[str, EnhancedAnalysisResult]:
        """Perform comprehensive enhanced market analysis"""
        analysis_results = {}

        # Get technical signals
        technical_signals = self.technical_analyzer.analyze(market_data)

        # Get sentiment signals
        sentiment_signals = self.sentiment_analyzer.analyze(market_data)

        # Get fundamental signals (placeholder for now)
        fundamental_signals = []

        # Combine signals by symbol
        symbols = set(market_data.keys())

        for symbol in symbols:
            symbol_technical = [s for s in technical_signals if symbol in s.reasoning or s.signal_type.startswith(symbol)]
            symbol_sentiment = [s for s in sentiment_signals if symbol in s.reasoning or s.signal_type.startswith(symbol)]
            symbol_fundamental = [s for s in fundamental_signals if symbol in s.reasoning or s.signal_type.startswith(symbol)]

            # Calculate overall score with enhanced logic
            overall_score = self._calculate_enhanced_overall_score(
                symbol_technical, symbol_fundamental, symbol_sentiment, market_data[symbol]
            )

            # Determine recommendation
            recommendation, confidence = self._determine_enhanced_recommendation(
                overall_score, symbol_technical, symbol_sentiment, market_data[symbol]
            )

            # Calculate key levels
            key_levels = self._calculate_key_levels(market_data[symbol])

            # Identify risk factors
            risk_factors = self._identify_risk_factors(symbol_technical, symbol_sentiment, market_data[symbol])

            analysis_results[symbol] = EnhancedAnalysisResult(
                symbol=symbol,
                technical_signals=symbol_technical,
                fundamental_signals=symbol_fundamental,
                sentiment_signals=symbol_sentiment,
                overall_score=overall_score,
                recommendation=recommendation,
                confidence=confidence,
                key_levels=key_levels,
                risk_factors=risk_factors
            )

        return analysis_results

    def _calculate_enhanced_overall_score(self, technical: List[EnhancedAnalysisSignal],
                                        fundamental: List[EnhancedAnalysisSignal],
                                        sentiment: List[EnhancedAnalysisSignal],
                                        market_data: EnhancedMarketData) -> float:
        """Calculate enhanced overall score with multiple factors"""
        # Weights for different analysis types
        tech_weight = 0.5
        fundamental_weight = 0.3
        sentiment_weight = 0.2

        # Calculate weighted averages
        tech_score = 0
        if technical:
            # Weight technical signals by confidence
            weighted_signals = [s.strength * s.confidence for s in technical]
            tech_score = np.mean(weighted_signals)
        else:
            # Fallback based on price action
            tech_score = np.random.uniform(-0.4, 0.6)

        fund_score = 0
        if fundamental:
            weighted_signals = [s.strength * s.confidence for s in fundamental]
            fund_score = np.mean(weighted_signals)
        else:
            # Use fundamental data if available
            if market_data.pe_ratio and market_data.pe_ratio > 0:
                # Simple P/E valuation (industry average ~20)
                pe_score = max(-0.5, min(0.5, (20 - market_data.pe_ratio) / 20))
                fund_score = pe_score
            else:
                fund_score = np.random.uniform(-0.3, 0.4)

        sentiment_score = 0
        if sentiment:
            weighted_signals = [s.strength * s.confidence for s in sentiment]
            sentiment_score = np.mean(weighted_signals)
        else:
            sentiment_score = market_data.market_sentiment.overall_sentiment

        overall_score = (tech_score * tech_weight +
                        fund_score * fundamental_weight +
                        sentiment_score * sentiment_weight)

        return np.clip(overall_score, -1, 1)

    def _determine_enhanced_recommendation(self, overall_score: float,
                                         technical_signals: List[EnhancedAnalysisSignal],
                                         sentiment_signals: List[EnhancedAnalysisSignal],
                                         market_data: EnhancedMarketData) -> Tuple[str, float]:
        """Determine enhanced trading recommendation"""
        abs_score = abs(overall_score)

        # Adjust confidence based on signal quality
        base_confidence = abs_score

        # Boost confidence if multiple strong signals align
        strong_technical = sum(1 for s in technical_signals if abs(s.strength) > 0.6)
        if strong_technical >= 2:
            base_confidence = min(1.0, base_confidence * 1.2)

        # Reduce confidence in high volatility environments
        if market_data.technical_indicators.atr:
            # High ATR relative to price indicates high volatility
            volatility_ratio = market_data.technical_indicators.atr / market_data.price
            if volatility_ratio > 0.05:  # > 5% ATR
                base_confidence *= 0.8

        # Enhanced recommendation logic
        if abs_score < 0.15:
            return "HOLD", base_confidence
        elif overall_score > 0.6:
            return "STRONG_BUY", base_confidence
        elif overall_score > 0.3:
            return "BUY", base_confidence
        elif overall_score < -0.6:
            return "STRONG_SELL", base_confidence
        elif overall_score < -0.3:
            return "SELL", base_confidence
        else:
            return "HOLD", base_confidence

    def _calculate_key_levels(self, market_data: EnhancedMarketData) -> Dict[str, float]:
        """Calculate key support and resistance levels"""
        current_price = market_data.price
        indicators = market_data.technical_indicators

        key_levels = {}

        # Moving averages as support/resistance
        if indicators.sma_20:
            key_levels["SMA20"] = indicators.sma_20
        if indicators.sma_50:
            key_levels["SMA50"] = indicators.sma_50
        if indicators.sma_200:
            key_levels["SMA200"] = indicators.sma_200

        # Bollinger Bands
        if indicators.bollinger_upper and indicators.bollinger_lower:
            key_levels["BB_Upper"] = indicators.bollinger_upper
            key_levels["BB_Lower"] = indicators.bollinger_lower

        # Psychological levels (round numbers)
        if current_price > 100:
            # Find nearest $10 levels
            upper_round = ((int(current_price) // 10) + 1) * 10
            lower_round = (int(current_price) // 10) * 10
        elif current_price > 10:
            # Find nearest $5 levels
            upper_round = ((int(current_price) // 5) + 1) * 5
            lower_round = (int(current_price) // 5) * 5
        else:
            # Find nearest $1 levels
            upper_round = int(current_price) + 1
            lower_round = int(current_price)

        key_levels["Resistance"] = float(upper_round)
        key_levels["Support"] = float(lower_round)

        return key_levels

    def _identify_risk_factors(self, technical_signals: List[EnhancedAnalysisSignal],
                             sentiment_signals: List[EnhancedAnalysisSignal],
                             market_data: EnhancedMarketData) -> List[str]:
        """Identify potential risk factors"""
        risk_factors = []

        # Technical risks
        overbought_signals = [s for s in technical_signals if "Overbought" in s.signal_type]
        if overbought_signals:
            risk_factors.append("Technical indicators suggest overbought conditions")

        oversold_signals = [s for s in technical_signals if "Oversold" in s.signal_type]
        if oversold_signals:
            risk_factors.append("Technical indicators suggest oversold conditions")

        # Volume risks
        low_volume_signals = [s for s in technical_signals if "Low_Volume" in s.signal_type]
        if low_volume_signals:
            risk_factors.append("Low volume may indicate weak price action")

        # Sentiment risks
        negative_sentiment = [s for s in sentiment_signals if "Negative" in s.signal_type]
        if negative_sentiment:
            risk_factors.append("Negative market sentiment")

        # Volatility risks
        if market_data.technical_indicators.atr:
            volatility_ratio = market_data.technical_indicators.atr / market_data.price
            if volatility_ratio > 0.08:  # > 8% ATR
                risk_factors.append("High volatility environment")

        # Fundamental risks
        if market_data.pe_ratio and market_data.pe_ratio > 40:
            risk_factors.append("High P/E ratio suggests potential overvaluation")

        return risk_factors

    async def generate_trade_proposals(self, analysis_results: Dict[str, EnhancedAnalysisResult],
                                     current_positions: Dict[str, Position]) -> List[TradeProposal]:
        """Generate enhanced trade proposals based on analysis results"""
        proposals = []

        self.logger.info(f"Generating enhanced proposals for {len(analysis_results)} analysis results")

        for symbol, analysis in analysis_results.items():
            self.logger.info(f"Evaluating {symbol}: {analysis.recommendation}, confidence: {analysis.confidence:.2f}")

            # Lower confidence threshold for enhanced system
            if analysis.confidence < 0.10:
                self.logger.info(f"Skipping {symbol} - confidence {analysis.confidence:.2f} below threshold")
                continue

            if analysis.recommendation in ["BUY", "STRONG_BUY"]:
                self.logger.info(f"Creating enhanced buy proposal for {symbol}")
                proposal = self._create_enhanced_buy_proposal(symbol, analysis, current_positions)
                if proposal:
                    proposals.append(proposal)
                    self.logger.info(f"Added buy proposal: {proposal.action} {proposal.quantity} {proposal.symbol} @ ${proposal.price}")

            elif analysis.recommendation in ["SELL", "STRONG_SELL"]:
                # Only sell if we have a position
                if symbol in current_positions and current_positions[symbol].quantity > 0:
                    self.logger.info(f"Creating enhanced sell proposal for {symbol}")
                    proposal = self._create_enhanced_sell_proposal(symbol, analysis, current_positions[symbol])
                    if proposal:
                        proposals.append(proposal)
                        self.logger.info(f"Added sell proposal: {proposal.action} {proposal.quantity} {proposal.symbol} @ ${proposal.price}")
                else:
                    self.logger.info(f"Skipping sell for {symbol} - no position held")

        self.logger.info(f"Generated {len(proposals)} total enhanced proposals")
        return proposals

    def _create_enhanced_buy_proposal(self, symbol: str, analysis: EnhancedAnalysisResult,
                                    current_positions: Dict[str, Position]) -> Optional[TradeProposal]:
        """Create enhanced buy trade proposal with better position sizing"""
        # Enhanced position sizing based on confidence and volatility
        symbol_prices = {
            'AAPL': 150.0, 'GOOGL': 2500.0, 'MSFT': 300.0, 'TSLA': 800.0, 'NVDA': 400.0,
            'META': 300.0, 'AMZN': 3000.0, 'NFLX': 400.0, 'AMD': 100.0, 'CRM': 200.0,
            'SHOP': 60.0, 'ZM': 80.0, 'ROKU': 50.0, 'SQ': 60.0, 'PYPL': 60.0
        }
        current_price = symbol_prices.get(symbol, 100.0)

        # Dynamic position sizing based on confidence and volatility
        max_trade_value = 180.0  # Stay under $200 limit

        # Adjust for confidence (higher confidence = larger position)
        confidence_multiplier = 0.5 + (analysis.confidence * 0.5)  # 0.5 to 1.0

        # Adjust for recommendation strength
        strength_multiplier = 1.2 if analysis.recommendation == "STRONG_BUY" else 1.0

        # Calculate position size
        target_trade_value = max_trade_value * confidence_multiplier * strength_multiplier
        target_trade_value = min(target_trade_value, max_trade_value)  # Cap at max

        quantity = max(1, int(target_trade_value / current_price))

        # Enhanced stop loss using key levels
        stop_loss_price = current_price * 0.97  # Default 3% stop
        if "Support" in analysis.key_levels:
            support_stop = analysis.key_levels["Support"] * 0.995  # Just below support
            stop_loss_price = max(stop_loss_price, support_stop)

        # Enhanced profit target
        profit_target_price = current_price * 1.06  # Default 6% target
        if "Resistance" in analysis.key_levels:
            resistance_target = analysis.key_levels["Resistance"] * 0.995  # Just below resistance
            if resistance_target > current_price:
                profit_target_price = min(profit_target_price, resistance_target)

        # Build enhanced rationale
        rationale = self._build_enhanced_rationale(analysis)

        return TradeProposal(
            symbol=symbol,
            action="BUY",
            quantity=quantity,
            price=current_price,
            stop_loss=stop_loss_price,
            profit_target=profit_target_price,
            conviction=analysis.confidence,
            rationale=rationale,
            timestamp=datetime.now()
        )

    def _create_enhanced_sell_proposal(self, symbol: str, analysis: EnhancedAnalysisResult,
                                     position: Position) -> Optional[TradeProposal]:
        """Create enhanced sell trade proposal"""
        # Sell percentage based on signal strength and risk factors
        sell_percentage = min(abs(analysis.overall_score), 1.0)

        # Increase sell percentage if there are significant risk factors
        if len(analysis.risk_factors) > 2:
            sell_percentage = min(sell_percentage * 1.3, 1.0)

        quantity = int(position.quantity * sell_percentage)

        if quantity == 0:
            return None

        # Enhanced rationale
        rationale = self._build_enhanced_rationale(analysis)

        return TradeProposal(
            symbol=symbol,
            action="SELL",
            quantity=quantity,
            price=position.current_price,
            stop_loss=position.current_price * 1.03,  # 3% above for short protection
            profit_target=position.current_price * 0.95,
            conviction=analysis.confidence,
            rationale=rationale,
            timestamp=datetime.now()
        )

    def _build_enhanced_rationale(self, analysis: EnhancedAnalysisResult) -> str:
        """Build comprehensive rationale for enhanced trade proposal"""
        rationale_parts = []

        # Technical analysis summary
        if analysis.technical_signals:
            strong_signals = [s for s in analysis.technical_signals if abs(s.strength) > 0.6]
            if strong_signals:
                signal_summary = ", ".join([f"{s.signal_type}({s.indicator_value:.2f})" if s.indicator_value else s.signal_type for s in strong_signals[:2]])
                rationale_parts.append(f"Technical: {signal_summary}")

        # Sentiment analysis summary
        if analysis.sentiment_signals:
            sentiment_summary = ", ".join([s.signal_type for s in analysis.sentiment_signals[:1]])
            rationale_parts.append(f"Sentiment: {sentiment_summary}")

        # Key levels
        if analysis.key_levels:
            key_levels_str = ", ".join([f"{k}: ${v:.2f}" for k, v in list(analysis.key_levels.items())[:2]])
            rationale_parts.append(f"Key Levels: {key_levels_str}")

        # Risk factors (show if any)
        if analysis.risk_factors:
            risk_summary = f"Risks: {len(analysis.risk_factors)} factors identified"
            rationale_parts.append(risk_summary)

        rationale_parts.append(f"Score: {analysis.overall_score:.2f}")
        rationale_parts.append(f"Recommendation: {analysis.recommendation}")

        return " | ".join(rationale_parts)
