import { PositionRow } from './types';

export const defaultPositions: Omit<PositionRow, 'id' | 'user_id' | 'created_at' | 'updated_at'>[] = [
  {
    sort_order: 1,
    type: 'Equity',
    ticker: 'KITS.TO',
    display: 'KITS.TO',
    shares: 1200,
    avg_purchase_price: 10.76,
    cash_value: 0,
    currency: 'CAD',
    contract_multiplier: 1,
    beta: 0.12,
    current_price_override: null,
    delta: null,
    beta_override: null
  },
  {
    sort_order: 2,
    type: 'Equity',
    ticker: 'STCK.TO',
    display: 'STCK.TO',
    shares: 125,
    avg_purchase_price: 15.71,
    cash_value: 0,
    currency: 'CAD',
    contract_multiplier: 1,
    beta: 0.43,
    current_price_override: null,
    delta: null,
    beta_override: null
  },
  {
    sort_order: 3,
    type: 'ETF',
    ticker: 'EMBJ',
    display: 'EMBJ',
    shares: 12,
    avg_purchase_price: 62.35,
    cash_value: 0,
    currency: 'USD',
    contract_multiplier: 1,
    beta: 0.89,
    current_price_override: null,
    delta: null,
    beta_override: null
  },
  {
    sort_order: 4,
    type: 'Option',
    ticker: null,
    display: 'GLD 31 Dec 2026 465.00 Call',
    shares: 1,
    avg_purchase_price: 52,
    cash_value: 0,
    currency: 'USD',
    contract_multiplier: 100,
    beta: null,
    current_price_override: 30.55,
    delta: 0.4132,
    beta_override: null
  },
  {
    sort_order: 5,
    type: 'Cash',
    ticker: null,
    display: 'Cash',
    shares: 0,
    avg_purchase_price: 0,
    cash_value: 3353.28,
    currency: 'CAD',
    contract_multiplier: 1,
    beta: 0,
    current_price_override: null,
    delta: 0,
    beta_override: 0
  }
];
