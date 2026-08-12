"""Tests for the ```ontoink-cq competency-question fence."""

from __future__ import annotations

import logging

import pytest

from ontoink import cq


ONTOLOGY = """
@prefix ex: <http://example.org/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

ex:Process a owl:Class .
ex:Sample a owl:Class .
ex:Alloy a owl:Class ; rdfs:subClassOf ex:Sample .

ex:melting a ex:Process .
ex:casting a ex:Process .
ex:s1 a ex:Sample .
ex:a1 a ex:Alloy .
"""


@pytest.fixture
def docs(tmp_path):
    (tmp_path / "onto.ttl").write_text(ONTOLOGY, encoding="utf-8")
    cq.render_ontoink_cq.docs_dir = str(tmp_path)
    cq.reset_cq_state()
    return tmp_path


def render(body):
    return cq.render_ontoink_cq(body, "ontoink-cq", "ontoink-cq", {}, None)


def test_select_question_passes_when_rows_come_back(docs):
    html = render("""
source: onto.ttl
questions:
  - question: Which processes exist?
    query: |
      SELECT ?p WHERE { ?p a <http://example.org/Process> }
    min_rows: 2
""")
    assert "ov-cq-pass" in html
    assert "ov-cq-fail" not in html
    assert cq.get_cq_rows()[0]["passed"] == 1


def test_select_question_fails_when_below_min_rows(docs):
    html = render("""
source: onto.ttl
questions:
  - question: Are there five processes?
    query: |
      SELECT ?p WHERE { ?p a <http://example.org/Process> }
    min_rows: 5
""")
    assert "ov-cq-fail" in html
    row = cq.get_cq_rows()[0]
    assert row["failed"] == 1 and row["passed"] == 0


def test_ask_question_honours_expected_answer(docs):
    html = render("""
source: onto.ttl
questions:
  - question: Is there a sample with no type?
    ask: |
      ASK { ?s a <http://example.org/Nonexistent> }
    expect: false
""")
    assert "ov-cq-pass" in html


def test_ask_defaults_to_expecting_true(docs):
    html = render("""
source: onto.ttl
questions:
  - question: Does any process exist?
    ask: |
      ASK { ?p a <http://example.org/Process> }
""")
    assert "ov-cq-pass" in html


def test_empty_result_fails_when_no_expectation_is_given(docs):
    """A question nothing answers has not been answered."""
    html = render("""
source: onto.ttl
questions:
  - question: Which widgets exist?
    query: |
      SELECT ?w WHERE { ?w a <http://example.org/Widget> }
""")
    assert "ov-cq-fail" in html


def test_reasoning_makes_entailed_answers_available(docs, monkeypatch):
    """ex:a1 is an Alloy; only with subclass entailment is it a Sample."""
    monkeypatch.setenv("ONTOINK_REASONER", "owlrl")
    html = render("""
source: onto.ttl
reasoning: true
questions:
  - question: Is every alloy a sample?
    query: |
      SELECT ?s WHERE { ?s a <http://example.org/Sample> }
    min_rows: 2
""")
    assert "ov-cq-pass" in html


def test_broken_query_fails_the_question_not_the_build(docs):
    html = render("""
source: onto.ttl
questions:
  - question: Broken
    query: SELECT ?x WHERE { this is not sparql
""")
    assert "ov-cq-fail" in html
    assert "Query failed" in html


def test_question_without_a_query_is_reported(docs):
    html = render("""
source: onto.ttl
questions:
  - question: I forgot the query
""")
    assert "ov-cq-fail" in html
    assert "No `ask:` or `query:`" in html


def test_missing_source_renders_an_error_block_instead_of_raising(docs):
    html = render("source: nope.ttl\nquestions: []\n")
    assert "ov-error" in html


def test_failures_are_logged_for_strict_builds(docs, caplog):
    """--strict turns mkdocs.plugins warnings into build failures; that is the gate."""
    with caplog.at_level(logging.WARNING, logger="mkdocs.plugins.ontoink"):
        render("""
source: onto.ttl
questions:
  - question: Impossible
    ask: |
      ASK { ?s a <http://example.org/Nope> }
    expect: true
""")
    messages = [r.getMessage() for r in caplog.records]
    assert any("competency question failed" in m for m in messages)
    # The console a build runs on may be cp1252; a non-encodable character in a
    # log message turns a helpful warning into a crash.
    for message in messages:
        message.encode("cp1252")


def test_html_is_escaped(docs):
    html = render("""
source: onto.ttl
title: "<script>alert(1)</script>"
questions:
  - question: "<img src=x onerror=alert(1)>"
    query: |
      SELECT ?p WHERE { ?p a <http://example.org/Process> }
""")
    assert "<script>alert" not in html
    assert "<img src=x" not in html
    assert "&lt;script&gt;" in html


def test_show_on_graph_resolves_the_diagram_at_click_time_by_default(docs):
    """Container ids come from a build-wide counter, so a page cannot know its own.

    Without an explicit `graph:` the button passes `this` and the runtime walks
    the DOM for the nearest diagram; hard-coding an id is opt-in.
    """
    body = """
source: onto.ttl
%s
questions:
  - question: Which processes exist?
    query: |
      SELECT ?p WHERE { ?p a <http://example.org/Process> }
"""
    default = render(body % "")
    assert "ontoink.selectIrisNearby(this," in default
    assert "ontoink.selectIris(" not in default.replace("ontoink.selectIrisNearby(", "")

    targeted = render(body % "graph: ontoink-graph-7")
    assert "ontoink.selectIris('ontoink-graph-7'," in targeted
    assert "selectIrisNearby" not in targeted


def test_show_on_graph_is_omitted_when_no_iris_are_bound(docs):
    """A question returning only literals has nothing to select."""
    html = render("""
source: onto.ttl
questions:
  - question: Is there a process?
    ask: |
      ASK { ?p a <http://example.org/Process> }
""")
    assert "selectIris" not in html


def test_rows_reset_between_builds(docs):
    render("source: onto.ttl\nquestions: []\n")
    assert len(cq.get_cq_rows()) == 1
    cq.reset_cq_state()
    assert cq.get_cq_rows() == []
