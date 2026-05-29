#!/usr/bin/env python3
"""Regression tests for Pagina Azi UI/data contract."""

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


class TodayUIContractTests(unittest.TestCase):
    def test_today_ui_asset_contains_sources_and_tab(self):
        js = (ASSETS_DIR / "safe_picks_ui.js").read_text(encoding="utf-8")
        self.assertIn("Pagina Azi", js)
        self.assertIn("sec-today", js)
        self.assertIn('data-t=\"today\"', js)
        self.assertIn("data/published_safe_picks_today.json", js)
        self.assertIn("data/selection_journal_published.json", js)
        self.assertIn("data/platform_monitor.json", js)
        self.assertIn("BPTodayUI", js)

    def test_today_source_is_published_safe_snapshot(self):
        safe = load_json("published_safe_picks_today.json")
        self.assertIn("safe_picks", safe)
        for item in safe.get("safe_picks", []):
            self.assertEqual(str(item.get("category", "")).lower(), "safe")
            self.assertGreater(float(item.get("ev_calibrated_pct", 0)), 0)
            self.assertTrue(item.get("odds_real"))
            self.assertNotEqual(str(item.get("v6_status", "")).upper(), "DOWNGRADED")

    def test_today_does_not_depend_on_raw_api_prediction_files(self):
        js = (ASSETS_DIR / "safe_picks_ui.js").read_text(encoding="utf-8")
        today_part = js.split("BETPREDICT LAB — Pagina Azi", 1)[-1]
        self.assertNotIn("data/predictions.json", today_part)
        self.assertNotIn("data/signals_v6.json", today_part)
        self.assertNotIn("data/recent_results.json", today_part)


if __name__ == "__main__":
    unittest.main()
