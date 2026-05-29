#!/usr/bin/env python3
"""Regression tests for Predicții Validate + Istoric Publicat UI/data contract."""

from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

ROOT_DIR = Path(__file__).parent.parent.resolve()
DATA_DIR = ROOT_DIR / "data"
ASSETS_DIR = ROOT_DIR / "assets"


def load_json(name: str):
    with open(DATA_DIR / name, "r", encoding="utf-8") as f:
        return json.load(f)


def pub_key(item):
    date = str(item.get("published_date") or item.get("published_at") or "")[:10]
    return f"{item.get('event_id')}|{item.get('market')}|{date}"


class PublishedHistoryUIContractTests(unittest.TestCase):
    def test_ui_asset_contains_safe_and_published_sources(self):
        js = (ASSETS_DIR / "safe_picks_ui.js").read_text(encoding="utf-8")
        self.assertIn("data/published_safe_picks_today.json", js)
        self.assertIn("data/selection_journal_published.json", js)
        self.assertIn("sec-safe", js)
        self.assertIn("sec-published", js)
        self.assertIn("Predicții Validate", js)
        self.assertIn("Istoric Publicat", js)

    def test_published_history_matches_visible_safe_picks_for_current_day(self):
        safe = load_json("published_safe_picks_today.json")
        journal = load_json("selection_journal_published.json")

        safe_items = safe.get("safe_picks", [])
        journal_items = journal.get("results", [])

        safe_keys = {pub_key(x) for x in safe_items}
        journal_keys = {pub_key(x) for x in journal_items}

        # Este valid să existe 0 predicții safe într-o zi. Important este ca atunci
        # când există picks vizibile, ele să fie prezente și în istoricul curat.
        if safe_keys:
            self.assertTrue(journal_keys, "selection_journal_published.json should contain the clean published history")
            self.assertTrue(safe_keys.issubset(journal_keys), f"Missing in published journal: {safe_keys - journal_keys}")

    def test_clean_history_does_not_store_watchlist_or_rejected_items(self):
        journal = load_json("selection_journal_published.json")
        for item in journal.get("results", []):
            self.assertEqual(str(item.get("category", "")).lower(), "safe")
            self.assertNotIn("watch", str(item.get("source", "")).lower())
            self.assertNotIn("rejected", str(item.get("source", "")).lower())
            self.assertGreater(float(item.get("ev_calibrated_pct", 0)), 0)
            self.assertTrue(item.get("odds_real"))
            self.assertNotEqual(str(item.get("v6_status", "")).upper(), "DOWNGRADED")
            self.assertTrue(item.get("published_at"))
            self.assertTrue(item.get("published_date"))

    def test_no_duplicate_published_history_keys(self):
        journal = load_json("selection_journal_published.json")
        keys = [pub_key(x) for x in journal.get("results", [])]
        self.assertEqual(len(keys), len(set(keys)), "Duplicate event_id + market + published_date in clean history")


if __name__ == "__main__":
    unittest.main()
