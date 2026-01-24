#!/usr/bin/env python3
"""
LLM Trading Assistant Main Entry Point
"""

import asyncio
import logging
from pathlib import Path
from typing import Dict, Any

from config import TradingConfig
from risk_manager import RiskManager
from portfolio_manager import PortfolioManager
from trade_executor import TradeExecutor
from analysis_engine import AnalysisEngine
from governance import GovernanceManager
from data_feeds import DataFeedManager
from performance_tracker import PerformanceTracker
from compliance import ComplianceValidator

class TradingAssistant:
    def __init__(self, config_path: str):
        self.config = TradingConfig.load_from_file(config_path)
        self.logger = self._setup_logging()

        # Core components
        self.risk_manager = RiskManager(self.config.risk_management)
        self.portfolio_manager = PortfolioManager(self.config.portfolio_management)
        self.trade_executor = TradeExecutor(self.config.trade_execution)
        self.analysis_engine = AnalysisEngine(self.config.analysis_framework)
        self.governance = GovernanceManager(self.config.governance)
        self.data_feeds = DataFeedManager()
        self.performance_tracker = PerformanceTracker()
        self.compliance = ComplianceValidator(self.config.compliance)

    def _setup_logging(self) -> logging.Logger:
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler('trading_assistant.log'),
                logging.StreamHandler()
            ]
        )
        return logging.getLogger(__name__)

    async def run_trading_cycle(self):
        """Main trading cycle - analyze, propose, execute"""
        try:
            # Get current market data
            market_data = await self.data_feeds.get_current_data()

            # Perform analysis
            analysis_results = await self.analysis_engine.analyze_market(market_data)

            # Generate trade proposals
            proposals = await self.analysis_engine.generate_trade_proposals(
                analysis_results,
                self.portfolio_manager.get_current_positions()
            )

            # Risk check each proposal
            validated_proposals = []
            portfolio_value = self.portfolio_manager.get_portfolio_value()
            current_positions = self.portfolio_manager.get_current_positions()

            for proposal in proposals:
                risk_assessment = self.risk_manager.assess_trade(proposal, portfolio_value, current_positions)
                if risk_assessment.approved:
                    # Compliance validation
                    compliance_report = self.compliance.validate_trade(
                        proposal,
                        current_positions,
                        portfolio_value  # Using portfolio value as proxy for daily trading volume
                    )

                    if compliance_report.approved:
                        validated_proposals.append((proposal, risk_assessment))
                        self.logger.info(f"Trade passed compliance checks: {proposal.symbol}")
                    else:
                        self.logger.warning(f"Trade failed compliance: {proposal.symbol} - {len(compliance_report.violations)} violations")
                else:
                    self.logger.info(f"Trade rejected by risk management: {risk_assessment.reason}")

            # Submit to governance for approval
            for proposal, risk_assessment in validated_proposals:
                approval_result = await self.governance.submit_for_approval(proposal, risk_assessment)
                if approval_result.approved:
                    await self.trade_executor.execute_trade(proposal)
                    self.portfolio_manager.update_position(proposal)

        except Exception as e:
            self.logger.error(f"Trading cycle error: {e}")

    async def start(self):
        """Start the trading assistant"""
        self.logger.info("Starting LLM Trading Assistant")

        # Initialize all components
        await self.data_feeds.initialize()
        await self.trade_executor.initialize()

        # Run continuous trading loop
        while True:
            await self.run_trading_cycle()
            await asyncio.sleep(60)  # Run every minute

if __name__ == "__main__":
    import sys
    config_path = sys.argv[1] if len(sys.argv) > 1 else "config.json"
    assistant = TradingAssistant(config_path)
    asyncio.run(assistant.start())
