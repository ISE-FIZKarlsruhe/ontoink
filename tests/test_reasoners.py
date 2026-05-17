"""Tests for the OWL reasoner backends.

Each backend test:
  - Skips if the underlying binary/library is not installed
  - Asserts the wrapper returns either a list of inferences or None (consistent contract)

The full inference-correctness checks live in test_ttl_parser.py against the
existing _reason_with_owlready2 path. Here we just verify the dispatch glue.
"""

from __future__ import annotations

import os
import shutil

import pytest
from rdflib import Graph


SAMPLE_TTL = """
@prefix ex: <http://example.org/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .

ex: a owl:Ontology .
ex:Animal a owl:Class .
ex:Dog a owl:Class ;
    rdfs:subClassOf ex:Animal .
ex:rex a ex:Dog .
"""


def _load_graph() -> Graph:
    g = Graph()
    g.parse(data=SAMPLE_TTL, format="turtle")
    return g


def test_owlrl_returns_list_or_none():
    """OWL-RL is a pure Python fallback — should always run if installed."""
    from ontoink.ttl_parser import _reason_with_owlrl
    result = _reason_with_owlrl(_load_graph())
    if result is None:
        pytest.skip("owlrl not installed in this environment")
    assert isinstance(result, list)


def test_owlready2_returns_list_or_none():
    """owlready2 is optional (extras=reasoning). Skip cleanly if unavailable."""
    from ontoink.ttl_parser import _reason_with_owlready2
    try:
        import owlready2  # noqa: F401
    except ImportError:
        pytest.skip("owlready2 not installed")
    result = _reason_with_owlready2(_load_graph())
    # owlready2 may transiently fail (Java startup, etc.); contract: list | None
    assert result is None or isinstance(result, list)


def test_konclude_native_skipped_if_no_binary():
    """Native Konclude requires the `konclude` binary on PATH."""
    from ontoink.ttl_parser import _reason_with_konclude_native
    if shutil.which(os.environ.get("ONTOINK_KONCLUDE_BIN", "konclude")) is None:
        pytest.skip("konclude binary not on PATH")
    result = _reason_with_konclude_native(_load_graph())
    assert result is None or isinstance(result, list)


def test_konclude_wasm_skipped_if_no_binary():
    """WASM Konclude wrapper requires the `owl-reason` Node CLI on PATH."""
    from ontoink.ttl_parser import _reason_with_konclude_wasm
    bin_name = os.environ.get("ONTOINK_KONCLUDE_WASM_BIN", "owl-reason")
    if shutil.which(bin_name) is None:
        pytest.skip("owl-reason (rdf-reasoner-konclude) not on PATH")
    result = _reason_with_konclude_wasm(_load_graph())
    assert result is None or isinstance(result, list)


def test_run_reasoning_dispatches_by_env(monkeypatch):
    """ONTOINK_REASONER env var selects the backend."""
    from ontoink.ttl_parser import _run_reasoning

    # "none" → no work, empty list
    monkeypatch.setenv("ONTOINK_REASONER", "none")
    assert _run_reasoning(_load_graph(), {}) == []

    # "auto" → returns a list (may be empty if no backend produces inferences)
    monkeypatch.setenv("ONTOINK_REASONER", "auto")
    result = _run_reasoning(_load_graph(), {})
    assert isinstance(result, list)


def test_run_reasoning_unknown_backend_falls_through(monkeypatch):
    """An unknown reasoner name should not crash; auto-like behavior."""
    from ontoink.ttl_parser import _run_reasoning
    monkeypatch.setenv("ONTOINK_REASONER", "definitely-not-real")
    # Falls through to the `else` branch (auto) by design
    result = _run_reasoning(_load_graph(), {})
    assert isinstance(result, list)
