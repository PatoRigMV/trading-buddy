"""
Test Suite for LLM Trading Assistant
"""

import unittest
import asyncio
import json
from datetime import datetime
from config import TradingConfig
from risk_manager import RiskManager, TradeProposal, Position
from portfolio_manager import PortfolioManager
from trade_executor import TradeExecutor
from analysis_engine import AnalysisEngine, MarketData
from governance import GovernanceManager
from compliance import ComplianceValidator
from paper_trading import PaperTradingAPI
from performance_tracker import PerformanceTracker

class TestTradingConfig(unittest.TestCase):
    def setUp(self):
        """Set up test configuration"""
        self.sample_spec = {
            "trading_assistant_spec": {
                "meta": {
                    "goal": "Test trading assistant",
                    "deployment_phases": ["Paper trading with broker/testnet API"]
                },
                "governance": {
                    "autonomy_levels": {
                        "proposal": "LLM may propose trades with structured rationale",
                        "approval": "Human required for execution during pilot phase"
                    },
                    "logging": ["All trade proposals logged with rationale, risk metrics, and compliance checks"],
                    "refusal_protocols": ["If conviction < threshold (e.g., <60%)"]
                },
                "risk_management": {
                    "position_sizing": {
                        "max_risk_per_trade": 0.02,
                        "methods": ["Kelly Criterion"],
                        "stop_loss": "Always defined pre-trade"
                    },
                    "portfolio_exposure": {
                        "max_single_security": 0.05,
                        "max_asset_class": 0.2,
                        "diversification": "Across sectors, geographies, factors"
                    },
                    "monitoring": {
                        "metrics": ["Sharpe", "Sortino"],
                        "circuit_breakers": {
                            "portfolio_loss": -0.10,
                            "single_day_loss": -0.03
                        },
                        "stress_tests": ["2008 crisis"]
                    }
                },
                "trade_execution": {
                    "order_management": {
                        "order_types": ["Limit"],
                        "avoid_periods": ["Market open/close"],
                        "slippage_modeling": True
                    },
                    "entry_exit": {
                        "entry_signals": ["Technical"],
                        "exit_rules": {
                            "profit_target": "2% target",
                            "stop_loss": "1% risk",
                            "trailing_stop": "ATR-based"
                        },
                        "scaling": ["Scale-in for conviction builds"]
                    },
                    "transaction_costs": {
                        "factor_costs": True,
                        "tax_considerations": True,
                        "turnover_limits": 0.5
                    }
                },
                "portfolio_management": {
                    "allocation": {
                        "asset_classes": ["Equities"],
                        "rebalancing": "Quarterly or when drift > 5%",
                        "geographic_diversification": True,
                        "sector_limit": 0.15
                    },
                    "temporal_diversification": {
                        "dollar_cost_averaging": True,
                        "multiple_time_horizons": ["Long-term strategic"]
                    }
                },
                "analysis_framework": {
                    "technical": {
                        "tools": ["Moving Averages", "RSI"],
                        "multi_timeframe": ["Daily"]
                    },
                    "fundamental": {
                        "metrics": ["Revenue growth"],
                        "governance": "Evaluate management quality",
                        "macro": "Incorporate industry & economic factors"
                    },
                    "quantitative": {
                        "models": ["Factor models"],
                        "validation": "Walk-forward & bootstrap testing"
                    }
                },
                "real_time_reactions": {
                    "news_processing": {
                        "sources": ["Bloomberg"],
                        "filters": ["Relevance"],
                        "sentiment_analysis": True
                    },
                    "event_driven": {
                        "protocols": {
                            "earnings": "Rapid reassessment of positions",
                            "central_bank": "Pause discretionary trades ±1hr around announcement",
                            "geopolitics": "Scenario analysis before execution"
                        }
                    },
                    "volatility_management": {
                        "metrics": ["VIX"],
                        "adjust_position_size": True,
                        "hedging": ["Options strategies"]
                    }
                },
                "compliance_ethics": {
                    "regulatory": {
                        "record_keeping": True,
                        "insider_trading_protocols": True,
                        "reporting_thresholds": True
                    },
                    "ethics": {
                        "no_market_manipulation": True,
                        "transparency": True,
                        "ESG_considerations": True
                    },
                    "disclosures": {
                        "client_risk_disclosures": True,
                        "decision_documentation": True,
                        "suitability_assessment": True
                    }
                },
                "continuous_learning": {
                    "performance_analysis": {
                        "metrics": ["Returns", "Sharpe"],
                        "attribution": ["By asset class"]
                    },
                    "strategy_evolution": {
                        "model_updates": "Quarterly review or regime shift",
                        "backtesting": "Rolling 10-year historical data",
                        "forward_testing": True
                    },
                    "regime_detection": {
                        "regimes": ["Bull", "Bear"],
                        "adjustments": "Adaptive risk & position sizing per regime",
                        "ensemble_methods": True
                    }
                }
            }
        }

    def test_config_loading(self):
        """Test configuration loading from spec"""
        config = TradingConfig(self.sample_spec)
        self.assertEqual(config.goal, "Test trading assistant")
        self.assertEqual(config.risk_management.max_risk_per_trade, 0.02)
        self.assertIn("Equities", config.portfolio_management.asset_classes)

class TestRiskManager(unittest.TestCase):
    def setUp(self):
        """Set up risk manager test"""
        self.config = TradingConfig({
            "trading_assistant_spec": {
                "meta": {"goal": "test", "deployment_phases": ["Paper trading with broker/testnet API"]},
                "governance": {"autonomy_levels": {"proposal": "LLM may propose trades with structured rationale", "approval": "Human required for execution during pilot phase"}, "logging": ["All trade proposals logged with rationale, risk metrics, and compliance checks"], "refusal_protocols": ["If conviction < threshold (e.g., <60%)"]},
                "risk_management": {"position_sizing": {"max_risk_per_trade": 0.02, "methods": ["Kelly Criterion"], "stop_loss": "Always defined pre-trade"}, "portfolio_exposure": {"max_single_security": 0.05, "max_asset_class": 0.2, "diversification": "Across sectors, geographies, factors"}, "monitoring": {"metrics": ["Sharpe"], "circuit_breakers": {"portfolio_loss": -0.10, "single_day_loss": -0.03}, "stress_tests": ["2008 crisis"]}},
                "trade_execution": {"order_management": {"order_types": ["Limit"], "avoid_periods": ["Market open/close"], "slippage_modeling": True}, "entry_exit": {"entry_signals": ["Technical"], "exit_rules": {"profit_target": "2%", "stop_loss": "1%", "trailing_stop": "ATR"}, "scaling": ["Scale-in"]}, "transaction_costs": {"factor_costs": True, "tax_considerations": True, "turnover_limits": 0.5}},
                "portfolio_management": {"allocation": {"asset_classes": ["Equities"], "rebalancing": "Quarterly or when drift > 5%", "geographic_diversification": True, "sector_limit": 0.15}, "temporal_diversification": {"dollar_cost_averaging": True, "multiple_time_horizons": ["Long-term"]}},
                "analysis_framework": {"technical": {"tools": ["RSI"], "multi_timeframe": ["Daily"]}, "fundamental": {"metrics": ["Revenue growth"], "governance": "Evaluate management quality", "macro": "Incorporate industry factors"}, "quantitative": {"models": ["Factor models"], "validation": "Walk-forward testing"}},
                "real_time_reactions": {"news_processing": {"sources": ["Bloomberg"], "filters": ["Relevance"], "sentiment_analysis": True}, "event_driven": {"protocols": {"earnings": "Reassess", "central_bank": "Pause", "geopolitics": "Analyze"}}, "volatility_management": {"metrics": ["VIX"], "adjust_position_size": True, "hedging": ["Options"]}},
                "compliance_ethics": {"regulatory": {"record_keeping": True, "insider_trading_protocols": True, "reporting_thresholds": True}, "ethics": {"no_market_manipulation": True, "transparency": True, "ESG_considerations": True}, "disclosures": {"client_risk_disclosures": True, "decision_documentation": True, "suitability_assessment": True}},
                "continuous_learning": {"performance_analysis": {"metrics": ["Returns"], "attribution": ["By asset class"]}, "strategy_evolution": {"model_updates": "Quarterly", "backtesting": "Rolling 10-year", "forward_testing": True}, "regime_detection": {"regimes": ["Bull"], "adjustments": "Adaptive", "ensemble_methods": True}}
            }
        }).risk_management

        self.risk_manager = RiskManager(self.config)

    def test_position_sizing_check(self):
        """Test position sizing validation"""
        proposal = TradeProposal(
            symbol="AAPL",
            action="BUY",
            quantity=100,
            price=150.0,
            stop_loss=147.0,
            profit_target=153.0,
            conviction=0.8,
            rationale="Test trade",
            timestamp=datetime.now()
        )

        portfolio_value = 100000
        positions = {}

        assessment = self.risk_manager.assess_trade(proposal, portfolio_value, positions)
        self.assertTrue(assessment.approved)

    def test_conviction_threshold(self):
        """Test conviction threshold check"""
        proposal = TradeProposal(
            symbol="AAPL",
            action="BUY",
            quantity=100,
            price=150.0,
            stop_loss=147.0,
            profit_target=153.0,
            conviction=0.5,  # Below threshold
            rationale="Test trade",
            timestamp=datetime.now()
        )

        portfolio_value = 100000
        positions = {}

        assessment = self.risk_manager.assess_trade(proposal, portfolio_value, positions)
        self.assertFalse(assessment.approved)
        self.assertIn("Conviction too low", assessment.reason)

class TestPaperTrading(unittest.TestCase):
    def setUp(self):
        """Set up paper trading test"""
        self.paper_api = PaperTradingAPI(initial_cash=10000)

    def test_account_initialization(self):
        """Test paper trading account initialization"""
        account = self.paper_api.get_account_info()
        self.assertEqual(account.cash_balance, 10000)
        self.assertEqual(len(account.positions), 0)

    async def test_buy_order(self):
        """Test buy order execution"""
        from trade_executor import Order, OrderType

        order = Order(
            id="TEST_001",
            symbol="AAPL",
            action="BUY",
            quantity=10,
            order_type=OrderType.MARKET,
            created_at=datetime.now()
        )

        success = await self.paper_api.submit_order(order)
        self.assertTrue(success)

        account = self.paper_api.get_account_info()
        self.assertIn("AAPL", account.positions)
        self.assertEqual(account.positions["AAPL"], 10)

    def test_performance_report(self):
        """Test performance report generation"""
        report = self.paper_api.generate_performance_report()
        self.assertIn("account_summary", report)
        self.assertIn("performance", report)
        self.assertIn("trading_activity", report)

class TestIntegration(unittest.TestCase):
    def setUp(self):
        """Set up integration test"""
        # Load test configuration
        with open('/Users/ryanhaigh/trading_assistant/test_config.json', 'w') as f:
            json.dump({
                "trading_assistant_spec": {
                    "meta": {"goal": "Integration test", "deployment_phases": ["Paper trading with broker/testnet API"]},
                    "governance": {"autonomy_levels": {"proposal": "LLM may propose trades with structured rationale", "approval": "Human required for execution during pilot phase"}, "logging": ["All trade proposals logged with rationale, risk metrics, and compliance checks"], "refusal_protocols": ["If conviction < threshold (e.g., <60%)"]},
                    "risk_management": {"position_sizing": {"max_risk_per_trade": 0.02, "methods": ["Kelly Criterion"], "stop_loss": "Always defined pre-trade"}, "portfolio_exposure": {"max_single_security": 0.05, "max_asset_class": 0.2, "diversification": "Across sectors, geographies, factors"}, "monitoring": {"metrics": ["Sharpe"], "circuit_breakers": {"portfolio_loss": -0.10, "single_day_loss": -0.03}, "stress_tests": ["2008 crisis"]}},
                    "trade_execution": {"order_management": {"order_types": ["Limit"], "avoid_periods": ["Market open/close"], "slippage_modeling": True}, "entry_exit": {"entry_signals": ["Technical"], "exit_rules": {"profit_target": "2%", "stop_loss": "1%", "trailing_stop": "ATR"}, "scaling": ["Scale-in"]}, "transaction_costs": {"factor_costs": True, "tax_considerations": True, "turnover_limits": 0.5}},
                    "portfolio_management": {"allocation": {"asset_classes": ["Equities"], "rebalancing": "Quarterly or when drift > 5%", "geographic_diversification": True, "sector_limit": 0.15}, "temporal_diversification": {"dollar_cost_averaging": True, "multiple_time_horizons": ["Long-term"]}},
                    "analysis_framework": {"technical": {"tools": ["RSI"], "multi_timeframe": ["Daily"]}, "fundamental": {"metrics": ["Revenue growth"], "governance": "Evaluate management quality", "macro": "Incorporate industry factors"}, "quantitative": {"models": ["Factor models"], "validation": "Walk-forward testing"}},
                    "real_time_reactions": {"news_processing": {"sources": ["Bloomberg"], "filters": ["Relevance"], "sentiment_analysis": True}, "event_driven": {"protocols": {"earnings": "Reassess", "central_bank": "Pause", "geopolitics": "Analyze"}}, "volatility_management": {"metrics": ["VIX"], "adjust_position_size": True, "hedging": ["Options"]}},
                    "compliance_ethics": {"regulatory": {"record_keeping": True, "insider_trading_protocols": True, "reporting_thresholds": True}, "ethics": {"no_market_manipulation": True, "transparency": True, "ESG_considerations": True}, "disclosures": {"client_risk_disclosures": True, "decision_documentation": True, "suitability_assessment": True}},
                    "continuous_learning": {"performance_analysis": {"metrics": ["Returns"], "attribution": ["By asset class"]}, "strategy_evolution": {"model_updates": "Quarterly", "backtesting": "Rolling 10-year", "forward_testing": True}, "regime_detection": {"regimes": ["Bull"], "adjustments": "Adaptive", "ensemble_methods": True}}
                }
            }, f)

    async def test_full_trading_cycle(self):
        """Test complete trading cycle"""
        from main import TradingAssistant

        # Create trading assistant with test config
        assistant = TradingAssistant('/Users/ryanhaigh/trading_assistant/test_config.json')

        # Test components initialization
        self.assertIsNotNone(assistant.risk_manager)
        self.assertIsNotNone(assistant.portfolio_manager)
        self.assertIsNotNone(assistant.analysis_engine)

        # Test analysis and proposal generation
        market_data = {
            'AAPL': MarketData(
                symbol='AAPL',
                price=150.0,
                volume=1000,
                timestamp=datetime.now(),
                ohlc={'open': 149, 'high': 151, 'low': 148, 'close': 150}
            )
        }

        analysis_results = await assistant.analysis_engine.analyze_market(market_data)
        self.assertIn('AAPL', analysis_results)

        # Test proposal generation
        proposals = await assistant.analysis_engine.generate_trade_proposals(
            analysis_results,
            assistant.portfolio_manager.get_current_positions()
        )

        # Should generate at least one meaningful proposal from the AAPL analysis
        self.assertGreater(len(proposals), 0, "Analysis engine should generate at least one trade proposal from market data")

        # Verify proposals have required fields
        for proposal in proposals:
            self.assertIsNotNone(proposal.symbol)
            self.assertIn(proposal.action, ['BUY', 'SELL'])
            self.assertGreater(proposal.quantity, 0)
            self.assertGreater(proposal.price, 0)

def run_tests():
    """Run all tests"""
    # Create test suite
    suite = unittest.TestSuite()

    # Add test cases
    suite.addTest(unittest.makeSuite(TestTradingConfig))
    suite.addTest(unittest.makeSuite(TestRiskManager))
    suite.addTest(unittest.makeSuite(TestPaperTrading))
    suite.addTest(unittest.makeSuite(TestIntegration))

    # Run tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    return result.wasSuccessful()

if __name__ == "__main__":
    # Run tests
    success = run_tests()
    print(f"\nTests {'PASSED' if success else 'FAILED'}")
