#!/usr/bin/env python3
"""
Comprehensive QA Workflow Agent
==============================

Orchestrates all QA agents in the proper sequence:
1. Design System Agent - Audits and enforces design consistency
2. Frontend QA Agent - Validates UI/UX functionality
3. Backend QA Agent - Tests API endpoints and data flow
4. Generates consolidated reports and recommendations

Author: Claude Code Assistant
Date: 2025-09-29
"""

import asyncio
import json
import logging
import subprocess
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("Comprehensive_QA_Workflow")

class ComprehensiveQAWorkflow:
    """Orchestrates comprehensive QA testing across all systems"""

    def __init__(self, base_url: str = "http://127.0.0.1:8000"):
        self.base_url = base_url
        self.results = {}
        self.total_start_time = time.time()

    def run_command(self, command: str, description: str) -> Dict[str, Any]:
        """Run a command and capture results"""
        logger.info(f"🔄 {description}...")

        start_time = time.time()
        try:
            result = subprocess.run(
                command.split(),
                capture_output=True,
                text=True,
                timeout=300  # 5 minute timeout
            )

            execution_time = time.time() - start_time

            if result.returncode == 0:
                logger.info(f"✅ {description} completed ({execution_time:.2f}s)")
                return {
                    "status": "success",
                    "execution_time": execution_time,
                    "stdout": result.stdout,
                    "stderr": result.stderr
                }
            else:
                logger.error(f"❌ {description} failed ({execution_time:.2f}s)")
                return {
                    "status": "failed",
                    "execution_time": execution_time,
                    "stdout": result.stdout,
                    "stderr": result.stderr,
                    "return_code": result.returncode
                }

        except subprocess.TimeoutExpired:
            execution_time = time.time() - start_time
            logger.error(f"⏰ {description} timed out ({execution_time:.2f}s)")
            return {
                "status": "timeout",
                "execution_time": execution_time,
                "error": "Command timed out after 5 minutes"
            }
        except Exception as e:
            execution_time = time.time() - start_time
            logger.error(f"💥 {description} encountered error ({execution_time:.2f}s): {str(e)}")
            return {
                "status": "error",
                "execution_time": execution_time,
                "error": str(e)
            }

    def load_report(self, pattern: str) -> Dict[str, Any]:
        """Load the most recent report matching pattern"""
        try:
            # Find the most recent report file
            files = list(Path(".").glob(pattern))
            if not files:
                return {"error": f"No report files found matching {pattern}"}

            latest_file = max(files, key=lambda f: f.stat().st_mtime)

            with open(latest_file, 'r') as f:
                return json.load(f)
        except Exception as e:
            return {"error": f"Failed to load report: {str(e)}"}

    async def run_design_system_audit(self) -> Dict[str, Any]:
        """Run Design System Agent audit"""
        logger.info("🎨 === DESIGN SYSTEM AUDIT ===")

        result = self.run_command(
            "python3 design_system_agent.py",
            "Design System Audit"
        )

        if result["status"] == "success":
            # Load the generated report
            design_report = self.load_report("design_system_audit_*.json")
            result["report"] = design_report

        return result

    async def run_frontend_qa(self) -> Dict[str, Any]:
        """Run Frontend QA Agent tests"""
        logger.info("🖥️ === FRONTEND QA TESTS ===")

        result = self.run_command(
            "python3 frontend_qa_agent.py",
            "Frontend QA Tests"
        )

        if result["status"] == "success":
            # Load the generated report
            frontend_report = self.load_report("frontend_qa_report_*.json")
            result["report"] = frontend_report

        return result

    async def run_backend_qa(self) -> Dict[str, Any]:
        """Run Backend QA Agent tests"""
        logger.info("🔧 === BACKEND QA TESTS ===")

        result = self.run_command(
            "python3 backend_qa_agent.py",
            "Backend QA Tests"
        )

        if result["status"] == "success":
            # Load the generated report
            backend_report = self.load_report("backend_qa_report_*.json")
            result["report"] = backend_report

        return result

    def generate_consolidated_report(self) -> Dict[str, Any]:
        """Generate comprehensive consolidated report"""
        logger.info("📊 Generating Consolidated Report...")

        total_execution_time = time.time() - self.total_start_time

        # Extract key metrics from each agent
        consolidated = {
            "timestamp": datetime.now().isoformat(),
            "total_execution_time": total_execution_time,
            "agents_run": [],
            "overall_summary": {
                "total_tests": 0,
                "total_passed": 0,
                "total_failed": 0,
                "total_warnings": 0,
                "total_violations": 0,
                "overall_success_rate": 0.0,
                "overall_status": "UNKNOWN"
            },
            "agent_results": self.results,
            "recommendations": [],
            "next_steps": []
        }

        # Process Design System results
        if "design_system" in self.results and "report" in self.results["design_system"]:
            ds_report = self.results["design_system"]["report"]
            if "summary" in ds_report:
                summary = ds_report["summary"]
                consolidated["agents_run"].append("Design System Agent")
                consolidated["overall_summary"]["total_tests"] += summary.get("total_tests", 0)
                consolidated["overall_summary"]["total_passed"] += summary.get("passed", 0)
                consolidated["overall_summary"]["total_failed"] += summary.get("failed", 0)
                consolidated["overall_summary"]["total_warnings"] += summary.get("warnings", 0)
                consolidated["overall_summary"]["total_violations"] += summary.get("total_violations", 0)

                # Add design system recommendations
                if "recommendations" in ds_report:
                    if "immediate_actions" in ds_report["recommendations"]:
                        consolidated["recommendations"].extend(ds_report["recommendations"]["immediate_actions"])

        # Process Frontend QA results
        if "frontend_qa" in self.results and "report" in self.results["frontend_qa"]:
            fe_report = self.results["frontend_qa"]["report"]
            if "summary" in fe_report:
                summary = fe_report["summary"]
                consolidated["agents_run"].append("Frontend QA Agent")
                consolidated["overall_summary"]["total_tests"] += summary.get("total_tests", 0)
                consolidated["overall_summary"]["total_passed"] += summary.get("passed", 0)
                consolidated["overall_summary"]["total_failed"] += summary.get("failed", 0)
                consolidated["overall_summary"]["total_warnings"] += summary.get("warnings", 0)

        # Process Backend QA results
        if "backend_qa" in self.results and "report" in self.results["backend_qa"]:
            be_report = self.results["backend_qa"]["report"]
            if "summary" in be_report:
                summary = be_report["summary"]
                consolidated["agents_run"].append("Backend QA Agent")
                consolidated["overall_summary"]["total_tests"] += summary.get("total_tests", 0)
                consolidated["overall_summary"]["total_passed"] += summary.get("passed", 0)
                consolidated["overall_summary"]["total_failed"] += summary.get("failed", 0)
                consolidated["overall_summary"]["total_warnings"] += summary.get("warnings", 0)

        # Calculate overall success rate
        total_tests = consolidated["overall_summary"]["total_tests"]
        total_passed = consolidated["overall_summary"]["total_passed"]

        if total_tests > 0:
            success_rate = (total_passed / total_tests) * 100
            consolidated["overall_summary"]["overall_success_rate"] = success_rate

            # Determine overall status
            critical_violations = consolidated["overall_summary"]["total_violations"]
            failed_tests = consolidated["overall_summary"]["total_failed"]

            if critical_violations > 5 or failed_tests > 5:
                consolidated["overall_summary"]["overall_status"] = "CRITICAL"
            elif success_rate >= 95:
                consolidated["overall_summary"]["overall_status"] = "EXCELLENT"
            elif success_rate >= 85:
                consolidated["overall_summary"]["overall_status"] = "GOOD"
            elif success_rate >= 70:
                consolidated["overall_summary"]["overall_status"] = "ACCEPTABLE"
            else:
                consolidated["overall_summary"]["overall_status"] = "NEEDS_IMPROVEMENT"

        # Generate next steps based on results
        consolidated["next_steps"] = self._generate_next_steps(consolidated)

        return consolidated

    def _generate_next_steps(self, consolidated: Dict[str, Any]) -> List[str]:
        """Generate actionable next steps based on results"""
        next_steps = []

        overall_status = consolidated["overall_summary"]["overall_status"]
        total_violations = consolidated["overall_summary"]["total_violations"]
        failed_tests = consolidated["overall_summary"]["total_failed"]

        if overall_status == "CRITICAL":
            next_steps.append("🚨 IMMEDIATE ACTION REQUIRED: Address critical violations and failing tests")
            next_steps.append("🔧 Run individual agents to identify specific issues")
            next_steps.append("📋 Review design system compliance")

        if total_violations > 0:
            next_steps.append(f"🎨 Design System: Fix {total_violations} design violations")
            next_steps.append("📐 Implement standardized design tokens")

        if failed_tests > 0:
            next_steps.append(f"✅ Testing: Fix {failed_tests} failing tests")
            next_steps.append("🔍 Review test failure details in individual reports")

        if overall_status in ["GOOD", "EXCELLENT"]:
            next_steps.append("🎉 System is in good shape - continue monitoring")
            next_steps.append("🔄 Schedule regular QA audits")

        if not next_steps:
            next_steps.append("📊 Review individual agent reports for detailed insights")
            next_steps.append("🔄 Re-run comprehensive audit after changes")

        return next_steps

    async def run_comprehensive_audit(self) -> Dict[str, Any]:
        """Run complete comprehensive QA audit"""
        logger.info("🚀 === COMPREHENSIVE QA AUDIT STARTING ===")
        logger.info(f"🌐 Target URL: {self.base_url}")
        logger.info("=" * 80)

        # Run all QA agents in sequence
        self.results["design_system"] = await self.run_design_system_audit()

        # Only continue if design system audit completes
        if self.results["design_system"]["status"] != "error":
            self.results["frontend_qa"] = await self.run_frontend_qa()

            # Only run backend if frontend completes
            if self.results["frontend_qa"]["status"] != "error":
                self.results["backend_qa"] = await self.run_backend_qa()

        # Generate consolidated report
        logger.info("=" * 80)
        consolidated_report = self.generate_consolidated_report()

        # Save consolidated report
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        report_filename = f"comprehensive_qa_audit_{timestamp}.json"

        with open(report_filename, 'w') as f:
            json.dump(consolidated_report, f, indent=2)

        # Print summary
        logger.info("🏁 === COMPREHENSIVE QA AUDIT COMPLETE ===")

        summary = consolidated_report["overall_summary"]
        logger.info(f"📊 Overall Results: {summary['total_passed']}/{summary['total_tests']} PASSED " +
                   f"({summary['overall_success_rate']:.1f}%)")
        logger.info(f"🎯 Overall Status: {summary['overall_status']}")
        logger.info(f"⚠️ Total Violations: {summary['total_violations']}")
        logger.info(f"❌ Failed Tests: {summary['total_failed']}")
        logger.info(f"⏱️ Total Execution Time: {consolidated_report['total_execution_time']:.2f}s")

        logger.info("\n📋 Next Steps:")
        for step in consolidated_report["next_steps"]:
            logger.info(f"   {step}")

        logger.info(f"\n📄 Detailed report saved to: {report_filename}")
        logger.info("=" * 80)

        return consolidated_report

async def main():
    """Main execution function"""
    workflow = ComprehensiveQAWorkflow()
    await workflow.run_comprehensive_audit()

if __name__ == "__main__":
    asyncio.run(main())
