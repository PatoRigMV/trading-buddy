#!/usr/bin/env node

/**
 * Unified Agent Orchestrator
 *
 * Advanced orchestration system that builds on AgentCoordinator with:
 * - Cross-agent communication coordination
 * - Performance monitoring and auto-scaling
 * - Market regime-based agent allocation
 * - Advanced failure recovery and circuit breakers
 * - Resource optimization and load balancing
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { MarketHours, MarketSession } from '../engine/marketHours';
import { getMessageBus, AgentStatus } from '../shared/AgentMessageBus';

interface OrchestratedAgent {
  id: string;
  name: string;
  scriptPath: string;
  process?: ChildProcess;
  isRunning: boolean;
  mode: 'market_hours' | 'off_hours' | 'always';
  priority: 'critical' | 'high' | 'medium' | 'low';
  marketRegimes: string[]; // Which market regimes this agent is most effective in
  capabilities: string[];
  resourceUsage: {
    cpu: number;
    memory: number;
    lastUpdate: string;
  };
  performance: {
    uptime: number;
    restartCount: number;
    lastRestart: string;
    avgResponseTime: number;
  };
  circuitBreaker: {
    failures: number;
    lastFailure: string;
    isOpen: boolean;
    backoffUntil?: string;
  };
}

interface MarketRegimeConfig {
  regime: 'trending' | 'ranging' | 'volatile' | 'low_vol';
  agentPriorities: { [agentId: string]: 'critical' | 'high' | 'medium' | 'low' | 'disabled' };
  resourceLimits: {
    maxCpuPerAgent: number;
    maxMemoryPerAgent: number;
    maxConcurrentAgents: number;
  };
}

class UnifiedOrchestrator {
  private agents: Map<string, OrchestratedAgent> = new Map();
  private messageBus = getMessageBus();
  private isRunning = false;
  private currentMarketRegime: 'trending' | 'ranging' | 'volatile' | 'low_vol' = 'trending';
  private orchestratorId = 'unified_orchestrator';

  // Market regime configurations
  private regimeConfigs: Map<string, MarketRegimeConfig> = new Map([
    ['trending', {
      regime: 'trending',
      agentPriorities: {
        'main_trading': 'critical',
        'portfolio': 'high',
        'options': 'high',
        'strategy_prep': 'medium',
        'watchdog': 'medium'
      },
      resourceLimits: {
        maxCpuPerAgent: 25,
        maxMemoryPerAgent: 512,
        maxConcurrentAgents: 5
      }
    }],
    ['volatile', {
      regime: 'volatile',
      agentPriorities: {
        'main_trading': 'critical',
        'portfolio': 'critical',
        'options': 'medium',
        'strategy_prep': 'low',
        'watchdog': 'high'
      },
      resourceLimits: {
        maxCpuPerAgent: 30,
        maxMemoryPerAgent: 256,
        maxConcurrentAgents: 4
      }
    }],
    ['ranging', {
      regime: 'ranging',
      agentPriorities: {
        'main_trading': 'high',
        'portfolio': 'medium',
        'options': 'critical',
        'strategy_prep': 'high',
        'watchdog': 'medium'
      },
      resourceLimits: {
        maxCpuPerAgent: 20,
        maxMemoryPerAgent: 512,
        maxConcurrentAgents: 6
      }
    }],
    ['low_vol', {
      regime: 'low_vol',
      agentPriorities: {
        'main_trading': 'medium',
        'portfolio': 'medium',
        'options': 'high',
        'strategy_prep': 'critical',
        'watchdog': 'low'
      },
      resourceLimits: {
        maxCpuPerAgent: 15,
        maxMemoryPerAgent: 256,
        maxConcurrentAgents: 6
      }
    }]
  ]);

  constructor() {
    this.setupAgents();
    this.registerWithMessageBus();
  }

  private setupAgents(): void {
    this.agents = new Map([
      ['main_trading', {
        id: 'main_trading',
        name: 'Main Trading Agent',
        scriptPath: 'src/cli/runAgent.ts',
        isRunning: false,
        mode: 'always',
        priority: 'critical',
        marketRegimes: ['trending', 'volatile', 'ranging'],
        capabilities: ['trading', 'execution', 'risk_management'],
        resourceUsage: { cpu: 0, memory: 0, lastUpdate: new Date().toISOString() },
        performance: { uptime: 0, restartCount: 0, lastRestart: '', avgResponseTime: 0 },
        circuitBreaker: { failures: 0, lastFailure: '', isOpen: false }
      }],
      ['portfolio', {
        id: 'portfolio',
        name: 'Portfolio Analysis Agent',
        scriptPath: 'src/cli/portfolioAgent.ts',
        isRunning: false,
        mode: 'always',
        priority: 'high',
        marketRegimes: ['trending', 'volatile', 'ranging', 'low_vol'],
        capabilities: ['portfolio_analysis', 'risk_monitoring', 'p&l_tracking'],
        resourceUsage: { cpu: 0, memory: 0, lastUpdate: new Date().toISOString() },
        performance: { uptime: 0, restartCount: 0, lastRestart: '', avgResponseTime: 0 },
        circuitBreaker: { failures: 0, lastFailure: '', isOpen: false }
      }],
      ['options', {
        id: 'options',
        name: 'Options Trading Agent',
        scriptPath: 'src/cli/simpleOptionsAgent.ts',
        isRunning: false,
        mode: 'always',
        priority: 'high',
        marketRegimes: ['ranging', 'low_vol', 'trending'],
        capabilities: ['options_trading', 'volatility_analysis', 'Greeks_monitoring'],
        resourceUsage: { cpu: 0, memory: 0, lastUpdate: new Date().toISOString() },
        performance: { uptime: 0, restartCount: 0, lastRestart: '', avgResponseTime: 0 },
        circuitBreaker: { failures: 0, lastFailure: '', isOpen: false }
      }],
      ['strategy_prep', {
        id: 'strategy_prep',
        name: 'Strategy Preparation Agent',
        scriptPath: 'src/cli/strategyPreparationAgent.ts',
        isRunning: false,
        mode: 'off_hours',
        priority: 'medium',
        marketRegimes: ['low_vol', 'ranging'],
        capabilities: ['strategy_research', 'watchlist_generation', 'market_analysis'],
        resourceUsage: { cpu: 0, memory: 0, lastUpdate: new Date().toISOString() },
        performance: { uptime: 0, restartCount: 0, lastRestart: '', avgResponseTime: 0 },
        circuitBreaker: { failures: 0, lastFailure: '', isOpen: false }
      }]
    ]);
  }

  private registerWithMessageBus(): void {
    this.messageBus.registerAgent(
      this.orchestratorId,
      ['orchestration', 'coordination', 'resource_management'],
      'monitoring'
    );

    // Subscribe to agent messages for coordination
    this.messageBus.subscribeAgent(this.orchestratorId, (message) => {
      this.handleAgentMessage(message);
    });
  }

  async start(): Promise<void> {
    console.log('🎯 Unified Agent Orchestrator v2.0');
    console.log('=====================================');
    console.log('🧠 AI-powered resource optimization');
    console.log('📊 Market regime-aware scaling');
    console.log('🔄 Advanced failure recovery');
    console.log('📡 Cross-agent communication');

    this.isRunning = true;

    // Start initial agents based on market status
    await this.evaluateAndOptimizeAgents();

    // Send startup notification
    this.messageBus.broadcastMessage({
      from: this.orchestratorId,
      type: 'coordination',
      priority: 'medium',
      data: {
        event: 'orchestrator_started',
        regime: this.currentMarketRegime,
        active_agents: Array.from(this.agents.keys())
      }
    });

    // Main orchestration loop
    while (this.isRunning) {
      try {
        await new Promise(resolve => setTimeout(resolve, 30000)); // Every 30 seconds
        await this.evaluateAndOptimizeAgents();
        await this.monitorAgentPerformance();
        await this.handleCircuitBreakers();
      } catch (error) {
        console.error('❌ Orchestrator error:', error);
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10s on error
      }
    }
  }

  private async evaluateAndOptimizeAgents(): Promise<void> {
    const marketSession = MarketHours.getCurrentSession();

    // Detect market regime (simplified - in reality would use market data)
    const newRegime = await this.detectMarketRegime();
    if (newRegime !== this.currentMarketRegime) {
      console.log(`🔄 Market regime change: ${this.currentMarketRegime} → ${newRegime}`);
      this.currentMarketRegime = newRegime;
      await this.adaptToMarketRegime(newRegime);
    }

    // Get current regime config
    const regimeConfig = this.regimeConfigs.get(this.currentMarketRegime);
    if (!regimeConfig) return;

    console.log(`🎯 [ORCHESTRATOR] Market: ${marketSession.status}, Regime: ${this.currentMarketRegime}`);

    // Evaluate each agent
    for (const [agentId, agent] of this.agents.entries()) {
      const shouldRun = this.shouldAgentRun(agent, marketSession.isOpen);
      const currentPriority = regimeConfig.agentPriorities[agentId] || 'medium';

      if (shouldRun && !agent.isRunning && !agent.circuitBreaker.isOpen) {
        if (currentPriority !== 'disabled') {
          await this.startAgent(agentId);
        }
      } else if (!shouldRun && agent.isRunning) {
        await this.stopAgent(agentId);
      }

      // Update agent priority based on regime
      if (agent.priority !== currentPriority && currentPriority !== 'disabled') {
        agent.priority = currentPriority as any;
        console.log(`🔧 [ORCHESTRATOR] ${agent.name} priority: ${currentPriority}`);
      }
    }
  }

  private async detectMarketRegime(): Promise<'trending' | 'ranging' | 'volatile' | 'low_vol'> {
    // Simplified regime detection - in reality would analyze:
    // - VIX levels
    // - Market correlation
    // - Volume patterns
    // - Price volatility

    // For demo, rotate regimes to show orchestrator adaptation
    const regimes: Array<'trending' | 'ranging' | 'volatile' | 'low_vol'> = ['trending', 'ranging', 'volatile', 'low_vol'];
    const hour = new Date().getHours();
    return regimes[hour % 4];
  }

  private async adaptToMarketRegime(regime: 'trending' | 'ranging' | 'volatile' | 'low_vol'): Promise<void> {
    const config = this.regimeConfigs.get(regime);
    if (!config) return;

    console.log(`📊 [ORCHESTRATOR] Adapting to ${regime} market regime`);
    console.log(`   Resource limits: CPU ${config.resourceLimits.maxCpuPerAgent}%, Memory ${config.resourceLimits.maxMemoryPerAgent}MB`);
    console.log(`   Max concurrent agents: ${config.resourceLimits.maxConcurrentAgents}`);

    // Broadcast regime change to all agents
    this.messageBus.broadcastMessage({
      from: this.orchestratorId,
      type: 'market_alert',
      priority: 'high',
      data: {
        event: 'regime_change',
        new_regime: regime,
        config: config,
        message: `Market regime changed to ${regime} - adjusting strategies`
      }
    });
  }

  private shouldAgentRun(agent: OrchestratedAgent, marketOpen: boolean): boolean {
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

  private async startAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent || agent.isRunning) return;

    console.log(`🚀 [ORCHESTRATOR] Starting ${agent.name} (${agent.priority} priority)...`);

    try {
      const scriptPath = path.join(__dirname, '..', '..', agent.scriptPath);

      agent.process = spawn('npx', ['ts-node', scriptPath], {
        cwd: path.join(__dirname, '..', '..'),
        env: { ...process.env },
        stdio: 'pipe'
      });

      agent.process.on('error', (error) => {
        console.error(`❌ ${agent.name} failed to start:`, error);
        this.handleAgentFailure(agentId, error);
      });

      agent.process.on('exit', (code) => {
        console.log(`📴 ${agent.name} exited with code ${code}`);
        this.handleAgentExit(agentId, code);
      });

      agent.isRunning = true;
      agent.performance.lastRestart = new Date().toISOString();
      console.log(`✅ [ORCHESTRATOR] ${agent.name} started successfully`);

      // Notify message bus
      this.messageBus.sendMessage({
        from: this.orchestratorId,
        type: 'coordination',
        priority: 'medium',
        data: {
          event: 'agent_started',
          agent_id: agentId,
          agent_name: agent.name,
          priority: agent.priority
        }
      });

    } catch (error) {
      console.error(`❌ Failed to start ${agent.name}:`, error);
      this.handleAgentFailure(agentId, error);
    }
  }

  private async stopAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent || !agent.isRunning || !agent.process) return;

    console.log(`🛑 [ORCHESTRATOR] Stopping ${agent.name}...`);

    try {
      agent.process.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 5000));

      if (agent.isRunning) {
        agent.process.kill('SIGKILL');
      }

      agent.isRunning = false;
      console.log(`📴 [ORCHESTRATOR] ${agent.name} stopped`);

    } catch (error) {
      console.error(`❌ Error stopping ${agent.name}:`, error);
    }
  }

  private handleAgentFailure(agentId: string, error: any): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.isRunning = false;
    agent.circuitBreaker.failures++;
    agent.circuitBreaker.lastFailure = new Date().toISOString();

    console.error(`❌ [ORCHESTRATOR] ${agent.name} failure #${agent.circuitBreaker.failures}`);

    // Open circuit breaker after 3 failures
    if (agent.circuitBreaker.failures >= 3) {
      agent.circuitBreaker.isOpen = true;
      agent.circuitBreaker.backoffUntil = new Date(Date.now() + 60000).toISOString(); // 1 minute backoff
      console.error(`🚫 [ORCHESTRATOR] Circuit breaker OPEN for ${agent.name} - backing off`);

      // Send critical alert
      this.messageBus.sendMessage({
        from: this.orchestratorId,
        type: 'risk_warning',
        priority: 'critical',
        data: {
          warning: `Agent ${agent.name} circuit breaker activated`,
          failures: agent.circuitBreaker.failures,
          backoff_until: agent.circuitBreaker.backoffUntil
        }
      });
    }
  }

  private handleAgentExit(agentId: string, code: number | null): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.isRunning = false;
    agent.performance.restartCount++;

    if (code !== 0) {
      this.handleAgentFailure(agentId, new Error(`Exit code ${code}`));
    }
  }

  private async monitorAgentPerformance(): Promise<void> {
    // In a real implementation, this would monitor:
    // - CPU usage per agent
    // - Memory consumption
    // - Response times
    // - Message bus activity

    const agentSummary = this.messageBus.getAgentStatusSummary();

    if (agentSummary.active_agents === 0) {
      console.log(`⚠️ [ORCHESTRATOR] No active agents detected - investigating...`);
    }
  }

  private async handleCircuitBreakers(): Promise<void> {
    const now = new Date();

    for (const [agentId, agent] of this.agents.entries()) {
      if (agent.circuitBreaker.isOpen && agent.circuitBreaker.backoffUntil) {
        const backoffTime = new Date(agent.circuitBreaker.backoffUntil);

        if (now > backoffTime) {
          console.log(`🔧 [ORCHESTRATOR] Attempting to reset circuit breaker for ${agent.name}`);
          agent.circuitBreaker.isOpen = false;
          agent.circuitBreaker.failures = 0;
          agent.circuitBreaker.backoffUntil = undefined;

          // Try to restart agent
          if (this.shouldAgentRun(agent, MarketHours.getCurrentSession().isOpen)) {
            await this.startAgent(agentId);
          }
        }
      }
    }
  }

  private handleAgentMessage(message: any): void {
    // Handle coordination messages from other agents
    if (message.type === 'risk_warning' && message.priority === 'critical') {
      console.log(`🚨 [ORCHESTRATOR] Critical alert from ${message.from}: ${message.data.warning}`);
      // Could trigger emergency procedures here
    }
  }

  async stop(): Promise<void> {
    console.log('📴 [ORCHESTRATOR] Shutting down unified orchestrator...');
    this.isRunning = false;

    // Stop all agents
    for (const agentId of this.agents.keys()) {
      await this.stopAgent(agentId);
    }

    console.log('✅ [ORCHESTRATOR] Unified orchestrator stopped');
  }
}

export { UnifiedOrchestrator };
