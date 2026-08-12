"""SHACL shape recommendation for ontoink.

Folded in from the ``shape-recommender`` research project after its benchmark
identified which methods were worth shipping. Depends only on rdflib, which
ontoink already requires — importing this package pulls in nothing new.

Typical use::

    from ontoink import recommend
    payload = recommend.recommend_payload(graph, method="auto")

``payload`` is JSON-serialisable and is what the fence attaches to the page and
what ``POST /recommend-shapes`` returns.
"""

from __future__ import annotations

from typing import Dict, List, Optional

from rdflib import Graph, URIRef
from rdflib.namespace import RDFS

from .methods import METHOD_DESCRIPTIONS, METHODS, induce_astrea, induce_baseline
from .profiler import declared_classes, instantiated_classes
from .types import Constraint, ConstraintKind, Shape, ShapeSet
from .writer import shape_iri, write_node_shape_skeleton, write_shape_set

__all__ = [
    "Constraint", "ConstraintKind", "Shape", "ShapeSet",
    "METHODS", "METHOD_DESCRIPTIONS",
    "induce", "induce_astrea", "induce_baseline",
    "load_shape_set", "recommend_payload", "shape_for_class",
    "shape_iri", "write_node_shape_skeleton", "write_shape_set",
]

SH = "http://www.w3.org/ns/shacl#"


def induce(
    g: Graph,
    method: str = "auto",
    min_confidence: float = 0.0,
    target_classes: Optional[List[str]] = None,
    skip_classes: Optional[List[str]] = None,
) -> ShapeSet:
    """Run shape induction over ``g``.

    ``method`` is ``auto`` (default), ``baseline`` or ``astrea``.

    ``auto`` runs the axiom-driven pass and then the data-driven one, merging
    into a single ShapeSet. That ordering is deliberate: axioms are assertions
    the ontology author made on purpose, so when both passes propose the same
    constraint the axiom-derived one is recorded first and keeps its
    provenance. It also means ``auto`` still produces something useful for the
    documentation ontologies that ship no instance data at all.
    """
    method = (method or "auto").lower()
    skip = set(skip_classes or ())

    if method == "auto":
        out = induce_astrea(g, target_classes=target_classes)
        data_shapes = induce_baseline(g, target_classes=target_classes)
        for c in data_shapes.all_constraints():
            out.add(c)
    elif method in METHODS:
        out = METHODS[method](g, target_classes=target_classes)
    else:
        raise ValueError(
            f"unknown recommendation method {method!r}; "
            f"expected one of: auto, {', '.join(sorted(METHODS))}"
        )

    if skip:
        filtered = ShapeSet(prefixes=dict(out.prefixes))
        for c in out.all_constraints():
            if c.target_class not in skip:
                filtered.add(c)
        out = filtered

    if min_confidence > 0:
        out = out.filter_confidence(min_confidence)

    out.prefixes.update({p: str(ns) for p, ns in g.namespaces() if p})
    return out


def load_shape_set(shape_graph: Graph) -> ShapeSet:
    """Read an existing SHACL graph into the same normalised constraint model.

    Used by the drift check to compare what an author committed against what
    the recommender would propose today. Only ``sh:targetClass``-anchored node
    shapes are read — implicit targets and target SPARQL are out of scope for a
    set-difference comparison.
    """
    out = ShapeSet()
    sh_target = URIRef(SH + "targetClass")
    sh_property = URIRef(SH + "property")
    sh_path = URIRef(SH + "path")

    kinds = {URIRef(SH + k.value): k for k in ConstraintKind}

    for prefix, ns in shape_graph.namespaces():
        if prefix:
            out.prefixes[prefix] = str(ns)

    for shape_node, _, target in shape_graph.triples((None, sh_target, None)):
        target_class = str(target)
        for _, _, prop_node in shape_graph.triples((shape_node, sh_property, None)):
            path_term = next(shape_graph.objects(prop_node, sh_path), None)
            if path_term is None:
                continue
            for pred, kind in kinds.items():
                for value in shape_graph.objects(prop_node, pred):
                    out.add(Constraint(
                        target_class=target_class, path=str(path_term),
                        kind=kind, value=str(value), method="authored",
                    ))
    return out


def covered_classes(shape_graph: Optional[Graph]) -> List[str]:
    """Target classes an existing shapes graph already covers."""
    if shape_graph is None:
        return []
    sh_target = URIRef(SH + "targetClass")
    return sorted({str(o) for _, _, o in shape_graph.triples((None, sh_target, None))})


def shape_for_class(g: Graph, class_iri: str, method: str = "auto") -> str:
    """Turtle scaffold for one class — the OntoSniff copy button and context menu."""
    shapes = induce(g, method=method, target_classes=[class_iri])
    shape = shapes.shapes.get(class_iri)
    return write_node_shape_skeleton(class_iri, shape.constraints if shape else [])


def _label_for(g: Graph, iri: str) -> str:
    label = g.value(URIRef(iri), RDFS.label)
    if label:
        return str(label)
    for sep in ("#", "/"):
        if sep in iri:
            tail = iri.rpartition(sep)[2]
            if tail:
                return tail
    return iri


def recommend_payload(
    g: Graph,
    method: str = "auto",
    min_confidence: float = 0.0,
    shape_graph: Optional[Graph] = None,
    only_uncovered: bool = True,
    max_shapes: int = 50,
) -> Dict:
    """Run induction and package the result for the browser / API.

    ``only_uncovered`` skips classes the author's shapes graph already targets,
    which is almost always what a reader wants: suggestions for the gaps, not a
    second opinion on the shapes they already wrote.
    """
    already = covered_classes(shape_graph)
    shape_set = induce(
        g, method=method, min_confidence=min_confidence,
        skip_classes=already if only_uncovered else None,
    )

    ranked = sorted(
        shape_set.shapes.values(),
        key=lambda s: (-len(s.constraints), s.target_class),
    )
    truncated = len(ranked) > max_shapes
    ranked = ranked[:max_shapes]

    shapes_payload = []
    constraints_payload = []
    for shape in ranked:
        shapes_payload.append({
            "targetClass": shape.target_class,
            "label": _label_for(g, shape.target_class),
            "shapeIri": shape_iri(shape.target_class),
            "constraintCount": len(shape.constraints),
            "turtle": write_node_shape_skeleton(shape.target_class, shape.constraints),
        })
        constraints_payload.extend(c.to_dict() for c in shape.constraints)

    kept = ShapeSet(prefixes=dict(shape_set.prefixes))
    for shape in ranked:
        for c in shape.constraints:
            kept.add(c)

    return {
        "method": method,
        "methodDescription": METHOD_DESCRIPTIONS.get(method, ""),
        "shapes": shapes_payload,
        "constraints": constraints_payload,
        "turtle": write_shape_set(kept),
        "alreadyCovered": already,
        "truncated": truncated,
        "stats": {
            "classesWithInstances": len(instantiated_classes(g)),
            "classesDeclared": len(declared_classes(g)),
            "shapesProposed": len(shapes_payload),
            "constraintsProposed": len(constraints_payload),
        },
    }
