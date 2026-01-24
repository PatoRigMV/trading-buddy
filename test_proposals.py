#!/usr/bin/env python3
"""
Test script to verify trade proposal generation is working
"""

import asyncio
import requests
import json
import time

BASE_URL = "http://localhost:5001"

async def test_trade_proposals():
    """Test the trade proposal generation end-to-end"""
    print("Testing trade proposal generation...")

    # Step 1: Initialize the system
    print("1. Initializing system...")
    init_response = requests.post(f"{BASE_URL}/api/initialize")
    if init_response.status_code == 200:
        print("✓ System initialized successfully")
    else:
        print(f"✗ Initialization failed: {init_response.text}")
        return

    # Step 2: Check system status
    print("2. Checking system status...")
    status_response = requests.get(f"{BASE_URL}/api/status")
    if status_response.status_code == 200:
        status_data = status_response.json()
        print(f"✓ System status: {status_data['status']}")
    else:
        print(f"✗ Status check failed: {status_response.text}")
        return

    # Step 3: Run manual analysis
    print("3. Running manual market analysis...")
    analysis_response = requests.post(f"{BASE_URL}/api/manual_analysis")
    if analysis_response.status_code == 200:
        analysis_data = analysis_response.json()
        print(f"✓ Analysis completed")
        print(f"  - Status: {analysis_data.get('status', 'unknown')}")
        print(f"  - Analysis results: {analysis_data.get('analysis_results', 0)}")
        print(f"  - Proposals generated: {analysis_data.get('proposals_generated', 0)}")
        print(f"  - Processed proposals: {len(analysis_data.get('processed_proposals', []))}")

        # Print details of processed proposals
        if analysis_data.get('processed_proposals'):
            print("\n  Processed proposals details:")
            for i, proposal in enumerate(analysis_data['processed_proposals']):
                prop = proposal['proposal']
                risk = proposal['risk_assessment']
                approval = proposal['approval_result']
                print(f"    {i+1}. {prop['action']} {prop['quantity']} {prop['symbol']} "
                      f"(conviction: {prop['conviction']:.2f}, "
                      f"risk_approved: {risk['approved']}, "
                      f"governance_approved: {approval['approved']})")
    else:
        print(f"✗ Analysis failed: {analysis_response.text}")
        return

    # Step 4: Check for pending proposals
    print("4. Checking for pending proposals...")
    proposals_response = requests.get(f"{BASE_URL}/api/proposals")
    if proposals_response.status_code == 200:
        proposals_data = proposals_response.json()
        proposals = proposals_data.get('proposals', [])
        print(f"✓ Found {len(proposals)} pending proposals")

        if proposals:
            print("\n  Pending proposals:")
            for proposal in proposals:
                print(f"    - {proposal['action']} {proposal['quantity']} {proposal['symbol']} "
                      f"@ ${proposal['price']:.2f} (conviction: {proposal['conviction']*100:.1f}%)")
                print(f"      Risk score: {proposal['risk_score']:.2f}")
                print(f"      Rationale: {proposal['rationale'][:100]}...")
        else:
            print("  No pending proposals found")
    else:
        print(f"✗ Proposals check failed: {proposals_response.text}")

    print("\nTest completed!")

if __name__ == "__main__":
    asyncio.run(test_trade_proposals())
