// comboExecutionExample.ts
// Complete integration example showing how to wire:
// - Alpaca combo adapter
// - Ladder policy YAML configuration
// - Metrics tracking
// - Enhanced risk management
// Author: Integration example

import fs from 'node:fs';
import yaml from 'js-yaml';
import { tryPlaceComboLadder, ComboLeg } from '../utils/executionHelpers';
import { AlpacaComboAdapter } from '../brokers/alpacaComboAdapter';
import { ConsoleMetrics, MemoryMetrics } from '../utils/metrics';
import { approveEnhancedOptionsTrade, PRODUCTION_ENHANCED_PLAYBOOK } from '../engine/optionsRiskManagerEnhanced';

// Example: Complete options combo execution with all components integrated
export async function executeOptionsCombo(
  strategy: string,
  legs: ComboLeg[],
  alpacaConfig: { keyId: string; secretKey: string; baseUrl?: string },
  riskArgs: any
) {
  // 1. Load ladder policy from YAML
  const policyPath = '../config/ladder_policy.yaml';
  const policy = yaml.load(fs.readFileSync(policyPath, 'utf8')) as any;
  const cfg = policy[strategy] ?? policy['default'];

  console.log(`Using ladder policy for ${strategy}:`, cfg);

  // 2. Initialize metrics tracking
  const metrics = new ConsoleMetrics(); // or MemoryMetrics() for testing

  // 3. Create Alpaca adapter with real API configuration
  const broker = new AlpacaComboAdapter(alpacaConfig, metrics);

  // 4. Enhanced risk pre-trade approval
  const approval = approveEnhancedOptionsTrade(riskArgs, PRODUCTION_ENHANCED_PLAYBOOK);

  if (!approval.approved) {
    console.error('Trade rejected by enhanced risk manager:', {
      reasons: approval.reasons,
      riskScore: approval.riskScore
    });
    return { success: false, reasons: approval.reasons };
  }

  console.log(`Risk approval passed with score: ${approval.riskScore}`);

  // 5. Execute combo with ladder policy
  try {
    const result = await tryPlaceComboLadder({
      broker,
      legs,
      ticks: cfg.ticks,
      maxRetries: cfg.maxRetries,
      slippageBpsCap: cfg.slippageBpsCap,
      clientTag: `${strategy}-${Date.now()}`
    });

    console.log('Combo execution result:', result);

    // 6. Metrics will automatically be logged via ConsoleMetrics
    // Example output: {"type":"ladder_attempt","ts":1736720000000,"tag":"iron_condor-1736720000000","targetNetPrice":1.25,"achievedNetPrice":1.22,"slippageBps":-240.0,"filled":true,"filledQty":2}

    return {
      success: result.filled,
      orderId: result.orderId,
      avgNetPrice: result.avgNetPrice,
      filledQtys: result.filledQtys,
      status: result.status
    };

  } catch (error) {
    console.error('Combo execution failed:', error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// Example usage with different strategy types
export async function demonstrateStrategies() {
  // Real Alpaca configuration - uses environment variables for API keys
  const alpacaConfig = {
    keyId: process.env.APCA_API_KEY_ID || 'your_api_key_here',
    secretKey: process.env.APCA_API_SECRET_KEY || 'your_secret_key_here',
    baseUrl: 'https://paper-api.alpaca.markets' // Use paper trading by default
  };

  // Iron Condor example
  const ironCondorLegs: ComboLeg[] = [
    { symbol: 'AAPL_250117P380', side: 'sell', quantity: 1 }, // Short put
    { symbol: 'AAPL_250117P375', side: 'buy', quantity: 1 },  // Long put (hedge)
    { symbol: 'AAPL_250117C420', side: 'sell', quantity: 1 }, // Short call
    { symbol: 'AAPL_250117C425', side: 'buy', quantity: 1 }   // Long call (hedge)
  ];

  const ironCondorRiskArgs = {
    // Your risk arguments here - see optionsRiskManagerEnhanced.ts for full structure
    contract: { symbol: 'AAPL_250117P380', underlying: 'AAPL', strikePrice: 380, contractType: 'put', multiplier: 100 },
    quote: { bid: 2.40, ask: 2.60, impliedVolatility: 0.25, volume: 150 },
    greeks: { delta: -0.3, gamma: 0.02, theta: -0.05, vega: 0.15 },
    portfolioGreeks: { totalDelta: 0, totalGamma: 0, totalTheta: 0, totalVega: 0 },
    equity: 100000,
    portfolioIvRank: 45,
    isLongPremium: false,
    dte: 30,
    underlyingATR: 4.5,
    earnings: { daysToEarnings: null, daysToExDividend: null },
    macro: { hasMajorEventNow: false },
    perUnderlyingRiskPct: 0.03
  };

  // Execute iron condor
  const ironCondorResult = await executeOptionsCombo(
    'iron_condor',
    ironCondorLegs,
    alpacaConfig,
    ironCondorRiskArgs
  );

  console.log('Iron condor execution:', ironCondorResult);

  // Credit spread example
  const creditSpreadLegs: ComboLeg[] = [
    { symbol: 'SPY_250117P520', side: 'sell', quantity: 1 },
    { symbol: 'SPY_250117P515', side: 'buy', quantity: 1 }
  ];

  const creditSpreadResult = await executeOptionsCombo(
    'income_credit_spread',
    creditSpreadLegs,
    alpacaConfig,
    { ...ironCondorRiskArgs, isLongPremium: false } // Modified for credit spread
  );

  console.log('Credit spread execution:', creditSpreadResult);
}

// Run example (uncomment to test)
// demonstrateStrategies().catch(console.error);
