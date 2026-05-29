#!/usr/bin/env python3
"""Smoke tests for Predicții Validate UI wiring."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_safe_picks_ui_asset_is_loaded_from_index():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    assert "assets/safe_picks_ui.js" in html


def test_safe_picks_ui_reads_published_snapshot_not_raw_api():
    js = (ROOT / "assets" / "safe_picks_ui.js").read_text(encoding="utf-8")
    assert "data/published_safe_picks_today.json" in js
    assert "data/selection_journal.json" not in js
    assert "data/predictions.json" not in js
    assert "data/signals_v6.json" not in js


def test_safe_picks_ui_has_required_empty_state_and_rule():
    js = (ROOT / "assets" / "safe_picks_ui.js").read_text(encoding="utf-8")
    assert "Nu există predicții validate momentan" in js
    assert "predicții afișate = predicții salvate" in js
    assert "safe_picks" in js
