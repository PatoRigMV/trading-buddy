import { EventEmitter } from 'events';
import { OptionsData, VolatilitySurface, GreeksSnapshot } from '../types/options';
import { InstitutionalOptionsData } from '../data/InstitutionalOptionsData';
import { VolatilitySurfaceEngine } from '../engine/VolatilitySurfaceEngine';
import { InstitutionalOptionsAnalyzer } from '../engine/InstitutionalOptionsAnalyzer';
import { SmartOptionsExecutor } from '../execution/SmartOptionsExecutor';
import { RealTimeOptionsRiskManager } from '../risk/RealTimeOptionsRiskManager';

export interface ObservabilityMetrics {
  system: SystemMetrics;
  trading: TradingMetrics;
  risk: RiskMetrics;
  market: MarketMetrics;
  performance: PerformanceMetrics;
  latency: LatencyMetrics;
  errors: ErrorMetrics;
}

export interface SystemMetrics {
  uptime: number;
  memoryUsage: MemoryUsage;
  cpuUsage: number;
  diskUsage: DiskUsage;
  networkUsage: NetworkUsage;
  processHealth: ProcessHealth[];
}

export interface MemoryUsage {
  used: number;
  free: number;
  total: number;
  percentage: number;
  heap: HeapUsage;
}

export interface HeapUsage {
  used: number;
  total: number;
  limit: number;
}

export interface DiskUsage {
  used: number;
  free: number;
  total: number;
  percentage: number;
}

export interface NetworkUsage {
  bytesIn: number;
  bytesOut: number;
  packetsIn: number;
  packetsOut: number;
  connectionsActive: number;
}

export interface ProcessHealth {
  name: string;
  pid: number;
  status: 'running' | 'stopped' | 'error';
  uptime: number;
  memoryUsage: number;
  cpuUsage: number;
  lastHeartbeat: Date;
}

export interface TradingMetrics {
  positions: PositionMetrics;
  orders: OrderMetrics;
  execution: ExecutionMetrics;
  pnl: PnLMetrics;
  volume: VolumeMetrics;
}

export interface PositionMetrics {
  total: number;
  long: number;
  short: number;
  multiLeg: number;
  expiringToday: number;
  expiringThisWeek: number;
  itm: number;
  otm: number;
  atm: number;
  averageDte: number;
  concentrationRisk: ConcentrationRisk;
}

export interface ConcentrationRisk {
  bySymbol: Map<string, number>;
  byExpiration: Map<string, number>;
  byStrike: Map<number, number>;
  byStrategy: Map<string, number>;
}

export interface OrderMetrics {
  submitted: number;
  filled: number;
  cancelled: number;
  rejected: number;
  pending: number;
  fillRate: number;
  averageFillTime: number;
  slippage: SlippageMetrics;
}

export interface SlippageMetrics {
  average: number;
  median: number;
  max: number;
  min: number;
  byOrderSize: Map<string, number>;
  byVolatility: Map<string, number>;
}

export interface ExecutionMetrics {
  latency: LatencyBreakdown;
  throughput: ThroughputMetrics;
  quality: ExecutionQuality;
  venues: VenueMetrics[];
}

export interface LatencyBreakdown {
  orderEntry: number;
  orderRouting: number;
  venueProcessing: number;
  fillConfirmation: number;
  totalLatency: number;
}

export interface ThroughputMetrics {
  ordersPerSecond: number;
  messagesPerSecond: number;
  peakThroughput: number;
  averageThroughput: number;
}

export interface ExecutionQuality {
  priceImprovement: number;
  marketImpact: number;
  implementationShortfall: number;
  vwapDeviation: number;
}

export interface VenueMetrics {
  name: string;
  fillRate: number;
  averageLatency: number;
  marketShare: number;
  qualityScore: number;
  errors: number;
}

export interface PnLMetrics {
  realized: number;
  unrealized: number;
  total: number;
  daily: number;
  weekly: number;
  monthly: number;
  ytd: number;
  maxDrawdown: number;
  sharpeRatio: number;
  attribution: PnLAttribution;
}

export interface PnLAttribution {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  carry: number;
  trading: number;
}

export interface VolumeMetrics {
  contracts: number;
  notional: number;
  premium: number;
  bySymbol: Map<string, VolumeData>;
  byStrategy: Map<string, VolumeData>;
  byVenue: Map<string, VolumeData>;
}

export interface VolumeData {
  contracts: number;
  notional: number;
  premium: number;
  trades: number;
}

export interface RiskMetrics {
  exposure: ExposureMetrics;
  limits: LimitMetrics;
  var: VarMetrics;
  stress: StressMetrics;
  liquidity: LiquidityMetrics;
}

export interface ExposureMetrics {
  grossExposure: number;
  netExposure: number;
  leverageRatio: number;
  greeks: GreeksExposure;
  sector: Map<string, number>;
  geography: Map<string, number>;
}

export interface GreeksExposure {
  delta: GreeksBreakdown;
  gamma: GreeksBreakdown;
  theta: GreeksBreakdown;
  vega: GreeksBreakdown;
  rho: GreeksBreakdown;
}

export interface GreeksBreakdown {
  total: number;
  bySymbol: Map<string, number>;
  byExpiration: Map<string, number>;
  byStrategy: Map<string, number>;
  percentage: number;
  limit: number;
  utilizationRatio: number;
}

export interface LimitMetrics {
  utilizationRatio: number;
  breaches: LimitBreach[];
  warnings: LimitWarning[];
  capacity: LimitCapacity;
}

export interface LimitBreach {
  type: string;
  value: number;
  limit: number;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  resolved: boolean;
}

export interface LimitWarning {
  type: string;
  value: number;
  threshold: number;
  timestamp: Date;
  acknowledged: boolean;
}

export interface LimitCapacity {
  used: number;
  available: number;
  total: number;
  percentage: number;
}

export interface VarMetrics {
  var95: number;
  var99: number;
  cvar95: number;
  cvar99: number;
  confidence: number;
  horizon: number;
  components: VarComponents;
}

export interface VarComponents {
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  correlation: number;
  residual: number;
}

export interface StressMetrics {
  scenarios: StressScenario[];
  worstCase: number;
  tailRisk: number;
  concentration: number;
}

export interface StressScenario {
  name: string;
  description: string;
  pnlImpact: number;
  probability: number;
  severity: 'low' | 'medium' | 'high' | 'extreme';
}

export interface LiquidityMetrics {
  liquidityScore: number;
  timeToLiquidate: number;
  liquidationCost: number;
  marketImpact: number;
  bidAskSpreads: Map<string, number>;
}

export interface MarketMetrics {
  volatility: VolatilityMetrics;
  correlation: CorrelationMetrics;
  flows: FlowMetrics;
  sentiment: SentimentMetrics;
  regime: RegimeMetrics;
}

export interface VolatilityMetrics {
  impliedVol: VolMetrics;
  realizedVol: VolMetrics;
  volOfVol: number;
  skew: SkewMetrics;
  term: TermMetrics;
  surface: SurfaceMetrics;
}

export interface VolMetrics {
  level: number;
  percentile: number;
  zScore: number;
  trend: 'up' | 'down' | 'stable';
  momentum: number;
}

export interface SkewMetrics {
  putCallSkew: number;
  riskReversal: Map<number, number>;
  butterfly: Map<number, number>;
  slope: number;
}

export interface TermMetrics {
  termStructure: Map<number, number>;
  contango: number;
  backwardation: number;
  rolldown: number;
}

export interface SurfaceMetrics {
  quality: number;
  arbitrageOpportunities: ArbitrageOpportunity[];
  calibrationError: number;
  staleness: number;
}

export interface ArbitrageOpportunity {
  type: 'calendar' | 'vertical' | 'butterfly' | 'box';
  strikes: number[];
  expirations: Date[];
  profit: number;
  confidence: number;
}

export interface CorrelationMetrics {
  average: number;
  range: CorrelationRange;
  breakdown: Map<string, number>;
  regime: CorrelationRegime;
}

export interface CorrelationRange {
  min: number;
  max: number;
  percentile25: number;
  percentile75: number;
}

export interface CorrelationRegime {
  current: 'low' | 'medium' | 'high';
  stability: number;
  changeProb: number;
}

export interface FlowMetrics {
  optionFlow: OptionFlow;
  darkPool: DarkPoolFlow;
  institutional: InstitutionalFlow;
  retail: RetailFlow;
}

export interface OptionFlow {
  callVolume: number;
  putVolume: number;
  putCallRatio: number;
  unusualActivity: UnusualActivity[];
  gex: number;
  dex: number;
}

export interface UnusualActivity {
  symbol: string;
  optionType: 'call' | 'put';
  strike: number;
  expiration: Date;
  volume: number;
  openInterest: number;
  premium: number;
  sentiment: 'bullish' | 'bearish' | 'neutral';
}

export interface DarkPoolFlow {
  volume: number;
  percentage: number;
  averageSize: number;
  sentiment: 'bullish' | 'bearish' | 'neutral';
}

export interface InstitutionalFlow {
  volume: number;
  direction: 'buying' | 'selling' | 'neutral';
  blockTrades: number;
  sweeps: number;
}

export interface RetailFlow {
  volume: number;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  activity: 'high' | 'medium' | 'low';
}

export interface SentimentMetrics {
  putCallRatio: number;
  vixLevel: number;
  fearGreedIndex: number;
  newssentiment: NewsSentiment;
  socialSentiment: SocialSentiment;
}

export interface NewsSentiment {
  score: number;
  articles: number;
  positive: number;
  negative: number;
  neutral: number;
}

export interface SocialSentiment {
  score: number;
  mentions: number;
  trending: string[];
  sentiment: 'bullish' | 'bearish' | 'neutral';
}

export interface RegimeMetrics {
  current: MarketRegime;
  stability: number;
  transitionProb: RegimeTransition[];
}

export interface MarketRegime {
  type: 'bull' | 'bear' | 'sideways' | 'volatile';
  confidence: number;
  duration: number;
  characteristics: RegimeCharacteristics;
}

export interface RegimeCharacteristics {
  volatility: 'low' | 'medium' | 'high';
  trend: 'up' | 'down' | 'sideways';
  correlation: 'low' | 'medium' | 'high';
}

export interface RegimeTransition {
  from: string;
  to: string;
  probability: number;
  trigger: string;
}

export interface PerformanceMetrics {
  returns: ReturnMetrics;
  risk: PerformanceRisk;
  attribution: PerformanceAttribution;
  benchmark: BenchmarkMetrics;
}

export interface ReturnMetrics {
  total: number;
  annualized: number;
  daily: number[];
  monthly: number[];
  rolling: RollingMetrics;
}

export interface RollingMetrics {
  week: number;
  month: number;
  quarter: number;
  year: number;
}

export interface PerformanceRisk {
  volatility: number;
  sharpe: number;
  sortino: number;
  calmar: number;
  maxDrawdown: number;
  var: number;
}

export interface PerformanceAttribution {
  alpha: number;
  beta: number;
  tracking: number;
  information: number;
  sectors: Map<string, number>;
  factors: Map<string, number>;
}

export interface BenchmarkMetrics {
  correlation: number;
  beta: number;
  alpha: number;
  trackingError: number;
  informationRatio: number;
  activeReturn: number;
}

export interface LatencyMetrics {
  averageLatency: number;
  p95Latency: number;
  p99Latency: number;
  maxLatency: number;
  breakdown: LatencyBreakdown;
  trends: LatencyTrends;
}

export interface LatencyTrends {
  hourly: number[];
  daily: number[];
  weekly: number[];
}

export interface ErrorMetrics {
  total: number;
  rate: number;
  byType: Map<string, number>;
  bySystem: Map<string, number>;
  severity: ErrorSeverity;
  recent: RecentError[];
}

export interface ErrorSeverity {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface RecentError {
  timestamp: Date;
  type: string;
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  system: string;
  resolved: boolean;
}

export interface Alert {
  id: string;
  timestamp: Date;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  data: any;
  acknowledged: boolean;
  resolved: boolean;
  actions: AlertAction[];
}

export type AlertType =
  | 'risk_limit_breach'
  | 'position_concentration'
  | 'volatility_spike'
  | 'execution_latency'
  | 'system_error'
  | 'market_anomaly'
  | 'performance_degradation'
  | 'connectivity_issue';

export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface AlertAction {
  type: 'hedge' | 'reduce' | 'close' | 'notify' | 'investigate';
  description: string;
  automated: boolean;
  executed: boolean;
  timestamp?: Date;
}

export interface Dashboard {
  id: string;
  name: string;
  widgets: Widget[];
  layout: DashboardLayout;
  refreshRate: number;
  filters: DashboardFilter[];
}

export interface Widget {
  id: string;
  type: WidgetType;
  title: string;
  data: any;
  config: WidgetConfig;
  position: WidgetPosition;
}

export type WidgetType =
  | 'pnl_chart'
  | 'greeks_summary'
  | 'position_heatmap'
  | 'risk_gauge'
  | 'vol_surface'
  | 'alerts_list'
  | 'performance_metrics'
  | 'latency_chart'
  | 'market_data';

export interface WidgetConfig {
  timeframe: string;
  symbols?: string[];
  aggregation?: string;
  chart?: ChartConfig;
}

export interface ChartConfig {
  type: 'line' | 'bar' | 'heatmap' | 'gauge' | 'table';
  xAxis?: string;
  yAxis?: string;
  colors?: string[];
}

export interface WidgetPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DashboardLayout {
  rows: number;
  columns: number;
  responsive: boolean;
}

export interface DashboardFilter {
  type: string;
  value: any;
  operator: 'equals' | 'contains' | 'greater' | 'less';
}

export class OptionsObservabilityEngine extends EventEmitter {
  private metrics: ObservabilityMetrics;
  private alerts: Alert[] = [];
  private dashboards: Map<string, Dashboard> = new Map();
  private dataRetention: Map<string, any[]> = new Map();

  private dataProvider: InstitutionalOptionsData;
  private volSurfaceEngine: VolatilitySurfaceEngine;
  private analyzer: InstitutionalOptionsAnalyzer;
  private executor: SmartOptionsExecutor;
  private riskManager: RealTimeOptionsRiskManager;

  private metricsInterval: NodeJS.Timeout | null = null;
  private alertsQueue: Alert[] = [];
  private isRunning = false;

  constructor(
    dataProvider: InstitutionalOptionsData,
    volSurfaceEngine: VolatilitySurfaceEngine,
    analyzer: InstitutionalOptionsAnalyzer,
    executor: SmartOptionsExecutor,
    riskManager: RealTimeOptionsRiskManager
  ) {
    super();
    this.dataProvider = dataProvider;
    this.volSurfaceEngine = volSurfaceEngine;
    this.analyzer = analyzer;
    this.executor = executor;
    this.riskManager = riskManager;

    this.initializeMetrics();
    this.setupDefaultDashboards();
    this.setupEventListeners();
  }

  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.startMetricsCollection();
    this.startAlertsProcessing();

    this.emit('observabilityStarted');
  }

  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }

    this.emit('observabilityStopped');
  }

  getMetrics(): ObservabilityMetrics {
    return { ...this.metrics };
  }

  getAlerts(filters?: AlertFilters): Alert[] {
    let alerts = [...this.alerts];

    if (filters) {
      if (filters.type) {
        alerts = alerts.filter(a => a.type === filters.type);
      }
      if (filters.severity) {
        alerts = alerts.filter(a => a.severity === filters.severity);
      }
      if (filters.unacknowledged) {
        alerts = alerts.filter(a => !a.acknowledged);
      }
      if (filters.unresolved) {
        alerts = alerts.filter(a => !a.resolved);
      }
      if (filters.since) {
        alerts = alerts.filter(a => a.timestamp >= filters.since!);
      }
    }

    return alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert && !alert.acknowledged) {
      alert.acknowledged = true;
      this.emit('alertAcknowledged', alert);
      return true;
    }
    return false;
  }

  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      this.emit('alertResolved', alert);
      return true;
    }
    return false;
  }

  createCustomDashboard(config: Partial<Dashboard>): string {
    const dashboard: Dashboard = {
      id: this.generateId(),
      name: config.name || 'Custom Dashboard',
      widgets: config.widgets || [],
      layout: config.layout || { rows: 12, columns: 12, responsive: true },
      refreshRate: config.refreshRate || 5000,
      filters: config.filters || []
    };

    this.dashboards.set(dashboard.id, dashboard);
    this.emit('dashboardCreated', dashboard);
    return dashboard.id;
  }

  getDashboard(dashboardId: string): Dashboard | null {
    return this.dashboards.get(dashboardId) || null;
  }

  updateDashboard(dashboardId: string, updates: Partial<Dashboard>): boolean {
    const dashboard = this.dashboards.get(dashboardId);
    if (dashboard) {
      Object.assign(dashboard, updates);
      this.emit('dashboardUpdated', dashboard);
      return true;
    }
    return false;
  }

  getHistoricalMetrics(
    metric: string,
    timeframe: TimeFrame
  ): HistoricalData[] {
    const data = this.dataRetention.get(metric) || [];
    const cutoff = this.getTimeframeCutoff(timeframe);

    return data.filter(d => d.timestamp >= cutoff);
  }

  exportMetrics(format: 'json' | 'csv' | 'excel'): string {
    const data = {
      timestamp: new Date(),
      metrics: this.metrics,
      alerts: this.alerts,
      dashboards: Array.from(this.dashboards.values())
    };

    switch (format) {
      case 'json':
        return JSON.stringify(data, null, 2);
      case 'csv':
        return this.convertToCSV(data);
      case 'excel':
        return this.convertToExcel(data);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  private initializeMetrics(): void {
    this.metrics = {
      system: {
        uptime: 0,
        memoryUsage: {
          used: 0,
          free: 0,
          total: 0,
          percentage: 0,
          heap: { used: 0, total: 0, limit: 0 }
        },
        cpuUsage: 0,
        diskUsage: { used: 0, free: 0, total: 0, percentage: 0 },
        networkUsage: {
          bytesIn: 0,
          bytesOut: 0,
          packetsIn: 0,
          packetsOut: 0,
          connectionsActive: 0
        },
        processHealth: []
      },
      trading: {
        positions: {
          total: 0,
          long: 0,
          short: 0,
          multiLeg: 0,
          expiringToday: 0,
          expiringThisWeek: 0,
          itm: 0,
          otm: 0,
          atm: 0,
          averageDte: 0,
          concentrationRisk: {
            bySymbol: new Map(),
            byExpiration: new Map(),
            byStrike: new Map(),
            byStrategy: new Map()
          }
        },
        orders: {
          submitted: 0,
          filled: 0,
          cancelled: 0,
          rejected: 0,
          pending: 0,
          fillRate: 0,
          averageFillTime: 0,
          slippage: {
            average: 0,
            median: 0,
            max: 0,
            min: 0,
            byOrderSize: new Map(),
            byVolatility: new Map()
          }
        },
        execution: {
          latency: {
            orderEntry: 0,
            orderRouting: 0,
            venueProcessing: 0,
            fillConfirmation: 0,
            totalLatency: 0
          },
          throughput: {
            ordersPerSecond: 0,
            messagesPerSecond: 0,
            peakThroughput: 0,
            averageThroughput: 0
          },
          quality: {
            priceImprovement: 0,
            marketImpact: 0,
            implementationShortfall: 0,
            vwapDeviation: 0
          },
          venues: []
        },
        pnl: {
          realized: 0,
          unrealized: 0,
          total: 0,
          daily: 0,
          weekly: 0,
          monthly: 0,
          ytd: 0,
          maxDrawdown: 0,
          sharpeRatio: 0,
          attribution: {
            delta: 0,
            gamma: 0,
            theta: 0,
            vega: 0,
            rho: 0,
            carry: 0,
            trading: 0
          }
        },
        volume: {
          contracts: 0,
          notional: 0,
          premium: 0,
          bySymbol: new Map(),
          byStrategy: new Map(),
          byVenue: new Map()
        }
      },
      risk: {
        exposure: {
          grossExposure: 0,
          netExposure: 0,
          leverageRatio: 0,
          greeks: {
            delta: {
              total: 0,
              bySymbol: new Map(),
              byExpiration: new Map(),
              byStrategy: new Map(),
              percentage: 0,
              limit: 0,
              utilizationRatio: 0
            },
            gamma: {
              total: 0,
              bySymbol: new Map(),
              byExpiration: new Map(),
              byStrategy: new Map(),
              percentage: 0,
              limit: 0,
              utilizationRatio: 0
            },
            theta: {
              total: 0,
              bySymbol: new Map(),
              byExpiration: new Map(),
              byStrategy: new Map(),
              percentage: 0,
              limit: 0,
              utilizationRatio: 0
            },
            vega: {
              total: 0,
              bySymbol: new Map(),
              byExpiration: new Map(),
              byStrategy: new Map(),
              percentage: 0,
              limit: 0,
              utilizationRatio: 0
            },
            rho: {
              total: 0,
              bySymbol: new Map(),
              byExpiration: new Map(),
              byStrategy: new Map(),
              percentage: 0,
              limit: 0,
              utilizationRatio: 0
            }
          },
          sector: new Map(),
          geography: new Map()
        },
        limits: {
          utilizationRatio: 0,
          breaches: [],
          warnings: [],
          capacity: {
            used: 0,
            available: 0,
            total: 0,
            percentage: 0
          }
        },
        var: {
          var95: 0,
          var99: 0,
          cvar95: 0,
          cvar99: 0,
          confidence: 0.95,
          horizon: 1,
          components: {
            delta: 0,
            gamma: 0,
            vega: 0,
            theta: 0,
            correlation: 0,
            residual: 0
          }
        },
        stress: {
          scenarios: [],
          worstCase: 0,
          tailRisk: 0,
          concentration: 0
        },
        liquidity: {
          liquidityScore: 0,
          timeToLiquidate: 0,
          liquidationCost: 0,
          marketImpact: 0,
          bidAskSpreads: new Map()
        }
      },
      market: {
        volatility: {
          impliedVol: {
            level: 0,
            percentile: 0,
            zScore: 0,
            trend: 'stable',
            momentum: 0
          },
          realizedVol: {
            level: 0,
            percentile: 0,
            zScore: 0,
            trend: 'stable',
            momentum: 0
          },
          volOfVol: 0,
          skew: {
            putCallSkew: 0,
            riskReversal: new Map(),
            butterfly: new Map(),
            slope: 0
          },
          term: {
            termStructure: new Map(),
            contango: 0,
            backwardation: 0,
            rolldown: 0
          },
          surface: {
            quality: 0,
            arbitrageOpportunities: [],
            calibrationError: 0,
            staleness: 0
          }
        },
        correlation: {
          average: 0,
          range: {
            min: 0,
            max: 0,
            percentile25: 0,
            percentile75: 0
          },
          breakdown: new Map(),
          regime: {
            current: 'medium',
            stability: 0,
            changeProb: 0
          }
        },
        flows: {
          optionFlow: {
            callVolume: 0,
            putVolume: 0,
            putCallRatio: 0,
            unusualActivity: [],
            gex: 0,
            dex: 0
          },
          darkPool: {
            volume: 0,
            percentage: 0,
            averageSize: 0,
            sentiment: 'neutral'
          },
          institutional: {
            volume: 0,
            direction: 'neutral',
            blockTrades: 0,
            sweeps: 0
          },
          retail: {
            volume: 0,
            sentiment: 'neutral',
            activity: 'medium'
          }
        },
        sentiment: {
          putCallRatio: 0,
          vixLevel: 0,
          fearGreedIndex: 0,
          newssentiment: {
            score: 0,
            articles: 0,
            positive: 0,
            negative: 0,
            neutral: 0
          },
          socialSentiment: {
            score: 0,
            mentions: 0,
            trending: [],
            sentiment: 'neutral'
          }
        },
        regime: {
          current: {
            type: 'sideways',
            confidence: 0,
            duration: 0,
            characteristics: {
              volatility: 'medium',
              trend: 'sideways',
              correlation: 'medium'
            }
          },
          stability: 0,
          transitionProb: []
        }
      },
      performance: {
        returns: {
          total: 0,
          annualized: 0,
          daily: [],
          monthly: [],
          rolling: {
            week: 0,
            month: 0,
            quarter: 0,
            year: 0
          }
        },
        risk: {
          volatility: 0,
          sharpe: 0,
          sortino: 0,
          calmar: 0,
          maxDrawdown: 0,
          var: 0
        },
        attribution: {
          alpha: 0,
          beta: 0,
          tracking: 0,
          information: 0,
          sectors: new Map(),
          factors: new Map()
        },
        benchmark: {
          correlation: 0,
          beta: 0,
          alpha: 0,
          trackingError: 0,
          informationRatio: 0,
          activeReturn: 0
        }
      },
      latency: {
        averageLatency: 0,
        p95Latency: 0,
        p99Latency: 0,
        maxLatency: 0,
        breakdown: {
          orderEntry: 0,
          orderRouting: 0,
          venueProcessing: 0,
          fillConfirmation: 0,
          totalLatency: 0
        },
        trends: {
          hourly: [],
          daily: [],
          weekly: []
        }
      },
      errors: {
        total: 0,
        rate: 0,
        byType: new Map(),
        bySystem: new Map(),
        severity: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0
        },
        recent: []
      }
    };
  }

  private setupDefaultDashboards(): void {
    // Trading Overview Dashboard
    const tradingDashboard: Dashboard = {
      id: 'trading-overview',
      name: 'Trading Overview',
      widgets: [
        {
          id: 'pnl-chart',
          type: 'pnl_chart',
          title: 'P&L Chart',
          data: {},
          config: { timeframe: '1d' },
          position: { x: 0, y: 0, width: 8, height: 4 }
        },
        {
          id: 'greeks-summary',
          type: 'greeks_summary',
          title: 'Greeks Summary',
          data: {},
          config: {},
          position: { x: 8, y: 0, width: 4, height: 4 }
        },
        {
          id: 'positions-heatmap',
          type: 'position_heatmap',
          title: 'Positions Heatmap',
          data: {},
          config: {},
          position: { x: 0, y: 4, width: 12, height: 6 }
        }
      ],
      layout: { rows: 12, columns: 12, responsive: true },
      refreshRate: 5000,
      filters: []
    };

    // Risk Monitoring Dashboard
    const riskDashboard: Dashboard = {
      id: 'risk-monitoring',
      name: 'Risk Monitoring',
      widgets: [
        {
          id: 'risk-gauge',
          type: 'risk_gauge',
          title: 'Risk Gauge',
          data: {},
          config: {},
          position: { x: 0, y: 0, width: 6, height: 6 }
        },
        {
          id: 'vol-surface',
          type: 'vol_surface',
          title: 'Volatility Surface',
          data: {},
          config: {},
          position: { x: 6, y: 0, width: 6, height: 6 }
        },
        {
          id: 'alerts-list',
          type: 'alerts_list',
          title: 'Active Alerts',
          data: {},
          config: {},
          position: { x: 0, y: 6, width: 12, height: 6 }
        }
      ],
      layout: { rows: 12, columns: 12, responsive: true },
      refreshRate: 1000,
      filters: []
    };

    this.dashboards.set(tradingDashboard.id, tradingDashboard);
    this.dashboards.set(riskDashboard.id, riskDashboard);
  }

  private setupEventListeners(): void {
    // Listen to risk manager events
    this.riskManager.on('limitBreach', (data) => {
      this.createAlert({
        type: 'risk_limit_breach',
        severity: 'critical',
        title: 'Risk Limit Breach',
        message: `${data.type} limit breached: ${data.value} exceeds ${data.limit}`,
        data
      });
    });

    // Listen to execution events
    this.executor.on('executionLatency', (data) => {
      if (data.latency > 1000) { // 1 second threshold
        this.createAlert({
          type: 'execution_latency',
          severity: 'warning',
          title: 'High Execution Latency',
          message: `Execution latency of ${data.latency}ms detected`,
          data
        });
      }
    });

    // Listen to data provider events
    this.dataProvider.on('dataStale', (data) => {
      this.createAlert({
        type: 'market_anomaly',
        severity: 'warning',
        title: 'Stale Market Data',
        message: `Market data for ${data.symbol} is stale by ${data.staleness}ms`,
        data
      });
    });
  }

  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(() => {
      this.collectMetrics();
    }, 1000); // Collect metrics every second
  }

  private async collectMetrics(): Promise<void> {
    try {
      // Update system metrics
      await this.updateSystemMetrics();

      // Update trading metrics
      await this.updateTradingMetrics();

      // Update risk metrics
      await this.updateRiskMetrics();

      // Update market metrics
      await this.updateMarketMetrics();

      // Update performance metrics
      await this.updatePerformanceMetrics();

      // Update latency metrics
      await this.updateLatencyMetrics();

      // Update error metrics
      await this.updateErrorMetrics();

      // Store historical data
      this.storeHistoricalData();

      this.emit('metricsUpdated', this.metrics);
    } catch (error) {
      this.emit('metricsError', error);
    }
  }

  private async updateSystemMetrics(): Promise<void> {
    const memUsage = process.memoryUsage();

    this.metrics.system.memoryUsage.heap.used = memUsage.heapUsed;
    this.metrics.system.memoryUsage.heap.total = memUsage.heapTotal;
    this.metrics.system.memoryUsage.heap.limit = memUsage.heapTotal;

    this.metrics.system.uptime = process.uptime();
  }

  private async updateTradingMetrics(): Promise<void> {
    // Implementation would collect actual trading metrics
  }

  private async updateRiskMetrics(): Promise<void> {
    // Implementation would collect actual risk metrics
  }

  private async updateMarketMetrics(): Promise<void> {
    // Implementation would collect actual market metrics
  }

  private async updatePerformanceMetrics(): Promise<void> {
    // Implementation would collect actual performance metrics
  }

  private async updateLatencyMetrics(): Promise<void> {
    // Implementation would collect actual latency metrics
  }

  private async updateErrorMetrics(): Promise<void> {
    // Implementation would collect actual error metrics
  }

  private storeHistoricalData(): void {
    const timestamp = new Date();

    // Store key metrics for historical analysis
    const metricsToStore = [
      'pnl.total',
      'risk.var.var95',
      'latency.averageLatency',
      'system.memoryUsage.percentage'
    ];

    for (const metric of metricsToStore) {
      const value = this.getMetricValue(metric);
      const history = this.dataRetention.get(metric) || [];

      history.push({ timestamp, value });

      // Keep only last 24 hours of data (at 1-second intervals)
      if (history.length > 24 * 60 * 60) {
        history.shift();
      }

      this.dataRetention.set(metric, history);
    }
  }

  private startAlertsProcessing(): void {
    setInterval(() => {
      this.processAlertsQueue();
    }, 100); // Process alerts every 100ms
  }

  private processAlertsQueue(): void {
    while (this.alertsQueue.length > 0) {
      const alert = this.alertsQueue.shift()!;
      this.alerts.push(alert);

      // Keep only last 1000 alerts
      if (this.alerts.length > 1000) {
        this.alerts.shift();
      }

      this.emit('newAlert', alert);

      // Auto-execute actions if needed
      if (alert.actions.some(a => a.automated && !a.executed)) {
        this.executeAlertActions(alert);
      }
    }
  }

  private createAlert(config: {
    type: AlertType;
    severity: AlertSeverity;
    title: string;
    message: string;
    data: any;
    actions?: AlertAction[];
  }): void {
    const alert: Alert = {
      id: this.generateId(),
      timestamp: new Date(),
      type: config.type,
      severity: config.severity,
      title: config.title,
      message: config.message,
      data: config.data,
      acknowledged: false,
      resolved: false,
      actions: config.actions || []
    };

    this.alertsQueue.push(alert);
  }

  private executeAlertActions(alert: Alert): void {
    for (const action of alert.actions) {
      if (action.automated && !action.executed) {
        try {
          switch (action.type) {
            case 'hedge':
              this.executeHedgeAction(alert, action);
              break;
            case 'reduce':
              this.executeReduceAction(alert, action);
              break;
            case 'close':
              this.executeCloseAction(alert, action);
              break;
            case 'notify':
              this.executeNotifyAction(alert, action);
              break;
          }

          action.executed = true;
          action.timestamp = new Date();
        } catch (error) {
          this.emit('actionError', { alert, action, error });
        }
      }
    }
  }

  private executeHedgeAction(alert: Alert, action: AlertAction): void {
    // Implementation would execute hedging logic
  }

  private executeReduceAction(alert: Alert, action: AlertAction): void {
    // Implementation would execute position reduction logic
  }

  private executeCloseAction(alert: Alert, action: AlertAction): void {
    // Implementation would execute position closing logic
  }

  private executeNotifyAction(alert: Alert, action: AlertAction): void {
    // Implementation would send notifications
  }

  private getMetricValue(path: string): any {
    const parts = path.split('.');
    let value: any = this.metrics;

    for (const part of parts) {
      value = value?.[part];
    }

    return value;
  }

  private getTimeframeCutoff(timeframe: TimeFrame): Date {
    const now = new Date();
    const cutoff = new Date(now);

    switch (timeframe) {
      case '1h':
        cutoff.setHours(cutoff.getHours() - 1);
        break;
      case '1d':
        cutoff.setDate(cutoff.getDate() - 1);
        break;
      case '1w':
        cutoff.setDate(cutoff.getDate() - 7);
        break;
      case '1m':
        cutoff.setMonth(cutoff.getMonth() - 1);
        break;
    }

    return cutoff;
  }

  private convertToCSV(data: any): string {
    // Implementation would convert data to CSV format
    return '';
  }

  private convertToExcel(data: any): string {
    // Implementation would convert data to Excel format
    return '';
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }
}

// Additional types
interface AlertFilters {
  type?: AlertType;
  severity?: AlertSeverity;
  unacknowledged?: boolean;
  unresolved?: boolean;
  since?: Date;
}

interface HistoricalData {
  timestamp: Date;
  value: any;
}

type TimeFrame = '1h' | '1d' | '1w' | '1m';
