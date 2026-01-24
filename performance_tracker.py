"""
Performance Monitoring and Continuous Learning System
"""

import numpy as np
import pandas as pd
from dataclasses import dataclass
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
import logging
import json

@dataclass
class PerformanceMetrics:
    returns: float
    volatility: float
    sharpe_ratio: float
    sortino_ratio: float
    max_drawdown: float
    alpha: float
    beta: float
    information_ratio: float
    calmar_ratio: float
    win_rate: float

@dataclass
class AttributionAnalysis:
    by_asset_class: Dict[str, float]
    by_sector: Dict[str, float]
    by_strategy: Dict[str, float]
    by_timeframe: Dict[str, float]

@dataclass
class RegimeDetection:
    current_regime: str
    regime_probability: float
    regime_history: List[Tuple[str, datetime, datetime]]
    regime_performance: Dict[str, PerformanceMetrics]

class PerformanceTracker:
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.portfolio_history: List[Dict[str, Any]] = []
        self.trade_history: List[Dict[str, Any]] = []
        self.benchmark_data: Dict[str, List[float]] = {}  # SPY, etc.
        self.performance_cache = {}

    def record_portfolio_snapshot(self, snapshot_data: Dict[str, Any]) -> None:
        """Record portfolio snapshot for performance tracking"""
        snapshot_data['timestamp'] = datetime.now().isoformat()
        self.portfolio_history.append(snapshot_data)

        # Keep only last 2 years of data for performance
        cutoff_date = datetime.now() - timedelta(days=730)
        self.portfolio_history = [
            snapshot for snapshot in self.portfolio_history
            if datetime.fromisoformat(snapshot['timestamp']) > cutoff_date
        ]

    def record_trade(self, trade_data: Dict[str, Any]) -> None:
        """Record executed trade for attribution analysis"""
        trade_data['timestamp'] = datetime.now().isoformat()
        self.trade_history.append(trade_data)

    def calculate_performance_metrics(self, period_days: int = 252) -> PerformanceMetrics:
        """Calculate comprehensive performance metrics"""
        if len(self.portfolio_history) < 2:
            return self._empty_metrics()

        # Get returns data
        returns = self._calculate_returns(period_days)
        if len(returns) == 0:
            return self._empty_metrics()

        # Calculate metrics
        annual_return = np.mean(returns) * 252 if len(returns) > 0 else 0.0
        volatility = np.std(returns) * np.sqrt(252) if len(returns) > 0 else 0.0

        # Risk-free rate (approximate)
        risk_free_rate = 0.02  # 2% annual

        # Sharpe ratio
        sharpe = (annual_return - risk_free_rate) / volatility if volatility > 0 else 0

        # Sortino ratio (downside deviation)
        downside_returns = [r for r in returns if r < 0]
        downside_deviation = np.std(downside_returns) * np.sqrt(252) if downside_returns else 0
        sortino = (annual_return - risk_free_rate) / downside_deviation if downside_deviation > 0 else 0

        # Maximum drawdown
        max_drawdown = self._calculate_max_drawdown(period_days)

        # Alpha and Beta (vs SPY benchmark)
        alpha, beta = self._calculate_alpha_beta(returns, period_days)

        # Information ratio
        benchmark_returns = self._get_benchmark_returns(period_days)
        if len(benchmark_returns) > 0:
            excess_returns = np.array(returns[:len(benchmark_returns)]) - np.array(benchmark_returns)
            tracking_error = np.std(excess_returns) * np.sqrt(252)
            information_ratio = np.mean(excess_returns) * 252 / tracking_error if tracking_error > 0 else 0
        else:
            information_ratio = 0

        # Calmar ratio
        calmar = annual_return / abs(max_drawdown) if max_drawdown < 0 else 0

        # Win rate
        win_rate = len([r for r in returns if r > 0]) / len(returns) if returns else 0

        return PerformanceMetrics(
            returns=annual_return,
            volatility=volatility,
            sharpe_ratio=sharpe,
            sortino_ratio=sortino,
            max_drawdown=max_drawdown,
            alpha=alpha,
            beta=beta,
            information_ratio=information_ratio,
            calmar_ratio=calmar,
            win_rate=win_rate
        )

    def _calculate_returns(self, period_days: int) -> List[float]:
        """Calculate daily returns for specified period"""
        if len(self.portfolio_history) < 2:
            return []

        cutoff_date = datetime.now() - timedelta(days=period_days)
        recent_history = [
            snapshot for snapshot in self.portfolio_history
            if datetime.fromisoformat(snapshot['timestamp']) > cutoff_date
        ]

        if len(recent_history) < 2:
            return []

        returns = []
        for i in range(1, len(recent_history)):
            prev_value = recent_history[i-1].get('total_value', 0)
            curr_value = recent_history[i].get('total_value', 0)

            if prev_value > 0:
                daily_return = (curr_value - prev_value) / prev_value
                returns.append(daily_return)

        return returns

    def _calculate_max_drawdown(self, period_days: int) -> float:
        """Calculate maximum drawdown"""
        values = []
        cutoff_date = datetime.now() - timedelta(days=period_days)

        for snapshot in self.portfolio_history:
            if datetime.fromisoformat(snapshot['timestamp']) > cutoff_date:
                values.append(snapshot.get('total_value', 0))

        if len(values) < 2:
            return 0.0

        peak = values[0]
        max_dd = 0.0

        for value in values:
            if value > peak:
                peak = value
            drawdown = (value - peak) / peak if peak > 0 else 0
            max_dd = min(max_dd, drawdown)

        return max_dd

    def _calculate_alpha_beta(self, returns: List[float], period_days: int) -> Tuple[float, float]:
        """Calculate alpha and beta vs benchmark"""
        benchmark_returns = self._get_benchmark_returns(period_days)

        if len(benchmark_returns) == 0 or len(returns) == 0:
            return 0.0, 1.0

        # Align lengths
        min_length = min(len(returns), len(benchmark_returns))
        portfolio_returns = np.array(returns[:min_length])
        benchmark_returns = np.array(benchmark_returns[:min_length])

        # Calculate beta
        covariance = np.cov(portfolio_returns, benchmark_returns)[0, 1]
        benchmark_variance = np.var(benchmark_returns)
        beta = covariance / benchmark_variance if benchmark_variance > 0 else 1.0

        # Calculate alpha
        portfolio_mean = np.mean(portfolio_returns) * 252
        benchmark_mean = np.mean(benchmark_returns) * 252
        risk_free_rate = 0.02

        alpha = (portfolio_mean - risk_free_rate) - beta * (benchmark_mean - risk_free_rate)

        return alpha, beta

    def _get_benchmark_returns(self, period_days: int) -> List[float]:
        """Get benchmark returns (SPY) for comparison"""
        # Placeholder - would fetch actual SPY data
        # For simulation, generate random walk similar to SPY
        np.random.seed(42)  # For reproducible results
        daily_returns = np.random.normal(0.0004, 0.01, period_days)  # ~10% annual, 16% vol
        return daily_returns.tolist()

    def _empty_metrics(self) -> PerformanceMetrics:
        """Return empty performance metrics"""
        return PerformanceMetrics(
            returns=0.0, volatility=0.0, sharpe_ratio=0.0, sortino_ratio=0.0,
            max_drawdown=0.0, alpha=0.0, beta=1.0, information_ratio=0.0,
            calmar_ratio=0.0, win_rate=0.0
        )

    def perform_attribution_analysis(self) -> AttributionAnalysis:
        """Perform return attribution analysis"""
        if not self.trade_history:
            return AttributionAnalysis({}, {}, {}, {})

        # Analyze by asset class
        by_asset_class = self._calculate_attribution_by_category('asset_class')

        # Analyze by sector
        by_sector = self._calculate_attribution_by_category('sector')

        # Analyze by strategy (would need strategy tags on trades)
        by_strategy = self._calculate_attribution_by_category('strategy')

        # Analyze by timeframe
        by_timeframe = {
            "short_term": 0.05,  # Placeholder
            "long_term": 0.08
        }

        return AttributionAnalysis(
            by_asset_class=by_asset_class,
            by_sector=by_sector,
            by_strategy=by_strategy,
            by_timeframe=by_timeframe
        )

    def _calculate_attribution_by_category(self, category: str) -> Dict[str, float]:
        """Calculate attribution by specific category"""
        # Placeholder implementation
        # Real implementation would calculate actual returns by category
        return {
            "Technology": 0.12,
            "Healthcare": 0.08,
            "Financials": 0.06
        }

    def detect_market_regime(self) -> RegimeDetection:
        """Detect current market regime"""
        # Simplified regime detection
        # Real implementation would use more sophisticated methods

        recent_volatility = self._calculate_recent_volatility(30)
        recent_returns = np.mean(self._calculate_returns(30))

        # Simple regime classification
        if recent_returns > 0.001 and recent_volatility < 0.15:
            current_regime = "Bull"
            probability = 0.8
        elif recent_returns < -0.001 and recent_volatility > 0.20:
            current_regime = "Bear"
            probability = 0.75
        elif recent_volatility > 0.25:
            current_regime = "Volatility spike"
            probability = 0.9
        else:
            current_regime = "Sideways"
            probability = 0.6

        return RegimeDetection(
            current_regime=current_regime,
            regime_probability=probability,
            regime_history=[],  # Would track regime changes over time
            regime_performance={}  # Would track performance in each regime
        )

    def _calculate_recent_volatility(self, days: int) -> float:
        """Calculate recent portfolio volatility"""
        returns = self._calculate_returns(days)
        if len(returns) < 2:
            return 0.0

        return np.std(returns) * np.sqrt(252)

    def generate_performance_report(self) -> Dict[str, Any]:
        """Generate comprehensive performance report"""
        metrics = self.calculate_performance_metrics()
        attribution = self.perform_attribution_analysis()
        regime = self.detect_market_regime()

        report = {
            "generated_at": datetime.now().isoformat(),
            "performance_metrics": {
                "annual_return": f"{metrics.returns:.2%}",
                "volatility": f"{metrics.volatility:.2%}",
                "sharpe_ratio": f"{metrics.sharpe_ratio:.2f}",
                "max_drawdown": f"{metrics.max_drawdown:.2%}",
                "alpha": f"{metrics.alpha:.2%}",
                "beta": f"{metrics.beta:.2f}",
                "win_rate": f"{metrics.win_rate:.2%}"
            },
            "attribution_analysis": {
                "by_asset_class": attribution.by_asset_class,
                "by_sector": attribution.by_sector
            },
            "market_regime": {
                "current": regime.current_regime,
                "probability": f"{regime.regime_probability:.2%}"
            },
            "benchmark_comparison": {
                "vs_SPY": f"{metrics.alpha:.2%} alpha, {metrics.beta:.2f} beta"
            }
        }

        # Save report
        filename = f"performance_report_{datetime.now().strftime('%Y%m%d')}.json"
        with open(filename, 'w') as f:
            json.dump(report, f, indent=2)

        self.logger.info(f"Performance report generated: {filename}")

        return report

    def get_strategy_recommendations(self) -> List[str]:
        """Get recommendations for strategy improvements"""
        metrics = self.calculate_performance_metrics()
        recommendations = []

        # Sharpe ratio analysis
        if metrics.sharpe_ratio < 1.0:
            recommendations.append("Consider reducing position sizes to improve risk-adjusted returns")

        # Win rate analysis
        if metrics.win_rate < 0.5:
            recommendations.append("Review entry criteria - win rate below 50%")

        # Drawdown analysis
        if metrics.max_drawdown < -0.15:
            recommendations.append("Implement stricter stop-loss rules to limit drawdowns")

        # Volatility analysis
        if metrics.volatility > 0.25:
            recommendations.append("Consider reducing portfolio concentration to lower volatility")

        return recommendations

    def update_learning_parameters(self) -> Dict[str, Any]:
        """Update learning parameters based on performance"""
        metrics = self.calculate_performance_metrics()
        regime = self.detect_market_regime()

        # Adjust conviction thresholds based on performance
        if metrics.win_rate > 0.6:
            new_conviction_threshold = max(0.5, 0.6 - 0.1)  # Lower threshold for good performance
        else:
            new_conviction_threshold = min(0.8, 0.6 + 0.1)  # Higher threshold for poor performance

        # Adjust position sizing based on recent performance
        if metrics.sharpe_ratio > 1.5:
            position_size_multiplier = 1.2  # Increase position sizes
        elif metrics.sharpe_ratio < 0.5:
            position_size_multiplier = 0.8  # Decrease position sizes
        else:
            position_size_multiplier = 1.0

        # Regime-specific adjustments
        regime_adjustments = {}
        if regime.current_regime == "Bear":
            regime_adjustments = {
                "defensive_bias": True,
                "volatility_adjustment": 0.8,
                "stop_loss_tightening": 0.9
            }
        elif regime.current_regime == "Volatility spike":
            regime_adjustments = {
                "position_size_reduction": 0.5,
                "hold_period_extension": True
            }

        learning_updates = {
            "conviction_threshold": new_conviction_threshold,
            "position_size_multiplier": position_size_multiplier,
            "regime_adjustments": regime_adjustments,
            "updated_at": datetime.now().isoformat(),
            "performance_trigger": {
                "sharpe_ratio": metrics.sharpe_ratio,
                "win_rate": metrics.win_rate,
                "current_regime": regime.current_regime
            }
        }

        # Log learning update
        self.logger.info(f"Learning parameters updated: {learning_updates}")

        return learning_updates

    def backtest_strategy_changes(self, proposed_changes: Dict[str, Any]) -> Dict[str, float]:
        """Backtest proposed strategy changes"""
        # Simplified backtesting framework
        # Real implementation would replay historical trades with new parameters

        historical_returns = self._calculate_returns(252)  # Last year
        if not historical_returns:
            return {"insufficient_data": True}

        # Simulate impact of changes
        simulated_returns = []
        for ret in historical_returns:
            # Apply proposed position sizing changes
            size_adj = proposed_changes.get('position_size_multiplier', 1.0)
            adjusted_return = ret * size_adj

            # Apply proposed stop-loss changes
            if 'stop_loss_tightening' in proposed_changes:
                # Simulate tighter stops reducing both gains and losses
                adjusted_return *= 0.95 if adjusted_return > 0 else 1.1

            simulated_returns.append(adjusted_return)

        # Calculate simulated metrics
        sim_annual_return = np.mean(simulated_returns) * 252
        sim_volatility = np.std(simulated_returns) * np.sqrt(252)
        sim_sharpe = sim_annual_return / sim_volatility if sim_volatility > 0 else 0

        # Compare to current performance
        current_metrics = self.calculate_performance_metrics()

        return {
            "simulated_annual_return": sim_annual_return,
            "current_annual_return": current_metrics.returns,
            "simulated_sharpe": sim_sharpe,
            "current_sharpe": current_metrics.sharpe_ratio,
            "improvement": sim_sharpe - current_metrics.sharpe_ratio
        }

    def stress_test_portfolio(self, scenarios: List[str]) -> Dict[str, Dict[str, float]]:
        """Stress test portfolio against historical scenarios"""
        stress_results = {}

        for scenario in scenarios:
            if scenario == "2008 crisis":
                # Simulate 2008-like conditions
                stress_results[scenario] = {
                    "portfolio_impact": -0.35,  # 35% loss
                    "recovery_period_months": 18,
                    "max_drawdown": -0.45
                }
            elif scenario == "COVID crash":
                # Simulate COVID-like conditions
                stress_results[scenario] = {
                    "portfolio_impact": -0.25,  # 25% loss
                    "recovery_period_months": 6,
                    "max_drawdown": -0.30
                }
            elif scenario == "High inflation regime":
                # Simulate high inflation impact
                stress_results[scenario] = {
                    "portfolio_impact": -0.15,  # 15% loss
                    "recovery_period_months": 12,
                    "max_drawdown": -0.20
                }

        return stress_results

    def generate_learning_report(self) -> Dict[str, Any]:
        """Generate comprehensive learning and adaptation report"""
        metrics = self.calculate_performance_metrics()
        attribution = self.perform_attribution_analysis()
        regime = self.detect_market_regime()
        recommendations = self.get_strategy_recommendations()
        learning_updates = self.update_learning_parameters()

        report = {
            "report_date": datetime.now().isoformat(),
            "performance_summary": {
                "sharpe_ratio": metrics.sharpe_ratio,
                "annual_return": metrics.returns,
                "max_drawdown": metrics.max_drawdown,
                "win_rate": metrics.win_rate
            },
            "regime_analysis": {
                "current_regime": regime.current_regime,
                "regime_probability": regime.regime_probability
            },
            "attribution": {
                "top_performing_sectors": attribution.by_sector,
                "asset_class_contribution": attribution.by_asset_class
            },
            "recommendations": recommendations,
            "learning_adaptations": learning_updates,
            "next_review_date": (datetime.now() + timedelta(days=7)).isoformat()
        }

        # Save learning report
        filename = f"learning_report_{datetime.now().strftime('%Y%m%d')}.json"
        with open(filename, 'w') as f:
            json.dump(report, f, indent=2)

        self.logger.info(f"Learning report generated: {filename}")

        return report
