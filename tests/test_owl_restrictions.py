"""Tests for the OWL restriction visualization pass in ttl_parser.

The parser collapses each `?C rdfs:subClassOf [a owl:Restriction; onProperty p; <op> F]`
into one synthetic edge with edgeType="owl-restriction", labelled with an
operator symbol + the predicate's local name. The restriction blank node
itself must not leak into the node list, and `owl:Restriction` itself must
no longer be materialised as a floating class.
"""
from __future__ import annotations

import tempfile
from pathlib import Path

from ontoink.ttl_parser import parse_ttl_to_cytoscape


def _write(text: str) -> str:
    fh = tempfile.NamedTemporaryFile(mode="w", suffix=".ttl", delete=False, encoding="utf-8")
    fh.write(text)
    fh.close()
    return fh.name


def _parse(ttl: str) -> dict:
    path = _write(ttl)
    try:
        return parse_ttl_to_cytoscape(path)
    finally:
        Path(path).unlink(missing_ok=True)


def _restriction_edges(data: dict) -> list[dict]:
    return [e["data"] for e in data["edges"] if e["data"].get("edgeType") == "owl-restriction"]


_PREFIXES = """\
@prefix :     <http://example.org/r/> .
@prefix owl:  <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd:  <http://www.w3.org/2001/XMLSchema#> .
"""


# ---------------------------------------------------------------------------
# Per-restriction-kind coverage
# ---------------------------------------------------------------------------

def test_some_values_from_synthesises_existential_edge():
    data = _parse(_PREFIXES + """
:Filler a owl:Class .
:p a owl:ObjectProperty .
:C a owl:Class ;
    rdfs:subClassOf [ a owl:Restriction ; owl:onProperty :p ; owl:someValuesFrom :Filler ] .
""")
    edges = _restriction_edges(data)
    assert len(edges) == 1
    e = edges[0]
    assert e["owlOp"] == "someValuesFrom"
    assert e["owlOpSymbol"] == "∃"  # exists
    assert e["target"] == "http://example.org/r/Filler"
    assert e["source"] == "http://example.org/r/C"
    assert "p" in e["label"]


def test_all_values_from_synthesises_universal_edge():
    data = _parse(_PREFIXES + """
:Filler a owl:Class .
:p a owl:ObjectProperty .
:C a owl:Class ;
    rdfs:subClassOf [ a owl:Restriction ; owl:onProperty :p ; owl:allValuesFrom :Filler ] .
""")
    edges = _restriction_edges(data)
    assert len(edges) == 1
    assert edges[0]["owlOp"] == "allValuesFrom"
    assert edges[0]["owlOpSymbol"] == "∀"  # for-all


def test_min_cardinality_synthesises_self_loop():
    data = _parse(_PREFIXES + """
:p a owl:ObjectProperty .
:C a owl:Class ;
    rdfs:subClassOf [
        a owl:Restriction ;
        owl:onProperty :p ;
        owl:minCardinality "1"^^xsd:nonNegativeInteger
    ] .
""")
    edges = _restriction_edges(data)
    assert len(edges) == 1
    e = edges[0]
    assert e["owlOp"] == "minCardinality"
    assert e["owlOpSymbol"] == "≥"  # >=
    assert e["owlCardinality"] == 1
    # No filler -> self-loop on :C
    assert e["source"] == e["target"] == "http://example.org/r/C"


def test_max_cardinality_self_loop():
    data = _parse(_PREFIXES + """
:p a owl:ObjectProperty .
:C a owl:Class ;
    rdfs:subClassOf [
        a owl:Restriction ;
        owl:onProperty :p ;
        owl:maxCardinality "1"^^xsd:nonNegativeInteger
    ] .
""")
    edges = _restriction_edges(data)
    assert len(edges) == 1
    assert edges[0]["owlOp"] == "maxCardinality"
    assert edges[0]["owlOpSymbol"] == "≤"
    assert edges[0]["owlCardinality"] == 1


def test_exact_cardinality_self_loop():
    data = _parse(_PREFIXES + """
:p a owl:ObjectProperty .
:C a owl:Class ;
    rdfs:subClassOf [
        a owl:Restriction ;
        owl:onProperty :p ;
        owl:cardinality "2"^^xsd:nonNegativeInteger
    ] .
""")
    edges = _restriction_edges(data)
    assert len(edges) == 1
    assert edges[0]["owlOp"] == "cardinality"
    assert edges[0]["owlOpSymbol"] == "="
    assert edges[0]["owlCardinality"] == 2


def test_qualified_cardinality_points_at_onclass_filler():
    data = _parse(_PREFIXES + """
:Filler a owl:Class .
:p a owl:ObjectProperty .
:C a owl:Class ;
    rdfs:subClassOf [
        a owl:Restriction ;
        owl:onProperty :p ;
        owl:onClass :Filler ;
        owl:minQualifiedCardinality "1"^^xsd:nonNegativeInteger
    ] .
""")
    edges = _restriction_edges(data)
    assert len(edges) == 1
    e = edges[0]
    assert e["owlOp"] == "minQualifiedCardinality"
    assert e["owlOpSymbol"] == "≥"
    assert e["owlCardinality"] == 1
    assert e["target"] == "http://example.org/r/Filler"


def test_has_value_with_iri_target():
    data = _parse(_PREFIXES + """
:p a owl:ObjectProperty .
:Alice a :Person .
:C a owl:Class ;
    rdfs:subClassOf [ a owl:Restriction ; owl:onProperty :p ; owl:hasValue :Alice ] .
""")
    edges = _restriction_edges(data)
    assert len(edges) == 1
    e = edges[0]
    assert e["owlOp"] == "hasValue"
    assert e["target"] == "http://example.org/r/Alice"


# ---------------------------------------------------------------------------
# Hygiene: the parser must NOT leak restriction bnodes as class nodes,
# and it must NOT materialise owl:Restriction itself as a floating class.
# ---------------------------------------------------------------------------

def test_restriction_bnode_does_not_become_a_node():
    data = _parse(_PREFIXES + """
:Filler a owl:Class .
:p a owl:ObjectProperty .
:C a owl:Class ;
    rdfs:subClassOf [ a owl:Restriction ; owl:onProperty :p ; owl:someValuesFrom :Filler ] .
""")
    labels = {n["data"]["label"] for n in data["nodes"]}
    assert "owl:Restriction" not in labels
    assert "Restriction" not in labels
    # No bnode-id leaks either
    for n in data["nodes"]:
        assert not n["data"]["id"].startswith("bn_"), n["data"]


def test_multiple_restrictions_on_same_class_create_multiple_edges():
    # The AIO / SOS anti-pattern: two existential restrictions on the same
    # property with disjoint fillers. Both must produce visible edges.
    data = _parse(_PREFIXES + """
:A a owl:Class .  :B a owl:Class .
:A owl:disjointWith :B .
:p a owl:ObjectProperty .
:C a owl:Class ;
    rdfs:subClassOf [ a owl:Restriction ; owl:onProperty :p ; owl:someValuesFrom :A ] ;
    rdfs:subClassOf [ a owl:Restriction ; owl:onProperty :p ; owl:someValuesFrom :B ] .
""")
    edges = _restriction_edges(data)
    assert len(edges) == 2
    targets = {e["target"] for e in edges}
    assert targets == {"http://example.org/r/A", "http://example.org/r/B"}


def test_label_uses_predicate_local_name_and_operator():
    data = _parse(_PREFIXES + """
:Filler a owl:Class .
:contains a owl:ObjectProperty .
:C a owl:Class ;
    rdfs:subClassOf [ a owl:Restriction ; owl:onProperty :contains ; owl:someValuesFrom :Filler ] .
""")
    edges = _restriction_edges(data)
    assert len(edges) == 1
    label = edges[0]["label"]
    assert "∃" in label
    assert "contains" in label


def test_cardinality_label_includes_n():
    data = _parse(_PREFIXES + """
:p a owl:ObjectProperty .
:C a owl:Class ;
    rdfs:subClassOf [
        a owl:Restriction ;
        owl:onProperty :p ;
        owl:minCardinality "3"^^xsd:nonNegativeInteger
    ] .
""")
    edges = _restriction_edges(data)
    assert len(edges) == 1
    assert edges[0]["label"].startswith("≥3 ")  # ">=3 "


# ---------------------------------------------------------------------------
# End-to-end: the bundled and-is-or example should now render two
# restriction edges (CakeRecipe -> Chocolate, CakeRecipe -> Milk).
# ---------------------------------------------------------------------------

def test_and_is_or_example_renders_two_existential_edges():
    p = Path(__file__).resolve().parents[1] / "demo" / "docs" / "anti-pattern-shapes" / "and-is-or" / "data.ttl"
    assert p.exists(), p
    data = parse_ttl_to_cytoscape(str(p))
    r_edges = _restriction_edges(data)
    assert len(r_edges) == 2
    for e in r_edges:
        assert e["owlOp"] == "someValuesFrom"
        assert "contains" in e["label"]
    targets = {e["target"].split("/")[-1] for e in r_edges}
    assert targets == {"Chocolate", "Milk"}
    # Restriction itself must not appear as a class node
    assert not any(n["data"]["label"] in ("owl:Restriction", "Restriction") for n in data["nodes"])
