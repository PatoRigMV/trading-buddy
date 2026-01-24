#!/usr/bin/env node

/**
 * Agent Message Bus
 *
 * Enables intelligent cross-agent communication for coordinated trading decisions.
 * Allows agents to share market insights, alerts, and coordination signals.
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';

interface AgentMessage {
  id: string;
  from: string;
  to?: string; // undefined = broadcast
  type: 'market_alert' | 'strategy_update' | 'risk_warning' | 'opportunity' | 'coordination';
  priority: 'low' | 'medium' | 'high' | 'critical';
  data: any;
  timestamp: string;
  expires?: string;
}

interface AgentStatus {
  agent_id: string;
  status: 'active' | 'standby' | 'offline';
  last_heartbeat: string;
  market_mode: 'trading' | 'monitoring' | 'preparation';
  capabilities: string[];
}

class AgentMessageBus extends EventEmitter {
  private messages: Map<string, AgentMessage> = new Map();
  private agents: Map<string, AgentStatus> = new Map();
  private messageLog: AgentMessage[] = [];
  private dataDir: string;
  private maxMessages = 1000;
  private maxLogSize = 5000;

  constructor() {
    super();
    this.dataDir = path.join(__dirname, '../../data/agent_communication');
    this.ensureDataDirectory();
    this.startCleanupInterval();
  }

  private ensureDataDirectory(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  private startCleanupInterval(): void {
    // Clean up expired messages every 5 minutes
    setInterval(() => {
      this.cleanupExpiredMessages();
    }, 5 * 60 * 1000);
  }

  /**
   * Register an agent with the message bus
   */
  registerAgent(agentId: string, capabilities: string[], mode: 'trading' | 'monitoring' | 'preparation' = 'monitoring'): void {
    const status: AgentStatus = {
      agent_id: agentId,
      status: 'active',
      last_heartbeat: new Date().toISOString(),
      market_mode: mode,
      capabilities
    };

    this.agents.set(agentId, status);

    // Broadcast agent registration
    this.broadcastMessage({
      from: 'message_bus',
      type: 'coordination',
      priority: 'medium',
      data: {
        event: 'agent_registered',
        agent_id: agentId,
        capabilities,
        mode
      }
    });

    console.log(`📡 [MESSAGE_BUS] Agent registered: ${agentId} (${capabilities.join(', ')})`);
  }

  /**
   * Send a message to specific agent or broadcast
   */
  sendMessage(message: Omit<AgentMessage, 'id' | 'timestamp'>): string {
    const id = this.generateMessageId();
    const fullMessage: AgentMessage = {
      ...message,
      id,
      timestamp: new Date().toISOString()
    };

    // Store message
    this.messages.set(id, fullMessage);
    this.messageLog.push(fullMessage);

    // Emit to subscribers
    if (message.to) {
      this.emit(`message:${message.to}`, fullMessage);
    } else {
      this.emit('broadcast', fullMessage);
    }

    // Log important messages
    if (message.priority === 'high' || message.priority === 'critical') {
      console.log(`📡 [MESSAGE_BUS] ${message.priority.toUpperCase()}: ${message.from} → ${message.to || 'ALL'} (${message.type})`);
    }

    return id;
  }

  /**
   * Broadcast message to all active agents
   */
  broadcastMessage(message: Omit<AgentMessage, 'id' | 'timestamp' | 'to'>): string {
    return this.sendMessage({ ...message, to: undefined });
  }

  /**
   * Subscribe to messages for a specific agent
   */
  subscribeAgent(agentId: string, callback: (message: AgentMessage) => void): void {
    // Subscribe to direct messages
    this.on(`message:${agentId}`, callback);

    // Subscribe to broadcasts
    this.on('broadcast', callback);
  }

  /**
   * Update agent heartbeat and status
   */
  updateAgentStatus(agentId: string, mode?: 'trading' | 'monitoring' | 'preparation'): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.last_heartbeat = new Date().toISOString();
      if (mode) {
        agent.market_mode = mode;
      }
      this.agents.set(agentId, agent);
    }
  }

  /**
   * Get messages for a specific agent (unread)
   */
  getMessagesForAgent(agentId: string, since?: string): AgentMessage[] {
    const sinceTime = since ? new Date(since) : new Date(Date.now() - 60 * 60 * 1000); // Last hour default

    return this.messageLog.filter(msg => {
      const messageTime = new Date(msg.timestamp);
      const isForAgent = !msg.to || msg.to === agentId;
      const isRecent = messageTime >= sinceTime;
      const notFromSelf = msg.from !== agentId;

      return isForAgent && isRecent && notFromSelf;
    });
  }

  /**
   * Get current agent status summary
   */
  getAgentStatusSummary(): {
    active_agents: number;
    trading_mode: number;
    monitoring_mode: number;
    preparation_mode: number;
    agents: AgentStatus[];
  } {
    const activeAgents = Array.from(this.agents.values()).filter(agent => {
      const lastHeartbeat = new Date(agent.last_heartbeat);
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      return lastHeartbeat > fiveMinutesAgo;
    });

    return {
      active_agents: activeAgents.length,
      trading_mode: activeAgents.filter(a => a.market_mode === 'trading').length,
      monitoring_mode: activeAgents.filter(a => a.market_mode === 'monitoring').length,
      preparation_mode: activeAgents.filter(a => a.market_mode === 'preparation').length,
      agents: activeAgents
    };
  }

  /**
   * Save agent communication state to disk
   */
  async saveState(): Promise<void> {
    try {
      const state = {
        agents: Array.from(this.agents.entries()),
        recent_messages: this.messageLog.slice(-100), // Last 100 messages
        timestamp: new Date().toISOString()
      };

      const statePath = path.join(this.dataDir, 'communication_state.json');
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    } catch (error) {
      console.error('❌ Failed to save message bus state:', error);
    }
  }

  /**
   * Load agent communication state from disk
   */
  async loadState(): Promise<void> {
    try {
      const statePath = path.join(this.dataDir, 'communication_state.json');
      if (fs.existsSync(statePath)) {
        const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));

        // Restore agents (but mark as offline initially)
        for (const [agentId, agentData] of state.agents) {
          this.agents.set(agentId, { ...agentData, status: 'offline' });
        }

        // Restore recent messages
        if (state.recent_messages) {
          this.messageLog = state.recent_messages;
        }

        console.log(`📡 [MESSAGE_BUS] Restored state: ${this.agents.size} agents, ${this.messageLog.length} messages`);
      }
    } catch (error) {
      console.error('❌ Failed to load message bus state:', error);
    }
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private cleanupExpiredMessages(): void {
    const now = new Date();
    let expiredCount = 0;

    // Remove expired messages
    for (const [id, message] of this.messages.entries()) {
      if (message.expires && new Date(message.expires) < now) {
        this.messages.delete(id);
        expiredCount++;
      }
    }

    // Trim message log if too large
    if (this.messageLog.length > this.maxLogSize) {
      this.messageLog = this.messageLog.slice(-this.maxMessages);
    }

    // Trim active messages if too many
    if (this.messages.size > this.maxMessages) {
      const sortedMessages = Array.from(this.messages.entries())
        .sort(([, a], [, b]) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      this.messages.clear();
      sortedMessages.slice(0, this.maxMessages).forEach(([id, msg]) => {
        this.messages.set(id, msg);
      });
    }

    if (expiredCount > 0) {
      console.log(`📡 [MESSAGE_BUS] Cleaned up ${expiredCount} expired messages`);
    }
  }

  /**
   * Shutdown message bus gracefully
   */
  async shutdown(): Promise<void> {
    await this.saveState();
    this.removeAllListeners();
    console.log('📡 [MESSAGE_BUS] Shutdown complete');
  }
}

// Singleton instance
let messageBusInstance: AgentMessageBus | null = null;

export function getMessageBus(): AgentMessageBus {
  if (!messageBusInstance) {
    messageBusInstance = new AgentMessageBus();
  }
  return messageBusInstance;
}

export { AgentMessageBus, AgentMessage, AgentStatus };
