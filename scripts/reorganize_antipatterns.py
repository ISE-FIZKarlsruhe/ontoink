"""One-shot reorganization of demo/docs/anti-patterns/.

Before:
    demo/docs/anti-patterns/
        shacl-shapes.ttl              (bundled 18 SHACL shapes)
        and-is-or.ttl                 (9 example TTLs, mixed in)
        equivalence-is-difference.ttl
        ...

After:
    demo/docs/anti-pattern-shapes/<slug>/
        shape.ttl                     (single shape extracted from bundle)
        data.ttl                      (example data; existing or freshly authored)
    demo/docs/anti-patterns/
        shacl-shapes.ttl              (auto-rebuilt aggregate)
        <slug>.md                     (one page per anti-pattern)

This script is idempotent and meant to be re-runnable. It always overwrites
the per-pattern folders so the layout stays in sync with the bundle. To
regenerate just the bundle from the per-pattern shapes, see
scripts/build_antipattern_bundle.py (this script also calls it at the end).
"""
from __future__ import annotations

import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DEMO = REPO / "demo" / "docs"
SHAPES_DIR = DEMO / "anti-pattern-shapes"
LEGACY_DIR = DEMO / "anti-patterns"
BUNDLE = LEGACY_DIR / "shacl-shapes.ttl"

# Slug → (shape class IRI tail, source title, source paper/spec URL, severity, summary).
# Order matches the bundle ordering (1..18).
PATTERNS: list[tuple[str, str, str, str, str, str]] = [
    ("is-relationship",
     "IsRelationshipShape",
     "OOPS! P03 -- `is` used as a property name",
     "https://oops.linkeddata.es/catalogue.jsp",
     "error",
     "A property named `is`, `isa`, or `is_a` duplicates the built-in `rdfs:subClassOf` / `rdf:type` / `owl:sameAs` relations and forces readers to guess which one was meant."),

    ("multiple-domain-range",
     "MultipleDomainShape",
     "OOPS! P19 -- multiple `rdfs:domain` axioms",
     "https://oops.linkeddata.es/catalogue.jsp",
     "error",
     "A property carries more than one `rdfs:domain` axiom. OWL semantics interpret these as an *intersection*, not a *union*, so the property's effective domain becomes the (often empty) overlap of the listed classes."),

    ("inverse-of-self",
     "InverseOfSelfShape",
     "OOPS! P25 -- property declared inverse of itself",
     "https://oops.linkeddata.es/catalogue.jsp",
     "warning",
     "A property is declared `owl:inverseOf` itself. The axiom is logically equivalent to `owl:SymmetricProperty` but obscures the intent."),

    ("missing-disjointness",
     "MissingDisjointnessShape",
     "OOPS! P10 -- sibling subclasses with no disjointness",
     "https://oops.linkeddata.es/catalogue.jsp",
     "warning",
     "Two classes share a parent but no `owl:disjointWith` axiom links them. A reasoner cannot prove that an instance of one cannot be an instance of the other -- which is almost always what the modeller intended."),

    ("recursive-definition",
     "RecursiveDefinitionShape",
     "OOPS! P24 -- recursive class definition",
     "https://oops.linkeddata.es/catalogue.jsp",
     "error",
     "A class is declared `owl:equivalentClass` of itself. The axiom is vacuous and usually a leftover from a class rename."),

    ("and-is-or",
     "AndIsOrShape",
     "AIO (Corcho/Roussey) -- intersection used for union",
     "https://liris.cnrs.fr/Documents/Liris-4441.pdf",
     "warning",
     "Two existential restrictions on the same property, whose fillers are explicitly disjoint, force every instance to have two distinct values simultaneously. The class is satisfiable, but the modeller almost always intended a disjunction `exists R.(A union B)` rather than an intersection of existentials."),

    ("equivalence-is-difference",
     "EquivalenceIsDifferenceShape",
     "EID (Corcho/Roussey) -- equivalent yet disjoint",
     "https://liris.cnrs.fr/Documents/Liris-4441.pdf",
     "error",
     "Two classes are asserted both `owl:equivalentClass` and `owl:disjointWith`. The only model that satisfies both is the empty interpretation, so both classes collapse to `owl:Nothing`."),

    ("onlyness-is-loneliness",
     "OnlynessIsLonelinessShape",
     "OIL (Corcho/Roussey) -- onlyness is loneliness",
     "https://liris.cnrs.fr/Documents/Liris-4441.pdf",
     "error",
     "Two universal restrictions on the same property point at disjoint fillers. The two `allValuesFrom` axioms reduce to `allValuesFrom owl:Nothing`, forcing the property to be empty on every instance of the class."),

    ("universal-existence",
     "UniversalExistenceShape",
     "UE (Corcho/Roussey) -- universal and existence collide",
     "https://liris.cnrs.fr/Documents/Liris-4441.pdf",
     "error",
     "A class is restricted with `allValuesFrom A` and `someValuesFrom B` where `A` and `B` are disjoint. The universal forbids the witness that the existential demands, making the class unsatisfiable."),

    ("sum-of-some",
     "SumOfSomShape",
     "SOS (Corcho/Roussey) -- sum of some",
     "https://liris.cnrs.fr/Documents/Liris-4441.pdf",
     "warning",
     "Two existential restrictions on the same property, with disjoint fillers, force the class to have at least two distinct values on `R` simultaneously. The class is satisfiable but the modeller usually meant a disjunction."),

    ("sum-of-some-is-never-equal-to-one",
     "SumOfSomNeverEqualToOneShape",
     "SOSINETO (Corcho/Roussey) -- SOS combined with maxCardinality 1",
     "https://liris.cnrs.fr/Documents/Liris-4441.pdf",
     "error",
     "Two existential restrictions on disjoint fillers plus `owl:maxCardinality 1` on the same property -- the existentials demand two distinct values while the cardinality forbids more than one."),

    ("some-means-at-least-one",
     "SomeMeansAtLeastOneShape",
     "SMALO (Corcho/Roussey) -- redundant minCardinality 1 + someValuesFrom",
     "https://liris.cnrs.fr/Documents/Liris-4441.pdf",
     "info",
     "`owl:minCardinality 1` is redundant next to an `owl:someValuesFrom` on the same property -- the existential already entails *at least one*."),

    ("synonym-of-equivalence",
     "SynonymOfEquivalenceShape",
     "SOE (Corcho/Roussey) -- equivalence used for synonymy",
     "https://liris.cnrs.fr/Documents/Liris-4441.pdf",
     "warning",
     "Two classes inside a single ontology are declared `owl:equivalentClass`. The modeller almost always wanted a lexical synonym (`skos:altLabel`) rather than a class-level identity claim."),

    ("disjointness-of-complement",
     "DisjointnessOfComplementShape",
     "DOC (Corcho/Roussey) -- complementOf used for disjointWith",
     "https://liris.cnrs.fr/Documents/Liris-4441.pdf",
     "info",
     "`owl:complementOf` is stronger than `owl:disjointWith`: it claims the class is *exactly* the set of individuals not in the other. For the common case of \"these two sets do not overlap\", prefer `owl:disjointWith`."),

    ("min-is-zero",
     "MinIsZeroShape",
     "MIZ (Corcho/Roussey) -- minCardinality 0 is noise",
     "https://liris.cnrs.fr/Documents/Liris-4441.pdf",
     "info",
     "`owl:minCardinality 0` imposes no constraint at all -- it is pure noise in the axiom set."),

    ("conflicting-cardinality",
     "ConflictingCardinalityShape",
     "SHACL -- conflicting min/max cardinality",
     "https://arxiv.org/abs/2406.08018",
     "error",
     "A property shape declares `sh:minCount > sh:maxCount`. The shape is unsatisfiable and silently passes only because no node ever matches."),

    ("deactivated-shape",
     "DeactivatedShapeShape",
     "SHACL -- deactivated / vacuous shape",
     "https://www.w3.org/TR/shacl/#deactivated",
     "info",
     "`sh:deactivated true` switches a shape off entirely. Handy during debugging, but easy to forget and ship a validation suite that no longer runs."),

    ("shape-without-target",
     "ShapeWithoutTargetShape",
     "SHACL -- shape without target",
     "https://ceur-ws.org/Vol-4064/UKG-paper3.pdf",
     "warning",
     "A `sh:NodeShape` has no `sh:targetClass`, `sh:targetNode`, `sh:targetSubjectsOf`, or `sh:targetObjectsOf`, so SHACL never applies it to anything."),
]

# slugs whose example TTL already exists under demo/docs/anti-patterns/
EXISTING_EXAMPLE_FILE = {
    "and-is-or":                    "and-is-or.ttl",
    "equivalence-is-difference":    "equivalence-is-difference.ttl",
    "onlyness-is-loneliness":       "onlyness-is-loneliness.ttl",
    "universal-existence":          "universal-existence.ttl",
    "sum-of-some":                  "sum-of-some.ttl",
    "some-means-at-least-one":      "some-means-at-least-one.ttl",
    "synonym-of-equivalence":       "synonym-of-equivalence.ttl",
    "disjointness-of-complement":   "disjointness-of-complement.ttl",
    "min-is-zero":                  "min-is-zero.ttl",
}

# Freshly authored minimal data TTLs for the 9 patterns that lack one.
# Each example is the *smallest* TTL that triggers the corresponding SHACL
# shape from the bundle.
NEW_DATA_TTLS: dict[str, str] = {
    "is-relationship": """\
@prefix :    <http://example.org/isrel/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .

# OOPS! P03 — the property `is` shadows rdfs:subClassOf / rdf:type / owl:sameAs.
:is   a owl:ObjectProperty .
:isA  a owl:ObjectProperty .

# Compare with a well-named property:
:owns a owl:ObjectProperty .
""",
    "multiple-domain-range": """\
@prefix :     <http://example.org/mdr/> .
@prefix owl:  <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

# OOPS! P19 — multiple rdfs:domain axioms.
# OWL semantics interprets these as the *intersection* (Person ⊓ Robot),
# which is usually not what the modeller wanted.

:Person a owl:Class .
:Robot  a owl:Class .

:hasName a owl:DatatypeProperty ;
    rdfs:domain :Person ;
    rdfs:domain :Robot .          # ← P19
""",
    "inverse-of-self": """\
@prefix :    <http://example.org/iof/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .

# OOPS! P25 — a property declared as its own inverse.
# Almost always meant as owl:SymmetricProperty.

:friendOf a owl:ObjectProperty ;
    owl:inverseOf :friendOf .     # ← P25

# Recommended:
#
#   :friendOf a owl:SymmetricProperty .
""",
    "missing-disjointness": """\
@prefix :     <http://example.org/md/> .
@prefix owl:  <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

# OOPS! P10 — sibling classes without owl:disjointWith.

:Animal a owl:Class .
:Cat    a owl:Class ; rdfs:subClassOf :Animal .
:Dog    a owl:Class ; rdfs:subClassOf :Animal .

# Missing:
#   :Cat owl:disjointWith :Dog .
""",
    "recursive-definition": """\
@prefix :    <http://example.org/rec/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .

# OOPS! P24 — recursive definition.
# :Self is declared equivalent to itself — the definition does not narrow
# anything down.

:Self a owl:Class ;
    owl:equivalentClass :Self .
""",
    "sum-of-some-is-never-equal-to-one": """\
@prefix :     <http://example.org/sosineto/> .
@prefix owl:  <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd:  <http://www.w3.org/2001/XMLSchema#> .

# SOSINETO (Corcho/Roussey) — SumOfSome combined with maxCardinality 1.
# Two ∃R restrictions on disjoint fillers AND maxCardinality 1 on the
# same property — unsatisfiable.

:LiquidWater a owl:Class .
:Ice         a owl:Class .
:LiquidWater owl:disjointWith :Ice .

:Sample a owl:Class ;
    rdfs:subClassOf [
        a owl:Restriction ;
        owl:onProperty :containsPhase ;
        owl:someValuesFrom :LiquidWater
    ] ;
    rdfs:subClassOf [
        a owl:Restriction ;
        owl:onProperty :containsPhase ;
        owl:someValuesFrom :Ice
    ] ;
    rdfs:subClassOf [
        a owl:Restriction ;
        owl:onProperty :containsPhase ;
        owl:maxCardinality "1"^^xsd:nonNegativeInteger
    ] .
""",
    "conflicting-cardinality": """\
@prefix :    <http://example.org/cc/> .
@prefix sh:  <http://www.w3.org/ns/shacl#> .

# SHACL2FOL — sh:minCount > sh:maxCount makes the shape unsatisfiable.

:BookShape a sh:NodeShape ;
    sh:targetClass :Book ;
    sh:property [
        sh:path :author ;
        sh:minCount 3 ;
        sh:maxCount 1            # ← unsatisfiable
    ] .
""",
    "deactivated-shape": """\
@prefix :    <http://example.org/deact/> .
@prefix sh:  <http://www.w3.org/ns/shacl#> .

# SHACL — sh:deactivated true switches the shape off.
# Useful during development, but easy to forget when shipping.

:ArchivedShape a sh:NodeShape ;
    sh:targetClass :Book ;
    sh:deactivated true ;        # ← shape does nothing
    sh:property [
        sh:path :title ;
        sh:minCount 1
    ] .
""",
    "shape-without-target": """\
@prefix :    <http://example.org/swt/> .
@prefix sh:  <http://www.w3.org/ns/shacl#> .

# SHACLEval — a node shape with no target predicate is never applied.

:NoTargetShape a sh:NodeShape ;
    # missing: sh:targetClass / sh:targetNode / sh:targetSubjectsOf /
    #          sh:targetObjectsOf
    sh:property [
        sh:path :name ;
        sh:minCount 1
    ] .
""",
}

# Regex that splits the bundle into per-shape blocks.
# Each block starts with a header comment "# ── N. ..." and runs until the
# next header (or end of file).
HEADER_RE = re.compile(r"^#\s*[─-]+\s*\d+\.", re.MULTILINE)


def split_bundle(bundle_text: str) -> list[str]:
    """Return one TTL string per shape, in order. The shared @prefix preamble
    is *not* duplicated into the per-shape files — we prepend a minimal preamble
    instead, so each shape parses on its own."""
    # Find header positions
    matches = list(HEADER_RE.finditer(bundle_text))
    if len(matches) != len(PATTERNS):
        raise SystemExit(
            f"Expected {len(PATTERNS)} shape blocks in bundle, found {len(matches)}."
        )
    blocks: list[str] = []
    for i, m in enumerate(matches):
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(bundle_text)
        blocks.append(bundle_text[start:end].rstrip() + "\n")
    return blocks


SHAPE_PREAMBLE = """\
@prefix rdf:   <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs:  <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl:   <http://www.w3.org/2002/07/owl#> .
@prefix sh:    <http://www.w3.org/ns/shacl#> .
@prefix xsd:   <http://www.w3.org/2001/XMLSchema#> .
@prefix ap:    <http://ise.fiz-karlsruhe.de/ontoink/anti-patterns#> .
"""


def write_shape_files(blocks: list[str]) -> None:
    SHAPES_DIR.mkdir(parents=True, exist_ok=True)
    for (slug, _cls, title, _url, _sev, _summary), block in zip(PATTERNS, blocks):
        out_dir = SHAPES_DIR / slug
        out_dir.mkdir(parents=True, exist_ok=True)
        shape_path = out_dir / "shape.ttl"
        shape_path.write_text(
            SHAPE_PREAMBLE
            + "\n"
            + f"# {title}\n"
            + "# Source bundle: demo/docs/anti-patterns/shacl-shapes.ttl\n"
            + "\n"
            + block.strip()
            + "\n",
            encoding="utf-8",
        )


def write_data_files() -> None:
    for slug, *_ in PATTERNS:
        out_dir = SHAPES_DIR / slug
        out_dir.mkdir(parents=True, exist_ok=True)
        data_path = out_dir / "data.ttl"
        if slug in EXISTING_EXAMPLE_FILE:
            src = LEGACY_DIR / EXISTING_EXAMPLE_FILE[slug]
            if not src.exists():
                raise SystemExit(f"expected example TTL not found: {src}")
            data_path.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
        elif slug in NEW_DATA_TTLS:
            data_path.write_text(NEW_DATA_TTLS[slug], encoding="utf-8")
        else:
            raise SystemExit(f"no data TTL source for slug {slug!r}")


def write_markdown_pages() -> None:
    """One page per slug under demo/docs/anti-patterns/<slug>.md."""
    for slug, _cls, title, url, sev, summary in PATTERNS:
        page = LEGACY_DIR / f"{slug}.md"
        body = f"""# {title}

> {summary}

| Severity | Source |
|----------|--------|
| `{sev}` | [{url}]({url}) |

## Example

The graph below contains the smallest TTL that exhibits the anti-pattern.
Click any **node** or **edge** to inspect it, and use **Edit & Validate** to
modify the data live.

```ontoink
source: anti-pattern-shapes/{slug}/data.ttl
shape:  anti-pattern-shapes/{slug}/shape.ttl
height: 420px
legend: true
```

## SHACL shape

The detector is a single `sh:NodeShape` plus a `sh:sparql` (or
`sh:property`) constraint. Run it locally with:

```bash
pyshacl -s demo/docs/anti-pattern-shapes/{slug}/shape.ttl \\
        -d demo/docs/anti-pattern-shapes/{slug}/data.ttl \\
        -f human
```

The same shape ships inside the bundled
[`shacl-shapes.ttl`](shacl-shapes.ttl) catalogue, alongside all 18
anti-pattern shapes.

## Reference

- {title} -- [{url}]({url})
- See [the full anti-pattern catalogue](../anti-patterns.md) for the
  related entries and the cross-paper provenance table.
"""
        page.write_text(body, encoding="utf-8")


def rebuild_bundle() -> None:
    """Regenerate demo/docs/anti-patterns/shacl-shapes.ttl from the per-shape
    files. The bundle header + shared prefixes come from a static preamble; the
    per-shape comment block is preserved verbatim."""
    parts = [
        """\
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
    ]
    for slug, *_ in PATTERNS:
        sp = SHAPES_DIR / slug / "shape.ttl"
        body = sp.read_text(encoding="utf-8")
        # Strip the per-file @prefix preamble (we already emit it above).
        body = re.sub(r"^@prefix[^\n]*\n", "", body, flags=re.MULTILINE)
        # Strip the "Source bundle:" comment line — it'd be circular here.
        body = re.sub(r"^# Source bundle:[^\n]*\n", "", body, flags=re.MULTILINE)
        parts.append(body.strip() + "\n\n")
    BUNDLE.write_text("".join(parts), encoding="utf-8")


def remove_legacy_examples() -> None:
    """The 9 example TTLs are now duplicated as data.ttl inside the per-slug
    folders. Remove them from demo/docs/anti-patterns/ so the directory stays
    tidy. We do NOT remove example TTLs that the bundle does not cover."""
    for legacy_filename in EXISTING_EXAMPLE_FILE.values():
        p = LEGACY_DIR / legacy_filename
        if p.exists():
            p.unlink()


def main() -> None:
    if not BUNDLE.exists():
        raise SystemExit(f"bundle not found at {BUNDLE}")
    print(f"Splitting bundle {BUNDLE} into {len(PATTERNS)} per-shape files …")
    blocks = split_bundle(BUNDLE.read_text(encoding="utf-8"))

    write_shape_files(blocks)
    print(f"  wrote {len(PATTERNS)} shape.ttl files under {SHAPES_DIR}")
    write_data_files()
    print(f"  wrote {len(PATTERNS)} data.ttl files under {SHAPES_DIR}")
    write_markdown_pages()
    print(f"  wrote {len(PATTERNS)} markdown pages under {LEGACY_DIR}")

    remove_legacy_examples()
    print(f"  removed {len(EXISTING_EXAMPLE_FILE)} legacy example TTLs from {LEGACY_DIR}")

    rebuild_bundle()
    print(f"  regenerated {BUNDLE}")

    print("\nNext steps:")
    print("  1. Update demo/mkdocs.yml to list the new per-pattern pages.")
    print("  2. Update demo/docs/anti-patterns.md to link to them.")
    print("  3. Run `pyshacl -s demo/docs/anti-patterns/shacl-shapes.ttl -d <ontology>`")
    print("     to confirm the rebuilt bundle still validates.")


if __name__ == "__main__":
    main()
