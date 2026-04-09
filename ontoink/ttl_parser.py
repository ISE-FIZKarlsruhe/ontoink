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


def _extract_namespaces(g: Graph, ttl_text: str = "") -> Dict[str, str]:
    """Extract namespace prefixes actually declared in the TTL source.

    Falls back to rdflib's g.namespaces() only for prefixes that appear
    as @prefix or PREFIX declarations in the raw TTL text, avoiding the
    dozens of built-in rdflib prefixes that clutter the overlay.
    """
    import re

    # Parse @prefix and PREFIX declarations from the raw TTL
    declared: Dict[str, str] = {}
    if ttl_text:
        for m in re.finditer(
            r"(?:@prefix|PREFIX)\s+(\w*)\s*:\s*<([^>]+)>", ttl_text, re.IGNORECASE
        ):
            p = m.group(1)
            if p and p not in ("xml", "xsd", "rdf", "rdfs", "owl"):
                declared[p] = m.group(2)

    if declared:
        return declared

    # Fallback: use rdflib but filter aggressively
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

    # Combine raw TTL sources so prefix declarations from both are captured
    all_ttl = raw_ttl + "\n" + shape_ttl
    namespaces = _extract_namespaces(g, all_ttl)
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

    # -----------------------------------------------------------------------
    # OWL-RL Reasoning — compute inferred triples
    # -----------------------------------------------------------------------
    inferred_triples = _run_reasoning(g, namespaces)

    # -----------------------------------------------------------------------
    # Ontology metrics + consistency + smell detection
    # -----------------------------------------------------------------------
    metrics = _compute_metrics(g, nodes, edges, classes, shacl_data)
    consistency = _check_consistency(g)
    smells = _detect_smells(g, nodes, edges, classes, shacl_data, namespaces)

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
        "inferred": inferred_triples,
        "metrics": metrics,
        "consistency": consistency,
        "smells": smells,
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


def _run_reasoning(g: Graph, namespaces: Dict[str, str]) -> List[dict]:
    """Run OWL reasoning and return newly inferred triples.

    Tries owlready2 (which bundles HermiT for full OWL DL reasoning) first,
    falls back to owlrl (OWL-RL profile) if owlready2 is not available.

    Each triple is returned as {s, p, o, sLabel, pLabel, oLabel} with
    human-readable labels resolved via the namespace prefixes.
    """
    original_triples = set((str(s), str(p), str(o)) for s, p, o in g)

    inferred_raw = _reason_with_owlready2(g) or _reason_with_owlrl(g)
    if inferred_raw is None:
        return []

    # ── Filter: remove noise ──────────────────────────────────────────
    _BUILTIN_NS = (
        "http://www.w3.org/2002/07/owl#",
        "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
        "http://www.w3.org/2000/01/rdf-schema#",
        "http://www.w3.org/2001/XMLSchema#",
    )
    _SKIP_OBJECTS = {
        str(RDFS.Resource), str(OWL.Thing), str(RDFS.Class),
        str(OWL.Class), str(RDF.Property), str(OWL.NamedIndividual),
        str(OWL.ObjectProperty), str(OWL.DatatypeProperty),
        str(OWL.AnnotationProperty), str(OWL.FunctionalProperty),
        str(OWL.InverseFunctionalProperty), str(OWL.TransitiveProperty),
        str(OWL.SymmetricProperty),
    }
    # Reflexive predicates to skip (x sameAs x, x subPropertyOf x, etc.)
    _REFLEXIVE_PREDS = {
        str(OWL.sameAs), str(OWL.equivalentClass),
        str(OWL.equivalentProperty), str(RDFS.subClassOf),
        str(RDFS.subPropertyOf),
    }
    # Meta-level predicates to skip (domain/range propagation is noise)
    _SKIP_PREDS = {
        str(RDFS.domain), str(RDFS.range),
    }

    inferred = []
    for s_str, p_str, o_str, is_literal in inferred_raw:
        # Skip if was in original
        if (s_str, p_str, o_str) in original_triples:
            continue
        # Skip reflexive triples (x rel x)
        if s_str == o_str and p_str in _REFLEXIVE_PREDS:
            continue
        # Skip meta-level predicates (domain/range propagation)
        if p_str in _SKIP_PREDS:
            continue
        # Skip triples involving built-in namespaces
        if any(s_str.startswith(ns) for ns in _BUILTIN_NS):
            continue
        if not is_literal and any(o_str.startswith(ns) for ns in _BUILTIN_NS):
            continue
        if o_str in _SKIP_OBJECTS:
            continue

        inferred.append({
            "s": s_str,
            "p": p_str,
            "o": o_str,
            "sLabel": _resolve_label(s_str, namespaces),
            "pLabel": _resolve_label(p_str, namespaces),
            "oLabel": _resolve_label(o_str, namespaces) if not is_literal else o_str,
            "isLiteral": is_literal,
        })

    return inferred


def _reason_with_owlready2(g: Graph) -> Optional[List[tuple]]:
    """Try reasoning with owlready2 (HermiT). Returns list of (s, p, o, is_literal) or None."""
    try:
        import owlready2
        import tempfile
        import os
    except ImportError:
        return None

    # Serialize the rdflib graph to a temp file, load in owlready2
    tmpfile = None
    try:
        tmpfile = tempfile.NamedTemporaryFile(suffix=".ttl", delete=False, mode="w", encoding="utf-8")
        g.serialize(tmpfile.name, format="turtle")
        tmpfile.close()

        world = owlready2.World()
        onto = world.get_ontology(f"file://{tmpfile.name}").load()

        # Collect triples before reasoning
        before = set()
        for s, p, o in world.as_rdflib_graph():
            if isinstance(s, BNode) or isinstance(o, BNode):
                continue
            before.add((str(s), str(p), str(o)))

        # Run HermiT reasoner
        with onto:
            owlready2.sync_reasoner(world, infer_property_values=True, infer_data_property_values=True)

        # Collect new triples
        result = []
        for s, p, o in world.as_rdflib_graph():
            if isinstance(s, BNode) or isinstance(o, BNode):
                continue
            key = (str(s), str(p), str(o))
            if key not in before:
                result.append((str(s), str(p), str(o), isinstance(o, Literal)))

        return result
    except Exception:
        return None
    finally:
        if tmpfile:
            try:
                os.unlink(tmpfile.name)
            except OSError:
                pass


def _reason_with_owlrl(g: Graph) -> Optional[List[tuple]]:
    """Fallback: run owlrl OWL-RL reasoning. Returns list of (s, p, o, is_literal) or None."""
    try:
        import owlrl
    except ImportError:
        return None

    reasoned = Graph()
    for t in g:
        reasoned.add(t)

    try:
        owlrl.DeductiveClosure(owlrl.RDFS_OWLRL_Semantics).expand(reasoned)
    except Exception:
        return None

    original = set((str(s), str(p), str(o)) for s, p, o in g)
    result = []
    for s, p, o in reasoned:
        if isinstance(s, BNode) or isinstance(o, BNode):
            continue
        key = (str(s), str(p), str(o))
        if key not in original:
            result.append((str(s), str(p), str(o), isinstance(o, Literal)))

    return result


"""
OntoSniff — Ontology Smell Detector
====================================

Detects common anti-patterns in OWL/RDF ontologies. Each smell has:
- id: unique identifier (e.g., "lazy-class")
- name: human-readable name
- severity: "info" | "warning" | "error"
- description: what the smell means and why it matters
- entities: list of affected IRIs/labels
- suggestion: how to fix it

Anti-pattern catalog based on:
- Poveda-Villalón et al. (2014) "A catalogue of ontology pitfalls"
- Rector et al. (2004) "OWL Pizzas: common patterns for OWL ontologies"
- Gangemi et al. (2006) "Ontology Design Patterns"
"""

SMELL_CATALOG = {
    "lazy-class": {
        "name": "Lazy Class",
        "severity": "warning",
        "description": "A class is defined but has no instances and no subclasses. It may be unused or incomplete.",
        "reference": "Poveda-Villalón et al. (2014), Pitfall P11",
    },
    "missing-label": {
        "name": "Missing Label",
        "severity": "warning",
        "description": "An entity has no rdfs:label. Labels are essential for human readability and search.",
        "reference": "Poveda-Villalón et al. (2014), Pitfall P08",
    },
    "missing-domain-range": {
        "name": "Missing Domain/Range",
        "severity": "info",
        "description": "A property has no rdfs:domain or rdfs:range declared. This reduces reasoning power and clarity.",
        "reference": "Rector et al. (2004)",
    },
    "singleton-hierarchy": {
        "name": "Singleton Hierarchy",
        "severity": "info",
        "description": "A chain of subClassOf where each class has only one subclass. Consider merging or flattening.",
        "reference": "Gangemi et al. (2006)",
    },
    "property-soup": {
        "name": "Property Soup",
        "severity": "warning",
        "description": "A class has more than 15 direct properties. Consider decomposing into sub-concepts.",
        "reference": "Design pattern: Modularization",
    },
    "orphan-class": {
        "name": "Orphan Class",
        "severity": "info",
        "description": "A class has no rdfs:subClassOf parent and is not a parent. It floats disconnected in the hierarchy.",
        "reference": "Poveda-Villalón et al. (2014), Pitfall P04",
    },
    "missing-inverse": {
        "name": "Missing Inverse",
        "severity": "info",
        "description": "An object property has no owl:inverseOf declared. Inverse properties improve query flexibility.",
        "reference": "Best practice: bidirectional navigation",
    },
    "no-shacl-coverage": {
        "name": "No SHACL Coverage",
        "severity": "warning",
        "description": "A class has instances but no SHACL shape to validate them. Data quality may be unverified.",
        "reference": "SHACL best practice",
    },
    "label-language-gap": {
        "name": "Label Language Gap",
        "severity": "info",
        "description": "Some entities have language-tagged labels (e.g., @en) but others don't. Internationalization is incomplete.",
        "reference": "Linked Data best practice",
    },
    "deep-hierarchy": {
        "name": "Deep Hierarchy",
        "severity": "info",
        "description": "Class hierarchy depth exceeds 7 levels. Deep hierarchies are hard to navigate and maintain.",
        "reference": "Poveda-Villalón et al. (2014), Pitfall P06",
    },
    "cyclic-subclass": {
        "name": "Cyclic SubClassOf",
        "severity": "error",
        "description": "A class is a subclass of itself (directly or transitively). This is logically inconsistent.",
        "reference": "OWL 2 Structural Specification",
    },
    "property-clump": {
        "name": "Property Clump",
        "severity": "info",
        "description": "Multiple properties always appear together on the same instances. Consider grouping into a class.",
        "reference": "Fowler (1999), Code Smells: Data Clumps",
    },
    "multi-inheritance": {
        "name": "Excessive Multi-Inheritance",
        "severity": "warning",
        "description": "A class has more than 3 direct superclasses. This may indicate a modeling issue.",
        "reference": "Rector et al. (2004)",
    },
    "missing-comment": {
        "name": "Missing Comment",
        "severity": "info",
        "description": "A class has no rdfs:comment. Comments help users understand the intended semantics.",
        "reference": "Linked Data best practice",
    },
    "ambiguous-namespace": {
        "name": "Ambiguous Namespace",
        "severity": "warning",
        "description": "Multiple entities share the same local name but from different namespaces. This causes confusion.",
        "reference": "Best practice: unique naming",
    },
    "symmetric-missing": {
        "name": "Potential Symmetric Property",
        "severity": "info",
        "description": "A property is used bidirectionally (A rel B and B rel A) but not declared owl:SymmetricProperty.",
        "reference": "OWL modeling best practice",
    },
    "large-union": {
        "name": "Large Union/Disjunction",
        "severity": "info",
        "description": "An owl:unionOf or owl:disjointWith involves more than 5 classes. Consider restructuring.",
        "reference": "Rector et al. (2004)",
    },
    "deprecated-entity": {
        "name": "Deprecated Entity Used",
        "severity": "warning",
        "description": "An entity marked owl:deprecated true is still referenced. Update to the replacement.",
        "reference": "OWL 2 deprecation mechanism",
    },
    "unused-import": {
        "name": "Unused Import",
        "severity": "info",
        "description": "An owl:imports declaration references an ontology whose terms are not used in the graph.",
        "reference": "Poveda-Villalón et al. (2014), Pitfall P09",
    },
    "redundant-subclass": {
        "name": "Redundant SubClassOf",
        "severity": "info",
        "description": "A class declares rdfs:subClassOf to a grandparent that is already implied by the chain. This is redundant.",
        "reference": "Poveda-Villalón et al. (2014), Pitfall P24",
    },
}


def _detect_smells(
    g: Graph, nodes: Dict, edges: List, classes: Set[str],
    shacl_data: List, namespaces: Dict[str, str]
) -> List[dict]:
    """Detect ontology anti-patterns (smells) and return a list of findings."""
    findings = []

    def label(uri):
        for s2, _, o2 in g.triples((URIRef(uri), RDFS.label, None)):
            return str(o2)
        return _resolve_label(uri, namespaces) if namespaces else uri.split("/")[-1]

    # 1. Lazy Classes — defined but no instances, no subclasses
    instantiated = set()
    for _, _, o in g.triples((None, RDF.type, None)):
        if isinstance(o, URIRef):
            instantiated.add(str(o))
    has_subclass = set()
    for _, _, o in g.triples((None, RDFS.subClassOf, None)):
        if isinstance(o, URIRef):
            has_subclass.add(str(o))
    lazy = [c for c in classes if c not in instantiated and c not in has_subclass
            and not c.startswith("http://www.w3.org/")]
    if lazy:
        findings.append({
            **SMELL_CATALOG["lazy-class"],
            "id": "lazy-class",
            "entities": [{"iri": c, "label": label(c)} for c in lazy[:10]],
            "suggestion": "Add instances, subclasses, or remove if unused.",
        })

    # 2. Missing Labels
    labeled = set(str(s) for s, _, _ in g.triples((None, RDFS.label, None)))
    unlabeled = [n["data"]["iri"] for n in nodes.values()
                 if n["data"]["iri"] and n["data"]["iri"] not in labeled
                 and n["data"]["type"] in ("Class", "Individual")
                 and not n["data"]["iri"].startswith("http://www.w3.org/")]
    if unlabeled:
        findings.append({
            **SMELL_CATALOG["missing-label"],
            "id": "missing-label",
            "entities": [{"iri": u, "label": label(u)} for u in unlabeled[:10]],
            "suggestion": "Add rdfs:label to each entity for better readability.",
        })

    # 3. Missing Domain/Range
    obj_props = set(str(s) for s, _, _ in g.triples((None, RDF.type, OWL.ObjectProperty)))
    data_props = set(str(s) for s, _, _ in g.triples((None, RDF.type, OWL.DatatypeProperty)))
    all_props = obj_props | data_props
    has_domain = set(str(s) for s, _, _ in g.triples((None, RDFS.domain, None)))
    has_range = set(str(s) for s, _, _ in g.triples((None, RDFS.range, None)))
    no_dr = [p for p in all_props if p not in has_domain or p not in has_range]
    if no_dr:
        findings.append({
            **SMELL_CATALOG["missing-domain-range"],
            "id": "missing-domain-range",
            "entities": [{"iri": p, "label": label(p)} for p in no_dr[:10]],
            "suggestion": "Add rdfs:domain and rdfs:range to each property.",
        })

    # 4. Singleton Hierarchy
    parent_count: Dict[str, int] = {}
    for s, _, o in g.triples((None, RDFS.subClassOf, None)):
        if isinstance(o, URIRef):
            o_str = str(o)
            parent_count[o_str] = parent_count.get(o_str, 0) + 1
    singletons = [p for p, cnt in parent_count.items() if cnt == 1
                  and p in parent_count  # is also a parent
                  and not p.startswith("http://www.w3.org/")]
    if len(singletons) >= 3:
        findings.append({
            **SMELL_CATALOG["singleton-hierarchy"],
            "id": "singleton-hierarchy",
            "entities": [{"iri": s2, "label": label(s2)} for s2 in singletons[:10]],
            "suggestion": "Consider merging single-child classes or introducing siblings.",
        })

    # 5. Property Soup (>15 properties on a class)
    class_prop_count: Dict[str, int] = {}
    for e in edges:
        src = e["data"].get("source", "")
        if src in [n["data"]["iri"] for n in nodes.values() if n["data"]["type"] == "Class"]:
            class_prop_count[src] = class_prop_count.get(src, 0) + 1
    soupy = [c for c, cnt in class_prop_count.items() if cnt > 15]
    if soupy:
        findings.append({
            **SMELL_CATALOG["property-soup"],
            "id": "property-soup",
            "entities": [{"iri": c, "label": label(c), "count": class_prop_count[c]} for c in soupy[:5]],
            "suggestion": "Decompose into sub-concepts or use composition patterns.",
        })

    # 6. Orphan Classes
    all_children = set(str(s) for s, _, _ in g.triples((None, RDFS.subClassOf, None)) if isinstance(s, URIRef))
    all_parents2 = set(str(o) for _, _, o in g.triples((None, RDFS.subClassOf, None)) if isinstance(o, URIRef))
    orphans = [c for c in classes if c not in all_children and c not in all_parents2
               and not c.startswith("http://www.w3.org/")]
    if orphans:
        findings.append({
            **SMELL_CATALOG["orphan-class"],
            "id": "orphan-class",
            "entities": [{"iri": c, "label": label(c)} for c in orphans[:10]],
            "suggestion": "Connect to the class hierarchy via rdfs:subClassOf.",
        })

    # 7. Missing Inverse
    has_inverse = set()
    for s, _, _ in g.triples((None, OWL.inverseOf, None)):
        has_inverse.add(str(s))
    for _, _, o in g.triples((None, OWL.inverseOf, None)):
        if isinstance(o, URIRef):
            has_inverse.add(str(o))
    no_inverse = [p for p in obj_props if p not in has_inverse]
    if no_inverse:
        findings.append({
            **SMELL_CATALOG["missing-inverse"],
            "id": "missing-inverse",
            "entities": [{"iri": p, "label": label(p)} for p in no_inverse[:10]],
            "suggestion": "Declare owl:inverseOf for bidirectional navigation.",
        })

    # 8. No SHACL Coverage
    covered_classes = set(sc.get("targetClass") for sc in shacl_data if sc.get("targetClass"))
    uncovered = [c for c in classes if c in instantiated and c not in covered_classes
                 and not c.startswith("http://www.w3.org/")]
    if uncovered:
        findings.append({
            **SMELL_CATALOG["no-shacl-coverage"],
            "id": "no-shacl-coverage",
            "entities": [{"iri": c, "label": label(c)} for c in uncovered[:10]],
            "suggestion": "Create SHACL NodeShapes to validate instances. Use the SHACL Editor.",
        })

    # 9. Label Language Gap
    lang_labels = set()
    plain_labels = set()
    for s, _, o in g.triples((None, RDFS.label, None)):
        if hasattr(o, 'language') and o.language:
            lang_labels.add(str(s))
        else:
            plain_labels.add(str(s))
    only_plain = plain_labels - lang_labels
    if lang_labels and only_plain:
        findings.append({
            **SMELL_CATALOG["label-language-gap"],
            "id": "label-language-gap",
            "entities": [{"iri": u, "label": label(u)} for u in list(only_plain)[:10]],
            "suggestion": "Add language tags (e.g., @en) to all labels for consistency.",
        })

    # 10. Deep Hierarchy (depth > 7)
    subclass_map: Dict[str, Set[str]] = {}
    for s2, _, o2 in g.triples((None, RDFS.subClassOf, None)):
        if isinstance(s2, URIRef) and isinstance(o2, URIRef):
            subclass_map.setdefault(str(s2), set()).add(str(o2))

    def _depth(cls2: str, visited2: Set[str]) -> int:
        if cls2 in visited2 or cls2 not in subclass_map:
            return 0
        visited2.add(cls2)
        return 1 + max((_depth(p2, visited2) for p2 in subclass_map[cls2]), default=0)

    deep_classes = [(c2, _depth(c2, set())) for c2 in subclass_map if _depth(c2, set()) > 7]
    if deep_classes:
        findings.append({
            **SMELL_CATALOG["deep-hierarchy"],
            "id": "deep-hierarchy",
            "entities": [{"iri": c2, "label": label(c2), "depth": d} for c2, d in sorted(deep_classes, key=lambda x: -x[1])[:5]],
            "suggestion": "Consider flattening the hierarchy or introducing intermediate grouping classes.",
        })

    # 11. Cyclic SubClassOf
    def _has_cycle(cls3: str, target: str, visited3: Set[str]) -> bool:
        if cls3 == target and visited3:
            return True
        if cls3 in visited3:
            return False
        visited3.add(cls3)
        for parent in subclass_map.get(cls3, set()):
            if _has_cycle(parent, target, visited3):
                return True
        return False

    cyclic = [c2 for c2 in subclass_map if _has_cycle(c2, c2, set())]
    if cyclic:
        findings.append({
            **SMELL_CATALOG["cyclic-subclass"],
            "id": "cyclic-subclass",
            "entities": [{"iri": c2, "label": label(c2)} for c2 in cyclic[:5]],
            "suggestion": "Remove the circular rdfs:subClassOf to fix logical inconsistency.",
        })

    # 12. Excessive Multi-Inheritance (>3 parents)
    multi = [(c2, len(parents)) for c2, parents in subclass_map.items() if len(parents) > 3]
    if multi:
        findings.append({
            **SMELL_CATALOG["multi-inheritance"],
            "id": "multi-inheritance",
            "entities": [{"iri": c2, "label": label(c2), "parents": cnt} for c2, cnt in sorted(multi, key=lambda x: -x[1])[:5]],
            "suggestion": "Reduce superclasses or use composition (has-a) instead of inheritance (is-a).",
        })

    # 13. Missing Comment on classes
    commented = set(str(s2) for s2, _, _ in g.triples((None, RDFS.comment, None)))
    no_comment = [c2 for c2 in classes if c2 not in commented and not c2.startswith("http://www.w3.org/")]
    if no_comment:
        findings.append({
            **SMELL_CATALOG["missing-comment"],
            "id": "missing-comment",
            "entities": [{"iri": c2, "label": label(c2)} for c2 in no_comment[:10]],
            "suggestion": "Add rdfs:comment to explain the intended semantics.",
        })

    # 14. Ambiguous Namespace (same local name, different namespaces)
    local_names: Dict[str, List[str]] = {}
    for n2 in nodes.values():
        iri = n2["data"].get("iri", "")
        if not iri or iri.startswith("http://www.w3.org/"):
            continue
        local = iri.rsplit("#", 1)[-1] if "#" in iri else iri.rsplit("/", 1)[-1]
        if local:
            local_names.setdefault(local, []).append(iri)
    ambiguous = {k: v for k, v in local_names.items() if len(v) > 1}
    if ambiguous:
        ents = []
        for local, iris in list(ambiguous.items())[:5]:
            ents.append({"iri": iris[0], "label": local + " (" + str(len(iris)) + " namespaces)"})
        findings.append({
            **SMELL_CATALOG["ambiguous-namespace"],
            "id": "ambiguous-namespace",
            "entities": ents,
            "suggestion": "Use distinct local names or consolidate into one namespace.",
        })

    # 15. Potential Symmetric Property
    prop_pairs: Dict[str, Set[tuple]] = {}
    for s2, p2, o2 in g:
        if isinstance(s2, URIRef) and isinstance(o2, URIRef) and isinstance(p2, URIRef):
            p_str = str(p2)
            if p_str.startswith("http://www.w3.org/"):
                continue
            prop_pairs.setdefault(p_str, set()).add((str(s2), str(o2)))
    symmetric_declared = set(str(s2) for s2, _, _ in g.triples((None, RDF.type, OWL.SymmetricProperty)))
    potential_sym = []
    for p2, pairs in prop_pairs.items():
        if p2 in symmetric_declared:
            continue
        reverse_count = sum(1 for a, b in pairs if (b, a) in pairs)
        if reverse_count > 0 and reverse_count >= len(pairs) * 0.5:
            potential_sym.append(p2)
    if potential_sym:
        findings.append({
            **SMELL_CATALOG["symmetric-missing"],
            "id": "symmetric-missing",
            "entities": [{"iri": p2, "label": label(p2)} for p2 in potential_sym[:5]],
            "suggestion": "Declare as owl:SymmetricProperty if the relation is truly symmetric.",
        })

    # 16. Deprecated Entity Used
    deprecated = set(str(s2) for s2, _, o2 in g.triples((None, OWL.deprecated, None)) if str(o2).lower() in ("true", "1"))
    used_deprecated = []
    for s2, p2, o2 in g:
        if str(s2) in deprecated or (isinstance(o2, URIRef) and str(o2) in deprecated):
            target = str(s2) if str(s2) in deprecated else str(o2)
            if target not in [e["iri"] for e in used_deprecated]:
                used_deprecated.append({"iri": target, "label": label(target)})
    if used_deprecated:
        findings.append({
            **SMELL_CATALOG["deprecated-entity"],
            "id": "deprecated-entity",
            "entities": used_deprecated[:10],
            "suggestion": "Replace with the non-deprecated equivalent.",
        })

    # 17. Redundant SubClassOf (A < B < C and A < C declared)
    redundant = []
    for child, parents in subclass_map.items():
        if len(parents) < 2:
            continue
        for p1 in parents:
            # Check if p1 is reachable from another parent (making child < p1 redundant)
            for p22 in parents:
                if p22 == p1:
                    continue
                if p1 in subclass_map.get(p22, set()):
                    redundant.append({"iri": child, "label": label(child) + " < " + label(p1)})
                    break
    if redundant:
        findings.append({
            **SMELL_CATALOG["redundant-subclass"],
            "id": "redundant-subclass",
            "entities": redundant[:10],
            "suggestion": "Remove the redundant rdfs:subClassOf — it's already implied by the hierarchy.",
        })

    return findings


def _resolve_label(uri: str, namespaces: Dict[str, str]) -> str:
    """Resolve a URI to a prefixed label like 'foaf:Person'."""
    best_prefix = ""
    best_len = 0
    for prefix, ns_uri in namespaces.items():
        if uri.startswith(ns_uri) and len(ns_uri) > best_len:
            best_prefix = prefix
            best_len = len(ns_uri)
    if best_prefix:
        return f"{best_prefix}:{uri[best_len:]}"
    # Fallback: local name from hash or slash
    local = uri.rsplit("#", 1)[-1] if "#" in uri else uri.rsplit("/", 1)[-1]
    return local or uri


def _compute_metrics(
    g: Graph, nodes: Dict, edges: List, classes: Set[str], shacl_data: List  # noqa: ARG001
) -> dict:
    """Compute ontology metrics for the statistics panel."""
    # Count by type
    class_count = sum(1 for n in nodes.values() if n["data"]["type"] == "Class")
    individual_count = sum(1 for n in nodes.values() if n["data"]["type"] == "Individual")
    literal_count = sum(1 for n in nodes.values() if n["data"]["type"] == "Literal")

    # Properties
    obj_props = set()
    data_props = set()
    for s, _, _ in g.triples((None, RDF.type, OWL.ObjectProperty)):
        obj_props.add(str(s))
    for s, _, _ in g.triples((None, RDF.type, OWL.DatatypeProperty)):
        data_props.add(str(s))

    # Hierarchy depth
    subclass_parents: Dict[str, Set[str]] = {}
    for s, _, o in g.triples((None, RDFS.subClassOf, None)):
        s_str, o_str = str(s), str(o)
        if isinstance(s, URIRef) and isinstance(o, URIRef):
            subclass_parents.setdefault(s_str, set()).add(o_str)

    def _depth(cls: str, visited: Set[str]) -> int:
        if cls in visited or cls not in subclass_parents:
            return 0
        visited.add(cls)
        return 1 + max((_depth(p, visited) for p in subclass_parents[cls]), default=0)

    max_depth = max((_depth(c, set()) for c in subclass_parents), default=0)

    # Orphan classes (no subClassOf parent and not a parent of anything)
    all_parents = set()
    all_children = set()
    for s_str, parents in subclass_parents.items():
        all_children.add(s_str)
        all_parents.update(parents)
    orphan_classes = [c for c in classes if c not in all_children and c not in all_parents
                      and not c.startswith("http://www.w3.org/")]

    # Missing labels
    labeled = set()
    for s, _, _ in g.triples((None, RDFS.label, None)):
        labeled.add(str(s))
    missing_labels = [n["data"]["label"] for n in nodes.values()
                      if n["data"]["iri"] and n["data"]["iri"] not in labeled
                      and n["data"]["type"] in ("Class", "Individual")]

    # SHACL coverage
    covered_classes = set()
    for sc in shacl_data:
        if sc.get("targetClass"):
            covered_classes.add(sc["targetClass"])
    uncovered = [c for c in classes if c not in covered_classes
                 and not c.startswith("http://www.w3.org/")]

    # Namespace usage
    ns_usage: Dict[str, int] = {}
    for n in nodes.values():
        src = n["data"].get("source", "")
        if src:
            ns_usage[src] = ns_usage.get(src, 0) + 1

    # Annotation properties
    ann_props = set()
    for s, _, _ in g.triples((None, RDF.type, OWL.AnnotationProperty)):
        ann_props.add(str(s))

    # Axiom counts
    subclass_count = sum(1 for _ in g.triples((None, RDFS.subClassOf, None)))
    type_assertions = sum(1 for _ in g.triples((None, RDF.type, None)))

    # Domain/range stats
    has_domain = set()
    has_range = set()
    for s, _, _ in g.triples((None, RDFS.domain, None)):
        has_domain.add(str(s))
    for s, _, _ in g.triples((None, RDFS.range, None)):
        has_range.add(str(s))
    all_props = obj_props | data_props
    props_without_domain = [p for p in all_props if p not in has_domain]
    props_without_range = [p for p in all_props if p not in has_range]

    # Blank node count
    blank_count = sum(1 for s in g.subjects() if isinstance(s, BNode))

    return {
        "classCount": class_count,
        "individualCount": individual_count,
        "literalCount": literal_count,
        "objectPropertyCount": len(obj_props),
        "dataPropertyCount": len(data_props),
        "annotationPropertyCount": len(ann_props),
        "maxHierarchyDepth": max_depth,
        "subclassAxioms": subclass_count,
        "typeAssertions": type_assertions,
        "blankNodeCount": blank_count,
        "propsWithoutDomain": len(props_without_domain),
        "propsWithoutRange": len(props_without_range),
        "orphanClasses": orphan_classes[:10],
        "missingLabels": missing_labels[:10],
        "shaclCoveredClasses": len(covered_classes),
        "shaclUncoveredClasses": uncovered[:10],
        "namespaceUsage": ns_usage,
        "totalTriples": len(g),
    }


def _check_consistency(g: Graph) -> dict:
    """Check ontology consistency using owlready2/HermiT."""
    try:
        import owlready2
        import tempfile
        import os
    except ImportError:
        return {"status": "unknown", "message": "owlready2 not installed"}

    tmpfile = None
    try:
        tmpfile = tempfile.NamedTemporaryFile(suffix=".ttl", delete=False, mode="w", encoding="utf-8")
        g.serialize(tmpfile.name, format="turtle")
        tmpfile.close()

        world = owlready2.World()
        onto = world.get_ontology(f"file://{tmpfile.name}").load()

        with onto:
            try:
                owlready2.sync_reasoner(world)
                inconsistent = list(world.inconsistent_classes())
                if inconsistent:
                    names = [str(c) for c in inconsistent[:5]]
                    return {
                        "status": "inconsistent",
                        "message": f"{len(inconsistent)} inconsistent class(es)",
                        "classes": names,
                    }
                return {"status": "consistent", "message": "Ontology is consistent"}
            except owlready2.OwlReadyInconsistentOntologyError:
                return {"status": "inconsistent", "message": "Ontology is fundamentally inconsistent"}
    except Exception as e:
        return {"status": "error", "message": str(e)[:200]}
    finally:
        if tmpfile:
            try:
                os.unlink(tmpfile.name)
            except OSError:
                pass
