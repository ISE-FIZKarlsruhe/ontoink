# Roadmap

Candidate features, scored. Two axes, because they disagree often: **importance** is how much daily pain a feature removes for someone modelling an ontology and publishing documentation; **creativity** is how novel it is against Protégé, WebVOWL, Chowlk, Graffoo, yEd, draw.io and Google Slides. Effort is S ≈ a day, M ≈ a week, L ≈ a milestone, XL ≈ a project.

Nothing here is a commitment. Issues and opinions are welcome on [GitHub](https://github.com/ISE-FIZKarlsruhe/ontoink/issues).

## Shipped in 0.7.7

Struck from the tables below:

- **Explain this edge** (imp 7 · cre 6.5) — right-click an inferred edge for a proof tree down to asserted facts. Built exactly where this roadmap said it should be: the single `add(s,p,o)` funnel in the OWL-RL materializer. The reasoner-parity risk noted at the bottom of this page turned out to be the design — backends that cannot justify a triple say so.
- **Select by quality finding** (imp 7 · cre 6.5) — smell chips and competency-question results select their terms on the canvas.
- **Competency questions by example** (cre 8 · imp 6) — *partly*. The `ontoink-cq` fence and the CI gate shipped; the novel half, deriving the SPARQL from a selection so you never write it by hand, did not. It stays below, rescoped.

Also shipped, though never on this roadmap: shape recommendation with per-constraint evidence, shape-drift detection, the build report and badges, and the ontology citation panel.

## By importance

| Feature | imp | cre | effort | Why |
|---|:--:|:--:|:--:|---|
| **Layout lockfile** — `.ontoink-layout.json` + `layout:` fence key | 8 | 6.5 | M–L | Makes a hand-arranged diagram durable and reviewable. Today an arrangement lives in `localStorage`: private to one browser, colliding between fences built from the same file, invisible to CI. |
| **Real figures** — `caption:` / `id:` / `alt:`, numbering, cross-references | 7 | 2 | M | A documentation plugin currently emits a bare `<div>` and authors hand-maintain "Figure 3". |
| **Select by quality finding** — OntoSniff report → graph selection | 7 | 6.5 | S | The detectors already carry the IRIs; today they render as text next to a selection API that could act on them. |
| **Explain this edge** — justify an inferred, SHACL or restriction edge | 7 | 6.5 | M | Every OWL-RL rule funnels through one `add(s,p,o)`; widening that turns a black box into a glass box. An unexplained purple edge costs trust. |
| **Extract module** — closure policies over a selection | 7 | 5.5 | L | Signature, +superclasses, +domain/range, +restrictions — and show the delta: "you picked 6 classes, a usable module needs 11". |
| **Assert axiom from selection** | 7 | 6 | L | The missing half of the loop: OntoInk can parse, reason, validate and score an ontology but cannot change one axiom from the picture. |
| **Export parity** — shared legend geometry, `export:` key, provenance manifest | 6.5 | 4 | M | PNG and SVG take different paths with duplicated legend renderers. |
| **Accessible figure** — generated long description + ontology outline | 6.5 | 7 | L | The canvas is opaque to assistive technology; generation from the parsed RDF is the only design that ships, and it buys `Ctrl+F` and search indexing. |
| **Keyboard focus for the canvas** — `tabindex`, focus ring, arrow-walk | 6.5 | 3.5 | M | The context menu is keyboard-operable; the canvas itself still cannot take focus. |
| **Selection-scoped SPARQL and SHACL** | 6 | 5.5 | M | Turn a selection into a `VALUES` block or a scoped validation run instead of hunting through a 400-entry dropdown. |

## By creativity

| Feature | cre | imp | effort | What makes it new |
|---|:--:|:--:|:--:|---|
| **Change heat** — per-IRI git provenance on the diagram | 8.5 | 5 | L | Needs the repository, an RDF parser and the renderer in one process — structurally unavailable to browser-only tools. |
| **Layout rules** — alignment as a re-derivable claim over a predicate | 8 | 6 | L | yEd's layer constraints know nothing about what a class *is*. |
| **Competency questions by example** — selection → SPARQL → CI gate | 8 | 6 | L | Themis, CQChecker and SAMOD all require you to write the SPARQL first — the step that stops teams. |
| **Accessible figure / ontology outline** | 7 | 6.5 | L | A long description derived from the RDF itself; draw.io's outline is a thumbnail, not a semantic tree. |
| **Tidy as taxonomy, continuously** | 7 | 5.5 | M | The one-shot version ships in 0.7.5; keeping it true as the ontology changes is the interesting part. |
| **ODP capture** — mint a pattern by generalising a selection | 7 | 5 | XL | XD and CoModIDE assume the pattern already exists. |
| **Ghost axioms** — LLM proposals gated by the reasoner and SHACL | 7 | 4.5 | XL | Acceptance is mechanically blocked unless the ontology stays consistent and conformant. |

## Quick wins

Highest value per line of code, all feasible in a day or two:

1. Smell modes in `selectBy`, plus a "select these" action on each OntoSniff finding
2. `prefers-reduced-motion` gates across the remaining animation sites
3. `tabindex="0"` and a focus ring on the canvas wrapper
4. `caption:` / `id:` / `alt:` fence keys with figure numbering (Python only)
5. Manchester, OWL Functional and ROBOT template serialisers next to "copy as TTL"

## Known risks

Recorded so they are not rediscovered:

- **Position cache** — `_positionsSave` rebuilds the map from the visible nodes only, so an LOD sweep drops coordinates for hidden ones; and the cache key hashes content alone, so two fences built from the same file collide. Both must be fixed before a lockfile is worth shipping.
- **Style presets** — `cy.style()` replaces the whole stylesheet, so any overlay (inferred edges, selection halo, a future diff layer) has to be re-appended on every preset switch or it silently disappears.
- **Compound nodes** — dagre drops edges to parents, `positions()` has no ancestor guard, and no preset declares the category-box selector. Anything that groups a selection into a container inherits all three.
- **Reasoner parity** — only the JavaScript OWL-RL path can produce justifications; HermiT, Konclude and the server route return proof-free triples. Any "explain" feature has to show that degradation rather than hide it.
