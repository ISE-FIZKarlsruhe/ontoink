"""Parse TTL files and produce Cytoscape.js-compatible JSON with formal notation metadata."""

import re
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

from rdflib import BNode, Graph, Literal, Namespace, URIRef
from rdflib.namespace import OWL, RDF, RDFS, XSD

SH = Namespace("http://www.w3.org/ns/shacl#")

# ---------------------------------------------------------------------------
# Ontology source detection → color mapping
# ---------------------------------------------------------------------------

ONTOLOGY_COLORS: List[Tuple[str, str, str]] = [
    ("purl.obolibrary.org/obo/BFO_", "BFO", "#F556CB"),
    ("purl.obolibrary.org/obo/IAO_", "IAO", "#F6A252"),
    ("purl.obolibrary.org/obo/RO_", "RO", "#F43F5E"),
    ("purl.obolibrary.org/obo/OBI_", "OBI", "#F5D5B1"),
    ("purl.obolibrary.org/obo/COB_", "COB", "#93AFF3"),
    ("nfdi.fiz-karlsruhe.de/ontology/", "nfdicore", "#7777BB"),
    ("w3id.org/pmd/co/", "PMDco", "#46CAD3"),
    ("w3id.org/pmd/", "PMD", "#46CAD3"),
    ("qudt.org/", "QUDT", "#C9DBFE"),
    ("schema.org/", "schema", "#E8D44D"),
    ("purl.org/dc/", "DC", "#B8860B"),
    ("xmlns.com/foaf/", "FOAF", "#4682B4"),
]

# Node type → (shape for Cytoscape, default color)
NODE_STYLES = {
    "Class": ("rectangle", "#FDFDC8"),
    "Individual": ("ellipse", "#E6E6E6"),
    "Literal": ("ellipse", "#93D053"),
    "Datatype": ("diamond", "#93D053"),
    "SHACL Shape": ("round-rectangle", "#A5F3FC"),
}

# Edge type → (line-style, line-color, arrow-shape, width)
EDGE_STYLES = {
    "object-property": ("solid", "#2563eb", "triangle", 2),
    "data-property": ("solid", "#16a34a", "triangle", 1.5),
    "rdf-type": ("dashed", "#9ca3af", "triangle", 1),
    "subclass": ("solid", "#374151", "triangle", 2),
    "shacl-constraint": ("dashed", "#0891b2", "triangle", 3),
}

_IMPLICIT_TOPS = {
    str(OWL.Thing), str(RDFS.Resource), str(OWL.Class), str(RDFS.Class),
    str(OWL.NamedIndividual), str(OWL.Ontology),
    str(OWL.ObjectProperty), str(OWL.DatatypeProperty),
    str(OWL.AnnotationProperty), str(RDF.Property),
}


def detect_source(uri_str: str) -> Tuple[str, str]:
    """Return (source_name, color) for a URI based on its namespace."""
    for substr, name, color in ONTOLOGY_COLORS:
        if substr in uri_str:
            return name, color
    return "", NODE_STYLES["Class"][1]


def local_name(uri_str: str) -> str:
    """Extract the local name from a URI (after # or last /)."""
    if "#" in uri_str:
        return uri_str.rsplit("#", 1)[-1]
    return uri_str.rsplit("/", 1)[-1]


def resolve_label(node, g: Graph) -> str:
    """Resolve a human-readable label for a node."""
    if isinstance(node, Literal):
        return str(node)
    if isinstance(node, BNode):
        return f"_:{node}"
    uri_str = str(node)

    for label in g.objects(node, RDFS.label):
        if isinstance(label, Literal):
            return str(label)

    try:
        qname = g.namespace_manager.qname(node)
        if qname and ":" in qname:
            return qname
    except Exception:
        pass

    local = local_name(uri_str)
    source, _ = detect_source(uri_str)
    if source:
        return f"{source.lower()}:{local}"
    return local


def resolve_predicate_label(pred, g: Graph) -> str:
    """Resolve a short label for a predicate URI."""
    if not isinstance(pred, URIRef):
        return str(pred)
    for label in g.objects(pred, RDFS.label):
        if isinstance(label, Literal):
            return str(label)
    try:
        qname = g.namespace_manager.qname(pred)
        if qname:
            return qname
    except Exception:
        pass
    return local_name(str(pred))


def _node_id(node) -> str:
    if isinstance(node, Literal):
        return f"lit_{abs(hash(str(node))) % 999999}"
    if isinstance(node, BNode):
        return f"bn_{str(node)}"
    return str(node)


def _format_cardinality(min_c, max_c) -> str:
    mn = int(min_c) if min_c is not None else 0
    mx = str(int(max_c)) if max_c is not None else "*"
    return f"[{mn}..{mx}]"


def _extract_namespaces(g: Graph) -> Dict[str, str]:
    """Extract declared namespace prefixes → URI mappings."""
    ns = {}
    for prefix, uri in g.namespaces():
        if prefix and prefix not in ("xml", "xsd", "rdf", "rdfs", "owl"):
            ns[prefix] = str(uri)
    return ns


def _detect_property_types(g: Graph) -> Tuple[Set[str], Set[str]]:
    """Detect which predicates are object vs data properties."""
    obj_props = set()
    data_props = set()
    for s, _, _ in g.triples((None, RDF.type, OWL.ObjectProperty)):
        obj_props.add(str(s))
    for s, _, _ in g.triples((None, RDF.type, OWL.DatatypeProperty)):
        data_props.add(str(s))
    return obj_props, data_props


# ---------------------------------------------------------------------------
# Main parser
# ---------------------------------------------------------------------------

def parse_ttl_to_cytoscape(data_path: str, shape_path: str = None) -> dict:
    """
    Parse TTL files and return Cytoscape.js elements + metadata.

    Returns dict with keys: nodes, edges, shacl, namespaces, edgeStyles, nodeStyles,
    rawTtl (for editor), shapeTtl (for validation).
    """
    g = Graph()
    g.parse(data_path, format="turtle")

    shape_graph = None
    if shape_path and Path(shape_path).exists():
        shape_graph = Graph()
        shape_graph.parse(shape_path, format="turtle")

    # Read raw TTL for the editor
    raw_ttl = Path(data_path).read_text(encoding="utf-8")
    shape_ttl = ""
    if shape_path and Path(shape_path).exists():
        shape_ttl = Path(shape_path).read_text(encoding="utf-8")

    namespaces = _extract_namespaces(g)
    obj_props, data_props = _detect_property_types(g)

    # -----------------------------------------------------------------------
    # Step 1: Identify classes
    # -----------------------------------------------------------------------
    classes: Set[str] = set()
    for s, _, o in g.triples((None, RDF.type, None)):
        o_str = str(o)
        if o_str in (str(OWL.Class), str(RDFS.Class)):
            classes.add(str(s))
        if isinstance(o, URIRef) and o_str not in _IMPLICIT_TOPS:
            classes.add(o_str)
    for s, _, o in g.triples((None, RDFS.subClassOf, None)):
        if isinstance(s, URIRef):
            classes.add(str(s))
        if isinstance(o, URIRef) and str(o) not in _IMPLICIT_TOPS:
            classes.add(str(o))

    # -----------------------------------------------------------------------
    # Step 2: Collect nodes and edges
    # -----------------------------------------------------------------------
    nodes: Dict[str, dict] = {}
    edges: List[dict] = []
    seen_edges: set = set()

    for s, p, o in g:
        if p in (RDF.first, RDF.rest):
            continue
        if p == RDF.type and str(o) in _IMPLICIT_TOPS:
            continue
        if isinstance(s, BNode) or isinstance(o, BNode):
            continue

        s_id = _node_id(s)

        # Ensure subject node
        if s_id not in nodes and isinstance(s, URIRef):
            s_str = str(s)
            source_name, color = detect_source(s_str)
            node_type = "Class" if s_str in classes else "Individual"
            shape = NODE_STYLES[node_type][0]
            if node_type == "Individual":
                color = NODE_STYLES["Individual"][1]
            nodes[s_id] = {
                "data": {
                    "id": s_id,
                    "label": resolve_label(s, g),
                    "type": node_type,
                    "color": color,
                    "shape": shape,
                    "iri": s_str,
                    "source": source_name,
                    "namespace": _ns_for_uri(s_str, namespaces),
                }
            }

        if isinstance(o, URIRef):
            o_id = _node_id(o)
            if o_id not in nodes:
                o_str = str(o)
                source_name, color = detect_source(o_str)
                node_type = "Class" if o_str in classes else "Individual"
                shape = NODE_STYLES[node_type][0]
                if node_type == "Individual":
                    color = NODE_STYLES["Individual"][1]
                nodes[o_id] = {
                    "data": {
                        "id": o_id,
                        "label": resolve_label(o, g),
                        "type": node_type,
                        "color": color,
                        "shape": shape,
                        "iri": o_str,
                        "source": source_name,
                        "namespace": _ns_for_uri(o_str, namespaces),
                    }
                }

            edge_key = (s_id, str(p), o_id)
            if edge_key not in seen_edges:
                seen_edges.add(edge_key)
                p_str = str(p)

                if p == RDF.type:
                    edge_type = "rdf-type"
                elif p == RDFS.subClassOf:
                    edge_type = "subclass"
                elif p_str in obj_props:
                    edge_type = "object-property"
                elif p_str in data_props:
                    edge_type = "data-property"
                else:
                    # Heuristic: if target is a class → rdf-type-like; else object-property
                    edge_type = "object-property"

                style = EDGE_STYLES.get(edge_type, EDGE_STYLES["object-property"])
                edges.append({
                    "data": {
                        "id": f"e_{len(edges)}",
                        "source": s_id,
                        "target": o_id,
                        "label": resolve_predicate_label(p, g),
                        "iri": p_str,
                        "edgeType": edge_type,
                        "lineStyle": style[0],
                        "lineColor": style[1],
                        "arrowShape": style[2],
                        "edgeWidth": style[3],
                    }
                })

        elif isinstance(o, Literal):
            lit_id = f"lit_{abs(hash((s_id, str(p), str(o)))) % 999999}"
            if lit_id not in nodes:
                nodes[lit_id] = {
                    "data": {
                        "id": lit_id,
                        "label": str(o),
                        "type": "Literal",
                        "color": NODE_STYLES["Literal"][1],
                        "shape": NODE_STYLES["Literal"][0],
                        "iri": "",
                        "source": "",
                        "namespace": "",
                    }
                }
            edge_key = (s_id, str(p), lit_id)
            if edge_key not in seen_edges:
                seen_edges.add(edge_key)
                style = EDGE_STYLES["data-property"]
                edges.append({
                    "data": {
                        "id": f"e_{len(edges)}",
                        "source": s_id,
                        "target": lit_id,
                        "label": resolve_predicate_label(p, g),
                        "iri": str(p),
                        "edgeType": "data-property",
                        "lineStyle": style[0],
                        "lineColor": style[1],
                        "arrowShape": style[2],
                        "edgeWidth": style[3],
                    }
                })

    # -----------------------------------------------------------------------
    # Step 3: Extract SHACL constraints
    # -----------------------------------------------------------------------
    shacl_data = []
    if shape_graph:
        for shape_node in shape_graph.subjects(RDF.type, SH.NodeShape):
            target = shape_graph.value(shape_node, SH.targetClass)
            for prop_node in shape_graph.objects(shape_node, SH.property):
                if not isinstance(prop_node, BNode):
                    continue
                path = shape_graph.value(prop_node, SH.path)
                min_count = shape_graph.value(prop_node, SH.minCount)
                max_count = shape_graph.value(prop_node, SH.maxCount)
                message = shape_graph.value(prop_node, SH.message)
                sh_class = shape_graph.value(prop_node, SH["class"])

                constraint = {
                    "targetClass": str(target) if target else None,
                    "path": str(path) if path else None,
                    "pathLabel": resolve_predicate_label(path, shape_graph) if path else None,
                    "minCount": int(min_count) if min_count is not None else None,
                    "maxCount": int(max_count) if max_count is not None else None,
                    "message": str(message) if message else None,
                    "shapeIri": str(shape_node),
                }
                shacl_data.append(constraint)

                # Annotate matching edges
                cardinality = _format_cardinality(min_count, max_count)
                path_str = str(path) if path else None
                annotated = False
                for edge in edges:
                    if edge["data"]["iri"] == path_str:
                        edge["data"]["edgeType"] = "shacl-constraint"
                        edge["data"]["cardinality"] = cardinality
                        edge["data"]["message"] = str(message) if message else ""
                        edge["data"]["label"] += f" {cardinality}"
                        style = EDGE_STYLES["shacl-constraint"]
                        edge["data"]["lineStyle"] = style[0]
                        edge["data"]["lineColor"] = style[1]
                        edge["data"]["arrowShape"] = style[2]
                        edge["data"]["edgeWidth"] = style[3]
                        annotated = True

                if not annotated and target and str(target) in nodes:
                    target_id = str(target)
                    clabel = resolve_predicate_label(path, shape_graph) if path else "constraint"
                    style = EDGE_STYLES["shacl-constraint"]
                    edges.append({
                        "data": {
                            "id": f"shacl_{len(edges)}",
                            "source": target_id,
                            "target": target_id,
                            "label": f"{clabel} {cardinality}",
                            "iri": path_str or "",
                            "edgeType": "shacl-constraint",
                            "cardinality": cardinality,
                            "message": str(message) if message else "",
                            "lineStyle": style[0],
                            "lineColor": style[1],
                            "arrowShape": style[2],
                            "edgeWidth": style[3],
                        }
                    })

    active_ns = _used_namespaces(nodes, edges, namespaces)

    return {
        "nodes": list(nodes.values()),
        "edges": edges,
        "shacl": shacl_data,
        "namespaces": namespaces,
        "activeNamespaces": active_ns,
        "nodeStyles": NODE_STYLES,
        "edgeStyles": {k: {"lineStyle": v[0], "color": v[1], "arrow": v[2], "width": v[3]} for k, v in EDGE_STYLES.items()},
        "rawTtl": raw_ttl,
        "shapeTtl": shape_ttl,
    }


def _ns_for_uri(uri_str: str, namespaces: Dict[str, str]) -> str:
    """Find which declared namespace prefix a URI belongs to."""
    best = ""
    best_len = 0
    for prefix, ns_uri in namespaces.items():
        if uri_str.startswith(ns_uri) and len(ns_uri) > best_len:
            best = prefix
            best_len = len(ns_uri)
    return best


def _used_namespaces(nodes: Dict, edges: List, namespaces: Dict[str, str]) -> Dict[str, str]:
    """Return only the namespace prefixes actually used by nodes/edges in the graph."""
    used_uris: Set[str] = set()
    for n in nodes.values():
        iri = n["data"].get("iri", "")
        if iri:
            used_uris.add(iri)
    for e in edges:
        iri = e["data"].get("iri", "")
        if iri:
            used_uris.add(iri)

    active: Dict[str, str] = {}
    for prefix, ns_uri in namespaces.items():
        for uri in used_uris:
            if uri.startswith(ns_uri):
                active[prefix] = ns_uri
                break
    return active
