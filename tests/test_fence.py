"""Tests for the fence handler."""

import os
from pathlib import Path

from ontoview.fence import render_ontoview, reset_counter

FIXTURES = Path(__file__).parent / "fixtures"


def test_render_produces_html():
    reset_counter()
    render_ontoview.docs_dir = str(FIXTURES.parent)

    source = f"source: fixtures/sample-data.ttl\nshape: fixtures/sample-shape.ttl"
    result = render_ontoview(source, "ontoview", "ontoview", {}, None)

    assert "ontoview-container" in result
    assert "data-ontoview-graph" in result
    assert "ov-toolbar" in result
    assert "ov-canvas" in result


def test_render_increments_id():
    reset_counter()
    render_ontoview.docs_dir = str(FIXTURES.parent)
    source = "source: fixtures/sample-data.ttl"

    r1 = render_ontoview(source, "ontoview", "ontoview", {}, None)
    r2 = render_ontoview(source, "ontoview", "ontoview", {}, None)

    assert "ontoview-graph-0" in r1
    assert "ontoview-graph-1" in r2


def test_render_error_on_missing_file():
    reset_counter()
    render_ontoview.docs_dir = str(FIXTURES.parent)
    source = "source: nonexistent.ttl"
    result = render_ontoview(source, "ontoview", "ontoview", {}, None)

    assert "ov-error" in result


def test_render_includes_editor_panel():
    reset_counter()
    render_ontoview.docs_dir = str(FIXTURES.parent)
    source = "source: fixtures/sample-data.ttl\neditor: true"
    result = render_ontoview(source, "ontoview", "ontoview", {}, None)

    assert "ov-editor-panel" in result
    assert "Edit &amp; Validate" in result
