"""Shape induction methods folded in from the shape-recommender benchmark.

Two of the eight benchmarked methods earned their way in:

``baseline``
    Mihindukulasooriya et al. (2018), *RDF Shape Induction Using Knowledge Base
    Profiling*, SAC 2018. Frequency-based profiling of instance data. Best
    F1/complexity ratio in the benchmark (mean F1 0.695 across five datasets,
    ~0.95 on the three clean ones).

``astrea``
    Cimmino, Fernández-Izquierdo & García-Castro (2020), ASTREA. Derives
    constraints purely from OWL axioms, never looking at data. It emits nothing
    on benchmarks whose ontologies carry no restrictions, but produced 39-58
    useful constraints on the real MWO and NFDIcore ontologies — which is the
    case that matters here, because documentation ontologies usually ship
    without instance data.

The other six either under-performed (``a1_reasoner`` over-predicts, precision
~0.25), duplicated the baseline in practice (``a3_llm`` returned byte-identical
output to baseline on both real ontologies, across four providers), or were
never really implemented (``a2_active``, ``a4_counterfactual``, ``a5_path``).
They stay in the research project until that changes.
"""

from __future__ import annotations

from typing import Optional

from rdflib import Graph, URIRef
from rdflib.namespace import OWL, RDF, RDFS

from .profiler import declared_classes, instantiated_classes, profile_class
from .types import Constraint, ConstraintKind, ShapeSet

_XSD = "http://www.w3.org/2001/XMLSchema#"
SH_IRI = "http://www.w3.org/ns/shacl#IRI"


def _is_datatype(iri: str) -> bool:
    return iri.startswith(_XSD)


def induce_baseline(
    g: Graph,
    min_count_threshold: float = 0.9,
    max_samples: int = 20,
    target_classes: Optional[list] = None,
) -> ShapeSet:
    """Frequency-based induction over instance data (Mihindukulasooriya 2018).

    1. Profile every property used by instances of each target class.
    2. Property present on >= ``min_count_threshold`` of instances → ``sh:minCount 1``.
    3. No instance carries more than one value → ``sh:maxCount 1``.
    4. All literal values share one datatype → ``sh:datatype``.
    5. All values are IRIs of one class → ``sh:class`` + ``sh:nodeKind sh:IRI``.
    """
    out = ShapeSet()
    classes = target_classes if target_classes is not None else instantiated_classes(g)

    for cls in classes:
        profile = profile_class(g, cls, max_samples=max_samples)
        n = profile.population
        if not n:
            continue

        for pred, stats in profile.property_stats.items():
            support = stats["instances_with"]
            coverage = support / n

            if coverage >= min_count_threshold:
                out.add(Constraint(
                    target_class=cls, path=pred, kind=ConstraintKind.MIN_COUNT,
                    value="1", confidence=coverage, support=support, population=n,
                    method="baseline",
                    message=f"{support} of {n} instances have this property",
                ))

            if stats["max_per_instance"] <= 1:
                out.add(Constraint(
                    target_class=cls, path=pred, kind=ConstraintKind.MAX_COUNT,
                    value="1", confidence=1.0, support=support, population=n,
                    method="baseline",
                    message="no instance carries more than one value",
                ))

            # Datatype unanimity — literal values only.
            if stats["datatypes"] and not stats["classes"]:
                datatypes = list(stats["datatypes"])
                if len(datatypes) == 1:
                    out.add(Constraint(
                        target_class=cls, path=pred, kind=ConstraintKind.DATATYPE,
                        value=datatypes[0], confidence=1.0,
                        support=support, population=n, method="baseline",
                        message="every observed value carries this datatype",
                    ))

            # Class unanimity — IRI values only.
            if stats["classes"] and not stats["datatypes"]:
                target_types = list(stats["classes"])
                if len(target_types) == 1:
                    out.add(Constraint(
                        target_class=cls, path=pred, kind=ConstraintKind.CLASS,
                        value=target_types[0], confidence=1.0,
                        support=support, population=n, method="baseline",
                        message="every observed value is an instance of this class",
                    ))
                    out.add(Constraint(
                        target_class=cls, path=pred, kind=ConstraintKind.NODE_KIND,
                        value=SH_IRI, confidence=1.0,
                        support=support, population=n, method="baseline",
                    ))
    return out


def induce_astrea(g: Graph, target_classes: Optional[list] = None) -> ShapeSet:
    """Axiom-driven induction (ASTREA-like). Never consults instance data.

    * ``rdfs:domain`` + ``rdfs:range`` → ``sh:class`` / ``sh:datatype``
    * ``owl:FunctionalProperty`` → ``sh:maxCount 1``
    * ``owl:cardinality`` / ``min`` / ``max`` in restrictions → count constraints
    * ``owl:someValuesFrom`` → ``sh:class`` + ``sh:minCount 1``
    * ``owl:allValuesFrom`` → ``sh:class`` / ``sh:datatype``
    """
    out = ShapeSet()
    classes = set(target_classes if target_classes is not None else declared_classes(g))
    functional = {str(s) for s in g.subjects(RDF.type, OWL.FunctionalProperty)}

    # Domain / range pairs. Iterate the properties that DECLARE a domain, not
    # `g.predicates()` — the latter yields properties used in instance data,
    # which is exactly backwards for an axiom-driven method: in an ontology
    # with no individuals a property appears as the SUBJECT of rdfs:domain and
    # never in predicate position, so this branch would find nothing at all in
    # the very case astrea exists to serve.
    for prop in set(g.subjects(RDFS.domain, None)):
        if not isinstance(prop, URIRef):
            continue
        for dom in g.objects(prop, RDFS.domain):
            if not isinstance(dom, URIRef) or str(dom) not in classes:
                continue
            target = str(dom)
            for rng in g.objects(prop, RDFS.range):
                if isinstance(rng, URIRef):
                    kind = (ConstraintKind.DATATYPE if _is_datatype(str(rng))
                            else ConstraintKind.CLASS)
                    out.add(Constraint(
                        target_class=target, path=str(prop), kind=kind,
                        value=str(rng), confidence=1.0, method="astrea",
                        message="rdfs:range axiom",
                    ))
            if str(prop) in functional:
                out.add(Constraint(
                    target_class=target, path=str(prop),
                    kind=ConstraintKind.MAX_COUNT, value="1",
                    confidence=1.0, method="astrea",
                    message="owl:FunctionalProperty axiom",
                ))

    # owl:Restriction nodes hung off subClassOf / equivalentClass.
    for pred in (RDFS.subClassOf, OWL.equivalentClass):
        for s, _, restr in g.triples((None, pred, None)):
            if not isinstance(s, URIRef):
                continue
            if (restr, RDF.type, OWL.Restriction) not in g:
                continue
            on_prop = next(g.objects(restr, OWL.onProperty), None)
            if not isinstance(on_prop, URIRef):
                continue
            target = str(s)

            for v in g.objects(restr, OWL.cardinality):
                for kind in (ConstraintKind.MIN_COUNT, ConstraintKind.MAX_COUNT):
                    out.add(Constraint(
                        target_class=target, path=str(on_prop), kind=kind,
                        value=str(v), confidence=1.0, method="astrea",
                        message="owl:cardinality axiom",
                    ))
            for card_pred, kind in ((OWL.minCardinality, ConstraintKind.MIN_COUNT),
                                    (OWL.maxCardinality, ConstraintKind.MAX_COUNT)):
                for v in g.objects(restr, card_pred):
                    out.add(Constraint(
                        target_class=target, path=str(on_prop), kind=kind,
                        value=str(v), confidence=1.0, method="astrea",
                        message=f"{card_pred.split('#')[-1]} axiom",
                    ))

            for some in g.objects(restr, OWL.someValuesFrom):
                if isinstance(some, URIRef):
                    kind = (ConstraintKind.DATATYPE if _is_datatype(str(some))
                            else ConstraintKind.CLASS)
                    out.add(Constraint(
                        target_class=target, path=str(on_prop), kind=kind,
                        value=str(some), confidence=1.0, method="astrea",
                        message="owl:someValuesFrom axiom",
                    ))
                    out.add(Constraint(
                        target_class=target, path=str(on_prop),
                        kind=ConstraintKind.MIN_COUNT, value="1",
                        confidence=1.0, method="astrea",
                        message="owl:someValuesFrom implies at least one value",
                    ))

            for all_ in g.objects(restr, OWL.allValuesFrom):
                if isinstance(all_, URIRef):
                    kind = (ConstraintKind.DATATYPE if _is_datatype(str(all_))
                            else ConstraintKind.CLASS)
                    out.add(Constraint(
                        target_class=target, path=str(on_prop), kind=kind,
                        value=str(all_), confidence=1.0, method="astrea",
                        message="owl:allValuesFrom axiom",
                    ))
    return out


#: Method name → callable. ``auto`` is handled by :func:`ontoink.recommend.induce`.
METHODS = {
    "baseline": induce_baseline,
    "astrea": induce_astrea,
}

METHOD_DESCRIPTIONS = {
    "baseline": "Frequency profiling of instance data (Mihindukulasooriya et al. 2018)",
    "astrea": "OWL axiom-driven generation, no instance data required (ASTREA-like)",
    "auto": "Axioms first, then instance-data profiling where instances exist",
}
