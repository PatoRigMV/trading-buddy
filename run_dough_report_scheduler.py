#!/usr/bin/env python3
"""
Dough Report Scheduler Service
Runs the Dough Report agent with 8am EST daily scheduling
"""

import sys
import signal
import logging
from dough_report_agent import DoughReportAgent, run_scheduler

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('dough_report_scheduler.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger('Dough_Report_Scheduler')

def signal_handler(signum, frame):
    """Handle shutdown signals gracefully"""
    logger.info("🛑 Shutdown signal received, stopping Dough Report scheduler...")
    sys.exit(0)

def main():
    """Main entry point for the scheduler service"""
    logger.info("🥖 Starting Dough Report Scheduler Service...")
    logger.info("📅 Configured to run daily at 8:00 AM EST")

    # Register signal handlers for graceful shutdown
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    try:
        # Run the scheduler
        run_scheduler()
    except KeyboardInterrupt:
        logger.info("🛑 Scheduler stopped by user")
    except Exception as e:
        logger.error(f"❌ Scheduler error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
