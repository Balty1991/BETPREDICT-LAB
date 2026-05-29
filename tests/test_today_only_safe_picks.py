#!/usr/bin/env python3
"""Regression tests for same-day safe picks only."""

from __future__ import annotations

import json
import re
import unittest
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT_DIR = Path(__file__).parent.parent.resolve()
DATA_DIR = ROOT_DIR / "data"
SRC_DIR = ROOT_DIR / "src"
ASSETS_DIR = ROOT_DIR / "assets"
APP_TZ = ZoneInfo("Europe/Bucharest")


def load_json(name: str):
    with open(DATA_DIR / name, "r", encoding="utf-8") as f:
        return json.load(f)


def local_today() -> str:
    return datetime.now(timezone.utc).astimezone(APP_TZ).date().isoformat()


def local_date(raw) -> str:
    if not raw:
        return ""
    text = str(raw).strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(text)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=APP_TZ)
        return dt.astimezone(APP_TZ).date().isoformat()
    except Exception:
        return ""


def kickoff(item):
    return item.get("kickoff") or item.get("event_date") or item.get("start_time") or item.get("date")


class TodayOnlySafePicksTests(unittest.TestCase):
    def test_build_script_contains_today_only_gate(self):
        src = (SRC_DIR / "build_safe_picks_today.py").read_text(encoding="utf-8")
        self.assertIn("Europe/Bucharest", src)
        self.assertIn("NOT_TODAY_MATCH", src)
        self.assertIn("is_event_today", src)

    def test_ui_filters_today_only_picks(self):
        js = (ASSETS_DIR / "safe_picks_ui.js").read_text(encoding="utf-8")
        self.assertIn("Europe/Bucharest", js)
        self.assertIn("isTodayPick", js)
        self.assertIn("filter(isTodayPick)", js)

    def test_published_safe_picks_are_for_today_only(self):
        doc = load_json("published_safe_picks_today.json")
        for item in doc.get("safe_picks", []):
            self.assertEqual(local_date(kickoff(item)), local_today(), item)

    def test_current_day_pending_history_has_no_future_matches(self):
        journal = load_json("selection_journal_published.json")
        today = local_today()
        for item in journal.get("results", []):
            status = str(item.get("status") or "PENDING").upper()
            pub_date = str(item.get("published_date") or item.get("published_at") or "")[:10]
            if pub_date == today and status == "PENDING":
                self.assertEqual(local_date(kickoff(item)), today, item)


if __name__ == "__main__":
    unittest.main()
