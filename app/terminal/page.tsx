'use client';

import { Protected } from '@/components/protected';
import { TerminalNav } from '@/components/terminal-nav';
import { Section } from '@/components/section';
import { TopBar } from '@/components/top-bar';
import { env } from '@/lib/env';
import { MarketDashboardResponse, PortfolioAnalyticsResponse, PositionRow } from '@/lib/types';
import { supabaseBrowser } from '@/lib/supabase-browser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CartesianGrid, Bar, BarChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Link from 'next/link';

const REFRESH_MS = Number(process.env.NEXT_PUBLIC_REFRESH_MS || 60000);

const MARKET_TIMEFRAMES = [
  { label: '1D', period: '1D', lookback: 2 },
  { label: '3D', period: '3D', lookback: 4 },
  { label: '1M', period: '1M', lookback: 22 },
  { label: '6M', period: '6M', lookback: 132 },
  { label: '1Y', period: '1Y', lookback: 252 },
  { label: '5Y', period: '5Y', lookback: 1260 }
] as const;

type MarketTimeframeLabel = (typeof MARKET_TIMEFRAMES)[number]['label'];

function fmtDollar(x?: number | null) {
  if (x == null || Number.isNaN(x)) return '—';
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 2
  }).format(x);
}

function fmtPct(x?: number | null) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${x >= 0 ? '+' : ''}${x.toFixed(2)}%`;
}

function fmtNum(x?: number | null, digits = 2) {
  if (x == null || Number.isNaN(x)) return '—';
  return x.toFixed(digits);
}

function fmtTime(epochMs?: number | null) {
  if (!epochMs) return '—';
  return new Date(epochMs).toLocaleTimeString();
}

function classFor(val?: number | null) {
  if (val == null || Number.isNaN(val)) return 'neu';
  return val >= 0 ? 'pos' : 'neg';
}

function buildFallbackMarketResponse(message: string): MarketDashboardResponse {
  return {
    snapshot: [],
    regime: {
      label: 'Unavailable',
      score: 0,
      explanation: message,
      story: message,
      policy_implication: message
    },
    alerts: [],
    chart: [],
    commentary: {
      main_driver: message,
      market_implication: message,
      policy_implication: message
    },
    last_updated_epoch_ms: Date.now()
  } as MarketDashboardResponse;
}

function buildFallbackAnalyticsResponse(): PortfolioAnalyticsResponse {
  return {
    usd_cad: 1.3864,
    rows: [],
    metrics: {},
    beta_table: [],
    history: [],
    last_updated_epoch_ms: Date.now()
  } as PortfolioAnalyticsResponse;
}

export default function TerminalPage() {
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [marketOverview, setMarketOverview] = useState<MarketDashboardResponse | null>(null);
  const [marketChart, setMarketChart] = useState<MarketDashboardResponse | null>(null);
  const [analytics, setAnalytics] = useState<PortfolioAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [marketTimeframe, setMarketTimeframe] = useState<MarketTimeframeLabel>('1Y');
  const hasLoadedRef = useRef(false);

  const activeMarketTimeframe = useMemo(
    () => MARKET_TIMEFRAMES.find((t) => t.label === marketTimeframe) ?? MARKET_TIMEFRAMES[4],
    [marketTimeframe]
  );

  const chartLineColors: Record<string, string> = {
    'Brent Crude': '#f4a830',
    'US 10Y Yield': '#7ec8ff',
    VIX: '#ff8c8c',
    Gold: '#83d98c',
    SPY: '#c6c6ff',
    DXY: '#ffffff'
  };

  const chartLegendItems = ['Brent Crude', 'US 10Y Yield', 'VIX', 'Gold', 'SPY', 'DXY'];

  const parseJson = async <T,>(res: Response): Promise<T> => {
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API ${res.status} for ${res.url}: ${text.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  };

  const load = useCallback(async (force = false) => {
    const firstLoad = !hasLoadedRef.current;
    if (firstLoad) setLoading(true);
    else setRefreshing(true);

    try {
      const { data: authData } = await supabaseBrowser.auth.getUser();
      const user = authData.user;

      if (!user) {
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const [{ data: positionsData, error: positionsError }] = await Promise.all([
        supabaseBrowser.from('positions').select('*').eq('user_id', user.id).order('sort_order', { ascending: true })
      ]);

      if (positionsError) {
        throw new Error(`Supabase positions load failed: ${positionsError.message}`);
      }

      const currentPositions = (positionsData ?? []) as PositionRow[];
      setPositions(currentPositions);

      const overviewUrl =
        `${env.apiBase}/market/dashboard` +
        `?period=1Y` +
        `&lookback=252` +
        `&assets=${encodeURIComponent('Brent Crude,US 10Y Yield,VIX,Gold,SPY,DXY')}` +
        `${force ? '&force=1' : ''}`;

      const chartUrl =
        `${env.apiBase}/market/dashboard` +
        `?period=${encodeURIComponent(activeMarketTimeframe.period)}` +
        `&lookback=${activeMarketTimeframe.lookback}` +
        `&assets=${encodeURIComponent('Brent Crude,US 10Y Yield,VIX,Gold,SPY,DXY')}` +
        `${force ? '&force=1' : ''}`;

      const [overviewRes, chartRes, analyticsRes] = await Promise.all([
        fetch(overviewUrl, { cache: 'no-store' }),
        fetch(chartUrl, { cache: 'no-store' }),
        fetch(`${env.apiBase}/portfolio/analytics`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ positions: currentPositions, period: '1Y', force }),
          cache: 'no-store'
        })
      ]);

      const overviewJson = await parseJson<MarketDashboardResponse>(overviewRes);
      const chartJson = await parseJson<MarketDashboardResponse>(chartRes);
      const analyticsJson = await parseJson<PortfolioAnalyticsResponse>(analyticsRes);

      setMarketOverview(overviewJson);
      setMarketChart(chartJson);
      setAnalytics(analyticsJson);

      setLastUpdated(
        Math.max(
          overviewJson.last_updated_epoch_ms ?? 0,
          chartJson.last_updated_epoch_ms ?? 0,
          analyticsJson.last_updated_epoch_ms ?? 0
        )
      );
    } catch (err) {
      console.error('Terminal load failed:', err);

      const message = err instanceof Error ? err.message : 'Terminal data failed to load.';
      setMarketOverview(buildFallbackMarketResponse(message));
      setMarketChart(buildFallbackMarketResponse(message));
      setAnalytics(buildFallbackAnalyticsResponse());
      setLastUpdated(Date.now());
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeMarketTimeframe.lookback, activeMarketTimeframe.period]);

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void load(false);
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const weightRows = useMemo(() => {
    const rows = analytics?.rows ?? [];
    return rows
      .filter((r) => r.Type !== 'Cash')
      .map((r) => ({
        Display: String(r.Display),
        Weight: Number(r['Weight %'] ?? 0)
      }));
  }, [analytics]);

  const positionRows = useMemo(
    () => (analytics?.rows ?? []).filter((r) => r.Type !== 'Cash'),
    [analytics]
  );

  return (
    <Protected>
      <main className="terminal-shell">
        <TopBar
          analytics={analytics}
          regime={marketOverview?.regime ?? null}
          lastUpdated={lastUpdated}
          refreshing={refreshing}
        />

        <TerminalNav />

        <div className="action-strip">
          <button className="bbg-button" onClick={() => void load(true)}>
            {refreshing ? 'Refreshing...' : 'Refresh Now'}
          </button>
          <span className="action-meta">Auto refresh: {Math.round(REFRESH_MS / 1000)}s</span>
          <span className="action-meta">Last updated: {fmtTime(lastUpdated)}</span>
          <Link className="admin-link" href="/admin/portfolio">
            Portfolio Settings
          </Link>
        </div>

        {loading ? (
          <div className="loading-screen">Loading terminal...</div>
        ) : (
          <>
            <Section title="MKT">
              <div className="snapshot-grid">
                {(marketOverview?.snapshot ?? []).map((row) => (
                  <div
                    key={row.Asset}
                    className="bbg-card"
                    style={{ background: (row['1D %'] ?? 0) >= 0 ? '#3fa043' : '#8f1a20' }}
                  >
                    <div className="label black">{row.Asset}</div>
                    <div className="value black">{fmtNum(row.Last)}</div>
                    <div className="delta black">{fmtPct(row['1D %'])}</div>
                  </div>
                ))}
              </div>

              <div className="market-main-grid">
                <div className="market-left-stack">
                  <Section title="Global Market Monitor">
                    <div className="bbg-table-wrap">
                      <table className="bbg-table">
                        <thead>
                          <tr>
                            <th>Ticker</th>
                            <th>Last Price</th>
                            <th>%1D</th>
                            <th>%5D</th>
                            <th>%1M</th>
                            <th>%3M</th>
                            <th>%YTD</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(marketOverview?.snapshot ?? []).map((row) => (
                            <tr key={row.Asset}>
                              <td className="name-cell">{row.Asset}</td>
                              <td>{fmtNum(row.Last)}</td>
                              {(['1D %', '5D %', '1M %', '3M %', 'YTD %'] as const).map((k) => (
                                <td key={k} className={classFor(row[k])}>
                                  {fmtPct(row[k])}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Section>

                  <Section title="Cross-Asset Relative Performance">
                    <div className="chart-toolbar">
                      <div className="chart-toggle-group">
                        {MARKET_TIMEFRAMES.map((item) => (
                          <button
                            key={item.label}
                            className={`chart-toggle ${marketTimeframe === item.label ? 'chart-toggle-active' : ''}`}
                            onClick={() => setMarketTimeframe(item.label)}
                            type="button"
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="chart-frame chart-frame-market">
                      <div className="chart-frame-market-inner">
                        <div className="chart-plot-market">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                              data={marketChart?.chart ?? []}
                              margin={{ top: 8, right: 10, left: 0, bottom: 0 }}
                            >
                              <CartesianGrid stroke="#262626" />
                              <XAxis dataKey="date" tick={{ fill: '#e7e7e7', fontSize: 10 }} minTickGap={28} />
                              <YAxis
                                domain={['auto', 'auto']}
                                tick={{ fill: '#e7e7e7', fontSize: 10 }}
                                allowDataOverflow={false}
                              />
                              <Tooltip contentStyle={{ background: '#000', border: '1px solid #555', color: '#fff' }} />
                              {chartLegendItems.map((key) => (
                                <Line
                                  key={key}
                                  type="monotone"
                                  dataKey={key}
                                  dot={false}
                                  connectNulls
                                  isAnimationActive={false}
                                  stroke={chartLineColors[key]}
                                  strokeWidth={1.05}
                                />
                              ))}
                            </LineChart>
                          </ResponsiveContainer>
                        </div>

                        <div className="chart-legend-market">
                          {chartLegendItems.map((key) => (
                            <div className="chart-legend-item" key={key}>
                              <span
                                className="chart-legend-swatch"
                                style={{ backgroundColor: chartLineColors[key] }}
                              />
                              <span>{key}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </Section>
                </div>

                <div className="market-right-stack">
                  <Section title="Regime Monitor">
                    <div className="bbg-note regime-monitor">
                      <b>{marketOverview?.regime?.label ?? 'Unavailable'}</b>
                      <br /><br />
                      <b className="score-label">Score:</b> {marketOverview?.regime?.score ?? '—'}
                      <br /><br />
                      {marketOverview?.regime?.explanation ?? 'No regime explanation available.'}
                      <br /><br />
                      {marketOverview?.commentary?.main_driver ?? 'No main driver available.'}
                      <br />
                      {marketOverview?.commentary?.market_implication ?? 'No market implication available.'}
                      <br />
                      {marketOverview?.commentary?.policy_implication ?? 'No policy implication available.'}
                    </div>
                  </Section>

                  <Section title="Alert Engine">
                    <div className="alert-engine-list">
                      {(marketOverview?.alerts ?? []).map((alert, idx) => (
                        <div className="bbg-note alert-engine" key={idx}>
                          <b>{alert.level.toUpperCase()} | {alert.signal}</b>
                          <br />
                          {alert.detail}
                        </div>
                      ))}
                    </div>
                  </Section>
                </div>
              </div>
            </Section>

            <Section title="PORT">
              <div className="summary-grid">
                {[
                  ['Portfolio Value', fmtDollar(analytics?.metrics?.portfolio_value)],
                  ['Cash', fmtDollar(analytics?.metrics?.cash_value)],
                  ['1D P&L', fmtDollar(analytics?.metrics?.daily_pnl)],
                  ['Unrealized/P&L', fmtDollar(analytics?.metrics?.unrealized_pnl)],
                  ['Gross Exp', fmtPct(analytics?.metrics?.gross_exposure_pct)],
                  ['Delta-Adj Exp', fmtPct(analytics?.metrics?.delta_adjusted_exposure_pct)],
                  ['Port Beta', fmtNum(analytics?.metrics?.portfolio_beta)],
                  ['Largest Wt', fmtPct(analytics?.metrics?.largest_weight_pct)]
                ].map(([label, value]) => (
                  <div className="bbg-card dark" key={label}>
                    <div className="label amber">{label}</div>
                    <div className="value white medium">{value}</div>
                  </div>
                ))}
              </div>

              <div className="port-main-grid">
                <div>
                  <Section title="Current Positions">
                    <div className="bbg-table-wrap">
                      <table className="bbg-table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Last Px</th>
                            <th>MV (CAD)</th>
                            <th>CCY</th>
                            <th>1D P&L</th>
                            <th>U/P&L</th>
                            <th>%1D</th>
                            <th>%5D</th>
                            <th>%1M</th>
                            <th>%3M</th>
                            <th>%YTD</th>
                            <th>Beta</th>
                            <th>Wt</th>
                          </tr>
                        </thead>
                        <tbody>
                          {positionRows.map((row, idx) => (
                            <tr key={idx}>
                              <td className="name-cell">{String(row.Display)}</td>
                              <td>{String(row.Currency)}</td>
                              <td>{fmtNum(Number(row['Current Price (Local)'] ?? NaN))}</td>
                              <td>{fmtDollar(Number(row['Market Value (CAD)'] ?? NaN))}</td>
                              <td>{fmtPct(Number(row['Weight %'] ?? NaN))}</td>
                              <td className={classFor(Number(row['Daily P&L (CAD)'] ?? NaN))}>
                                {fmtDollar(Number(row['Daily P&L (CAD)'] ?? NaN))}
                              </td>
                              <td className={classFor(Number(row['Unrealized P&L (CAD)'] ?? NaN))}>
                                {fmtDollar(Number(row['Unrealized P&L (CAD)'] ?? NaN))}
                              </td>
                              {(['1D %', '5D %', '1M %', '3M %', 'YTD %'] as const).map((k) => (
                                <td key={k} className={classFor(Number(row[k] ?? NaN))}>
                                  {fmtPct(Number(row[k] ?? NaN))}
                                </td>
                              ))}
                              <td>{fmtNum(Number(row.Beta ?? NaN))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Section>
                </div>

                <div>
                  <Section title="Port Notes">
                    <div className="bbg-note">
                      Base reporting currency: CAD
                      <br />
                      Live USD/CAD: {fmtNum(analytics?.usd_cad ?? NaN, 4)}
                      <br /><br />
                      CAD positions: KITS.TO, STCK.TO, Cash.
                      <br />
                      USD positions: EMBJ, GLD call.
                      <br />
                      Option contract multiplier: 100x.
                      <br />
                      All position fields can be edited from Admin.
                    </div>
                  </Section>
                </div>
              </div>
            </Section>

            <Section title="RISK">
              <div className="risk-main-grid">
                <div>
                  <Section title="Position Betas">
                    <div className="bbg-table-wrap">
                      <table className="bbg-table">
                        <thead>
                          <tr>
                            <th>Ticker</th>
                            <th>CCY</th>
                            <th>FX</th>
                            <th>Beta vs SPY</th>
                            <th>Ann Vol</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(analytics?.beta_table ?? []).map((row, idx) => (
                            <tr key={idx}>
                              <td className="name-cell">{String(row.Ticker)}</td>
                              <td>{String(row.Currency)}</td>
                              <td>{fmtNum(Number(row['FX (USD/CAD)'] ?? NaN), 4)}</td>
                              <td>{fmtNum(Number(row['Beta vs SPY'] ?? NaN))}</td>
                              <td>{fmtPct(Number(row['Ann. Vol %'] ?? NaN))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Section>
                </div>

                <div>
                  <Section title="Weight Concentration">
                    <div className="chart-frame small">
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={weightRows} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid stroke="#262626" />
                          <XAxis dataKey="Display" tick={{ fill: '#e7e7e7', fontSize: 10 }} />
                          <YAxis tick={{ fill: '#e7e7e7', fontSize: 10 }} />
                          <Tooltip contentStyle={{ background: '#000', border: '1px solid #555', color: '#fff' }} />
                          <Bar dataKey="Weight" fill="#f4a830" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </Section>
                </div>
              </div>

              <Section title="Risk Framing">
                <div className="bbg-note">
                  This risk panel refreshes every 60 seconds and the backend batches Yahoo Finance requests into grouped downloads to keep API usage disciplined. Manual betas in portfolio settings override computed betas where supplied. The option remains visible on the portfolio tab with its delta-adjusted exposure, but it is not part of the SPY beta table by design.
                </div>
              </Section>
            </Section>
          </>
        )}
      </main>
    </Protected>
  );
}