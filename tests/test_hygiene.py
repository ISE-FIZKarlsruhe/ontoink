"""Regression tests for the v0.7.7 correctness fixes.

Each of these guards a bug that was silent — nothing failed, the output was
just wrong or unreproducible — which is exactly the kind that comes back.
"""

from __future__ import annotations

import logging
import os
import subprocess
import sys
import textwrap

import pytest
from rdflib import Graph

import ontoink
from ontoink import fence, shacl_validator
from ontoink.ttl_parser import _literal_id, parse_ttl_to_cytoscape


# ── stable element ids ────────────────────────────────────────────────────

def test_literal_ids_are_stable_across_processes(tmp_path):
    """PYTHONHASHSEED randomises str hashing, so the old abs(hash()) scheme gave
    a different id for the same literal on every build."""
    script = textwrap.dedent("""
        from ontoink.ttl_parser import _literal_id
        print(_literal_id("Alice"), _literal_id("s", "p", "o"))
    """)
    runs = []
    for seed in ("0", "1", "random"):
        env = dict(os.environ, PYTHONHASHSEED=seed)
        out = subprocess.run(
            [sys.executable, "-c", script], capture_output=True, text=True, env=env, check=True,
        )
        runs.append(out.stdout.strip())
    assert len(set(runs)) == 1, f"literal ids drifted across hash seeds: {runs}"


def test_literal_ids_distinguish_different_values():
    assert _literal_id("Alice") != _literal_id("Bob")
    assert _literal_id("a", "b") != _literal_id("b", "a")


def test_same_graph_parsed_twice_yields_identical_ids(tmp_path, monkeypatch):
    ttl = tmp_path / "d.ttl"
    ttl.write_text("""
        @prefix ex: <http://example.org/> .
        ex:alice a ex:Person ; ex:name "Alice" .
    """, encoding="utf-8")
    # monkeypatch, not os.environ: a bare assignment here leaks into every test
    # that runs after this file and silently disables their reasoning.
    monkeypatch.setenv("ONTOINK_REASONER", "none")
    first = {n["data"]["id"] for n in parse_ttl_to_cytoscape(str(ttl))["nodes"]}
    second = {n["data"]["id"] for n in parse_ttl_to_cytoscape(str(ttl))["nodes"]}
    assert first == second


# ── version single-sourcing ───────────────────────────────────────────────

def test_api_reports_the_package_version():
    pytest.importorskip("fastapi")
    from ontoink.api import app

    assert app.version == ontoink.__version__


# ── validation inference parity ───────────────────────────────────────────

def test_validator_default_inference_is_shared():
    assert shacl_validator.DEFAULT_INFERENCE == "none"


def test_validate_reports_which_inference_ran(sample_data, sample_shape):
    result = shacl_validator.validate_graph(sample_data, sample_shape)
    assert result["inference"] == shacl_validator.DEFAULT_INFERENCE


def test_validate_text_and_validate_graph_agree(sample_data, sample_shape):
    from pathlib import Path

    by_path = shacl_validator.validate_graph(sample_data, sample_shape)
    by_text = shacl_validator.validate_text(
        Path(sample_data).read_text(encoding="utf-8"),
        Path(sample_shape).read_text(encoding="utf-8"),
    )
    assert by_path["conforms"] == by_text["conforms"]
    assert len(by_path["violations"]) == len(by_text["violations"])


def test_violations_carry_the_constraint_that_produced_them(invalid_data, sample_shape):
    """Grouping by source shape is what the fix miner and report need."""
    result = shacl_validator.validate_graph(invalid_data, sample_shape)
    assert result["violations"]
    assert any(v.get("constraintComponent") for v in result["violations"])


# ── reasoner override without touching os.environ ─────────────────────────

def test_reasoner_override_does_not_mutate_the_environment(monkeypatch):
    from ontoink.ttl_parser import _run_reasoning

    monkeypatch.setenv("ONTOINK_REASONER", "none")
    g = Graph()
    g.parse(data="@prefix ex: <http://example.org/> . ex:a a ex:B .", format="turtle")

    _run_reasoning(g, {}, reasoner="owlrl")
    assert os.environ["ONTOINK_REASONER"] == "none", "the override leaked into the process"


def test_explicit_none_reasoner_short_circuits(monkeypatch):
    from ontoink.ttl_parser import _run_reasoning

    monkeypatch.setenv("ONTOINK_REASONER", "owlrl")
    g = Graph()
    g.parse(data="@prefix ex: <http://example.org/> . ex:a a ex:B .", format="turtle")
    assert _run_reasoning(g, {}, reasoner="none") == []


# ── build-time validation failures are no longer swallowed ────────────────

def test_missing_shape_file_logs_a_warning(tmp_path, caplog, monkeypatch):
    """A typo'd `shape:` path used to yield a silently unvalidated diagram.

    The parser skips a shapes file that does not exist, so the failure surfaced
    only inside the validation step — where a bare `except` turned it into
    `validation = None` and nothing was written to the build log.
    """
    monkeypatch.setenv("ONTOINK_REASONER", "none")
    (tmp_path / "d.ttl").write_text(
        "@prefix ex: <http://example.org/> . ex:a a ex:B .", encoding="utf-8")
    fence.render_ontoink.docs_dir = str(tmp_path)
    fence.reset_counter()

    with caplog.at_level(logging.WARNING, logger="mkdocs.plugins.ontoink"):
        html = fence.render_ontoink(
            "source: d.ttl\nshape: typo.ttl\n", "ontoink", "ontoink", {}, None)

    assert "data-ontoink-graph" in html, "the diagram should still render"
    assert any("SHACL validation failed" in r.getMessage() for r in caplog.records)


def test_unparseable_shape_file_renders_a_visible_error(tmp_path, monkeypatch):
    """A shapes file that exists but is malformed fails loudly at parse time."""
    monkeypatch.setenv("ONTOINK_REASONER", "none")
    (tmp_path / "d.ttl").write_text(
        "@prefix ex: <http://example.org/> . ex:a a ex:B .", encoding="utf-8")
    (tmp_path / "broken.ttl").write_text("this is not turtle {{{", encoding="utf-8")
    fence.render_ontoink.docs_dir = str(tmp_path)
    fence.reset_counter()

    html = fence.render_ontoink(
        "source: d.ttl\nshape: broken.ttl\n", "ontoink", "ontoink", {}, None)
    assert "ov-error" in html


# ── the predicates: policy is finally reachable from YAML ──────────────────

def test_predicates_policy_hides_matching_triples(tmp_path, monkeypatch):
    monkeypatch.setenv("ONTOINK_REASONER", "none")
    (tmp_path / "d.ttl").write_text("""
        @prefix ex: <http://example.org/> .
        @prefix dcterms: <http://purl.org/dc/terms/> .
        ex:alice a ex:Person ; ex:name "Alice" ; dcterms:modified "2024-01-01" .
    """, encoding="utf-8")
    fence.render_ontoink.docs_dir = str(tmp_path)
    fence.reset_counter()

    plain = fence.render_ontoink("source: d.ttl\n", "ontoink", "ontoink", {}, None)
    hidden = fence.render_ontoink(
        "source: d.ttl\npredicates:\n  hide_predicates: [dcterms:modified]\n",
        "ontoink", "ontoink", {}, None)

    # Compare the drawn elements, not the whole payload: the raw Turtle is
    # embedded verbatim for the editor either way, so the literal still appears
    # in the blob even when its node is gone.
    assert _literal_labels(plain) & {"2024-01-01"}
    assert not _literal_labels(hidden) & {"2024-01-01"}


def _payload(html: str) -> dict:
    import base64
    import json
    import re

    match = re.search(r'data-ontoink-graph="([^"]+)"', html)
    assert match, "no payload in the rendered fence"
    return json.loads(base64.b64decode(match.group(1)).decode("utf-8"))


def _literal_labels(html: str) -> set:
    return {
        n["data"].get("label")
        for n in _payload(html)["nodes"]
        if n["data"].get("type") == "Literal"
    }


# ── report rows are collected and reset per build ─────────────────────────

def test_report_rows_accumulate_and_reset(tmp_path, monkeypatch):
    monkeypatch.setenv("ONTOINK_REASONER", "none")
    (tmp_path / "d.ttl").write_text(
        "@prefix ex: <http://example.org/> . ex:a a ex:B .", encoding="utf-8")
    fence.render_ontoink.docs_dir = str(tmp_path)
    fence.reset_counter()

    fence.render_ontoink("source: d.ttl\n", "ontoink", "ontoink", {}, None)
    fence.render_ontoink("source: d.ttl\n", "ontoink", "ontoink", {}, None)
    assert len(fence.get_report_rows()) == 2

    # `mkdocs serve` rebuilds call on_config again; without the reset the rows
    # from the previous build would double-count in the summary.
    fence.reset_counter()
    assert fence.get_report_rows() == []
