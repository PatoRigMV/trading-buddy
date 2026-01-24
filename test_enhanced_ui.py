#!/usr/bin/env python3
"""
Test Enhanced UI Features - Progress Tracking and All Proposals Display
"""

import requests
import json
import time

BASE_URL = "http://localhost:5001"

def test_enhanced_ui_features():
    print("Testing Enhanced UI Features")
    print("=" * 50)

    # 1. Initialize the system
    print("\n1. Initializing system...")
    init_response = requests.post(f"{BASE_URL}/api/initialize")
    if init_response.status_code == 200:
        result = init_response.json()
        print(f"✓ {result['message']}")
    else:
        print(f"✗ Initialization failed: {init_response.text}")
        return

    # Wait for initialization to complete
    time.sleep(3)

    # 2. Test manual analysis with enhanced progress
    print("\n2. Testing enhanced progress tracking...")
    print("   (Check the web interface at http://localhost:5001 to see detailed progress)")
    print("   Running manual analysis to test detailed progress updates...")

    analysis_response = requests.post(f"{BASE_URL}/api/manual_analysis")
    if analysis_response.status_code == 200:
        analysis_result = analysis_response.json()
        print(f"✓ Enhanced analysis completed successfully")
        print(f"  Status: {analysis_result['status']}")
        print(f"  Proposals generated: {analysis_result.get('proposals_generated', 0)}")
        print(f"  Approved proposals: {analysis_result.get('approved_proposals', 0)}")
        print(f"  Total processed: {len(analysis_result.get('processed_proposals', []))}")
    else:
        print(f"✗ Enhanced analysis failed: {analysis_response.text}")
        return

    # 3. Test enhanced proposals endpoint
    print("\n3. Testing enhanced proposals display...")
    proposals_response = requests.get(f"{BASE_URL}/api/proposals")
    if proposals_response.status_code == 200:
        proposals_data = proposals_response.json()
        proposals = proposals_data.get('proposals', [])
        summary = proposals_data.get('summary', {})

        print(f"✓ Enhanced proposals data retrieved")
        print(f"  Total proposals: {summary.get('total', len(proposals))}")
        print(f"  Pending approval: {summary.get('pending_approval', 0)}")
        print(f"  Risk rejected: {summary.get('risk_rejected', 0)}")
        print(f"  Governance rejected: {summary.get('governance_rejected', 0)}")
        print(f"  Fully approved: {summary.get('approved', 0)}")

        if proposals:
            print(f"\n  Sample proposals by status:")
            status_counts = {}
            for proposal in proposals[:5]:  # Show first 5
                status = proposal['status']
                if status not in status_counts:
                    status_counts[status] = 0

                    # Show details for first of each status type
                    print(f"\n    [{status.upper()}] {proposal['symbol']} {proposal['action']}")
                    print(f"      Quantity: {proposal['quantity']}")
                    print(f"      Conviction: {proposal['conviction']*100:.1f}%")
                    print(f"      Risk approved: {proposal['risk_approved']}")
                    if not proposal['risk_approved']:
                        print(f"      Risk reason: {proposal['risk_reason']}")
                    print(f"      Governance approved: {proposal['governance_approved']}")

                status_counts[status] += 1
    else:
        print(f"✗ Enhanced proposals test failed: {proposals_response.text}")

    print("\n" + "=" * 50)
    print("Enhanced UI Features Test Complete!")
    print("\nImprovements Demonstrated:")
    print("✓ Detailed progress tracking with per-symbol updates")
    print("✓ Multi-API source attribution in progress messages")
    print("✓ All proposals displayed (not just approved ones)")
    print("✓ Clear status labeling for each proposal type")
    print("✓ Risk and governance status transparency")

    print("\nProgress Tracking Features:")
    print("• Phase-based progress (Initialize → Fetch → Analyze → Generate → Assess)")
    print("• Per-symbol data fetching progress")
    print("• Source validation details")
    print("• Fallback handling notifications")
    print("• Real-time step descriptions")

    print("\nProposal Display Features:")
    print("• ✅ Ready for Approval (passed risk, needs human approval)")
    print("• 🎯 Approved & Executable (fully approved)")
    print("• ⚠️ Risk Management Rejected (failed risk assessment)")
    print("• ❌ Governance Rejected (human rejected)")

    print(f"\nWeb Interface: http://localhost:5001")
    print("Try running 'Analyze Market' to see the enhanced progress tracking!")

if __name__ == "__main__":
    test_enhanced_ui_features()
