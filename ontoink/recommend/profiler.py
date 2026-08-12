"""Per-class data profiling — the shared front end of the data-driven methods.

Given an rdflib graph and a target class, describe how each property is used by
instances of that class. Ported from ``shaperec.core.profiler``.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Dict, List

from rdflib import Graph, Literal, URIRef
from rdflib.namespace import OWL, RDF, RDFS

_XSD_STRING = "http://www.w3.org/2001/XMLSchema#string"

# Namespaces whose classes are never worth profiling as targets: instances of
# owl:Class / rdf:Property etc. are schema, not data.
_META_NS = (
    "http://www.w3.org/2002/07/owl#",
    "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "http://www.w3.org/2000/01/rdf-schema#",
    "http://www.w3.org/ns/shacl#",
)


class ClassProfile:
    """How instances of one class actually use their properties."""

    def __init__(self, target_class: str) -> None:
        self.target_class = target_class
        self.instances: List[str] = []
        self.property_stats: Dict[str, dict] = {}

    @property
    def population(self) -> int:
        return len(self.instances)


def profile_class(g: Graph, target_class: str, max_samples: int = 20) -> ClassProfile:
    cls_ref = URIRef(target_class)
    profile = ClassProfile(target_class)
    profile.instances = [
        str(s) for s in g.subjects(RDF.type, cls_ref) if isinstance(s, URIRef)
    ]

    for inst in profile.instances:
        per_predicate: Dict[str, list] = defaultdict(list)
        for p, o in g.predicate_objects(URIRef(inst)):
            if p == RDF.type:
                continue
            per_predicate[str(p)].append(o)

        for pred, objs in per_predicate.items():
            stats = profile.property_stats.setdefault(pred, {
                "instances_with": 0,
                "total_uses": 0,
                "max_per_instance": 0,
                "datatypes": defaultdict(int),
                "classes": defaultdict(int),
                "literal_samples": [],
                "iri_samples": [],
            })
            stats["instances_with"] += 1
            stats["total_uses"] += len(objs)
            stats["max_per_instance"] = max(stats["max_per_instance"], len(objs))
            for o in objs:
                if isinstance(o, Literal):
                    dt = str(o.datatype) if o.datatype else _XSD_STRING
                    stats["datatypes"][dt] += 1
                    if len(stats["literal_samples"]) < max_samples:
                        stats["literal_samples"].append(str(o))
                elif isinstance(o, URIRef):
                    if len(stats["iri_samples"]) < max_samples:
                        stats["iri_samples"].append(str(o))
                    for ot in g.objects(o, RDF.type):
                        if isinstance(ot, URIRef):
                            stats["classes"][str(ot)] += 1

    for stats in profile.property_stats.values():
        stats["datatypes"] = dict(stats["datatypes"])
        stats["classes"] = dict(stats["classes"])
    return profile


def instantiated_classes(g: Graph) -> List[str]:
    """Classes with at least one ``rdf:type`` instance in the graph."""
    seen = set()
    for _, _, o in g.triples((None, RDF.type, None)):
        if isinstance(o, URIRef) and not str(o).startswith(_META_NS):
            seen.add(str(o))
    return sorted(seen)


def declared_classes(g: Graph) -> List[str]:
    """Classes declared by axiom, whether or not anything instantiates them.

    This is the target set for the axiom-driven method: documentation
    ontologies — ontoink's primary audience — routinely ship zero instance
    data, so a recommender keyed only on instantiated classes would have
    nothing to say about exactly the graphs users most often render.
    """
    seen = set()
    for s in g.subjects(RDF.type, OWL.Class):
        if isinstance(s, URIRef):
            seen.add(str(s))
    for s in g.subjects(RDF.type, RDFS.Class):
        if isinstance(s, URIRef):
            seen.add(str(s))
    for s, _, o in g.triples((None, RDFS.subClassOf, None)):
        if isinstance(s, URIRef):
            seen.add(str(s))
        if isinstance(o, URIRef):
            seen.add(str(o))
    return sorted(c for c in seen if not c.startswith(_META_NS))
