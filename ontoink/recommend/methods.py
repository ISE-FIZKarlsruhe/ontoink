"""Shape induction methods drawn from the shape-recommender benchmark.

The rule for what ships here is that the method must be published and citable.
A recommendation a user cannot trace to a peer-reviewed method is one they
cannot defend, so the reference travels with the method — see METHOD_SPECS,
which is what the panel, the docs and ``GET /recommend-methods`` all read. The
research project alongside this one also holds several unpublished experimental
inducers; none are exposed here, whatever they score.

``baseline``
    Mihindukulasooriya et al. (2018), *RDF Shape Induction Using Knowledge Base
    Profiling*, SAC 2018. Frequency-based profiling of instance data. Best
    F1-to-complexity ratio of the methods benchmarked (mean F1 0.87 over six
    datasets).

``astrea``
    Cimmino, Fernández-Izquierdo & García-Castro (2020), ASTREA, ESWC 2020.
    Derives constraints purely from OWL axioms, never looking at data. It scores
    near zero on the benchmark, which measures the wrong case for it: half those
    datasets ship no ontology at all. On the real MWO and NFDIcore ontologies —
    restrictions, no individuals — it produces 39-58 useful constraints where
    baseline produces none, and that is the state documentation ontologies are
    usually in.

``shexer``
    Fernández-Álvarez, Labra-Gayo & Gayo-Avello (2022), *Automatic extraction of
    shapes using sheXer*, Knowledge-Based Systems 238. Best mean F1 of the three
    (0.90), almost all of the margin coming from real, messy Wikidata where its
    sh:pattern and length constraints recover structure a frequency counter
    cannot express. Unlike the other two this is not a reimplementation — it
    drives the authors' own library, because a reimplementation by someone else
    is not the same method. That makes it the only optional dependency here.
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


def shexer_available() -> bool:
    """Is the sheXer library importable?"""
    import importlib.util

    return importlib.util.find_spec("shexer") is not None


def induce_shexer(
    g: Graph,
    acceptance_threshold: float = 0.0,
    instances_cap: int = -1,
    detect_minimal_iri: bool = True,
    infer_numeric_types: bool = True,
    target_classes: Optional[list] = None,
) -> ShapeSet:
    """Run the sheXer library and project its SHACL output into our model.

    This drives the authors' own implementation rather than reimplementing the
    algorithm — a reimplementation by someone else is not the same method, and
    for a tool that cites its sources that distinction matters.

    sheXer's SHACL serialiser has three quirks that have to be normalised or
    the output cannot be compared with anything. Each is a serialisation
    detail, not a change to what sheXer inferred:

    * it writes ``sh:dataType`` (capital T), which is not the SHACL term;
    * it expresses an object-property range as ``sh:node <OtherShape>`` rather
      than ``sh:class <OtherClass>``, so the referenced shape's
      ``sh:targetClass`` has to be dereferenced;
    * it emits a property shape for ``rdf:type`` itself, which is structural
      rather than a constraint anyone authors.

    Raises ImportError when the library is absent; callers degrade to a
    different method rather than failing the build.
    """
    from shexer.consts import SHACL_TURTLE
    from shexer.shaper import Shaper

    namespaces = {str(ns): prefix for prefix, ns in g.namespaces()}
    # sheXer's two targeting modes are mutually exclusive: `all_classes_mode`
    # shapes everything it finds, and it must be off for `target_classes` to be
    # honoured. Deriving it from the caller's intent rather than exposing it as
    # a checkbox means the two can never be set to contradict each other.
    shaper = Shaper(
        rdflib_graph=g,
        all_classes_mode=target_classes is None,
        target_classes=list(target_classes) if target_classes else None,
        namespaces_dict=namespaces,
        disable_comments=True,
        detect_minimal_iri=detect_minimal_iri,
        infer_numeric_types_for_untyped_literals=infer_numeric_types,
        instances_cap=instances_cap,
    )
    shacl_text = shaper.shex_graph(
        string_output=True, output_format=SHACL_TURTLE,
        acceptance_threshold=acceptance_threshold,
    )
    return _shexer_shacl_to_shape_set(shacl_text, target_classes)


def _shexer_shacl_to_shape_set(shacl_text: str, target_classes=None) -> ShapeSet:
    from rdflib.namespace import SH

    sh_datatype_typo = URIRef("http://www.w3.org/ns/shacl#dataType")
    parsed = Graph()
    parsed.parse(data=shacl_text, format="turtle")

    shape_target = {
        node: str(target)
        for node, _, target in parsed.triples((None, SH.targetClass, None))
        if isinstance(node, URIRef) and isinstance(target, URIRef)
    }
    wanted = set(target_classes) if target_classes else None

    out = ShapeSet()
    for shape_node, target_class in shape_target.items():
        if wanted is not None and target_class not in wanted:
            continue
        for _, _, prop in parsed.triples((shape_node, SH.property, None)):
            path = next(parsed.objects(prop, SH.path), None)
            if not isinstance(path, URIRef) or path == RDF.type:
                continue

            def emit(kind, value, message="sheXer"):
                out.add(Constraint(
                    target_class=target_class, path=str(path), kind=kind,
                    value=str(value), confidence=1.0, method="shexer",
                    message=message,
                ))

            for v in parsed.objects(prop, SH.minCount):
                emit(ConstraintKind.MIN_COUNT, v)
            for v in parsed.objects(prop, SH.maxCount):
                emit(ConstraintKind.MAX_COUNT, v)
            for pred in (SH.datatype, sh_datatype_typo):
                for v in parsed.objects(prop, pred):
                    emit(ConstraintKind.DATATYPE, v)
            for v in parsed.objects(prop, SH["class"]):
                emit(ConstraintKind.CLASS, v)
                emit(ConstraintKind.NODE_KIND, SH_IRI)
            for v in parsed.objects(prop, SH.node):
                resolved = shape_target.get(v)
                if resolved:
                    emit(ConstraintKind.CLASS, resolved, "sheXer sh:node")
                    emit(ConstraintKind.NODE_KIND, SH_IRI, "sheXer sh:node")
            for v in parsed.objects(prop, SH.nodeKind):
                emit(ConstraintKind.NODE_KIND, v)
            for v in parsed.objects(prop, SH.pattern):
                emit(ConstraintKind.PATTERN, v)
            for v in parsed.objects(prop, SH.minLength):
                emit(ConstraintKind.MIN_LENGTH, v)
            for v in parsed.objects(prop, SH.maxLength):
                emit(ConstraintKind.MAX_LENGTH, v)
    return out


#: Method name → callable. ``auto`` is handled by :func:`ontoink.recommend.induce`.
METHODS = {
    "baseline": induce_baseline,
    "astrea": induce_astrea,
    "shexer": induce_shexer,
}

#: Everything a UI needs to offer a method and its knobs, and everything a
#: reader needs to know whose algorithm they are running.
#:
#: Only methods with a published, citable reference are shipped. The research
#: project alongside this one also contains six unpublished experimental
#: methods (a1-a6); they are deliberately not exposed here, because a
#: recommendation a user cannot trace to a peer-reviewed method is a
#: recommendation they cannot defend.
METHOD_SPECS = {
    "auto": {
        "label": "Auto — axioms, then data",
        "summary": "Runs astrea and baseline and merges them, recording which "
                   "method proposed each constraint.",
        "reference": None,
        "needs": "either",
        "params": [],
    },
    "baseline": {
        "label": "Baseline — frequency profiling",
        "summary": "Profiles how instances actually use each property. Best "
                   "F1-to-complexity ratio of the methods benchmarked.",
        "reference": {
            "citation": "Mihindukulasooriya, N., Rashid, M. R. A., Rizzo, G., "
                        "García-Castro, R., Corcho, O., & Torchiano, M. (2018). "
                        "RDF Shape Induction Using Knowledge Base Profiling. "
                        "SAC 2018.",
            "doi": "10.1145/3167132.3167341",
        },
        "needs": "instances",
        # `induce_baseline` also takes `max_samples`, and it is deliberately not
        # listed here. It caps the sample values the profiler retains, which
        # nothing in this method reads — datatype and class inference run off
        # the full frequency counts. It changes no output, in this port or in
        # the reference implementation, so offering it as a control would put a
        # slider on the panel that does nothing.
        "params": [
            {"name": "min_count_threshold", "type": "float", "default": 0.9,
             "min": 0.0, "max": 1.0, "step": 0.05,
             "label": "Required coverage",
             "doc": "Emit sh:minCount 1 when at least this fraction of a "
                    "class's instances carry the property. Lower proposes "
                    "more and is wrong more often."},
        ],
    },
    "astrea": {
        "label": "Astrea — OWL axiom-driven",
        "summary": "Derives constraints from the T-Box alone, so it works on "
                   "an ontology that ships no individuals at all.",
        "reference": {
            "citation": "Cimmino, A., Fernández-Izquierdo, A., & García-Castro, R. "
                        "(2020). Astrea: Automatic Generation of SHACL Shapes "
                        "from Ontologies. ESWC 2020.",
            "doi": "10.1007/978-3-030-49461-2_29",
        },
        "needs": "axioms",
        "params": [],
    },
    "shexer": {
        "label": "sheXer — original implementation",
        "summary": "Runs the sheXer library itself and projects its SHACL "
                   "output. Contributes sh:pattern and length constraints the "
                   "other methods do not derive.",
        "reference": {
            "citation": "Fernández-Álvarez, D., Labra-Gayo, J. E., & "
                        "Gayo-Avello, D. (2022). Automatic extraction of "
                        "shapes using sheXer. Knowledge-Based Systems, 238, "
                        "107975.",
            "doi": "10.1016/j.knosys.2021.107975",
            "software": "https://github.com/DaniFdezAlvarez/shexer",
        },
        "needs": "instances",
        "extra": "shexer",
        "params": [
            {"name": "acceptance_threshold", "type": "float", "default": 0.0,
             "min": 0.0, "max": 1.0, "step": 0.05,
             "label": "Acceptance threshold",
             "doc": "sheXer keeps a constraint when its observed conformance "
                    "is at least this. 0 keeps everything it inferred."},
            {"name": "instances_cap", "type": "int", "default": -1,
             "min": -1, "max": 100000, "step": 100,
             "label": "Instances examined per class",
             "doc": "Stop after this many instances of a class. -1 examines "
                    "every one; a cap trades fidelity for speed on graphs too "
                    "large to profile whole."},
            {"name": "detect_minimal_iri", "type": "bool", "default": True,
             "label": "Detect minimal IRI",
             "doc": "Let sheXer shorten IRIs against the declared prefixes."},
            {"name": "infer_numeric_types", "type": "bool", "default": True,
             "label": "Infer numeric datatypes",
             "doc": "Type untyped literals that look numeric."},
        ],
    },
}

METHOD_DESCRIPTIONS = {name: spec["summary"] for name, spec in METHOD_SPECS.items()}


def method_catalogue() -> list:
    """The method list a UI renders, with availability resolved."""
    out = []
    for name, spec in METHOD_SPECS.items():
        entry = {"name": name, **{k: v for k, v in spec.items() if k != "extra"}}
        entry["available"] = shexer_available() if name == "shexer" else True
        if name == "shexer" and not entry["available"]:
            entry["unavailable_reason"] = (
                "sheXer is not installed — pip install 'ontoink[shexer]'"
            )
        out.append(entry)
    return out


def coerce_params(method: str, params: Optional[dict]) -> dict:
    """Validate and type-coerce user-supplied hyperparameters.

    Unknown keys are dropped rather than passed through: they would reach a
    method as an unexpected keyword and turn a typo in a YAML file into a
    build error.
    """
    spec = METHOD_SPECS.get(method, {})
    declared = {p["name"]: p for p in spec.get("params", [])}
    out = {}
    for key, value in (params or {}).items():
        meta = declared.get(key)
        if meta is None:
            continue
        try:
            if meta["type"] == "float":
                value = float(value)
            elif meta["type"] == "int":
                value = int(value)
            elif meta["type"] == "bool":
                value = (value if isinstance(value, bool)
                         else str(value).strip().lower() in ("1", "true", "yes", "on"))
        except (TypeError, ValueError):
            continue
        if meta["type"] in ("float", "int"):
            if "min" in meta:
                value = max(meta["min"], value)
            if "max" in meta:
                value = min(meta["max"], value)
        out[key] = value
    return out
