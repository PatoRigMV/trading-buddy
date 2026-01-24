export type AgentState = 'idle' | 'analyzing' | 'entering' | 'in_position' | 'exiting' | 'error';

export interface StateTransition {
  from: AgentState;
  to: AgentState;
  condition: string;
  timestamp: Date;
}

export interface AgentContext {
  symbol: string;
  state: AgentState;
  entryPrice?: number;
  quantity?: number;
  stopLoss?: number;
  targetPrice?: number;
  orderId?: string;
  lastUpdate: Date;
  errorMessage?: string;
}

export class TradingStateMachine {
  private contexts: Map<string, AgentContext> = new Map();
  private transitions: StateTransition[] = [];
  private maxTransitionHistory = 1000;

  initializeSymbol(symbol: string): AgentContext {
    const context: AgentContext = {
      symbol,
      state: 'idle',
      lastUpdate: new Date()
    };

    this.contexts.set(symbol, context);
    this.recordTransition('idle', 'idle', symbol, 'Symbol initialized');

    return context;
  }

  getContext(symbol: string): AgentContext | undefined {
    return this.contexts.get(symbol);
  }

  getAllContexts(): AgentContext[] {
    return Array.from(this.contexts.values());
  }

  canTransition(symbol: string, toState: AgentState): boolean {
    const context = this.contexts.get(symbol);
    if (!context) return false;

    return this.isValidTransition(context.state, toState);
  }

  transition(symbol: string, toState: AgentState, reason: string, data?: Partial<AgentContext>): boolean {
    const context = this.contexts.get(symbol);
    if (!context) {
      console.error(`No context found for symbol ${symbol}`);
      return false;
    }

    if (!this.isValidTransition(context.state, toState)) {
      console.error(`Invalid transition for ${symbol}: ${context.state} -> ${toState}`);
      return false;
    }

    const fromState = context.state;

    // Update context
    Object.assign(context, data);
    context.state = toState;
    context.lastUpdate = new Date();

    // Clear error message on successful transition
    if (toState !== 'error') {
      delete context.errorMessage;
    }

    this.recordTransition(fromState, toState, symbol, reason);

    console.log(`[${symbol}] ${fromState} -> ${toState}: ${reason}`);
    return true;
  }

  setError(symbol: string, error: string): void {
    const context = this.contexts.get(symbol);
    if (!context) return;

    const fromState = context.state;
    context.state = 'error';
    context.errorMessage = error;
    context.lastUpdate = new Date();

    this.recordTransition(fromState, 'error', symbol, error);

    console.error(`[${symbol}] ERROR: ${error}`);
  }

  resetSymbol(symbol: string): void {
    const context = this.contexts.get(symbol);
    if (!context) return;

    const fromState = context.state;

    // Keep symbol but reset all other fields
    this.contexts.set(symbol, {
      symbol,
      state: 'idle',
      lastUpdate: new Date()
    });

    this.recordTransition(fromState, 'idle', symbol, 'State reset');
  }

  private isValidTransition(from: AgentState, to: AgentState): boolean {
    const validTransitions: Record<AgentState, AgentState[]> = {
      'idle': ['analyzing', 'error'],
      'analyzing': ['idle', 'entering', 'error'],
      'entering': ['in_position', 'idle', 'error'],
      'in_position': ['exiting', 'error'],
      'exiting': ['idle', 'error'],
      'error': ['idle'] // Can always recover to idle
    };

    return validTransitions[from]?.includes(to) || false;
  }

  private recordTransition(from: AgentState, to: AgentState, symbol: string, condition: string): void {
    const transition: StateTransition = {
      from,
      to,
      condition: `[${symbol}] ${condition}`,
      timestamp: new Date()
    };

    this.transitions.push(transition);

    // Keep history bounded
    if (this.transitions.length > this.maxTransitionHistory) {
      this.transitions = this.transitions.slice(-this.maxTransitionHistory);
    }
  }

  getTransitionHistory(symbol?: string, limit?: number): StateTransition[] {
    let filtered = this.transitions;

    if (symbol) {
      filtered = filtered.filter(t => t.condition.includes(`[${symbol}]`));
    }

    if (limit) {
      filtered = filtered.slice(-limit);
    }

    return filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  getStateStats(): Record<AgentState, number> {
    const stats: Record<AgentState, number> = {
      'idle': 0,
      'analyzing': 0,
      'entering': 0,
      'in_position': 0,
      'exiting': 0,
      'error': 0
    };

    for (const context of this.contexts.values()) {
      stats[context.state]++;
    }

    return stats;
  }

  // Clean up old contexts that haven't been updated
  cleanup(maxAgeHours: number = 24): number {
    const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    let cleaned = 0;

    for (const [symbol, context] of this.contexts.entries()) {
      if (context.lastUpdate < cutoff && context.state === 'idle') {
        this.contexts.delete(symbol);
        cleaned++;
      }
    }

    return cleaned;
  }
}
