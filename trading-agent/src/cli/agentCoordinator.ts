#!/usr/bin/env node

/**
 * Agent Coordinator
 *
 * Intelligent coordination of trading agents based on market hours:
 *
 * MARKET HOURS (9:30-16:00 ET):
 * - Main trading agent: High frequency, real-time execution
 * - Portfolio agent: Position monitoring
 * - Options agent: Live options trading
 * - Strategy agent: Standby/minimal mode
 *
 * OFF-HOURS (16:00-9:30 ET):
 * - Main trading agent: Low frequency, position monitoring only
 * - Portfolio agent: Analysis and reporting
 * - Options agent: Strategy research
 * - Strategy agent: ACTIVE deep analysis for next day
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { MarketHours } from '../engine/marketHours';

interface AgentProcess {
  name: string;
  scriptPath: string;
  process?: ChildProcess;
  isRunning: boolean;
  mode: 'market_hours' | 'off_hours' | 'always';
  priority: 'high' | 'medium' | 'low';
}

class AgentCoordinator {
  private agents: AgentProcess[] = [];
  private isRunning = false;
  private currentMarketStatus: 'open' | 'closed' = 'closed';

  constructor() {
    this.setupAgents();
  }

  private setupAgents(): void {
    this.agents = [
      {
        name: 'Main Trading Agent',
        scriptPath: 'src/cli/runAgent.ts',
        isRunning: false,
        mode: 'always', // Always running, but behavior changes
        priority: 'high'
      },
      {
        name: 'Portfolio Analysis Agent',
        scriptPath: 'src/cli/portfolioAgent.ts',
        isRunning: false,
        mode: 'always',
        priority: 'medium'
      },
      {
        name: 'Options Trading Agent',
        scriptPath: 'src/cli/simpleOptionsAgent.ts',
        isRunning: false,
        mode: 'always',
        priority: 'medium'
      },
      {
        name: 'Strategy Preparation Agent',
        scriptPath: 'src/cli/strategyPreparationAgent.ts',
        isRunning: false,
        mode: 'off_hours', // Only active during off-hours
        priority: 'low'
      }
    ];
  }

  async start(): Promise<void> {
    console.log('🎯 Agent Coordinator v1.0');
    console.log('============================');
    console.log('📊 Intelligent agent management based on market hours');
    console.log('⚡ Optimized resource allocation');

    this.isRunning = true;

    // Initial agent startup
    await this.evaluateAndAdjustAgents();

    // Monitor and adjust every 5 minutes
    while (this.isRunning) {
      try {
        await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000)); // 5 minutes
        await this.evaluateAndAdjustAgents();
      } catch (error) {
        console.error('❌ Coordinator error:', error);
      }
    }
  }

  private async evaluateAndAdjustAgents(): Promise<void> {
    const marketSession = MarketHours.getCurrentSession();
    const newMarketStatus = marketSession.isOpen ? 'open' : 'closed';

    console.log(`\n📊 Market Status: ${marketSession.status} (${marketSession.isOpen ? 'OPEN' : 'CLOSED'})`);
    console.log(`   Time until next session: ${marketSession.timeUntilNext}`);

    // If market status changed, adjust agent priorities
    if (newMarketStatus !== this.currentMarketStatus) {
      console.log(`🔄 Market status changed: ${this.currentMarketStatus} → ${newMarketStatus}`);
      await this.adjustAgentsForMarketStatus(newMarketStatus);
      this.currentMarketStatus = newMarketStatus;
    }

    // Ensure all required agents are running
    await this.ensureAgentsRunning();

    // Log current agent status
    this.logAgentStatus();
  }

  private async adjustAgentsForMarketStatus(status: 'open' | 'closed'): Promise<void> {
    if (status === 'open') {
      console.log('📈 MARKET OPEN - Switching to high-frequency trading mode');
      console.log('   • Trading agents: HIGH priority, active execution');
      console.log('   • Strategy agent: STANDBY mode (resource conservation)');

      // Stop strategy preparation agent during market hours
      await this.stopAgent('Strategy Preparation Agent');

    } else {
      console.log('🌙 MARKET CLOSED - Switching to strategy preparation mode');
      console.log('   • Trading agents: LOW priority, monitoring only');
      console.log('   • Strategy agent: ACTIVE mode (deep analysis)');

      // Start strategy preparation agent during off-hours
      await this.startAgent('Strategy Preparation Agent');
    }
  }

  private async ensureAgentsRunning(): Promise<void> {
    const marketSession = MarketHours.getCurrentSession();

    for (const agent of this.agents) {
      const shouldRun = this.shouldAgentRun(agent, marketSession.isOpen);

      if (shouldRun && !agent.isRunning) {
        await this.startAgent(agent.name);
      } else if (!shouldRun && agent.isRunning) {
        await this.stopAgent(agent.name);
      }
    }
  }

  private shouldAgentRun(agent: AgentProcess, marketOpen: boolean): boolean {
    switch (agent.mode) {
      case 'always':
        return true;
      case 'market_hours':
        return marketOpen;
      case 'off_hours':
        return !marketOpen;
      default:
        return false;
    }
  }

  private async startAgent(agentName: string): Promise<void> {
    const agent = this.agents.find(a => a.name === agentName);
    if (!agent || agent.isRunning) return;

    console.log(`🚀 Starting ${agentName}...`);

    try {
      const scriptPath = path.join(__dirname, '..', '..', agent.scriptPath);

      agent.process = spawn('npx', ['ts-node', scriptPath], {
        cwd: path.join(__dirname, '..', '..'),
        env: { ...process.env },
        stdio: 'pipe'
      });

      agent.process.on('error', (error) => {
        console.error(`❌ ${agentName} failed to start:`, error);
        agent.isRunning = false;
      });

      agent.process.on('exit', (code) => {
        console.log(`📴 ${agentName} exited with code ${code}`);
        agent.isRunning = false;
      });

      // Monitor output (optional)
      agent.process.stdout?.on('data', (data) => {
        const output = data.toString().trim();
        if (output.includes('ERROR') || output.includes('❌')) {
          console.log(`🔍 ${agentName}: ${output}`);
        }
      });

      agent.isRunning = true;
      console.log(`✅ ${agentName} started successfully`);

    } catch (error) {
      console.error(`❌ Failed to start ${agentName}:`, error);
    }
  }

  private async stopAgent(agentName: string): Promise<void> {
    const agent = this.agents.find(a => a.name === agentName);
    if (!agent || !agent.isRunning || !agent.process) return;

    console.log(`🛑 Stopping ${agentName}...`);

    try {
      // Graceful shutdown
      agent.process.kill('SIGTERM');

      // Wait 10 seconds for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 10000));

      // Force kill if still running
      if (agent.isRunning) {
        agent.process.kill('SIGKILL');
      }

      agent.isRunning = false;
      console.log(`📴 ${agentName} stopped`);

    } catch (error) {
      console.error(`❌ Error stopping ${agentName}:`, error);
    }
  }

  private logAgentStatus(): void {
    console.log('\n📋 Agent Status:');
    for (const agent of this.agents) {
      const status = agent.isRunning ? '🟢 RUNNING' : '🔴 STOPPED';
      const priority = agent.isRunning ? `(${agent.priority.toUpperCase()} priority)` : '';
      console.log(`   ${agent.name}: ${status} ${priority}`);
    }
  }

  async stop(): Promise<void> {
    console.log('📴 Shutting down Agent Coordinator...');
    this.isRunning = false;

    // Stop all agents
    for (const agent of this.agents) {
      if (agent.isRunning) {
        await this.stopAgent(agent.name);
      }
    }

    console.log('✅ Agent Coordinator stopped');
  }
}

// Main execution
async function main() {
  const coordinator = new AgentCoordinator();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n📴 Received SIGINT, shutting down coordinator...');
    await coordinator.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n📴 Received SIGTERM, shutting down coordinator...');
    await coordinator.stop();
    process.exit(0);
  });

  try {
    await coordinator.start();
  } catch (error) {
    console.error('❌ Fatal error in agent coordinator:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { AgentCoordinator };
