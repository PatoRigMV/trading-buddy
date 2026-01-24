import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

export default prisma;

// Database service functions

export class DatabaseService {
  static async recordDecision(
    symbol: string,
    decision: string,
    reason: string,
    confidence: any,
    signals: any,
    state: string,
    orderId?: string,
    price?: number,
    quantity?: number
  ) {
    return prisma.decision.create({
      data: {
        symbol,
        timestamp: new Date(),
        state,
        decision,
        reason,
        confidence,
        signals,
        orderId,
        price,
        quantity
      }
    });
  }

  static async recordTrade(
    symbol: string,
    side: string,
    quantity: number,
    entryPrice: number,
    entryOrderId?: string,
    stopLoss?: number,
    targetPrice?: number
  ) {
    return prisma.trade.create({
      data: {
        symbol,
        side,
        quantity,
        entryPrice,
        entryDate: new Date(),
        status: 'open',
        entryOrderId,
        stopLoss,
        targetPrice
      }
    });
  }

  static async closeTrade(
    tradeId: string,
    exitPrice: number,
    exitReason: string,
    exitOrderId?: string
  ) {
    const trade = await prisma.trade.findUnique({
      where: { id: tradeId }
    });

    if (!trade) {
      throw new Error(`Trade ${tradeId} not found`);
    }

    const pnl = (exitPrice - trade.entryPrice) * trade.quantity * (trade.side === 'buy' ? 1 : -1);
    const pnlPercent = (pnl / (trade.entryPrice * trade.quantity)) * 100;

    return prisma.trade.update({
      where: { id: tradeId },
      data: {
        exitPrice,
        exitDate: new Date(),
        pnl,
        pnlPercent,
        status: 'closed',
        exitReason,
        exitOrderId
      }
    });
  }

  static async recordOrder(
    brokerOrderId: string,
    symbol: string,
    side: string,
    quantity: number,
    orderType: string,
    status: string,
    submittedAt: Date,
    limitPrice?: number,
    stopPrice?: number
  ) {
    return prisma.order.create({
      data: {
        brokerOrderId,
        symbol,
        side,
        quantity,
        orderType,
        status,
        limitPrice,
        stopPrice,
        submittedAt
      }
    });
  }

  static async updateOrderFill(
    brokerOrderId: string,
    filledQty: number,
    avgFillPrice: number,
    status: string,
    filledAt?: Date
  ) {
    return prisma.order.update({
      where: { brokerOrderId },
      data: {
        filledQty,
        avgFillPrice,
        status,
        filledAt
      }
    });
  }

  static async recordPortfolioSnapshot(
    totalValue: number,
    cash: number,
    equity: number,
    unrealizedPnL: number,
    realizedPnL: number,
    dayPnL: number,
    positions: any[]
  ) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return prisma.portfolio.upsert({
      where: { date: today },
      update: {
        totalValue,
        cash,
        equity,
        unrealizedPnL,
        realizedPnL,
        dayPnL,
        positions: JSON.stringify(positions)
      },
      create: {
        date: today,
        totalValue,
        cash,
        equity,
        unrealizedPnL,
        realizedPnL,
        dayPnL,
        positions: JSON.stringify(positions)
      }
    });
  }

  static async recordStateTransition(
    symbol: string,
    fromState: string,
    toState: string,
    reason: string
  ) {
    return prisma.stateTransition.create({
      data: {
        symbol,
        fromState,
        toState,
        reason,
        timestamp: new Date()
      }
    });
  }

  static async calculateAndRecordPerformance() {
    const trades = await prisma.trade.findMany({
      where: { status: 'closed' }
    });

    if (trades.length === 0) {
      return null;
    }

    const totalTrades = trades.length;
    const winningTrades = trades.filter(t => (t.pnl || 0) > 0);
    const losingTrades = trades.filter(t => (t.pnl || 0) < 0);

    const totalReturn = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const winRate = (winningTrades.length / totalTrades) * 100;

    const avgWin = winningTrades.length > 0
      ? winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) / winningTrades.length
      : 0;

    const avgLoss = losingTrades.length > 0
      ? Math.abs(losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) / losingTrades.length)
      : 0;

    const totalWins = winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0));
    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : 0;

    // Calculate max drawdown from portfolio snapshots
    const portfolioData = await prisma.portfolio.findMany({
      orderBy: { date: 'asc' }
    });

    let maxDrawdown = 0;
    if (portfolioData.length > 1) {
      let peak = portfolioData[0].totalValue;
      for (const snapshot of portfolioData) {
        if (snapshot.totalValue > peak) {
          peak = snapshot.totalValue;
        }
        const drawdown = (peak - snapshot.totalValue) / peak * 100;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }
      }
    }

    // Simplified Sharpe ratio calculation
    const dailyReturns = portfolioData
      .slice(1)
      .map((snapshot, i) =>
        (snapshot.totalValue - portfolioData[i].totalValue) / portfolioData[i].totalValue
      );

    let sharpeRatio = 0;
    if (dailyReturns.length > 1) {
      const avgReturn = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;
      const variance = dailyReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / dailyReturns.length;
      const stdDev = Math.sqrt(variance);
      sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // Annualized
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return prisma.performance.upsert({
      where: { date: today },
      update: {
        totalReturn,
        sharpeRatio,
        maxDrawdown,
        winRate,
        totalTrades,
        winningTrades: winningTrades.length,
        losingTrades: losingTrades.length,
        avgWin,
        avgLoss,
        profitFactor
      },
      create: {
        date: today,
        totalReturn,
        sharpeRatio,
        maxDrawdown,
        winRate,
        totalTrades,
        winningTrades: winningTrades.length,
        losingTrades: losingTrades.length,
        avgWin,
        avgLoss,
        profitFactor
      }
    });
  }

  // Query methods
  static async getDecisions(symbol?: string, limit: number = 100) {
    return prisma.decision.findMany({
      where: symbol ? { symbol } : undefined,
      orderBy: { timestamp: 'desc' },
      take: limit
    });
  }

  static async getOpenTrades(symbol?: string) {
    return prisma.trade.findMany({
      where: {
        status: 'open',
        ...(symbol && { symbol })
      },
      orderBy: { entryDate: 'desc' }
    });
  }

  static async getTradeHistory(symbol?: string, limit: number = 100) {
    return prisma.trade.findMany({
      where: symbol ? { symbol } : undefined,
      orderBy: { entryDate: 'desc' },
      take: limit
    });
  }

  static async getPortfolioHistory(days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return prisma.portfolio.findMany({
      where: {
        date: { gte: startDate }
      },
      orderBy: { date: 'asc' }
    });
  }

  static async getPerformanceMetrics(days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return prisma.performance.findMany({
      where: {
        date: { gte: startDate }
      },
      orderBy: { date: 'desc' }
    });
  }

  static async cleanup(daysToKeep: number = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    // Clean up old decisions
    const deletedDecisions = await prisma.decision.deleteMany({
      where: {
        timestamp: { lt: cutoffDate }
      }
    });

    // Clean up old state transitions
    const deletedTransitions = await prisma.stateTransition.deleteMany({
      where: {
        timestamp: { lt: cutoffDate }
      }
    });

    return {
      deletedDecisions: deletedDecisions.count,
      deletedTransitions: deletedTransitions.count
    };
  }
}
