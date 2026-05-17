# Ontology Anti-Patterns — Modelling Mistakes Catalogued

This page collects the **modelling mistakes** that ontoink's `OntoSniff` detector flags.
Each entry is a small worked example: the ontology drawn by ontoink so you can see the
pattern, an explanation of why it is harmful, and a corrected version.

The catalogue is grounded in published ontology-quality research:

- Poveda-Villalón, M., Suárez-Figueroa, M. C., & Gómez-Pérez, A. (2014). [Did you validate your ontology? OOPS!](https://doi.org/10.1007/978-3-642-30284-8_24)
- Rector, A. *et al.* (2004). [OWL Pizzas: common patterns for OWL ontologies](https://doi.org/10.1007/978-3-540-30202-5_5)
- Gangemi, A. (2006). [Ontology Design Patterns for Semantic Web Content](https://doi.org/10.1007/11574620_21)

!!! tip "Per-pattern pages"
    Every anti-pattern that ships a SHACL detector now has its own page
    with the worked example, the detector, and a `pyshacl` command:
    see the sidebar under **Anti-Patterns**. The per-pattern data and
    shape files live under [`anti-pattern-shapes/<slug>/`](anti-pattern-shapes/),
    mirroring the [`shapes/`](shapes/) layout used for the positive
    examples. The aggregate
    [`shacl-shapes.ttl`](anti-patterns/shacl-shapes.ttl) catalogue is
    auto-rebuilt from those folders by `scripts/build_antipattern_bundle.py`.

---

## 1. Lazy Class

> A class is **declared** but has no instances and no subclasses. Either the class is unused (dead weight) or its instances were forgotten (data gap).

**Why it is a mistake.** Every class adds vocabulary that downstream users must learn. A class
without instances cannot be used for validation; a class with no subclasses cannot be
specialised. Both signals usually mean the modeller wanted something more concrete and
stopped halfway.

```ontoink
source: anti-patterns/lazy-class.ttl
height: 360px
legend: true
```

In the picture, `:UnusedConcept` floats with no `rdf:type` link from anywhere and no
`rdfs:subClassOf` edge below it.

**Fix.** Either delete the class, or commit at least one instance / subclass.

---

## 2. Missing Label

> An entity (class or property) has no `rdfs:label`.

**Why it is a mistake.** Human-readable labels are what every tool — Protégé, ontoink,
SPARQL editors — uses to render entities. An IRI like `ex:R0042` is opaque; with a label,
it becomes "Sample Preparation Step". Missing labels make the ontology unusable for
non-experts and unsearchable by full-text tools.

```ontoink
source: anti-patterns/missing-label.ttl
height: 360px
legend: true
```

Notice how `:R0042` renders as its local name because no `rdfs:label` is provided. Click
the node — the popup shows the empty label slot. Compare with `:Researcher` which has a
proper label.

**Fix.** Always add `rdfs:label "Human-readable name"@en .` to every class and property.

---

## 3. Missing Domain / Range

> An `owl:ObjectProperty` or `owl:DatatypeProperty` is declared without `rdfs:domain` or `rdfs:range`.

**Why it is a mistake.** Domain and range carry the property's **type signature**.
Without them, reasoners cannot infer the type of subjects and objects, SHACL shape
recommenders have no axiomatic baseline to lean on, and IDE-style autocomplete has no
hints. The property becomes a syntactic placeholder rather than a semantic statement.

```ontoink
source: anti-patterns/missing-domain-range.ttl
height: 360px
legend: true
```

`:knows` has no domain/range — ontoink shows it as a stand-alone object-property edge
between two anonymous-looking individuals. Add the axioms and the typing constraints
become visible everywhere.

**Fix.**

```turtle
:knows  a  owl:ObjectProperty ;
        rdfs:domain :Person ;
        rdfs:range  :Person .
```

---

## 4. Orphan Class

> A class has **no `rdfs:subClassOf` parent** and is itself **never a parent** to anything.

**Why it is a mistake.** Ontologies are taxonomies first. A class disconnected from the
hierarchy cannot be reached by ancestor / descendant queries, never inherits constraints,
and is invisible to subsumption-based reasoning. Most of the time, an orphan class is a
sign that the modeller forgot the top-level link to a foundational concept like
`bfo:Entity`, `schema:Thing`, or `owl:Thing`.

```ontoink
source: anti-patterns/orphan-class.ttl
height: 360px
legend: true
```

`:Sensor` sits alone — no superclass, no subclasses. Compare with `:Person` which is
properly anchored under `schema:Thing`.

**Fix.** Anchor every domain class to at least one parent: `:Sensor rdfs:subClassOf bfo:MaterialEntity .`

---

## 5. Property Soup

> A class has **more than ~15 direct properties**.

**Why it is a mistake.** A "property soup" class is doing too many jobs at once. The
modelling concept it represents is rarely that monolithic in reality — it is usually a
hub that combines several distinct sub-concepts (a `Person`'s identity attributes,
their employment attributes, their authorship attributes, …). Splitting them into
sub-classes or related classes (`Employment`, `AuthoredWork`) keeps each class focused
and SHACL shapes manageable.

```ontoink
source: anti-patterns/property-soup.ttl
height: 460px
legend: true
```

The visualisation makes the imbalance obvious: one super-node with a fan of properties,
versus the right column where the same information is decomposed.

**Fix.** Identify natural sub-clusters of properties and lift them into related classes:

```turtle
:Person :hasEmployment :Employment .
:Employment :employer :Company ; :role "Researcher" ; :since "2020-01-01" .
```

---

## 6. Cyclic SubClassOf

> `A rdfs:subClassOf B` and (directly or transitively) `B rdfs:subClassOf A`.

**Why it is a mistake.** A cycle in `rdfs:subClassOf` makes the two classes
**equivalent** under OWL semantics — but the modeller almost certainly did not intend
that. Cycles often arise after a refactor that renamed a class and accidentally pointed
both names at each other. They are caught by OWL DL consistency checks but only at
reasoning time, by which point downstream data has already been built on the broken
hierarchy.

```ontoink
source: anti-patterns/cyclic-subclass.ttl
height: 360px
legend: true
```

The graph shows the cycle directly — follow the `rdfs:subClassOf` arrows from `:A` to
`:B` to `:C` back to `:A`. Run an OWL-DL reasoner on this and every member of the cycle
collapses into one equivalence class.

**Fix.** Break the cycle. Decide which class is the real parent and remove the back-edge.

---

## 7. The complete catalogue

OntoSniff now ships 50+ anti-pattern definitions drawn from the published
literature. Most have an automatic detector that runs on every graph; a few
require modelling annotations (OntoClean meta-properties, OntoUML stereotypes)
that plain OWL does not carry, so they appear as documentation-only entries
that you can reference manually.

In the legend column:
- **detector** — an automatic check fires when the pattern is observed
- **doc-only** — the entry is catalogued for educational reference; no automatic detection (requires annotations the standard OWL graph does not carry)

### 7.1 Core OntoSniff catalogue (original 20)

| ID | Name | Severity | Mode |
|----|------|----------|------|
| `lazy-class` | Lazy Class | warning | detector |
| `missing-label` | Missing Label | warning | detector |
| `missing-domain-range` | Missing Domain/Range | info | detector |
| `singleton-hierarchy` | Singleton Hierarchy | info | detector |
| `property-soup` | Property Soup | warning | detector |
| `orphan-class` | Orphan Class | info | detector |
| `missing-inverse` | Missing Inverse | info | detector |
| `no-shacl-coverage` | No SHACL Coverage | warning | detector |
| `label-language-gap` | Label Language Gap | info | detector |
| `deep-hierarchy` | Deep Hierarchy (> 7 levels) | info | detector |
| `cyclic-subclass` | Cyclic SubClassOf | **error** | detector |
| `property-clump` | Property Clump | info | detector |
| `multi-inheritance` | Excessive Multi-Inheritance | warning | detector |
| `missing-comment` | Missing Comment | info | detector |
| `ambiguous-namespace` | Ambiguous Namespace | warning | detector |
| `symmetric-missing` | Potential Symmetric Property | info | detector |
| `large-union` | Large Union / Disjunction | info | detector |
| `deprecated-entity` | Deprecated Entity Used | warning | detector |
| `unused-import` | Unused Import | info | detector |
| `redundant-subclass` | Redundant SubClassOf | info | detector |

### 7.2 Additional OOPS! pitfalls

Source: Poveda-Villalón, M., Suárez-Figueroa, M. C., & Gómez-Pérez, A. (2014).
*Did you validate your ontology? OOPS!* The full pitfall catalogue is at
<https://oops.linkeddata.es/catalogue.jsp>.

| ID | Name | Severity | Mode |
|----|------|----------|------|
| `polysemous-element` (P01) | Polysemous Element | warning | doc-only |
| `synonyms-as-classes` (P02) | Synonyms Modeled as Separate Classes | info | doc-only |
| [`is-relationship`](anti-patterns/is-relationship.md) (P03) | "is" Used as a Property Name | **error** | detector |
| `wrong-inverse` (P05) | Wrong Inverse Relationship | **error** | doc-only |
| `merged-concepts` (P07) | Merging Different Concepts in One Class | warning | doc-only |
| [`missing-disjointness`](anti-patterns/missing-disjointness.md) (P10) | Missing Disjointness Axioms | warning | detector |
| `equivalent-property-not-declared` (P12) | Equivalent Properties Not Declared | info | doc-only |
| `misuse-allvaluesfrom` (P14) | Misuse of `owl:allValuesFrom` | **error** | doc-only |
| `some-not-vs-not-some` (P15) | `some not` vs `not some` | **error** | doc-only |
| `primitive-instead-of-defined` (P16) | Primitive Class Used Instead of Defined | warning | doc-only |
| `overspecialized-hierarchy` (P17) | Overspecialized Hierarchy | info | doc-only |
| `overspecialized-range` (P18) | Overspecialized Domain or Range | warning | doc-only |
| [`multiple-domain-range`](anti-patterns/multiple-domain-range.md) (P19) | Multiple Domain or Range as Conjunction | **error** | detector |
| `swapped-annotations` (P20) | Swapped Annotation Properties | info | detector |
| `miscellaneous-class` (P21) | Miscellaneous "Other" Class | info | doc-only |
| `inconsistent-naming` (P22) | Inconsistent Naming Conventions | info | detector |
| [`recursive-definition`](anti-patterns/recursive-definition.md) (P24) | Recursive Definition | **error** | detector |
| [`inverse-of-self`](anti-patterns/inverse-of-self.md) (P25) | Property Declared Inverse of Itself | warning | detector |
| `wrong-transitive` (P29) | Wrong Transitive Declaration | **error** | doc-only |
| `wrong-symmetric` (P28) | Wrong Symmetric Declaration | **error** | doc-only |
| `one-property-chain` (P33) | Single-Property "Chain" | info | detector |
| `untyped-class` (P34) | Untyped Class | warning | detector |
| `untyped-property` (P35) | Untyped Property | warning | detector |
| `extension-in-uri` (P36) | File Extension in Ontology URI | info | detector |
| `no-ontology-declaration` (P38) | Missing `owl:Ontology` Declaration | warning | detector |
| `namespace-hijacking` (P40) | Namespace Hijacking | **error** | detector |
| `no-license` (P41) | No License Declared | warning | detector |

### 7.3 Logical anti-patterns (Corcho, Roussey & Vilches-Blázquez, IC 2009)

Source paper: [Catalogue of Anti-Patterns for formal Ontology debugging](https://liris.cnrs.fr/Documents/Liris-4441.pdf) (IC 2009).

The base 5 patterns and the inheritance/property/inverse-property variants
from the paper are now catalogued individually. Each detectable one has its
own folder under
[`anti-pattern-shapes/<slug>/`](anti-pattern-shapes/) carrying a
`shape.ttl` (SHACL detector) and a `data.ttl` (worked example), plus a
dedicated documentation page. A single aggregate
[`anti-patterns/shacl-shapes.ttl`](anti-patterns/shacl-shapes.ttl) bundles
all 18 detectors for one-shot validation.

#### Base logical anti-patterns

| ID | Name | Severity | SHACL | Page | Mode |
|----|------|----------|:-----:|:----:|------|
| `and-is-or` (AIO) | Intersection Used for Union | **error** | ✓ | [→](anti-patterns/and-is-or.md) | shape |
| `equivalence-is-difference` (EID) | Equivalence Is Difference | **error** | ✓ | [→](anti-patterns/equivalence-is-difference.md) | shape |
| `onlyness-is-loneliness` (OIL) | Onlyness Is Loneliness | **error** | ✓ | [→](anti-patterns/onlyness-is-loneliness.md) | shape |
| `universal-existence` (UE) | Universal Existence | warning | ✓ | [→](anti-patterns/universal-existence.md) | shape |
| `sum-of-some` (SOS) | Sum Of Some | warning | ✓ | [→](anti-patterns/sum-of-some.md) | shape |
| `sum-of-top-and-something` | Sum of Top and Something | warning | reasoner | – | doc |

#### Inheritance variants (paper §§ 1, 2)

| ID | Specialises | Severity |
|----|-------------|----------|
| `onlyness-is-loneliness-with-inheritance` (OILWI) | OIL across subclass | **error** |
| `onlyness-is-loneliness-with-property-inheritance` (OILWPI) | OIL across sub-property | **error** |
| `universal-existence-with-inheritance-1` (UEWI_1) | UE across subclass (∃ in child) | **error** |
| `universal-existence-with-inheritance-2` (UEWI_2) | UE across subclass (∀ in child) | **error** |
| `universal-existence-with-property-inheritance` (UEWPI) | UE across sub-property | **error** |
| `universal-existence-with-inverse-property` (UEWIP) | UE via inverse property | **error** |
| `sum-of-some-with-inheritance` (SOSWI) | SOS across subclass | warning |
| `sum-of-some-with-property-inheritance` (SOSWPI) | SOS across sub-property | warning |
| `sum-of-some-with-inverse-property` (SOSWIP) | SOS via inverse property | warning |
| `sum-of-some-is-never-equal-to-one` (SOSINETO) | SOS combined with maxCardinality 1 | **error** |

#### Non-logical & guideline patterns

| ID | Name | Severity | SHACL | Page |
|----|------|----------|:-----:|:----:|
| `some-means-at-least-one` (SMALO) | Redundant minCardinality 1 + ∃ | info | ✓ | [→](anti-patterns/some-means-at-least-one.md) |
| `synonym-of-equivalence` (SOE) | Equivalence used for synonymy | warning | ✓ | [→](anti-patterns/synonym-of-equivalence.md) |
| `disjointness-of-complement` (DOC) | complementOf used instead of disjointWith | info | ✓ | [→](anti-patterns/disjointness-of-complement.md) |
| `domain-cardinality-constraints` (DCC) | ∃ combined with cardinality > 1 | info | reasoner | – |
| `group-axioms` (GA) | Several restrictions on same property could be grouped | info | reasoner | – |
| `min-is-zero` (MIZ) | minCardinality 0 has no effect | info | ✓ | [→](anti-patterns/min-is-zero.md) |

#### Inheritance and SOSINETO variants

| ID | Specialises | Severity | Page |
|----|-------------|----------|:----:|
| `sum-of-some-is-never-equal-to-one` (SOSINETO) | SOS combined with maxCardinality 1 | **error** | [→](anti-patterns/sum-of-some-is-never-equal-to-one.md) |

### 7.4 OntoClean meta-property violations (Guarino & Welty)

Source: Guarino, N. & Welty, C. *An Overview of OntoClean.* Detection requires
the class-level annotations defined by OntoClean (`+R` / `~R`, `+O`, `+U`, `+D`).

| ID | Name | Severity | Mode |
|----|------|----------|------|
| `antirigid-subsumes-rigid` | Anti-Rigid Class Subsumes Rigid Class | **error** | doc-only |
| `identity-criterion-mismatch` | Identity Criterion Conflict | **error** | doc-only |
| `unity-violation` | Unity / Non-Unity Subsumption Violation | warning | doc-only |
| `dependence-violation` | Dependence Mismatch in Hierarchy | warning | doc-only |

### 7.5 OntoUML anti-patterns (Guizzardi et al.)

Source: Sales, T. P., Guizzardi, G. *Ontological anti-patterns: empirically uncovered
error-prone structures in ontology-driven conceptual models.* The OntoUML AP
catalog is at <https://ontouml.readthedocs.io/en/latest/anti-patterns/>.

These are model-level patterns; detecting them needs OntoUML stereotypes on
your classes and relations (`«kind»`, `«role»`, `«relator»`, etc.).

| ID | Name | Severity | Mode |
|----|------|----------|------|
| `heterogeneous-collection` | HetColl | warning | doc-only |
| `imprecise-abstraction` | ImpAbs | warning | doc-only |
| `relator-composition` | RelComp | warning | doc-only |
| `mixed-rigidity` | MixRig | **error** | doc-only |
| `mixed-identity` | MixIden | **error** | doc-only |
| `relation-overloading` | RelOver | warning | doc-only |
| `redundant-relation` | RepRel | info | doc-only |
| `part-overloading` | PartOver | warning | doc-only |
| `free-role` | FreeRole | warning | doc-only |
| `pseudo-anti-rigid` | Pseudo-Anti-Rigid | **error** | doc-only |
| `generalization-set-rigidity` | GSRig — Generalization-Set Rigidity Mismatch | **error** | doc-only |
| `non-sortal-identity` | NSIden — Non-Sortal Identity | warning | doc-only |

### 7.6 Enterprise / operational anti-patterns

Source: [Palantir Foundry — Ontology Best Practices](https://palantir.com/docs/foundry/ontology/ontology-best-practices-and-anti-patterns/).
These describe deployment-time mistakes; detection is contextual to the
operational platform, so all are doc-only.

| ID | Name | Severity |
|----|------|----------|
| `golden-hammer` | The Golden Hammer | warning |
| `action-sprawl` | Action Sprawl | warning |
| `time-machine` | The Time Machine | warning |
| `misnomer` | The Misnomer | info |

### 7.7 SHACL-specific anti-patterns

Sources: W3C SHACL Recommendation; SHACLEval (CEUR Vol-4064); Acosta et al.
PVLDB 2024; SHACL2FOL (arXiv 2406.08018).

| ID | Name | Severity | Mode |
|----|------|----------|------|
| [`deactivated-shape`](anti-patterns/deactivated-shape.md) | Deactivated / Vacuous SHACL Shape | info | detector |
| [`shape-without-target`](anti-patterns/shape-without-target.md) | SHACL Shape Without Target | warning | detector |
| [`conflicting-cardinality`](anti-patterns/conflicting-cardinality.md) | Conflicting Min/Max Cardinality | **error** | detector |
| `shape-ontology-divergence` | Shape / Ontology Divergence | warning | doc-only |
| `unused-class-with-shape` | Shape for Empty Class | info | detector |

### Summary

| Source | Catalogue entries | Auto-detectors | SHACL shapes |
|--------|------------------:|---------------:|-------------:|
| Original OntoSniff (Phase 1) | 20 | 20 | – |
| OOPS! (Poveda-Villalón et al. 2014) | 27 | 11 | 5 |
| Corcho, Roussey & Vilches-Blázquez (IC 2009) — base | 5 | 0 | 5 |
| Corcho, Roussey & Vilches-Blázquez (IC 2009) — variants | 10 | 0 | 0 |
| Corcho, Roussey & Vilches-Blázquez (IC 2009) — non-logical / guidelines | 6 | 0 | 4 |
| OntoClean (Guarino & Welty) | 4 | 0 | – |
| OntoUML (Sales / Guizzardi) | 12 | 0 | – |
| Palantir / enterprise | 4 | 0 | – |
| SHACL (W3C / SHACL2FOL / Acosta) | 5 | 4 | 2 |
| **Grand total** | **94** | **35** | **18** |

Every catalogue entry now carries a clickable reference URL (paper, W3C
document, or upstream catalogue), and every SHACL-shape entry links to a
runnable shape in [`anti-patterns/shacl-shapes.ttl`](anti-patterns/shacl-shapes.ttl)
plus a minimal example TTL in [`anti-patterns/`](anti-patterns/).

Run **OntoSniff** on your own TTL through the [OntoSniff page](ontosniff.md) — it
returns a quality score (0–100) plus an annotated list of every smell found.

## 8. Further reading

- **Pitfall Scanner Catalogue** — [OOPS! online tool](https://oops.linkeddata.es/)
- **Ontology design patterns** — [ontologydesignpatterns.org](http://ontologydesignpatterns.org/)
- The **Shape Recommender** companion project, available [here](https://github.com/ISE-FIZKarlsruhe/ontoink/tree/main/shape-recommender), turns
  many of these anti-patterns into constraints automatically.
