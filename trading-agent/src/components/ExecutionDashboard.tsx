// ExecutionDashboard.tsx
// Advanced dashboard component to visualize slippage and fill% per rung
// Uses Recharts for real-time options execution analytics
// Author: Integration deliverable #3

import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  ComposedChart,
  Area,
  AreaChart
} from 'recharts';

// Interface definitions for metrics data
export interface LadderAttemptData {
  tag: string;
  attemptIndex: number;
  targetNetPrice: number;
  achievedNetPrice: number;
  slippageBps: number;
  filled: boolean;
  filledQty: number;
  timestamp: number;
  strategy?: string;
  symbol?: string;
  reason?: string;
}

export interface RungPerformanceData {
  rung: number;
  totalAttempts: number;
  fillCount: number;
  fillRate: number;
  avgSlippageBps: number;
  medianSlippageBps: number;
  maxSlippageBps: number;
  avgFillTime: number;
}

export interface StrategyMetrics {
  strategy: string;
  totalTrades: number;
  fillRate: number;
  avgSlippageBps: number;
  profitableTrades: number;
  profitFactor: number;
  sharpeRatio: number;
}

export interface ExecutionDashboardProps {
  data: LadderAttemptData[];
  realTimeUpdates?: boolean;
  refreshInterval?: number;
  height?: number;
  theme?: 'light' | 'dark';
}

// Color schemes for different themes
const COLORS = {
  light: {
    primary: '#2563eb',
    secondary: '#7c3aed',
    success: '#16a34a',
    warning: '#ea580c',
    danger: '#dc2626',
    background: '#ffffff',
    text: '#374151',
    grid: '#f3f4f6'
  },
  dark: {
    primary: '#60a5fa',
    secondary: '#a78bfa',
    success: '#4ade80',
    warning: '#fb923c',
    danger: '#f87171',
    background: '#1f2937',
    text: '#f9fafb',
    grid: '#374151'
  }
};

const ExecutionDashboard: React.FC<ExecutionDashboardProps> = ({
  data,
  realTimeUpdates = false,
  refreshInterval = 5000,
  height = 600,
  theme = 'dark'
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'slippage' | 'fills' | 'strategies'>('overview');
  const [selectedTimeRange, setSelectedTimeRange] = useState<'1h' | '4h' | '1d' | '1w'>('4h');
  const [filteredData, setFilteredData] = useState<LadderAttemptData[]>(data);

  const colors = COLORS[theme];

  // Filter data based on time range
  useEffect(() => {
    const now = Date.now();
    let cutoff = now;

    switch (selectedTimeRange) {
      case '1h': cutoff = now - 60 * 60 * 1000; break;
      case '4h': cutoff = now - 4 * 60 * 60 * 1000; break;
      case '1d': cutoff = now - 24 * 60 * 60 * 1000; break;
      case '1w': cutoff = now - 7 * 24 * 60 * 60 * 1000; break;
    }

    setFilteredData(data.filter(d => d.timestamp > cutoff));
  }, [data, selectedTimeRange]);

  // Calculate performance metrics
  const metrics = useMemo(() => {
    const totalAttempts = filteredData.length;
    const filledAttempts = filteredData.filter(d => d.filled).length;
    const fillRate = totalAttempts > 0 ? (filledAttempts / totalAttempts) * 100 : 0;

    const slippages = filteredData.map(d => d.slippageBps).filter(s => s !== undefined);
    const avgSlippage = slippages.length > 0 ? slippages.reduce((a, b) => a + b, 0) / slippages.length : 0;
    const maxSlippage = slippages.length > 0 ? Math.max(...slippages) : 0;

    return {
      totalAttempts,
      filledAttempts,
      fillRate,
      avgSlippage,
      maxSlippage
    };
  }, [filteredData]);

  // Calculate rung performance data
  const rungData = useMemo(() => {
    const rungMap = new Map<number, LadderAttemptData[]>();

    filteredData.forEach(d => {
      if (!rungMap.has(d.attemptIndex)) {
        rungMap.set(d.attemptIndex, []);
      }
      rungMap.get(d.attemptIndex)!.push(d);
    });

    return Array.from(rungMap.entries()).map(([rung, attempts]): RungPerformanceData => {
      const fillCount = attempts.filter(a => a.filled).length;
      const slippages = attempts.map(a => a.slippageBps).filter(s => s !== undefined);

      return {
        rung,
        totalAttempts: attempts.length,
        fillCount,
        fillRate: attempts.length > 0 ? (fillCount / attempts.length) * 100 : 0,
        avgSlippageBps: slippages.length > 0 ? slippages.reduce((a, b) => a + b, 0) / slippages.length : 0,
        medianSlippageBps: slippages.length > 0 ? slippages.sort((a, b) => a - b)[Math.floor(slippages.length / 2)] : 0,
        maxSlippageBps: slippages.length > 0 ? Math.max(...slippages) : 0,
        avgFillTime: 0 // Would need timing data
      };
    });
  }, [filteredData]);

  // Time series data for slippage tracking
  const timeSeriesData = useMemo(() => {
    return filteredData
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((d, index) => ({
        index,
        timestamp: new Date(d.timestamp).toLocaleTimeString(),
        slippage: d.slippageBps,
        filled: d.filled,
        netPrice: d.achievedNetPrice,
        targetNetPrice: d.targetNetPrice
      }));
  }, [filteredData]);

  // Custom tooltip component
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className={`p-3 rounded-lg shadow-lg border ${theme === 'dark' ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-300'}`}>
          <p className="font-semibold">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }}>
              {entry.name}: {typeof entry.value === 'number' ? entry.value.toFixed(2) : entry.value}
              {entry.name.includes('Slippage') && 'bps'}
              {entry.name.includes('Rate') && '%'}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const renderOverviewTab = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Key Metrics Cards */}
      <div className="grid grid-cols-2 gap-4 lg:col-span-2">
        <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} shadow`}>
          <h3 className="text-sm font-medium text-gray-500">Fill Rate</h3>
          <p className="text-2xl font-bold" style={{ color: colors.success }}>
            {metrics.fillRate.toFixed(1)}%
          </p>
        </div>
        <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} shadow`}>
          <h3 className="text-sm font-medium text-gray-500">Avg Slippage</h3>
          <p className="text-2xl font-bold" style={{ color: colors.warning }}>
            {metrics.avgSlippage.toFixed(1)} bps
          </p>
        </div>
        <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} shadow`}>
          <h3 className="text-sm font-medium text-gray-500">Total Attempts</h3>
          <p className="text-2xl font-bold" style={{ color: colors.primary }}>
            {metrics.totalAttempts}
          </p>
        </div>
        <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} shadow`}>
          <h3 className="text-sm font-medium text-gray-500">Max Slippage</h3>
          <p className="text-2xl font-bold" style={{ color: colors.danger }}>
            {metrics.maxSlippage.toFixed(1)} bps
          </p>
        </div>
      </div>

      {/* Fill Rate by Rung */}
      <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} shadow`}>
        <h3 className="text-lg font-semibold mb-4">Fill Rate by Rung</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={rungData}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
            <XAxis dataKey="rung" stroke={colors.text} />
            <YAxis stroke={colors.text} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="fillRate" fill={colors.success} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Slippage Distribution */}
      <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} shadow`}>
        <h3 className="text-lg font-semibold mb-4">Slippage by Rung</h3>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={rungData}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
            <XAxis dataKey="rung" stroke={colors.text} />
            <YAxis stroke={colors.text} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="avgSlippageBps" fill={colors.warning} name="Avg Slippage" />
            <Line type="monotone" dataKey="maxSlippageBps" stroke={colors.danger} name="Max Slippage" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  const renderSlippageTab = () => (
    <div className="space-y-6">
      {/* Time Series Slippage */}
      <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} shadow`}>
        <h3 className="text-lg font-semibold mb-4">Slippage Over Time</h3>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={timeSeriesData}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
            <XAxis dataKey="timestamp" stroke={colors.text} />
            <YAxis stroke={colors.text} />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="slippage"
              stroke={colors.warning}
              strokeWidth={2}
              dot={{ fill: colors.warning, strokeWidth: 2, r: 4 }}
              name="Slippage (bps)"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Slippage vs Target Price */}
      <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} shadow`}>
        <h3 className="text-lg font-semibold mb-4">Slippage vs Net Price</h3>
        <ResponsiveContainer width="100%" height={400}>
          <ScatterChart data={timeSeriesData}>
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
            <XAxis dataKey="netPrice" stroke={colors.text} name="Net Price" />
            <YAxis dataKey="slippage" stroke={colors.text} name="Slippage (bps)" />
            <Tooltip content={<CustomTooltip />} />
            <Scatter dataKey="slippage" fill={colors.primary} name="Attempts">
              {timeSeriesData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.filled ? colors.success : colors.danger} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  const renderFillsTab = () => {
    const fillData = [
      { name: 'Filled', value: metrics.filledAttempts, color: colors.success },
      { name: 'Unfilled', value: metrics.totalAttempts - metrics.filledAttempts, color: colors.danger }
    ];

    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Fill Rate Pie Chart */}
        <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} shadow`}>
          <h3 className="text-lg font-semibold mb-4">Fill Rate Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={fillData}
                cx="50%"
                cy="50%"
                outerRadius={100}
                dataKey="value"
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
              >
                {fillData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Fill Performance by Time */}
        <div className={`p-4 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-white'} shadow`}>
          <h3 className="text-lg font-semibold mb-4">Fill Rate Trend</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={timeSeriesData}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
              <XAxis dataKey="timestamp" stroke={colors.text} />
              <YAxis stroke={colors.text} />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="filled"
                stroke={colors.success}
                fill={colors.success}
                fillOpacity={0.6}
                name="Fill Status"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  return (
    <div className={`w-full ${theme === 'dark' ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between p-6 border-b border-gray-200">
        <div>
          <h1 className="text-2xl font-bold">Execution Dashboard</h1>
          <p className="text-gray-500 mt-1">Real-time options execution analytics</p>
        </div>

        {/* Time Range Selector */}
        <div className="flex space-x-2 mt-4 lg:mt-0">
          {['1h', '4h', '1d', '1w'].map((range) => (
            <button
              key={range}
              onClick={() => setSelectedTimeRange(range as any)}
              className={`px-3 py-1 rounded-md text-sm font-medium ${
                selectedTimeRange === range
                  ? `bg-blue-600 text-white`
                  : `${theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-white hover:bg-gray-100'} border`
              }`}
            >
              {range.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8 px-6" aria-label="Tabs">
          {[
            { key: 'overview', label: 'Overview' },
            { key: 'slippage', label: 'Slippage Analysis' },
            { key: 'fills', label: 'Fill Analysis' },
            { key: 'strategies', label: 'Strategy Performance' }
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="p-6" style={{ minHeight: height }}>
        {activeTab === 'overview' && renderOverviewTab()}
        {activeTab === 'slippage' && renderSlippageTab()}
        {activeTab === 'fills' && renderFillsTab()}
        {activeTab === 'strategies' && (
          <div className="text-center py-12">
            <p className="text-gray-500">Strategy performance analysis coming soon...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ExecutionDashboard;
