#!/usr/bin/env python3
"""Regression tests for final mobile menu shell."""

from __future__ import annotations

import unittest
from pathlib import Path

ROOT_DIR = Path(__file__).parent.parent.resolve()
ASSETS_DIR = ROOT_DIR / "assets"


class FinalMenuShellTests(unittest.TestCase):
    def test_final_menu_has_only_primary_tabs(self):
        js = (ASSETS_DIR / "safe_picks_ui.js").read_text(encoding="utf-8")
        self.assertIn("BETPREDICT LAB — Final Mobile Shell", js)
        self.assertIn("Azi | Picks | Istoric | Perf | Mai mult", js)
        for tab in ["today", "safe", "published", "performance", "more"]:
            self.assertIn(f"'{tab}'", js)
        self.assertIn("bp-old-tab-hidden", js)

    def test_final_menu_uses_clean_sources(self):
        js = (ASSETS_DIR / "safe_picks_ui.js").read_text(encoding="utf-8")
        self.assertIn("data/published_safe_picks_today.json", js)
        self.assertIn("data/selection_journal_published.json", js)
        self.assertIn("data/platform_monitor.json", js)
        self.assertIn("data/v6_health.json", js)
        self.assertNotIn("data/predictions.json", js)
        self.assertNotIn("data/signals_v6.json", js)
        self.assertNotIn("data/recent_results.json", js)

    def test_more_keeps_secondary_modules_accessible(self):
        js = (ASSETS_DIR / "safe_picks_ui.js").read_text(encoding="utf-8")
        for old_tab in ["dash", "meciuri", "value", "smartbet", "live", "top"]:
            self.assertIn(f"['{old_tab}'", js)
        self.assertIn("Platform Monitor", js)
        self.assertIn("Debug Safe Gate", js)


if __name__ == "__main__":
    unittest.main()
