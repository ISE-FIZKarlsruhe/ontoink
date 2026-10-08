"""A property drawn as a node is typed as a property, not as an individual.

Reported against the componency content pattern: all four of its object properties - `has
component`, `is component of`, `hasPart`, `isPartOf` - were drawn and labelled as individuals,
while being declared `rdf:type owl:ObjectProperty` three lines above in the same file. The
pattern was correct; the visualisation was not.

The cause was that the node-type decision was a two-way branch, written out at four separate
call sites:

    node_type = "Class" if iri in classes else "Individual"

which is only right for an ontology with no properties in it. A property that carries
statements of its own - `rdfs:domain`, `rdfs:range`, `rdfs:subPropertyOf` - becomes a node like
anything else, is not a member of `classes`, and so fell through to "Individual". The
information was never missing: `_detect_property_types` had already collected both sets and the
caller did not consult them.

Measured over the 163 patterns OntoBoard ships: 1085 nodes in 147 of them were affected, 997
object properties and 88 datatype properties.
"""
from __future__ import annotations

import tempfile
from pathlib import Path

from ontoink.ttl_parser import NODE_STYLES, parse_ttl_to_cytoscape

PREFIXES = """\
@prefix : <http://example.org/p#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
"""


def _parse(ttl: str) -> dict:
    fh = tempfile.NamedTemporaryFile(mode="w", suffix=".ttl", delete=False, encoding="utf-8")
    fh.write(PREFIXES + ttl)
    fh.close()
    try:
        return parse_ttl_to_cytoscape(fh.name)
    finally:
        Path(fh.name).unlink(missing_ok=True)


def _types(graph: dict) -> dict:
    """label -> node type, for every node that is not a literal."""
    out = {}
    for node in graph.get("nodes", []):
        data = node["data"]
        if data.get("type") == "Literal":
            continue
        out[str(data.get("label") or data.get("id"))] = data.get("type")
    return out


# --------------------------------------------------------------- the report

COMPONENCY = """\
:hasComponent rdf:type owl:ObjectProperty ;
              owl:inverseOf :isComponentOf ;
              rdfs:domain owl:Thing ;
              rdfs:range owl:Thing ;
              rdfs:label "has component"@en .

:isComponentOf rdf:type owl:ObjectProperty ;
               rdfs:domain owl:Thing ;
               rdfs:range owl:Thing ;
               rdfs:label "is component of"@en .

:Object rdf:type owl:Class ;
        rdfs:label "Object"@en .
"""


def test_an_object_property_is_not_an_individual():
    """The exact shape that was reported, reduced to its two properties."""
    types = _types(_parse(COMPONENCY))

    assert types.get("is component of") == "ObjectProperty", types
    assert types.get("has component") == "ObjectProperty", types
    assert "Individual" not in (types.get("is component of"), types.get("has component"))


def test_a_datatype_property_is_not_an_individual():
    types = _types(_parse("""\
:age rdf:type owl:DatatypeProperty ;
     rdfs:domain :Person ;
     rdfs:range xsd:integer ;
     rdfs:label "age"@en .

:Person rdf:type owl:Class ; rdfs:label "Person"@en .
"""))

    assert types.get("age") == "DatatypeProperty", types


def test_a_real_individual_is_still_an_individual():
    """The fix must not relabel the thing the old branch got right."""
    types = _types(_parse("""\
:Person rdf:type owl:Class ; rdfs:label "Person"@en .
:alice rdf:type :Person ; rdfs:label "Alice"@en .
"""))

    assert types.get("Person") == "Class", types
    assert types.get("Alice") == "Individual", types


def test_a_class_stays_a_class_even_when_also_declared_a_property():
    """A punned IRI is drawn as a class, because that is what the subclass edges assume.

    `classes` is what the hierarchy edges are built from, so typing such a node as a property
    would draw a subclass hierarchy between nodes that are not shown as classes.
    """
    types = _types(_parse("""\
:odd rdf:type owl:Class , owl:ObjectProperty ;
     rdfs:label "odd"@en .
:sub rdf:type owl:Class ; rdfs:subClassOf :odd ; rdfs:label "sub"@en .
"""))

    assert types.get("odd") == "Class", types


def test_both_property_kinds_have_a_style():
    """A node type with no entry in NODE_STYLES raises a KeyError when it is drawn."""
    for kind in ("ObjectProperty", "DatatypeProperty"):
        shape, colour = NODE_STYLES[kind]
        assert shape, kind
        assert colour.startswith("#"), kind

    # And they are told apart from each other and from an individual.
    assert NODE_STYLES["ObjectProperty"][1] != NODE_STYLES["DatatypeProperty"][1]
    assert NODE_STYLES["ObjectProperty"][1] != NODE_STYLES["Individual"][1]


def test_an_undeclared_predicate_is_not_promoted():
    """Only a declared property is typed as one; a bare predicate is left alone.

    Guessing from use would type `:knows` as a property on the strength of appearing in the
    predicate position, which is true of `rdfs:label` too.
    """
    types = _types(_parse("""\
:Person rdf:type owl:Class ; rdfs:label "Person"@en .
:alice rdf:type :Person ; :knows :bob ; rdfs:label "Alice"@en .
:bob rdf:type :Person ; rdfs:label "Bob"@en .
"""))

    assert "ObjectProperty" not in types.values(), types
    assert types.get("Alice") == "Individual", types
