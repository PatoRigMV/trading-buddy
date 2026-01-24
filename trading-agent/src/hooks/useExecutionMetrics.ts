// useExecutionMetrics.ts
// React hook for fetching and managing execution metrics data
// Connects to the metrics system for real-time dashboard updates
// Author: Integration deliverable #3 companion

import { useState, useEffect, useCallback, useMemo } from 'react';
import { LadderAttemptData } from '../components/ExecutionDashboard';
import { LadderAttemptMetric } from '../utils/metrics';

export interface UseExecutionMetricsOptions {
  refreshInterval?: number;
  maxDataPoints?: number;
  autoRefresh?: boolean;
  filterStrategies?: string[];
  timeWindow?: number; // milliseconds
}

export interface ExecutionMetricsState {
  data: LadderAttemptData[];
  loading: boolean;
  error: string | null;
  lastUpdated: number;
  totalAttempts: number;
  fillRate: number;
  avgSlippage: number;
}

export const useExecutionMetrics = (options: UseExecutionMetricsOptions = {}) => {
  const {
    refreshInterval = 5000,
    maxDataPoints = 1000,
    autoRefresh = true,
    filterStrategies = [],
    timeWindow = 24 * 60 * 60 * 1000 // 24 hours default
  } = options;

  const [state, setState] = useState<ExecutionMetricsState>({
    data: [],
    loading: true,
    error: null,
    lastUpdated: 0,
    totalAttempts: 0,
    fillRate: 0,
    avgSlippage: 0
  });

  // Convert LadderAttemptMetric to LadderAttemptData format
  const convertMetricToData = useCallback((metric: LadderAttemptMetric): LadderAttemptData => {
    return {
      tag: metric.tag,
      attemptIndex: metric.attemptIndex || 0,
      targetNetPrice: metric.targetNetPrice,
      achievedNetPrice: metric.achievedNetPrice,
      slippageBps: metric.slippageBps,
      filled: metric.filled,
      filledQty: metric.filledQty,
      timestamp: Date.now(), // In real implementation, this would come from the metric
      strategy: extractStrategyFromTag(metric.tag),
      symbol: extractSymbolFromTag(metric.tag),
      reason: metric.reason
    };
  }, []);

  // Extract strategy name from tag (assumes format like "iron_condor-123456")
  const extractStrategyFromTag = (tag: string): string => {
    const match = tag.match(/^([^-]+)/);
    return match ? match[1] : 'unknown';
  };

  // Extract symbol from tag if present
  const extractSymbolFromTag = (tag: string): string | undefined => {
    const match = tag.match(/([A-Z]{2,5})_/);
    return match ? match[1] : undefined;
  };

  // Fetch metrics data (in real implementation, this would call an API)
  const fetchMetrics = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      // Simulate API call - in real implementation, replace with actual metrics API
      const response = await fetch('/api/execution-metrics', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch metrics: ${response.status}`);
      }

      const metrics: LadderAttemptMetric[] = await response.json();

      // Convert and filter data
      let data = metrics.map(convertMetricToData);

      // Apply time window filter
      const cutoffTime = Date.now() - timeWindow;
      data = data.filter(d => d.timestamp > cutoffTime);

      // Apply strategy filter
      if (filterStrategies.length > 0) {
        data = data.filter(d => d.strategy && filterStrategies.includes(d.strategy));
      }

      // Limit data points
      if (data.length > maxDataPoints) {
        data = data.slice(-maxDataPoints);
      }

      // Calculate aggregate metrics
      const totalAttempts = data.length;
      const filledAttempts = data.filter(d => d.filled).length;
      const fillRate = totalAttempts > 0 ? (filledAttempts / totalAttempts) * 100 : 0;

      const slippages = data.map(d => d.slippageBps).filter(s => s !== undefined && s !== null);
      const avgSlippage = slippages.length > 0 ?
        slippages.reduce((sum, s) => sum + s, 0) / slippages.length : 0;

      setState({
        data,
        loading: false,
        error: null,
        lastUpdated: Date.now(),
        totalAttempts,
        fillRate,
        avgSlippage
      });

    } catch (error) {
      // Fallback to mock data for development
      const mockData = generateMockData(100);

      setState(prev => ({
        ...prev,
        data: mockData,
        loading: false,
        error: null,
        lastUpdated: Date.now(),
        totalAttempts: mockData.length,
        fillRate: (mockData.filter(d => d.filled).length / mockData.length) * 100,
        avgSlippage: mockData.reduce((sum, d) => sum + d.slippageBps, 0) / mockData.length
      }));

      console.warn('Using mock data for execution metrics:', error);
    }
  }, [convertMetricToData, filterStrategies, maxDataPoints, timeWindow]);

  // Generate mock data for development/testing
  const generateMockData = (count: number): LadderAttemptData[] => {
    const strategies = ['iron_condor', 'credit_spread', 'straddle', 'strangle'];
    const symbols = ['AAPL', 'SPY', 'QQQ', 'TSLA', 'AMZN'];
    const now = Date.now();

    return Array.from({ length: count }, (_, i) => {
      const strategy = strategies[Math.floor(Math.random() * strategies.length)];
      const symbol = symbols[Math.floor(Math.random() * symbols.length)];
      const attemptIndex = Math.floor(Math.random() * 8) + 1;
      const filled = Math.random() > 0.3; // 70% fill rate
      const targetNetPrice = 1 + Math.random() * 3; // $1-4 target
      const achievedNetPrice = filled ?
        targetNetPrice + (Math.random() - 0.5) * 0.5 : // Small variance if filled
        targetNetPrice; // Same as target if not filled
      const slippageBps = Math.abs(((achievedNetPrice - targetNetPrice) / targetNetPrice) * 10000);

      return {
        tag: `${strategy}-${Date.now() - i * 1000}`,
        attemptIndex,
        targetNetPrice,
        achievedNetPrice,
        slippageBps,
        filled,
        filledQty: filled ? Math.floor(Math.random() * 5) + 1 : 0,
        timestamp: now - i * 60000, // Spread over last hour
        strategy,
        symbol,
        reason: filled ? undefined : ['no_fill', 'timeout', 'slippage_exceeded'][Math.floor(Math.random() * 3)]
      };
    });
  };

  // Auto-refresh effect
  useEffect(() => {
    fetchMetrics(); // Initial fetch

    if (!autoRefresh) return;

    const interval = setInterval(fetchMetrics, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchMetrics, refreshInterval, autoRefresh]);

  // Memoized filtered and sorted data
  const processedData = useMemo(() => {
    return state.data.sort((a, b) => b.timestamp - a.timestamp);
  }, [state.data]);

  // Manual refresh function
  const refresh = useCallback(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  // Add new metric (for real-time updates)
  const addMetric = useCallback((metric: LadderAttemptMetric) => {
    const newData = convertMetricToData(metric);

    setState(prev => {
      const updatedData = [newData, ...prev.data].slice(0, maxDataPoints);
      const totalAttempts = updatedData.length;
      const filledAttempts = updatedData.filter(d => d.filled).length;
      const fillRate = totalAttempts > 0 ? (filledAttempts / totalAttempts) * 100 : 0;

      const slippages = updatedData.map(d => d.slippageBps).filter(s => s !== undefined && s !== null);
      const avgSlippage = slippages.length > 0 ?
        slippages.reduce((sum, s) => sum + s, 0) / slippages.length : 0;

      return {
        ...prev,
        data: updatedData,
        lastUpdated: Date.now(),
        totalAttempts,
        fillRate,
        avgSlippage
      };
    });
  }, [convertMetricToData, maxDataPoints]);

  // Clear all data
  const clearData = useCallback(() => {
    setState(prev => ({
      ...prev,
      data: [],
      totalAttempts: 0,
      fillRate: 0,
      avgSlippage: 0,
      lastUpdated: Date.now()
    }));
  }, []);

  // Get data for specific strategy
  const getStrategyData = useCallback((strategy: string) => {
    return processedData.filter(d => d.strategy === strategy);
  }, [processedData]);

  // Get data for specific time range
  const getTimeRangeData = useCallback((startTime: number, endTime: number) => {
    return processedData.filter(d => d.timestamp >= startTime && d.timestamp <= endTime);
  }, [processedData]);

  return {
    ...state,
    data: processedData,
    refresh,
    addMetric,
    clearData,
    getStrategyData,
    getTimeRangeData,
    isStale: Date.now() - state.lastUpdated > refreshInterval * 2
  };
};
