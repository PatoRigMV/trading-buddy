#!/bin/bash
# Dough Report Scheduler Startup Script

echo "🥖 Starting Dough Report Scheduler..."

# Check if scheduler is already running
if pgrep -f "run_dough_report_scheduler.py" > /dev/null; then
    echo "⚠️  Dough Report scheduler is already running"
    exit 1
fi

# Start the scheduler in the background
nohup python3 run_dough_report_scheduler.py > dough_report_scheduler.log 2>&1 &
SCHEDULER_PID=$!

echo "✅ Dough Report scheduler started with PID: $SCHEDULER_PID"
echo "📄 Logs available in: dough_report_scheduler.log"
echo "📅 Configured to run daily at 8:00 AM EST"

# Save PID for easy stopping
echo $SCHEDULER_PID > dough_report_scheduler.pid

echo "🛑 To stop: kill \$(cat dough_report_scheduler.pid)"
