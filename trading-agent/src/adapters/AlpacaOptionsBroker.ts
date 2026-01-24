/**
 * Alpaca Options Broker - Extended broker with options trading capabilities
 * Extends the base AlpacaBroker to support options orders and positions
 */

import { AlpacaBroker } from './AlpacaBroker';
import { Broker, NewOrder, PlacedOrder, Account, BrokerPosition } from './Broker';
import {
  OptionOrder,
  OptionPosition,
  OptionContract,
  MultiLegStrategy,
  OptionOrderResult,
  OptionsStrategy
} from '../types/options';

// Extended broker interface for options
export interface OptionsBroker extends Broker {
  // Options-specific methods
  placeOptionOrder(order: OptionOrder): Promise<OptionOrderResult>;
  getOptionPositions(): Promise<OptionPosition[]>;
  closeOptionPosition(symbol: string): Promise<void>;
  executeMultiLegStrategy(strategy: MultiLegStrategy): Promise<OptionOrderResult>;

  // Options account methods
  getOptionsLevel(): Promise<number>;
  getOptionsBuyingPower(): Promise<number>;
}

// Alpaca-specific API types
interface AlpacaOptionOrderRequest {
  symbol: string;
  side: 'buy' | 'sell';
  qty: string;
  type: 'market' | 'limit';
  time_in_force: 'day' | 'gtc' | 'ioc' | 'fok';
  limit_price?: string;
  class: 'option';
  // Option-specific fields
  legs?: AlpacaOrderLeg[];
}

interface AlpacaOrderLeg {
  symbol: string;
  side: 'buy' | 'sell';
  qty: string;
}

interface AlpacaOptionOrderResponse {
  id: string;
  status: string;
  asset_class: 'option';
  symbol: string;
  qty: string;
  filled_qty: string;
  side: 'buy' | 'sell';
  order_type: string;
  time_in_force: string;
  limit_price?: string;
  filled_avg_price?: string;
  submitted_at: string;
  filled_at?: string;
  legs?: AlpacaOrderLeg[];
}

interface AlpacaOptionPosition {
  symbol: string;
  asset_class: 'option';
  qty: string;
  market_value: string;
  cost_basis: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  side: 'long' | 'short';
  avg_entry_price: string;

  // Options-specific fields
  underlying_symbol?: string;
  option_type?: 'call' | 'put';
  strike_price?: string;
  expiration_date?: string;
}

export class AlpacaOptionsBroker extends AlpacaBroker implements OptionsBroker {

  constructor(apiKey: string, apiSecret: string, isPaper: boolean = true) {
    super(apiKey, apiSecret, isPaper);
  }

  /**
   * Place a single options order
   */
  async placeOptionOrder(order: OptionOrder): Promise<OptionOrderResult> {
    console.log(`📋 Placing option order: ${order.side} ${order.qty} ${order.symbol}`);

    try {
      // Validate the option order
      this.validateOptionOrder(order);

      // Check options trading permissions
      const optionsLevel = await this.getOptionsLevel();
      if (optionsLevel < 1) {
        throw new Error('Account not approved for options trading');
      }

      // Check buying power for the order
      const requiredCapital = await this.calculateRequiredCapital(order);
      const buyingPower = await this.getOptionsBuyingPower();

      if (requiredCapital > buyingPower) {
        throw new Error(`Insufficient buying power. Required: $${requiredCapital}, Available: $${buyingPower}`);
      }

      // Prepare Alpaca API request
      const alpacaOrder: AlpacaOptionOrderRequest = {
        symbol: order.symbol,
        side: order.side,
        qty: order.qty.toString(),
        type: order.type === 'marketable_limit' ? 'limit' : order.type,
        time_in_force: order.timeInForce || 'day',
        class: 'option'
      };

      if (order.limitPrice) {
        alpacaOrder.limit_price = order.limitPrice.toString();
      }

      // Place the order via Alpaca API
      const response = await this.makeRequest('/v2/orders', {
        method: 'POST',
        body: JSON.stringify(alpacaOrder)
      });

      // Convert response to our format
      const placedOrder = this.convertAlpacaOptionOrder(response);

      // Get updated position if order filled
      let newPosition: OptionPosition | undefined;
      if (response.status === 'filled' || response.filled_qty > 0) {
        try {
          const positions = await this.getOptionPositions();
          newPosition = positions.find(pos => pos.symbol === order.symbol);
        } catch (error) {
          console.warn('Failed to fetch updated position:', error);
        }
      }

      const result: OptionOrderResult = {
        success: true,
        orderId: placedOrder.id,
        filledQuantity: placedOrder.filledQty,
        avgFillPrice: placedOrder.avgFillPrice,
        totalCost: (placedOrder.avgFillPrice || 0) * placedOrder.filledQty,
        commission: 0.65, // Alpaca's options commission
        newPosition
      };

      console.log(`✅ Option order placed successfully: ${result.orderId}`);
      return result;

    } catch (error) {
      console.error(`❌ Failed to place option order:`, error);
      return {
        success: false,
        filledQuantity: 0,
        totalCost: 0,
        commission: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get all current options positions
   */
  async getOptionPositions(): Promise<OptionPosition[]> {
    try {
      const positions = await this.makeRequest('/v2/positions');

      // Filter for options positions and convert
      const optionPositions = positions
        .filter((pos: any) => pos.asset_class === 'option')
        .map((pos: AlpacaOptionPosition) => this.convertAlpacaOptionPosition(pos));

      return optionPositions;

    } catch (error) {
      console.error('Failed to fetch option positions:', error);
      return [];
    }
  }

  /**
   * Close a specific options position
   */
  async closeOptionPosition(symbol: string): Promise<void> {
    try {
      // Get current position
      const positions = await this.getOptionPositions();
      const position = positions.find(pos => pos.symbol === symbol);

      if (!position) {
        throw new Error(`No position found for option symbol: ${symbol}`);
      }

      // Create closing order (opposite side)
      const closingOrder: OptionOrder = {
        symbol: position.symbol,
        underlyingSymbol: position.underlyingSymbol,
        side: position.side === 'long' ? 'sell' : 'buy',
        qty: Math.abs(position.qty),
        type: 'market',
        assetClass: 'option',
        contract: position.contract,
        openClose: 'close'
      };

      // Place closing order
      const result = await this.placeOptionOrder(closingOrder);

      if (!result.success) {
        throw new Error(`Failed to close position: ${result.error}`);
      }

      console.log(`✅ Closed option position: ${symbol}`);

    } catch (error) {
      console.error(`❌ Failed to close option position ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Execute a multi-leg options strategy
   */
  async executeMultiLegStrategy(strategy: MultiLegStrategy): Promise<OptionOrderResult> {
    console.log(`📋 Executing multi-leg strategy: ${strategy.strategy}`);

    try {
      // Validate strategy
      if (strategy.legs.length < 2) {
        throw new Error('Multi-leg strategy must have at least 2 legs');
      }

      // Check if Alpaca supports the strategy
      if (!this.isSupportedMultiLegStrategy(strategy.strategy)) {
        return await this.executeLegsSequentially(strategy);
      }

      // Prepare multi-leg order for Alpaca
      const legs: AlpacaOrderLeg[] = strategy.legs.map(leg => ({
        symbol: leg.contract.symbol,
        side: leg.action,
        qty: leg.quantity.toString()
      }));

      const multiLegOrder: AlpacaOptionOrderRequest = {
        symbol: strategy.underlyingSymbol, // Use underlying for multi-leg
        side: strategy.netDebit ? 'buy' : 'sell', // Net direction
        qty: '1', // Multi-leg orders use qty 1
        type: 'limit',
        time_in_force: 'day',
        class: 'option',
        legs
      };

      // Calculate net price for the strategy
      const netPrice = await this.calculateMultiLegPrice(strategy);
      if (netPrice) {
        multiLegOrder.limit_price = netPrice.toString();
      }

      // Execute the multi-leg order
      const response = await this.makeRequest('/v2/orders', {
        method: 'POST',
        body: JSON.stringify(multiLegOrder)
      });

      return {
        success: true,
        orderId: response.id,
        filledQuantity: parseInt(response.filled_qty) || 0,
        avgFillPrice: response.filled_avg_price ? parseFloat(response.filled_avg_price) : undefined,
        totalCost: parseFloat(response.filled_avg_price) * parseInt(response.filled_qty) || 0,
        commission: 0.65 * strategy.legs.length // Commission per leg
      };

    } catch (error) {
      console.error(`❌ Failed to execute multi-leg strategy:`, error);

      // Fallback: Execute legs sequentially
      return await this.executeLegsSequentially(strategy);
    }
  }

  /**
   * Get account's options trading level
   */
  async getOptionsLevel(): Promise<number> {
    try {
      const account = await this.makeRequest('/v2/account');

      // Parse options level from account data
      // Alpaca may have this in different fields
      return account.options_level || account.max_options_trading_level || 1;

    } catch (error) {
      console.warn('Failed to get options level, defaulting to 1:', error);
      return 1; // Default to basic options level
    }
  }

  /**
   * Get available options buying power
   */
  async getOptionsBuyingPower(): Promise<number> {
    try {
      const account = await this.getAccount();

      // For options, buying power is usually a fraction of total buying power
      // This is a simplified calculation
      return account.buyingPower * 0.5; // Conservative estimate

    } catch (error) {
      console.error('Failed to get options buying power:', error);
      return 0;
    }
  }

  // Private helper methods

  private validateOptionOrder(order: OptionOrder): void {
    if (!order.symbol || !order.underlyingSymbol) {
      throw new Error('Option order must have symbol and underlying symbol');
    }

    if (order.qty <= 0) {
      throw new Error('Order quantity must be positive');
    }

    if (order.type === 'limit' && !order.limitPrice) {
      throw new Error('Limit orders must have a limit price');
    }

    // Validate option symbol format (OCC format)
    if (!/^[A-Z]+\d{6}[CP]\d{8}$/.test(order.symbol)) {
      throw new Error('Invalid option symbol format');
    }
  }

  private async calculateRequiredCapital(order: OptionOrder): Promise<number> {
    // Simplified capital calculation
    // In reality, this would consider margin requirements, spreads, etc.

    if (order.side === 'buy') {
      // Buying options requires full premium
      const price = order.limitPrice || await this.getOptionMidPrice(order.symbol);
      return price * order.qty * 100; // Options are for 100 shares
    } else {
      // Selling options may require margin/collateral
      // This is a simplified calculation
      return 1000; // Placeholder margin requirement
    }
  }

  private async getOptionMidPrice(symbol: string): Promise<number> {
    // Get current option quote and return mid price
    // This would integrate with the options data provider
    return 2.50; // Placeholder price
  }

  private isSupportedMultiLegStrategy(strategy: OptionsStrategy): boolean {
    // Check if Alpaca supports this strategy as a single order
    const supportedStrategies = [
      OptionsStrategy.BULL_CALL_SPREAD,
      OptionsStrategy.BEAR_CALL_SPREAD,
      OptionsStrategy.BULL_PUT_SPREAD,
      OptionsStrategy.BEAR_PUT_SPREAD,
      OptionsStrategy.IRON_CONDOR
    ];

    return supportedStrategies.includes(strategy);
  }

  private async executeLegsSequentially(strategy: MultiLegStrategy): Promise<OptionOrderResult> {
    console.log(`📋 Executing strategy legs sequentially: ${strategy.legs.length} legs`);

    const results: OptionOrderResult[] = [];
    let totalCost = 0;
    let totalCommission = 0;
    let anySuccess = false;

    for (const [index, leg] of strategy.legs.entries()) {
      try {
        const legOrder: OptionOrder = {
          symbol: leg.contract.symbol,
          underlyingSymbol: strategy.underlyingSymbol,
          side: leg.action,
          qty: leg.quantity,
          type: leg.orderType,
          limitPrice: leg.price,
          assetClass: 'option',
          contract: leg.contract,
          openClose: 'open'
        };

        const result = await this.placeOptionOrder(legOrder);
        results.push(result);

        if (result.success) {
          anySuccess = true;
          totalCost += result.totalCost;
          totalCommission += result.commission;

          // Mark leg as filled
          leg.filled = true;
          leg.fillPrice = result.avgFillPrice;

          console.log(`✅ Leg ${index + 1}/${strategy.legs.length} filled`);
        } else {
          console.error(`❌ Leg ${index + 1} failed: ${result.error}`);

          // For multi-leg strategies, we might want to cancel remaining legs
          // if critical legs fail. For now, we continue.
        }

        // Brief delay between legs to avoid rate limits
        if (index < strategy.legs.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

      } catch (error) {
        console.error(`❌ Failed to execute leg ${index + 1}:`, error);
        results.push({
          success: false,
          filledQuantity: 0,
          totalCost: 0,
          commission: 0,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Return combined result
    const successfulLegs = results.filter(r => r.success).length;
    return {
      success: anySuccess,
      orderId: `MULTI_${Date.now()}`, // Generate composite ID
      filledQuantity: successfulLegs,
      totalCost,
      commission: totalCommission,
      warnings: successfulLegs < strategy.legs.length ?
        [`Only ${successfulLegs}/${strategy.legs.length} legs executed successfully`] :
        undefined
    };
  }

  private async calculateMultiLegPrice(strategy: MultiLegStrategy): Promise<number | null> {
    // Calculate fair value price for the multi-leg strategy
    // This would integrate with options pricing models

    if (strategy.netDebit) return strategy.netDebit;
    if (strategy.netCredit) return -strategy.netCredit;

    return null; // Let market determine price
  }

  private convertAlpacaOptionOrder(response: AlpacaOptionOrderResponse): PlacedOrder {
    return {
      id: response.id,
      symbol: response.symbol,
      side: response.side,
      qty: parseInt(response.qty),
      status: response.status,
      filledQty: parseInt(response.filled_qty) || 0,
      avgFillPrice: response.filled_avg_price ? parseFloat(response.filled_avg_price) : undefined,
      submittedAt: new Date(response.submitted_at),
      filledAt: response.filled_at ? new Date(response.filled_at) : undefined
    };
  }

  private convertAlpacaOptionPosition(position: AlpacaOptionPosition): OptionPosition {
    // Parse option details from symbol or use provided fields
    const contract = this.parseOptionContract(position);

    return {
      symbol: position.symbol,
      underlyingSymbol: position.underlying_symbol || contract.underlyingSymbol,
      qty: parseInt(position.qty),
      avgEntryPrice: parseFloat(position.avg_entry_price),
      marketValue: parseFloat(position.market_value),
      costBasis: parseFloat(position.cost_basis),
      unrealizedPl: parseFloat(position.unrealized_pl),
      unrealizedPlpc: parseFloat(position.unrealized_plpc),
      side: position.side,
      assetClass: 'option',

      // Options-specific fields
      contract,
      optionType: contract.contractType,
      strike: contract.strikePrice,
      expiration: contract.expirationDate,
      daysToExpiration: this.calculateDaysToExpiration(contract.expirationDate),

      // Placeholder values - would come from market data
      impliedVolatility: 0.3,
      delta: 0.5,
      gamma: 0.02,
      theta: -0.05,
      vega: 0.15,
      rho: 0.01,
      intrinsicValue: Math.max(0, contract.contractType === 'call' ?
        0 - contract.strikePrice : contract.strikePrice - 0), // Would use current underlying price
      timeValue: 0,

      // Risk assessment
      assignmentRisk: {
        probability: 0.1,
        level: 'low',
        factors: [],
        daysToExpiration: this.calculateDaysToExpiration(contract.expirationDate),
        moneyness: 0,
        earlyAssignmentRisk: false,
        dividendRisk: false,
        recommendation: 'hold'
      }
    };
  }

  private parseOptionContract(position: AlpacaOptionPosition): OptionContract {
    // Parse option symbol (OCC format) to extract contract details
    const symbol = position.symbol;
    const match = symbol.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);

    if (!match) {
      // Fallback to provided fields if symbol parsing fails
      return {
        symbol,
        underlyingSymbol: position.underlying_symbol || 'UNKNOWN',
        contractType: position.option_type || 'call',
        strikePrice: parseFloat(position.strike_price || '0'),
        expirationDate: position.expiration_date ? new Date(position.expiration_date) : new Date(),
        multiplier: 100,
        exchange: 'CBOE'
      };
    }

    const [, underlying, dateStr, typeChar, strikeStr] = match;

    // Parse date (YYMMDD)
    const year = 2000 + parseInt(dateStr.substring(0, 2));
    const month = parseInt(dateStr.substring(2, 4)) - 1; // JS months are 0-based
    const day = parseInt(dateStr.substring(4, 6));

    return {
      symbol,
      underlyingSymbol: underlying,
      contractType: typeChar === 'C' ? 'call' : 'put',
      strikePrice: parseInt(strikeStr) / 1000, // Strike in thousandths
      expirationDate: new Date(year, month, day),
      multiplier: 100,
      exchange: 'CBOE'
    };
  }

  private calculateDaysToExpiration(expirationDate: Date): number {
    return Math.ceil((expirationDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  }

  // Add missing methods for the OptionsBroker interface

  /**
   * Get options orders
   */
  async getOptionOrders(status?: string, limit: number = 50): Promise<any[]> {
    try {
      const params = new URLSearchParams();
      if (status) params.append('status', status);
      params.append('limit', limit.toString());
      params.append('asset_class', 'option');

      const orders = await this.makeRequest(`/v2/orders?${params}`);
      return orders || [];
    } catch (error) {
      console.error('Failed to get option orders:', error);
      return [];
    }
  }
}
