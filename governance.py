"""
Governance and Approval System for LLM Trading Assistant
"""

import json
import logging
import numpy as np
from dataclasses import dataclass, asdict
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from enum import Enum
from risk_manager import TradeProposal, RiskAssessment

class ApprovalStatus(Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"

@dataclass
class ApprovalRequest:
    id: str
    proposal: TradeProposal
    risk_assessment: RiskAssessment
    submitted_at: datetime
    status: ApprovalStatus = ApprovalStatus.PENDING
    approver: Optional[str] = None
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    auto_approved: bool = False

@dataclass
class ApprovalResult:
    approved: bool
    request_id: str
    reason: str
    auto_approved: bool = False

class GovernanceManager:
    def __init__(self, config):
        self.config = config
        self.logger = logging.getLogger(__name__)
        self.approval_requests: Dict[str, ApprovalRequest] = {}
        self.approval_log: List[Dict[str, Any]] = []
        self._request_counter = 0

        # Load governance settings
        self.conviction_threshold = getattr(config, 'conviction_threshold', 0.6)
        self.approval_required = getattr(config, 'approval_required', True)

    def _generate_request_id(self) -> str:
        """Generate unique approval request ID"""
        self._request_counter += 1
        return f"APPR_{datetime.now().strftime('%Y%m%d')}_{self._request_counter:06d}"

    async def submit_for_approval(self, proposal: TradeProposal,
                                 risk_assessment: RiskAssessment) -> ApprovalResult:
        """Submit trade proposal for governance approval"""

        # Check if auto-approval criteria are met
        if self._can_auto_approve(proposal, risk_assessment):
            return self._auto_approve(proposal, risk_assessment)

        # Create approval request
        request_id = self._generate_request_id()
        approval_request = ApprovalRequest(
            id=request_id,
            proposal=proposal,
            risk_assessment=risk_assessment,
            submitted_at=datetime.now()
        )

        self.approval_requests[request_id] = approval_request

        # Log the approval request
        self._log_approval_request(approval_request)

        # For pilot phase, all trades require human approval
        if self.approval_required:
            self.logger.info(f"Trade proposal {request_id} requires human approval")
            return ApprovalResult(
                approved=False,
                request_id=request_id,
                reason="Human approval required during pilot phase"
            )

        # In autonomous mode, would implement auto-approval logic here
        return self._auto_approve(proposal, risk_assessment)

    def _can_auto_approve(self, proposal: TradeProposal, risk_assessment: RiskAssessment) -> bool:
        """Determine if trade can be auto-approved"""
        # During pilot phase, never auto-approve
        if self.approval_required:
            return False

        # Auto-approval criteria for autonomous phase
        criteria = [
            proposal.conviction >= self.conviction_threshold,
            risk_assessment.approved,
            risk_assessment.risk_score <= 0.5,
            self._check_auto_approval_limits(proposal)
        ]

        return all(criteria)

    def _check_auto_approval_limits(self, proposal: TradeProposal) -> bool:
        """Check if trade meets auto-approval limits"""
        # Example limits for autonomous operation
        max_auto_trade_value = 1000  # $1000 max per auto-approved trade
        trade_value = proposal.quantity * proposal.price

        return trade_value <= max_auto_trade_value

    def _auto_approve(self, proposal: TradeProposal, risk_assessment: RiskAssessment) -> ApprovalResult:
        """Auto-approve a trade proposal"""
        request_id = self._generate_request_id()

        approval_request = ApprovalRequest(
            id=request_id,
            proposal=proposal,
            risk_assessment=risk_assessment,
            submitted_at=datetime.now(),
            status=ApprovalStatus.APPROVED,
            approver="SYSTEM",
            approved_at=datetime.now(),
            auto_approved=True
        )

        self.approval_requests[request_id] = approval_request
        self._log_approval_request(approval_request)

        self.logger.info(f"Trade auto-approved: {request_id}")

        return ApprovalResult(
            approved=True,
            request_id=request_id,
            reason="Auto-approved based on governance criteria",
            auto_approved=True
        )

    def approve_request(self, request_id: str, approver: str) -> bool:
        """Manually approve a pending request"""
        if request_id not in self.approval_requests:
            self.logger.error(f"Approval request not found: {request_id}")
            return False

        request = self.approval_requests[request_id]

        if request.status != ApprovalStatus.PENDING:
            self.logger.warning(f"Request {request_id} is not pending: {request.status}")
            return False

        request.status = ApprovalStatus.APPROVED
        request.approver = approver
        request.approved_at = datetime.now()

        self._log_approval_action(request_id, "APPROVED", approver)
        self.logger.info(f"Request approved: {request_id} by {approver}")

        return True

    def reject_request(self, request_id: str, approver: str, reason: str) -> bool:
        """Manually reject a pending request"""
        if request_id not in self.approval_requests:
            self.logger.error(f"Approval request not found: {request_id}")
            return False

        request = self.approval_requests[request_id]

        if request.status != ApprovalStatus.PENDING:
            self.logger.warning(f"Request {request_id} is not pending: {request.status}")
            return False

        request.status = ApprovalStatus.REJECTED
        request.approver = approver
        request.rejection_reason = reason

        self._log_approval_action(request_id, "REJECTED", approver, reason)
        self.logger.info(f"Request rejected: {request_id} by {approver} - {reason}")

        return True

    def get_pending_approvals(self) -> List[ApprovalRequest]:
        """Get all pending approval requests"""
        return [
            request for request in self.approval_requests.values()
            if request.status == ApprovalStatus.PENDING
        ]

    def _log_approval_request(self, request: ApprovalRequest) -> None:
        """Log approval request details"""
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "event_type": "APPROVAL_REQUEST",
            "request_id": request.id,
            "symbol": request.proposal.symbol,
            "action": request.proposal.action,
            "quantity": request.proposal.quantity,
            "price": request.proposal.price,
            "conviction": request.proposal.conviction,
            "risk_score": request.risk_assessment.risk_score,
            "risk_approved": request.risk_assessment.approved,
            "rationale": request.proposal.rationale,
            "auto_approved": request.auto_approved
        }

        self.approval_log.append(log_entry)

        # Also log to file
        with open("governance.log", "a") as f:
            f.write(json.dumps(log_entry) + "\n")

    def _log_approval_action(self, request_id: str, action: str, approver: str,
                           reason: Optional[str] = None) -> None:
        """Log approval action"""
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "event_type": "APPROVAL_ACTION",
            "request_id": request_id,
            "action": action,
            "approver": approver,
            "reason": reason
        }

        self.approval_log.append(log_entry)

        with open("governance.log", "a") as f:
            f.write(json.dumps(log_entry) + "\n")

    def generate_weekly_report(self) -> Dict[str, Any]:
        """Generate weekly governance report"""
        end_date = datetime.now()
        start_date = end_date - timedelta(days=7)

        # Filter requests from last week
        weekly_requests = [
            request for request in self.approval_requests.values()
            if start_date <= request.submitted_at <= end_date
        ]

        # Calculate statistics
        total_requests = len(weekly_requests)
        approved_requests = len([r for r in weekly_requests if r.status == ApprovalStatus.APPROVED])
        rejected_requests = len([r for r in weekly_requests if r.status == ApprovalStatus.REJECTED])
        pending_requests = len([r for r in weekly_requests if r.status == ApprovalStatus.PENDING])
        auto_approved = len([r for r in weekly_requests if r.auto_approved])

        # Average conviction and risk scores
        avg_conviction = np.mean([r.proposal.conviction for r in weekly_requests]) if weekly_requests else 0
        avg_risk_score = np.mean([r.risk_assessment.risk_score for r in weekly_requests]) if weekly_requests else 0

        # Approval rate
        approval_rate = approved_requests / total_requests if total_requests > 0 else 0

        report = {
            "report_period": f"{start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}",
            "summary": {
                "total_requests": total_requests,
                "approved": approved_requests,
                "rejected": rejected_requests,
                "pending": pending_requests,
                "auto_approved": auto_approved,
                "approval_rate": approval_rate
            },
            "averages": {
                "conviction": avg_conviction,
                "risk_score": avg_risk_score
            },
            "requests": [asdict(request) for request in weekly_requests]
        }

        # Save report
        report_filename = f"governance_report_{end_date.strftime('%Y%m%d')}.json"
        with open(report_filename, "w") as f:
            json.dump(report, f, indent=2, default=str)

        self.logger.info(f"Weekly governance report generated: {report_filename}")

        return report

    def check_refusal_protocols(self, proposal: TradeProposal,
                               risk_assessment: RiskAssessment) -> Optional[str]:
        """Check if trade should be refused based on protocols"""
        refusal_reasons = []

        # Conviction threshold check
        if proposal.conviction < self.conviction_threshold:
            refusal_reasons.append(f"Conviction {proposal.conviction:.2f} below threshold {self.conviction_threshold}")

        # Risk budget check
        if not risk_assessment.approved:
            refusal_reasons.append(f"Risk assessment failed: {risk_assessment.reason}")

        # Conflicting signals check (simplified)
        # Would implement more sophisticated signal conflict detection

        return "; ".join(refusal_reasons) if refusal_reasons else None
