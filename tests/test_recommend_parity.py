"""Parity between the Python inducer and its browser twin.

The SHACL Editor page runs on static hosts, where `POST /recommend-shapes`
doesn't exist, so the browser needs its own copy of `ontoink/recommend/`. That
copy (`ontoink.recommendShapes` in ontoink.js) is a deliberate re-implementation
in a different language, and re-implementations drift. This file is what
notices — it runs identical Turtle through both engines and asserts the
constraint sets match on the `(class, path, kind, value)` identity tuple,
exactly the tuple `Constraint.key()` uses for dedup and the drift diff.

Requires Node.js; skipped otherwise.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest
from rdflib import Graph

from ontoink import recommend

ONTOINK_JS = Path(__file__).resolve().parents[1] / "ontoink" / "resources" / "ontoink.js"

pytestmark = pytest.mark.skipif(
    shutil.which("node") is None, reason="Node.js is not installed"
)


def _extract_function(source: str, name: str) -> str:
    start = source.index(f"function {name}(")
    depth = 0
    for i in range(source.index("{", start), len(source)):
        if source[i] == "{":
            depth += 1
        elif source[i] == "}":
            depth -= 1
            if depth == 0:
                return source[start:i + 1]
    raise AssertionError(f"unbalanced braces while extracting {name}")


@pytest.fixture(scope="module")
def js_engine() -> str:
    """The subset of ontoink.js needed to run recommendShapes headlessly."""
    source = ONTOINK_JS.read_text(encoding="utf-8")
    names = [
        "parseTtlMinimal", "tokenize", "_shortIri", "_indexTriples", "_isMeta",
        "_isDatatypeIri", "_isLiteralTerm", "_literalDatatype",
        "_instantiatedClasses", "_declaredClasses", "_profileClass",
        "_constraint", "_constraintKey", "_mergeConstraints", "_addConstraint",
        "_induceBaseline", "_induceAstrea", "_shapeIri", "_formatValue",
        "_emitShape", "_coveredClassesFromTriples", "_labelFor",
        "recommendShapes",
    ]
    consts = "\n".join([
        'var _RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";',
        'var _RDFS = "http://www.w3.org/2000/01/rdf-schema#";',
        'var _OWL = "http://www.w3.org/2002/07/owl#";',
        'var _XSD = "http://www.w3.org/2001/XMLSchema#";',
        'var _SH_IRI = "http://www.w3.org/ns/shacl#IRI";',
        'var _META_NS = [_OWL, _RDF_TYPE.substring(0, _RDF_TYPE.lastIndexOf("#") + 1), _RDFS, "http://www.w3.org/ns/shacl#"];',
        'var _NUMERIC_KINDS = {minCount:1,maxCount:1,minLength:1,maxLength:1,minInclusive:1,maxInclusive:1};',
        'var _IRI_KINDS = {datatype:1,"class":1,nodeKind:1};',
    ])
    return consts + "\n" + "\n".join(_extract_function(source, n) for n in names)


def run_recommend(js_engine: str, ttl: str, shacl: str = None, method: str = "auto",
                  only_uncovered: bool = True) -> dict:
    script = js_engine + f"""
      var out = recommendShapes(
        JSON.parse(process.argv[1]),
        {{
          method: {json.dumps(method)},
          shacl: {json.dumps(shacl) if shacl else "undefined"},
          onlyUncovered: {json.dumps(only_uncovered)},
        }}
      );
      console.log(JSON.stringify(out));
    """
    proc = subprocess.run(
        ["node", "-e", script, json.dumps(ttl)],
        capture_output=True, text=True,
    )
    assert proc.returncode == 0, proc.stderr
    return json.loads(proc.stdout)


def _keys(constraints) -> set:
    return {(c["targetClass"], c["path"], c["kind"], c["value"]) for c in constraints}


FIXTURES = {
    "data_driven": """
        @prefix ex: <http://example.org/> .
        @prefix owl: <http://www.w3.org/2002/07/owl#> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

        ex:Person a owl:Class .
        ex:Dog a owl:Class .
        ex:name a owl:DatatypeProperty ; rdfs:domain ex:Person ; rdfs:range xsd:string .
        ex:owns a owl:ObjectProperty, owl:FunctionalProperty ;
            rdfs:domain ex:Person ; rdfs:range ex:Dog .

        ex:alice a ex:Person ; ex:name "Alice" ; ex:owns ex:rex .
        ex:bob   a ex:Person ; ex:name "Bob"   ; ex:owns ex:fido .
        ex:carol a ex:Person ; ex:name "Carol" ; ex:owns ex:rex .
        ex:rex a ex:Dog .
        ex:fido a ex:Dog .
    """,
    "axioms_only": """
        @prefix ex: <http://example.org/> .
        @prefix owl: <http://www.w3.org/2002/07/owl#> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

        ex:Sample a owl:Class ;
            rdfs:subClassOf [ a owl:Restriction ;
                              owl:onProperty ex:material ;
                              owl:someValuesFrom ex:Material ] .
        ex:Material a owl:Class .
        ex:material a owl:ObjectProperty ; rdfs:domain ex:Sample ; rdfs:range ex:Material .
    """,
    # A property that declares domain+range but is never USED in any triple.
    # The Python port originally discovered properties via g.predicates(),
    # which finds only properties used in instance data — so it emitted
    # nothing here while the JS port (which iterates rdfs:domain subjects)
    # emitted the constraints. Neither the unit tests nor the five research
    # benchmarks caught the divergence, because every one of them has data
    # that exercises its properties.
    "declared_but_unused_properties": """
        @prefix ex: <http://example.org/> .
        @prefix owl: <http://www.w3.org/2002/07/owl#> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

        ex:Person a owl:Class .
        ex:Dog a owl:Class .
        ex:name a owl:DatatypeProperty, owl:FunctionalProperty ;
            rdfs:domain ex:Person ; rdfs:range xsd:string .
        ex:owns a owl:ObjectProperty ;
            rdfs:domain ex:Person ; rdfs:range ex:Dog .
    """,
    "mixed_no_instances_for_astrea_class": """
        @prefix ex: <http://example.org/> .
        @prefix owl: <http://www.w3.org/2002/07/owl#> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

        ex:Widget a owl:Class ;
            rdfs:subClassOf [ a owl:Restriction ;
                              owl:onProperty ex:code ;
                              owl:allValuesFrom xsd:string ] .
        ex:code a owl:DatatypeProperty .

        ex:Person a owl:Class .
        ex:label a owl:DatatypeProperty ; rdfs:domain ex:Person ; rdfs:range xsd:string ;
            a owl:FunctionalProperty .
        ex:p1 a ex:Person ; ex:label "one" .
        ex:p2 a ex:Person ; ex:label "two" .
        ex:p3 a ex:Person ; ex:label "three" .
    """,
}


@pytest.mark.parametrize("fixture_name", sorted(FIXTURES))
@pytest.mark.parametrize("method", ["auto", "baseline", "astrea"])
def test_constraint_sets_match(js_engine, fixture_name, method):
    ttl = FIXTURES[fixture_name]
    g = Graph()
    g.parse(data=ttl, format="turtle")

    py = recommend.recommend_payload(g, method=method)
    js = run_recommend(js_engine, ttl, method=method)

    py_keys = _keys(py["constraints"])
    js_keys = _keys(js["constraints"])
    assert py_keys == js_keys, (
        f"[{fixture_name}/{method}] only in Python: {py_keys - js_keys}; "
        f"only in JS: {js_keys - py_keys}"
    )


@pytest.mark.parametrize("fixture_name", sorted(FIXTURES))
def test_confidence_and_support_match(js_engine, fixture_name):
    """Not just which constraints — the evidence behind them, too."""
    ttl = FIXTURES[fixture_name]
    g = Graph()
    g.parse(data=ttl, format="turtle")

    py = recommend.recommend_payload(g, method="auto")
    js = run_recommend(js_engine, ttl, method="auto")

    def by_key(constraints):
        return {
            (c["targetClass"], c["path"], c["kind"], c["value"]):
                (round(c["confidence"], 4), c["support"], c["population"])
            for c in constraints
        }

    py_ev, js_ev = by_key(py["constraints"]), by_key(js["constraints"])
    assert py_ev.keys() == js_ev.keys()
    for key in py_ev:
        assert py_ev[key] == js_ev[key], f"{fixture_name}: evidence mismatch on {key}"


def test_already_covered_classes_are_skipped_in_both(js_engine):
    ttl = FIXTURES["data_driven"]
    shapes = (
        "@prefix sh: <http://www.w3.org/ns/shacl#> .\n"
        "@prefix ex: <http://example.org/> .\n"
        "ex:PersonShape a sh:NodeShape ; sh:targetClass ex:Person .\n"
    )
    g = Graph()
    g.parse(data=ttl, format="turtle")
    shape_g = Graph()
    shape_g.parse(data=shapes, format="turtle")

    py = recommend.recommend_payload(g, shape_graph=shape_g)
    js = run_recommend(js_engine, ttl, shacl=shapes)

    assert py["alreadyCovered"] == js["alreadyCovered"] == ["http://example.org/Person"]
    assert {s["targetClass"] for s in py["shapes"]} == {s["targetClass"] for s in js["shapes"]}


def test_unknown_method_rejected_the_same_way(js_engine):
    with pytest.raises(ValueError):
        recommend.induce(Graph(), method="nope")

    proc = subprocess.run(
        ["node", "-e", js_engine + 'recommendShapes({triples:[],prefixes:{}}, {method:"nope"});'],
        capture_output=True, text=True,
    )
    assert proc.returncode != 0
    assert "unknown recommendation method" in proc.stderr
