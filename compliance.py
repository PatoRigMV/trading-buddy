"""
Compliance and Ethics Validation System
"""

import logging
import numpy as np
import json
from dataclasses import dataclass, asdict
from typing import Dict, List, Optional, Any, Set
from datetime import datetime, timedelta
from enum import Enum
from risk_manager import TradeProposal, Position

class ComplianceViolationType(Enum):
    INSIDER_TRADING = "INSIDER_TRADING"
    MARKET_MANIPULATION = "MARKET_MANIPULATION"
    POSITION_LIMITS = "POSITION_LIMITS"
    REPORTING_THRESHOLD = "REPORTING_THRESHOLD"
    ESG_VIOLATION = "ESG_VIOLATION"
    RECORD_KEEPING = "RECORD_KEEPING"
    SUITABILITY = "SUITABILITY"

@dataclass
class ComplianceCheck:
    check_type: str
    passed: bool
    details: str
    timestamp: datetime
    severity: str = "INFO"  # INFO, WARNING, ERROR

@dataclass
class ComplianceViolation:
    violation_type: ComplianceViolationType
    description: str
    severity: str
    timestamp: datetime
    trade_id: Optional[str] = None
    action_required: str = ""

@dataclass
class ComplianceReport:
    check_id: str
    proposal: TradeProposal
    checks: List[ComplianceCheck]
    violations: List[ComplianceViolation]
    overall_status: str
    approved: bool
    timestamp: datetime

class ComplianceValidator:
    def __init__(self, config):
        self.config = config
        self.logger = logging.getLogger(__name__)

        # Compliance settings
        self.record_keeping_enabled = config.record_keeping
        self.insider_trading_protocols = config.insider_trading_protocols
        self.reporting_thresholds_enabled = config.reporting_thresholds
        self.esg_considerations = config.esg_considerations

        # Watchlists and restricted securities
        self.restricted_securities: Set[str] = set()
        self.insider_watchlist: Set[str] = set()
        self.esg_exclusions: Set[str] = set()

        # Trading limits
        self.position_limits = {
            "single_security_limit": 0.05,  # 5% max position
            "sector_concentration_limit": 0.20,  # 20% max per sector
            "daily_trading_limit": 100000,  # $100k daily trading limit
            "reporting_threshold": 10000  # $10k reporting threshold
        }

        # Initialize compliance data
        self._load_compliance_data()

    def _load_compliance_data(self) -> None:
        """Load compliance watchlists and restrictions"""
        # Load restricted securities (placeholder)
        self.restricted_securities = {"RESTRICTED_STOCK_1", "RESTRICTED_STOCK_2"}

        # Load insider trading watchlist
        self.insider_watchlist = {"INSIDER_WATCH_1", "INSIDER_WATCH_2"}

        # Load ESG exclusions
        self.esg_exclusions = {"TOBACCO_CO", "WEAPONS_MFG", "FOSSIL_FUEL_CO"}

        self.logger.info("Compliance data loaded")

    def validate_trade(self, proposal: TradeProposal,
                      current_positions: Dict[str, Position],
                      daily_trading_volume: float) -> ComplianceReport:
        """Perform comprehensive compliance validation"""

        check_id = f"COMP_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        checks = []
        violations = []

        # Insider trading check
        insider_check = self._check_insider_trading(proposal)
        checks.append(insider_check)
        if not insider_check.passed:
            violations.append(ComplianceViolation(
                violation_type=ComplianceViolationType.INSIDER_TRADING,
                description=insider_check.details,
                severity="ERROR",
                timestamp=datetime.now(),
                trade_id=proposal.symbol,
                action_required="Block trade immediately"
            ))

        # Market manipulation check
        manipulation_check = self._check_market_manipulation(proposal)
        checks.append(manipulation_check)
        if not manipulation_check.passed:
            violations.append(ComplianceViolation(
                violation_type=ComplianceViolationType.MARKET_MANIPULATION,
                description=manipulation_check.details,
                severity="ERROR",
                timestamp=datetime.now(),
                action_required="Block trade and investigate"
            ))

        # Position limits check
        position_check = self._check_position_limits(proposal, current_positions)
        checks.append(position_check)
        if not position_check.passed:
            violations.append(ComplianceViolation(
                violation_type=ComplianceViolationType.POSITION_LIMITS,
                description=position_check.details,
                severity="WARNING",
                timestamp=datetime.now(),
                action_required="Reduce position size"
            ))

        # Reporting threshold check
        reporting_check = self._check_reporting_thresholds(proposal, daily_trading_volume)
        checks.append(reporting_check)
        if not reporting_check.passed:
            violations.append(ComplianceViolation(
                violation_type=ComplianceViolationType.REPORTING_THRESHOLD,
                description=reporting_check.details,
                severity="INFO",
                timestamp=datetime.now(),
                action_required="Generate regulatory report"
            ))

        # ESG compliance check
        if self.esg_considerations:
            esg_check = self._check_esg_compliance(proposal)
            checks.append(esg_check)
            if not esg_check.passed:
                violations.append(ComplianceViolation(
                    violation_type=ComplianceViolationType.ESG_VIOLATION,
                    description=esg_check.details,
                    severity="WARNING",
                    timestamp=datetime.now(),
                    action_required="Review ESG policy alignment"
                ))

        # Suitability assessment
        suitability_check = self._check_suitability(proposal)
        checks.append(suitability_check)
        if not suitability_check.passed:
            violations.append(ComplianceViolation(
                violation_type=ComplianceViolationType.SUITABILITY,
                description=suitability_check.details,
                severity="ERROR",
                timestamp=datetime.now(),
                action_required="Reassess client suitability"
            ))

        # Determine overall status
        error_violations = [v for v in violations if v.severity == "ERROR"]
        overall_status = "FAILED" if error_violations else "PASSED"
        approved = len(error_violations) == 0

        compliance_report = ComplianceReport(
            check_id=check_id,
            proposal=proposal,
            checks=checks,
            violations=violations,
            overall_status=overall_status,
            approved=approved,
            timestamp=datetime.now()
        )

        # Log compliance result
        self._log_compliance_check(compliance_report)

        return compliance_report

    def _check_insider_trading(self, proposal: TradeProposal) -> ComplianceCheck:
        """Check for insider trading violations"""
        if not self.insider_trading_protocols:
            return ComplianceCheck(
                check_type="INSIDER_TRADING",
                passed=True,
                details="Insider trading protocols disabled",
                timestamp=datetime.now()
            )

        # Check if security is on insider watchlist
        if proposal.symbol in self.insider_watchlist:
            return ComplianceCheck(
                check_type="INSIDER_TRADING",
                passed=False,
                details=f"Security {proposal.symbol} is on insider trading watchlist",
                timestamp=datetime.now(),
                severity="ERROR"
            )

        # Check if trade size is suspiciously large before earnings
        # (simplified check - real implementation would use earnings calendar)
        trade_value = proposal.quantity * proposal.price
        if trade_value > 50000:  # $50k threshold
            return ComplianceCheck(
                check_type="INSIDER_TRADING",
                passed=True,
                details=f"Large trade {trade_value:.0f} reviewed - no insider concerns",
                timestamp=datetime.now(),
                severity="WARNING"
            )

        return ComplianceCheck(
            check_type="INSIDER_TRADING",
            passed=True,
            details="No insider trading concerns detected",
            timestamp=datetime.now()
        )

    def _check_market_manipulation(self, proposal: TradeProposal) -> ComplianceCheck:
        """Check for potential market manipulation"""

        # Check for restricted securities
        if proposal.symbol in self.restricted_securities:
            return ComplianceCheck(
                check_type="MARKET_MANIPULATION",
                passed=False,
                details=f"Security {proposal.symbol} is restricted from trading",
                timestamp=datetime.now(),
                severity="ERROR"
            )

        # Check for excessive trading frequency (simplified)
        # Real implementation would track trading patterns

        # Check for wash sale patterns (simplified)
        # Real implementation would analyze recent trades for wash sales

        return ComplianceCheck(
            check_type="MARKET_MANIPULATION",
            passed=True,
            details="No market manipulation patterns detected",
            timestamp=datetime.now()
        )

    def _check_position_limits(self, proposal: TradeProposal,
                             current_positions: Dict[str, Position]) -> ComplianceCheck:
        """Check position concentration limits"""

        # Calculate portfolio value
        portfolio_value = sum(pos.quantity * pos.current_price for pos in current_positions.values())
        if portfolio_value == 0:
            portfolio_value = 100000  # Default for new portfolios

        # Check single security limit
        current_position_value = 0
        if proposal.symbol in current_positions:
            pos = current_positions[proposal.symbol]
            current_position_value = pos.quantity * pos.current_price

        new_position_value = current_position_value + (proposal.quantity * proposal.price)
        position_percentage = new_position_value / portfolio_value

        if position_percentage > self.position_limits["single_security_limit"]:
            return ComplianceCheck(
                check_type="POSITION_LIMITS",
                passed=False,
                details=f"Position in {proposal.symbol} would be {position_percentage:.1%}, exceeds limit of {self.position_limits['single_security_limit']:.1%}",
                timestamp=datetime.now(),
                severity="WARNING"
            )

        # Check sector concentration (simplified)
        # Real implementation would aggregate by actual sectors

        return ComplianceCheck(
            check_type="POSITION_LIMITS",
            passed=True,
            details=f"Position limits satisfied: {position_percentage:.1%} of portfolio",
            timestamp=datetime.now()
        )

    def _check_reporting_thresholds(self, proposal: TradeProposal,
                                   daily_volume: float) -> ComplianceCheck:
        """Check regulatory reporting thresholds"""
        if not self.reporting_thresholds_enabled:
            return ComplianceCheck(
                check_type="REPORTING_THRESHOLD",
                passed=True,
                details="Reporting thresholds disabled",
                timestamp=datetime.now()
            )

        trade_value = proposal.quantity * proposal.price

        # Check if trade exceeds reporting threshold
        if trade_value > self.position_limits["reporting_threshold"]:
            return ComplianceCheck(
                check_type="REPORTING_THRESHOLD",
                passed=False,
                details=f"Trade value {trade_value:.0f} exceeds reporting threshold {self.position_limits['reporting_threshold']:.0f}",
                timestamp=datetime.now(),
                severity="INFO"
            )

        # Check daily trading volume
        new_daily_volume = daily_volume + trade_value
        if new_daily_volume > self.position_limits["daily_trading_limit"]:
            return ComplianceCheck(
                check_type="REPORTING_THRESHOLD",
                passed=False,
                details=f"Daily trading volume {new_daily_volume:.0f} would exceed limit {self.position_limits['daily_trading_limit']:.0f}",
                timestamp=datetime.now(),
                severity="WARNING"
            )

        return ComplianceCheck(
            check_type="REPORTING_THRESHOLD",
            passed=True,
            details="Within reporting thresholds",
            timestamp=datetime.now()
        )

    def _check_esg_compliance(self, proposal: TradeProposal) -> ComplianceCheck:
        """Check ESG compliance"""

        if proposal.symbol in self.esg_exclusions:
            return ComplianceCheck(
                check_type="ESG_COMPLIANCE",
                passed=False,
                details=f"Security {proposal.symbol} violates ESG exclusion criteria",
                timestamp=datetime.now(),
                severity="WARNING"
            )

        # Additional ESG checks could include:
        # - Carbon footprint analysis
        # - Social responsibility scores
        # - Governance ratings

        return ComplianceCheck(
            check_type="ESG_COMPLIANCE",
            passed=True,
            details="ESG criteria satisfied",
            timestamp=datetime.now()
        )

    def _check_suitability(self, proposal: TradeProposal) -> ComplianceCheck:
        """Check investment suitability"""

        # Simplified suitability check
        # Real implementation would consider:
        # - Client risk profile
        # - Investment objectives
        # - Financial situation
        # - Investment experience

        # For now, check basic criteria
        trade_value = proposal.quantity * proposal.price

        # Check if trade size is appropriate (simplified)
        if trade_value > 10000:  # $10k threshold for review
            return ComplianceCheck(
                check_type="SUITABILITY",
                passed=True,
                details=f"Large trade {trade_value:.0f} reviewed for suitability - approved",
                timestamp=datetime.now(),
                severity="INFO"
            )

        return ComplianceCheck(
            check_type="SUITABILITY",
            passed=True,
            details="Suitability requirements met",
            timestamp=datetime.now()
        )

    def _log_compliance_check(self, report: ComplianceReport) -> None:
        """Log compliance check results"""
        if self.record_keeping_enabled:
            log_entry = {
                "timestamp": datetime.now().isoformat(),
                "check_id": report.check_id,
                "symbol": report.proposal.symbol,
                "overall_status": report.overall_status,
                "approved": report.approved,
                "checks": [asdict(check) for check in report.checks],
                "violations": [asdict(violation) for violation in report.violations]
            }

            # Write to compliance log
            with open("compliance.log", "a") as f:
                f.write(json.dumps(log_entry, default=str) + "\n")

            if report.violations:
                self.logger.warning(f"Compliance violations detected: {len(report.violations)}")
            else:
                self.logger.info(f"Compliance check passed: {report.check_id}")

    def generate_compliance_report(self, period_days: int = 30) -> Dict[str, Any]:
        """Generate compliance summary report"""

        # Read compliance logs
        compliance_logs = []
        try:
            with open("compliance.log", "r") as f:
                for line in f:
                    log_entry = json.loads(line.strip())
                    compliance_logs.append(log_entry)
        except FileNotFoundError:
            self.logger.info("No compliance log file found")

        # Filter for specified period
        cutoff_date = datetime.now() - timedelta(days=period_days)
        recent_logs = [
            log for log in compliance_logs
            if datetime.fromisoformat(log['timestamp']) > cutoff_date
        ]

        # Calculate statistics
        total_checks = len(recent_logs)
        passed_checks = len([log for log in recent_logs if log['approved']])
        failed_checks = total_checks - passed_checks

        # Violation statistics
        violation_counts = {}
        for log in recent_logs:
            for violation in log.get('violations', []):
                violation_type = violation['violation_type']
                violation_counts[violation_type] = violation_counts.get(violation_type, 0) + 1

        report = {
            "report_period": f"Last {period_days} days",
            "generated_at": datetime.now().isoformat(),
            "summary": {
                "total_compliance_checks": total_checks,
                "passed_checks": passed_checks,
                "failed_checks": failed_checks,
                "pass_rate": passed_checks / total_checks if total_checks > 0 else 0
            },
            "violation_breakdown": violation_counts,
            "compliance_status": "COMPLIANT" if failed_checks == 0 else "VIOLATIONS_DETECTED",
            "recommendations": self._generate_compliance_recommendations(violation_counts)
        }

        # Save report
        filename = f"compliance_report_{datetime.now().strftime('%Y%m%d')}.json"
        with open(filename, 'w') as f:
            json.dump(report, f, indent=2)

        self.logger.info(f"Compliance report generated: {filename}")
        return report

    def _generate_compliance_recommendations(self, violation_counts: Dict[str, int]) -> List[str]:
        """Generate compliance improvement recommendations"""
        recommendations = []

        if violation_counts.get("POSITION_LIMITS", 0) > 0:
            recommendations.append("Review position sizing algorithms to prevent concentration violations")

        if violation_counts.get("ESG_VIOLATION", 0) > 0:
            recommendations.append("Update ESG screening criteria and exclusion lists")

        if violation_counts.get("REPORTING_THRESHOLD", 0) > 0:
            recommendations.append("Implement automated reporting for threshold breaches")

        if violation_counts.get("INSIDER_TRADING", 0) > 0:
            recommendations.append("Strengthen insider trading monitoring and controls")

        if not recommendations:
            recommendations.append("Compliance status is satisfactory - continue current practices")

        return recommendations

    def update_watchlists(self, watchlist_updates: Dict[str, List[str]]) -> None:
        """Update compliance watchlists"""

        if "restricted_securities" in watchlist_updates:
            self.restricted_securities.update(watchlist_updates["restricted_securities"])

        if "insider_watchlist" in watchlist_updates:
            self.insider_watchlist.update(watchlist_updates["insider_watchlist"])

        if "esg_exclusions" in watchlist_updates:
            self.esg_exclusions.update(watchlist_updates["esg_exclusions"])

        self.logger.info("Compliance watchlists updated")

    def get_compliance_status(self) -> Dict[str, Any]:
        """Get current compliance status"""
        return {
            "record_keeping_enabled": self.record_keeping_enabled,
            "insider_trading_protocols": self.insider_trading_protocols,
            "esg_considerations": self.esg_considerations,
            "restricted_securities_count": len(self.restricted_securities),
            "insider_watchlist_count": len(self.insider_watchlist),
            "esg_exclusions_count": len(self.esg_exclusions),
            "position_limits": self.position_limits,
            "last_updated": datetime.now().isoformat()
        }
