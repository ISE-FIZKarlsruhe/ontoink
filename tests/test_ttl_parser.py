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
