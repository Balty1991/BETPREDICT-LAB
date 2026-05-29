#!/usr/bin/env python3
"""Regression tests for Performanță Publicată UI/data contract."""

from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT_DIR = Path(__file__).parent.parent.resolve()
DATA_DIR = ROOT_DIR / "data"
ASSETS_DIR = ROOT_DIR / "assets"


def load_json(name: str):
    with open(DATA_DIR / name, "r", encoding="utf-8") as f:
        return json.load(f)


def status(item):
    return str(item.get("status") or item.get("result") or "PENDING").upper()


def profit_units(item):
    if item.get("profit_units") is not None:
        return float(item.get("profit_units"))
    if item.get("profit") is not None:
        return float(item.get("profit"))
    s = status(item)
    if s == "WIN":
        return float(item.get("odds", 1)) - 1
    if s in {"LOST", "LOSS"}:
        return -1.0
    return 0.0


class PublishedPerformanceUITests(unittest.TestCase):
    def test_ui_asset_contains_performance_section_and_source(self):
        js = (ASSETS_DIR / "safe_picks_ui.js").read_text(encoding="utf-8")
        self.assertIn("Performanță Publicată", js)
        self.assertIn("sec-performance", js)
        self.assertIn('data-t="performance"', js)
        self.assertIn("data/selection_journal_published.json", js)
        self.assertIn("BPPublishedPerformanceUI", js)

    def test_performance_source_is_clean_published_history(self):
        journal = load_json("selection_journal_published.json")
        for item in journal.get("results", []):
            self.assertEqual(str(item.get("category", "")).lower(), "safe")
            self.assertNotIn("watch", str(item.get("source", "")).lower())
            self.assertNotIn("rejected", str(item.get("source", "")).lower())

    def test_roi_formula_uses_only_settled_published_items(self):
        journal = load_json("selection_journal_published.json")
        settled = [x for x in journal.get("results", []) if status(x) in {"WIN", "LOST", "LOSS"}]
        stake = len(settled)
        profit = sum((profit_units(x) for x in settled), 0.0)
        roi = None if stake == 0 else (profit / stake) * 100
        self.assertIsInstance(profit, float)
        self.assertTrue(roi is None or isinstance(roi, float))


if __name__ == "__main__":
    unittest.main()
