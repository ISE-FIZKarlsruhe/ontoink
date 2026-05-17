"""Rebuild demo/docs/anti-patterns/shacl-shapes.ttl from per-pattern shape.ttl files.

Run this whenever a per-pattern shape under
demo/docs/anti-pattern-shapes/<slug>/shape.ttl is edited. The bundle is the
single artefact a user can pass to `pyshacl -s` to validate their ontology
against every anti-pattern at once; keeping it in sync with the per-pattern
folders is this script's only job.

The full layout reset (creating the per-pattern folders, splitting the
original bundle, authoring missing data.ttl, writing markdown pages) lives in
the heavier scripts/reorganize_antipatterns.py and is a one-shot.
"""
from __future__ import annotations

import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SHAPES_DIR = REPO / "demo" / "docs" / "anti-pattern-shapes"
BUNDLE = REPO / "demo" / "docs" / "anti-patterns" / "shacl-shapes.ttl"

# Slug order = bundle ordering. Keep in sync with reorganize_antipatterns.py.
SLUGS = [
    "is-relationship",
    "multiple-domain-range",
    "inverse-of-self",
    "missing-disjointness",
    "recursive-definition",
    "and-is-or",
    "equivalence-is-difference",
    "onlyness-is-loneliness",
    "universal-existence",
    "sum-of-some",
    "sum-of-some-is-never-equal-to-one",
    "some-means-at-least-one",
    "synonym-of-equivalence",
    "disjointness-of-complement",
    "min-is-zero",
    "conflicting-cardinality",
    "deactivated-shape",
    "shape-without-target",
]

PREAMBLE = """\
@prefix rdf:   <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs:  <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl:   <http://www.w3.org/2002/07/owl#> .
@prefix sh:    <http://www.w3.org/ns/shacl#> .
@prefix xsd:   <http://www.w3.org/2001/XMLSchema#> .
@prefix ap:    <http://ise.fiz-karlsruhe.de/ontoink/anti-patterns#> .
@prefix dcterms: <http://purl.org/dc/terms/> .

#
# ontoink — SHACL Anti-Pattern Validation Catalogue
#
# AUTO-GENERATED from demo/docs/anti-pattern-shapes/<slug>/shape.ttl by
# scripts/build_antipattern_bundle.py. Edit a per-pattern shape.ttl, then
# run `python scripts/build_antipattern_bundle.py` to regenerate this file.
#
# Run this shape graph against any ontology TTL with `pyshacl`:
#
#     pyshacl -s shacl-shapes.ttl -d my-ontology.ttl -f human
#
"""


def main() -> None:
    parts: list[str] = [PREAMBLE]
    for slug in SLUGS:
        sp = SHAPES_DIR / slug / "shape.ttl"
        if not sp.exists():
            raise SystemExit(f"missing per-pattern shape: {sp}")
        body = sp.read_text(encoding="utf-8")
        body = re.sub(r"^@prefix[^\n]*\n", "", body, flags=re.MULTILINE)
        body = re.sub(r"^# Source bundle:[^\n]*\n", "", body, flags=re.MULTILINE)
        parts.append(body.strip() + "\n\n")
    BUNDLE.write_text("".join(parts), encoding="utf-8")
    print(f"wrote {BUNDLE} from {len(SLUGS)} per-pattern shapes")


if __name__ == "__main__":
    main()
