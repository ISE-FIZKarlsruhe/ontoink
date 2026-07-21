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
    "owl-restriction": ("dashed", "#a855f7", "triangle", 2),
}

_IMPLICIT_TOPS = {
    str(OWL.Thing), str(RDFS.Resource), str(OWL.Class), str(RDFS.Class),
    str(OWL.NamedIndividual), str(OWL.Ontology), str(OWL.Restriction),
    str(OWL.ObjectProperty), str(OWL.DatatypeProperty),
    str(OWL.AnnotationProperty), str(RDF.Property),
}

# OWL restriction operator → display symbol. Used in synthesized edge labels.
# Math symbols render fine in Cytoscape (UTF-8 throughout). Cardinality kinds
# carry the n in `qualifier`; existential / universal kinds carry just the op.
_RESTRICTION_OPS = {
    "someValuesFrom": "∃",
    "allValuesFrom":  "∀",
    "hasValue":       "=",
    "cardinality":    "=",
    "minCardinality": "≥",
    "maxCardinality": "≤",
    "qualifiedCardinality":    "=",
    "minQualifiedCardinality": "≥",
    "maxQualifiedCardinality": "≤",
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
            r"(?:@prefix|PREFIX)\s+([\w-]*)\s*:\s*<([^>]+)>", ttl_text, re.IGNORECASE
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


# Properties whose object on a restriction bnode acts as the "filler" --
# the class (or value) the restriction quantifies over. Cardinality-only
# restrictions have none of these.
_FILLER_PREDS = (
    "someValuesFrom",
    "allValuesFrom",
    "hasValue",
    "onClass",
    "onDataRange",
)
_CARD_PREDS = (
    "cardinality",
    "minCardinality",
    "maxCardinality",
    "qualifiedCardinality",
    "minQualifiedCardinality",
    "maxQualifiedCardinality",
)


# Class axioms that can attach an owl:Restriction blank node to a named class.
# rdfs:subClassOf states a *necessary* condition (the class is a subclass of the
# restriction, ⊑); owl:equivalentClass states a *necessary & sufficient*
# definition (the class IS the restriction, ≡). Both are rendered, tagged with
# `via` so the visualization can distinguish them. equivalentClass is listed
# FIRST so that, when the SAME restriction bnode is attached to a class via both
# axioms, the (stronger) definitional edge wins the (cls, restr) dedup and the
# redundant subClassOf duplicate is dropped.
_RESTRICTION_VIA = (
    (OWL.equivalentClass, "equivalentClass"),
    (RDFS.subClassOf, "subClassOf"),
)


def _iter_restriction_axioms(g: Graph):
    """Yield ``(cls, restr, via_name, consumed)`` for each class axiom pointing a
    named class at an owl:Restriction via owl:equivalentClass or rdfs:subClassOf.

    A restriction attached *directly* keeps the axiom's `via` (⊑ for subClassOf,
    ≡ for equivalentClass). A restriction nested one level inside an
    ``owl:intersectionOf`` of an anonymous ``owl:Class`` — the common "defined
    class" idiom, e.g. ``Mother ≡ Woman ⊓ ∃hasChild.Person`` — is surfaced as a
    **subClassOf** (necessary, ⊑) edge: the class is a subclass of *each*
    conjunct regardless of whether the wrapper was attached via ≡ or ⊑, so ≡
    would overstate it. ``owl:unionOf`` is intentionally NOT descended: there the
    member is a *subclass* of the class (reversed direction), which the
    class→filler edge model would draw backwards.

    `consumed` is the set of blank nodes the restriction occupied (the wrapper
    owl:Class node and its RDF-list cells) so the caller can suppress them.
    """
    for via_pred, via_name in _RESTRICTION_VIA:
        for cls, _, target in g.triples((None, via_pred, None)):
            if not isinstance(target, BNode):
                continue
            if (target, RDF.type, OWL.Restriction) in g:
                yield cls, target, via_name, frozenset()
                continue
            # Defined class: (equivalentClass|subClassOf) → [owl:Class ; owl:intersectionOf (... restriction ...)]
            lst = g.value(target, OWL.intersectionOf)
            if lst is None:
                continue
            consumed = frozenset({target} | _rdf_list_nodes(g, lst))
            for member in g.items(lst):
                if isinstance(member, BNode) and (member, RDF.type, OWL.Restriction) in g:
                    yield cls, member, "subClassOf", consumed


def _rdf_list_nodes(g: Graph, lst) -> Set:
    """Return the set of list-cell blank nodes spanning an RDF collection, so
    the caller can suppress the now-internal rdf:first/rdf:rest plumbing."""
    cells: Set = set()
    cur = lst
    while cur is not None and cur != RDF.nil and cur not in cells:
        if isinstance(cur, BNode):
            cells.add(cur)
        cur = g.value(cur, RDF.rest)
    return cells


def _extract_owl_restrictions(g: Graph) -> List[dict]:
    """Walk every `?C (rdfs:subClassOf|owl:equivalentClass) ?r` where ?r is an
    owl:Restriction blank node, and return one dict per restriction describing
    how it should be rendered as a synthetic edge.

    Each returned dict carries the source class IRI, the on-property IRI,
    the operator key (e.g. "someValuesFrom"), an optional filler IRI
    (the someValuesFrom / allValuesFrom / hasValue / onClass target), an
    optional cardinality `n`, how the restriction is attached (`via`:
    "subClassOf" | "equivalentClass"), the original restriction bnode, and
    `consumed` — the set of blank nodes (restriction + any intersection/union
    wrapper and its list cells) the caller must suppress during the main walk.

    The (cls, restr) dedup is intentionally `via`-agnostic: when the same
    restriction bnode is attached to a class via both axioms, the first hit
    wins. equivalentClass is iterated first (see _RESTRICTION_VIA), so the
    stronger definition is kept and the redundant subClassOf edge dropped.
    """
    out: List[dict] = []
    seen: Set[Tuple[str, BNode]] = set()
    for cls, restr, via_name, extra in _iter_restriction_axioms(g):
        if not isinstance(restr, BNode):
            continue
        if (restr, RDF.type, OWL.Restriction) not in g:
            continue
        if not isinstance(cls, URIRef):
            continue  # bnode-on-bnode axiom is not a restriction we render
        key = (str(cls), restr)
        if key in seen:
            continue

        on_property = g.value(restr, OWL.onProperty)
        if not isinstance(on_property, URIRef):
            continue  # malformed restriction; skip

        record = {
            "source_iri": str(cls),
            "predicate_iri": str(on_property),
            "op": None,
            "filler_iri": None,
            "filler_label": None,
            "cardinality": None,
            "via": via_name,
            "bnode": restr,
            "consumed": set(extra) | {restr},
        }

        # Filler-bearing restrictions take priority over plain cardinality.
        for pred_local in _FILLER_PREDS:
            obj = g.value(restr, OWL[pred_local])
            if obj is None:
                continue
            if isinstance(obj, URIRef):
                record["filler_iri"] = str(obj)
                record["filler_label"] = resolve_label(obj, g)
            elif isinstance(obj, Literal):
                record["filler_iri"] = None
                record["filler_label"] = str(obj)
            if pred_local in ("onClass", "onDataRange"):
                continue  # used together with qualified cardinality below
            record["op"] = pred_local
            break

        # Cardinality kinds. If a qualified variant is present alongside
        # onClass / onDataRange we honour the qualified kind; otherwise the
        # bare cardinality kind.
        for pred_local in _CARD_PREDS:
            obj = g.value(restr, OWL[pred_local])
            if obj is None:
                continue
            try:
                record["cardinality"] = int(obj)
            except (TypeError, ValueError):
                record["cardinality"] = str(obj)
            # Only overwrite op if no filler-bearing op was found
            if record["op"] is None or record["op"] in ("onClass", "onDataRange"):
                record["op"] = pred_local
            break

        if record["op"] is None:
            continue  # unknown shape -- nothing to render

        seen.add(key)
        out.append(record)

    return out


def _extract_boolean_class_members(g: Graph) -> Tuple[List[dict], Set[BNode]]:
    """Collapse an anonymous ``owl:Class`` defined by ``owl:intersectionOf`` /
    ``owl:unionOf`` — attached to a NAMED class via rdfs:subClassOf or
    owl:equivalentClass — into rdfs:subClassOf edges to/from its NAMED members,
    so the anonymous wrapper doesn't render as a disconnected node.

    intersectionOf : the defined class is below each conjunct (``cls ⊑ member``, ⊓).
    unionOf        : each disjunct is below the defined class (``member ⊑ cls``, ⊔).

    Restriction members of the same wrapper are rendered by
    ``_extract_owl_restrictions``; here we wire only the *named* members.
    Returns ``(edges, consumed_bnodes)`` where each edge dict carries
    ``sub_iri`` / ``super_iri`` / ``op`` (the operator symbol), and
    ``consumed_bnodes`` is the wrapper plus its RDF-list cells to suppress.
    """
    out: List[dict] = []
    consumed: Set[BNode] = set()
    for via_pred, _via_name in _RESTRICTION_VIA:
        for cls, _, target in g.triples((None, via_pred, None)):
            if not isinstance(cls, URIRef) or not isinstance(target, BNode):
                continue
            if (target, RDF.type, OWL.Restriction) in g:
                continue  # a property restriction — handled elsewhere
            for list_pred, op_sym, members_below in (
                (OWL.intersectionOf, "⊓", False),  # cls ⊑ each member
                (OWL.unionOf, "⊔", True),           # each member ⊑ cls
            ):
                lst = g.value(target, list_pred)
                if lst is None:
                    continue
                consumed.add(target)
                consumed |= _rdf_list_nodes(g, lst)
                for member in g.items(lst):
                    if not isinstance(member, URIRef):
                        continue  # nested restriction / bnode member handled elsewhere
                    if members_below:
                        out.append({"sub_iri": str(member), "super_iri": str(cls), "op": op_sym})
                    else:
                        out.append({"sub_iri": str(cls), "super_iri": str(member), "op": op_sym})
    return out, consumed


# ---------------------------------------------------------------------------
# Predicate policy — v0.7.0 semantic-tile support
# ---------------------------------------------------------------------------

# Built-in CURIE map covering the common prefixes referenced by fence-level
# predicate policies. Used when the source graph doesn't declare a matching
# @prefix binding.
_BUILTIN_CURIE_MAP: Dict[str, str] = {
    "rdf":    "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "rdfs":   "http://www.w3.org/2000/01/rdf-schema#",
    "owl":    "http://www.w3.org/2002/07/owl#",
    "xsd":    "http://www.w3.org/2001/XMLSchema#",
    "sh":     "http://www.w3.org/ns/shacl#",
    "skos":   "http://www.w3.org/2004/02/skos/core#",
    "dct":    "http://purl.org/dc/terms/",
    "dc":     "http://purl.org/dc/elements/1.1/",
    "prov":   "http://www.w3.org/ns/prov#",
    "schema": "http://schema.org/",
}

# Annotation-style predicates whose folded literal object goes into
# ``node_badges[iri]['annotations']`` rather than ``data_properties``.
_ANNOTATION_PREDS: Set[str] = {
    "http://www.w3.org/2000/01/rdf-schema#label",
    "http://www.w3.org/2000/01/rdf-schema#comment",
    "http://www.w3.org/2004/02/skos/core#prefLabel",
    "http://www.w3.org/2004/02/skos/core#altLabel",
    "http://www.w3.org/2004/02/skos/core#definition",
    "http://purl.org/dc/terms/title",
    "http://purl.org/dc/terms/description",
    "http://purl.org/dc/elements/1.1/title",
    "http://purl.org/dc/elements/1.1/description",
}


def _resolve_curie(curie: str, graph_ns: Dict[str, str]) -> Optional[str]:
    """Expand a CURIE like ``rdfs:label`` to a full IRI using the graph's
    prefix map first, then the built-in fallback map. Returns ``None`` when
    the prefix cannot be resolved. Bare IRIs (containing '://') pass through
    unchanged.
    """
    if not curie or not isinstance(curie, str):
        return None
    if "://" in curie:
        return curie
    if ":" not in curie:
        return None
    prefix, _, local = curie.partition(":")
    ns_uri = graph_ns.get(prefix) or _BUILTIN_CURIE_MAP.get(prefix)
    if ns_uri is None:
        return None
    return ns_uri + local


def _build_prefix_map(graph: Graph) -> Dict[str, str]:
    """Return {prefix: namespace_uri} from graph.namespaces() as strings."""
    out: Dict[str, str] = {}
    try:
        for prefix, uri in graph.namespaces():
            if prefix:
                out[str(prefix)] = str(uri)
    except Exception:
        pass
    return out


def apply_predicate_policy(graph: Graph, policy: Optional[dict]) -> dict:
    """Compile a predicate policy into IRI-level lookup sets.

    Parameters
    ----------
    graph : rdflib.Graph
        Consulted for prefix bindings so CURIE resolution matches the source
        document's own bindings first.
    policy : dict | None
        The (already-merged) YAML policy dict. When ``None`` or missing
        ``predicates:``, the returned dict has empty sets — the caller's
        walk becomes a no-op.

    Returns
    -------
    dict
        {
          "hide":       set[str],       # predicate IRIs to drop wholesale
          "fold":       set[str],       # predicate IRIs whose literal
                                        # objects become node badges
          "badge":      set[str],       # object-property predicates surfaced
                                        # as node badges instead of edges
          "hide_prefixes": list[str],   # namespace-URI prefixes matched by
                                        # wildcard CURIEs (e.g. prov:*)
          "fold_prefixes": list[str],
          "badge_prefixes": list[str],
        }

    The function does NOT mutate ``graph``.
    """
    result = {
        "hide": set(),
        "fold": set(),
        "badge": set(),
        "hide_prefixes": [],
        "fold_prefixes": [],
        "badge_prefixes": [],
    }
    if not policy:
        return result

    preds = policy.get("predicates") if isinstance(policy, dict) else None
    if not preds:
        return result

    ns_map = _build_prefix_map(graph)

    def _classify(items, target_set_key: str, target_prefix_key: str):
        if not items:
            return
        for item in items:
            if not isinstance(item, str):
                continue
            item = item.strip()
            if not item:
                continue
            # Wildcard form: "prov:*"
            if item.endswith(":*"):
                prefix = item[:-2]
                ns_uri = ns_map.get(prefix) or _BUILTIN_CURIE_MAP.get(prefix)
                if ns_uri:
                    result[target_prefix_key].append(ns_uri)
                continue
            iri = _resolve_curie(item, ns_map)
            if iri:
                result[target_set_key].add(iri)

    _classify(preds.get("hide_predicates"), "hide", "hide_prefixes")
    _classify(preds.get("fold_into_badge"), "fold", "fold_prefixes")
    _classify(preds.get("badge_predicates"), "badge", "badge_prefixes")

    return result


def _policy_matches(iri: str, exact: Set[str], prefixes: List[str]) -> bool:
    """Return True if ``iri`` is in ``exact`` or begins with any of ``prefixes``."""
    if iri in exact:
        return True
    for p in prefixes:
        if iri.startswith(p):
            return True
    return False


def _init_node_badges_entry(node_badges: dict, subj_iri: str) -> dict:
    """Return (creating if needed) the badge accumulator for ``subj_iri``."""
    entry = node_badges.get(subj_iri)
    if entry is None:
        entry = {
            "annotations": [],
            "data_properties": [],
            "counts": {"annotations": 0, "data_properties": 0, "hidden_object": 0},
        }
        node_badges[subj_iri] = entry
    return entry


def fold_literals_into_badges(cytoscape_data: dict, pol: dict) -> dict:
    """Post-process the ``nodes``/``edges`` payload to move folded literal
    objects into ``node_badges`` and drop the now-redundant edges (and any
    orphan literal nodes).

    Parameters
    ----------
    cytoscape_data : dict
        Must contain ``nodes`` (list of dicts wrapping ``data``) and
        ``edges`` (list of dicts wrapping ``data``).
    pol : dict
        As returned by :func:`apply_predicate_policy`.

    Returns
    -------
    dict
        The same ``cytoscape_data`` with ``node_badges`` populated in-place.
        Also removes matching edges and orphaned literal nodes.
    """
    nodes = cytoscape_data.get("nodes", [])
    edges = cytoscape_data.get("edges", [])
    node_badges = cytoscape_data.setdefault("node_badges", {})

    fold_set = pol.get("fold", set())
    fold_prefixes = pol.get("fold_prefixes", [])
    if not fold_set and not fold_prefixes:
        return cytoscape_data

    # Index nodes by id for quick lookup and later orphan pruning.
    nodes_by_id: Dict[str, dict] = {}
    for n in nodes:
        nid = n.get("data", {}).get("id")
        if nid is not None:
            nodes_by_id[nid] = n

    # Also index subject IRI for badge attribution.
    def _subj_iri(source_id: str) -> Optional[str]:
        n = nodes_by_id.get(source_id)
        if not n:
            return None
        return n.get("data", {}).get("iri") or source_id

    kept_edges: List[dict] = []
    literal_touched: Set[str] = set()  # ids of literal nodes whose edges were folded

    for e in edges:
        d = e.get("data", {})
        pred_iri = d.get("iri", "")
        edge_type = d.get("edgeType", "")

        if (edge_type == "data-property"
                and pred_iri
                and _policy_matches(pred_iri, fold_set, fold_prefixes)):
            src_id = d.get("source")
            tgt_id = d.get("target")
            subj_iri = _subj_iri(src_id) or ""
            tgt_node = nodes_by_id.get(tgt_id) if tgt_id else None
            value = ""
            if tgt_node:
                value = tgt_node.get("data", {}).get("label", "")
                literal_touched.add(tgt_id)
            entry = _init_node_badges_entry(node_badges, subj_iri)
            bucket = "annotations" if pred_iri in _ANNOTATION_PREDS else "data_properties"
            entry[bucket].append({
                "predicate": d.get("label") or pred_iri,
                "predicate_iri": pred_iri,
                "value": value,
            })
            entry["counts"][bucket] += 1
            continue
        kept_edges.append(e)

    cytoscape_data["edges"] = kept_edges

    # Remove literal nodes that are now orphaned.
    if literal_touched:
        # Recompute referenced ids from the surviving edges.
        referenced: Set[str] = set()
        for e in kept_edges:
            d = e.get("data", {})
            if d.get("source"):
                referenced.add(d["source"])
            if d.get("target"):
                referenced.add(d["target"])
        surviving: List[dict] = []
        for n in nodes:
            nid = n.get("data", {}).get("id")
            if nid in literal_touched and nid not in referenced:
                # Only prune Literal-typed nodes; never drop URI subjects.
                if n.get("data", {}).get("type") == "Literal":
                    continue
            surviving.append(n)
        cytoscape_data["nodes"] = surviving

    return cytoscape_data


# ---------------------------------------------------------------------------
# Main parser
# ---------------------------------------------------------------------------

def parse_ttl_to_cytoscape(data_path: str, shape_path: str = None, policy: Optional[dict] = None) -> dict:
    """
    Parse TTL files and return Cytoscape.js elements + metadata.

    Returns dict with keys: nodes, edges, shacl, namespaces, edgeStyles, nodeStyles,
    rawTtl (for editor), shapeTtl (for validation).

    Parameters
    ----------
    policy : dict | None
        Optional predicate/cluster/LOD policy (fence-level YAML). When given,
        ``predicates.hide_predicates`` triples are skipped during the Step-2
        walk and ``predicates.fold_into_badge`` triples are diverted to the
        ``node_badges`` accumulator so their literal objects become node
        badges instead of separate literal nodes + edges.
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

    # Compile the predicate policy once (empty sets when no policy given).
    pol = apply_predicate_policy(g, policy)

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
    # Step 1b: Extract owl:Restriction bnodes attached via rdfs:subClassOf or owl:equivalentClass.
    # Each becomes a synthetic edge with edgeType="owl-restriction" later.
    # We also collect the restriction bnode IRIs so the main triple loop
    # (step 2) can skip the now-internal `cls subClassOf restr` and
    # `restr onProperty / someValuesFrom / …` triples.
    # -----------------------------------------------------------------------
    restrictions = _extract_owl_restrictions(g)
    # Anonymous boolean-class wrappers (owl:intersectionOf / owl:unionOf of named
    # classes) collapse into subClassOf edges to/from their members (step 2b').
    bool_members, bool_consumed = _extract_boolean_class_members(g)
    # Suppress every blank node a restriction or boolean wrapper consumed: the
    # restriction/wrapper itself plus the RDF-list cells. Drop those from
    # `classes` too so an anonymous wrapper can't leak in as a stray node.
    restriction_bnodes: Set[BNode] = set(bool_consumed)
    for r in restrictions:
        restriction_bnodes |= r["consumed"]
    classes -= {str(b) for b in restriction_bnodes}

    # -----------------------------------------------------------------------
    # Step 2: Collect nodes and edges
    # -----------------------------------------------------------------------
    nodes: Dict[str, dict] = {}
    edges: List[dict] = []
    seen_edges: set = set()
    node_badges: Dict[str, dict] = {}

    # For each subject seen with a folded predicate, we still need to make
    # sure the subject node exists — since the badge (§node_badges) attaches
    # to it. Collected here so we can re-emit isolated subjects in step 2b'.
    fold_subjects: Set[str] = set()

    for s, p, o in g:
        if p in (RDF.first, RDF.rest):
            continue
        if p == RDF.type and str(o) in _IMPLICIT_TOPS:
            continue
        # Suppress every triple that touches a restriction bnode -- the
        # restriction is rendered as a single synthesized edge in step 2c
        # below, not as a star of triples around a hidden node.
        if (isinstance(s, BNode) and s in restriction_bnodes) or \
           (isinstance(o, BNode) and o in restriction_bnodes):
            continue
        if isinstance(s, BNode) or isinstance(o, BNode):
            continue

        p_iri = str(p)
        # POLICY: hide_predicates — drop the triple entirely.
        if _policy_matches(p_iri, pol["hide"], pol["hide_prefixes"]):
            continue
        # POLICY: fold literal objects into node badges. Recorded here for
        # step 2 to skip the edge/literal emission; the fold pass below
        # runs a defensive sweep for anything that leaked through.
        if isinstance(o, Literal) and _policy_matches(
                p_iri, pol["fold"], pol["fold_prefixes"]):
            if isinstance(s, URIRef):
                subj_iri = str(s)
                fold_subjects.add(subj_iri)
                # Emit the badge immediately.
                entry = _init_node_badges_entry(node_badges, subj_iri)
                bucket = "annotations" if p_iri in _ANNOTATION_PREDS else "data_properties"
                lang = getattr(o, "language", None)
                datatype = getattr(o, "datatype", None)
                entry[bucket].append({
                    "predicate": resolve_predicate_label(p, g),
                    "predicate_iri": p_iri,
                    "value": str(o),
                    "lang": lang,
                    "datatype": str(datatype) if datatype else None,
                })
                entry["counts"][bucket] += 1
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
    # Step 2a': Materialise subject nodes for any subject that only shows
    # up as the source of folded (badge-diverted) triples. Without this the
    # badge would have no host node to attach to on the client.
    for subj_iri in fold_subjects:
        subj_node = URIRef(subj_iri)
        subj_id = _node_id(subj_node)
        if subj_id in nodes:
            continue
        source_name, color = detect_source(subj_iri)
        node_type = "Class" if subj_iri in classes else "Individual"
        shape = NODE_STYLES[node_type][0]
        if node_type == "Individual":
            color = NODE_STYLES["Individual"][1]
        nodes[subj_id] = {
            "data": {
                "id": subj_id,
                "label": resolve_label(subj_node, g),
                "type": node_type,
                "color": color,
                "shape": shape,
                "iri": subj_iri,
                "source": source_name,
                "namespace": _ns_for_uri(subj_iri, namespaces),
            }
        }

    # -----------------------------------------------------------------------
    # Step 2b: Materialise nodes for isolated classes.
    #
    # `:UnusedConcept a owl:Class .` -- and nothing else -- produces no
    # nodes from step 2, because the only triple about :UnusedConcept has
    # owl:Class as object, which sits in _IMPLICIT_TOPS and is filtered
    # out at the top of the loop. That defeats the lazy-class anti-pattern
    # example, whose point is precisely to show an orphan class. We
    # rectify by ensuring every IRI in `classes` (collected in step 1) has
    # a Cytoscape node, isolated or not.
    for cls in classes:
        cls_node = URIRef(cls)
        cls_id = _node_id(cls_node)
        if cls_id in nodes:
            continue
        source_name, color = detect_source(cls)
        nodes[cls_id] = {
            "data": {
                "id": cls_id,
                "label": resolve_label(cls_node, g),
                "type": "Class",
                "color": color,
                "shape": NODE_STYLES["Class"][0],
                "iri": cls,
                "source": source_name,
                "namespace": _ns_for_uri(cls, namespaces),
            }
        }

    # -----------------------------------------------------------------------
    # Step 2b': Wire boolean-class members. The anonymous owl:intersectionOf /
    # owl:unionOf wrapper was suppressed above; connect its NAMED members as
    # rdfs:subClassOf edges (cls ⊑ member for ⊓, member ⊑ cls for ⊔), labelled
    # with the operator so a reader sees the defined-class structure instead of
    # a disconnected blank node.
    # -----------------------------------------------------------------------
    _bool_style = EDGE_STYLES["subclass"]
    for be in bool_members:
        sub_id = _node_id(URIRef(be["sub_iri"]))
        sup_id = _node_id(URIRef(be["super_iri"]))
        if sub_id not in nodes or sup_id not in nodes:
            continue  # endpoints are named classes, materialised in step 2b
        edges.append({
            "data": {
                "id": f"be_{len(edges)}",
                "source": sub_id,
                "target": sup_id,
                "label": be["op"],
                "iri": str(RDFS.subClassOf),
                "edgeType": "subclass",
                "owlBoolean": be["op"],
                "lineStyle": _bool_style[0],
                "lineColor": _bool_style[1],
                "arrowShape": _bool_style[2],
                "edgeWidth": _bool_style[3],
            }
        })

    # -----------------------------------------------------------------------
    # Step 2c: Materialise one synthetic edge per OWL restriction.
    #
    # Each restriction `:C (rdfs:subClassOf|owl:equivalentClass) [Restriction; onProperty p; <op> F]`
    # becomes a single dashed magenta edge from :C to F (or to :C itself
    # when the restriction is cardinality-only with no filler). The edge
    # label encodes the operator using OWL ManchExpr-style symbols, so a
    # reader sees `∃ contains` / `∀ flowsInto` / `≥1 hasAuthor` /
    # `=1 advisor` directly on the graph.
    # -----------------------------------------------------------------------
    for r in restrictions:
        src_iri = r["source_iri"]
        src_id = _node_id(URIRef(src_iri))
        # Ensure source class node exists (it may not yet, if the class is
        # only declared via the restriction and step 2 saw no other triples).
        if src_id not in nodes:
            source_name, color = detect_source(src_iri)
            nodes[src_id] = {
                "data": {
                    "id": src_id,
                    "label": resolve_label(URIRef(src_iri), g),
                    "type": "Class",
                    "color": color,
                    "shape": NODE_STYLES["Class"][0],
                    "iri": src_iri,
                    "source": source_name,
                    "namespace": _ns_for_uri(src_iri, namespaces),
                }
            }

        # Decide the edge target.
        target_id = src_id  # self-loop default (cardinality-only)
        filler_iri = r.get("filler_iri")
        filler_label = r.get("filler_label")
        if filler_iri:
            target_id = _node_id(URIRef(filler_iri))
            if target_id not in nodes:
                source_name, color = detect_source(filler_iri)
                node_type = "Class" if filler_iri in classes else "Individual"
                shape = NODE_STYLES[node_type][0]
                if node_type == "Individual":
                    color = NODE_STYLES["Individual"][1]
                nodes[target_id] = {
                    "data": {
                        "id": target_id,
                        "label": filler_label or resolve_label(URIRef(filler_iri), g),
                        "type": node_type,
                        "color": color,
                        "shape": shape,
                        "iri": filler_iri,
                        "source": source_name,
                        "namespace": _ns_for_uri(filler_iri, namespaces),
                    }
                }
        elif filler_label is not None:
            # owl:hasValue with a literal target — represent as a Literal node.
            lit_id = f"lit_{abs(hash((src_id, r['predicate_iri'], filler_label))) % 999999}"
            if lit_id not in nodes:
                nodes[lit_id] = {
                    "data": {
                        "id": lit_id,
                        "label": filler_label,
                        "type": "Literal",
                        "color": NODE_STYLES["Literal"][1],
                        "shape": NODE_STYLES["Literal"][0],
                        "iri": "",
                        "source": "",
                        "namespace": "",
                    }
                }
            target_id = lit_id

        op_symbol = _RESTRICTION_OPS.get(r["op"], "?")
        # Use the predicate's short label (e.g. "contains") not its full IRI.
        pred_label = resolve_predicate_label(URIRef(r["predicate_iri"]), g)
        n = r.get("cardinality")
        if n is not None and r["op"] in _CARD_PREDS:
            label = f"{op_symbol}{n} {pred_label}"
        else:
            label = f"{op_symbol} {pred_label}"

        # How the restriction is attached changes its meaning *and* its look:
        #   rdfs:subClassOf    → necessary condition (⊑); directed triangle arrow
        #   owl:equivalentClass → defines the class (necessary & sufficient, ≡);
        #                          prefix the label and use a diamond arrow so a
        #                          reader can tell a definition from a constraint.
        via = r.get("via", "subClassOf")
        style = EDGE_STYLES["owl-restriction"]
        if via == "equivalentClass":
            label = "≡ " + label
            arrow_shape = "diamond"
        else:
            arrow_shape = style[2]

        edges.append({
            "data": {
                "id": f"r_{len(edges)}",
                "source": src_id,
                "target": target_id,
                "label": label,
                "iri": r["predicate_iri"],
                "edgeType": "owl-restriction",
                "owlOp": r["op"],
                "owlOpSymbol": op_symbol,
                "owlVia": via,
                "owlCardinality": n,
                "owlPredicate": r["predicate_iri"],
                "owlFiller": filler_iri or "",
                "lineStyle": style[0],
                "lineColor": style[1],
                "arrowShape": arrow_shape,
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

                # Annotate matching edges.
                #
                # v0.7.4 — an edge only carries this shape's constraint when
                # its SUBJECT is in the shape's target scope. Matching on the
                # property IRI alone painted the cardinality badge on every
                # edge using that predicate, including subjects the shape
                # never targets (see _shacl_target_nodes).
                cardinality = _format_cardinality(min_count, max_count)
                path_str = str(path) if path else None
                target_nodes = _shacl_target_nodes(g, target) if target is not None else None
                annotated = False
                for edge in edges:
                    if target_nodes is not None and edge["data"].get("source") not in target_nodes:
                        continue
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
    smells = _detect_smells(g, nodes, edges, classes, shacl_data, namespaces, shape_graph)

    result = {
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
        "node_badges": node_badges,
    }

    # Defensive fold pass: any folded literal that slipped through
    # (e.g. via the OWL-restriction filler literal branch) is uniformly
    # moved into node_badges, matching edges dropped, orphan literals pruned.
    fold_literals_into_badges(result, pol)

    return result


def _ns_for_uri(uri_str: str, namespaces: Dict[str, str]) -> str:
    """Find which declared namespace prefix a URI belongs to."""
    best = ""
    best_len = 0
    for prefix, ns_uri in namespaces.items():
        if uri_str.startswith(ns_uri) and len(ns_uri) > best_len:
            best = prefix
            best_len = len(ns_uri)
    return best


def _shacl_target_nodes(g: Graph, target) -> Set[str]:
    """Return the node IRIs that are SHACL instances of *target*.

    Per the SHACL spec a node is a "SHACL instance" of class C when it has
    ``rdf:type`` C **or** ``rdf:type`` D for some D with
    ``rdfs:subClassOf*`` C — so target membership must descend the subclass
    hierarchy, not just match direct types.

    v0.7.4: previously the constraint-edge annotation below matched on the
    property IRI alone, which drew the shape's cardinality badge on every
    edge using that predicate regardless of whether its subject was in the
    shape's target scope. In the reasoning-demo §9 figure that painted
    ``ex:rex rdfs:label "Rex"`` as a ``[1..*]`` constraint edge even though
    ``ex:rex a ex:Dog`` and ``ex:PersonShape sh:targetClass ex:Person`` —
    the diagram asserted a constraint that does not apply to that node.
    """
    if target is None:
        return set()
    classes = {target}
    frontier = [target]
    while frontier:
        cls = frontier.pop()
        for sub in g.subjects(RDFS.subClassOf, cls):
            if sub not in classes:
                classes.add(sub)
                frontier.append(sub)
    out: Set[str] = set()
    for cls in classes:
        for inst in g.subjects(RDF.type, cls):
            out.add(str(inst))
    return out


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
    import os
    original_triples = set((str(s), str(p), str(o)) for s, p, o in g)

    # Reasoner selection via env var:
    #   auto (default) | owlready2 | konclude | konclude-wasm | owlrl | none
    #
    #   konclude       → native Konclude C++ binary (https://github.com/konclude/Konclude)
    #   konclude-wasm  → rdf-reasoner-konclude (WASM port for browser/Node.js)
    selected = (os.environ.get("ONTOINK_REASONER") or "auto").lower().strip()
    if selected == "none":
        return []

    if selected == "owlready2":
        inferred_raw = _reason_with_owlready2(g)
    elif selected == "konclude":
        inferred_raw = _reason_with_konclude_native(g)
    elif selected == "konclude-wasm":
        inferred_raw = _reason_with_konclude_wasm(g)
    elif selected == "owlrl":
        inferred_raw = _reason_with_owlrl(g)
    else:  # auto
        inferred_raw = (
            _reason_with_owlready2(g)
            or _reason_with_konclude_native(g)
            or _reason_with_konclude_wasm(g)
            or _reason_with_owlrl(g)
        )
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


def _serialize_for_owlready2(g: Graph) -> str:
    """Write *g* to a temp file owlready2 can load, returning its path.

    Prefers RDF/XML (owlready2's bundled Turtle parser is unreliable on rdflib's
    output), but falls back to N-Triples when RDF/XML serialization raises — e.g.
    an IRI that is not a valid XML QName would otherwise make
    ``serialize(format="xml")`` throw and silently drop every inference. Caller
    owns the returned path and must unlink it.
    """
    import os
    import tempfile

    last_exc: Optional[Exception] = None
    for fmt, suffix in (("xml", ".owl"), ("ntriples", ".nt")):
        tf = tempfile.NamedTemporaryFile(suffix=suffix, delete=False, mode="w", encoding="utf-8")
        try:
            g.serialize(tf.name, format=fmt)
            tf.close()
            return tf.name
        except Exception as exc:  # noqa: BLE001 - fall through to the next format
            last_exc = exc
            tf.close()
            try:
                os.unlink(tf.name)
            except OSError:
                pass
    raise RuntimeError(f"could not serialize graph for owlready2: {last_exc}")


def _reason_with_owlready2(g: Graph) -> Optional[List[tuple]]:
    """Try reasoning with owlready2 (HermiT). Returns list of (s, p, o, is_literal) or None."""
    try:
        import owlready2
        import os
    except ImportError:
        return None

    # Serialize the rdflib graph to a temp file, load in owlready2
    tmpfile_path = None
    try:
        tmpfile_path = _serialize_for_owlready2(g)

        world = owlready2.World()
        onto = world.get_ontology(f"file://{tmpfile_path}").load()

        # Collect triples before reasoning
        before = set()
        for s, p, o in world.as_rdflib_graph():
            if isinstance(s, BNode) or isinstance(o, BNode):
                continue
            before.add((str(s), str(p), str(o)))

        # Run HermiT reasoner. Older owlready2 builds' sync_reasoner_hermit()
        # don't accept infer_data_property_values — fall back without it so a
        # TypeError doesn't silently swallow all inferences.
        with onto:
            try:
                owlready2.sync_reasoner(
                    world, infer_property_values=True, infer_data_property_values=True
                )
            except TypeError:
                owlready2.sync_reasoner(world, infer_property_values=True)

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
        if tmpfile_path:
            try:
                os.unlink(tmpfile_path)
            except OSError:
                pass


def _add_konclude_owlxml_inferences(path: str, out: Graph) -> None:
    """Translate Konclude's OWL/XML result file into triples on ``out``.

    Konclude's ``classification`` / ``realization`` subcommands emit OWL 2 XML
    (an ``<Ontology>`` document with ``<SubClassOf>`` / ``<ClassAssertion>`` /
    ``<EquivalentClasses>`` / ``<ObjectPropertyAssertion>`` elements), NOT
    RDF/XML — so ``rdflib.Graph.parse(format="xml")`` cannot read it. We extract
    the axiom shapes that carry inferences over *named* entities.
    """
    import xml.etree.ElementTree as ET

    OWL_NS = "http://www.w3.org/2002/07/owl#"

    def _local(tag: str) -> str:
        return tag.rsplit("}", 1)[-1]

    def _iri(el) -> Optional[str]:
        return el.get("IRI") or el.get("abbreviatedIRI") or el.get("{%s}IRI" % OWL_NS)

    root = ET.parse(path).getroot()
    for node in root:
        tag = _local(node.tag)
        kids = list(node)
        if tag == "SubClassOf" and len(kids) == 2 \
                and _local(kids[0].tag) == "Class" and _local(kids[1].tag) == "Class":
            sub, sup = _iri(kids[0]), _iri(kids[1])
            if sub and sup:
                out.add((URIRef(sub), RDFS.subClassOf, URIRef(sup)))
        elif tag == "ClassAssertion":
            cls = ind = None
            for c in kids:
                lt = _local(c.tag)
                if lt == "Class":
                    cls = _iri(c)
                elif lt == "NamedIndividual":
                    ind = _iri(c)
            if cls and ind:
                out.add((URIRef(ind), RDF.type, URIRef(cls)))
        elif tag == "EquivalentClasses":
            iris = [i for i in (_iri(c) for c in kids if _local(c.tag) == "Class") if i]
            for a in range(len(iris)):
                for b in range(a + 1, len(iris)):
                    out.add((URIRef(iris[a]), OWL.equivalentClass, URIRef(iris[b])))
        elif tag == "ObjectPropertyAssertion" and len(kids) == 3 \
                and _local(kids[0].tag) == "ObjectProperty":
            prop, s, o = _iri(kids[0]), _iri(kids[1]), _iri(kids[2])
            if prop and s and o:
                out.add((URIRef(s), URIRef(prop), URIRef(o)))


def _reason_with_konclude_native(g: Graph) -> Optional[List[tuple]]:
    """Run OWL-DL reasoning via the native Konclude C++ binary.

    Looks for the ``konclude`` binary on PATH (override via ONTOINK_KONCLUDE_BIN).
    Invokes both ``classification`` and ``realization`` subcommands and merges
    the inferred triples.

    I/O format notes:
        Konclude reads RDF/XML on input as long as the document carries an
        ``owl:Ontology`` declaration (we add a transient one if the graph lacks
        it). On output it writes **OWL 2 XML** (``<Ontology>`` with
        ``<SubClassOf>`` / ``<ClassAssertion>`` elements), which is NOT RDF/XML
        — so we translate it via ``_add_konclude_owlxml_inferences`` rather than
        ``rdflib.parse(format="xml")`` (which silently yields nothing).

    Reference:
        Liebig, T., Jaeger, M., Möller, R., & Möller, B. (2014).
        Konclude: System Description. Web Semantics, 27-28, 78-85.
        doi:10.1016/j.websem.2014.06.003
        https://github.com/konclude/Konclude
    """
    import os
    import shutil
    import subprocess
    import tempfile

    bin_name = os.environ.get("ONTOINK_KONCLUDE_BIN", "konclude")
    if shutil.which(bin_name) is None:
        return None

    tmpin = None
    tmpouts = []
    try:
        # Konclude reads RDF/XML, but only if the document declares an ontology.
        # Add a transient owl:Ontology header when the input graph has none, so
        # arbitrary playground TTL still classifies.
        konclude_g = g
        if (None, RDF.type, OWL.Ontology) not in g:
            konclude_g = Graph()
            for ns_prefix, ns_uri in g.namespaces():
                konclude_g.bind(ns_prefix, ns_uri)
            for t in g:
                konclude_g.add(t)
            konclude_g.add((URIRef("urn:ontoink:konclude-input"), RDF.type, OWL.Ontology))
        tmpin = tempfile.NamedTemporaryFile(suffix=".owl", delete=False, mode="w", encoding="utf-8")
        konclude_g.serialize(tmpin.name, format="xml")
        tmpin.close()

        # Run both classification (class hierarchy) and realization (instance types).
        # Their combined output gives the same inferences owlready2 would surface.
        inferred_g = Graph()
        for subcmd in ("classification", "realization"):
            tmpout = tempfile.NamedTemporaryFile(suffix=".owl", delete=False, mode="r", encoding="utf-8")
            tmpout.close()
            tmpouts.append(tmpout)
            proc = subprocess.run(
                [bin_name, subcmd, "-i", tmpin.name, "-o", tmpout.name],
                capture_output=True, text=True, timeout=120,
            )
            if proc.returncode != 0:
                # If one subcommand fails (e.g. realization with no individuals),
                # keep going — the other may still produce results
                continue
            try:
                _add_konclude_owlxml_inferences(tmpout.name, inferred_g)
            except Exception:
                continue

        original = set((str(s), str(p), str(o)) for s, p, o in g)
        result = []
        for s, p, o in inferred_g:
            if isinstance(s, BNode) or isinstance(o, BNode):
                continue
            if (str(s), str(p), str(o)) in original:
                continue
            result.append((str(s), str(p), str(o), isinstance(o, Literal)))
        return result
    except (subprocess.TimeoutExpired, OSError, Exception):
        return None
    finally:
        if tmpin:
            try: os.unlink(tmpin.name)
            except OSError: pass
        for f in tmpouts:
            try: os.unlink(f.name)
            except OSError: pass


def _reason_with_konclude_wasm(g: Graph) -> Optional[List[tuple]]:
    """Run OWL-DL reasoning via rdf-reasoner-konclude (WASM Konclude port for browser/Node.js).

    Requires Node.js >= 18 and the ``rdf-reasoner-konclude`` npm package on PATH
    (or pointed to via the ONTOINK_KONCLUDE_WASM_BIN env var, default: ``owl-reason``).

    The WASM port is provided by Thomas Hanke (https://github.com/ThHanke/rdf-reasoner-konclude)
    and wraps the same Konclude kernel referenced below.

    Reference:
        Liebig, T., Jaeger, M., Möller, R., & Möller, B. (2014).
        Konclude: System Description. Web Semantics, 27-28, 78-85.
        doi:10.1016/j.websem.2014.06.003
    """
    import os
    import shutil
    import subprocess
    import tempfile

    bin_name = os.environ.get("ONTOINK_KONCLUDE_WASM_BIN", "owl-reason")
    if shutil.which(bin_name) is None:
        return None

    tmpin = tmpout = None
    try:
        tmpin = tempfile.NamedTemporaryFile(suffix=".ttl", delete=False, mode="w", encoding="utf-8")
        g.serialize(tmpin.name, format="turtle")
        tmpin.close()
        tmpout = tempfile.NamedTemporaryFile(suffix=".nt", delete=False, mode="r", encoding="utf-8")
        tmpout.close()

        proc = subprocess.run(
            [bin_name, "--input", tmpin.name, "--output", tmpout.name, "--mode", "classify", "--format", "nt"],
            capture_output=True, text=True, timeout=120,
        )
        if proc.returncode != 0:
            return None

        inferred_g = Graph()
        inferred_g.parse(tmpout.name, format="nt")

        original = set((str(s), str(p), str(o)) for s, p, o in g)
        result = []
        for s, p, o in inferred_g:
            if isinstance(s, BNode) or isinstance(o, BNode):
                continue
            if (str(s), str(p), str(o)) in original:
                continue
            result.append((str(s), str(p), str(o), isinstance(o, Literal)))
        return result
    except (subprocess.TimeoutExpired, OSError, Exception):
        return None
    finally:
        for f in (tmpin, tmpout):
            if f:
                try:
                    os.unlink(f.name)
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
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },
    "missing-label": {
        "name": "Missing Label",
        "severity": "warning",
        "description": "An entity has no rdfs:label. Labels are essential for human readability and search.",
        "reference": "Poveda-Villalón et al. (2014), Pitfall P08",
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },
    "missing-domain-range": {
        "name": "Missing Domain/Range",
        "severity": "info",
        "description": "A property has no rdfs:domain or rdfs:range declared. This reduces reasoning power and clarity.",
        "reference": "Rector et al. (2004) OWL Pizzas; OOPS! P11",
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },
    "singleton-hierarchy": {
        "name": "Singleton Hierarchy",
        "severity": "info",
        "description": "A chain of subClassOf where each class has only one subclass. Consider merging or flattening.",
        "reference": "Gangemi et al. (2006), Ontology Design Patterns",
        "url": "http://ontologydesignpatterns.org/",
    },
    "property-soup": {
        "name": "Property Soup",
        "severity": "warning",
        "description": "A class has more than 15 direct properties. Consider decomposing into sub-concepts.",
        "reference": "Modularisation design pattern",
        "url": "http://ontologydesignpatterns.org/wiki/Submissions:Modularization",
    },
    "orphan-class": {
        "name": "Orphan Class",
        "severity": "info",
        "description": "A class has no rdfs:subClassOf parent and is not a parent. It floats disconnected in the hierarchy.",
        "reference": "Poveda-Villalón et al. (2014), Pitfall P04",
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },
    "missing-inverse": {
        "name": "Missing Inverse",
        "severity": "info",
        "description": "An object property has no owl:inverseOf declared. Inverse properties improve query flexibility.",
        "reference": "OOPS! P13",
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },
    "no-shacl-coverage": {
        "name": "No SHACL Coverage",
        "severity": "warning",
        "description": "A class has instances but no SHACL shape to validate them. Data quality may be unverified.",
        "reference": "W3C SHACL Recommendation",
        "url": "https://www.w3.org/TR/shacl/",
    },
    "label-language-gap": {
        "name": "Label Language Gap",
        "severity": "info",
        "description": "Some entities have language-tagged labels (e.g., @en) but others don't. Internationalization is incomplete.",
        "reference": "Linked Data best practice; OOPS! P32",
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },
    "deep-hierarchy": {
        "name": "Deep Hierarchy",
        "severity": "info",
        "description": "Class hierarchy depth exceeds 7 levels. Deep hierarchies are hard to navigate and maintain.",
        "reference": "Poveda-Villalón et al. (2014), Pitfall P06",
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },
    "cyclic-subclass": {
        "name": "Cyclic SubClassOf",
        "severity": "error",
        "description": "A class is a subclass of itself (directly or transitively). This is logically inconsistent.",
        "reference": "OWL 2 Structural Specification; OOPS! P06",
        "url": "https://www.w3.org/TR/owl2-syntax/",
    },
    "property-clump": {
        "name": "Property Clump",
        "severity": "info",
        "description": "Multiple properties always appear together on the same instances. Consider grouping into a class.",
        "reference": "Fowler (1999) Refactoring — Data Clumps",
        "url": "https://refactoring.com/catalog/dataClumps.html",
    },
    "multi-inheritance": {
        "name": "Excessive Multi-Inheritance",
        "severity": "warning",
        "description": "A class has more than 3 direct superclasses. This may indicate a modeling issue.",
        "reference": "Rector et al. (2004) OWL Pizzas",
        "url": "https://link.springer.com/chapter/10.1007/978-3-540-30202-5_5",
    },
    "missing-comment": {
        "name": "Missing Comment",
        "severity": "info",
        "description": "A class has no rdfs:comment. Comments help users understand the intended semantics.",
        "reference": "OOPS! P08",
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },
    "ambiguous-namespace": {
        "name": "Ambiguous Namespace",
        "severity": "warning",
        "description": "Multiple entities share the same local name but from different namespaces. This causes confusion.",
        "reference": "OOPS! P39",
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },
    "symmetric-missing": {
        "name": "Potential Symmetric Property",
        "severity": "info",
        "description": "A property is used bidirectionally (A rel B and B rel A) but not declared owl:SymmetricProperty.",
        "reference": "OWL modelling best practice; OOPS! P26",
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },
    "large-union": {
        "name": "Large Union/Disjunction",
        "severity": "info",
        "description": "An owl:unionOf or owl:disjointWith involves more than 5 classes. Consider restructuring.",
        "reference": "Rector et al. (2004) OWL Pizzas",
        "url": "https://link.springer.com/chapter/10.1007/978-3-540-30202-5_5",
    },
    "deprecated-entity": {
        "name": "Deprecated Entity Used",
        "severity": "warning",
        "description": "An entity marked owl:deprecated true is still referenced. Update to the replacement.",
        "reference": "OWL 2 Annotations Recommendation",
        "url": "https://www.w3.org/TR/owl2-syntax/#Annotation_Properties",
    },
    "unused-import": {
        "name": "Unused Import",
        "severity": "info",
        "description": "An owl:imports declaration references an ontology whose terms are not used in the graph.",
        "reference": "Poveda-Villalón et al. (2014), Pitfall P09",
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },
    "redundant-subclass": {
        "name": "Redundant SubClassOf",
        "severity": "info",
        "description": "A class declares rdfs:subClassOf to a grandparent that is already implied by the chain. This is redundant.",
        "reference": "Poveda-Villalón et al. (2014), Pitfall P24",
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },

    # ── Additional OOPS! pitfalls (Poveda-Villalón et al. 2014) ──────────
    # Catalogue: https://oops.linkeddata.es/catalogue.jsp
    "polysemous-element": {
        "name": "Polysemous Element",
        "severity": "warning",
        "description": "A single IRI is used to represent more than one distinct sense or concept.",
        "reference": "OOPS! P01",
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },
    "synonyms-as-classes": {
        "name": "Synonyms Modeled as Separate Classes",
        "severity": "info",
        "description": "Synonymous terms minted as distinct classes instead of one class with skos:altLabel.",
        "reference": "OOPS! P02",
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },
    "is-relationship": {
        "name": "\"is\" Used as a Property Name",
        "severity": "error",
        "description": "A property named 'is' is used in place of rdfs:subClassOf, rdf:type, or owl:sameAs.",
        "reference": "OOPS! P03",
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },
    "wrong-inverse": {
        "name": "Wrong Inverse Relationship",
        "severity": "error",
        "description": "Two properties are declared owl:inverseOf each other but are not actual inverses.",
        "reference": "OOPS! P05",
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },
    "merged-concepts": {
        "name": "Merging Different Concepts in One Class",
        "severity": "warning",
        "description": "A class definition silently mixes two or more concepts (e.g., BookOrAuthor) without a union axiom.",
        "reference": "OOPS! P07",
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },
    "missing-disjointness": {
        "name": "Missing Disjointness Axioms",
        "severity": "warning",
        "description": "Sibling classes that are clearly disjoint in the domain have no owl:disjointWith declared.",
        "reference": "OOPS! P10",
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },
    "equivalent-property-not-declared": {
        "name": "Equivalent Properties Not Declared",
        "severity": "info",
        "description": "Two properties have the same semantics but are not linked via owl:equivalentProperty.",
        "reference": "OOPS! P12",
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },
    "misuse-allvaluesfrom": {
        "name": "Misuse of owl:allValuesFrom",
        "severity": "error",
        "description": "owl:allValuesFrom is used where owl:someValuesFrom is intended; universal restriction is vacuously satisfied when no value exists.",
        "reference": "OOPS! P14",
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },
    "some-not-vs-not-some": {
        "name": "'some not' Used in Place of 'not some'",
        "severity": "error",
        "description": "Negation is misplaced relative to the existential quantifier, flipping the intended meaning.",
        "reference": "OOPS! P15",
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },
    "primitive-instead-of-defined": {
        "name": "Primitive Class Used Instead of Defined",
        "severity": "warning",
        "description": "A class that should have necessary-and-sufficient conditions is declared only with necessary axioms.",
        "reference": "OOPS! P16",
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },
    "overspecialized-hierarchy": {
        "name": "Overspecialized Hierarchy",
        "severity": "info",
        "description": "Leaf classes are so specific that no instance ever populates them.",
        "reference": "OOPS! P17",
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },
    "overspecialized-range": {
        "name": "Overspecialized Domain or Range",
        "severity": "warning",
        "description": "An rdfs:domain or rdfs:range is narrower than the property's actual usage in instance data.",
        "reference": "OOPS! P18",
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },
    "multiple-domain-range": {
        "name": "Multiple Domain or Range as Conjunction",
        "severity": "error",
        "description": "Two separate rdfs:domain (or range) triples are declared; standard semantics yield C1 ⊓ C2 but modelers usually intend C1 ⊔ C2.",
        "reference": "OOPS! P19",
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },
    "swapped-annotations": {
        "name": "Swapped Annotation Properties",
        "severity": "info",
        "description": "rdfs:label contains a definition and rdfs:comment contains a short name (or similar swap).",
        "reference": "OOPS! P20",
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },
    "miscellaneous-class": {
        "name": "Miscellaneous 'Other' Class",
        "severity": "info",
        "description": "A catch-all class (e.g. OtherDocument) groups instances that don't fit siblings.",
        "reference": "OOPS! P21",
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },
    "inconsistent-naming": {
        "name": "Inconsistent Naming Conventions",
        "severity": "info",
        "description": "The ontology mixes CamelCase, snake_case, and kebab-case across entities.",
        "reference": "OOPS! P22",
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },
    "recursive-definition": {
        "name": "Recursive Definition",
        "severity": "error",
        "description": "A class or property appears inside its own definition (e.g., in its own owl:equivalentClass axiom).",
        "reference": "OOPS! P24",
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },
    "inverse-of-self": {
        "name": "Property Declared Inverse of Itself",
        "severity": "warning",
        "description": "A property has owl:inverseOf pointing at itself instead of being declared owl:SymmetricProperty.",
        "reference": "OOPS! P25",
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },
    "wrong-transitive": {
        "name": "Wrong Transitive Declaration",
        "severity": "error",
        "description": "A property is declared owl:TransitiveProperty but is not transitive in the domain (e.g., parentOf).",
        "reference": "OOPS! P29",
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },
    "wrong-symmetric": {
        "name": "Wrong Symmetric Declaration",
        "severity": "error",
        "description": "A non-symmetric property is declared owl:SymmetricProperty (e.g., loves).",
        "reference": "OOPS! P28",
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },
    "one-property-chain": {
        "name": "Single-Property 'Chain'",
        "severity": "info",
        "description": "An owl:propertyChainAxiom lists only one antecedent property; equivalent to rdfs:subPropertyOf.",
        "reference": "OOPS! P33",
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },
    "untyped-class": {
        "name": "Untyped Class",
        "severity": "warning",
        "description": "An IRI is used as a class but not declared owl:Class or rdfs:Class.",
        "reference": "OOPS! P34",
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },
    "untyped-property": {
        "name": "Untyped Property",
        "severity": "warning",
        "description": "A predicate is used but not declared as an OWL/RDF property.",
        "reference": "OOPS! P35",
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },
    "extension-in-uri": {
        "name": "File Extension in Ontology URI",
        "severity": "info",
        "description": "The ontology IRI contains .owl, .rdf or .ttl; couples IRI to a serialization.",
        "reference": "OOPS! P36",
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },
    "no-ontology-declaration": {
        "name": "Missing owl:Ontology Declaration",
        "severity": "warning",
        "description": "No owl:Ontology triple with version/metadata is provided.",
        "reference": "OOPS! P38",
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },
    "namespace-hijacking": {
        "name": "Namespace Hijacking",
        "severity": "error",
        "description": "The ontology mints new terms in someone else's well-known namespace (foaf:, schema:, owl: …).",
        "reference": "OOPS! P40",
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },
    "no-license": {
        "name": "No License Declared",
        "severity": "warning",
        "description": "The ontology lacks dcterms:license or cc:license metadata; legally ambiguous for reuse.",
        "reference": "OOPS! P41",
        "url": "https://oops.linkeddata.es/catalogue.jsp",
    },

    # ── Roussey & Corcho logical anti-patterns (K-CAP 2009 / IC 2009) ────
    # Paper: https://liris.cnrs.fr/Documents/Liris-4441.pdf
    "onlyness-is-loneliness": {
        "name": "Onlyness Is Loneliness (OIL)",
        "severity": "error",
        "description": "A class is restricted with owl:allValuesFrom C on a property whose range is owl:disjointWith C, forcing the property to have no values.",
        "reference": "Corcho, Roussey & Vilches-Blázquez (IC 2009)",
        "url": "https://liris.cnrs.fr/Documents/Liris-4441.pdf",
    },
    "and-is-or": {
        "name": "Intersection Used for Union (AndIsOr)",
        "severity": "error",
        "description": "A class is defined as owl:intersectionOf of disjoint classes when union was intended; becomes unsatisfiable.",
        "reference": "Corcho, Roussey & Vilches-Blázquez (IC 2009)",
        "url": "https://liris.cnrs.fr/Documents/Liris-4441.pdf",
    },
    "universal-existence": {
        "name": "Universal Existence (UE)",
        "severity": "warning",
        "description": "An existential restriction exists on a property whose universal restriction has a disjoint filler.",
        "reference": "Corcho, Roussey & Vilches-Blázquez (IC 2009)",
        "url": "https://liris.cnrs.fr/Documents/Liris-4441.pdf",
    },
    "equivalence-is-difference": {
        "name": "Equivalence Is Difference (EID)",
        "severity": "error",
        "description": "Two classes are simultaneously owl:equivalentClass and owl:disjointWith (directly or via superclasses).",
        "reference": "Corcho, Roussey & Vilches-Blázquez (IC 2009)",
        "url": "https://liris.cnrs.fr/Documents/Liris-4441.pdf",
    },
    "sum-of-top-and-something": {
        "name": "Sum of Top and Something",
        "severity": "warning",
        "description": "An owl:unionOf contains owl:Thing plus other classes; the whole union collapses to owl:Thing.",
        "reference": "Corcho, Roussey & Vilches-Blázquez (IC 2009)",
        "url": "https://liris.cnrs.fr/Documents/Liris-4441.pdf",
    },

    # ── OntoClean meta-property violations (Guarino & Welty) ─────────────
    # Tutorial: http://www.loa.istc.cnr.it/wp-content/uploads/2020/03/OverviewOntoClean-compresso.pdf
    "antirigid-subsumes-rigid": {
        "name": "Anti-Rigid Class Subsumes Rigid Class",
        "severity": "error",
        "description": "A class annotated anti-rigid (~R, e.g. Student) has a rigid subclass (+R, e.g. Person); a rigid instance cannot always be its anti-rigid superclass.",
        "reference": "Guarino & Welty (2002) OntoClean",
        "url": "http://www.loa.istc.cnr.it/wp-content/uploads/2020/03/OverviewOntoClean-compresso.pdf",
    },
    "identity-criterion-mismatch": {
        "name": "Identity Criterion Conflict",
        "severity": "error",
        "description": "A subclass carries an identity criterion incompatible with that of its superclass.",
        "reference": "Guarino & Welty (2002) OntoClean",
        "url": "http://www.loa.istc.cnr.it/wp-content/uploads/2020/03/OverviewOntoClean-compresso.pdf",
    },
    "unity-violation": {
        "name": "Unity / Non-Unity Subsumption Violation",
        "severity": "warning",
        "description": "A class with unity criterion (+U) is subsumed by a class without unity (-U); wholes confused with parts.",
        "reference": "Guarino & Welty (2002) OntoClean",
        "url": "http://www.loa.istc.cnr.it/wp-content/uploads/2020/03/OverviewOntoClean-compresso.pdf",
    },
    "dependence-violation": {
        "name": "Dependence Mismatch in Hierarchy",
        "severity": "warning",
        "description": "A dependent class (+D, e.g. Spouse) subsumes an independent class (-D, e.g. Person).",
        "reference": "Guarino & Welty (2002) OntoClean",
        "url": "http://www.loa.istc.cnr.it/wp-content/uploads/2020/03/OverviewOntoClean-compresso.pdf",
    },

    # ── OntoUML / Guizzardi anti-patterns ────────────────────────────────
    # Catalogue: https://ontouml.readthedocs.io/en/latest/anti-patterns/
    "heterogeneous-collection": {
        "name": "Heterogeneous Collection (HetColl)",
        "severity": "warning",
        "description": "A collection-typed class has member-types that share no common identity criterion.",
        "reference": "Sales & Guizzardi (OntoUML AP catalog)",
        "url": "https://ontouml.readthedocs.io/en/latest/anti-patterns/",
    },
    "imprecise-abstraction": {
        "name": "Imprecise Abstraction (ImpAbs)",
        "severity": "warning",
        "description": "A relation endpoint with multiplicity ≥ 2 connects to a class with 2+ subtypes, leaving specificity ambiguous.",
        "reference": "Sales & Guizzardi (OntoUML AP catalog)",
        "url": "https://ontouml.readthedocs.io/en/latest/anti-patterns/ImpAbs/index.html",
    },
    "relator-composition": {
        "name": "Relator Composition (RelComp)",
        "severity": "warning",
        "description": "Two associations connect such that one's target equals or super-types both ends of the other, creating unintended cross-constraints.",
        "reference": "Sales & Guizzardi (OntoUML AP catalog)",
        "url": "https://ontouml.readthedocs.io/en/latest/anti-patterns/RelComp/index.html",
    },
    "mixed-rigidity": {
        "name": "Mixed Rigidity in Generalization Set (MixRig)",
        "severity": "error",
        "description": "A generalization-set groups subclasses with different rigidity meta-properties under one rigid parent.",
        "reference": "Sales & Guizzardi (OntoUML AP catalog)",
        "url": "https://ontouml.readthedocs.io/en/latest/anti-patterns/",
    },
    "mixed-identity": {
        "name": "Mixed Identity Providers (MixIden)",
        "severity": "error",
        "description": "A class inherits from two parents that each supply different and incompatible identity criteria.",
        "reference": "Sales & Guizzardi (OntoUML AP catalog)",
        "url": "https://ontouml.readthedocs.io/en/latest/anti-patterns/",
    },
    "relation-overloading": {
        "name": "Relation Overloading (RelOver)",
        "severity": "warning",
        "description": "One association encodes two semantically different relations (e.g., worksFor used for employment and ownership).",
        "reference": "Sales & Guizzardi (OntoUML AP catalog)",
        "url": "https://github.com/OntoUML/OntoUML/blob/master/anti-patterns/RelOver/index.rst",
    },
    "redundant-relation": {
        "name": "Redundant / Repeated Relation (RepRel)",
        "severity": "info",
        "description": "Two parallel associations between the same classes encode the same fact under different names.",
        "reference": "Sales & Guizzardi (OntoUML AP catalog)",
        "url": "https://ontouml.readthedocs.io/en/latest/anti-patterns/",
    },
    "part-overloading": {
        "name": "Part Overloading (PartOver)",
        "severity": "warning",
        "description": "A whole-part association models both componenthood and member-of-collection at once.",
        "reference": "Sales & Guizzardi (OntoUML AP catalog)",
        "url": "https://ontouml.readthedocs.io/en/latest/anti-patterns/",
    },
    "free-role": {
        "name": "Role Without Relator (FreeRole)",
        "severity": "warning",
        "description": "A role-typed class exists without the relator (relationship-bearing entity) that should ground it.",
        "reference": "Sales & Guizzardi (OntoUML AP catalog)",
        "url": "https://ontouml.readthedocs.io/en/latest/anti-patterns/",
    },

    # ── SHACL-specific anti-patterns ─────────────────────────────────────
    "deactivated-shape": {
        "name": "Deactivated / Vacuous SHACL Shape",
        "severity": "info",
        "description": "A SHACL shape has sh:deactivated true or contains no constraint components — it passes everything.",
        "reference": "W3C SHACL Recommendation §4.6 / SHACLEval (CEUR Vol-4064)",
        "url": "https://www.w3.org/TR/shacl/#deactivated",
    },
    "shape-without-target": {
        "name": "SHACL Shape Without Target",
        "severity": "warning",
        "description": "A sh:NodeShape defines constraints but has no sh:targetClass / sh:targetNode / sh:targetSubjectsOf; never applied.",
        "reference": "SHACLEval (CEUR Vol-4064)",
        "url": "https://ceur-ws.org/Vol-4064/UKG-paper3.pdf",
    },
    "conflicting-cardinality": {
        "name": "Conflicting Min/Max Cardinality",
        "severity": "error",
        "description": "A property shape declares sh:minCount n and sh:maxCount m with n > m; conformance impossible.",
        "reference": "SHACL2FOL static analysis (arXiv 2406.08018)",
        "url": "https://arxiv.org/abs/2406.08018",
    },
    "shape-ontology-divergence": {
        "name": "Shape / Ontology Divergence",
        "severity": "warning",
        "description": "A SHACL constraint contradicts the underlying OWL axioms (e.g. sh:datatype xsd:integer but ontology range is xsd:string).",
        "reference": "Acosta et al. (PVLDB 2024)",
        "url": "https://www.vldb.org/pvldb/vol17/p3589-acosta.pdf",
    },
    "unused-class-with-shape": {
        "name": "Shape for Empty Class",
        "severity": "info",
        "description": "A class has a SHACL shape but no instances anywhere in the dataset — wasted constraint maintenance.",
        "reference": "Structural Quality Metrics (SWJ)",
        "url": "https://www.semantic-web-journal.net/content/structural-quality-metrics-evaluate-knowledge-graph-quality",
    },

    # ── Corcho & Roussey 2009 — inheritance variants of OIL ──────────────
    # Paper: "Catalogue of Anti-Patterns for Formal Ontology Debugging" IC 2009
    # https://liris.cnrs.fr/Documents/Liris-4441.pdf
    "onlyness-is-loneliness-with-inheritance": {
        "name": "OnlynessIsLoneliness with Inheritance (OILWI)",
        "severity": "error",
        "description": "A subclass adds an owl:allValuesFrom restriction that conflicts with one already inherited from a superclass on the same property (fillers are disjoint).",
        "reference": "Corcho, Roussey & Vilches-Blázquez (IC 2009)",
        "url": "https://liris.cnrs.fr/Documents/Liris-4441.pdf",
    },
    "onlyness-is-loneliness-with-property-inheritance": {
        "name": "OnlynessIsLoneliness with Property Inheritance (OILWPI)",
        "severity": "error",
        "description": "Two owl:allValuesFrom restrictions on a property and its sub-property point at disjoint fillers — sub-property entails the super-property restriction, so both must hold.",
        "reference": "Corcho, Roussey & Vilches-Blázquez (IC 2009)",
        "url": "https://liris.cnrs.fr/Documents/Liris-4441.pdf",
    },

    # ── Corcho & Roussey 2009 — inheritance variants of UE ───────────────
    "universal-existence-with-inheritance-1": {
        "name": "UniversalExistence with Inheritance 1 (UEWI_1)",
        "severity": "error",
        "description": "Subclass adds someValuesFrom on a property whose parent class has an allValuesFrom restriction with a disjoint filler.",
        "reference": "Corcho, Roussey & Vilches-Blázquez (IC 2009)",
        "url": "https://liris.cnrs.fr/Documents/Liris-4441.pdf",
    },
    "universal-existence-with-inheritance-2": {
        "name": "UniversalExistence with Inheritance 2 (UEWI_2)",
        "severity": "error",
        "description": "Subclass adds allValuesFrom on a property whose parent class has someValuesFrom with a disjoint filler.",
        "reference": "Corcho, Roussey & Vilches-Blázquez (IC 2009)",
        "url": "https://liris.cnrs.fr/Documents/Liris-4441.pdf",
    },
    "universal-existence-with-property-inheritance": {
        "name": "UniversalExistence with Property Inheritance (UEWPI)",
        "severity": "error",
        "description": "An existential restriction on a sub-property conflicts with a universal restriction on the super-property (disjoint fillers).",
        "reference": "Corcho, Roussey & Vilches-Blázquez (IC 2009)",
        "url": "https://liris.cnrs.fr/Documents/Liris-4441.pdf",
    },
    "universal-existence-with-inverse-property": {
        "name": "UniversalExistence with Inverse Property (UEWIP)",
        "severity": "error",
        "description": "Restrictions on a property and on its inverse interact to force a disjoint filler.",
        "reference": "Corcho, Roussey & Vilches-Blázquez (IC 2009)",
        "url": "https://liris.cnrs.fr/Documents/Liris-4441.pdf",
    },

    # ── Corcho & Roussey 2009 — SumOfSom family ──────────────────────────
    "sum-of-some": {
        "name": "SumOfSom (SOS)",
        "severity": "warning",
        "description": "Two someValuesFrom restrictions on the same property with disjoint fillers — the class is forced to point to two disjoint things via one property.",
        "reference": "Corcho, Roussey & Vilches-Blázquez (IC 2009)",
        "url": "https://liris.cnrs.fr/Documents/Liris-4441.pdf",
    },
    "sum-of-some-with-inheritance": {
        "name": "SumOfSom with Inheritance (SOSWI)",
        "severity": "warning",
        "description": "Subclass adds a someValuesFrom restriction with a filler disjoint from the parent class's someValuesFrom filler on the same property.",
        "reference": "Corcho, Roussey & Vilches-Blázquez (IC 2009)",
        "url": "https://liris.cnrs.fr/Documents/Liris-4441.pdf",
    },
    "sum-of-some-with-property-inheritance": {
        "name": "SumOfSom with Property Inheritance (SOSWPI)",
        "severity": "warning",
        "description": "An existential restriction on a sub-property whose filler is disjoint from an existential restriction on the super-property — the sub-property restriction implies the super.",
        "reference": "Corcho, Roussey & Vilches-Blázquez (IC 2009)",
        "url": "https://liris.cnrs.fr/Documents/Liris-4441.pdf",
    },
    "sum-of-some-with-inverse-property": {
        "name": "SumOfSom with Inverse Property (SOSWIP)",
        "severity": "warning",
        "description": "Existential restrictions on a property and its inverse force the class to point at disjoint fillers.",
        "reference": "Corcho, Roussey & Vilches-Blázquez (IC 2009)",
        "url": "https://liris.cnrs.fr/Documents/Liris-4441.pdf",
    },
    "sum-of-some-is-never-equal-to-one": {
        "name": "SumOfSom Is Never Equal To One (SOSINETO)",
        "severity": "error",
        "description": "Two someValuesFrom restrictions with disjoint fillers combined with sh:maxCount 1 (or owl:maxCardinality 1) on the same property — unsatisfiable.",
        "reference": "Corcho, Roussey & Vilches-Blázquez (IC 2009)",
        "url": "https://liris.cnrs.fr/Documents/Liris-4441.pdf",
    },

    # ── Corcho & Roussey 2009 — cardinality / annotation misuses ─────────
    "some-means-at-least-one": {
        "name": "Some Means At Least One (SMALO)",
        "severity": "info",
        "description": "Redundant owl:minCardinality ≥ 1 next to an owl:someValuesFrom on the same property — the existential restriction already entails minimum 1.",
        "reference": "Corcho, Roussey & Vilches-Blázquez (IC 2009)",
        "url": "https://liris.cnrs.fr/Documents/Liris-4441.pdf",
    },
    "synonym-of-equivalence": {
        "name": "Synonym Of Equivalence (SOE)",
        "severity": "warning",
        "description": "Two named classes are declared owl:equivalentClass to each other inside a single ontology — usually meant as a lexical synonym, not class equivalence.",
        "reference": "Corcho, Roussey & Vilches-Blázquez (IC 2009)",
        "url": "https://liris.cnrs.fr/Documents/Liris-4441.pdf",
    },
    "disjointness-of-complement": {
        "name": "Disjointness via Complement (DOC)",
        "severity": "info",
        "description": "A class is asserted equivalent to owl:complementOf another class — prefer the simpler owl:disjointWith axiom.",
        "reference": "Corcho, Roussey & Vilches-Blázquez (IC 2009)",
        "url": "https://liris.cnrs.fr/Documents/Liris-4441.pdf",
    },
    "domain-cardinality-constraints": {
        "name": "Domain & Cardinality Constraints (DCC)",
        "severity": "info",
        "description": "A class combines an existential restriction with a cardinality bound > 1 on the same property — the modeller likely meant a universal restriction with that cardinality.",
        "reference": "Corcho, Roussey & Vilches-Blázquez (IC 2009)",
        "url": "https://liris.cnrs.fr/Documents/Liris-4441.pdf",
    },
    "group-axioms": {
        "name": "Group Axioms (GA)",
        "severity": "info",
        "description": "A class has several separate restrictions on the same property that could be grouped into a single combined restriction for readability.",
        "reference": "Corcho, Roussey & Vilches-Blázquez (IC 2009)",
        "url": "https://liris.cnrs.fr/Documents/Liris-4441.pdf",
    },
    "min-is-zero": {
        "name": "Min Is Zero (MIZ)",
        "severity": "info",
        "description": "An owl:minCardinality 0 or sh:minCount 0 restriction has no logical effect and only adds noise.",
        "reference": "Corcho, Roussey & Vilches-Blázquez (IC 2009)",
        "url": "https://liris.cnrs.fr/Documents/Liris-4441.pdf",
    },

    # ── Enterprise / operational anti-patterns (Palantir Foundry docs) ───
    "golden-hammer": {
        "name": "Golden Hammer",
        "severity": "warning",
        "description": "A single modelling primitive or action type is reused for every problem in the domain instead of selecting the structurally appropriate construct.",
        "reference": "Palantir Foundry — Ontology Best Practices",
        "url": "https://palantir.com/docs/foundry/ontology/ontology-best-practices-and-anti-patterns/",
    },
    "action-sprawl": {
        "name": "Action Sprawl",
        "severity": "warning",
        "description": "Many isolated single-property actions instead of cohesive business operations that bundle related changes — fragments the view of any one entity.",
        "reference": "Palantir Foundry — Ontology Best Practices",
        "url": "https://palantir.com/docs/foundry/ontology/ontology-best-practices-and-anti-patterns/",
    },
    "time-machine": {
        "name": "Time Machine",
        "severity": "warning",
        "description": "Temporal versions or amendments of the same entity are modelled as completely separate objects/types rather than linked history of one entity.",
        "reference": "Palantir Foundry — Ontology Best Practices",
        "url": "https://palantir.com/docs/foundry/ontology/ontology-best-practices-and-anti-patterns/",
    },
    "misnomer": {
        "name": "Misnomer",
        "severity": "info",
        "description": "Vague, generic, or misleading names attached to ontology elements (e.g. `Object1`, `dataField`) — causes semantic drift over time.",
        "reference": "Palantir Foundry — Ontology Best Practices",
        "url": "https://palantir.com/docs/foundry/ontology/ontology-best-practices-and-anti-patterns/",
    },

    # ── OntoUML modal-property anti-patterns (Sales & Guizzardi) ─────────
    "pseudo-anti-rigid": {
        "name": "Pseudo-Anti-Rigid",
        "severity": "error",
        "description": "A class is stereotyped anti-rigid (e.g. «role», «phase») but other constraints force every instance to instantiate it in every possible world, making it effectively rigid.",
        "reference": "Sales & Guizzardi — Identification of Semantic Anti-Patterns (2012)",
        "url": "https://nemo.inf.ufes.br/wp-content/papercite-data/pdf/identification_of_semantic_anti_patterns_in_ontology_driven_conceptual_modeling_via_visual_simulation_2012.pdf",
    },
    "generalization-set-rigidity": {
        "name": "Generalization-Set Rigidity Mismatch (GSRig)",
        "severity": "error",
        "description": "A generalisation set contains subclasses with inconsistent rigidity meta-properties (some rigid, some anti-rigid) under a single common parent.",
        "reference": "Sales & Guizzardi (OntoUML AP catalogue)",
        "url": "https://ontouml.readthedocs.io/en/latest/anti-patterns/",
    },
    "non-sortal-identity": {
        "name": "Non-Sortal Identity (NSIden)",
        "severity": "warning",
        "description": "A non-sortal class (mixin, category, role-mixin) is treated as if it supplied an identity criterion to its instances — only sortal-kinds may supply identity in UFO.",
        "reference": "Sales & Guizzardi (OntoUML AP catalogue)",
        "url": "https://ontouml.readthedocs.io/en/latest/anti-patterns/",
    },
}


def _detect_smells(
    g: Graph, nodes: Dict, edges: List, classes: Set[str],
    shacl_data: List, namespaces: Dict[str, str], shape_graph: Optional[Graph] = None
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

    # ── New detectors (OOPS + Roussey + SHACL) ────────────────────────────

    # 20. "is" used as a property name (OOPS P03)
    bad_is = []
    for p in all_props:
        local = p.split("#")[-1].split("/")[-1].lower()
        if local in ("is", "is_a", "isa"):
            bad_is.append({"iri": p, "label": label(p)})
    if bad_is:
        findings.append({
            **SMELL_CATALOG["is-relationship"],
            "id": "is-relationship",
            "entities": bad_is[:10],
            "suggestion": "Use rdfs:subClassOf, rdf:type, or owl:sameAs instead of a custom 'is' property.",
        })

    # 21. Property declared inverse of itself (OOPS P25)
    inverse_self = []
    for s, _, o in g.triples((None, OWL.inverseOf, None)):
        if isinstance(s, URIRef) and isinstance(o, URIRef) and str(s) == str(o):
            inverse_self.append({"iri": str(s), "label": label(str(s))})
    if inverse_self:
        findings.append({
            **SMELL_CATALOG["inverse-of-self"],
            "id": "inverse-of-self",
            "entities": inverse_self[:10],
            "suggestion": "Declare the property owl:SymmetricProperty instead of owl:inverseOf itself.",
        })

    # 22. Untyped Class — IRI used as rdfs:domain / range / oneOf but never explicitly declared (OOPS P34).
    # Note: the parser's `classes` set is permissive (it includes anything ever used as an rdf:type
    # object). For this detector we need the STRICT declared set: only IRIs with an explicit
    # `a owl:Class` (or rdfs:Class) declaration.
    strict_declared = set()
    for s, _, o in g.triples((None, RDF.type, OWL.Class)):
        if isinstance(s, URIRef): strict_declared.add(str(s))
    for s, _, o in g.triples((None, RDF.type, RDFS.Class)):
        if isinstance(s, URIRef): strict_declared.add(str(s))
    used_as_class = set()
    for _, _, o in g.triples((None, RDF.type, None)):
        if isinstance(o, URIRef) and not str(o).startswith("http://www.w3.org/"):
            used_as_class.add(str(o))
    for _, _, o in g.triples((None, RDFS.domain, None)):
        if isinstance(o, URIRef) and not str(o).startswith("http://www.w3.org/"):
            used_as_class.add(str(o))
    for _, _, o in g.triples((None, RDFS.range, None)):
        if isinstance(o, URIRef) and not str(o).startswith("http://www.w3.org/"):
            used_as_class.add(str(o))
    untyped_cls = sorted(used_as_class - strict_declared)
    if untyped_cls:
        findings.append({
            **SMELL_CATALOG["untyped-class"],
            "id": "untyped-class",
            "entities": [{"iri": c, "label": label(c)} for c in untyped_cls[:10]],
            "suggestion": "Add an explicit `a owl:Class .` declaration for each class.",
        })

    # 23. Untyped Property — used as predicate but never declared (OOPS P35)
    declared_props = all_props
    used_as_pred = set()
    for _, p, _ in g:
        ps = str(p)
        if ps.startswith("http://www.w3.org/"):
            continue
        used_as_pred.add(ps)
    untyped_props = sorted(used_as_pred - declared_props)
    if untyped_props:
        findings.append({
            **SMELL_CATALOG["untyped-property"],
            "id": "untyped-property",
            "entities": [{"iri": p, "label": label(p)} for p in untyped_props[:10]],
            "suggestion": "Add `a owl:ObjectProperty` or `a owl:DatatypeProperty` to each predicate.",
        })

    # 24. Ontology metadata: no owl:Ontology declaration, .owl/.ttl extension, no license
    onto_iris = list(g.subjects(RDF.type, OWL.Ontology))
    if not onto_iris:
        findings.append({
            **SMELL_CATALOG["no-ontology-declaration"],
            "id": "no-ontology-declaration",
            "entities": [],
            "suggestion": "Add a triple `<ontology-IRI> a owl:Ontology .` with version, creator, license metadata.",
        })
    bad_ext = []
    for o in onto_iris:
        s = str(o)
        if s.endswith((".owl", ".rdf", ".ttl", ".jsonld", ".n3")):
            bad_ext.append({"iri": s, "label": label(s)})
    if bad_ext:
        findings.append({
            **SMELL_CATALOG["extension-in-uri"],
            "id": "extension-in-uri",
            "entities": bad_ext,
            "suggestion": "Mint a serialization-agnostic ontology IRI (no file extension).",
        })
    # No license
    has_license = False
    license_preds = [
        URIRef("http://purl.org/dc/terms/license"),
        URIRef("http://creativecommons.org/ns#license"),
        URIRef("http://www.w3.org/1999/xhtml/vocab#license"),
    ]
    for lp in license_preds:
        if list(g.triples((None, lp, None))):
            has_license = True; break
    if onto_iris and not has_license:
        findings.append({
            **SMELL_CATALOG["no-license"],
            "id": "no-license",
            "entities": [{"iri": str(onto_iris[0]), "label": label(str(onto_iris[0]))}],
            "suggestion": "Add `dcterms:license <license-iri> .` to the ontology declaration.",
        })

    # 25. Namespace hijacking — minting new terms in well-known namespaces
    KNOWN_NS = {
        "http://xmlns.com/foaf/0.1/": "foaf",
        "https://schema.org/": "schema",
        "http://schema.org/": "schema",
        "http://www.w3.org/ns/prov#": "prov",
        "http://www.w3.org/2004/02/skos/core#": "skos",
        "http://purl.org/dc/terms/": "dcterms",
        "http://purl.org/dc/elements/1.1/": "dc",
    }
    hijacked = []
    for s in g.subjects(predicate=None, object=None):
        if not isinstance(s, URIRef):
            continue
        ss = str(s)
        for ns_iri, _ in KNOWN_NS.items():
            if ss.startswith(ns_iri):
                # Defined here? (has any outgoing axiom with rdfs:* / owl:*)
                defined_here = False
                for _, p, _ in g.triples((s, None, None)):
                    if str(p).startswith(("http://www.w3.org/2000/01/rdf-schema#",
                                          "http://www.w3.org/2002/07/owl#")):
                        defined_here = True; break
                if defined_here:
                    hijacked.append({"iri": ss, "label": label(ss)})
                break
    if hijacked:
        findings.append({
            **SMELL_CATALOG["namespace-hijacking"],
            "id": "namespace-hijacking",
            "entities": hijacked[:10],
            "suggestion": "Mint new terms only in namespaces you control; reuse upstream terms by reference.",
        })

    # 26. Multiple rdfs:domain on the same property (OOPS P19)
    domain_per_prop: Dict[str, list] = {}
    for s, _, o in g.triples((None, RDFS.domain, None)):
        if isinstance(s, URIRef) and isinstance(o, URIRef):
            domain_per_prop.setdefault(str(s), []).append(str(o))
    multi_dom = [p for p, doms in domain_per_prop.items() if len(doms) > 1]
    if multi_dom:
        findings.append({
            **SMELL_CATALOG["multiple-domain-range"],
            "id": "multiple-domain-range",
            "entities": [{"iri": p, "label": label(p), "count": len(domain_per_prop[p])} for p in multi_dom[:10]],
            "suggestion": "Use `owl:unionOf` (or a named superclass) rather than two rdfs:domain triples.",
        })

    # 27. Recursive definition — class appears inside its own equivalentClass axiom (OOPS P24).
    # Two forms count:
    #   (a) `:Self owl:equivalentClass :Self`            (degenerate self-equivalence)
    #   (b) `:Self owl:equivalentClass [_:b ...]` where the blank node refers back to :Self
    recursive = []
    for s, _, o in g.triples((None, OWL.equivalentClass, None)):
        if not isinstance(s, URIRef):
            continue
        if isinstance(o, URIRef) and str(o) == str(s):
            recursive.append({"iri": str(s), "label": label(str(s))})
            continue
        # Crawl the blank-node closure to find the IRI string
        seen, stack = set(), [o]
        while stack:
            node = stack.pop()
            if node in seen:
                continue
            seen.add(node)
            for _, _, oo in g.triples((node, None, None)):
                if isinstance(oo, URIRef) and str(oo) == str(s):
                    recursive.append({"iri": str(s), "label": label(str(s))})
                    stack = []  # break out
                    break
                if not isinstance(oo, URIRef):
                    stack.append(oo)
    if recursive:
        findings.append({
            **SMELL_CATALOG["recursive-definition"],
            "id": "recursive-definition",
            "entities": recursive[:10],
            "suggestion": "Define the class in terms of OTHER concepts; remove the self-reference.",
        })

    # 28. Swapped annotations — rdfs:label is long, rdfs:comment is short (OOPS P20)
    swapped = []
    for s in g.subjects(RDFS.label, None):
        if not isinstance(s, URIRef):
            continue
        labels = [str(o) for _, _, o in g.triples((s, RDFS.label, None))]
        comments = [str(o) for _, _, o in g.triples((s, RDFS.comment, None))]
        if not labels or not comments:
            continue
        # Label long, comment short → swap
        if max(len(l) for l in labels) > 80 and min(len(c) for c in comments) < 20:
            swapped.append({"iri": str(s), "label": label(str(s))})
    if swapped:
        findings.append({
            **SMELL_CATALOG["swapped-annotations"],
            "id": "swapped-annotations",
            "entities": swapped[:10],
            "suggestion": "rdfs:label is a short name; rdfs:comment is the long description.",
        })

    # 29. Inconsistent naming conventions (OOPS P22)
    def style_of(name: str) -> str:
        if "_" in name: return "snake_case"
        if "-" in name: return "kebab-case"
        if any(c.isupper() for c in name[1:]):
            return "camelCase" if name[0].islower() else "PascalCase"
        return "lower"
    styles_class, styles_prop = set(), set()
    for c in classes:
        local = c.split("#")[-1].split("/")[-1]
        if local: styles_class.add(style_of(local))
    for p in declared_props:
        local = p.split("#")[-1].split("/")[-1]
        if local: styles_prop.add(style_of(local))
    inconsistent = []
    if len(styles_class) > 1:
        inconsistent.append({"iri": "(classes)", "label": "Classes mix " + ", ".join(sorted(styles_class))})
    if len(styles_prop) > 1:
        inconsistent.append({"iri": "(properties)", "label": "Properties mix " + ", ".join(sorted(styles_prop))})
    if inconsistent:
        findings.append({
            **SMELL_CATALOG["inconsistent-naming"],
            "id": "inconsistent-naming",
            "entities": inconsistent,
            "suggestion": "Settle on PascalCase for classes, camelCase for properties; convert outliers.",
        })

    # 30. Single-property property chain (OOPS P33)
    one_chain = []
    for s, _, list_node in g.triples((None, OWL.propertyChainAxiom, None)):
        # walk the rdf:List, count members
        count, head = 0, list_node
        rdf_first = URIRef("http://www.w3.org/1999/02/22-rdf-syntax-ns#first")
        rdf_rest = URIRef("http://www.w3.org/1999/02/22-rdf-syntax-ns#rest")
        rdf_nil = URIRef("http://www.w3.org/1999/02/22-rdf-syntax-ns#nil")
        while head != rdf_nil:
            firsts = list(g.objects(head, rdf_first))
            rests = list(g.objects(head, rdf_rest))
            if not firsts or not rests:
                break
            count += 1
            head = rests[0]
            if count > 5: break
        if count == 1 and isinstance(s, URIRef):
            one_chain.append({"iri": str(s), "label": label(str(s))})
    if one_chain:
        findings.append({
            **SMELL_CATALOG["one-property-chain"],
            "id": "one-property-chain",
            "entities": one_chain[:10],
            "suggestion": "Replace the single-element propertyChainAxiom with rdfs:subPropertyOf.",
        })

    # 31. Missing disjointness — sibling leaf classes without owl:disjointWith (OOPS P10)
    disjoint_pairs = set()
    for s, _, o in g.triples((None, OWL.disjointWith, None)):
        if isinstance(s, URIRef) and isinstance(o, URIRef):
            disjoint_pairs.add(frozenset([str(s), str(o)]))
    siblings: Dict[str, list] = {}
    for s, _, o in g.triples((None, RDFS.subClassOf, None)):
        if isinstance(s, URIRef) and isinstance(o, URIRef):
            siblings.setdefault(str(o), []).append(str(s))
    missing_dj = []
    for parent, children in siblings.items():
        if len(children) < 2:
            continue
        for i in range(len(children)):
            for j in range(i + 1, len(children)):
                if frozenset([children[i], children[j]]) not in disjoint_pairs:
                    missing_dj.append({"iri": children[i], "label": label(children[i]) + " ↔ " + label(children[j])})
                    break
            if len(missing_dj) >= 5: break
        if len(missing_dj) >= 5: break
    if missing_dj:
        findings.append({
            **SMELL_CATALOG["missing-disjointness"],
            "id": "missing-disjointness",
            "entities": missing_dj[:10],
            "suggestion": "Add owl:disjointWith between siblings that cannot share an instance.",
        })

    # ── SHACL anti-patterns ──────────────────────────────────────────────
    NodeShape = URIRef("http://www.w3.org/ns/shacl#NodeShape")
    targetClass = URIRef("http://www.w3.org/ns/shacl#targetClass")
    targetNode = URIRef("http://www.w3.org/ns/shacl#targetNode")
    targetSubjectsOf = URIRef("http://www.w3.org/ns/shacl#targetSubjectsOf")
    targetObjectsOf = URIRef("http://www.w3.org/ns/shacl#targetObjectsOf")
    deactivated = URIRef("http://www.w3.org/ns/shacl#deactivated")
    sh_property = URIRef("http://www.w3.org/ns/shacl#property")
    sh_minCount = URIRef("http://www.w3.org/ns/shacl#minCount")
    sh_maxCount = URIRef("http://www.w3.org/ns/shacl#maxCount")

    # Prefer the dedicated shape graph (when ontology + shapes were loaded from
    # different files). Fall back to looking for shapes inside the data graph.
    sg = shape_graph if shape_graph is not None else g
    shape_nodes = list(sg.subjects(RDF.type, NodeShape))

    # 32. Deactivated shape
    deact = []
    for sn in shape_nodes:
        for _, _, v in sg.triples((sn, deactivated, None)):
            if str(v).lower() in ("true", "1"):
                deact.append({"iri": str(sn), "label": label(str(sn))})
    if deact:
        findings.append({
            **SMELL_CATALOG["deactivated-shape"],
            "id": "deactivated-shape",
            "entities": deact[:10],
            "suggestion": "Remove sh:deactivated true or delete the shape if it is no longer needed.",
        })

    # 33. Shape without target
    no_target = []
    for sn in shape_nodes:
        targets = (list(sg.triples((sn, targetClass, None))) +
                   list(sg.triples((sn, targetNode, None))) +
                   list(sg.triples((sn, targetSubjectsOf, None))) +
                   list(sg.triples((sn, targetObjectsOf, None))))
        if not targets:
            no_target.append({"iri": str(sn), "label": label(str(sn))})
    if no_target:
        findings.append({
            **SMELL_CATALOG["shape-without-target"],
            "id": "shape-without-target",
            "entities": no_target[:10],
            "suggestion": "Add sh:targetClass / sh:targetNode so the shape is actually applied.",
        })

    # 34. Conflicting cardinality (sh:minCount > sh:maxCount)
    conflicts = []
    for sn in shape_nodes:
        for _, _, prop_node in sg.triples((sn, sh_property, None)):
            mins = [int(str(o)) for _, _, o in sg.triples((prop_node, sh_minCount, None)) if str(o).isdigit()]
            maxs = [int(str(o)) for _, _, o in sg.triples((prop_node, sh_maxCount, None)) if str(o).isdigit()]
            if mins and maxs and min(mins) > max(maxs):
                conflicts.append({"iri": str(sn), "label": label(str(sn)),
                                 "count": f"min={min(mins)} > max={max(maxs)}"})
    if conflicts:
        findings.append({
            **SMELL_CATALOG["conflicting-cardinality"],
            "id": "conflicting-cardinality",
            "entities": conflicts[:10],
            "suggestion": "Fix the cardinality bounds so sh:minCount ≤ sh:maxCount.",
        })

    # 35. Shape for empty class — shape targets a class that has no instances
    unused_shape = []
    for sn in shape_nodes:
        for _, _, cls in sg.triples((sn, targetClass, None)):
            if isinstance(cls, URIRef):
                instances = list(g.subjects(RDF.type, cls))  # instance count from DATA graph
                if not instances:
                    unused_shape.append({"iri": str(sn), "label": label(str(sn)) + " → " + label(str(cls))})
    if unused_shape:
        findings.append({
            **SMELL_CATALOG["unused-class-with-shape"],
            "id": "unused-class-with-shape",
            "entities": unused_shape[:10],
            "suggestion": "Either populate instances of the target class, or remove the orphan shape.",
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
        import os
    except ImportError:
        return {"status": "unknown", "message": "owlready2 not installed"}

    tmpfile_path = None
    try:
        tmpfile_path = _serialize_for_owlready2(g)

        world = owlready2.World()
        onto = world.get_ontology(f"file://{tmpfile_path}").load()

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
        if tmpfile_path:
            try:
                os.unlink(tmpfile_path)
            except OSError:
                pass
