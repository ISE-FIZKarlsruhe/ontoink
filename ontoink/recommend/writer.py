"""Turtle serialisation for induced shapes — with the evidence attached.

The research project's writers computed a confidence for every constraint and
then dropped it on the way to Turtle, so a downstream consumer could not tell a
constraint backed by 45 of 45 instances from one backed by 9 of 10. Everything
here exists to stop that: alongside the SHACL, each property shape carries

* ``sh:description`` — a sentence a human can read in Protégé or a diff;
* ``oi:confidence`` / ``oi:support`` / ``oi:population`` — machine-readable;
* ``oi:method`` — which inducer proposed it.

The ``oi:`` terms are ontoink's own annotation properties. They are pure
annotations: a SHACL processor ignores them, so the emitted file is still a
plain, valid shapes graph you can hand to pyshacl unchanged.

Emission is hand-rolled string building rather than an rdflib serializer round
trip, so output is stable across runs and reviews as a readable diff.
"""

from __future__ import annotations

from typing import Dict, Iterable, List

from .types import IRI_KINDS, NUMERIC_KINDS, Constraint, ShapeSet

OI_NS = "https://w3id.org/ontoink/shapes#"
SH_NS = "http://www.w3.org/ns/shacl#"

_DEFAULT_PREFIXES = {
    "sh": SH_NS,
    "xsd": "http://www.w3.org/2001/XMLSchema#",
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
    "oi": OI_NS,
}


def _escape(text: str) -> str:
    return (text.replace("\\", "\\\\").replace('"', '\\"')
                .replace("\n", "\\n").replace("\r", ""))


def _format_value(c: Constraint) -> str:
    if c.kind in IRI_KINDS:
        return f"<{c.value}>"
    if c.kind in NUMERIC_KINDS:
        return c.value
    return f'"{_escape(c.value)}"'


def shape_iri(class_iri: str) -> str:
    """Mint a shape IRI for a target class: ``…/Person`` → ``…/PersonShape``.

    Splitting on the last separator and rejoining is equivalent to plain
    concatenation for every input, but keeps the naming rule in one place to
    change later.

    Known gap: for a class in a namespace the caller does not control, this
    mints a shape IRI inside that namespace (``…/obo/BFO_0000023Shape`` squats
    on OBO). Deriving the base from the document's own ``owl:Ontology``
    subject would fix it, with a config key for graphs that declare none.
    """
    for sep in ("#", "/"):
        if sep in class_iri:
            head, _, local = class_iri.rpartition(sep)
            if local:
                return f"{head}{sep}{local}Shape"
    return class_iri + "Shape"


def _describe(constraints: List[Constraint]) -> str:
    """One sentence covering every constraint emitted for a single path.

    SHACL groups constraints per property shape, so several kinds share one
    blank node and there is no per-kind slot for an annotation. Rather than
    invent nested reification, the description spells out each kind with its own
    evidence, and the numeric annotations below take the conservative value.
    """
    parts = []
    for c in sorted(constraints, key=lambda x: x.kind.value):
        detail = c.evidence()
        parts.append(f"sh:{c.kind.value} {c.value} ({c.method or 'induced'}, {detail})")
    return "Suggested by ontoink — " + "; ".join(parts)


def _used_prefixes(shape_set: ShapeSet) -> Dict[str, str]:
    """Keep only prefixes some emitted IRI actually uses.

    ``Graph.namespaces()`` hands back rdflib's ~30 built-in bindings (brick,
    csvw, dcat, odrl, …) whether or not the document mentions them, and dumping
    all of them above a four-line shape buries it. Everything here is written
    with full IRIs anyway, so the prefix block is documentation — it should name
    what the file is about and nothing else.
    """
    prefixes: Dict[str, str] = dict(_DEFAULT_PREFIXES)
    iris = set()
    for cls, shape in shape_set.shapes.items():
        iris.add(cls)
        for c in shape.constraints:
            iris.add(c.path)
            if c.kind in IRI_KINDS:
                iris.add(c.value)

    for prefix, ns in shape_set.prefixes.items():
        if not prefix or prefix in prefixes:
            continue
        if any(iri.startswith(ns) for iri in iris):
            prefixes[prefix] = ns
    return prefixes


def write_shape_set(shape_set: ShapeSet, include_evidence: bool = True) -> str:
    """Serialise a ShapeSet to Turtle text."""
    prefixes = _used_prefixes(shape_set)

    lines: List[str] = [f"@prefix {p}: <{ns}> ." for p, ns in sorted(prefixes.items())]
    lines.append("")

    if include_evidence:
        lines += [
            "# Confidence annotations are ontoink's own (oi:) and are ignored by",
            "# SHACL processors — this file validates as-is with pyshacl.",
            "",
        ]

    for cls in sorted(shape_set.shapes):
        shape = shape_set.shapes[cls]
        if not shape.constraints:
            continue
        lines.append(f"<{shape_iri(cls)}> a sh:NodeShape ;")
        lines.append(f"    sh:targetClass <{cls}> ;")

        blocks: List[str] = []
        for path, constraints in shape.by_path().items():
            block = [f"        sh:path <{path}>"]
            for c in sorted(constraints, key=lambda x: x.kind.value):
                block.append(f"        sh:{c.kind.value} {_format_value(c)}")
            if include_evidence:
                worst = min(constraints, key=lambda x: x.confidence)
                best_support = max(c.support for c in constraints)
                population = max(c.population for c in constraints)
                methods = sorted({c.method for c in constraints if c.method})
                block.append(f'        sh:description "{_escape(_describe(constraints))}"')
                block.append(f"        oi:confidence {worst.confidence:.4f}")
                if population:
                    block.append(f"        oi:support {best_support}")
                    block.append(f"        oi:population {population}")
                if methods:
                    block.append(f'        oi:method "{_escape(",".join(methods))}"')
            blocks.append("    sh:property [\n" + " ;\n".join(block) + "\n    ]")

        lines.append(" ;\n".join(blocks) + " .")
        lines.append("")

    return "\n".join(lines)


def write_node_shape_skeleton(class_iri: str, constraints: Iterable[Constraint]) -> str:
    """Serialise a single class's shape — the copy-paste scaffold for OntoSniff.

    Deliberately terse: no prefix block, no evidence annotations. It is meant to
    be pasted into a shapes file the author already has open, where a second
    ``@prefix`` header would be noise and a wall of provenance comments would
    bury the four lines they actually asked for.
    """
    constraints = list(constraints)
    lines = [f"<{shape_iri(class_iri)}> a sh:NodeShape ;", f"    sh:targetClass <{class_iri}> ;"]

    if not constraints:
        # An honest empty scaffold beats inventing constraints: the class has no
        # axioms to derive anything from, and the author knows their data.
        lines.append("    # No axioms to derive constraints from — add sh:property blocks here.")
        lines[-2] = f"    sh:targetClass <{class_iri}> ."
        return "\n".join(lines)

    by_path: Dict[str, List[Constraint]] = {}
    for c in constraints:
        by_path.setdefault(c.path, []).append(c)

    blocks = []
    for path, cs in by_path.items():
        block = [f"        sh:path <{path}>"]
        for c in sorted(cs, key=lambda x: x.kind.value):
            block.append(f"        sh:{c.kind.value} {_format_value(c)}")
        blocks.append("    sh:property [\n" + " ;\n".join(block) + "\n    ]")
    lines.append(" ;\n".join(blocks) + " .")
    return "\n".join(lines)
