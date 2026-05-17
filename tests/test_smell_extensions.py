"""Detector tests for the OOPS / SHACL anti-patterns added on top of the
original OntoSniff catalogue."""

from __future__ import annotations

import tempfile
from pathlib import Path

from ontoink.ttl_parser import SMELL_CATALOG, parse_ttl_to_cytoscape


def _write(text: str, suffix: str = ".ttl") -> str:
    fh = tempfile.NamedTemporaryFile(mode="w", suffix=suffix, delete=False, encoding="utf-8")
    fh.write(text); fh.close()
    return fh.name


def smells(graph_ttl: str, shape_ttl: str = "") -> dict[str, dict]:
    """Write the TTL to temp files, parse, and index findings by smell id."""
    data_path = _write(graph_ttl)
    shape_path = _write(shape_ttl) if shape_ttl else None
    try:
        data = parse_ttl_to_cytoscape(data_path, shape_path)
    finally:
        Path(data_path).unlink(missing_ok=True)
        if shape_path:
            Path(shape_path).unlink(missing_ok=True)
    return {s["id"]: s for s in data.get("smells", [])}


def test_catalogue_has_70_entries():
    assert len(SMELL_CATALOG) >= 70


def test_catalogue_has_94_entries():
    """The Corcho/Roussey + Palantir + extra OntoUML additions bring the total
    to at least 94 entries."""
    assert len(SMELL_CATALOG) >= 94


def test_every_entry_has_url():
    """Every catalogue entry must carry a clickable reference URL."""
    missing = [k for k, v in SMELL_CATALOG.items() if "url" not in v or not v["url"]]
    assert missing == [], f"entries missing url: {missing}"


def test_every_entry_has_required_fields():
    """Required: name, severity, description, reference, url."""
    required = {"name", "severity", "description", "reference", "url"}
    for slug, entry in SMELL_CATALOG.items():
        present = set(entry.keys())
        assert required <= present, f"{slug} missing: {required - present}"


def test_severity_values_are_valid():
    valid = {"info", "warning", "error"}
    for slug, entry in SMELL_CATALOG.items():
        assert entry["severity"] in valid, f"{slug} severity={entry['severity']!r}"


def test_shacl_shapes_catalogue_parses():
    """The bundled SHACL shapes catalogue must be valid RDF and contain shapes."""
    from pathlib import Path
    from rdflib import Graph
    from rdflib.namespace import RDF
    sh = Path(__file__).resolve().parents[1] / "demo" / "docs" / "anti-patterns" / "shacl-shapes.ttl"
    assert sh.exists(), f"catalogue not at {sh}"
    g = Graph()
    g.parse(str(sh), format="turtle")
    # At least 10 sh:NodeShape entries expected
    node_shape = "http://www.w3.org/ns/shacl#NodeShape"
    n_shapes = sum(1 for _ in g.triples((None, RDF.type, None)) if str(_[2]) == node_shape)
    assert n_shapes >= 10, f"only found {n_shapes} sh:NodeShape entries"


def test_detect_is_property_name():
    found = smells("""
@prefix : <http://ex.org/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
:is a owl:ObjectProperty .
:Person a owl:Class .
""")
    assert "is-relationship" in found


def test_detect_inverse_of_self():
    found = smells("""
@prefix : <http://ex.org/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
:friend a owl:ObjectProperty ;
    owl:inverseOf :friend .
""")
    assert "inverse-of-self" in found


def test_detect_untyped_class():
    found = smells("""
@prefix : <http://ex.org/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
:hasAuthor a owl:ObjectProperty ; rdfs:range :Author .
:p1 a :Author .
""")
    assert "untyped-class" in found, list(found)


def test_detect_namespace_hijacking():
    found = smells("""
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
foaf:CustomTermICreated a owl:Class ;
    rdfs:label "Squatting on foaf namespace" .
""")
    assert "namespace-hijacking" in found


def test_detect_multiple_domain():
    found = smells("""
@prefix : <http://ex.org/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
:A a owl:Class . :B a owl:Class .
:p a owl:ObjectProperty ;
   rdfs:domain :A ;
   rdfs:domain :B .
""")
    assert "multiple-domain-range" in found


def test_detect_no_ontology_declaration():
    found = smells("""
@prefix : <http://ex.org/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
:P a owl:Class .
""")
    assert "no-ontology-declaration" in found


def test_detect_no_license():
    found = smells("""
@prefix : <http://ex.org/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
<http://ex.org/onto> a owl:Ontology .
:P a owl:Class .
""")
    assert "no-license" in found


def test_detect_shacl_shape_without_target():
    found = smells("""
@prefix : <http://ex.org/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
:P a owl:Class .
:p1 a :P .
""", shape_ttl="""
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix : <http://ex.org/> .
:NoTargetShape a sh:NodeShape ;
    sh:property [ sh:path :name ; sh:minCount 1 ] .
""")
    assert "shape-without-target" in found


def test_detect_conflicting_cardinality():
    found = smells("""
@prefix : <http://ex.org/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
:P a owl:Class . :p1 a :P .
""", shape_ttl="""
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix : <http://ex.org/> .
:PShape a sh:NodeShape ;
    sh:targetClass :P ;
    sh:property [
        sh:path :age ;
        sh:minCount 3 ;
        sh:maxCount 1
    ] .
""")
    assert "conflicting-cardinality" in found


def test_detect_recursive_definition():
    found = smells("""
@prefix : <http://ex.org/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
:Self a owl:Class ;
    owl:equivalentClass :Self .
""")
    assert "recursive-definition" in found


def test_each_detector_id_is_in_catalogue():
    """No detector emits an id missing from SMELL_CATALOG."""
    data_path = _write("""
@prefix : <http://ex.org/> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
foaf:CustomTerm a owl:Class ; rdfs:label "x" .
:hasFoo a owl:ObjectProperty .
:is a owl:ObjectProperty .
:A a owl:Class ; rdfs:label "a" .
:B a owl:Class .
:a a :A .
""")
    try:
        data = parse_ttl_to_cytoscape(data_path)
    finally:
        Path(data_path).unlink(missing_ok=True)
    for finding in data.get("smells", []):
        assert finding["id"] in SMELL_CATALOG, finding["id"]
