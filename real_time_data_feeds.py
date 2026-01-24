"""
Real-Time Data Feeds Manager
Provides live market data, technical indicators, and news sentiment
"""

import yfinance as yf
import pandas as pd
import pandas_ta as ta
import numpy as np
import asyncio
import aiohttp
from dataclasses import dataclass
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
import logging
from textblob import TextBlob
import json
import time
from analysis_engine import MarketData

@dataclass
class TechnicalIndicators:
    rsi: Optional[float] = None
    macd_line: Optional[float] = None
    macd_signal: Optional[float] = None
    macd_histogram: Optional[float] = None
    sma_20: Optional[float] = None
    sma_50: Optional[float] = None
    sma_200: Optional[float] = None
    ema_12: Optional[float] = None
    ema_26: Optional[float] = None
    bollinger_upper: Optional[float] = None
    bollinger_lower: Optional[float] = None
    bollinger_middle: Optional[float] = None
    volume_sma: Optional[float] = None
    atr: Optional[float] = None

@dataclass
class NewsItem:
    title: str
    summary: str
    sentiment_score: float  # -1 to 1
    sentiment_label: str    # "positive", "negative", "neutral"
    url: str
    published_time: datetime
    source: str

@dataclass
class MarketSentiment:
    overall_sentiment: float  # -1 to 1
    news_count: int
    positive_news: int
    negative_news: int
    neutral_news: int
    latest_news: List[NewsItem]

@dataclass
class EnhancedMarketData(MarketData):
    technical_indicators: TechnicalIndicators
    market_sentiment: MarketSentiment
    market_cap: Optional[float] = None
    pe_ratio: Optional[float] = None
    dividend_yield: Optional[float] = None
    beta: Optional[float] = None
    short_ratio: Optional[float] = None
    institutional_holdings: Optional[float] = None

class RealTimeDataFeedManager:
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.cache = {}
        self.cache_timeout = 60  # 1 minute cache
        self.session = None

        # Default watchlist of popular stocks
        self.watchlist = [
            'AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA',
            'NVDA', 'META', 'NFLX', 'AMD', 'CRM',
            'SHOP', 'ZM', 'ROKU', 'SQ', 'PYPL'
        ]

    async def initialize(self):
        """Initialize the data feed manager"""
        self.session = aiohttp.ClientSession()
        self.logger.info("Real-time data feed manager initialized")

        # Warm up the cache with initial data
        await self.get_current_data(self.watchlist[:5])

    async def get_current_data(self, symbols: Optional[List[str]] = None) -> Dict[str, EnhancedMarketData]:
        """Get current market data with technical indicators and sentiment"""
        if symbols is None:
            symbols = self.watchlist[:5]  # Default to top 5

        market_data = {}

        for symbol in symbols:
            try:
                # Check cache first
                cache_key = f"{symbol}_{int(time.time() / self.cache_timeout)}"
                if cache_key in self.cache:
                    market_data[symbol] = self.cache[cache_key]
                    continue

                self.logger.info(f"Fetching real-time data for {symbol}")

                # Get stock data
                ticker = yf.Ticker(symbol)

                # Get current price and basic info
                info = ticker.info
                hist = ticker.history(period="5d", interval="1h")  # Get hourly data for better indicators

                if hist.empty:
                    self.logger.warning(f"No historical data available for {symbol}")
                    continue

                current_price = float(hist['Close'].iloc[-1])
                volume = int(hist['Volume'].iloc[-1])

                # Calculate technical indicators
                technical_indicators = await self._calculate_technical_indicators(hist)

                # Get market sentiment (simplified for now)
                market_sentiment = await self._get_market_sentiment(symbol)

                # Create OHLC data
                ohlc = {
                    'open': float(hist['Open'].iloc[-1]),
                    'high': float(hist['High'].iloc[-1]),
                    'low': float(hist['Low'].iloc[-1]),
                    'close': current_price
                }

                # Create enhanced market data
                enhanced_data = EnhancedMarketData(
                    symbol=symbol,
                    price=current_price,
                    volume=volume,
                    timestamp=datetime.now(),
                    ohlc=ohlc,
                    technical_indicators=technical_indicators,
                    market_sentiment=market_sentiment,
                    market_cap=info.get('marketCap'),
                    pe_ratio=info.get('trailingPE'),
                    dividend_yield=info.get('dividendYield'),
                    beta=info.get('beta'),
                    short_ratio=info.get('shortRatio'),
                    institutional_holdings=info.get('heldPercentInstitutions')
                )

                market_data[symbol] = enhanced_data
                self.cache[cache_key] = enhanced_data

                self.logger.info(f"Retrieved data for {symbol}: ${current_price:.2f} "
                               f"(RSI: {technical_indicators.rsi:.1f if technical_indicators.rsi else 'N/A'})")

            except Exception as e:
                self.logger.error(f"Error fetching data for {symbol}: {str(e)}")
                continue

        return market_data

    async def _calculate_technical_indicators(self, hist: pd.DataFrame) -> TechnicalIndicators:
        """Calculate technical indicators from historical data"""
        try:
            # Ensure we have enough data
            if len(hist) < 50:
                self.logger.warning("Insufficient data for full technical analysis")

            # RSI (14 period)
            rsi = ta.rsi(hist['Close'], length=14).iloc[-1] if len(hist) >= 14 else None

            # MACD
            macd = ta.macd(hist['Close'])
            macd_line = macd['MACD_12_26_9'].iloc[-1] if not macd.empty else None
            macd_signal = macd['MACDs_12_26_9'].iloc[-1] if not macd.empty else None
            macd_histogram = macd['MACDh_12_26_9'].iloc[-1] if not macd.empty else None

            # Moving Averages
            sma_20 = ta.sma(hist['Close'], length=20).iloc[-1] if len(hist) >= 20 else None
            sma_50 = ta.sma(hist['Close'], length=50).iloc[-1] if len(hist) >= 50 else None
            sma_200 = ta.sma(hist['Close'], length=200).iloc[-1] if len(hist) >= 200 else None

            # EMAs
            ema_12 = ta.ema(hist['Close'], length=12).iloc[-1] if len(hist) >= 12 else None
            ema_26 = ta.ema(hist['Close'], length=26).iloc[-1] if len(hist) >= 26 else None

            # Bollinger Bands
            bbands = ta.bbands(hist['Close'], length=20)
            bollinger_upper = bbands['BBU_20_2.0'].iloc[-1] if not bbands.empty else None
            bollinger_lower = bbands['BBL_20_2.0'].iloc[-1] if not bbands.empty else None
            bollinger_middle = bbands['BBM_20_2.0'].iloc[-1] if not bbands.empty else None

            # Volume SMA
            volume_sma = ta.sma(hist['Volume'], length=20).iloc[-1] if len(hist) >= 20 else None

            # ATR (Average True Range)
            atr = ta.atr(hist['High'], hist['Low'], hist['Close'], length=14).iloc[-1] if len(hist) >= 14 else None

            return TechnicalIndicators(
                rsi=float(rsi) if rsi is not None and not pd.isna(rsi) else None,
                macd_line=float(macd_line) if macd_line is not None and not pd.isna(macd_line) else None,
                macd_signal=float(macd_signal) if macd_signal is not None and not pd.isna(macd_signal) else None,
                macd_histogram=float(macd_histogram) if macd_histogram is not None and not pd.isna(macd_histogram) else None,
                sma_20=float(sma_20) if sma_20 is not None and not pd.isna(sma_20) else None,
                sma_50=float(sma_50) if sma_50 is not None and not pd.isna(sma_50) else None,
                sma_200=float(sma_200) if sma_200 is not None and not pd.isna(sma_200) else None,
                ema_12=float(ema_12) if ema_12 is not None and not pd.isna(ema_12) else None,
                ema_26=float(ema_26) if ema_26 is not None and not pd.isna(ema_26) else None,
                bollinger_upper=float(bollinger_upper) if bollinger_upper is not None and not pd.isna(bollinger_upper) else None,
                bollinger_lower=float(bollinger_lower) if bollinger_lower is not None and not pd.isna(bollinger_lower) else None,
                bollinger_middle=float(bollinger_middle) if bollinger_middle is not None and not pd.isna(bollinger_middle) else None,
                volume_sma=float(volume_sma) if volume_sma is not None and not pd.isna(volume_sma) else None,
                atr=float(atr) if atr is not None and not pd.isna(atr) else None
            )

        except Exception as e:
            self.logger.error(f"Error calculating technical indicators: {str(e)}")
            return TechnicalIndicators()

    async def _get_market_sentiment(self, symbol: str) -> MarketSentiment:
        """Get market sentiment from news analysis (simplified version)"""
        try:
            # For now, simulate sentiment analysis
            # In a production system, you'd integrate with news APIs like:
            # - News API, Alpha Vantage News, Finnhub, etc.

            # Simulate some news sentiment
            news_items = []
            sentiment_scores = []

            # Create some realistic simulated news
            simulated_news = [
                {
                    "title": f"{symbol} Reports Strong Q3 Earnings",
                    "summary": f"{symbol} exceeded analyst expectations with strong revenue growth",
                    "sentiment": 0.7,
                    "source": "MarketWatch"
                },
                {
                    "title": f"Analyst Upgrades {symbol} Price Target",
                    "summary": f"Wall Street analyst raises {symbol} target citing strong fundamentals",
                    "sentiment": 0.5,
                    "source": "Reuters"
                },
                {
                    "title": f"{symbol} Faces Regulatory Challenges",
                    "summary": f"New regulations may impact {symbol}'s growth prospects",
                    "sentiment": -0.3,
                    "source": "Bloomberg"
                }
            ]

            for news in simulated_news:
                sentiment_score = news["sentiment"] + np.random.normal(0, 0.1)  # Add some noise
                sentiment_scores.append(sentiment_score)

                # Determine sentiment label
                if sentiment_score > 0.1:
                    sentiment_label = "positive"
                elif sentiment_score < -0.1:
                    sentiment_label = "negative"
                else:
                    sentiment_label = "neutral"

                news_item = NewsItem(
                    title=news["title"],
                    summary=news["summary"],
                    sentiment_score=sentiment_score,
                    sentiment_label=sentiment_label,
                    url=f"https://example.com/news/{symbol.lower()}",
                    published_time=datetime.now() - timedelta(hours=np.random.randint(1, 24)),
                    source=news["source"]
                )
                news_items.append(news_item)

            # Calculate overall sentiment
            overall_sentiment = np.mean(sentiment_scores) if sentiment_scores else 0.0

            # Count sentiment categories
            positive_count = sum(1 for score in sentiment_scores if score > 0.1)
            negative_count = sum(1 for score in sentiment_scores if score < -0.1)
            neutral_count = len(sentiment_scores) - positive_count - negative_count

            return MarketSentiment(
                overall_sentiment=overall_sentiment,
                news_count=len(news_items),
                positive_news=positive_count,
                negative_news=negative_count,
                neutral_news=neutral_count,
                latest_news=news_items
            )

        except Exception as e:
            self.logger.error(f"Error getting market sentiment for {symbol}: {str(e)}")
            return MarketSentiment(
                overall_sentiment=0.0,
                news_count=0,
                positive_news=0,
                negative_news=0,
                neutral_news=0,
                latest_news=[]
            )

    async def get_market_hours_info(self) -> Dict[str, Any]:
        """Get market hours and trading status"""
        try:
            now = datetime.now()

            # US market hours (Eastern Time)
            market_open = now.replace(hour=9, minute=30, second=0, microsecond=0)
            market_close = now.replace(hour=16, minute=0, second=0, microsecond=0)

            # Check if it's a weekday
            is_weekday = now.weekday() < 5

            # Check if market is currently open (simplified - doesn't account for holidays)
            is_market_open = (is_weekday and
                            market_open <= now <= market_close)

            # Calculate time until next market event
            if is_market_open:
                time_to_close = (market_close - now).total_seconds() / 3600
                next_event = "Market Close"
                time_to_event = time_to_close
            else:
                if now < market_open and is_weekday:
                    time_to_open = (market_open - now).total_seconds() / 3600
                    next_event = "Market Open"
                    time_to_event = time_to_open
                else:
                    # Next trading day
                    days_until_monday = (7 - now.weekday()) % 7
                    if days_until_monday == 0:
                        days_until_monday = 1 if now > market_close else 0

                    next_trading_day = now + timedelta(days=days_until_monday)
                    next_market_open = next_trading_day.replace(hour=9, minute=30, second=0, microsecond=0)
                    time_to_open = (next_market_open - now).total_seconds() / 3600
                    next_event = "Next Market Open"
                    time_to_event = time_to_open

            return {
                "is_market_open": is_market_open,
                "market_open_time": market_open.strftime("%H:%M"),
                "market_close_time": market_close.strftime("%H:%M"),
                "next_event": next_event,
                "hours_to_event": time_to_event,
                "current_time": now.strftime("%Y-%m-%d %H:%M:%S")
            }

        except Exception as e:
            self.logger.error(f"Error getting market hours info: {str(e)}")
            return {"error": str(e)}

    async def add_to_watchlist(self, symbol: str) -> bool:
        """Add a symbol to the watchlist"""
        try:
            symbol = symbol.upper().strip()
            if symbol not in self.watchlist:
                # Validate the symbol by trying to fetch data
                test_data = await self.get_current_data([symbol])
                if test_data:
                    self.watchlist.append(symbol)
                    self.logger.info(f"Added {symbol} to watchlist")
                    return True
            return False
        except Exception as e:
            self.logger.error(f"Error adding {symbol} to watchlist: {str(e)}")
            return False

    async def remove_from_watchlist(self, symbol: str) -> bool:
        """Remove a symbol from the watchlist"""
        try:
            symbol = symbol.upper().strip()
            if symbol in self.watchlist:
                self.watchlist.remove(symbol)
                self.logger.info(f"Removed {symbol} from watchlist")
                return True
            return False
        except Exception as e:
            self.logger.error(f"Error removing {symbol} from watchlist: {str(e)}")
            return False

    def get_watchlist(self) -> List[str]:
        """Get current watchlist"""
        return self.watchlist.copy()

    async def get_top_movers(self) -> Dict[str, List[Dict[str, Any]]]:
        """Get top gaining and losing stocks"""
        try:
            # This would typically use a market data API
            # For now, simulate with our watchlist
            watchlist_data = await self.get_current_data(self.watchlist[:10])

            # Calculate daily changes (simplified)
            gainers = []
            losers = []

            for symbol, data in watchlist_data.items():
                # Simulate daily change
                daily_change = np.random.normal(0, 2)  # Random daily change
                daily_change_percent = daily_change

                stock_info = {
                    "symbol": symbol,
                    "price": data.price,
                    "change": daily_change,
                    "change_percent": daily_change_percent,
                    "volume": data.volume
                }

                if daily_change > 0:
                    gainers.append(stock_info)
                else:
                    losers.append(stock_info)

            # Sort by change percentage
            gainers.sort(key=lambda x: x['change_percent'], reverse=True)
            losers.sort(key=lambda x: x['change_percent'])

            return {
                "gainers": gainers[:5],
                "losers": losers[:5]
            }

        except Exception as e:
            self.logger.error(f"Error getting top movers: {str(e)}")
            return {"gainers": [], "losers": []}

    async def cleanup(self):
        """Cleanup resources"""
        if self.session:
            await self.session.close()
        self.logger.info("Real-time data feed manager cleaned up")
