"""Normalised constraint model shared by every induction method.

Ported from the ``shape-recommender`` research project (``shaperec.core.types``)
with two additions the research harness did not need: ``method`` provenance, so
a merged result can say which inducer proposed each constraint, and ``support``,
so a UI can show the evidence ("42 of 45 instances") rather than a bare score.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from enum import Enum
from typing import Dict, Iterable, List, Tuple


class ConstraintKind(str, Enum):
    MIN_COUNT = "minCount"
    MAX_COUNT = "maxCount"
    DATATYPE = "datatype"
    CLASS = "class"
    NODE_KIND = "nodeKind"
    PATTERN = "pattern"
    MIN_LENGTH = "minLength"
    MAX_LENGTH = "maxLength"
    MIN_INCLUSIVE = "minInclusive"
    MAX_INCLUSIVE = "maxInclusive"
    HAS_VALUE = "hasValue"
    IN = "in"
    UNIQUE_LANG = "uniqueLang"
    LANGUAGE_IN = "languageIn"


#: Kinds whose value is a plain number in Turtle (no quotes, no angle brackets).
NUMERIC_KINDS = frozenset({
    ConstraintKind.MIN_COUNT, ConstraintKind.MAX_COUNT,
    ConstraintKind.MIN_LENGTH, ConstraintKind.MAX_LENGTH,
    ConstraintKind.MIN_INCLUSIVE, ConstraintKind.MAX_INCLUSIVE,
})

#: Kinds whose value is an IRI.
IRI_KINDS = frozenset({
    ConstraintKind.DATATYPE, ConstraintKind.CLASS, ConstraintKind.NODE_KIND,
})


@dataclass(frozen=True)
class Constraint:
    """A single SHACL property constraint, normalised for comparison."""

    target_class: str
    path: str          # property IRI (or a serialised path expression)
    kind: ConstraintKind
    value: str         # stringified value (e.g. "1", an xsd: IRI, a class IRI)
    severity: str = "violation"
    message: str = ""
    confidence: float = 1.0    # 0..1
    support: int = 0           # instances backing this constraint
    population: int = 0        # instances examined (support/population = evidence)
    method: str = ""           # which inducer proposed it

    def key(self) -> Tuple[str, str, str, str]:
        """Identity tuple: severity, message and provenance are ignored.

        Two methods proposing ``minCount 1`` on the same class+path are
        proposing the *same* constraint, so this is what dedup and the drift
        diff compare on.
        """
        return (self.target_class, self.path, self.kind.value, self.value)

    def evidence(self) -> str:
        """Human-readable support, e.g. ``"42/45 instances (93%)"``."""
        if self.population:
            pct = round(100 * self.support / self.population)
            return f"{self.support}/{self.population} instances ({pct}%)"
        return "from ontology axioms"

    def to_dict(self) -> dict:
        return {
            "targetClass": self.target_class,
            "path": self.path,
            "kind": self.kind.value,
            "value": self.value,
            "confidence": round(self.confidence, 4),
            "support": self.support,
            "population": self.population,
            "method": self.method,
            "message": self.message,
            "evidence": self.evidence(),
        }


@dataclass
class Shape:
    """One ``sh:NodeShape`` targeted at a class, with N property constraints."""

    target_class: str
    constraints: List[Constraint] = field(default_factory=list)
    label: str = ""
    description: str = ""

    def by_path(self) -> Dict[str, List[Constraint]]:
        """Constraints grouped by property path, in first-seen order."""
        grouped: Dict[str, List[Constraint]] = {}
        for c in self.constraints:
            grouped.setdefault(c.path, []).append(c)
        return grouped


def _merge(first: Constraint, second: Constraint) -> Constraint:
    """Combine two derivations of the same constraint into one."""
    methods = [m for m in (first.method, second.method) if m]
    # dict.fromkeys keeps first-seen order, so "astrea,baseline" is stable.
    method = ",".join(dict.fromkeys(methods))
    # Counts: whichever derivation actually measured something wins.
    support = max(first.support, second.support)
    population = max(first.population, second.population)
    # Confidence: the higher of the two. Both derivations assert the
    # constraint; disagreeing on how sure they are is not a reason to become
    # less sure than the more confident one already was.
    confidence = max(first.confidence, second.confidence)
    return replace(
        first,
        method=method,
        support=support,
        population=population,
        confidence=confidence,
        message=first.message or second.message,
    )


@dataclass
class ShapeSet:
    """The output of a shape induction run, indexed by target class."""

    shapes: Dict[str, Shape] = field(default_factory=dict)
    prefixes: Dict[str, str] = field(default_factory=dict)

    def add(self, c: Constraint) -> bool:
        """Add a constraint, merging it with an identical one already present.

        Returns True when a new entry was appended, False when it merged into
        an existing one. Dedup lives here because ``auto`` mode runs two
        inducers that legitimately overlap — both derive ``maxCount 1`` for a
        functional property, one from the axiom and one from the data — and the
        merged shape should state it once.

        Merging rather than discarding matters. The axiom pass runs first and
        carries no counts (``support`` and ``population`` are 0), so simply
        keeping the first arrival threw away the instance evidence the data
        pass then found for the very same constraint: the shape said
        "from ontology axioms" when it could have said "and 45 of 45 instances
        agree". Two independent derivations are the strongest signal available,
        so the merged constraint keeps both method names and whichever counts
        are non-zero.
        """
        shape = self.shapes.setdefault(c.target_class, Shape(target_class=c.target_class))
        for i, existing in enumerate(shape.constraints):
            if existing.key() == c.key():
                shape.constraints[i] = _merge(existing, c)
                return False
        shape.constraints.append(c)
        return True

    def all_constraints(self) -> Iterable[Constraint]:
        for s in self.shapes.values():
            yield from s.constraints

    def keys(self):
        return {c.key() for c in self.all_constraints()}

    def filter_confidence(self, minimum: float) -> "ShapeSet":
        """Return a copy keeping only constraints at or above ``minimum``."""
        out = ShapeSet(prefixes=dict(self.prefixes))
        for c in self.all_constraints():
            if c.confidence >= minimum:
                out.add(c)
        return out

    def __len__(self) -> int:
        return sum(len(s.constraints) for s in self.shapes.values())
