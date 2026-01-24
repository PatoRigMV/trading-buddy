"""
Simple Real-Time Data Feeds Manager
Provides live market data with basic technical indicators
"""

import yfinance as yf
import pandas as pd
import numpy as np
import asyncio
from dataclasses import dataclass
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
import logging
import time
from analysis_engine import MarketData

@dataclass
class SimpleTechnicalIndicators:
    rsi: Optional[float] = None
    sma_20: Optional[float] = None
    sma_50: Optional[float] = None
    ema_12: Optional[float] = None
    current_volume: Optional[int] = None
    avg_volume: Optional[float] = None
    price_change_24h: Optional[float] = None
    volatility_20d: Optional[float] = None

@dataclass
class SimpleMarketData(MarketData):
    technical_indicators: SimpleTechnicalIndicators
    market_cap: Optional[float] = None
    pe_ratio: Optional[float] = None
    beta: Optional[float] = None
    sector: Optional[str] = None

class SimpleRealTimeDataManager:
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.cache = {}
        self.cache_timeout = 300  # 5 minute cache for real data

        # Enhanced watchlist
        self.watchlist = [
            'AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA',
            'NVDA', 'META', 'NFLX', 'AMD', 'CRM',
            'SHOP', 'ZM', 'ROKU', 'SQ', 'PYPL',
            'JPM', 'BAC', 'WMT', 'PG', 'JNJ'
        ]

    async def initialize(self):
        """Initialize the data feed manager"""
        self.logger.info("Simple real-time data feed manager initialized")

    async def get_current_data(self, symbols: Optional[List[str]] = None) -> Dict[str, SimpleMarketData]:
        """Get current market data with basic technical indicators"""
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

                # Get basic info
                try:
                    info = ticker.info
                except:
                    info = {}

                # Get historical data for technical indicators
                hist = ticker.history(period="3mo", interval="1d")  # 3 months of daily data

                if hist.empty:
                    self.logger.warning(f"No historical data available for {symbol}")
                    continue

                current_price = float(hist['Close'].iloc[-1])
                volume = int(hist['Volume'].iloc[-1])

                # Calculate technical indicators
                technical_indicators = self._calculate_simple_indicators(hist)

                # Create OHLC data
                ohlc = {
                    'open': float(hist['Open'].iloc[-1]),
                    'high': float(hist['High'].iloc[-1]),
                    'low': float(hist['Low'].iloc[-1]),
                    'close': current_price
                }

                # Create market data
                simple_data = SimpleMarketData(
                    symbol=symbol,
                    price=current_price,
                    volume=volume,
                    timestamp=datetime.now(),
                    ohlc=ohlc,
                    technical_indicators=technical_indicators,
                    market_cap=info.get('marketCap'),
                    pe_ratio=info.get('trailingPE'),
                    beta=info.get('beta'),
                    sector=info.get('sector')
                )

                market_data[symbol] = simple_data
                self.cache[cache_key] = simple_data

                rsi_str = f"{technical_indicators.rsi:.1f}" if technical_indicators.rsi else "N/A"
                change_str = f"{technical_indicators.price_change_24h:.2f}%" if technical_indicators.price_change_24h else "N/A"
                self.logger.info(f"Retrieved {symbol}: ${current_price:.2f} (RSI: {rsi_str}, Change: {change_str})")

            except Exception as e:
                self.logger.error(f"Error fetching data for {symbol}: {str(e)}")
                continue

        return market_data

    def _calculate_simple_indicators(self, hist: pd.DataFrame) -> SimpleTechnicalIndicators:
        """Calculate basic technical indicators"""
        try:
            close_prices = hist['Close']
            volumes = hist['Volume']

            # RSI calculation
            rsi = self._calculate_rsi(close_prices) if len(close_prices) >= 14 else None

            # Simple Moving Averages
            sma_20 = close_prices.rolling(window=20).mean().iloc[-1] if len(close_prices) >= 20 else None
            sma_50 = close_prices.rolling(window=50).mean().iloc[-1] if len(close_prices) >= 50 else None

            # Exponential Moving Average
            ema_12 = close_prices.ewm(span=12).mean().iloc[-1] if len(close_prices) >= 12 else None

            # Volume analysis
            current_volume = int(volumes.iloc[-1])
            avg_volume = volumes.rolling(window=20).mean().iloc[-1] if len(volumes) >= 20 else None

            # Price change (24h / 1 day)
            price_change_24h = None
            if len(close_prices) >= 2:
                price_change_24h = ((close_prices.iloc[-1] - close_prices.iloc[-2]) / close_prices.iloc[-2]) * 100

            # 20-day volatility
            volatility_20d = None
            if len(close_prices) >= 20:
                returns = close_prices.pct_change().dropna()
                volatility_20d = returns.rolling(window=20).std().iloc[-1] * np.sqrt(252) * 100  # Annualized %

            return SimpleTechnicalIndicators(
                rsi=float(rsi) if rsi is not None and not pd.isna(rsi) else None,
                sma_20=float(sma_20) if sma_20 is not None and not pd.isna(sma_20) else None,
                sma_50=float(sma_50) if sma_50 is not None and not pd.isna(sma_50) else None,
                ema_12=float(ema_12) if ema_12 is not None and not pd.isna(ema_12) else None,
                current_volume=current_volume,
                avg_volume=float(avg_volume) if avg_volume is not None and not pd.isna(avg_volume) else None,
                price_change_24h=float(price_change_24h) if price_change_24h is not None and not pd.isna(price_change_24h) else None,
                volatility_20d=float(volatility_20d) if volatility_20d is not None and not pd.isna(volatility_20d) else None
            )

        except Exception as e:
            self.logger.error(f"Error calculating indicators: {str(e)}")
            return SimpleTechnicalIndicators()

    def _calculate_rsi(self, prices: pd.Series, period: int = 14) -> Optional[float]:
        """Calculate RSI indicator"""
        try:
            if len(prices) < period + 1:
                return None

            delta = prices.diff()
            gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
            loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()

            rs = gain / loss
            rsi = 100 - (100 / (1 + rs))

            return rsi.iloc[-1] if not pd.isna(rsi.iloc[-1]) else None
        except:
            return None

    async def get_market_hours_info(self) -> Dict[str, Any]:
        """Get market hours and trading status"""
        try:
            now = datetime.now()

            # US market hours (Eastern Time) - simplified
            market_open = now.replace(hour=9, minute=30, second=0, microsecond=0)
            market_close = now.replace(hour=16, minute=0, second=0, microsecond=0)

            is_weekday = now.weekday() < 5
            is_market_open = (is_weekday and market_open <= now <= market_close)

            return {
                "is_market_open": is_market_open,
                "market_open_time": market_open.strftime("%H:%M"),
                "market_close_time": market_close.strftime("%H:%M"),
                "current_time": now.strftime("%Y-%m-%d %H:%M:%S"),
                "market_status": "OPEN" if is_market_open else "CLOSED"
            }

        except Exception as e:
            self.logger.error(f"Error getting market hours info: {str(e)}")
            return {"error": str(e)}

    async def get_top_movers(self) -> Dict[str, List[Dict[str, Any]]]:
        """Get top gaining and losing stocks from watchlist"""
        try:
            watchlist_data = await self.get_current_data(self.watchlist[:10])

            gainers = []
            losers = []

            for symbol, data in watchlist_data.items():
                if data.technical_indicators.price_change_24h is not None:
                    change_percent = data.technical_indicators.price_change_24h

                    stock_info = {
                        "symbol": symbol,
                        "price": data.price,
                        "change_percent": change_percent,
                        "volume": data.volume,
                        "sector": data.sector or "Unknown"
                    }

                    if change_percent > 0:
                        gainers.append(stock_info)
                    else:
                        losers.append(stock_info)

            gainers.sort(key=lambda x: x['change_percent'], reverse=True)
            losers.sort(key=lambda x: x['change_percent'])

            return {
                "gainers": gainers[:5],
                "losers": losers[:5]
            }

        except Exception as e:
            self.logger.error(f"Error getting top movers: {str(e)}")
            return {"gainers": [], "losers": []}

    def get_watchlist(self) -> List[str]:
        """Get current watchlist"""
        return self.watchlist.copy()

    async def add_to_watchlist(self, symbol: str) -> bool:
        """Add symbol to watchlist"""
        try:
            symbol = symbol.upper().strip()
            if symbol not in self.watchlist:
                # Test if symbol is valid
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
        """Remove symbol from watchlist"""
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
