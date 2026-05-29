#!/usr/bin/env python3
"""Regression tests for the published Safe Picks Gate."""

from __future__ import annotations

import json
import re
import subprocess
import sys
import unittest
from pathlib import Path

ROOT_DIR = Path(__file__).parent.parent.resolve()
DATA_DIR = ROOT_DIR / "data"
SRC_DIR = ROOT_DIR / "src"

sys.path.insert(0, str(ROOT_DIR))
sys.path.insert(0, str(SRC_DIR))

GRADE_RANK = {"A+": 5, "A": 4, "B+": 3, "B": 3, "C+": 2, "C": 2, "D": 1, "E": 0, "F": 0, "": -1}


def load_json(name: str):
    with open(DATA_DIR / name, "r", encoding="utf-8") as f:
        return json.load(f)


def as_float(value, default=0.0):
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value).replace("%", "").replace(",", "."))
    except Exception:
        return default


def published_date(item):
    raw = str(item.get("published_date") or item.get("published_at") or "")
    match = re.match(r"^(\d{4}-\d{2}-\d{2})", raw)
    return match.group(1) if match else ""


def key(item):
    return f"{item.get('event_id')}|{item.get('market')}|{published_date(item)}"


class TestSafePicksGate(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        subprocess.run([sys.executable, str(SRC_DIR / "build_safe_picks_today.py")], cwd=ROOT_DIR, check=True)
        cls.candidates = load_json("safe_picks_today.json")
        cls.published = load_json("published_safe_picks_today.json")
        cls.journal = load_json("selection_journal_published.json")

    def test_safe_picks_file_exists_and_schema(self):
        self.assertTrue((DATA_DIR / "safe_picks_today.json").exists())
        self.assertIn("safe_picks", self.candidates)
        self.assertIn("watchlist", self.candidates)
        self.assertIn("rejected", self.candidates)
        self.assertIsInstance(self.candidates["safe_picks"], list)
        self.assertIsInstance(self.candidates["watchlist"], list)
        self.assertIsInstance(self.candidates["rejected"], list)

    def test_published_snapshot_exists_and_schema(self):
        self.assertTrue((DATA_DIR / "published_safe_picks_today.json").exists())
        self.assertIn("safe_picks", self.published)
        self.assertIn("published_date", self.published)
        self.assertIsInstance(self.published["safe_picks"], list)

    def test_safe_picks_never_contains_blocked_signals(self):
        for pick in self.candidates["safe_picks"]:
            with self.subTest(event_id=pick.get("event_id"), market=pick.get("market")):
                self.assertNotEqual(str(pick.get("v6_status", "")).upper(), "DOWNGRADED")
                self.assertGreater(as_float(pick.get("ev_calibrated_pct")), 0)
                self.assertIs(pick.get("odds_real"), True)
                self.assertGreaterEqual(GRADE_RANK.get(str(pick.get("quality_grade_v6", "")).upper(), -1), 4)
                self.assertFalse(pick.get("block_reasons"), pick.get("block_reasons"))
                for field in ["event_id", "market", "home_team", "away_team", "recommended_pick", "odds", "probability_pct"]:
                    self.assertTrue(pick.get(field), f"missing {field}")

    def test_published_snapshot_is_subset_of_safe_candidates(self):
        candidate_keys = {f"{p.get('event_id')}|{p.get('market')}" for p in self.candidates["safe_picks"]}
        for pick in self.published["safe_picks"]:
            with self.subTest(event_id=pick.get("event_id"), market=pick.get("market")):
                self.assertIn(f"{pick.get('event_id')}|{pick.get('market')}", candidate_keys)
                self.assertEqual(pick.get("category"), "safe")
                self.assertEqual(pick.get("source"), "published_safe_picks_today")

    def test_published_history_equals_visible_published_picks_for_today(self):
        visible_keys = {key(p) for p in self.published["safe_picks"]}
        journal_today = [p for p in self.journal.get("results", []) if published_date(p) == self.published.get("published_date")]
        journal_keys = {key(p) for p in journal_today}
        self.assertEqual(visible_keys, journal_keys)

    def test_published_history_has_no_watchlist_or_rejected(self):
        for rec in self.journal.get("results", []):
            with self.subTest(event_id=rec.get("event_id"), market=rec.get("market")):
                self.assertEqual(rec.get("category"), "safe")
                self.assertNotIn(rec.get("source"), {"watchlist", "rejected"})
                self.assertNotEqual(str(rec.get("v6_status", "")).upper(), "DOWNGRADED")
                self.assertGreater(as_float(rec.get("ev_calibrated_pct")), 0)
                self.assertIs(rec.get("odds_real"), True)
                self.assertGreaterEqual(GRADE_RANK.get(str(rec.get("quality_grade_v6", "")).upper(), -1), 4)

    def test_no_duplicate_published_event_market_date(self):
        keys = [key(p) for p in self.published["safe_picks"]]
        self.assertEqual(len(keys), len(set(keys)))
        journal_keys = [key(p) for p in self.journal.get("results", [])]
        self.assertEqual(len(journal_keys), len(set(journal_keys)))


if __name__ == "__main__":
    unittest.main(verbosity=2)
