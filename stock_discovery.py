"""
Advanced Stock Discovery System
Expands beyond FAANG using news analysis, market movers, and API-driven discovery
"""

import asyncio
import yfinance as yf
import pandas as pd
import numpy as np
from dataclasses import dataclass
from typing import Dict, List, Optional, Set, Tuple
from datetime import datetime, timedelta
import logging
import json
import re
from collections import defaultdict
import requests


@dataclass
class StockCandidate:
    symbol: str
    company_name: str
    sector: str
    market_cap: float
    price: float
    volume: int
    price_change_pct: float
    discovery_source: str  # 'news', 'movers', 'sector_rotation', 'earnings'
    confidence_score: float  # 0-1 scale
    catalyst: str  # What drove the discovery
    analyst_rating: Optional[str] = None
    pe_ratio: Optional[float] = None
    volume_spike: Optional[float] = None  # vs average volume


@dataclass
class NewsSignal:
    symbol: str
    headline: str
    sentiment_score: float  # -1 to 1
    relevance_score: float  # 0 to 1
    source: str
    timestamp: datetime
    category: str  # earnings, merger, product, regulatory, etc.


class StockDiscoveryEngine:
    def __init__(self, news_api_key: Optional[str] = None):
        self.logger = logging.getLogger(__name__)
        self.news_api_key = news_api_key

        # Major market indices for sector analysis
        self.sector_etfs = {
            'Technology': 'XLK',
            'Healthcare': 'XLV',
            'Financial Services': 'XLF',
            'Consumer Discretionary': 'XLY',
            'Consumer Staples': 'XLP',
            'Energy': 'XLE',
            'Materials': 'XLB',
            'Industrial': 'XLI',
            'Utilities': 'XLU',
            'Real Estate': 'XLRE',
            'Communication Services': 'XLC'
        }

        # Comprehensive stock universes to scan - expanded beyond mega-caps
        self.stock_universes = {
            'mega_cap': ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'BRK-B', 'TSLA', 'META', 'V', 'JNJ'],

            'large_cap_value': ['JPM', 'BAC', 'WMT', 'PG', 'KO', 'PEP', 'HD', 'UNH', 'CVX', 'XOM'],

            'growth_leaders': ['NVDA', 'AMD', 'PLTR', 'SNOW', 'NET', 'CRWD', 'ZS', 'OKTA', 'DDOG', 'MDB',
                              'CRM', 'NOW', 'WDAY', 'TEAM', 'ZM', 'DOCN', 'BILL', 'S', 'ESTC'],

            'mid_cap_gems': ['RBLX', 'PATH', 'DKNG', 'OPEN', 'ABNB', 'UBER', 'LYFT', 'DASH', 'COIN',
                            'HOOD', 'SQ', 'PYPL', 'SHOP', 'SPOT', 'TTD', 'ROKU', 'PINS', 'SNAP'],

            'small_cap_innovators': ['AI', 'SMCI', 'IONQ', 'BBAI', 'RGTI', 'QUBT', 'AVAV', 'KTOS',
                                   'IRDM', 'MAXR', 'SPIR', 'ASTR', 'RKLB', 'LUNR', 'ASTS'],

            'biotech_emerging': ['MRNA', 'BNTX', 'NVAX', 'SGEN', 'BMRN', 'VRTX', 'ILMN', 'REGN',
                                 'GILD', 'BIIB', 'AMGN', 'CELG', 'INCY', 'ALNY', 'RARE'],

            'fintech_disruptors': ['SQ', 'PYPL', 'HOOD', 'AFRM', 'SOFI', 'COIN', 'UPST', 'LC',
                                  'NU', 'PAGS', 'STNE', 'MELI', 'SE'],

            'clean_energy': ['TSLA', 'ENPH', 'SEDG', 'RUN', 'SPWR', 'FSLR', 'PLUG', 'BE', 'ICLN',
                            'NEE', 'BEP', 'AES', 'EIX', 'DUK'],

            'cybersecurity': ['CRWD', 'ZS', 'NET', 'OKTA', 'PANW', 'FTNT', 'S', 'RPD', 'CYBR',
                             'FEYE', 'VRNS', 'TENB', 'QLYS'],

            'robotics_ai': ['NVDA', 'AMD', 'AI', 'PLTR', 'PATH', 'SMCI', 'IONQ', 'GOOGL', 'MSFT',
                           'AVAV', 'KTOS', 'IRBT', 'ROK', 'ABB'],

            # International opportunities
            'international_growth': ['TSM', 'ASML', 'NVO', 'TM', 'SONY', 'SAP', 'SHOP', 'SE', 'MELI',
                                   'BABA', 'JD', 'PDD', 'BIDU', 'NIO', 'XPEV', 'LI'],

            # Value plays with growth potential
            'value_growth_hybrid': ['BRK-B', 'MA', 'V', 'COST', 'LOW', 'TGT', 'WMT', 'DIS', 'NFLX',
                                   'ADBE', 'CRM', 'NOW', 'INTU', 'ORCL', 'CSCO'],

            # Emerging sectors
            'space_economy': ['RKLB', 'ASTR', 'SPIR', 'LUNR', 'ASTS', 'MAXR', 'LMT', 'BA', 'RTX'],
            'quantum_computing': ['IONQ', 'RGTI', 'QUBT', 'IBM', 'GOOGL', 'MSFT', 'NVDA'],
            'gaming_metaverse': ['RBLX', 'U', 'EA', 'ATVI', 'TTWO', 'NVDA', 'AMD', 'META']
        }

        self.excluded_symbols = set()  # Symbols to avoid
        self.discovery_cache = {}  # Cache for recent discoveries
        self.last_discovery_time = None
        self.discovery_rotation_index = 0  # For rotating through universes

    async def discover_stocks(self, max_candidates: int = 20, force_refresh: bool = False) -> List[StockCandidate]:
        """Main discovery method that combines all sources with caching and rotation"""
        from datetime import datetime, timedelta

        # Check if we should use cached results (refresh every 5 minutes for perpetual scanning)
        now = datetime.now()
        if (not force_refresh and self.last_discovery_time and
            now - self.last_discovery_time < timedelta(minutes=5) and
            self.discovery_cache):
            self.logger.info(f"Using cached discovery results from {self.last_discovery_time}")
            return list(self.discovery_cache.values())[:max_candidates]

        self.logger.info(f"Starting comprehensive stock discovery (max: {max_candidates}) - rotation index: {self.discovery_rotation_index}")

        all_candidates = []

        # 1. Market movers discovery with rotation
        mover_candidates = await self._discover_market_movers()
        all_candidates.extend(mover_candidates)
        self.logger.info(f"Found {len(mover_candidates)} market mover candidates")

        # 2. Sector rotation discovery
        sector_candidates = await self._discover_sector_rotation()
        all_candidates.extend(sector_candidates)
        self.logger.info(f"Found {len(sector_candidates)} sector rotation candidates")

        # 3. News-driven discovery with thematic rotation
        news_candidates = await self._discover_news_driven()
        all_candidates.extend(news_candidates)
        self.logger.info(f"Found {len(news_candidates)} news-driven candidates")

        # 4. Volume spike discovery across broader universe
        volume_candidates = await self._discover_volume_spikes()
        all_candidates.extend(volume_candidates)
        self.logger.info(f"Found {len(volume_candidates)} volume spike candidates")

        # 5. Earnings calendar discovery
        earnings_candidates = await self._discover_earnings_plays()
        all_candidates.extend(earnings_candidates)
        self.logger.info(f"Found {len(earnings_candidates)} earnings calendar candidates")

        # 6. NEW: Fundamental screener for hidden gems
        fundamental_candidates = await self._discover_fundamental_gems()
        all_candidates.extend(fundamental_candidates)
        self.logger.info(f"Found {len(fundamental_candidates)} fundamental gem candidates")

        # Deduplicate and rank
        unique_candidates = self._deduplicate_candidates(all_candidates)
        ranked_candidates = self._rank_candidates(unique_candidates)

        # Return top candidates with diversity
        final_candidates = self._ensure_diversity(ranked_candidates[:max_candidates * 2])[:max_candidates]
        self.logger.info(f"Selected {len(final_candidates)} final candidates for analysis")

        # Cache results and update rotation
        self.discovery_cache = {c.symbol: c for c in final_candidates}
        self.last_discovery_time = now
        self.discovery_rotation_index = (self.discovery_rotation_index + 1) % len(self.stock_universes)

        return final_candidates

    async def _discover_market_movers(self) -> List[StockCandidate]:
        """Discover stocks with significant price movements across diverse market segments"""
        candidates = []

        try:
            # Rotate through different universes to ensure variety
            import random

            # Select 3-4 different universes randomly to get diverse coverage
            available_universes = list(self.stock_universes.keys())
            selected_universes = random.sample(available_universes, min(4, len(available_universes)))

            for universe_name in selected_universes:
                # Get a mix of stocks from each universe, shuffled for variety
                universe_symbols = self.stock_universes[universe_name].copy()
                random.shuffle(universe_symbols)
                symbols = universe_symbols[:8]  # 8 per universe for broader coverage

                for symbol in symbols:
                    try:
                        ticker = yf.Ticker(symbol)
                        hist = ticker.history(period="5d", interval="1d")
                        info = ticker.info

                        if len(hist) < 2:
                            continue

                        # Calculate price change
                        current_price = hist['Close'].iloc[-1]
                        prev_price = hist['Close'].iloc[-2]
                        price_change_pct = ((current_price - prev_price) / prev_price) * 100

                        # Look for significant moves (>3% daily change)
                        if abs(price_change_pct) > 3.0:

                            confidence = min(abs(price_change_pct) / 10.0, 1.0)  # Scale to 0-1

                            candidate = StockCandidate(
                                symbol=symbol,
                                company_name=info.get('longName', symbol),
                                sector=info.get('sector', 'Unknown'),
                                market_cap=info.get('marketCap', 0),
                                price=float(current_price),
                                volume=int(hist['Volume'].iloc[-1]),
                                price_change_pct=price_change_pct,
                                discovery_source='movers',
                                confidence_score=confidence,
                                catalyst=f"Significant price movement: {price_change_pct:+.1f}%",
                                pe_ratio=info.get('trailingPE'),
                                analyst_rating=info.get('recommendationKey', '').upper()
                            )

                            candidates.append(candidate)

                    except Exception as e:
                        self.logger.debug(f"Error processing mover {symbol}: {e}")
                        continue

        except Exception as e:
            self.logger.error(f"Error in market movers discovery: {e}")

        return candidates

    async def _discover_sector_rotation(self) -> List[StockCandidate]:
        """Discover stocks in sectors showing relative strength"""
        candidates = []

        try:
            # Analyze sector ETF performance
            sector_performance = {}

            for sector_name, etf_symbol in self.sector_etfs.items():
                try:
                    ticker = yf.Ticker(etf_symbol)
                    hist = ticker.history(period="1mo", interval="1d")

                    if len(hist) >= 10:
                        # Calculate sector momentum
                        recent_perf = ((hist['Close'].iloc[-1] - hist['Close'].iloc[-10]) /
                                     hist['Close'].iloc[-10]) * 100
                        sector_performance[sector_name] = recent_perf

                except Exception as e:
                    self.logger.debug(f"Error analyzing sector {sector_name}: {e}")
                    continue

            # Find top performing sectors
            top_sectors = sorted(sector_performance.items(), key=lambda x: x[1], reverse=True)[:3]

            for sector_name, performance in top_sectors:
                if performance > 2.0:  # At least 2% outperformance
                    # Find individual stocks in this sector
                    sector_stocks = await self._find_sector_stocks(sector_name)

                    for symbol, stock_data in sector_stocks[:5]:  # Top 5 per sector
                        try:
                            candidate = StockCandidate(
                                symbol=symbol,
                                company_name=stock_data.get('longName', symbol),
                                sector=sector_name,
                                market_cap=stock_data.get('marketCap', 0),
                                price=stock_data.get('currentPrice', 0),
                                volume=stock_data.get('averageVolume', 0),
                                price_change_pct=stock_data.get('52WeekChange', 0) * 100,
                                discovery_source='sector_rotation',
                                confidence_score=min(performance / 10.0, 1.0),
                                catalyst=f"Strong sector rotation into {sector_name} (+{performance:.1f}%)",
                                pe_ratio=stock_data.get('trailingPE'),
                                analyst_rating=stock_data.get('recommendationKey', '').upper()
                            )

                            candidates.append(candidate)

                        except Exception as e:
                            self.logger.debug(f"Error creating sector candidate {symbol}: {e}")
                            continue

        except Exception as e:
            self.logger.error(f"Error in sector rotation discovery: {e}")

        return candidates

    async def _discover_news_driven(self) -> List[StockCandidate]:
        """Discover stocks mentioned in recent financial news"""
        candidates = []

        try:
            # Simulated news analysis (in production, would use NewsAPI, Bloomberg, etc.)
            # This would normally parse recent financial news for stock mentions

            trending_stocks = [
                ('NVDA', 'AI chip demand surge', 0.8, 'Artificial Intelligence'),
                ('AMD', 'Data center expansion', 0.7, 'Semiconductors'),
                ('PLTR', 'Government contract wins', 0.6, 'Big Data Analytics'),
                ('NET', 'Edge computing growth', 0.7, 'Cloud Infrastructure'),
                ('CRWD', 'Cybersecurity threats rising', 0.8, 'Cybersecurity'),
                ('SNOW', 'Data analytics adoption', 0.6, 'Cloud Software'),
                ('U', 'Work-from-home persistence', 0.5, 'Communication Software'),
                ('ZM', 'Video conferencing evolution', 0.5, 'Communication Software'),
                ('DDOG', 'DevOps monitoring demand', 0.7, 'Application Performance'),
                ('MDB', 'Database modernization', 0.6, 'Database Software')
            ]

            for symbol, catalyst, sentiment, category in trending_stocks:
                try:
                    ticker = yf.Ticker(symbol)
                    info = ticker.info
                    hist = ticker.history(period="5d")

                    if len(hist) < 2:
                        continue

                    current_price = hist['Close'].iloc[-1]
                    prev_price = hist['Close'].iloc[-2]
                    price_change = ((current_price - prev_price) / prev_price) * 100

                    candidate = StockCandidate(
                        symbol=symbol,
                        company_name=info.get('longName', symbol),
                        sector=info.get('sector', category),
                        market_cap=info.get('marketCap', 0),
                        price=float(current_price),
                        volume=int(hist['Volume'].iloc[-1]),
                        price_change_pct=price_change,
                        discovery_source='news',
                        confidence_score=sentiment,
                        catalyst=f"News catalyst: {catalyst}",
                        pe_ratio=info.get('trailingPE'),
                        analyst_rating=info.get('recommendationKey', '').upper()
                    )

                    candidates.append(candidate)

                except Exception as e:
                    self.logger.debug(f"Error processing news candidate {symbol}: {e}")
                    continue

        except Exception as e:
            self.logger.error(f"Error in news-driven discovery: {e}")

        return candidates

    async def _discover_volume_spikes(self) -> List[StockCandidate]:
        """Discover stocks with unusual volume activity"""
        candidates = []

        try:
            # Check popular stocks for volume spikes
            check_symbols = (self.stock_universes['mega_cap'][:10] +
                           self.stock_universes['growth_leaders'][:10])

            for symbol in check_symbols:
                try:
                    ticker = yf.Ticker(symbol)
                    hist = ticker.history(period="1mo", interval="1d")
                    info = ticker.info

                    if len(hist) < 20:
                        continue

                    # Calculate average volume and current volume
                    avg_volume = hist['Volume'][:-1].mean()  # Exclude today
                    current_volume = hist['Volume'].iloc[-1]
                    volume_ratio = current_volume / avg_volume

                    # Look for volume spikes (2x+ average)
                    if volume_ratio > 2.0:
                        current_price = hist['Close'].iloc[-1]
                        prev_price = hist['Close'].iloc[-2]
                        price_change = ((current_price - prev_price) / prev_price) * 100

                        candidate = StockCandidate(
                            symbol=symbol,
                            company_name=info.get('longName', symbol),
                            sector=info.get('sector', 'Unknown'),
                            market_cap=info.get('marketCap', 0),
                            price=float(current_price),
                            volume=int(current_volume),
                            price_change_pct=price_change,
                            discovery_source='volume_spike',
                            confidence_score=min(volume_ratio / 5.0, 1.0),
                            catalyst=f"Volume spike: {volume_ratio:.1f}x average volume",
                            pe_ratio=info.get('trailingPE'),
                            volume_spike=volume_ratio,
                            analyst_rating=info.get('recommendationKey', '').upper()
                        )

                        candidates.append(candidate)

                except Exception as e:
                    self.logger.debug(f"Error processing volume spike {symbol}: {e}")
                    continue

        except Exception as e:
            self.logger.error(f"Error in volume spike discovery: {e}")

        return candidates

    async def _discover_earnings_plays(self) -> List[StockCandidate]:
        """Discover stocks with upcoming earnings that could be volatile"""
        candidates = []

        try:
            # Simulated earnings calendar (would use actual earnings API)
            upcoming_earnings = [
                ('GOOGL', 'Search ad recovery expected', 0.7, 2),
                ('MSFT', 'Cloud growth acceleration', 0.8, 3),
                ('AMZN', 'AWS margin expansion', 0.7, 1),
                ('META', 'Metaverse investments', 0.6, 4),
                ('NFLX', 'Subscriber growth rebound', 0.6, 5),
                ('CRM', 'AI integration benefits', 0.7, 1),
                ('SHOP', 'E-commerce normalization', 0.5, 2),
                ('ZM', 'Enterprise adoption', 0.6, 3)
            ]

            for symbol, expectation, confidence, days_until in upcoming_earnings:
                try:
                    ticker = yf.Ticker(symbol)
                    info = ticker.info
                    hist = ticker.history(period="1mo")

                    if len(hist) < 5:
                        continue

                    current_price = hist['Close'].iloc[-1]
                    month_start_price = hist['Close'].iloc[0]
                    price_change = ((current_price - month_start_price) / month_start_price) * 100

                    candidate = StockCandidate(
                        symbol=symbol,
                        company_name=info.get('longName', symbol),
                        sector=info.get('sector', 'Unknown'),
                        market_cap=info.get('marketCap', 0),
                        price=float(current_price),
                        volume=int(hist['Volume'].iloc[-1]),
                        price_change_pct=price_change,
                        discovery_source='earnings',
                        confidence_score=confidence,
                        catalyst=f"Earnings in {days_until} days: {expectation}",
                        pe_ratio=info.get('trailingPE'),
                        analyst_rating=info.get('recommendationKey', '').upper()
                    )

                    candidates.append(candidate)

                except Exception as e:
                    self.logger.debug(f"Error processing earnings candidate {symbol}: {e}")
                    continue

        except Exception as e:
            self.logger.error(f"Error in earnings discovery: {e}")

        return candidates

    async def _find_sector_stocks(self, sector_name: str) -> List[Tuple[str, Dict]]:
        """Find individual stocks in a given sector"""
        sector_stocks = []

        # Mapping of sectors to representative stocks
        sector_stocks_map = {
            'Technology': ['AAPL', 'MSFT', 'NVDA', 'AMD', 'CRM', 'ADBE', 'ORCL', 'CSCO'],
            'Healthcare': ['JNJ', 'PFE', 'UNH', 'ABBV', 'TMO', 'DHR', 'BMY', 'LLY'],
            'Financial Services': ['JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'BRK-B', 'V'],
            'Consumer Discretionary': ['AMZN', 'TSLA', 'HD', 'MCD', 'NKE', 'SBUX', 'DIS', 'TGT'],
            'Energy': ['XOM', 'CVX', 'COP', 'EOG', 'SLB', 'MPC', 'PSX', 'VLO']
        }

        symbols = sector_stocks_map.get(sector_name, [])[:5]

        for symbol in symbols:
            try:
                ticker = yf.Ticker(symbol)
                info = ticker.info
                sector_stocks.append((symbol, info))

            except Exception as e:
                self.logger.debug(f"Error getting sector stock {symbol}: {e}")
                continue

        return sector_stocks

    def _deduplicate_candidates(self, candidates: List[StockCandidate]) -> List[StockCandidate]:
        """Remove duplicate symbols, keeping the one with highest confidence"""
        symbol_map = {}

        for candidate in candidates:
            symbol = candidate.symbol

            if symbol in symbol_map:
                # Keep the one with higher confidence
                if candidate.confidence_score > symbol_map[symbol].confidence_score:
                    symbol_map[symbol] = candidate
            else:
                symbol_map[symbol] = candidate

        return list(symbol_map.values())

    def _rank_candidates(self, candidates: List[StockCandidate]) -> List[StockCandidate]:
        """Rank candidates by composite score"""

        def calculate_rank_score(candidate: StockCandidate) -> float:
            score = candidate.confidence_score * 0.4  # Base confidence

            # Boost for market cap (prefer liquid stocks)
            if candidate.market_cap:
                if candidate.market_cap > 100e9:  # >$100B
                    score += 0.2
                elif candidate.market_cap > 10e9:  # >$10B
                    score += 0.1

            # Boost for volume spike
            if candidate.volume_spike and candidate.volume_spike > 2.0:
                score += 0.15

            # Boost for strong price momentum
            if abs(candidate.price_change_pct) > 5:
                score += 0.1

            # Penalty for extreme PE ratios
            if candidate.pe_ratio:
                if candidate.pe_ratio < 5 or candidate.pe_ratio > 100:
                    score -= 0.1

            # Boost for analyst ratings
            if candidate.analyst_rating in ['STRONG_BUY', 'BUY']:
                score += 0.05

            return min(score, 1.0)  # Cap at 1.0

        # Calculate and sort by rank score
        for candidate in candidates:
            candidate.confidence_score = calculate_rank_score(candidate)

        return sorted(candidates, key=lambda x: x.confidence_score, reverse=True)

    def get_discovery_summary(self, candidates: List[StockCandidate]) -> Dict:
        """Generate summary statistics for discovered stocks"""
        if not candidates:
            return {}

        source_counts = defaultdict(int)
        sector_counts = defaultdict(int)
        avg_confidence = sum(c.confidence_score for c in candidates) / len(candidates)

        for candidate in candidates:
            source_counts[candidate.discovery_source] += 1
            sector_counts[candidate.sector] += 1

        return {
            'total_candidates': len(candidates),
            'avg_confidence': avg_confidence,
            'sources': dict(source_counts),
            'sectors': dict(sector_counts),
            'top_confidence': candidates[0].confidence_score if candidates else 0,
            'discovery_timestamp': datetime.now().isoformat()
        }

    async def _discover_fundamental_gems(self) -> List[StockCandidate]:
        """Discover hidden gems with strong fundamentals from smaller universes"""
        candidates = []

        try:
            # Focus on small-cap and mid-cap stocks that might be overlooked
            target_universes = ['small_cap_innovators', 'mid_cap_gems', 'biotech_emerging',
                              'fintech_disruptors', 'clean_energy', 'space_economy']

            # Rotate through universes based on discovery index
            universe_names = target_universes[self.discovery_rotation_index % len(target_universes):] + \
                           target_universes[:self.discovery_rotation_index % len(target_universes)]

            for universe_name in universe_names[:2]:  # Focus on 2 universes per discovery
                symbols = self.stock_universes.get(universe_name, [])[:8]

                for symbol in symbols:
                    try:
                        ticker = yf.Ticker(symbol)
                        info = ticker.info
                        hist = ticker.history(period="1mo")

                        if len(hist) < 5:
                            continue

                        current_price = hist['Close'].iloc[-1]
                        month_start_price = hist['Close'].iloc[0]
                        price_change = ((current_price - month_start_price) / month_start_price) * 100

                        # Look for fundamental strength indicators
                        pe_ratio = info.get('trailingPE', 0)
                        market_cap = info.get('marketCap', 0)
                        revenue_growth = info.get('revenueGrowth', 0)
                        profit_margin = info.get('profitMargins', 0)

                        # Score based on fundamental attractiveness
                        fundamental_score = 0
                        reasons = []

                        # Reasonable P/E ratio (not too high, not negative)
                        if 5 < pe_ratio < 30:
                            fundamental_score += 0.3
                            reasons.append(f"Reasonable P/E: {pe_ratio:.1f}")

                        # Growth indicators
                        if revenue_growth and revenue_growth > 0.1:
                            fundamental_score += 0.4
                            reasons.append(f"Revenue growth: {revenue_growth*100:.1f}%")

                        # Profitability
                        if profit_margin and profit_margin > 0.05:
                            fundamental_score += 0.2
                            reasons.append(f"Profit margin: {profit_margin*100:.1f}%")

                        # Market cap sweet spot (not too big, not too small)
                        if 1e9 < market_cap < 50e9:  # $1B to $50B
                            fundamental_score += 0.1
                            reasons.append("Mid-cap opportunity")

                        if fundamental_score > 0.4:  # Only include if fundamentally attractive
                            candidate = StockCandidate(
                                symbol=symbol,
                                company_name=info.get('longName', symbol),
                                sector=info.get('sector', 'Unknown'),
                                market_cap=market_cap,
                                price=float(current_price),
                                volume=int(hist['Volume'].iloc[-1]),
                                price_change_pct=price_change,
                                discovery_source='fundamental_gems',
                                confidence_score=fundamental_score,
                                catalyst=f"Strong fundamentals: {', '.join(reasons)}",
                                pe_ratio=pe_ratio,
                                analyst_rating=info.get('recommendationKey', '').upper()
                            )

                            candidates.append(candidate)

                    except Exception as e:
                        self.logger.debug(f"Error processing fundamental gem {symbol}: {e}")
                        continue

        except Exception as e:
            self.logger.error(f"Error in fundamental gems discovery: {e}")

        return candidates

    def _ensure_diversity(self, candidates: List[StockCandidate]) -> List[StockCandidate]:
        """Ensure diversity across sectors and discovery sources"""
        if not candidates:
            return candidates

        diverse_candidates = []
        seen_sectors = set()
        seen_sources = defaultdict(int)

        # Sort by confidence but ensure diversity
        for candidate in sorted(candidates, key=lambda x: x.confidence_score, reverse=True):
            # Ensure sector diversity (max 3 per sector)
            sector_count = sum(1 for c in diverse_candidates if c.sector == candidate.sector)

            # Ensure source diversity (max 4 per source)
            source_count = seen_sources[candidate.discovery_source]

            if sector_count < 3 and source_count < 4:
                diverse_candidates.append(candidate)
                seen_sectors.add(candidate.sector)
                seen_sources[candidate.discovery_source] += 1

        return diverse_candidates


# Convenience function for integration with existing system
async def discover_market_opportunities(max_candidates: int = 15) -> Tuple[List[str], Dict]:
    """
    Main function to discover new stock opportunities beyond FAANG
    Returns: (symbol_list, discovery_metadata)
    """
    engine = StockDiscoveryEngine()
    candidates = await engine.discover_stocks(max_candidates)

    symbols = [c.symbol for c in candidates]
    metadata = {
        'discovery_summary': engine.get_discovery_summary(candidates),
        'candidates': [
            {
                'symbol': c.symbol,
                'company': c.company_name,
                'sector': c.sector,
                'source': c.discovery_source,
                'catalyst': c.catalyst,
                'confidence': c.confidence_score,
                'price': c.price,
                'change_pct': c.price_change_pct
            }
            for c in candidates
        ]
    }

    return symbols, metadata
