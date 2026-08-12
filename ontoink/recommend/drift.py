"""Shape drift: what the data says today vs. what the committed shapes say.

Runs at build time and answers three questions about an author's shapes file:

``missing``
    Constraints the recommender is confident about that the shapes graph does
    not state — usually a property that became near-universal after the shapes
    were written.

``stale``
    Constraints the shapes graph states that essentially no instance satisfies.
    Either the data moved on or the constraint was always wrong; both are worth
    a human look.

``uncovered_classes``
    Classes with instances (or with axioms) and no ``sh:targetClass`` at all.

The comparison is set-theoretic over the same ``(class, path, kind, value)``
identity tuple the research project's evaluator used, so "did the shapes drift"
is answered by exactly the machinery that answered "did this method match gold".

Stale detection needs instance data to say anything: on an axiom-only ontology
there is nothing to violate, so it reports no stale constraints rather than
guessing.
"""

from __future__ import annotations

from typing import Dict, List, Optional

from rdflib import Graph

from . import covered_classes, induce, load_shape_set
from .profiler import declared_classes, instantiated_classes, profile_class
from .types import Constraint, ConstraintKind

#: Only these kinds are checked for staleness. A datatype or class constraint
#: failing on some instances is ordinary heterogeneity; a cardinality constraint
#: that essentially every instance violates is a real contradiction.
_STALE_KINDS = (ConstraintKind.MIN_COUNT, ConstraintKind.MAX_COUNT)


def _constraint_row(c: Constraint, reason: str) -> dict:
    row = c.to_dict()
    row["reason"] = reason
    return row


def _is_stale(g: Graph, c: Constraint, threshold: float) -> Optional[dict]:
    """Return a finding when ``c`` is violated by more than ``threshold`` of instances."""
    if c.kind not in _STALE_KINDS:
        return None

    profile = profile_class(g, c.target_class)
    population = profile.population
    if not population:
        return None

    stats = profile.property_stats.get(c.path)
    try:
        bound = int(c.value)
    except (TypeError, ValueError):
        return None

    if c.kind is ConstraintKind.MIN_COUNT:
        present = stats["instances_with"] if stats else 0
        violating = population - present if bound >= 1 else 0
    else:  # MAX_COUNT
        if not stats:
            return None
        # Without per-instance counts, the honest signal is "the maximum
        # observed exceeds the bound"; report the share of instances carrying
        # the property as the affected population.
        if stats["max_per_instance"] <= bound:
            return None
        violating = stats["instances_with"]

    rate = violating / population
    if rate <= threshold:
        return None

    row = _constraint_row(c, "stale")
    row["violationRate"] = round(rate, 4)
    row["violating"] = violating
    row["population"] = population
    row["suggestion"] = _relaxation_for(c, stats)
    return row


def _relaxation_for(c: Constraint, stats: Optional[dict]) -> str:
    if c.kind is ConstraintKind.MIN_COUNT:
        return "Relax to sh:minCount 0, or fix the instances that lack this property."
    observed = stats["max_per_instance"] if stats else 0
    return f"Relax to sh:maxCount {observed} - the largest number of values observed."


def check_drift(
    data_graph: Graph,
    shape_graph: Optional[Graph],
    method: str = "auto",
    min_confidence: float = 0.9,
    stale_threshold: float = 0.9,
    max_findings: int = 25,
) -> Dict:
    """Compare induced constraints against an authored shapes graph."""
    recommended = induce(data_graph, method=method, min_confidence=min_confidence)
    authored = load_shape_set(shape_graph) if shape_graph is not None else None

    authored_keys = authored.keys() if authored else set()
    missing = [
        _constraint_row(c, "missing")
        for c in recommended.all_constraints()
        if c.key() not in authored_keys
    ]
    missing.sort(key=lambda r: (-r["confidence"], r["targetClass"], r["path"]))

    stale: List[dict] = []
    if authored is not None and instantiated_classes(data_graph):
        for c in authored.all_constraints():
            finding = _is_stale(data_graph, c, stale_threshold)
            if finding:
                stale.append(finding)
        stale.sort(key=lambda r: -r["violationRate"])

    covered = set(covered_classes(shape_graph))
    candidates = set(instantiated_classes(data_graph)) | set(declared_classes(data_graph))
    uncovered = sorted(candidates - covered)

    return {
        "method": method,
        "missing": missing[:max_findings],
        "stale": stale[:max_findings],
        "uncovered_classes": uncovered[:max_findings],
        "totals": {
            "missing": len(missing),
            "stale": len(stale),
            "uncovered": len(uncovered),
            "authored": len(authored) if authored else 0,
        },
    }


def format_findings(drift: Dict, source: str = "") -> List[str]:
    """Render drift findings as one-line build-log messages.

    Deliberately ASCII-only: these go through the MkDocs logger to whatever
    console the build runs on, and a Windows cp1252 terminal raises
    UnicodeEncodeError on an em dash — turning a helpful warning into a crash.
    """
    where = f" in {source}" if source else ""
    lines = []
    for row in drift.get("missing", []):
        lines.append(
            f"shape drift{where}: {row['targetClass']} - {row['path']} "
            f"sh:{row['kind']} {row['value']} is supported by {row['evidence']} "
            f"but the shapes file does not state it"
        )
    for row in drift.get("stale", []):
        lines.append(
            f"shape drift{where}: {row['targetClass']} - sh:{row['kind']} "
            f"{row['value']} on {row['path']} is violated by "
            f"{row['violating']}/{row['population']} instances. {row['suggestion']}"
        )
    if drift.get("uncovered_classes"):
        n = drift["totals"]["uncovered"]
        sample = ", ".join(drift["uncovered_classes"][:3])
        lines.append(
            f"shape drift{where}: {n} class(es) have no SHACL shape (e.g. {sample})"
        )
    return lines
