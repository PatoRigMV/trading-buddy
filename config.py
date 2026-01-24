"""
Configuration management for LLM Trading Assistant
"""

import json
import jsonschema
from dataclasses import dataclass, asdict
from typing import List, Dict, Any
from pathlib import Path

@dataclass
class RiskManagementConfig:
    max_risk_per_trade: float = 0.0075  # 0.75% = $750 on $100k portfolio
    position_sizing_methods: List[str] = None
    stop_loss_required: bool = True
    max_single_security: float = 0.05
    max_asset_class: float = 0.2
    portfolio_loss_circuit_breaker: float = -0.10
    single_day_loss_circuit_breaker: float = -0.03

    def __post_init__(self):
        if self.position_sizing_methods is None:
            self.position_sizing_methods = ["Kelly Criterion", "Fixed Fractional"]

@dataclass
class PortfolioManagementConfig:
    asset_classes: List[str] = None
    rebalancing_threshold: float = 0.05
    geographic_diversification: bool = True
    sector_limit: float = 0.15
    dollar_cost_averaging: bool = True

    def __post_init__(self):
        if self.asset_classes is None:
            self.asset_classes = ["Equities", "Fixed Income"]

@dataclass
class TradeExecutionConfig:
    order_types: List[str] = None
    avoid_periods: List[str] = None
    slippage_modeling: bool = True
    factor_costs: bool = True
    tax_considerations: bool = True
    turnover_limits: float = 0.5

    def __post_init__(self):
        if self.order_types is None:
            self.order_types = ["Limit", "TWAP"]
        if self.avoid_periods is None:
            self.avoid_periods = ["Market open/close"]

@dataclass
class AnalysisFrameworkConfig:
    technical_tools: List[str] = None
    technical_timeframes: List[str] = None
    fundamental_metrics: List[str] = None
    quantitative_models: List[str] = None

    def __post_init__(self):
        if self.technical_tools is None:
            self.technical_tools = ["Moving Averages", "RSI", "MACD"]
        if self.technical_timeframes is None:
            self.technical_timeframes = ["Daily", "Weekly"]
        if self.fundamental_metrics is None:
            self.fundamental_metrics = ["Revenue growth", "P/E ratio"]
        if self.quantitative_models is None:
            self.quantitative_models = ["Factor models"]

@dataclass
class GovernanceConfig:
    proposal_mode: str = "LLM may propose trades with structured rationale"
    approval_required: bool = True
    logging_enabled: bool = True
    conviction_threshold: float = 0.6

@dataclass
class ComplianceConfig:
    record_keeping: bool = True
    insider_trading_protocols: bool = True
    reporting_thresholds: bool = True
    esg_considerations: bool = True

class TradingConfig:
    def __init__(self, spec: Dict[str, Any]):
        self.validate_spec(spec)
        trading_spec = spec["trading_assistant_spec"]

        self.goal = trading_spec["meta"]["goal"]
        self.deployment_phases = trading_spec["meta"]["deployment_phases"]

        self.risk_management = RiskManagementConfig(
            max_risk_per_trade=trading_spec["risk_management"]["position_sizing"]["max_risk_per_trade"],
            position_sizing_methods=trading_spec["risk_management"]["position_sizing"]["methods"],
            max_single_security=trading_spec["risk_management"]["portfolio_exposure"]["max_single_security"],
            max_asset_class=trading_spec["risk_management"]["portfolio_exposure"]["max_asset_class"],
            portfolio_loss_circuit_breaker=trading_spec["risk_management"]["monitoring"]["circuit_breakers"]["portfolio_loss"],
            single_day_loss_circuit_breaker=trading_spec["risk_management"]["monitoring"]["circuit_breakers"]["single_day_loss"]
        )

        self.portfolio_management = PortfolioManagementConfig(
            asset_classes=trading_spec["portfolio_management"]["allocation"]["asset_classes"],
            sector_limit=trading_spec["portfolio_management"]["allocation"]["sector_limit"],
            geographic_diversification=trading_spec["portfolio_management"]["allocation"]["geographic_diversification"]
        )

        self.trade_execution = TradeExecutionConfig(
            order_types=trading_spec["trade_execution"]["order_management"]["order_types"],
            avoid_periods=trading_spec["trade_execution"]["order_management"]["avoid_periods"],
            turnover_limits=trading_spec["trade_execution"]["transaction_costs"]["turnover_limits"]
        )

        self.analysis_framework = AnalysisFrameworkConfig(
            technical_tools=trading_spec["analysis_framework"]["technical"]["tools"],
            technical_timeframes=trading_spec["analysis_framework"]["technical"]["multi_timeframe"],
            fundamental_metrics=trading_spec["analysis_framework"]["fundamental"]["metrics"],
            quantitative_models=trading_spec["analysis_framework"]["quantitative"]["models"]
        )

        self.governance = GovernanceConfig(
            proposal_mode=trading_spec["governance"]["autonomy_levels"]["proposal"],
            approval_required=True  # Always true during pilot phase
        )

        self.compliance = ComplianceConfig(
            record_keeping=trading_spec["compliance_ethics"]["regulatory"]["record_keeping"],
            insider_trading_protocols=trading_spec["compliance_ethics"]["regulatory"]["insider_trading_protocols"],
            esg_considerations=trading_spec["compliance_ethics"]["ethics"]["ESG_considerations"]
        )

    @classmethod
    def load_from_file(cls, config_path: str) -> 'TradingConfig':
        with open(config_path, 'r') as f:
            spec = json.load(f)
        return cls(spec)

    def validate_spec(self, spec: Dict[str, Any]) -> None:
        """Validate the trading specification against the JSON schema"""
        schema_path = Path(__file__).parent / "schema" / "trading_spec_schema.json"

        if schema_path.exists():
            with open(schema_path, 'r') as f:
                schema = json.load(f)
            try:
                jsonschema.validate(spec, schema)
            except jsonschema.ValidationError as e:
                raise ValueError(f"Invalid trading specification: {e}")
        else:
            # Basic validation if schema file doesn't exist
            if "trading_assistant_spec" not in spec:
                raise ValueError("Missing 'trading_assistant_spec' in configuration")

    def to_dict(self) -> Dict[str, Any]:
        """Convert configuration to dictionary"""
        return {
            "goal": self.goal,
            "deployment_phases": self.deployment_phases,
            "risk_management": asdict(self.risk_management),
            "portfolio_management": asdict(self.portfolio_management),
            "trade_execution": asdict(self.trade_execution),
            "analysis_framework": asdict(self.analysis_framework),
            "governance": asdict(self.governance),
            "compliance": asdict(self.compliance)
        }
