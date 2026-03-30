
'use client';

import { PortfolioAnalyticsResponse, RegimeOutput } from '@/lib/types';

function fmtDollar(x?: number | null) {
  if (x == null || Number.isNaN(x)) return '—';
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 2 }).format(x);
}
function fmtNum(x?: number | null, digits = 4) {
  if (x == null || Number.isNaN(x)) return '—';
  return x.toFixed(digits);
}
function fmtTime(epochMs?: number | null) {
  if (!epochMs) return '—';
  return new Date(epochMs).toLocaleTimeString();
}

export function TopBar({
  analytics,
  regime,
  lastUpdated,
  refreshing
}: {
  analytics?: PortfolioAnalyticsResponse | null;
  regime?: RegimeOutput | null;
  lastUpdated?: number | null;
  refreshing?: boolean;
}) {
  return (
    <div className="bbg-topbar">
      <div className="left">
        <span className="bbg-badge">ETHAN&apos;S TERMINAL</span>
        <span>BASE CCY: <b>CAD</b></span>
        <span>PORT MV: <b>{fmtDollar(analytics?.metrics?.portfolio_value as number | null)}</b></span>
        <span>USD/CAD: <b>{fmtNum(analytics?.usd_cad as number | null)}</b></span>
        <span>REGIME: <b>{regime?.label ?? 'Loading...'}</b></span>
      </div>
      <div className="right">
        <span>{refreshing ? 'REFRESHING…' : `LAST: ${fmtTime(lastUpdated)}`}</span>
      </div>
    </div>
  );
}
