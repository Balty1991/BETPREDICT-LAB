#!/usr/bin/env python3
"""
BetPredict LAB — Safe Picks Gate + Published Picks Snapshot.

Scop:
  1) scanează signals_v6.json;
  2) separă selecțiile în safe_picks / watchlist / rejected;
  3) publică un snapshot zilnic stabil pentru UI;
  4) salvează în jurnalul publicat doar ce se vede în rubrica de predicții validate.

Regula principală:
  Predicții afișate = Predicții publicate = Predicții folosite la ROI-ul principal.

Notă:
  selection_journal.json rămâne jurnalul intern/raw existent.
  data/selection_journal_published.json este jurnalul curat pentru predicțiile afișate efectiv.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
DEBUG_DIR = DATA_DIR / "debug"

CANDIDATES_PATH = DATA_DIR / "safe_picks_today.json"
PUBLISHED_PATH = DATA_DIR / "published_safe_picks_today.json"
PUBLISHED_JOURNAL_PATH = DATA_DIR / "selection_journal_published.json"
DEBUG_PATH = DEBUG_DIR / "safe_picks_gate_debug.json"

APP_TZ = ZoneInfo("Europe/Bucharest")

SAFE_MARKETS = {"under35", "over25", "under25"}
SAFE_STRATEGIES = {"smart_ev", "conservative"}
WATCHLIST_ALLOWED_STRATEGIES = SAFE_STRATEGIES | {"engine_overall", "best_single"}

MIN_GRADE_RANK = 4  # A
MIN_EV_PCT = 0.0
MIN_PROB_PCT = 55.0
ODDS_MIN = 1.10
ODDS_MAX = 2.30
NEGATIVE_SAMPLE_MIN = 15
MAX_PUBLISHED_PER_DAY = 5

GRADE_RANK = {
    "A+": 5,
    "A": 4,
    "B+": 3,
    "B": 3,
    "C+": 2,
    "C": 2,
    "D": 1,
    "E": 0,
    "F": 0,
    "": -1,
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return utc_now().isoformat(timespec="seconds")


def today_key() -> str:
    """Business day used by the app: Romanian local date, not UTC date."""
    return utc_now().astimezone(APP_TZ).date().isoformat()


def read_json(path: Path, default: Any) -> Any:
    try:
        if not path.exists():
            return default
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def as_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace(",", ".")
    if not text:
        return default
    pct = text.endswith("%")
    text = text.rstrip("%")
    try:
        num = float(text)
    except Exception:
        return default
    if pct:
        return num
    return num


def as_percent(value: Any, default: float = 0.0) -> float:
    num = as_float(value, default)
    if 0 < num <= 1:
        return num * 100.0
    return num


def grade_rank(value: Any) -> int:
    return GRADE_RANK.get(str(value or "").upper(), -1)


def normalize_market(value: Any) -> str:
    raw = str(value or "").strip()
    if raw in {"under35", "over25", "under25", "over15", "btts", "homeWin", "awayWin", "draw"}:
        return raw
    s = raw.lower().replace(" ", "").replace("_", "").replace("-", "")
    if "under3.5" in s or "under35" in s or "u3.5" in s:
        return "under35"
    if "over2.5" in s or "over25" in s or "o2.5" in s:
        return "over25"
    if "under2.5" in s or "under25" in s or "u2.5" in s:
        return "under25"
    if "over1.5" in s or "over15" in s or "o1.5" in s:
        return "over15"
    if "btts" in s or "bothteamstoscore" in s:
        return "btts"
    return raw


def normalize_status(value: Any) -> str:
    return str(value or "").strip().upper()


def event_id(sig: dict[str, Any]) -> str:
    return str(sig.get("event_id") or sig.get("id") or sig.get("match_id") or "").strip()


def event_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        # ISO values from BSD/data usually end in Z. Convert them to timezone-aware UTC.
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        dt = datetime.fromisoformat(text)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=APP_TZ)
        return dt
    except Exception:
        return None


def item_kickoff(item: dict[str, Any]) -> Any:
    return item.get("kickoff") or item.get("event_date") or item.get("start_time") or item.get("date")


def event_local_date(item: dict[str, Any]) -> str:
    dt = event_datetime(item_kickoff(item))
    if not dt:
        return ""
    return dt.astimezone(APP_TZ).date().isoformat()


def is_event_today(item: dict[str, Any]) -> bool:
    return event_local_date(item) == today_key()


def published_date(value: Any | None = None) -> str:
    if not value:
        return today_key()
    text = str(value)
    match = re.match(r"^(\d{4}-\d{2}-\d{2})", text)
    return match.group(1) if match else today_key()


def pick_key(item: dict[str, Any]) -> str:
    return f"{item.get('event_id')}|{normalize_market(item.get('market'))}|{item.get('published_date') or today_key()}"


def get_stats(summary: dict[str, Any], group: str, key: str) -> dict[str, Any]:
    node = (summary.get(group) or {}).get(key) or {}
    if isinstance(node, dict) and isinstance(node.get("stats"), dict):
        return node["stats"]
    return node if isinstance(node, dict) else {}


def sample_count(stats: dict[str, Any]) -> int:
    return int(as_float(stats.get("sample", stats.get("n", stats.get("count", 0))), 0))


def roi_pct(stats: dict[str, Any]) -> float:
    return as_float(stats.get("roi_pct", 0.0), 0.0)


def weak_leagues(monitor: dict[str, Any]) -> set[str]:
    quality = monitor.get("model_quality_check") or {}
    weak = set(str(x).strip() for x in quality.get("downweight_candidates", []) if str(x).strip())
    league_roi = quality.get("league_roi_sample") or {}
    for league, roi in league_roi.items():
        if as_float(roi, 0.0) <= -10.0:
            weak.add(str(league).strip())
    return weak


def value_source_confirmed(audit: dict[str, Any]) -> bool:
    summary = audit.get("summary") or {}
    source = str(audit.get("source") or summary.get("source") or "").lower()
    official_count = int(as_float(summary.get("official_or_bsd_sources", 0), 0))
    local_count = int(as_float(summary.get("local_sources", 0), 0))
    if official_count > 0:
        return True
    if "bsd" in source and "local" not in source:
        return True
    return local_count == 0 and "local" not in source


def probability_pct(sig: dict[str, Any]) -> float:
    for key in ("probability_pct", "adj_prob", "calibrated_prob", "probability", "prob", "model_probability"):
        if sig.get(key) is not None:
            return round(as_percent(sig.get(key)), 2)
    return 0.0


def ev_calibrated_pct(sig: dict[str, Any]) -> float:
    if sig.get("ev_calibrated_pct") is not None:
        return round(as_float(sig.get("ev_calibrated_pct")), 2)
    if sig.get("ev_calibrated") is not None:
        ev = as_float(sig.get("ev_calibrated"))
        return round(ev * 100.0 if -1.5 <= ev <= 1.5 else ev, 2)
    if sig.get("ev_pct") is not None:
        return round(as_float(sig.get("ev_pct")), 2)
    if sig.get("ev") is not None:
        ev = as_float(sig.get("ev"))
        return round(ev * 100.0 if -1.5 <= ev <= 1.5 else ev, 2)
    return 0.0


def odds_value(sig: dict[str, Any]) -> float:
    return round(as_float(sig.get("odds") or sig.get("odd") or sig.get("best_odd") or sig.get("selected_odd")), 3)


def recommended_pick(sig: dict[str, Any]) -> str:
    return str(sig.get("recommended_pick") or sig.get("pick") or sig.get("market_label") or normalize_market(sig.get("market")) or "").strip()


def has_missing_core_data(sig: dict[str, Any]) -> bool:
    return not all([
        event_id(sig),
        str(sig.get("home_team") or sig.get("home") or "").strip(),
        str(sig.get("away_team") or sig.get("away") or "").strip(),
        normalize_market(sig.get("market")),
        recommended_pick(sig),
        odds_value(sig) > 0,
        probability_pct(sig) > 0,
    ])


def calibrator_status(sig: dict[str, Any]) -> str:
    for key in ("calibrator_status", "calibration_status", "calibration_health", "calibrator_health"):
        if sig.get(key) is not None:
            return normalize_status(sig.get(key))
    return ""


def block_reasons(sig: dict[str, Any], perf: dict[str, Any], monitor: dict[str, Any], odds_audit: dict[str, Any]) -> list[str]:
    reasons: list[str] = []
    market = normalize_market(sig.get("market"))
    strategy = str(sig.get("strategy") or "").strip()
    league = str(sig.get("league") or "").strip()
    status = normalize_status(sig.get("_v6_status") or sig.get("v6_status"))
    grade = str(sig.get("quality_grade_v6") or sig.get("quality_grade") or sig.get("grade") or "").upper()
    ev_pct = ev_calibrated_pct(sig)
    prob_pct = probability_pct(sig)
    odds = odds_value(sig)
    market_stats = get_stats(perf, "by_market", market)
    strategy_stats = get_stats(perf, "by_strategy", strategy)
    weak = weak_leagues(monitor)
    cal_status = calibrator_status(sig)

    if status == "DOWNGRADED":
        reasons.append("DOWNGRADED")
    if ev_pct <= MIN_EV_PCT:
        reasons.append("EV_NEGATIVE_OR_ZERO")
    if sig.get("odds_real") is not True:
        reasons.append("ODDS_NOT_REAL")
    if grade_rank(grade) < MIN_GRADE_RANK:
        reasons.append("GRADE_BELOW_A")
    if has_missing_core_data(sig):
        reasons.append("MISSING_CORE_DATA")
    if not is_event_today(sig):
        reasons.append("NOT_TODAY_MATCH")
    if odds < ODDS_MIN or odds > ODDS_MAX:
        reasons.append("ODDS_OUTSIDE_SAFE_RANGE")
    if prob_pct < MIN_PROB_PCT:
        reasons.append("PROBABILITY_TOO_LOW")
    if market not in SAFE_MARKETS:
        reasons.append("MARKET_NOT_IN_SAFE_ALLOWLIST")
    if strategy not in SAFE_STRATEGIES:
        reasons.append("STRATEGY_NOT_IN_SAFE_ALLOWLIST")
    if league and league in weak:
        reasons.append("WEAK_LEAGUE")
    if cal_status in {"CRITICAL", "NO_DATA"}:
        reasons.append(f"CALIBRATOR_{cal_status}")
    if sample_count(market_stats) >= NEGATIVE_SAMPLE_MIN and roi_pct(market_stats) < 0:
        reasons.append("MARKET_ROI_NEGATIVE")
    if sample_count(strategy_stats) >= NEGATIVE_SAMPLE_MIN and roi_pct(strategy_stats) < 0:
        reasons.append("STRATEGY_ROI_NEGATIVE")
    if strategy == "value_bets" and not value_source_confirmed(odds_audit):
        reasons.append("LOCAL_VALUE_NOT_CONFIRMED")

    return sorted(set(reasons))


def stats_for(sig: dict[str, Any], perf: dict[str, Any]) -> dict[str, Any]:
    market = normalize_market(sig.get("market"))
    strategy = str(sig.get("strategy") or "").strip()
    ms = get_stats(perf, "by_market", market)
    ss = get_stats(perf, "by_strategy", strategy)
    return {
        "market_roi_pct": round(roi_pct(ms), 2),
        "market_sample": sample_count(ms),
        "strategy_roi_pct": round(roi_pct(ss), 2),
        "strategy_sample": sample_count(ss),
    }


def safe_score(sig: dict[str, Any], perf: dict[str, Any], reasons: list[str]) -> float:
    st = stats_for(sig, perf)
    prob = probability_pct(sig)
    ev = max(0.0, ev_calibrated_pct(sig))
    grade_bonus = grade_rank(sig.get("quality_grade_v6")) * 5.0
    score = 0.45 * prob + 0.30 * min(ev, 60.0) + grade_bonus
    score += max(-8.0, min(10.0, st["market_roi_pct"])) * 0.8
    score += max(-8.0, min(10.0, st["strategy_roi_pct"])) * 0.8
    score -= len(reasons) * 8.0
    return round(max(0.0, min(100.0, score)), 1)


def explain_safe(item: dict[str, Any]) -> str:
    return (
        "A trecut filtrele: EV pozitiv, cotă reală, status v6 valid, "
        "grad minim A și istoric ROI acceptat."
    )


def explain_blocked(reasons: list[str]) -> str:
    if not reasons:
        return "Semnal acceptat."
    return "Blocat de Safe Picks Gate: " + ", ".join(reasons[:5])


def compact_item(sig: dict[str, Any], perf: dict[str, Any], reasons: list[str], category: str) -> dict[str, Any]:
    market = normalize_market(sig.get("market"))
    item = {
        "event_id": event_id(sig),
        "market": market,
        "recommended_pick": recommended_pick(sig),
        "home_team": str(sig.get("home_team") or sig.get("home") or "").strip(),
        "away_team": str(sig.get("away_team") or sig.get("away") or "").strip(),
        "league": str(sig.get("league") or "").strip(),
        "country": sig.get("country"),
        "kickoff": sig.get("event_date") or sig.get("kickoff") or sig.get("start_time"),
        "odds": odds_value(sig),
        "odds_real": sig.get("odds_real") is True,
        "probability_pct": probability_pct(sig),
        "ev_calibrated_pct": ev_calibrated_pct(sig),
        "quality_grade_v6": str(sig.get("quality_grade_v6") or "").upper(),
        "v6_status": normalize_status(sig.get("_v6_status") or sig.get("v6_status")),
        "strategy": str(sig.get("strategy") or "").strip(),
        "strategy_label": sig.get("strategy_label"),
        "display_score": as_float(sig.get("display_score"), 0.0),
        "smartbet_score": as_float(sig.get("smartbet_score_v6") or sig.get("smartbet_score"), 0.0),
        "category": category,
        "block_reasons": reasons,
        "source": "safe_picks_gate",
    }
    item.update(stats_for(sig, perf))
    item["safe_score"] = safe_score(sig, perf, reasons)
    item["confidence_score"] = item["safe_score"]
    item["explain"] = explain_safe(item) if category == "safe" else explain_blocked(reasons)
    return item


def classify_signal(sig: dict[str, Any], perf: dict[str, Any], monitor: dict[str, Any], odds_audit: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    reasons = block_reasons(sig, perf, monitor, odds_audit)
    if not reasons:
        return "safe", compact_item(sig, perf, reasons, "safe")

    strategy = str(sig.get("strategy") or "").strip()
    soft_blockers = {"STRATEGY_NOT_IN_SAFE_ALLOWLIST"}
    hard_reasons = set(reasons) - soft_blockers
    if (
        strategy in WATCHLIST_ALLOWED_STRATEGIES
        and not {"DOWNGRADED", "EV_NEGATIVE_OR_ZERO", "ODDS_NOT_REAL", "MISSING_CORE_DATA"} & set(reasons)
        and ev_calibrated_pct(sig) > 0
        and grade_rank(sig.get("quality_grade_v6")) >= 3
        and odds_value(sig) > 0
    ):
        item = compact_item(sig, perf, reasons, "watchlist")
        if hard_reasons or item["safe_score"] >= 35:
            return "watchlist", item

    return "rejected", compact_item(sig, perf, reasons, "rejected")


def publish_snapshot(candidates: list[dict[str, Any]]) -> dict[str, Any]:
    now = iso_now()
    day = today_key()
    previous = read_json(PUBLISHED_PATH, {})
    previous_picks = previous.get("safe_picks", []) if isinstance(previous, dict) else []

    merged: dict[str, dict[str, Any]] = {}

    for item in previous_picks:
        if not isinstance(item, dict):
            continue
        # Keep only today's already-published pending snapshot. If an older buggy
        # snapshot contains tomorrow/future matches, do not carry it forward.
        if item.get("published_date") == day and is_event_today(item):
            merged[pick_key(item)] = item

    for item in candidates:
        pub = deepcopy(item)
        pub.setdefault("published_at", now)
        pub.setdefault("published_date", day)
        pub.setdefault("status", "PENDING")
        pub["source"] = "published_safe_picks_today"
        pub["category"] = "safe"
        merged.setdefault(pick_key(pub), pub)

    picks = sorted(merged.values(), key=lambda x: x.get("safe_score", 0), reverse=True)[:MAX_PUBLISHED_PER_DAY]
    return {
        "generated_at": now,
        "published_date": day,
        "source": "published_safe_picks_today",
        "summary": {
            "published_count": len(picks),
            "max_published_per_day": MAX_PUBLISHED_PER_DAY,
        },
        "safe_picks": picks,
    }


def update_published_journal(published: dict[str, Any]) -> dict[str, Any]:
    existing = read_json(PUBLISHED_JOURNAL_PATH, {})
    if not isinstance(existing, dict):
        existing = {}
    records = existing.get("results", [])
    if not isinstance(records, list):
        records = []

    by_key: dict[str, dict[str, Any]] = {}
    for rec in records:
        if not isinstance(rec, dict):
            continue
        # Correction guard: remove current-day PENDING records that were published
        # by the previous bug even though their kickoff is not today. Settled older
        # records are preserved for audit continuity.
        rec_status = normalize_status(rec.get("status", "PENDING"))
        if rec.get("published_date") == today_key() and rec_status == "PENDING" and not is_event_today(rec):
            continue
        by_key[pick_key(rec)] = rec

    for pick in published.get("safe_picks", []):
        rec = deepcopy(pick)
        rec.setdefault("published_at", published.get("generated_at"))
        rec.setdefault("published_date", published.get("published_date"))
        rec.setdefault("status", "PENDING")
        rec["source"] = "published_safe_picks_today"
        by_key.setdefault(pick_key(rec), rec)

    ordered = sorted(by_key.values(), key=lambda x: str(x.get("published_at", "")), reverse=True)
    settled = [x for x in ordered if str(x.get("status", "")).upper() in {"WIN", "LOST", "VOID"}]
    pending = [x for x in ordered if str(x.get("status", "PENDING")).upper() == "PENDING"]
    return {
        "updated_at": iso_now(),
        "source": "published_safe_picks_today_only",
        "count": len(ordered),
        "pending": len(pending),
        "settled": len(settled),
        "results": ordered,
    }


def main() -> int:
    signals_doc = read_json(DATA_DIR / "signals_v6.json", {})
    signals = signals_doc.get("signals", []) if isinstance(signals_doc, dict) else []
    performance = read_json(DATA_DIR / "performance_summary.json", {})
    monitor = read_json(DATA_DIR / "platform_monitor.json", {})
    odds_audit = read_json(DATA_DIR / "market_odds_audit.json", {})

    safe: list[dict[str, Any]] = []
    watchlist: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    reason_counter: Counter[str] = Counter()

    for sig in signals:
        if not isinstance(sig, dict):
            continue
        category, item = classify_signal(sig, performance, monitor, odds_audit)
        if category == "safe":
            safe.append(item)
        elif category == "watchlist":
            watchlist.append(item)
        else:
            rejected.append(item)
        reason_counter.update(item.get("block_reasons", []))

    safe.sort(key=lambda x: x.get("safe_score", 0), reverse=True)
    watchlist.sort(key=lambda x: x.get("safe_score", 0), reverse=True)
    rejected.sort(key=lambda x: (len(x.get("block_reasons", [])), -x.get("safe_score", 0)), reverse=True)

    generated_at = iso_now()
    candidates_doc = {
        "generated_at": generated_at,
        "source": "safe_picks_gate",
        "summary": {
            "total_scanned": len(signals),
            "safe_count": len(safe),
            "watchlist_count": len(watchlist),
            "rejected_count": len(rejected),
            "top_rejection_reasons": reason_counter.most_common(10),
        },
        "quality_gate": {
            "min_grade": "A",
            "min_ev_calibrated_pct": ">0",
            "min_probability_pct": MIN_PROB_PCT,
            "odds_range": [ODDS_MIN, ODDS_MAX],
            "safe_markets": sorted(SAFE_MARKETS),
            "safe_strategies": sorted(SAFE_STRATEGIES),
            "weak_leagues_blocked": sorted(weak_leagues(monitor)),
            "negative_sample_min": NEGATIVE_SAMPLE_MIN,
            "event_date_rule": "kickoff local date must equal Europe/Bucharest today",
            "today_local_date": today_key(),
        },
        "safe_picks": safe,
        "watchlist": watchlist,
        "rejected": rejected,
    }

    published_doc = publish_snapshot(safe)
    journal_doc = update_published_journal(published_doc)

    write_json(CANDIDATES_PATH, candidates_doc)
    write_json(PUBLISHED_PATH, published_doc)
    write_json(PUBLISHED_JOURNAL_PATH, journal_doc)
    write_json(DEBUG_PATH, {
        "generated_at": generated_at,
        "summary": candidates_doc["summary"],
        "published_summary": published_doc["summary"],
        "journal_summary": {"count": journal_doc["count"], "pending": journal_doc["pending"], "settled": journal_doc["settled"]},
    })

    print(
        "[safe-picks-gate] "
        f"scanned={len(signals)} safe={len(safe)} watchlist={len(watchlist)} "
        f"rejected={len(rejected)} published={published_doc['summary']['published_count']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
