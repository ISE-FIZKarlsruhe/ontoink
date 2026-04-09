"""Tests for the fence handler."""

from pathlib import Path

from ontoink.fence import render_ontoink, reset_counter

FIXTURES = Path(__file__).parent / "fixtures"


def test_render_produces_html():
    reset_counter()
    render_ontoink.docs_dir = str(FIXTURES.parent)

    source = f"source: fixtures/sample-data.ttl\nshape: fixtures/sample-shape.ttl"
    result = render_ontoink(source, "ontoink", "ontoink", {}, None)

    assert "ontoink-container" in result
    assert "data-ontoink-graph" in result
    assert "ov-toolbar" in result
    assert "ov-canvas" in result


def test_render_increments_id():
    reset_counter()
    render_ontoink.docs_dir = str(FIXTURES.parent)
    source = "source: fixtures/sample-data.ttl"

    r1 = render_ontoink(source, "ontoink", "ontoink", {}, None)
    r2 = render_ontoink(source, "ontoink", "ontoink", {}, None)

    assert "ontoink-graph-0" in r1
    assert "ontoink-graph-1" in r2


def test_render_error_on_missing_file():
    reset_counter()
    render_ontoink.docs_dir = str(FIXTURES.parent)
    source = "source: nonexistent.ttl"
    result = render_ontoink(source, "ontoink", "ontoink", {}, None)

    assert "ov-error" in result


def test_render_includes_editor_panel():
    reset_counter()
    render_ontoink.docs_dir = str(FIXTURES.parent)
    source = "source: fixtures/sample-data.ttl\neditor: true"
    result = render_ontoink(source, "ontoink", "ontoink", {}, None)

    assert "ov-editor-panel" in result
    assert "Edit &amp; Validate" in result


def test_render_includes_search_input():
    reset_counter()
    render_ontoink.docs_dir = str(FIXTURES.parent)
    source = "source: fixtures/sample-data.ttl"
    result = render_ontoink(source, "ontoink", "ontoink", {}, None)

    assert "ov-search-input" in result
    assert "ov-layout-select" in result


def test_render_includes_new_toolbar_buttons():
    reset_counter()
    render_ontoink.docs_dir = str(FIXTURES.parent)
    source = "source: fixtures/sample-data.ttl"
    result = render_ontoink(source, "ontoink", "ontoink", {}, None)

    assert "toggleStats" in result
    assert "togglePathFinder" in result
    assert "toggleSparql" in result
    assert "ov-minimap" in result
    assert "ov-stats-panel" in result
    assert "ov-pathfinder-panel" in result
    assert "ov-sparql-panel" in result


def test_render_reasoning_button():
    reset_counter()
    render_ontoink.docs_dir = str(FIXTURES.parent)
    source = "source: fixtures/sample-data.ttl"
    result = render_ontoink(source, "ontoink", "ontoink", {}, None)

    assert "toggleReasoning" in result


def test_render_reasoning_disabled():
    reset_counter()
    render_ontoink.docs_dir = str(FIXTURES.parent)
    source = "source: fixtures/sample-data.ttl\nreasoning: false"
    result = render_ontoink(source, "ontoink", "ontoink", {}, None)

    assert "toggleReasoning" not in result


def test_render_includes_layout_selector():
    reset_counter()
    render_ontoink.docs_dir = str(FIXTURES.parent)
    source = "source: fixtures/sample-data.ttl"
    result = render_ontoink(source, "ontoink", "ontoink", {}, None)

    assert "ov-layout-select" in result
    assert "changeLayout" in result
    assert "dagre" in result.lower()


def test_render_includes_abstract_button():
    reset_counter()
    render_ontoink.docs_dir = str(FIXTURES.parent)
    source = "source: fixtures/sample-data.ttl"
    result = render_ontoink(source, "ontoink", "ontoink", {}, None)

    assert "abstractView" in result


def test_render_includes_coverage_and_sparql():
    reset_counter()
    render_ontoink.docs_dir = str(FIXTURES.parent)
    source = "source: fixtures/sample-data.ttl"
    result = render_ontoink(source, "ontoink", "ontoink", {}, None)

    assert "showCoverage" in result or "toggleStats" in result
    assert "ov-sparql-panel" in result
