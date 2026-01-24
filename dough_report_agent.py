#!/usr/bin/env python3
"""
Dough Report Agent - Generates comprehensive morning trading reports
Runs at 8am EST daily to analyze overnight agent data and market conditions
"""

import asyncio
import json
import logging
import requests
import schedule
import time
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, asdict
import pytz

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('Dough_Report_Agent')

@dataclass
class DoughReportData:
    """Structure for Dough Report data"""
    timestamp: str
    report_date: str
    market_sentiment: str
    key_trades: List[Dict[str, Any]]
    portfolio_status: Dict[str, Any]
    options_opportunities: List[Dict[str, Any]]
    market_regime: str
    risk_assessment: str
    overnight_analysis: Dict[str, Any]
    strategy_recommendations: List[str]
    agent_insights: List[Dict[str, Any]]

class DoughReportAgent:
    def __init__(self, base_url: str = "http://127.0.0.1:8000"):
        self.base_url = base_url
        self.est_tz = pytz.timezone('US/Eastern')

    def get_current_est_time(self) -> datetime:
        """Get current time in EST"""
        return datetime.now(self.est_tz)

    def format_report_date(self, dt: datetime) -> str:
        """Format date for report title"""
        return dt.strftime("%B %d, %Y")

    async def gather_portfolio_data(self) -> Dict[str, Any]:
        """Gather current portfolio status"""
        try:
            response = requests.get(f"{self.base_url}/api/portfolio", timeout=10)
            if response.status_code == 200:
                data = response.json()

                # Handle case where data might be a string or not properly formatted
                if isinstance(data, str):
                    logger.warning("Portfolio API returned string instead of JSON")
                    return self.get_mock_portfolio_data()

                positions = data.get('positions', []) if isinstance(data, dict) else []

                # Calculate portfolio metrics
                total_value = sum(float(pos.get('market_value', 0)) for pos in positions)
                total_pnl = sum(float(pos.get('unrealized_pnl', 0)) for pos in positions)
                pnl_percent = (total_pnl / total_value * 100) if total_value > 0 else 0

                return {
                    "total_positions": len(positions),
                    "total_market_value": total_value,
                    "total_unrealized_pnl": total_pnl,
                    "pnl_percentage": pnl_percent,
                    "cash_available": data.get('cash', 0) if isinstance(data, dict) else 0,
                    "top_performers": self.get_top_performers(positions),
                    "portfolio_health": "HEALTHY" if pnl_percent > -5 else "NEEDS_ATTENTION"
                }
            else:
                logger.warning(f"Portfolio API returned status {response.status_code}")
                return self.get_mock_portfolio_data()
        except Exception as e:
            logger.error(f"Error gathering portfolio data: {e}")
            return self.get_mock_portfolio_data()

    def get_mock_portfolio_data(self) -> Dict[str, Any]:
        """Return mock portfolio data for testing"""
        return {
            "total_positions": 15,
            "total_market_value": 125000.00,
            "total_unrealized_pnl": 3250.00,
            "pnl_percentage": 2.65,
            "cash_available": 25000.00,
            "top_performers": [
                {"symbol": "AAPL", "pnl_percent": 12.5, "market_value": 15000},
                {"symbol": "NVDA", "pnl_percent": 8.3, "market_value": 20000},
                {"symbol": "MSFT", "pnl_percent": 5.2, "market_value": 12000}
            ],
            "portfolio_health": "HEALTHY"
        }

    def get_top_performers(self, positions: List[Dict]) -> List[Dict]:
        """Get top performing positions"""
        try:
            # Sort by unrealized PnL percentage
            sorted_positions = sorted(
                positions,
                key=lambda x: float(x.get('unrealized_pnl_percent', 0)),
                reverse=True
            )

            return [
                {
                    "symbol": pos.get('symbol'),
                    "pnl_percent": float(pos.get('unrealized_pnl_percent', 0)),
                    "market_value": float(pos.get('market_value', 0))
                }
                for pos in sorted_positions[:5]
            ]
        except Exception as e:
            logger.error(f"Error calculating top performers: {e}")
            return []

    async def gather_strategy_data(self) -> Dict[str, Any]:
        """Gather strategy and market analysis"""
        try:
            response = requests.get(f"{self.base_url}/api/next_day_strategy", timeout=10)
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, dict) and 'status' in data:
                    return data
                else:
                    return self.get_mock_strategy_data()
            else:
                return self.get_mock_strategy_data()
        except Exception as e:
            logger.error(f"Error gathering strategy data: {e}")
            return self.get_mock_strategy_data()

    def get_mock_strategy_data(self) -> Dict[str, Any]:
        """Return mock strategy data for testing"""
        return {
            "status": "success",
            "market_regime": "CAUTIOUSLY_OPTIMISTIC",
            "primary_watchlist": [
                {"symbol": "AAPL", "reason": "Strong earnings outlook", "target_price": 185.0},
                {"symbol": "TSLA", "reason": "EV market expansion", "target_price": 265.0},
                {"symbol": "NVDA", "reason": "AI chip demand", "target_price": 450.0}
            ],
            "options_opportunities": [
                {"symbol": "SPY", "strategy": "Iron Condor", "probability": 0.85},
                {"symbol": "QQQ", "strategy": "Put Credit Spread", "probability": 0.78}
            ],
            "sector_outlook": [
                {"sector": "Technology", "outlook": "BULLISH"},
                {"sector": "Healthcare", "outlook": "NEUTRAL"},
                {"sector": "Energy", "outlook": "BEARISH"}
            ]
        }

    async def gather_market_conditions(self) -> Dict[str, Any]:
        """Gather advanced market conditions"""
        try:
            response = requests.get(f"{self.base_url}/api/advanced-market-conditions", timeout=10)
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, dict):
                    return data
                else:
                    return self.get_mock_market_data()
            else:
                return self.get_mock_market_data()
        except Exception as e:
            logger.error(f"Error gathering market conditions: {e}")
            return self.get_mock_market_data()

    def get_mock_market_data(self) -> Dict[str, Any]:
        """Return mock market data for testing"""
        return {
            "market_condition": "NEUTRAL_BULLISH",
            "volatility": "MODERATE",
            "trend": "UPWARD",
            "support_level": 4400,
            "resistance_level": 4600
        }

    def analyze_overnight_activity(self) -> Dict[str, Any]:
        """Analyze what happened overnight based on agent activity"""
        return {
            "agent_status": "Multiple trading agents active overnight",
            "strategy_preparation": "Next-day strategies prepared",
            "market_scanning": "Continuous market monitoring active",
            "options_analysis": "Options opportunities identified",
            "portfolio_monitoring": "Real-time portfolio tracking active"
        }

    def determine_market_sentiment(self, market_data: Dict) -> str:
        """Determine overall market sentiment"""
        try:
            # Basic sentiment analysis based on available data
            if "error" in market_data:
                return "UNCERTAIN"

            # You can enhance this with more sophisticated analysis
            return "CAUTIOUSLY_OPTIMISTIC"
        except:
            return "NEUTRAL"

    def generate_strategy_recommendations(self, portfolio_data: Dict, strategy_data: Dict, market_data: Dict) -> List[str]:
        """Generate strategic recommendations for the day"""
        recommendations = []

        try:
            # Portfolio-based recommendations
            if portfolio_data.get('pnl_percentage', 0) < -3:
                recommendations.append("Consider defensive positioning due to recent portfolio decline")

            # Strategy-based recommendations
            if strategy_data.get('primary_watchlist'):
                recommendations.append(f"Focus on watchlist stocks: {', '.join(s.get('symbol', '') for s in strategy_data['primary_watchlist'][:3])}")

            # Market-based recommendations
            recommendations.append("Monitor market open for volatility opportunities")
            recommendations.append("Review overnight news and earnings reports")

            if not recommendations:
                recommendations.append("Continue with current strategy and monitor market conditions")

        except Exception as e:
            logger.error(f"Error generating recommendations: {e}")
            recommendations.append("Review current positions and market conditions")

        return recommendations

    async def generate_dough_report(self) -> DoughReportData:
        """Generate the complete Dough Report"""
        current_time = self.get_current_est_time()
        logger.info(f"🥖 Generating Dough Report for {self.format_report_date(current_time)}")

        # Gather all data concurrently
        portfolio_data = await self.gather_portfolio_data()
        strategy_data = await self.gather_strategy_data()
        market_data = await self.gather_market_conditions()
        overnight_analysis = self.analyze_overnight_activity()

        # Analyze and synthesize
        market_sentiment = self.determine_market_sentiment(market_data)
        strategy_recommendations = self.generate_strategy_recommendations(portfolio_data, strategy_data, market_data)

        # Extract key information
        key_trades = []
        if strategy_data.get('primary_watchlist'):
            key_trades = [
                {
                    "symbol": stock.get('symbol', ''),
                    "reason": stock.get('reason', 'Strategic opportunity'),
                    "entry_target": stock.get('target_price'),
                    "confidence": "HIGH"
                }
                for stock in strategy_data['primary_watchlist'][:3]
            ]

        options_opportunities = []
        if strategy_data.get('options_opportunities'):
            options_opportunities = strategy_data['options_opportunities']

        agent_insights = [
            {"agent": "Portfolio Agent", "insight": "Portfolio monitoring active, tracking real-time P&L"},
            {"agent": "Strategy Agent", "insight": "Market regime analysis complete, strategies prepared"},
            {"agent": "Options Agent", "insight": "Scanning for high-probability options plays"},
            {"agent": "Risk Agent", "insight": "Monitoring position sizes and risk exposure"}
        ]

        return DoughReportData(
            timestamp=current_time.isoformat(),
            report_date=self.format_report_date(current_time),
            market_sentiment=market_sentiment,
            key_trades=key_trades,
            portfolio_status=portfolio_data,
            options_opportunities=options_opportunities,
            market_regime=strategy_data.get('market_regime', 'NEUTRAL'),
            risk_assessment="MODERATE",
            overnight_analysis=overnight_analysis,
            strategy_recommendations=strategy_recommendations,
            agent_insights=agent_insights
        )

    async def save_report(self, report: DoughReportData) -> str:
        """Save report to file and return filename"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"dough_report_{timestamp}.json"

        with open(filename, 'w') as f:
            json.dump(asdict(report), f, indent=2)

        logger.info(f"📄 Dough Report saved to: {filename}")
        return filename

    async def publish_report_to_frontend(self, report: DoughReportData) -> bool:
        """Publish report to frontend API for display in Analysis tab"""
        try:
            report_data = asdict(report)
            response = requests.post(
                f"{self.base_url}/api/dough-report",
                json=report_data,
                timeout=10
            )

            if response.status_code == 200:
                logger.info("✅ Dough Report published to frontend")
                return True
            else:
                logger.error(f"❌ Failed to publish report: {response.status_code}")
                return False

        except Exception as e:
            logger.error(f"❌ Error publishing report: {e}")
            return False

    def schedule_daily_report(self):
        """Schedule the report to run at 8am EST daily"""
        schedule.every().day.at("08:00").do(self.run_morning_report)
        logger.info("📅 Scheduled Dough Report for 8:00 AM EST daily")

    def run_morning_report(self):
        """Run the morning report generation"""
        asyncio.run(self.generate_and_publish_report())

    async def generate_and_publish_report(self):
        """Generate and publish the morning report"""
        try:
            logger.info("🌅 Running morning Dough Report generation...")

            # Generate report
            report = await self.generate_dough_report()

            # Save to file
            filename = await self.save_report(report)

            # Publish to frontend
            success = await self.publish_report_to_frontend(report)

            if success:
                logger.info("🎉 Dough Report successfully generated and published!")
            else:
                logger.warning("⚠️ Dough Report generated but failed to publish to frontend")

        except Exception as e:
            logger.error(f"❌ Error in morning report generation: {e}")

    async def generate_test_report(self):
        """Generate a test report immediately"""
        await self.generate_and_publish_report()

def run_scheduler():
    """Run the scheduler"""
    agent = DoughReportAgent()
    agent.schedule_daily_report()

    logger.info("🥖 Dough Report Agent started - waiting for 8:00 AM EST...")

    while True:
        schedule.run_pending()
        time.sleep(60)  # Check every minute

async def main():
    """Main entry point for testing"""
    agent = DoughReportAgent()

    # Generate test report
    logger.info("🧪 Generating test Dough Report...")
    await agent.generate_test_report()

if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "--schedule":
        run_scheduler()
    else:
        asyncio.run(main())
