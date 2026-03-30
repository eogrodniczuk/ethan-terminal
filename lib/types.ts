export type PositionType = 'Equity' | 'ETF' | 'Option' | 'Cash';

export interface PositionRow {
  id?: string;
  user_id?: string;
  sort_order: number;
  type: PositionType;
  ticker: string | null;
  display: string;
  shares: number;
  avg_purchase_price: number;
  cash_value: number;
  currency: 'CAD' | 'USD';
  contract_multiplier: number;
  beta: number | null;
  current_price_override: number | null;
  delta: number | null;
  beta_override: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface MarketSnapshotRow {
  Asset: string;
  Last: number;
  '1D %': number;
  '5D %': number;
  '1M %': number;
  '3M %': number;
  'YTD %': number;
}

export interface AlertRow {
  level: string;
  signal: string;
  detail: string;
}

export interface RegimeOutput {
  label: string;
  score: number;
  explanation: string;
  story: string;
  policy_implication: string;
}

export interface PortfolioAnalyticsResponse {
  usd_cad: number;
  rows: Record<string, string | number | null>[];
  metrics: Record<string, number | null>;
  beta_table: Record<string, string | number | null>[];
  history: Record<string, string | number>[];
  last_updated_epoch_ms: number;
}

export interface MarketDashboardResponse {
  snapshot: MarketSnapshotRow[];
  regime: RegimeOutput;
  alerts: AlertRow[];
  chart: Record<string, string | number>[];
  commentary: {
    main_driver: string;
    market_implication: string;
    policy_implication: string;
  };
  last_updated_epoch_ms: number;
}
