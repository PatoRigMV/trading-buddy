export interface AgentIdentity {
  id: string;
  name: string;
  emoji: string;
  specialty: string;
  personality: string;
}

export class AgentNaming {
  private static readonly AGENT_NAMES = [
    // Trading Legends
    { name: "Warren", emoji: "🎯", specialty: "Value Investing", personality: "Patient and analytical" },
    { name: "Benjamin", emoji: "📚", specialty: "Deep Value", personality: "Methodical and thorough" },
    { name: "Peter", emoji: "🚀", specialty: "Growth Investing", personality: "Aggressive and opportunistic" },
    { name: "Ray", emoji: "🌊", specialty: "Market Cycles", personality: "Strategic and macro-focused" },
    { name: "Jesse", emoji: "⚡", specialty: "Momentum Trading", personality: "Quick and intuitive" },

    // Modern Traders
    { name: "Alpha", emoji: "🤖", specialty: "Algorithmic Trading", personality: "Precise and systematic" },
    { name: "Sigma", emoji: "📊", specialty: "Statistical Arbitrage", personality: "Data-driven and logical" },
    { name: "Delta", emoji: "🔄", specialty: "Options Agent", personality: "Risk-aware and adaptive" },
    { name: "Gamma", emoji: "⚖️", specialty: "Rebalancing Agent", personality: "Balanced and diversified" },
    { name: "Theta", emoji: "⏰", specialty: "Expiration Agent", personality: "Patient and time-conscious" },

    // Market Personalities
    { name: "Bull", emoji: "🐂", specialty: "Long Positions", personality: "Optimistic and aggressive" },
    { name: "Bear", emoji: "🐻", specialty: "Short Positions", personality: "Cautious and contrarian" },
    { name: "Eagle", emoji: "🦅", specialty: "Market Overview", personality: "Sharp-eyed and strategic" },
    { name: "Wolf", emoji: "🐺", specialty: "Pack Hunting", personality: "Social and coordinated" },
    { name: "Shark", emoji: "🦈", specialty: "Predatory Trading", personality: "Ruthless and efficient" },

    // Technical Traders
    { name: "Fibonacci", emoji: "🌀", specialty: "Technical Analysis", personality: "Pattern-focused and mathematical" },
    { name: "Bollinger", emoji: "📈", specialty: "Volatility Trading", personality: "Band-focused and adaptive" },
    { name: "Stochastic", emoji: "🎲", specialty: "Oscillator Trading", personality: "Rhythm-focused and cyclical" },
    { name: "MACD", emoji: "📡", specialty: "Trend Following", personality: "Signal-focused and reactive" },
    { name: "RSI", emoji: "🎯", specialty: "Momentum Analysis", personality: "Boundary-focused and precise" },

    // Creative Names
    { name: "Nova", emoji: "✨", specialty: "Breakout Trading", personality: "Explosive and opportunistic" },
    { name: "Vortex", emoji: "🌪️", specialty: "Volatility Surfing", personality: "Dynamic and adaptive" },
    { name: "Phoenix", emoji: "🔥", specialty: "Recovery Plays", personality: "Resilient and transformative" },
    { name: "Quantum", emoji: "⚛️", specialty: "Multi-dimensional Analysis", personality: "Complex and innovative" },
    { name: "Nexus", emoji: "🔗", specialty: "Market Connections", personality: "Networked and insightful" }
  ];

  private static usedNames = new Set<string>();

  static generateAgentIdentity(): AgentIdentity {
    // Filter out already used names
    const availableNames = this.AGENT_NAMES.filter(agent => !this.usedNames.has(agent.name));

    // If all names are used, reset the pool
    if (availableNames.length === 0) {
      this.usedNames.clear();
      availableNames.push(...this.AGENT_NAMES);
    }

    // Select random agent
    const selectedAgent = availableNames[Math.floor(Math.random() * availableNames.length)];
    this.usedNames.add(selectedAgent.name);

    // Generate unique ID
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    const id = `${selectedAgent.name.toLowerCase()}-${timestamp}-${random}`;

    return {
      id,
      name: selectedAgent.name,
      emoji: selectedAgent.emoji,
      specialty: selectedAgent.specialty,
      personality: selectedAgent.personality
    };
  }

  static createDisplayName(identity: AgentIdentity): string {
    return `${identity.emoji} ${identity.name}`;
  }

  static createFullDisplayName(identity: AgentIdentity): string {
    return `${identity.emoji} ${identity.name} (${identity.specialty})`;
  }

  static getPersonalityDescription(identity: AgentIdentity): string {
    return `${identity.name} is ${identity.personality} and specializes in ${identity.specialty}.`;
  }

  static getWatchlistSubmitterName(identity: AgentIdentity): string {
    return `agent-${identity.name.toLowerCase()}`;
  }

  // For existing agents without names, generate based on their existing ID
  static generateNameFromId(existingId: string): AgentIdentity {
    // Create deterministic selection based on ID hash
    const hash = this.simpleHash(existingId);
    const index = hash % this.AGENT_NAMES.length;
    const selectedAgent = this.AGENT_NAMES[index];

    return {
      id: existingId,
      name: selectedAgent.name,
      emoji: selectedAgent.emoji,
      specialty: selectedAgent.specialty,
      personality: selectedAgent.personality
    };
  }

  private static simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  // Get appropriate emoji for different contexts
  static getContextEmoji(context: 'watchlist' | 'trade' | 'analysis' | 'alert'): string {
    switch (context) {
      case 'watchlist': return '👁️';
      case 'trade': return '💼';
      case 'analysis': return '🔍';
      case 'alert': return '🚨';
      default: return '🤖';
    }
  }

  // Format messages with agent personality
  static formatMessage(identity: AgentIdentity, message: string, context?: string): string {
    const contextEmoji = context ? this.getContextEmoji(context as any) : '';
    return `${identity.emoji} **${identity.name}** ${contextEmoji} ${message}`;
  }
}
