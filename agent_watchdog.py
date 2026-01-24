#!/usr/bin/env python3
"""
Agent Watchdog Service
Monitors trading agents and automatically restarts them on failure
"""

import subprocess
import time
import logging
import signal
import sys
import psutil
import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import requests
import threading
from pathlib import Path
from pytz import timezone

# Create logs directory if it doesn't exist
log_dir = Path("/Users/ryanhaigh/trading_assistant/logs")
log_dir.mkdir(exist_ok=True)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_dir / 'agent_watchdog.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger('agent_watchdog')

class AgentProcess:
    def __init__(self, agent_id: str, process: subprocess.Popen):
        self.agent_id = agent_id
        self.process = process
        self.start_time = datetime.now()
        self.last_heartbeat = datetime.now()
        self.restart_count = 0
        self.consecutive_failures = 0
        self.last_output = ""
        self.error_patterns = []

    def is_alive(self) -> bool:
        """Check if the agent process is still running"""
        return self.process.poll() is None

    def update_heartbeat(self):
        """Update the last heartbeat timestamp"""
        self.last_heartbeat = datetime.now()

    def time_since_heartbeat(self) -> timedelta:
        """Get time since last heartbeat"""
        return datetime.now() - self.last_heartbeat

    def uptime(self) -> timedelta:
        """Get agent uptime"""
        return datetime.now() - self.start_time

    def capture_output(self):
        """Capture recent process output for error analysis"""
        try:
            if self.process.poll() is None:  # Process is still running
                return

            # Read stderr for error information
            stderr_data = self.process.stderr.read() if self.process.stderr else b''
            stdout_data = self.process.stdout.read() if self.process.stdout else b''

            if stderr_data:
                stderr_text = stderr_data.decode('utf-8', errors='ignore')
                self.last_output = stderr_text[-1000:]  # Keep last 1000 chars

                # Check for common error patterns
                error_indicators = [
                    'Error:', 'Exception:', 'ECONNRESET', 'ENOTFOUND',
                    'Rate limit', '429', '401', 'timeout', 'SIGTERM', 'SIGKILL'
                ]

                for indicator in error_indicators:
                    if indicator.lower() in stderr_text.lower():
                        self.error_patterns.append(f"{datetime.now().isoformat()}: {indicator}")

        except Exception as e:
            logger.debug(f"Could not capture output for {self.agent_id}: {e}")

    def is_market_hours(self) -> bool:
        """Check if market is currently open (US Eastern Time)"""
        try:
            et = timezone('US/Eastern')
            now = datetime.now(et)

            # Market hours: 9:30 AM - 4:00 PM ET, Monday-Friday
            if now.weekday() > 4:  # Weekend
                return False

            market_open = now.replace(hour=9, minute=30, second=0, microsecond=0)
            market_close = now.replace(hour=16, minute=0, second=0, microsecond=0)

            return market_open <= now <= market_close
        except Exception:
            return True  # Default to market hours for safety

class AgentWatchdog:
    def __init__(self, config_path: str = "/Users/ryanhaigh/trading_assistant/trading-agent/config/strategy.yaml"):
        self.config_path = config_path
        self.agents: Dict[str, AgentProcess] = {}
        self.min_agents = 2  # Minimum number of agents to keep running
        self.max_agents = 4  # Maximum number of agents to run
        self.heartbeat_timeout = 90  # 90 seconds without heartbeat = failure
        self.restart_delay = 15  # Wait 15 seconds between restarts
        self.max_consecutive_failures = 3  # Max failures before extended backoff
        self.running = True

        # Health check endpoints
        self.web_app_url = "http://127.0.0.1:8000"

        # Market-aware configuration
        self.market_hours_check_interval = 30  # 30 seconds during market hours
        self.off_hours_check_interval = 120    # 2 minutes during off-hours

        # Create logs directory
        Path("/Users/ryanhaigh/trading_assistant/logs").mkdir(exist_ok=True)

        # Setup signal handlers
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)

    def _signal_handler(self, signum, frame):
        """Handle shutdown signals"""
        logger.info(f"Received signal {signum}, shutting down watchdog...")
        self.running = False
        self.shutdown()
        sys.exit(0)

    def start_agent(self, agent_id: str) -> Optional[AgentProcess]:
        """Start a new trading agent"""
        try:
            logger.info(f"Starting agent {agent_id}...")

            # Change to trading agent directory and start agent
            # Set up environment with Alpaca credentials from environment
            import os
            env = {
                "PATH": "/usr/local/bin:/usr/bin:/bin",
                "APCA_API_KEY_ID": os.environ.get('APCA_API_KEY_ID', ''),
                "APCA_API_SECRET_KEY": os.environ.get('APCA_API_SECRET_KEY', ''),
                "POLYGON_API_KEY": os.environ.get('POLYGON_API_KEY', '')
            }

            process = subprocess.Popen(
                ["npm", "run", "agent"],
                cwd="/Users/ryanhaigh/trading_assistant/trading-agent",
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=env
            )

            agent = AgentProcess(agent_id, process)
            self.agents[agent_id] = agent

            logger.info(f"Agent {agent_id} started with PID {process.pid}")
            return agent

        except Exception as e:
            logger.error(f"Failed to start agent {agent_id}: {e}")
            return None

    def stop_agent(self, agent_id: str) -> bool:
        """Stop a specific agent"""
        if agent_id not in self.agents:
            return False

        agent = self.agents[agent_id]
        try:
            # Graceful shutdown first
            agent.process.terminate()

            # Wait up to 10 seconds for graceful shutdown
            try:
                agent.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                # Force kill if graceful shutdown fails
                agent.process.kill()
                agent.process.wait()

            logger.info(f"Agent {agent_id} stopped")
            del self.agents[agent_id]
            return True

        except Exception as e:
            logger.error(f"Error stopping agent {agent_id}: {e}")
            return False

    def restart_agent(self, agent_id: str) -> bool:
        """Restart a specific agent"""
        logger.info(f"Restarting agent {agent_id}...")

        # Stop the existing agent
        if agent_id in self.agents:
            old_agent = self.agents[agent_id]
            old_agent.restart_count += 1
            old_agent.consecutive_failures += 1
            self.stop_agent(agent_id)

            # Apply backoff for consecutive failures
            if old_agent.consecutive_failures >= self.max_consecutive_failures:
                backoff_delay = self.restart_delay * (2 ** (old_agent.consecutive_failures - self.max_consecutive_failures))
                logger.warning(f"Agent {agent_id} has {old_agent.consecutive_failures} consecutive failures, applying backoff delay of {backoff_delay}s")
                time.sleep(min(backoff_delay, 300))  # Max 5 minute backoff
            else:
                time.sleep(self.restart_delay)

        # Start new agent
        new_agent = self.start_agent(agent_id)
        if new_agent and agent_id in self.agents:
            # Preserve restart count
            if agent_id in self.agents:
                if hasattr(self, '_temp_restart_count'):
                    new_agent.restart_count = getattr(self, '_temp_restart_count', 0)
                    delattr(self, '_temp_restart_count')

        return new_agent is not None

    def check_agent_health(self) -> List[str]:
        """Check health of all agents and return list of failed agents"""
        failed_agents = []

        for agent_id, agent in self.agents.items():
            # Check if process is still alive
            if not agent.is_alive():
                # Capture output before marking as failed
                agent.capture_output()

                exit_code = agent.process.returncode
                error_info = f"exit_code={exit_code}"

                if agent.error_patterns:
                    error_info += f", errors={agent.error_patterns[-3:]}"  # Last 3 errors

                if agent.last_output:
                    error_info += f", last_output='{agent.last_output[-200:]}'"  # Last 200 chars

                logger.warning(f"Agent {agent_id} process died (PID {agent.process.pid}) - {error_info}")
                failed_agents.append(agent_id)
                continue

            # Check heartbeat timeout
            if agent.time_since_heartbeat().total_seconds() > self.heartbeat_timeout:
                logger.warning(f"Agent {agent_id} heartbeat timeout ({agent.time_since_heartbeat()}) - no response for {self.heartbeat_timeout}s")
                failed_agents.append(agent_id)
                continue

            # Check for memory leaks or high CPU usage
            try:
                process = psutil.Process(agent.process.pid)
                memory_mb = process.memory_info().rss / 1024 / 1024
                cpu_percent = process.cpu_percent()

                # Track memory growth over time
                if not hasattr(agent, 'memory_history'):
                    agent.memory_history = []

                agent.memory_history.append((datetime.now(), memory_mb))

                # Keep only last 10 readings (5 minutes worth if checking every 30s)
                agent.memory_history = agent.memory_history[-10:]

                # Check for memory leak (consistent growth over time)
                if len(agent.memory_history) >= 5:
                    recent_memory = [m for _, m in agent.memory_history[-5:]]
                    if all(recent_memory[i] < recent_memory[i+1] for i in range(len(recent_memory)-1)):
                        memory_growth = recent_memory[-1] - recent_memory[0]
                        if memory_growth > 100:  # > 100MB growth in 5 readings
                            logger.warning(f"Agent {agent_id} potential memory leak: +{memory_growth:.1f}MB growth, current: {memory_mb:.1f}MB")

                # High absolute memory usage
                if memory_mb > 1000:  # > 1GB memory usage
                    logger.warning(f"Agent {agent_id} high memory usage: {memory_mb:.1f}MB")

                # High CPU usage
                if cpu_percent > 80:  # > 80% CPU for extended period
                    logger.warning(f"Agent {agent_id} high CPU usage: {cpu_percent:.1f}%")

            except (psutil.NoSuchProcess, psutil.AccessDenied):
                logger.warning(f"Cannot access process info for agent {agent_id}")
                failed_agents.append(agent_id)

        return failed_agents

    def update_agent_heartbeats(self):
        """Update agent heartbeats by checking their output logs"""
        try:
            # Check web app agent health endpoint
            response = requests.get(f"{self.web_app_url}/api/agents/health", timeout=5)
            if response.status_code == 200:
                data = response.json()
                if data.get('summary', {}).get('total_agent_processes', 0) > 0:
                    # If web app shows agents are running, update heartbeats
                    for agent_id in self.agents:
                        self.agents[agent_id].update_heartbeat()
        except Exception as e:
            logger.debug(f"Could not update heartbeats via web app: {e}")

    def ensure_minimum_agents(self):
        """Ensure minimum number of agents are running"""
        active_agents = len([a for a in self.agents.values() if a.is_alive()])

        if active_agents < self.min_agents:
            agents_to_start = self.min_agents - active_agents
            logger.info(f"Only {active_agents} agents running, starting {agents_to_start} more...")

            for i in range(agents_to_start):
                agent_id = f"agent_{int(time.time())}_{i}"
                self.start_agent(agent_id)
                time.sleep(5)  # Stagger starts to avoid resource conflicts

    def detect_mass_failure(self) -> bool:
        """Detect if multiple agents failed simultaneously"""
        failed_in_last_minute = 0
        cutoff_time = datetime.now() - timedelta(minutes=1)

        for agent in self.agents.values():
            if not agent.is_alive() and agent.start_time > cutoff_time:
                failed_in_last_minute += 1

        return failed_in_last_minute >= 2

    def health_check_web_app(self) -> bool:
        """Check if web app is responding"""
        try:
            response = requests.get(f"{self.web_app_url}/api/autonomous_status", timeout=10)
            return response.status_code == 200
        except Exception:
            return False

    def generate_status_report(self) -> Dict:
        """Generate detailed status report"""
        active_agents = [a for a in self.agents.values() if a.is_alive()]
        failed_agents = [a for a in self.agents.values() if not a.is_alive()]

        return {
            "timestamp": datetime.now().isoformat(),
            "total_agents": len(self.agents),
            "active_agents": len(active_agents),
            "failed_agents": len(failed_agents),
            "web_app_healthy": self.health_check_web_app(),
            "agents": {
                agent_id: {
                    "status": "active" if agent.is_alive() else "failed",
                    "pid": agent.process.pid,
                    "uptime": str(agent.uptime()),
                    "restart_count": agent.restart_count,
                    "consecutive_failures": agent.consecutive_failures,
                    "last_heartbeat": agent.last_heartbeat.isoformat(),
                    "error_patterns": agent.error_patterns[-3:] if agent.error_patterns else [],
                    "last_output_preview": agent.last_output[-100:] if agent.last_output else ""
                }
                for agent_id, agent in self.agents.items()
            }
        }

    def run(self):
        """Main watchdog loop"""
        logger.info("🐕 Agent Watchdog starting...")

        # Start initial agents
        self.ensure_minimum_agents()

        last_health_check = datetime.now()
        last_status_report = datetime.now()

        while self.running:
            try:
                # Update heartbeats
                self.update_agent_heartbeats()

                # Check agent health
                failed_agents = self.check_agent_health()

                # Handle failed agents
                if failed_agents:
                    logger.warning(f"Detected {len(failed_agents)} failed agents: {failed_agents}")

                    # Check for mass failure
                    if self.detect_mass_failure():
                        logger.critical("Mass agent failure detected! Implementing recovery strategy...")
                        # Wait a bit longer before restart to avoid cascading failures
                        time.sleep(60)

                    # Restart failed agents
                    for agent_id in failed_agents:
                        self.restart_agent(agent_id)

                # Ensure minimum agents
                self.ensure_minimum_agents()

                # Periodic status report
                if datetime.now() - last_status_report > timedelta(minutes=5):
                    status = self.generate_status_report()
                    logger.info(f"Status: {status['active_agents']}/{status['total_agents']} agents active, Web app: {'✅' if status['web_app_healthy'] else '❌'}")
                    last_status_report = datetime.now()

                # Market-aware sleep interval
                is_market_open = self.is_market_hours()
                sleep_interval = self.market_hours_check_interval if is_market_open else self.off_hours_check_interval

                if is_market_open:
                    print(f"📈 [WATCHDOG] Market open - active monitoring ({sleep_interval}s intervals)")
                else:
                    print(f"🌙 [WATCHDOG] Market closed - reduced monitoring ({sleep_interval}s intervals)")

                time.sleep(sleep_interval)

            except KeyboardInterrupt:
                logger.info("Received interrupt signal, shutting down...")
                break
            except Exception as e:
                logger.error(f"Unexpected error in watchdog loop: {e}")
                time.sleep(10)  # Brief pause before continuing

    def shutdown(self):
        """Shutdown all agents and watchdog"""
        logger.info("Shutting down all agents...")

        for agent_id in list(self.agents.keys()):
            self.stop_agent(agent_id)

        logger.info("Agent watchdog shutdown complete")

def main():
    """Main entry point"""
    watchdog = AgentWatchdog()

    try:
        watchdog.run()
    except KeyboardInterrupt:
        logger.info("Received interrupt, shutting down...")
    finally:
        watchdog.shutdown()

if __name__ == "__main__":
    main()
