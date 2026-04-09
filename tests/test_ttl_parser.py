"""Tests for the TTL parser."""

from ontoink.ttl_parser import (
    detect_source,
    local_name,
    parse_ttl_to_cytoscape,
)


def test_detect_source_bfo():
    name, color = detect_source("http://purl.obolibrary.org/obo/BFO_0000023")
    assert name == "BFO"
    assert color == "#F556CB"


def test_detect_source_nfdicore():
    name, color = detect_source("https://nfdi.fiz-karlsruhe.de/ontology/NFDI_0000001")
    assert name == "nfdicore"
    assert color == "#7777BB"


def test_detect_source_unknown():
    name, _ = detect_source("http://example.org/Foo")
    assert name == ""


def test_local_name_hash():
    assert local_name("http://example.org/ns#Foo") == "Foo"


def test_local_name_slash():
    assert local_name("http://example.org/ns/Bar") == "Bar"


def test_parse_returns_nodes(sample_data):
    result = parse_ttl_to_cytoscape(sample_data)
    assert "nodes" in result
    assert len(result["nodes"]) > 0


def test_parse_returns_edges(sample_data):
    result = parse_ttl_to_cytoscape(sample_data)
    assert "edges" in result
    assert len(result["edges"]) > 0


def test_parse_with_shape(sample_data, sample_shape):
    result = parse_ttl_to_cytoscape(sample_data, sample_shape)
    assert "shacl" in result
    assert len(result["shacl"]) == 2  # two sh:property constraints


def test_parse_includes_raw_ttl(sample_data):
    result = parse_ttl_to_cytoscape(sample_data)
    assert "rawTtl" in result
    assert "@prefix" in result["rawTtl"]


def test_parse_includes_namespaces(sample_data):
    result = parse_ttl_to_cytoscape(sample_data)
    assert "namespaces" in result
    assert "ex" in result["namespaces"]


def test_node_has_shape_field(sample_data):
    result = parse_ttl_to_cytoscape(sample_data)
    for node in result["nodes"]:
        assert "shape" in node["data"]
        assert node["data"]["shape"] in ("rectangle", "ellipse", "diamond", "round-rectangle")


def test_edge_has_style_fields(sample_data):
    result = parse_ttl_to_cytoscape(sample_data)
    for edge in result["edges"]:
        assert "edgeType" in edge["data"]


def test_shacl_constraint_annotates_edges(sample_data, sample_shape):
    result = parse_ttl_to_cytoscape(sample_data, sample_shape)
    constraint_edges = [e for e in result["edges"] if e["data"]["edgeType"] == "shacl-constraint"]
    assert len(constraint_edges) >= 2


def test_classes_identified(sample_data):
    result = parse_ttl_to_cytoscape(sample_data)
    class_nodes = [n for n in result["nodes"] if n["data"]["type"] == "Class"]
    assert len(class_nodes) >= 3  # BFO_0000023, NFDI_0000118, BFO_0000015, NFDI_0000001


def test_inferred_triples_key_exists(sample_data):
    result = parse_ttl_to_cytoscape(sample_data)
    assert "inferred" in result
    assert isinstance(result["inferred"], list)


def test_reasoning_produces_inferences(reasoning_data):
    result = parse_ttl_to_cytoscape(reasoning_data)
    inferred = result.get("inferred", [])
    # Should infer: bob knows alice (symmetric), rex isPetOf carol (inverse),
    # all Dogs are Animals (subclass)
    assert len(inferred) > 0, "Expected at least some inferred triples"


def test_reasoning_filters_reflexive(reasoning_data):
    result = parse_ttl_to_cytoscape(reasoning_data)
    inferred = result.get("inferred", [])
    for t in inferred:
        # No reflexive triples like "x sameAs x"
        if t["s"] == t["o"]:
            assert t["pLabel"] not in ("sameAs", "equivalentProperty", "subPropertyOf", "subClassOf")


def test_reasoning_filters_builtins(reasoning_data):
    result = parse_ttl_to_cytoscape(reasoning_data)
    inferred = result.get("inferred", [])
    builtin_ns = ("http://www.w3.org/2002/07/owl#", "http://www.w3.org/2001/XMLSchema#")
    for t in inferred:
        assert not any(t["s"].startswith(ns) for ns in builtin_ns), f"Built-in subject: {t['s']}"


def test_namespaces_only_declared(sample_data):
    """Namespaces should only contain prefixes declared in the TTL, not rdflib builtins."""
    result = parse_ttl_to_cytoscape(sample_data)
    ns = result["namespaces"]
    # These are rdflib builtins that should NOT appear
    for builtin in ("dc", "dcterms", "skos", "doap", "prof", "void", "sdo"):
        assert builtin not in ns, f"Built-in prefix '{builtin}' should not be in namespaces"


def test_active_namespaces_subset(sample_data):
    result = parse_ttl_to_cytoscape(sample_data)
    active = result["activeNamespaces"]
    all_ns = result["namespaces"]
    for prefix in active:
        assert prefix in all_ns, f"Active prefix '{prefix}' not in all namespaces"


def test_metrics_present(sample_data, sample_shape):
    result = parse_ttl_to_cytoscape(sample_data, sample_shape)
    m = result.get("metrics")
    assert m is not None
    assert "classCount" in m
    assert "individualCount" in m
    assert "objectPropertyCount" in m
    assert "maxHierarchyDepth" in m
    assert "totalTriples" in m
    assert "shaclCoveredClasses" in m
    assert m["classCount"] >= 0
    assert m["totalTriples"] > 0


def test_metrics_missing_labels(sample_data):
    result = parse_ttl_to_cytoscape(sample_data)
    m = result["metrics"]
    assert isinstance(m["missingLabels"], list)


def test_consistency_check(sample_data):
    result = parse_ttl_to_cytoscape(sample_data)
    c = result.get("consistency")
    assert c is not None
    assert c["status"] in ("consistent", "inconsistent", "error", "unknown")
    assert "message" in c


def test_smells_present(sample_data):
    result = parse_ttl_to_cytoscape(sample_data)
    smells = result.get("smells")
    assert smells is not None
    assert isinstance(smells, list)


def test_smells_have_required_fields(sample_data, sample_shape):
    result = parse_ttl_to_cytoscape(sample_data, sample_shape)
    for smell in result.get("smells", []):
        assert "id" in smell
        assert "name" in smell
        assert "severity" in smell
        assert smell["severity"] in ("info", "warning", "error")
        assert "entities" in smell
        assert isinstance(smell["entities"], list)
        assert "description" in smell


def test_smells_detect_missing_label(sample_data):
    result = parse_ttl_to_cytoscape(sample_data)
    smell_ids = [s["id"] for s in result.get("smells", [])]
    # Sample data likely has some entities without labels
    assert "missing-label" in smell_ids or "missing-comment" in smell_ids


def test_smells_no_false_cyclic(sample_data):
    """No false positive cyclic subclass detection on normal ontologies."""
    result = parse_ttl_to_cytoscape(sample_data)
    smell_ids = [s["id"] for s in result.get("smells", [])]
    assert "cyclic-subclass" not in smell_ids


def test_reasoning_demo_smells(reasoning_data):
    result = parse_ttl_to_cytoscape(reasoning_data)
    smells = result.get("smells", [])
    smell_ids = [s["id"] for s in smells]
    # Reasoning demo has entities without labels, inverse declared, etc.
    assert len(smells) > 0
    # Should detect missing labels on some entities
    assert "missing-label" in smell_ids
