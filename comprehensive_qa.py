#!/usr/bin/env python3
"""
Comprehensive QA Suite - Full System Testing
Runs both backend API testing and frontend UI testing
"""

import asyncio
import subprocess
import sys
import time
import json
import os
from datetime import datetime
from pathlib import Path

def print_banner(title):
    """Print a fancy banner"""
    print("\n" + "="*80)
    print(f"🎯 {title}")
    print("="*80)

def print_summary(backend_success, frontend_success, backend_rate, frontend_rate):
    """Print final summary"""
    print("\n" + "="*80)
    print("🏁 COMPREHENSIVE QA SUITE RESULTS")
    print("="*80)

    overall_status = "EXCELLENT" if (backend_success and frontend_success) else "NEEDS ATTENTION"

    print(f"📊 Backend Testing:  {'✅ PASSED' if backend_success else '❌ FAILED'} ({backend_rate:.1f}%)")
    print(f"🖥️ Frontend Testing: {'✅ PASSED' if frontend_success else '❌ FAILED'} ({frontend_rate:.1f}%)")
    print(f"🎯 Overall Status:   {overall_status}")

    if backend_success and frontend_success:
        print("💪 System is FULLY OPERATIONAL - All tests passed!")
    else:
        print("⚠️ Some issues detected - Review individual reports for details")

    print("="*80)

async def run_backend_qa():
    """Run the backend QA audit agent"""
    print_banner("Backend API & System Testing")

    try:
        # Run the backend QA agent
        process = subprocess.run([
            "python3", "qa_audit_agent.py"
        ], capture_output=True, text=True, timeout=300)

        if process.returncode == 0:
            # Read the JSON report file for accurate results
            import glob

            # Find the most recent QA audit report
            report_files = glob.glob('qa_audit_report_*.json')
            if report_files:
                latest_report = max(report_files, key=os.path.getctime)
                try:
                    with open(latest_report, 'r') as f:
                        report_data = json.load(f)
                        success_rate = report_data.get('summary', {}).get('success_rate', 0.0)
                        print(f"✅ Backend QA: {success_rate:.1f}% success rate")
                        return success_rate >= 75.0, success_rate
                except:
                    pass

            # Fallback to log parsing if JSON reading fails
            success_rate = 0.0
            output_lines = process.stdout.split('\n')
            for line in output_lines:
                if "📊 Results:" in line and "PASSED" in line and "%" in line:
                    try:
                        parts = line.split('(')
                        if len(parts) > 1:
                            rate_text = parts[1].split('%')[0]
                            success_rate = float(rate_text)
                            break
                    except:
                        pass

            print(f"✅ Backend QA: {success_rate:.1f}% success rate")
            return success_rate >= 75.0, success_rate
        else:
            print(f"❌ Backend QA failed: {process.stderr}")
            return False, 0.0

    except subprocess.TimeoutExpired:
        print("❌ Backend QA timed out after 5 minutes")
        return False, 0.0
    except Exception as e:
        print(f"❌ Backend QA error: {e}")
        return False, 0.0

async def run_frontend_qa():
    """Run the frontend QA agent"""
    print_banner("Frontend UI & Interaction Testing")

    try:
        # Run the frontend QA agent
        process = subprocess.run([
            "python3", "frontend_qa_agent.py"
        ], capture_output=True, text=True, timeout=180)

        if process.returncode == 0:
            # Read the JSON report file for accurate results
            import glob

            # Find the most recent frontend QA report
            report_files = glob.glob('frontend_qa_report_*.json')
            if report_files:
                latest_report = max(report_files, key=os.path.getctime)
                try:
                    with open(latest_report, 'r') as f:
                        report_data = json.load(f)
                        success_rate = report_data.get('summary', {}).get('success_rate', 0.0)
                        print(f"✅ Frontend QA: {success_rate:.1f}% success rate")
                        return success_rate >= 75.0, success_rate
                except:
                    pass

            # Fallback to log parsing if JSON reading fails
            success_rate = 0.0
            output_lines = process.stdout.split('\n')
            for line in output_lines:
                if "📊 Results:" in line and "PASSED" in line and "%" in line:
                    try:
                        parts = line.split('(')
                        if len(parts) > 1:
                            rate_text = parts[1].split('%')[0]
                            success_rate = float(rate_text)
                            break
                    except:
                        pass

            print(f"✅ Frontend QA: {success_rate:.1f}% success rate")
            return success_rate >= 75.0, success_rate
        else:
            print(f"❌ Frontend QA failed: {process.stderr}")
            return False, 0.0

    except subprocess.TimeoutExpired:
        print("❌ Frontend QA timed out after 3 minutes")
        return False, 0.0
    except Exception as e:
        print(f"❌ Frontend QA error: {e}")
        return False, 0.0

async def run_comprehensive_qa():
    """Run the comprehensive QA suite"""
    start_time = time.time()

    print_banner("Comprehensive QA Suite - Backend + Frontend Testing")
    print(f"🕐 Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("🔧 Running both backend API testing and frontend UI testing...")

    # Run both QA suites concurrently
    backend_task = asyncio.create_task(run_backend_qa())
    frontend_task = asyncio.create_task(run_frontend_qa())

    # Wait for both to complete
    backend_result = await backend_task
    frontend_result = await frontend_task

    backend_success, backend_rate = backend_result
    frontend_success, frontend_rate = frontend_result

    # Calculate overall results
    execution_time = time.time() - start_time
    overall_success = backend_success and frontend_success

    # Print final summary
    print_summary(backend_success, frontend_success, backend_rate, frontend_rate)
    print(f"⏱️ Total Execution Time: {execution_time:.1f}s")

    # Save comprehensive report
    report = {
        "timestamp": datetime.now().isoformat(),
        "execution_time_seconds": execution_time,
        "backend": {
            "success": backend_success,
            "success_rate": backend_rate
        },
        "frontend": {
            "success": frontend_success,
            "success_rate": frontend_rate
        },
        "overall": {
            "success": overall_success,
            "combined_rate": (backend_rate + frontend_rate) / 2
        }
    }

    report_filename = f"comprehensive_qa_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(report_filename, 'w') as f:
        json.dump(report, f, indent=2)

    print(f"📄 Comprehensive report saved to: {report_filename}")

    # Return appropriate exit code
    return 0 if overall_success else 1

def main():
    """Main entry point"""
    try:
        exit_code = asyncio.run(run_comprehensive_qa())
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print("\n⚠️ QA testing interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Fatal error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
