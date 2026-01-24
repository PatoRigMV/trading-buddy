# Options Trading System Design

## Architecture Overview

The options trading system will extend the existing equity trading infrastructure while maintaining separation of concerns and backward compatibility.

## Core Components

### 1. Options Data Structures

```typescript
// Core option contract representation
export interface OptionContract {
  symbol: string;           // AAPL240920C00150000
  underlyingSymbol: string; // AAPL
  contractType: 'call' | 'put';
  strikePrice: number;
  expirationDate: Date;
  multiplier: number;       // Usually 100
  exchange: string;
}

// Options market data with Greeks
export interface OptionQuote {
  contract: OptionContract;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  intrinsicValue: number;
  timeValue: number;
  timestamp: Date;
}

// Options-specific order
export interface OptionOrder extends NewOrder {
  assetClass: 'option';
  contract: OptionContract;
  strategy?: OptionsStrategy;
}

// Options position
export interface OptionPosition extends BrokerPosition {
  contract: OptionContract;
  optionType: 'call' | 'put';
  strike: number;
  expiration: Date;
  daysToExpiration: number;
  impliedVolatility: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
}
```

### 2. Options Strategies

```typescript
export enum OptionsStrategy {
  LONG_CALL = 'long_call',
  LONG_PUT = 'long_put',
  COVERED_CALL = 'covered_call',
  CASH_SECURED_PUT = 'cash_secured_put',
  PROTECTIVE_PUT = 'protective_put',
  COLLAR = 'collar',
  STRADDLE = 'straddle',
  STRANGLE = 'strangle',
  IRON_CONDOR = 'iron_condor',
  BUTTERFLY = 'butterfly'
}

export interface StrategyLeg {
  action: 'buy' | 'sell';
  contract: OptionContract;
  quantity: number;
  orderType: 'market' | 'limit';
  price?: number;
}

export interface MultiLegStrategy {
  strategy: OptionsStrategy;
  legs: StrategyLeg[];
  underlyingSymbol: string;
  netDebit?: number;
  netCredit?: number;
  maxProfit: number;
  maxLoss: number;
  breakeven: number[];
}
```

### 3. Options Market Data Provider

```typescript
export interface OptionsMarketDataProvider extends MarketDataProvider {
  getOptionChain(
    underlyingSymbol: string,
    expirationDate?: Date,
    strikeRange?: { min: number; max: number }
  ): Promise<OptionContract[]>;

  getOptionQuote(optionSymbol: string): Promise<OptionQuote>;

  getOptionQuotes(optionSymbols: string[]): Promise<OptionQuote[]>;

  getImpliedVolatility(
    underlyingSymbol: string,
    strike: number,
    expiration: Date,
    optionType: 'call' | 'put'
  ): Promise<number>;

  calculateGreeks(
    underlyingPrice: number,
    strike: number,
    timeToExpiration: number,
    riskFreeRate: number,
    impliedVolatility: number,
    optionType: 'call' | 'put'
  ): Promise<Greeks>;
}

export interface Greeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}
```

### 4. Options Analysis Engine

```typescript
export class OptionsAnalyzer {
  // Analyze option opportunities based on technical indicators
  analyzeOptionOpportunities(
    underlyingSymbol: string,
    technicalAnalysis: TechnicalAnalysis,
    marketCondition: MarketCondition
  ): Promise<OptionTradingSignal[]>;

  // Calculate optimal strike and expiration
  findOptimalStrikeAndExpiration(
    underlyingPrice: number,
    priceTarget: number,
    timeframe: number,
    strategy: OptionsStrategy
  ): Promise<{ strike: number; expiration: Date; probability: number }>;

  // Risk/reward analysis
  calculateRiskReward(strategy: MultiLegStrategy): Promise<{
    maxProfit: number;
    maxLoss: number;
    breakevens: number[];
    profitProbability: number;
  }>;

  // Volatility analysis
  analyzeVolatility(
    underlyingSymbol: string,
    historicalDays: number
  ): Promise<{
    historicalVolatility: number;
    impliedVolatility: number;
    volatilityRank: number;
    volatilitySkew: number;
  }>;
}
```

### 5. Options Risk Management

```typescript
export interface OptionsRiskLimits extends RiskLimits {
  maxOptionsAllocation: number;      // % of portfolio in options
  maxSingleOptionPosition: number;   // Max $ per option contract
  minDaysToExpiration: number;       // Don't trade options < X days to expiry
  maxDeltaExposure: number;         // Max portfolio delta
  maxGammaExposure: number;         // Max portfolio gamma
  maxVegaExposure: number;          // Max portfolio vega
  maxImpliedVolatility: number;     // Max IV to buy options
  minImpliedVolatility: number;     // Min IV to sell options
}

export class OptionsRiskManager extends RiskManager {
  // Calculate portfolio-level Greeks
  calculatePortfolioGreeks(positions: OptionPosition[]): Promise<Greeks>;

  // Check if new options trade violates risk limits
  validateOptionsOrder(
    order: OptionOrder,
    currentPositions: OptionPosition[],
    account: Account
  ): Promise<RiskValidationResult>;

  // Monitor positions approaching expiration
  checkExpirationRisk(positions: OptionPosition[]): Promise<ExpirationWarning[]>;

  // Calculate assignment risk for short options
  assessAssignmentRisk(position: OptionPosition): Promise<AssignmentRisk>;
}
```

## Integration Strategy

### Phase 1: Core Infrastructure
1. Create options interfaces and data structures
2. Extend broker interface for options orders
3. Implement Alpaca options market data provider
4. Basic options position tracking

### Phase 2: Analysis Engine
1. Options opportunity scanner
2. Greeks calculations
3. Volatility analysis
4. Strategy optimization

### Phase 3: Risk Management
1. Options-specific risk limits
2. Portfolio Greeks monitoring
3. Expiration management
4. Assignment risk assessment

### Phase 4: Advanced Strategies
1. Multi-leg strategy execution
2. Strategy backtesting
3. Dynamic hedging
4. Volatility trading strategies

## Frontend Integration

### Dashboard Additions
- Options positions panel with Greeks
- Options chain viewer
- Strategy P&L visualization
- Volatility dashboard
- Risk metrics display

### Configuration
- Options trading enabled/disabled toggle
- Options-specific risk parameters
- Strategy preferences
- Expiration management settings

## Database Schema Extensions

```sql
-- Options contracts table
CREATE TABLE option_contracts (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(32) NOT NULL UNIQUE,
  underlying_symbol VARCHAR(16) NOT NULL,
  contract_type VARCHAR(4) NOT NULL, -- 'call' or 'put'
  strike_price DECIMAL(10,2) NOT NULL,
  expiration_date DATE NOT NULL,
  multiplier INTEGER DEFAULT 100,
  exchange VARCHAR(16),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Options positions table
CREATE TABLE option_positions (
  id SERIAL PRIMARY KEY,
  agent_id VARCHAR(64) NOT NULL,
  contract_id INTEGER REFERENCES option_contracts(id),
  quantity INTEGER NOT NULL,
  avg_entry_price DECIMAL(10,4) NOT NULL,
  current_price DECIMAL(10,4),
  unrealized_pnl DECIMAL(12,2),
  delta DECIMAL(8,6),
  gamma DECIMAL(8,6),
  theta DECIMAL(8,6),
  vega DECIMAL(8,6),
  implied_volatility DECIMAL(8,6),
  days_to_expiration INTEGER,
  opened_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Options orders table
CREATE TABLE option_orders (
  id SERIAL PRIMARY KEY,
  agent_id VARCHAR(64) NOT NULL,
  contract_id INTEGER REFERENCES option_contracts(id),
  strategy VARCHAR(32), -- Strategy type if multi-leg
  side VARCHAR(4) NOT NULL, -- 'buy' or 'sell'
  quantity INTEGER NOT NULL,
  order_type VARCHAR(16) NOT NULL,
  limit_price DECIMAL(10,4),
  filled_quantity INTEGER DEFAULT 0,
  avg_fill_price DECIMAL(10,4),
  status VARCHAR(16) DEFAULT 'pending',
  submitted_at TIMESTAMP DEFAULT NOW(),
  filled_at TIMESTAMP
);
```

## Risk Considerations

1. **Expiration Management**: Auto-close positions within N days of expiration
2. **Assignment Risk**: Monitor short options approaching ITM
3. **Portfolio Greeks**: Limit delta, gamma, vega exposure
4. **Liquidity**: Only trade options with minimum volume/OI
5. **Volatility**: Avoid buying high IV, selling low IV
6. **Position Sizing**: Smaller sizes due to leverage and time decay

## Testing Strategy

1. **Paper Trading**: Full options simulation environment
2. **Risk Validation**: Test all risk limits and edge cases
3. **Strategy Backtesting**: Historical performance validation
4. **Greeks Accuracy**: Validate calculations against market data
5. **Expiration Handling**: Test auto-exercise/assignment logic

This design provides a comprehensive, scalable foundation for sophisticated options trading while integrating seamlessly with the existing equity trading system.
