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
from typing import Optional

import pytest
from rdflib import Graph

from ontoink import recommend

from .js_engine import build_engine, run_node as _run_node

pytestmark = pytest.mark.skipif(
    shutil.which("node") is None, reason="Node.js is not installed"
)


@pytest.fixture(scope="module")
def js_engine() -> str:
    """The subset of ontoink.js needed to run recommendShapes headlessly."""
    return build_engine()


def run_recommend(js_engine: str, ttl: str, shacl: Optional[str] = None,
                  method: str = "auto", only_uncovered: bool = True,
                  params: Optional[dict] = None) -> dict:
    script = js_engine + f"""
      // argv[2], not argv[1]: the engine runs from a file now, so argv[1] is
      // the script path. Under the old `node -e` form it was the first arg.
      var out = recommendShapes(
        JSON.parse(process.argv[2]),
        {{
          method: {json.dumps(method)},
          shacl: {json.dumps(shacl) if shacl else "undefined"},
          onlyUncovered: {json.dumps(only_uncovered)},
          params: {json.dumps(params) if params else "undefined"},
        }}
      );
      console.log(JSON.stringify(out));
    """
    proc = _run_node(script, json.dumps(ttl))
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
    # Four instances; `email` is on 1 of 4, `nick` on 2 of 4, `name` on 4 of 4.
    # Every other fixture has properties that are either universal or absent, so
    # the coverage threshold makes no difference on them and could be broken in
    # one engine without any test noticing. Here it decides the result.
    "partial_coverage": """
        @prefix ex: <http://example.org/> .
        @prefix owl: <http://www.w3.org/2002/07/owl#> .

        ex:Person a owl:Class .
        ex:a a ex:Person ; ex:name "A" ; ex:nick "aa" ; ex:email "a@x" .
        ex:b a ex:Person ; ex:name "B" ; ex:nick "bb" .
        ex:c a ex:Person ; ex:name "C" .
        ex:d a ex:Person ; ex:name "D" .
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


# ── the method catalogue, which is the part most likely to drift ──────────

def _js_catalogue(js_engine: str) -> dict:
    proc = _run_node(js_engine + "console.log(JSON.stringify(methodCatalogue()));")
    assert proc.returncode == 0, proc.stderr
    return {m["name"]: m for m in json.loads(proc.stdout)}


def test_both_engines_offer_the_same_methods(js_engine):
    py = {m["name"]: m for m in recommend.method_catalogue()}
    assert set(py) == set(_js_catalogue(js_engine))


def test_citations_match_exactly(js_engine):
    """A citation corrected on one side only is a wrong attribution shown to a reader."""
    py = {m["name"]: m for m in recommend.method_catalogue()}
    js = _js_catalogue(js_engine)
    for name, spec in py.items():
        assert js[name]["reference"] == spec["reference"], f"{name}: reference drifted"
        assert js[name]["label"] == spec["label"], f"{name}: label drifted"
        assert js[name]["summary"] == spec["summary"], f"{name}: summary drifted"
        assert js[name]["needs"] == spec["needs"], f"{name}: input requirement drifted"


def test_every_shipped_method_carries_a_citation():
    """The stated rule for what may ship: published, referenced methods only.

    `auto` is the exception and is meant to be — it is not a method, it is the
    composition of two that are cited, and each constraint it emits records
    which one produced it.
    """
    for spec in recommend.method_catalogue():
        if spec["name"] == "auto":
            assert spec["reference"] is None
            continue
        ref = spec["reference"]
        assert ref and ref.get("citation") and ref.get("doi"), (
            f"{spec['name']} ships without a citable reference"
        )


def test_hyperparameter_specs_match(js_engine):
    js = _js_catalogue(js_engine)
    for spec in recommend.method_catalogue():
        py_params = {p["name"]: p for p in spec["params"]}
        js_params = {p["name"]: p for p in js[spec["name"]]["params"]}
        assert py_params.keys() == js_params.keys(), f"{spec['name']}: knobs differ"
        for name, meta in py_params.items():
            other = js_params[name]
            for field in ("type", "default", "min", "max", "label", "doc"):
                if field in meta:
                    assert other.get(field) == meta[field], (
                        f"{spec['name']}.{name}: {field} drifted"
                    )


def test_baseline_threshold_moves_both_engines_the_same_way(js_engine):
    """The knob has to reach the algorithm identically in Python and JS.

    `mixed_no_instances_for_astrea_class` has a property on 3 of 3 instances
    and nothing partial, so it would pass at any threshold; `partial_coverage`
    exists to make the threshold the deciding factor.
    """
    ttl = FIXTURES["partial_coverage"]
    g = Graph()
    g.parse(data=ttl, format="turtle")

    for threshold in (0.1, 0.5, 0.75, 1.0):
        params = {"min_count_threshold": threshold}
        py = recommend.recommend_payload(g, method="baseline", params=params)
        js = run_recommend(js_engine, ttl, method="baseline", params=params)
        assert _keys(py["constraints"]) == _keys(js["constraints"]), (
            f"threshold {threshold}: engines disagree"
        )

    loose = recommend.recommend_payload(
        g, method="baseline", params={"min_count_threshold": 0.1})
    strict = recommend.recommend_payload(
        g, method="baseline", params={"min_count_threshold": 1.0})
    assert _keys(loose["constraints"]) > _keys(strict["constraints"]), (
        "the threshold did not change the result — the knob is not wired up"
    )


def test_out_of_range_and_unknown_params_are_handled_identically(js_engine):
    ttl = FIXTURES["partial_coverage"]
    g = Graph()
    g.parse(data=ttl, format="turtle")

    # Clamped above the maximum, and a typo that must not reach the method.
    params = {"min_count_threshold": 5, "min_cout_threshold": 0.1}
    py = recommend.recommend_payload(g, method="baseline", params=params)
    js = run_recommend(js_engine, ttl, method="baseline", params=params)

    assert py["params"] == {"min_count_threshold": 1.0}
    assert js["params"] == {"min_count_threshold": 1.0}
    assert _keys(py["constraints"]) == _keys(js["constraints"])


def test_browser_says_so_rather_than_pretending_to_run_shexer(js_engine):
    """The JS engine cannot run a Python library, and must not claim otherwise."""
    js = run_recommend(js_engine, FIXTURES["data_driven"], method="shexer")
    assert js["method"] == "auto"
    assert "shexer" in js["notice"] and "browser" in js["notice"]
    assert js["constraints"], "fell back but produced nothing"


def test_unknown_method_rejected_the_same_way(js_engine):
    with pytest.raises(ValueError):
        recommend.induce(Graph(), method="nope")

    proc = _run_node(
        js_engine + 'recommendShapes({triples:[],prefixes:{}}, {method:"nope"});')
    assert proc.returncode != 0
    assert "unknown recommendation method" in proc.stderr
