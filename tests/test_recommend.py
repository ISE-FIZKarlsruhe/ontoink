"""Tests for the shape-recommendation subpackage (ontoink.recommend)."""

from __future__ import annotations

import pytest
from rdflib import Graph

from ontoink import recommend
from ontoink.recommend.drift import check_drift, format_findings
from ontoink.recommend.types import ConstraintKind


DATA_TTL = """
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
"""

# No instances at all — the documentation-ontology case that the data-driven
# method cannot serve and the axiom-driven one must.
AXIOMS_ONLY_TTL = """
@prefix ex: <http://example.org/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

ex:Sample a owl:Class ;
    rdfs:subClassOf [ a owl:Restriction ;
                      owl:onProperty ex:material ;
                      owl:someValuesFrom ex:Material ] .
ex:Material a owl:Class .
ex:material a owl:ObjectProperty ; rdfs:domain ex:Sample ; rdfs:range ex:Material .
"""


@pytest.fixture
def data_graph():
    g = Graph()
    g.parse(data=DATA_TTL, format="turtle")
    return g


@pytest.fixture
def axioms_graph():
    g = Graph()
    g.parse(data=AXIOMS_ONLY_TTL, format="turtle")
    return g


def _keys(shape_set):
    return {(c.path, c.kind, c.value) for c in shape_set.all_constraints()}


def test_baseline_emits_cardinality_from_instance_data(data_graph):
    shapes = recommend.induce(data_graph, method="baseline")
    keys = _keys(shapes)
    name = "http://example.org/name"
    assert (name, ConstraintKind.MIN_COUNT, "1") in keys
    assert (name, ConstraintKind.MAX_COUNT, "1") in keys


def test_baseline_records_support_and_population(data_graph):
    shapes = recommend.induce(data_graph, method="baseline")
    minc = [c for c in shapes.all_constraints()
            if c.kind is ConstraintKind.MIN_COUNT and c.path.endswith("name")][0]
    assert minc.support == 3 and minc.population == 3
    assert minc.confidence == pytest.approx(1.0)
    assert "3/3" in minc.evidence()


def test_astrea_works_without_any_instances(axioms_graph):
    shapes = recommend.induce(axioms_graph, method="astrea")
    keys = _keys(shapes)
    material = "http://example.org/material"
    assert (material, ConstraintKind.CLASS, "http://example.org/Material") in keys
    assert (material, ConstraintKind.MIN_COUNT, "1") in keys


def test_baseline_finds_nothing_without_instances(axioms_graph):
    assert len(recommend.induce(axioms_graph, method="baseline")) == 0


# The axiom-only case is the whole reason astrea ships, and it is the one the
# benchmark suite cannot check: every benchmark dataset has instance data that
# *uses* its properties, which masks a domain/range branch that only looks at
# properties appearing in predicate position.
DOMAIN_RANGE_ONLY_TTL = """
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
"""


@pytest.fixture
def domain_range_only_graph():
    g = Graph()
    g.parse(data=DOMAIN_RANGE_ONLY_TTL, format="turtle")
    return g


def test_astrea_reads_domain_and_range_with_zero_instances(domain_range_only_graph):
    """A property that declares a domain must be found even if nothing uses it.

    In an ontology with no individuals a property appears as the *subject* of
    rdfs:domain and never in predicate position, so discovering properties via
    ``g.predicates()`` finds nothing here — which would silently disable the
    axiom-driven method for documentation ontologies, its primary audience.
    """
    shapes = recommend.induce(domain_range_only_graph, method="astrea")
    keys = _keys(shapes)
    name, owns = "http://example.org/name", "http://example.org/owns"

    assert (name, ConstraintKind.DATATYPE, "http://www.w3.org/2001/XMLSchema#string") in keys
    assert (owns, ConstraintKind.CLASS, "http://example.org/Dog") in keys
    # owl:FunctionalProperty on an unused property still implies maxCount 1.
    assert (name, ConstraintKind.MAX_COUNT, "1") in keys


def test_astrea_is_unaffected_by_whether_properties_are_used(domain_range_only_graph):
    """Adding instances must not change what the axiom-driven method derives."""
    axiom_only = _keys(recommend.induce(domain_range_only_graph, method="astrea"))

    with_data = Graph()
    with_data.parse(
        data=DOMAIN_RANGE_ONLY_TTL + '\nex:a a ex:Person ; ex:name "A" ; ex:owns ex:d .\n',
        format="turtle",
    )
    assert _keys(recommend.induce(with_data, method="astrea")) == axiom_only


def test_auto_merges_both_methods_without_duplicates(data_graph):
    merged = recommend.induce(data_graph, method="auto")
    keys = [c.key() for c in merged.all_constraints()]
    assert len(keys) == len(set(keys)), "auto must not emit the same constraint twice"
    methods = {m for c in merged.all_constraints() for m in c.method.split(",")}
    assert methods == {"astrea", "baseline"}


def test_auto_keeps_instance_evidence_when_both_methods_agree(data_graph):
    """ex:owns is functional (axiom) and single-valued in the data.

    The axiom pass runs first and carries no counts, so keeping only the first
    arrival used to discard the instance evidence the data pass found for the
    very same constraint.
    """
    merged = recommend.induce(data_graph, method="auto")
    owns_max = [
        c for c in merged.all_constraints()
        if c.path.endswith("owns") and c.kind is ConstraintKind.MAX_COUNT
    ]
    assert len(owns_max) == 1, "the two derivations must collapse to one constraint"
    constraint = owns_max[0]
    assert "astrea" in constraint.method and "baseline" in constraint.method
    assert constraint.population == 3, "instance counts must survive the merge"
    assert constraint.support == 3


def test_merged_constraint_reports_its_evidence(data_graph):
    merged = recommend.induce(data_graph, method="auto")
    constraint = [
        c for c in merged.all_constraints()
        if c.path.endswith("owns") and c.kind is ConstraintKind.MAX_COUNT
    ][0]
    assert "3/3" in constraint.evidence()


def test_shape_iri_is_recorded_for_every_class(data_graph):
    """Guards the naming rule against silent drift."""
    for cls in ("http://example.org/Person", "http://ex.org/o#Thing", "urn:x:Thing"):
        assert recommend.shape_iri(cls) == cls + "Shape"


def test_unknown_method_is_rejected(data_graph):
    with pytest.raises(ValueError, match="unknown recommendation method"):
        recommend.induce(data_graph, method="nope")


def test_min_confidence_filters(data_graph):
    everything = recommend.induce(data_graph, method="baseline")
    strict = recommend.induce(data_graph, method="baseline", min_confidence=1.01)
    assert len(everything) > 0 and len(strict) == 0


def test_written_turtle_is_valid_and_carries_evidence(data_graph):
    shapes = recommend.induce(data_graph, method="auto")
    ttl = recommend.write_shape_set(shapes)

    parsed = Graph()
    parsed.parse(data=ttl, format="turtle")  # must round-trip

    assert "oi:confidence" in ttl
    assert "sh:description" in ttl
    # The prefix block should describe this file, not dump rdflib's defaults.
    assert "@prefix brick:" not in ttl


def test_shape_iri_handles_slash_namespaces():
    assert recommend.shape_iri("http://ex.org/Person") == "http://ex.org/PersonShape"
    assert recommend.shape_iri("http://ex.org/o#Person") == "http://ex.org/o#PersonShape"


def test_scaffold_for_class_is_parseable(data_graph):
    ttl = recommend.shape_for_class(data_graph, "http://example.org/Person")
    g = Graph()
    g.parse(data="@prefix sh: <http://www.w3.org/ns/shacl#> .\n" + ttl, format="turtle")
    assert "sh:targetClass" in ttl


def test_scaffold_for_unknown_class_is_still_valid_turtle(data_graph):
    ttl = recommend.shape_for_class(data_graph, "http://example.org/Missing")
    g = Graph()
    g.parse(data="@prefix sh: <http://www.w3.org/ns/shacl#> .\n" + ttl, format="turtle")


def test_payload_skips_classes_the_author_already_covered(data_graph):
    shapes = Graph()
    shapes.parse(data="""
        @prefix sh: <http://www.w3.org/ns/shacl#> .
        @prefix ex: <http://example.org/> .
        ex:PersonShape a sh:NodeShape ; sh:targetClass ex:Person .
    """, format="turtle")

    payload = recommend.recommend_payload(data_graph, shape_graph=shapes)
    targets = {s["targetClass"] for s in payload["shapes"]}
    assert "http://example.org/Person" not in targets
    assert "http://example.org/Person" in payload["alreadyCovered"]


def test_payload_is_json_serialisable(data_graph):
    import json

    payload = recommend.recommend_payload(data_graph)
    json.dumps(payload)  # must not raise
    assert payload["stats"]["constraintsProposed"] == len(payload["constraints"])


# ── the method catalogue and its hyperparameters ──────────────────────────

def test_the_catalogue_states_availability_rather_than_assuming_it():
    catalogue = {m["name"]: m for m in recommend.method_catalogue()}
    assert set(catalogue) == {"auto", "baseline", "astrea", "shexer"}
    for name in ("auto", "baseline", "astrea"):
        assert catalogue[name]["available"] is True
    # sheXer is an optional dependency, so its availability is resolved, not
    # declared — a client that offers it blindly gets a failure at run time.
    assert catalogue["shexer"]["available"] == recommend.shexer_available()
    if not catalogue["shexer"]["available"]:
        assert "ontoink[shexer]" in catalogue["shexer"]["unavailable_reason"]


def test_the_catalogue_never_leaks_packaging_details():
    """`extra` is how *we* install a method; it is not a fact about the method."""
    for spec in recommend.method_catalogue():
        assert "extra" not in spec


def test_unknown_parameters_are_dropped_not_forwarded(data_graph):
    """A typo in a fence's YAML must degrade to the default, not fail the build.

    Forwarded, an unknown key reaches the method as an unexpected keyword
    argument and turns a misspelling into a TypeError at build time.
    """
    assert recommend.coerce_params("baseline", {"min_cout_threshold": 0.5}) == {}
    # …and the whole path tolerates it, not just the coercion helper.
    recommend.recommend_payload(data_graph, method="baseline",
                                params={"nonsense": 1, "min_count_threshold": 0.5})


@pytest.mark.parametrize("given,expected", [
    (5, 1.0),          # above the declared maximum
    (-3, 0.0),         # below the declared minimum
    ("0.25", 0.25),    # a string, as an HTML input would send it
    ("nonsense", None),  # uncoercible: dropped rather than crashing
])
def test_parameters_are_coerced_and_clamped(given, expected):
    got = recommend.coerce_params("baseline", {"min_count_threshold": given})
    if expected is None:
        assert got == {}
    else:
        assert got == {"min_count_threshold": expected}


def test_the_baseline_threshold_reaches_the_algorithm():
    """A knob the UI reports but the method ignores is worse than no knob."""
    g = Graph()
    g.parse(data="""
        @prefix ex: <http://example.org/> .
        @prefix owl: <http://www.w3.org/2002/07/owl#> .
        ex:Person a owl:Class .
        ex:a a ex:Person ; ex:name "A" ; ex:nick "aa" .
        ex:b a ex:Person ; ex:name "B" ; ex:nick "bb" .
        ex:c a ex:Person ; ex:name "C" .
        ex:d a ex:Person ; ex:name "D" .
    """, format="turtle")

    def min_counts(threshold):
        shapes = recommend.induce(g, method="baseline",
                                  params={"min_count_threshold": threshold})
        return {c.path for c in shapes.all_constraints()
                if c.kind is ConstraintKind.MIN_COUNT}

    # `nick` is on 2 of 4 instances: required at 0.5, not at the 0.9 default.
    assert "http://example.org/nick" not in min_counts(0.9)
    assert "http://example.org/nick" in min_counts(0.5)


def test_auto_takes_its_parameters_keyed_by_sub_method():
    """A flat namespace would let two composed methods collide on a name."""
    g = Graph()
    g.parse(data="""
        @prefix ex: <http://example.org/> .
        @prefix owl: <http://www.w3.org/2002/07/owl#> .
        ex:Person a owl:Class .
        ex:a a ex:Person ; ex:name "A" ; ex:nick "aa" .
        ex:b a ex:Person ; ex:name "B" ; ex:nick "bb" .
        ex:c a ex:Person ; ex:name "C" .
        ex:d a ex:Person ; ex:name "D" .
    """, format="turtle")

    strict = recommend.induce(g, method="auto").keys()
    loose = recommend.induce(
        g, method="auto", params={"baseline": {"min_count_threshold": 0.5}}).keys()
    assert loose > strict


def test_the_payload_carries_the_catalogue_so_a_page_needs_no_round_trip(data_graph):
    payload = recommend.recommend_payload(data_graph, method="baseline",
                                          params={"min_count_threshold": 0.5})
    assert payload["params"] == {"min_count_threshold": 0.5}
    assert {m["name"] for m in payload["methods"]} == {"auto", "baseline",
                                                       "astrea", "shexer"}


def test_asking_for_shexer_without_it_falls_back_and_says_so(data_graph, monkeypatch):
    """The degradation path, tested whether or not sheXer happens to be installed.

    Skipping this when the library is present would mean the branch is only
    ever exercised on machines that cannot exercise the method it guards — so
    the ImportError is forced rather than waited for.
    """
    def missing(*args, **kwargs):
        raise ImportError("No module named 'shexer'")

    monkeypatch.setitem(recommend.METHODS, "shexer", missing)

    payload = recommend.recommend_payload(data_graph, method="shexer")
    assert payload["method"] == "auto"
    assert "ontoink[shexer]" in payload["notice"]
    assert payload["constraints"], "fell back but produced nothing"


# ── sheXer, when its optional library is installed ────────────────────────

pytest_shexer = pytest.mark.skipif(
    not recommend.shexer_available(), reason="sheXer is not installed")


@pytest_shexer
def test_shexer_produces_constraints_and_records_its_provenance(data_graph):
    shapes = recommend.induce(data_graph, method="shexer")
    assert len(shapes) > 0
    assert {c.method for c in shapes.all_constraints()} == {"shexer"}


@pytest_shexer
def test_shexer_agrees_with_baseline_on_a_clean_graph(data_graph):
    """Both read the same instances; on unambiguous data they should concur.

    Not an equality assertion — sheXer derives kinds the baseline never emits.
    What must hold is that it does not *contradict* the baseline.
    """
    baseline = recommend.induce(data_graph, method="baseline").keys()
    shexer = recommend.induce(data_graph, method="shexer").keys()
    assert baseline <= shexer


@pytest_shexer
def test_shexer_output_is_normalised_into_the_shared_model(data_graph):
    """The serialiser quirks must not reach the constraint model.

    sheXer writes `sh:dataType` (capital T, not a SHACL term), expresses an
    object range as `sh:node <OtherShape>` rather than `sh:class <Class>`, and
    emits a property shape for `rdf:type`. All three are serialisation details;
    none survives into what the panel and the drift diff compare.
    """
    shapes = recommend.induce(data_graph, method="shexer")
    kinds = {c.kind for c in shapes.all_constraints()}
    assert ConstraintKind.DATATYPE in kinds
    assert all(k in set(ConstraintKind) for k in kinds)

    paths = {c.path for c in shapes.all_constraints()}
    assert "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" not in paths

    # sh:node dereferenced to the shape's own target class, not left as a
    # shape IRI: ex:owns points at ex:Dog, and no *Shape IRI may appear.
    classes = {c.value for c in shapes.all_constraints()
               if c.kind is ConstraintKind.CLASS}
    assert "http://example.org/Dog" in classes
    assert not any(v.endswith("Shape") for v in classes)


@pytest_shexer
def test_shexer_honours_target_classes(data_graph):
    shapes = recommend.induce(data_graph, method="shexer",
                              target_classes=["http://example.org/Person"])
    assert set(shapes.shapes) == {"http://example.org/Person"}


@pytest_shexer
def test_shexer_written_turtle_round_trips(data_graph):
    ttl = recommend.write_shape_set(recommend.induce(data_graph, method="shexer"))
    Graph().parse(data=ttl, format="turtle")


def test_load_shape_set_reads_authored_constraints():
    shapes = Graph()
    shapes.parse(data="""
        @prefix sh: <http://www.w3.org/ns/shacl#> .
        @prefix ex: <http://example.org/> .
        ex:PersonShape a sh:NodeShape ; sh:targetClass ex:Person ;
            sh:property [ sh:path ex:name ; sh:minCount 1 ; sh:maxCount 1 ] .
    """, format="turtle")
    loaded = recommend.load_shape_set(shapes)
    assert len(loaded) == 2
    assert ("http://example.org/Person", "http://example.org/name", "minCount", "1") in loaded.keys()


# ── drift ──────────────────────────────────────────────────────────────────

@pytest.fixture
def drifted_shapes():
    g = Graph()
    g.parse(data="""
        @prefix sh: <http://www.w3.org/ns/shacl#> .
        @prefix ex: <http://example.org/> .
        ex:PersonShape a sh:NodeShape ; sh:targetClass ex:Person ;
            sh:property [ sh:path ex:name ; sh:minCount 1 ] ;
            sh:property [ sh:path ex:email ; sh:minCount 1 ] .
    """, format="turtle")
    return g


def test_drift_reports_constraints_the_shapes_file_lacks(data_graph, drifted_shapes):
    drift = check_drift(data_graph, drifted_shapes)
    missing = {(r["path"], r["kind"]) for r in drift["missing"]}
    assert ("http://example.org/owns", "minCount") in missing
    # …and does not re-report what the author already wrote.
    assert ("http://example.org/name", "minCount") not in missing


def test_drift_flags_a_constraint_no_instance_satisfies(data_graph, drifted_shapes):
    drift = check_drift(data_graph, drifted_shapes)
    stale_paths = {r["path"] for r in drift["stale"]}
    assert "http://example.org/email" in stale_paths
    row = [r for r in drift["stale"] if r["path"].endswith("email")][0]
    assert row["violationRate"] == pytest.approx(1.0)
    assert row["suggestion"]


def test_drift_lists_uncovered_classes(data_graph, drifted_shapes):
    drift = check_drift(data_graph, drifted_shapes)
    assert "http://example.org/Dog" in drift["uncovered_classes"]


def test_drift_without_any_shapes_reports_everything_missing(data_graph):
    drift = check_drift(data_graph, None)
    assert drift["totals"]["missing"] > 0
    assert drift["totals"]["stale"] == 0  # nothing authored, so nothing can be stale


def test_drift_findings_are_ascii_safe(data_graph, drifted_shapes):
    """Messages go to the MkDocs logger; a cp1252 console must not crash."""
    for line in format_findings(check_drift(data_graph, drifted_shapes), "x.ttl"):
        line.encode("cp1252")
