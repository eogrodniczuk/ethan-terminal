from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass
from typing import Dict, List, Optional

import numpy as np
import pandas as pd
import yfinance as yf
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Ethan's Terminal API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

ASSET_MAP: Dict[str, str] = {
    "BRENT CRUDE": "BZ=F",
    "US 10Y YIELD": "^TNX",
    "VIX": "^VIX",
    "Gold": "GC=F",
    "DXY": "DX-Y.NYB",
    "SPY": "SPY",
}

FX_CANDIDATES = ["USDCAD=X", "CAD=X"]

CACHE_TTL_SECONDS = 55.0
_CACHE: dict[str, tuple[float, object]] = {}

DOWNLOAD_CACHE_TTL_SECONDS = 300.0
_DOWNLOAD_CACHE: dict[str, tuple[float, pd.DataFrame]] = {}

PERIOD_ALIASES: Dict[str, str] = {
    "1D": "5d",
    "3D": "5d",
    "5D": "5d",
    "1M": "1mo",
    "3M": "3mo",
    "6M": "6mo",
    "1Y": "1y",
    "2Y": "2y",
    "5Y": "5y",
    "YTD": "1y",
    "5D_RAW": "5d",
    "1MO": "1mo",
    "3MO": "3mo",
    "6MO": "6mo",
}

LOOKBACK_BY_PERIOD: Dict[str, int] = {
    "5d": 5,
    "1mo": 22,
    "3mo": 66,
    "6mo": 132,
    "1y": 252,
    "2y": 504,
    "5y": 1260,
    "10y": 2520,
    "max": 2520,
}


class PositionPayload(BaseModel):
    sort_order: int = 0
    type: str
    ticker: Optional[str] = None
    display: str
    shares: float = 0.0
    avg_purchase_price: float = 0.0
    cash_value: float = 0.0
    currency: str = "USD"
    contract_multiplier: float = 1.0
    beta: Optional[float] = None
    current_price_override: Optional[float] = None
    delta: Optional[float] = None
    beta_override: Optional[float] = None


class PortfolioRequest(BaseModel):
    positions: List[PositionPayload]
    period: str = "1y"
    force: bool = False


@dataclass
class RegimeOutput:
    label: str
    score: int
    explanation: str
    story: str
    policy_implication: str


def _cache_get(key: str):
    payload = _CACHE.get(key)
    if not payload:
        return None
    ts, value = payload
    if time.time() - ts > CACHE_TTL_SECONDS:
        _CACHE.pop(key, None)
        return None
    return value


def _cache_set(key: str, value: object):
    _CACHE[key] = (time.time(), value)


def _download_cache_get(key: str) -> Optional[pd.DataFrame]:
    payload = _DOWNLOAD_CACHE.get(key)
    if not payload:
        return None
    ts, value = payload
    if time.time() - ts > DOWNLOAD_CACHE_TTL_SECONDS:
        _DOWNLOAD_CACHE.pop(key, None)
        return None
    return value.copy()


def _download_cache_set(key: str, value: pd.DataFrame):
    _DOWNLOAD_CACHE[key] = (time.time(), value.copy())


def _make_cache_key(prefix: str, payload: object) -> str:
    raw = json.dumps(payload, sort_keys=True, default=str).encode("utf-8")
    return f"{prefix}:{hashlib.sha256(raw).hexdigest()}"


def _normalize_period(period: str | None) -> str:
    if not period:
        return "1y"
    p = str(period).strip()
    upper = p.upper()
    if upper in PERIOD_ALIASES:
        return PERIOD_ALIASES[upper]
    return p.lower()


def _default_lookback(period: str) -> int:
    return LOOKBACK_BY_PERIOD.get(period, 252)


def _clean_for_json_df(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df
    return df.replace([np.inf, -np.inf], np.nan).astype(object).where(pd.notna(df), None)


def _clean_for_json_records(records: list[dict]) -> list[dict]:
    cleaned = []
    for row in records:
        out = {}
        for k, v in row.items():
            if isinstance(v, (np.floating, float)):
                out[k] = None if (np.isnan(v) or np.isinf(v)) else float(v)
            elif isinstance(v, (np.integer, int)):
                out[k] = int(v)
            else:
                out[k] = v
        cleaned.append(out)
    return cleaned


def _download_single_close(ticker: str, period: str) -> pd.Series:
    try:
        single = yf.download(
            ticker,
            period=period,
            auto_adjust=False,
            progress=False,
            threads=False,
        )
        if single.empty:
            return pd.Series(dtype=float)

        col = "Adj Close" if "Adj Close" in single.columns else "Close"
        if col not in single.columns:
            return pd.Series(dtype=float)

        ser = single[col].copy().ffill().dropna()
        ser.name = ticker
        return ser
    except Exception:
        return pd.Series(dtype=float)


def _download_multi_close(tickers: list[str], period: str = "1y") -> pd.DataFrame:
    normalized_period = _normalize_period(period)
    clean = [t for t in dict.fromkeys([str(t).strip() for t in tickers if str(t).strip()])]
    if not clean:
        return pd.DataFrame()

    cache_key = _make_cache_key(
        "download-multi-close",
        {"tickers": clean, "period": normalized_period},
    )
    cached = _download_cache_get(cache_key)
    if cached is not None:
        return cached

    frames: dict[str, pd.Series] = {}

    try:
        data = yf.download(
            clean,
            period=normalized_period,
            auto_adjust=False,
            progress=False,
            threads=False,
            group_by="column",
        )

        if not data.empty:
            if isinstance(data.columns, pd.MultiIndex):
                level0 = data.columns.get_level_values(0)
                col = "Adj Close" if "Adj Close" in level0 else "Close"
                closes = data[col].copy()
            else:
                close_col = "Adj Close" if "Adj Close" in data.columns else "Close"
                closes = data[[close_col]].copy()
                closes.columns = clean[:1]

            if isinstance(closes, pd.Series):
                closes = closes.to_frame(name=clean[0])

            for ticker in clean:
                if ticker in closes.columns:
                    ser = closes[ticker].copy().ffill().dropna()
                    if not ser.empty:
                        frames[ticker] = ser
    except Exception:
        pass

    missing = [ticker for ticker in clean if ticker not in frames]
    for ticker in missing:
        ser = _download_single_close(ticker, normalized_period)
        if not ser.empty:
            frames[ticker] = ser

    if not frames:
        empty = pd.DataFrame()
        _download_cache_set(cache_key, empty)
        return empty

    out = pd.concat(frames.values(), axis=1)
    out = out.sort_index().ffill()

    for ticker in clean:
        if ticker not in out.columns:
            out[ticker] = np.nan

    out = out[clean]
    _download_cache_set(cache_key, out)
    return out.copy()


def _download_fx_rate_usd_to_cad() -> float:
    fx = _download_multi_close(FX_CANDIDATES, period="5d")
    for ticker in FX_CANDIDATES:
        if ticker not in fx.columns:
            continue
        ser = fx[ticker].dropna()
        if ser.empty:
            continue
        px = float(ser.iloc[-1])
        if 1.1 <= px <= 1.6:
            return px
        inv = 1.0 / px if px else np.nan
        if pd.notna(inv) and 1.1 <= inv <= 1.6:
            return inv
    return 1.3864


def _series_return_pct(series: pd.Series, periods_back: int) -> float:
    ser = series.ffill().dropna()
    if ser.empty:
        return np.nan
    if len(ser) <= periods_back:
        base = ser.iloc[0]
    else:
        base = ser.iloc[-(periods_back + 1)]
    last = ser.iloc[-1]
    return np.nan if pd.isna(base) or base == 0 else (last / base - 1.0) * 100.0


def _series_ytd_return_pct(series: pd.Series) -> float:
    ser = series.ffill().dropna()
    if ser.empty:
        return np.nan
    year = ser.index[-1].year
    ytd = ser[ser.index.year == year]
    if ytd.empty:
        base = ser.iloc[0]
    else:
        base = ytd.iloc[0]
    last = ser.iloc[-1]
    return np.nan if pd.isna(base) or base == 0 else (last / base - 1.0) * 100.0


def compute_snapshot(df: pd.DataFrame) -> pd.DataFrame:
    work = df.sort_index().ffill()
    if work.empty:
        return pd.DataFrame(columns=["Asset", "Last", "1D %", "5D %", "1M %", "3M %", "YTD %"])

    rows = []
    for asset in work.columns:
        ser = work[asset].ffill().dropna()
        if ser.empty:
            rows.append({
                "Asset": asset,
                "Last": np.nan,
                "1D %": np.nan,
                "5D %": np.nan,
                "1M %": np.nan,
                "3M %": np.nan,
                "YTD %": np.nan,
            })
            continue

        rows.append({
            "Asset": asset,
            "Last": float(ser.iloc[-1]),
            "1D %": _series_return_pct(ser, 1),
            "5D %": _series_return_pct(ser, 5),
            "1M %": _series_return_pct(ser, 21),
            "3M %": _series_return_pct(ser, 63),
            "YTD %": _series_ytd_return_pct(ser),
        })

    out = pd.DataFrame(rows)
    return out.replace([np.inf, -np.inf], np.nan)


def compute_zscores(df: pd.DataFrame, lookback: int = 60) -> pd.Series:
    work = df.ffill().tail(max(lookback, 20))
    if work.empty:
        return pd.Series(dtype=float)
    mean = work.mean()
    std = work.std(ddof=0).replace(0, np.nan)
    latest = work.iloc[-1]
    return ((latest - mean) / std).replace([np.inf, -np.inf], np.nan).fillna(0.0)


def _safe_metric(snapshot: pd.DataFrame, asset: str, column: str, default: float = 0.0) -> float:
    try:
        s = snapshot.set_index("Asset")
        val = s.loc[asset, column]
        if pd.isna(val):
            return default
        return float(val)
    except Exception:
        return default


def classify_regime(snapshot: pd.DataFrame, zscores: pd.Series) -> RegimeOutput:
    oil_5d = _safe_metric(snapshot, "BRENT CRUDE", "5D %")
    vix_5d = _safe_metric(snapshot, "VIX", "5D %")
    spy_5d = _safe_metric(snapshot, "SPY", "5D %")
    yield_5d = _safe_metric(snapshot, "US 10Y YIELD", "5D %")
    gold_5d = _safe_metric(snapshot, "Gold", "5D %")

    score = 0
    if oil_5d > 3:
        score += 2
    if vix_5d > 10:
        score += 2
    if yield_5d > 1:
        score += 1
    if spy_5d < -2:
        score += 2
    if zscores.get("BRENT CRUDE", 0.0) > 1.5:
        score += 1
    if zscores.get("VIX", 0.0) > 1.5:
        score += 1

    if oil_5d > 3 and yield_5d > 1 and spy_5d < 0:
        return RegimeOutput(
            "Inflation / Commodity Shock",
            score,
            "Oil and yields are rising while equities soften, which is the classic inflation-shock pattern.",
            "The market is trading like energy and inflation are back in control.",
            "Fewer cuts get priced, valuation multiples compress, and cyclicals split between energy winners and rate-sensitive losers.",
        )
    if vix_5d > 10 and spy_5d < -2:
        return RegimeOutput(
            "Risk-Off / Volatility Stress",
            score,
            "Volatility is spiking while equities are falling, which usually points to de-risking and tighter financial conditions.",
            "The tape is behaving like a broad risk-off episode rather than a single-stock drawdown.",
            "PMs usually reduce gross, tighten risk, and wait for volatility to stabilize.",
        )
    if spy_5d > 1 and vix_5d < 0 and yield_5d <= 1:
        return RegimeOutput(
            "Risk-On / Constructive",
            score,
            "Equities are advancing while volatility is easing and yields are not forcing a reset.",
            "The tape is behaving like a constructive growth or disinflation environment.",
            "Breadth and cyclicals usually matter more in this type of regime.",
        )
    if spy_5d < -2 and yield_5d < -2 and gold_5d > 1:
        return RegimeOutput(
            "Growth Scare / Defensive",
            score,
            "Equities are soft while yields fall and gold catches a bid, which is consistent with a classic slowdown scare.",
            "The market is leaning toward lower-growth, defensive positioning rather than inflation stress.",
            "Duration and defensive equity groups tend to outperform if this persists.",
        )
    return RegimeOutput(
        "Neutral / Mixed",
        score,
        "Cross-asset signals are mixed, with no single macro narrative dominating yet.",
        "The market does not have a clean, high-conviction regime signal at the moment.",
        "Stay selective and watch for confirmation from oil, yields, volatility, and equities together.",
    )


def build_alerts(snapshot: pd.DataFrame, zscores: pd.Series) -> List[Dict[str, str]]:
    alerts: List[Dict[str, str]] = []
    oil_last = _safe_metric(snapshot, "BRENT CRUDE", "Last")
    oil_5d = _safe_metric(snapshot, "BRENT CRUDE", "5D %")
    vix_last = _safe_metric(snapshot, "VIX", "Last")
    vix_5d = _safe_metric(snapshot, "VIX", "5D %")
    spy_5d = _safe_metric(snapshot, "SPY", "5D %")
    yield_5d = _safe_metric(snapshot, "US 10Y YIELD", "5D %")
    gold_5d = _safe_metric(snapshot, "Gold", "5D %")
    dxy_5d = _safe_metric(snapshot, "DXY", "5D %")

    if oil_last >= 85 or oil_5d >= 5:
        alerts.append({"level": "High", "signal": "Oil stress", "detail": f"Brent is at {oil_last:.2f} with a {oil_5d:.2f}% 5-day move."})
    if vix_last >= 22 or vix_5d >= 15:
        alerts.append({"level": "High", "signal": "Volatility breakout", "detail": f"VIX is at {vix_last:.2f} with a {vix_5d:.2f}% 5-day move."})
    if yield_5d > 2 and spy_5d < 0:
        alerts.append({"level": "Medium", "signal": "Rates up / equities down", "detail": "Higher yields are hitting equity valuation support."})
    if oil_5d > 0 and yield_5d > 0 and spy_5d < 0:
        alerts.append({"level": "High", "signal": "Inflation-shock pattern", "detail": "Oil and yields are rising while equities weaken."})
    if spy_5d < -2 and gold_5d <= 0:
        alerts.append({"level": "Medium", "signal": "Gold failing as a hedge", "detail": "Equities are down but gold is not acting defensively."})
    if dxy_5d > 1:
        alerts.append({"level": "Low", "signal": "Dollar strength", "detail": f"DXY is up {dxy_5d:.2f}% over 5 days."})
    if zscores.get("BRENT CRUDE", 0.0) > 1.5 and zscores.get("VIX", 0.0) > 1.5:
        alerts.append({"level": "High", "signal": "Cross-asset stress confirmation", "detail": "Oil and VIX are both materially above their recent normal ranges."})
    if not alerts:
        alerts.append({"level": "Low", "signal": "No acute stress trigger", "detail": "Nothing has crossed the default dashboard thresholds today."})
    return alerts


def normalize_prices(df: pd.DataFrame, days: int) -> pd.DataFrame:
    work = df.ffill().dropna(how="all").tail(max(days, 2)).copy()
    if work.empty:
        return work

    out = pd.DataFrame(index=work.index)
    for col in work.columns:
        ser = work[col].ffill().dropna()
        if ser.empty:
            out[col] = np.nan
            continue
        base = ser.iloc[0]
        if pd.isna(base) or base == 0:
            out[col] = np.nan
            continue
        normalized = (work[col].ffill() / base) * 100.0
        out[col] = normalized

    return out.replace([np.inf, -np.inf], np.nan)


def _series_return_map(series: pd.Series) -> dict:
    return {
        "1D %": _series_return_pct(series, 1),
        "5D %": _series_return_pct(series, 5),
        "1M %": _series_return_pct(series, 21),
        "3M %": _series_return_pct(series, 63),
        "YTD %": _series_ytd_return_pct(series),
    }


def _load_latest_prices_into_maps(
    frame: pd.DataFrame,
    tickers: list[str],
    latest_price_map: dict[str, float],
    prev_price_map: dict[str, float],
) -> None:
    if frame is None or frame.empty:
        return

    for ticker in tickers:
        if ticker not in frame.columns:
            continue
        ser = frame[ticker].ffill().dropna()
        if ser.empty:
            continue
        latest_price_map[ticker] = float(ser.iloc[-1])
        prev_price_map[ticker] = float(ser.iloc[-2]) if len(ser) >= 2 else float(ser.iloc[-1])


@app.get("/")
def root():
    return {"status": "ok", "service": "ethans-terminal-api"}


@app.get("/health")
def health():
    return {
        "ok": True,
        "cache_ttl_seconds": CACHE_TTL_SECONDS,
        "download_cache_ttl_seconds": DOWNLOAD_CACHE_TTL_SECONDS,
    }


@app.get("/market/dashboard")
def market_dashboard(
    period: str = "1y",
    lookback: int = 252,
    assets: str = "BRENT CRUDE,US 10Y YIELD,VIX,Gold,SPY,DXY",
    force: bool = False,
):
    normalized_period = _normalize_period(period)
    resolved_lookback = max(lookback if lookback and lookback > 0 else _default_lookback(normalized_period), 2)

    payload = {
        "period": normalized_period,
        "lookback": resolved_lookback,
        "assets": assets,
    }
    cache_key = _make_cache_key("market-dashboard", payload)

    if not force:
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached

    chosen = [a.strip() for a in assets.split(",") if a.strip() in ASSET_MAP]
    mapped = [ASSET_MAP[a] for a in chosen]
    raw = _download_multi_close(mapped, normalized_period)

    if raw.empty:
        result = {
            "snapshot": [],
            "regime": RegimeOutput(
                "Neutral / Mixed",
                0,
                "No market data available.",
                "Waiting for data.",
                "No policy implication.",
            ).__dict__,
            "alerts": [],
            "chart": [],
            "commentary": {
                "main_driver": "No market data available.",
                "market_implication": "No market implication available.",
                "policy_implication": "No policy implication available.",
            },
            "last_updated_epoch_ms": int(time.time() * 1000),
        }
        _cache_set(cache_key, result)
        return result

    data = pd.DataFrame(index=raw.index)
    for label, ticker in zip(chosen, mapped):
        if ticker in raw.columns:
            data[label] = raw[ticker]
        else:
            data[label] = np.nan

    data = data.sort_index().ffill()

    if data.empty:
        result = {
            "snapshot": [],
            "regime": RegimeOutput(
                "Neutral / Mixed",
                0,
                "No market data available.",
                "Waiting for data.",
                "No policy implication.",
            ).__dict__,
            "alerts": [],
            "chart": [],
            "commentary": {
                "main_driver": "No market data available.",
                "market_implication": "No market implication available.",
                "policy_implication": "No policy implication available.",
            },
            "last_updated_epoch_ms": int(time.time() * 1000),
        }
        _cache_set(cache_key, result)
        return result

    snapshot = compute_snapshot(data)
    zscores = compute_zscores(data, lookback=min(max(resolved_lookback, 20), len(data)))
    regime = classify_regime(snapshot, zscores)
    alerts = build_alerts(snapshot, zscores)

    chart = normalize_prices(data[chosen], resolved_lookback).reset_index().rename(columns={"Date": "date", "index": "date"})
    chart["date"] = chart["date"].astype(str)

    snapshot_json = _clean_for_json_records(snapshot.to_dict(orient="records"))
    chart_json = _clean_for_json_records(_clean_for_json_df(chart).to_dict(orient="records"))

    result = {
        "snapshot": snapshot_json,
        "regime": regime.__dict__,
        "alerts": alerts,
        "chart": chart_json,
        "commentary": {
            "main_driver": f"Main driver: {regime.story}",
            "market_implication": f"Main market implication: {alerts[0]['signal']}. {regime.explanation}" if alerts else regime.explanation,
            "policy_implication": f"Policy implication: {regime.policy_implication}",
        },
        "last_updated_epoch_ms": int(time.time() * 1000),
    }
    _cache_set(cache_key, result)
    return result


@app.post("/portfolio/analytics")
def portfolio_analytics(payload: PortfolioRequest):
    normalized_period = _normalize_period(payload.period)
    payload_dict = payload.model_dump()
    payload_dict["period"] = normalized_period
    cache_key = _make_cache_key("portfolio-analytics", payload_dict)

    if not payload.force:
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached

    positions = [p.model_dump() for p in payload.positions]
    holdings = pd.DataFrame(positions)

    if holdings.empty:
        result = {
            "usd_cad": 1.3864,
            "rows": [],
            "metrics": {},
            "beta_table": [],
            "history": [],
            "last_updated_epoch_ms": int(time.time() * 1000),
        }
        _cache_set(cache_key, result)
        return result

    usd_cad = _download_fx_rate_usd_to_cad()

    liquid_tickers = holdings.loc[holdings["type"].isin(["Equity", "ETF"]), "ticker"].dropna().astype(str).tolist()
    price_tickers = holdings.loc[holdings["type"].isin(["Equity", "ETF", "Option"]), "ticker"].dropna().astype(str).tolist()
    unique_liquid = list(dict.fromkeys([str(t).strip() for t in liquid_tickers if str(t).strip()]))
    unique_prices = list(dict.fromkeys([str(t).strip() for t in price_tickers if str(t).strip()]))

    perf_prices = _download_multi_close(unique_liquid, period=normalized_period) if unique_liquid else pd.DataFrame()
    recent_prices = _download_multi_close(unique_prices, period="1mo") if unique_prices else pd.DataFrame()

    latest_price_map: dict[str, float] = {}
    prev_price_map: dict[str, float] = {}

    _load_latest_prices_into_maps(perf_prices, unique_prices, latest_price_map, prev_price_map)

    missing_prices = [ticker for ticker in unique_prices if ticker not in latest_price_map]
    if missing_prices:
        _load_latest_prices_into_maps(recent_prices, missing_prices, latest_price_map, prev_price_map)

    perf_map_by_ticker = {}
    for ticker in unique_liquid:
        if not perf_prices.empty and ticker in perf_prices.columns:
            perf_map_by_ticker[ticker] = _series_return_map(perf_prices[ticker])
        else:
            perf_map_by_ticker[ticker] = {k: np.nan for k in ["1D %", "5D %", "1M %", "3M %", "YTD %"]}

    rows = []
    total_cost_basis_non_cash = 0.0

    for _, row in holdings.iterrows():
        typ = str(row.get("type") or "").strip()
        ticker = str(row.get("ticker") or "").strip()
        display = str(row.get("display") or ticker).strip()
        shares = float(row.get("shares") or 0)
        avg_price_local = float(row.get("avg_purchase_price") or 0)
        cash_value = float(row.get("cash_value") or 0)
        currency = str(row.get("currency") or "USD").upper().strip()
        multiplier = float(row.get("contract_multiplier") or 1)
        fx_rate = 1.0 if currency == "CAD" else usd_cad
        current_price_override = row.get("current_price_override")
        beta_override = row.get("beta_override")
        base_beta = row.get("beta")
        delta_override = row.get("delta")

        if typ == "Cash":
            current_price_local = 1.0
            cost_basis_cad = cash_value
            market_value_cad = cash_value
            daily_pnl_cad = 0.0
            delta = 0.0
            beta = 0.0
            perf_map = {k: np.nan for k in ["1D %", "5D %", "1M %", "3M %", "YTD %"]}
        else:
            latest_px = latest_price_map.get(ticker, np.nan)
            prev_px = prev_price_map.get(ticker, np.nan)

            if current_price_override is not None and pd.notna(current_price_override):
                current_price_local = float(current_price_override)
            elif pd.notna(latest_px):
                current_price_local = float(latest_px)
            else:
                current_price_local = np.nan

            units = shares * multiplier
            cost_basis_local = units * avg_price_local
            total_cost_basis_non_cash += cost_basis_local * fx_rate
            market_value_local = units * current_price_local if pd.notna(current_price_local) else np.nan
            cost_basis_cad = cost_basis_local * fx_rate if pd.notna(cost_basis_local) else np.nan
            market_value_cad = market_value_local * fx_rate if pd.notna(market_value_local) else np.nan

            if pd.notna(prev_px) and pd.notna(current_price_local):
                daily_pnl_cad = units * (float(current_price_local) - float(prev_px)) * fx_rate
            else:
                daily_pnl_cad = np.nan

            if typ == "Option":
                delta = float(delta_override) if delta_override is not None and pd.notna(delta_override) else 0.0
            else:
                delta = 1.0

            if beta_override is not None and pd.notna(beta_override):
                beta = float(beta_override)
            elif base_beta is not None and pd.notna(base_beta):
                beta = float(base_beta)
            else:
                beta = np.nan

            if typ in ["Equity", "ETF"] and ticker:
                perf_map = perf_map_by_ticker.get(ticker, {k: np.nan for k in ["1D %", "5D %", "1M %", "3M %", "YTD %"]})
            else:
                perf_map = {k: np.nan for k in ["1D %", "5D %", "1M %", "3M %", "YTD %"]}

        unrealized_pnl_cad = market_value_cad - cost_basis_cad if pd.notna(market_value_cad) else np.nan
        delta_adjusted_market_value_cad = market_value_cad * delta if pd.notna(market_value_cad) else np.nan

        rows.append({
            "Type": typ,
            "Display": display,
            "Ticker": ticker,
            "Currency": currency,
            "FX (USD/CAD)": fx_rate,
            "Current Price (Local)": current_price_local,
            "Market Value (CAD)": market_value_cad,
            "Weight %": np.nan,
            "Daily P&L (CAD)": daily_pnl_cad,
            "Unrealized P&L (CAD)": unrealized_pnl_cad,
            "1D %": perf_map["1D %"],
            "5D %": perf_map["5D %"],
            "1M %": perf_map["1M %"],
            "3M %": perf_map["3M %"],
            "YTD %": perf_map["YTD %"],
            "Delta": delta,
            "Delta-Adj MV (CAD)": delta_adjusted_market_value_cad,
            "Beta": beta,
        })

    out = pd.DataFrame(rows)
    total_value = out["Market Value (CAD)"].fillna(0).sum()
    out["Weight %"] = np.where(total_value != 0, out["Market Value (CAD)"].fillna(0) / total_value * 100.0, np.nan)

    cash_value = out.loc[out["Type"] == "Cash", "Market Value (CAD)"].fillna(0).sum()
    daily_pnl = out["Daily P&L (CAD)"].fillna(0).sum()
    unrealized_pnl = out.loc[out["Type"] != "Cash", "Unrealized P&L (CAD)"].fillna(0).sum()
    gross_exposure = out.loc[out["Type"] != "Cash", "Market Value (CAD)"].fillna(0).sum()
    delta_adjusted_exposure = out.loc[out["Type"] != "Cash", "Delta-Adj MV (CAD)"].fillna(0).sum()

    beta_df = out[(out["Type"] != "Cash") & out["Beta"].notna()].copy()
    portfolio_beta = (beta_df["Beta"] * beta_df["Market Value (CAD)"]).sum() / total_value if not beta_df.empty and total_value else np.nan

    metrics = {
        "portfolio_value": float(total_value),
        "cash_value": float(cash_value),
        "daily_pnl": float(daily_pnl),
        "unrealized_pnl": float(unrealized_pnl),
        "gross_exposure_pct": float(gross_exposure / total_value * 100.0) if total_value else np.nan,
        "delta_adjusted_exposure_pct": float(delta_adjusted_exposure / total_value * 100.0) if total_value else np.nan,
        "portfolio_beta": float(portfolio_beta) if pd.notna(portfolio_beta) else np.nan,
        "largest_weight_pct": float(out.loc[out["Type"] != "Cash", "Weight %"].max()) if not out.empty else np.nan,
        "invested_cost_basis_cad": float(total_cost_basis_non_cash),
    }

    history_records = []
    liquid = holdings.loc[holdings["type"].isin(["Equity", "ETF"]), ["ticker", "shares", "currency"]].dropna(subset=["ticker"])
    if not liquid.empty:
        liquid = liquid.copy()
        liquid["ticker"] = liquid["ticker"].astype(str).str.strip()
        liquid["currency"] = liquid["currency"].astype(str).str.upper().str.strip()

        tickers = liquid["ticker"].tolist()
        shares_map = dict(zip(liquid["ticker"], liquid["shares"]))
        currency_map = dict(zip(liquid["ticker"], liquid["currency"]))
        prices = _download_multi_close(tickers, period=normalized_period)

        if not prices.empty:
            aligned = prices.copy()
            for col in aligned.columns:
                fx = 1.0 if currency_map.get(col, "USD") == "CAD" else usd_cad
                aligned[col] = aligned[col] * float(shares_map.get(col, 0.0)) * fx
            total = aligned.sum(axis=1).to_frame(name="Liquid Holdings (CAD)")
            total["Liquid Holdings + Cash (CAD)"] = total["Liquid Holdings (CAD)"] + cash_value
            total = total.reset_index().rename(columns={"Date": "date", "index": "date"})
            total["date"] = total["date"].astype(str)
            history_records = _clean_for_json_records(total.to_dict(orient="records"))

    beta_rows = []
    beta_tickers = holdings.loc[holdings["type"].isin(["Equity", "ETF"]), "ticker"].dropna().astype(str).str.strip().unique().tolist()
    if beta_tickers:
        prices = _download_multi_close(beta_tickers + ["SPY"], period=normalized_period)
        if not prices.empty and "SPY" in prices.columns:
            rets = prices.pct_change().dropna(how="all")
            spy = rets["SPY"].dropna()

            for t in beta_tickers:
                if t not in rets.columns:
                    continue

                tmp = pd.concat([rets[t], spy], axis=1).dropna()
                if len(tmp) < 30:
                    calc_beta, vol = np.nan, np.nan
                else:
                    cov = tmp.iloc[:, 0].cov(tmp.iloc[:, 1])
                    var = tmp.iloc[:, 1].var()
                    calc_beta = cov / var if var != 0 else np.nan
                    vol = tmp.iloc[:, 0].std() * np.sqrt(252) * 100.0

                mrow = holdings.loc[holdings["ticker"].astype(str).str.strip() == t].iloc[0]
                manual_beta = mrow.get("beta")

                beta_rows.append({
                    "Ticker": t,
                    "Currency": mrow.get("currency", "USD"),
                    "FX (USD/CAD)": 1.0 if str(mrow.get("currency", "USD")).upper().strip() == "CAD" else usd_cad,
                    "Beta vs SPY": float(manual_beta) if pd.notna(manual_beta) else calc_beta,
                    "Ann. Vol %": vol,
                })

    result = {
        "usd_cad": usd_cad,
        "rows": _clean_for_json_records(
            out.sort_values(["Type", "Market Value (CAD)"], ascending=[True, False]).to_dict(orient="records")
        ),
        "metrics": {
            k: (None if pd.isna(v) else v) for k, v in metrics.items()
        },
        "beta_table": _clean_for_json_records(beta_rows),
        "history": history_records,
        "last_updated_epoch_ms": int(time.time() * 1000),
    }

    _cache_set(cache_key, result)
    return result

@app.get("/api")
def api_root():
    return root()

@app.get("/api/health")
def api_health():
    return health()

@app.get("/api/market/dashboard")
def api_market_dashboard(
    period: str = "1y",
    lookback: int = 252,
    assets: str = "BRENT CRUDE,US 10Y YIELD,VIX,Gold,SPY,DXY",
    force: bool = False,
):
    return market_dashboard(
        period=period,
        lookback=lookback,
        assets=assets,
        force=force,
    )

@app.post("/api/portfolio/analytics")
def api_portfolio_analytics(payload: PortfolioRequest):
    return portfolio_analytics(payload)