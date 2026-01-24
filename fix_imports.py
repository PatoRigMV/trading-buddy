#!/usr/bin/env python3
"""
Fix import issues in trading assistant modules
"""

import os

def fix_governance_import():
    """Fix missing import in governance.py"""
    filepath = "/Users/ryanhaigh/trading_assistant/governance.py"

    with open(filepath, 'r') as f:
        content = f.read()

    if 'from datetime import timedelta' not in content:
        # Add missing import after existing datetime import
        content = content.replace(
            'from datetime import datetime',
            'from datetime import datetime, timedelta'
        )

        with open(filepath, 'w') as f:
            f.write(content)
        print("✅ Fixed datetime import in governance.py")

def fix_performance_import():
    """Fix missing import in performance_tracker.py"""
    filepath = "/Users/ryanhaigh/trading_assistant/performance_tracker.py"

    with open(filepath, 'r') as f:
        content = f.read()

    if 'from datetime import timedelta' not in content:
        # Add missing import after existing datetime import
        content = content.replace(
            'from datetime import datetime',
            'from datetime import datetime, timedelta'
        )

        with open(filepath, 'w') as f:
            f.write(content)
        print("✅ Fixed datetime import in performance_tracker.py")

def fix_paper_trading_import():
    """Fix missing import in paper_trading.py"""
    filepath = "/Users/ryanhaigh/trading_assistant/paper_trading.py"

    with open(filepath, 'r') as f:
        content = f.read()

    if 'from datetime import timedelta' not in content:
        # Add missing import after existing datetime import
        content = content.replace(
            'from datetime import datetime',
            'from datetime import datetime, timedelta'
        )

        with open(filepath, 'w') as f:
            f.write(content)
        print("✅ Fixed datetime import in paper_trading.py")

def fix_compliance_import():
    """Add missing numpy import to compliance.py"""
    filepath = "/Users/ryanhaigh/trading_assistant/compliance.py"

    with open(filepath, 'r') as f:
        content = f.read()

    if 'import numpy as np' not in content:
        # Add numpy import after other imports
        content = content.replace(
            'import logging',
            'import logging\nimport numpy as np'
        )

        with open(filepath, 'w') as f:
            f.write(content)
        print("✅ Added numpy import to compliance.py")

def main():
    """Fix all import issues"""
    print("🔧 Fixing import issues in trading assistant modules...")

    fix_governance_import()
    fix_performance_import()
    fix_paper_trading_import()
    fix_compliance_import()

    print("✅ All import issues fixed!")

if __name__ == "__main__":
    main()
