import { PrismaClient } from '@prisma/client';
import { calculateConfidenceScores } from './scorer';
import { TechnicalSignals } from './indicators';

export interface WatchlistEntry {
  id: string;
  symbol: string;
  submitter: string;
  submitterType: 'user' | 'agent' | 'system';
  reason: string;
  entryType: 'new_opportunity' | 're_engagement' | 'user_manual' | 'technical_breakout';
  targetEntry?: number;
  currentPrice?: number;
  confidence?: number;
  signals?: TechnicalSignals;
  reEngagementScore?: number;
  priority: number;
  status: 'active' | 'triggered' | 'expired' | 'removed';
  notes?: string;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReEngagementAnalysis {
  symbol: string;
  score: number;
  reason: string;
  lastExitPrice?: number;
  lastExitDate?: Date;
  currentSetup: string;
  improvement: string;
}

export class WatchlistManager {
  private prisma: PrismaClient;
  private agentId: string;

  constructor(agentId: string = 'main-agent') {
    this.prisma = new PrismaClient();
    this.agentId = agentId;
  }

  async addToWatchlist(
    symbol: string,
    reason: string,
    entryType: 'new_opportunity' | 're_engagement' | 'user_manual' | 'technical_breakout',
    options: {
      submitter?: string;
      submitterType?: 'user' | 'agent' | 'system';
      targetEntry?: number;
      currentPrice?: number;
      confidence?: number;
      signals?: TechnicalSignals;
      reEngagementScore?: number;
      priority?: number;
      notes?: string;
      expiresAt?: Date;
    } = {}
  ): Promise<WatchlistEntry> {
    const submitter = options.submitter || `agent-${this.agentId}`;
    const submitterType = options.submitterType || 'agent';

    // Calculate priority based on confidence and entry type
    let priority = options.priority || 0;
    if (options.confidence) {
      priority = Math.round(options.confidence * 100);
      if (entryType === 're_engagement') priority += 20; // Boost re-engagement opportunities
      if (entryType === 'technical_breakout') priority += 15;
    }

    const entry = await this.prisma.watchlistEntry.upsert({
      where: {
        symbol_submitter: {
          symbol,
          submitter
        }
      },
      update: {
        reason,
        entryType,
        targetEntry: options.targetEntry,
        currentPrice: options.currentPrice,
        confidence: options.confidence,
        signals: options.signals ? JSON.stringify(options.signals) : null,
        reEngagementScore: options.reEngagementScore,
        priority,
        notes: options.notes,
        expiresAt: options.expiresAt,
        status: 'active',
        updatedAt: new Date()
      },
      create: {
        symbol,
        submitter,
        submitterType,
        reason,
        entryType,
        targetEntry: options.targetEntry,
        currentPrice: options.currentPrice,
        confidence: options.confidence,
        signals: options.signals ? JSON.stringify(options.signals) : null,
        reEngagementScore: options.reEngagementScore,
        priority,
        notes: options.notes,
        expiresAt: options.expiresAt,
        status: 'active'
      }
    });

    return this.mapPrismaEntry(entry);
  }

  async analyzeReEngagementOpportunities(): Promise<ReEngagementAnalysis[]> {
    // Get recent closed trades to analyze for re-engagement
    const recentTrades = await this.prisma.trade.findMany({
      where: {
        status: 'closed',
        exitDate: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
        }
      },
      orderBy: {
        exitDate: 'desc'
      },
      take: 50
    });

    const reEngagementAnalyses: ReEngagementAnalysis[] = [];

    for (const trade of recentTrades) {
      // Skip if already in watchlist for re-engagement
      const existingEntry = await this.prisma.watchlistEntry.findFirst({
        where: {
          symbol: trade.symbol,
          entryType: 're_engagement',
          status: 'active'
        }
      });

      if (existingEntry) continue;

      const analysis = await this.calculateReEngagementScore(trade);
      if (analysis.score >= 65) { // High re-engagement score threshold
        reEngagementAnalyses.push(analysis);
      }
    }

    return reEngagementAnalyses.sort((a, b) => b.score - a.score);
  }

  private async calculateReEngagementScore(trade: any): Promise<ReEngagementAnalysis> {
    let score = 0;
    let reason = '';
    let currentSetup = '';
    let improvement = '';

    // Base score factors
    const daysSinceExit = Math.floor((Date.now() - new Date(trade.exitDate).getTime()) / (1000 * 60 * 60 * 24));

    // Time-based scoring (sweet spot: 7-21 days)
    if (daysSinceExit >= 7 && daysSinceExit <= 21) {
      score += 30;
      reason += 'Optimal re-entry timing window; ';
    } else if (daysSinceExit >= 3 && daysSinceExit <= 30) {
      score += 15;
      reason += 'Good re-entry timing; ';
    }

    // Profitability analysis
    if (trade.pnlPercent > 0) {
      score += 25;
      reason += 'Previous profitable exit; ';
      improvement = 'Look for similar entry patterns that led to previous success';
    } else if (trade.pnlPercent > -5) {
      score += 10;
      reason += 'Small previous loss, worth reconsidering; ';
      improvement = 'Analyze what went wrong and look for improved entry';
    }

    // Exit reason analysis
    if (trade.exitReason?.includes('target') || trade.exitReason?.includes('profit')) {
      score += 20;
      currentSetup = 'Previous target hit - look for new setup';
    } else if (trade.exitReason?.includes('stop') && trade.pnlPercent > -3) {
      score += 15;
      currentSetup = 'Previous stop loss triggered - analyze if setup has improved';
    }

    // Recent performance boost
    if (daysSinceExit <= 14 && trade.pnlPercent > 5) {
      score += 15;
      reason += 'Recent strong performance; ';
    }

    // Volatility consideration
    if (trade.pnlPercent > 10 || trade.pnlPercent < -10) {
      score += 10;
      reason += 'High volatility stock - good for re-engagement; ';
    }

    return {
      symbol: trade.symbol,
      score: Math.min(score, 100),
      reason: reason.trim(),
      lastExitPrice: trade.exitPrice,
      lastExitDate: trade.exitDate,
      currentSetup: currentSetup || 'Analyze current technical setup',
      improvement: improvement || 'Review entry/exit strategy based on previous trade'
    };
  }

  async buildAfterHoursWatchlist(
    technicalAnalyses: Array<{
      symbol: string;
      signals: TechnicalSignals;
      confidence: { buy: number; sell: number; hold: number };
    }>
  ): Promise<void> {
    const highConfidenceOpportunities = technicalAnalyses.filter(
      analysis => Math.max(analysis.confidence.buy, analysis.confidence.sell) > 0.65
    );

    for (const analysis of highConfidenceOpportunities) {
      const actionType = analysis.confidence.buy > analysis.confidence.sell ? 'buy' : 'sell';
      const confidence = Math.max(analysis.confidence.buy, analysis.confidence.sell);

      await this.addToWatchlist(
        analysis.symbol,
        `After-hours analysis: ${actionType} signal with ${(confidence * 100).toFixed(1)}% confidence`,
        'new_opportunity',
        {
          confidence,
          signals: analysis.signals,
          priority: Math.round(confidence * 100),
          notes: `RSI: ${(analysis.signals.rsi * 100).toFixed(1)}%, Momentum: ${(analysis.signals.momentum * 100).toFixed(1)}%`,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // Expires in 24 hours
        }
      );
    }

    // Add re-engagement opportunities
    const reEngagementOpportunities = await this.analyzeReEngagementOpportunities();
    for (const opportunity of reEngagementOpportunities.slice(0, 5)) { // Top 5 re-engagement opportunities
      await this.addToWatchlist(
        opportunity.symbol,
        opportunity.reason,
        're_engagement',
        {
          reEngagementScore: opportunity.score,
          priority: Math.round(opportunity.score),
          notes: `${opportunity.currentSetup}. ${opportunity.improvement}`,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Expires in 7 days
        }
      );
    }
  }

  async getWatchlist(options: {
    submitterType?: 'user' | 'agent' | 'system';
    entryType?: string;
    status?: string;
    minConfidence?: number;
    limit?: number;
  } = {}): Promise<WatchlistEntry[]> {
    const where: any = {
      status: options.status || 'active'
    };

    if (options.submitterType) where.submitterType = options.submitterType;
    if (options.entryType) where.entryType = options.entryType;
    if (options.minConfidence) where.confidence = { gte: options.minConfidence };

    const entries = await this.prisma.watchlistEntry.findMany({
      where,
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' }
      ],
      take: options.limit || 50
    });

    return entries.map(entry => this.mapPrismaEntry(entry));
  }

  async updateWatchlistStatus(symbol: string, submitter: string, status: 'triggered' | 'expired' | 'removed'): Promise<void> {
    await this.prisma.watchlistEntry.updateMany({
      where: {
        symbol,
        submitter,
        status: 'active'
      },
      data: {
        status,
        updatedAt: new Date()
      }
    });
  }

  async cleanupExpiredEntries(): Promise<void> {
    await this.prisma.watchlistEntry.updateMany({
      where: {
        expiresAt: {
          lte: new Date()
        },
        status: 'active'
      },
      data: {
        status: 'expired',
        updatedAt: new Date()
      }
    });
  }

  private mapPrismaEntry(entry: any): WatchlistEntry {
    return {
      ...entry,
      signals: entry.signals ? JSON.parse(entry.signals) : undefined
    };
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
