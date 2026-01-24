"""
Improved Integration layer for autonomous trading agent with better error handling
"""

import subprocess
import threading
import time
import requests
import json
import os
import signal
from pathlib import Path
from typing import Optional, Dict, Any
import logging

class AutonomousAgentIntegration:
    def __init__(self, config_path: str = "trading-agent/config/strategy.yaml"):
        self.config_path = config_path
        self.agent_process: Optional[subprocess.Popen] = None
        self.api_process: Optional[subprocess.Popen] = None
        self.is_running = False
        self.should_run = False  # Flag to control if we want it running
        self.logger = logging.getLogger(__name__)

        # URLs for the autonomous agent API
        self.agent_api_url = "http://localhost:3001"

        # Setup logging
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
        self.logger.addHandler(handler)
        self.logger.setLevel(logging.INFO)

    def start_autonomous_trading(self) -> Dict[str, Any]:
        """Start the autonomous trading agent - called when 'Start Trading' button is clicked"""
        try:
            if self.is_running:
                return {"status": "error", "message": "Agent is already running"}

            # Check if dependencies exist
            if not self._check_dependencies():
                return {"status": "error", "message": "Missing dependencies. Please run setup.sh in trading-agent directory"}

            self.should_run = True
            self.logger.info("Starting autonomous trading system...")

            # Start the API server first
            if not self._start_api_server():
                return {"status": "error", "message": "Failed to start API server"}

            # Start the autonomous agent
            if not self._start_agent():
                self._cleanup_processes()
                return {"status": "error", "message": "Failed to start autonomous agent"}

            self.is_running = True

            # Start monitoring thread
            threading.Thread(target=self._monitor_agent, daemon=True).start()

            self.logger.info(f"Autonomous trading started successfully - Agent PID: {self.agent_process.pid if self.agent_process else 'N/A'}")

            return {
                "status": "success",
                "message": "Autonomous trading agent started successfully",
                "agent_pid": self.agent_process.pid if self.agent_process else None,
                "api_pid": self.api_process.pid if self.api_process else None
            }

        except Exception as e:
            self.logger.error(f"Failed to start autonomous agent: {e}")
            self._cleanup_processes()
            return {"status": "error", "message": str(e)}

    def _check_dependencies(self) -> bool:
        """Check if required dependencies are available"""
        try:
            # Check if trading-agent directory exists
            agent_dir = Path("/Users/ryanhaigh/trading_assistant/trading-agent")
            if not agent_dir.exists():
                self.logger.error("trading-agent directory not found")
                return False

            # Check if node_modules exists (dependencies installed)
            node_modules = agent_dir / "node_modules"
            if not node_modules.exists():
                self.logger.error("Node modules not installed. Run 'pnpm install' in trading-agent directory")
                return False

            # Check if config file exists
            config_file = agent_dir / self.config_path.replace("trading-agent/", "")
            if not config_file.exists():
                self.logger.error(f"Config file not found: {config_file}")
                return False

            return True

        except Exception as e:
            self.logger.error(f"Dependency check failed: {e}")
            return False

    def _start_api_server(self) -> bool:
        """Start the API server"""
        try:
            self.logger.info("Starting API server...")

            # Use npx to run TypeScript directly
            api_cmd = [
                "npx", "ts-node", "src/api/server.ts"
            ]

            self.api_process = subprocess.Popen(
                api_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd="/Users/ryanhaigh/trading_assistant/trading-agent",
                env={**os.environ, "NODE_ENV": "development"}
            )

            # Wait for API server to start and verify it's responding
            for i in range(10):  # Try for 10 seconds
                time.sleep(1)
                if self.api_process.poll() is not None:
                    stdout, stderr = self.api_process.communicate()
                    self.logger.error(f"API server failed to start: {stderr.decode()}")
                    return False

                try:
                    response = requests.get(f"{self.agent_api_url}/health", timeout=2)
                    if response.status_code == 200:
                        self.logger.info("API server started successfully")
                        return True
                except requests.RequestException:
                    continue

            self.logger.error("API server failed to respond after 10 seconds")
            return False

        except Exception as e:
            self.logger.error(f"Failed to start API server: {e}")
            return False

    def _start_agent(self) -> bool:
        """Start the autonomous agent"""
        try:
            self.logger.info("Starting autonomous agent...")

            # Use npx to run TypeScript directly
            agent_cmd = [
                "npx", "ts-node", "src/cli/runAgent.ts",
                "--config", self.config_path.replace("trading-agent/", "")
            ]

            self.agent_process = subprocess.Popen(
                agent_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd="/Users/ryanhaigh/trading_assistant/trading-agent",
                env={**os.environ,
                     "NODE_ENV": "development",
                     "TRADING_MODE": "paper"}  # Ensure paper trading
            )

            # Give the agent a moment to start
            time.sleep(3)

            if self.agent_process.poll() is not None:
                stdout, stderr = self.agent_process.communicate()
                self.logger.error(f"Agent failed to start: {stderr.decode()}")
                return False

            self.logger.info("Autonomous agent started successfully")
            return True

        except Exception as e:
            self.logger.error(f"Failed to start agent: {e}")
            return False

    def stop_autonomous_trading(self) -> Dict[str, Any]:
        """Stop the autonomous trading agent - called when 'Stop Trading' button is clicked"""
        try:
            self.should_run = False

            if not self.is_running:
                return {"status": "error", "message": "Agent is not running"}

            self.logger.info("Stopping autonomous trading...")
            self._cleanup_processes()

            self.is_running = False

            return {
                "status": "success",
                "message": "Autonomous trading agent stopped successfully"
            }

        except Exception as e:
            self.logger.error(f"Failed to stop autonomous agent: {e}")
            return {"status": "error", "message": str(e)}

    def _cleanup_processes(self):
        """Clean up all processes"""
        try:
            # Stop the agent process
            if self.agent_process and self.agent_process.poll() is None:
                self.logger.info("Terminating agent process...")
                self.agent_process.terminate()
                try:
                    self.agent_process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    self.logger.warning("Force killing agent process...")
                    self.agent_process.kill()
                self.agent_process = None

            # Stop the API server
            if self.api_process and self.api_process.poll() is None:
                self.logger.info("Terminating API server...")
                self.api_process.terminate()
                try:
                    self.api_process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self.logger.warning("Force killing API server...")
                    self.api_process.kill()
                self.api_process = None

        except Exception as e:
            self.logger.error(f"Error during cleanup: {e}")

    def emergency_stop(self) -> Dict[str, Any]:
        """Emergency stop - close all positions and stop agent"""
        try:
            if not self.is_running:
                return {"status": "error", "message": "Agent is not running"}

            self.logger.warning("EMERGENCY STOP initiated")

            # Try to call emergency stop API first
            try:
                response = requests.post(f"{self.agent_api_url}/emergency-stop", timeout=30)
                if response.status_code == 200:
                    self.logger.info("Emergency stop API call successful")
                else:
                    self.logger.warning(f"Emergency stop API returned: {response.status_code}")
            except Exception as e:
                self.logger.error(f"Emergency stop API failed: {e}")

            # Force stop everything
            self.should_run = False
            self._cleanup_processes()
            self.is_running = False

            return {
                "status": "success",
                "message": "Emergency stop executed - all positions closed and agent stopped"
            }

        except Exception as e:
            self.logger.error(f"Emergency stop failed: {e}")
            return {"status": "error", "message": str(e)}

    def get_agent_status(self) -> Dict[str, Any]:
        """Get current status of the autonomous agent"""
        try:
            # First check if we think it should be running
            if not self.should_run:
                return {
                    "status": "stopped",
                    "positions": [],
                    "account": {},
                    "recent_decisions": []
                }

            if not self.is_running:
                return {
                    "status": "offline",
                    "positions": [],
                    "account": {},
                    "recent_decisions": []
                }

            # Check if processes are actually running
            if self.agent_process and self.agent_process.poll() is not None:
                self.logger.warning("Agent process has died, marking as offline")
                self.is_running = False
                return {
                    "status": "error",
                    "positions": [],
                    "account": {},
                    "recent_decisions": []
                }

            # Try to get status from API
            try:
                # Get data from agent API with timeout
                health = requests.get(f"{self.agent_api_url}/health", timeout=5)

                if health.status_code != 200:
                    return {"status": "error", "positions": [], "account": {}, "recent_decisions": []}

                # Try to get additional data
                positions_response = requests.get(f"{self.agent_api_url}/positions", timeout=5)
                account_response = requests.get(f"{self.agent_api_url}/account", timeout=5)
                decisions_response = requests.get(f"{self.agent_api_url}/decisions?limit=10", timeout=5)

                return {
                    "status": "running",
                    "health": health.json(),
                    "positions": positions_response.json().get("positions", []) if positions_response.status_code == 200 else [],
                    "account": account_response.json().get("account", {}) if account_response.status_code == 200 else {},
                    "recent_decisions": decisions_response.json().get("decisions", []) if decisions_response.status_code == 200 else []
                }

            except requests.RequestException as e:
                self.logger.warning(f"Agent API not responding: {e}")
                return {
                    "status": "error",
                    "message": "Agent API not responding",
                    "positions": [],
                    "account": {},
                    "recent_decisions": []
                }

        except Exception as e:
            self.logger.error(f"Failed to get agent status: {e}")
            return {
                "status": "error",
                "message": str(e),
                "positions": [],
                "account": {},
                "recent_decisions": []
            }

    def _monitor_agent(self):
        """Monitor the agent process and handle crashes"""
        self.logger.info("Starting agent monitoring thread")

        while self.should_run:
            try:
                # Check if we still want the agent running
                if not self.should_run:
                    break

                # Check API server
                if self.api_process and self.api_process.poll() is not None:
                    self.logger.error("API server has terminated unexpectedly")
                    if self.should_run:
                        self.logger.info("Attempting to restart API server...")
                        if self._start_api_server():
                            self.logger.info("API server restarted successfully")
                        else:
                            self.logger.error("Failed to restart API server")
                            break

                # Check agent process
                if self.agent_process and self.agent_process.poll() is not None:
                    self.logger.error("Agent process has terminated unexpectedly")
                    if self.should_run:
                        self.logger.info("Attempting to restart agent...")
                        if self._start_agent():
                            self.logger.info("Agent restarted successfully")
                        else:
                            self.logger.error("Failed to restart agent")
                            break

                # Check API health
                try:
                    response = requests.get(f"{self.agent_api_url}/health", timeout=3)
                    if response.status_code != 200:
                        self.logger.warning("Agent API health check failed")
                except requests.RequestException:
                    self.logger.warning("Agent API not responding to health check")

                time.sleep(10)  # Check every 10 seconds

            except Exception as e:
                self.logger.error(f"Error in monitoring thread: {e}")
                time.sleep(5)

        self.logger.info("Agent monitoring thread stopped")
        self.is_running = False


# Global instance for the web interface to use
autonomous_agent = AutonomousAgentIntegration()


def get_autonomous_status():
    """Function that can be called from web interface"""
    return autonomous_agent.get_agent_status()


def start_autonomous_trading():
    """Function that can be called when 'Start Trading' button is clicked"""
    return autonomous_agent.start_autonomous_trading()


def stop_autonomous_trading():
    """Function that can be called when 'Stop Trading' button is clicked"""
    return autonomous_agent.stop_autonomous_trading()


def emergency_stop_autonomous():
    """Function that can be called for emergency stop"""
    return autonomous_agent.emergency_stop()
