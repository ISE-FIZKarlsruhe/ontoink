# Architecture & Design Decisions

How OntoInk works under the hood: why it exists, how it talks to SPARQL endpoints, how reasoning and shape recommendation are implemented, how build results become CI gates, and how labels get resolved.

### Why OntoInk?

Existing ontology visualization tools either require complex desktop installations (Protégé), produce static non-interactive diagrams (WebVOWL), or don't integrate with documentation workflows. OntoInk fills this gap:

- **Documentation-first**: embeds directly in MkDocs, the standard for Python project documentation
- **Interactive by default**: every diagram is explorable — click, search, zoom, export
- **Verifiable**: SHACL validation is built in, not an afterthought
- **Publication-ready**: export PNG/SVG with legend and prefixes for papers and presentations

### Adaptive Schema Discovery (SPARQL Explorer)

Connecting to a SPARQL endpoint with millions of triples (DBpedia: 9.5B, Wikidata: 17B) requires careful query design:

1. **Fast probe** — `SELECT * WHERE { ?s ?p ?o } LIMIT 1` with 10s timeout verifies the endpoint is reachable and supports CORS
2. **Class discovery with counts** — `SELECT ?class (COUNT(?inst) AS ?count) GROUP BY ?class LIMIT 100` gives the schema overview. If this times out (>15s), falls back to `SELECT DISTINCT ?class` which is orders of magnitude faster
3. **Property discovery with domain/range** — joins `?s a ?domain . ?o a ?range` to infer property signatures. Falls back to `SELECT DISTINCT ?prop` for large endpoints
4. **Batch label fetching** — `VALUES` clause retrieves labels for up to 80 IRIs in one query
5. **Ontology source fallback** — for IRIs still without labels after endpoint queries, fetches the ontology files directly (via known URL registry) and extracts `rdfs:label`/`skos:prefLabel` using a robust Turtle/RDF-XML parser

This adaptive approach means any endpoint works — from a 100-triple demo to Wikidata — and labels are always resolved even when the triplestore doesn't contain ontology annotations.

### OWL Reasoning Pipeline

OntoInk uses a two-stage reasoning approach:

1. **Primary: HermiT** (via owlready2) — full OWL DL tableau reasoner. Handles class hierarchy completion, inverse/transitive/symmetric property inference, consistency checking. Runs at MkDocs build time.
2. **Fallback: owlrl** — OWL-RL profile for environments without Java. Provides rdfs:subClassOf and basic property inference.
3. **Smart filtering** — removes reflexive triples (`x sameAs x`), built-in namespace noise (XSD, OWL, RDF, RDFS), and domain/range propagation to show only meaningful inferences.
4. **Justification capture (browser OWL-RL only)** — every derivation in the in-page materializer funnels through a single `add(s, p, o)` call, which records the rule that fired and the premises it consumed. That is what lets *Explain this inference* render a proof tree down to asserted facts. The tableau reasoners cannot do this: HermiT, Konclude and the server route all return proof-free triples, so the panel reports the absence rather than inventing a derivation. An unexplained inferred edge costs trust; a wrong explanation costs more.

### Build Report and Quality Gates

Every diagram already computed numbers worth gating on — SHACL conformance, the OntoSniff score, consistency — but they only ever reached the rendered page, so a regression could merge unnoticed. Three build-time passes now feed one repo-level artefact:

1. **Per-fence collection** — each rendered fence appends a summary to a module-level registry, reset in `on_config` so `mkdocs serve` rebuilds don't double-count.
2. **Shape drift** (`shape_drift:`) — re-runs induction and diffs it set-theoretically against the committed shapes, reporting constraints the data supports but the file omits, constraints almost nothing satisfies, and uncovered classes. Staleness needs instance data, so an axiom-only ontology reports none rather than guessing.
3. **Competency questions** (the `ontoink-cq` fence) — SPARQL with an expectation, optionally over the inferred closure so a question can assert what the ontology *entails*.
4. **Aggregation** — `on_post_build` writes `ontoink-report.json` plus self-contained SVG badges, and applies the `quality_gate:` thresholds.

Findings are reported through the `mkdocs.plugins.ontoink` logger rather than raised. That is deliberate: pymdownx catches exceptions from a fence handler and silently falls back to rendering the block as plain text, so raising would *lose* the diagnostics. Logging makes `mkdocs build --strict` the gate, and badges make the state visible without one.

### SHACL Shape Recommendation

The Shape Recommender uses **data profiling** to auto-generate SHACL constraints:

1. **Class discovery** — identifies all classes with instances (`rdf:type`)
2. **Property profiling** — for each class, counts property usage across all instances
3. **Constraint inference**:
   - If 90%+ of instances have property P → `sh:minCount 1` (mandatory)
   - If no instance has >1 value → `sh:maxCount 1` (functional)
   - If all values are same XSD type → `sh:datatype`
   - If all values are IRIs → `sh:nodeKind sh:IRI`
4. **Confidence scoring** — percentage of instances exhibiting the pattern

Based on: *Mihindukulasooriya et al. (2018) "RDF Shape Induction using Knowledge Base Profiling"*.

**Novel extensions beyond Mihindukulasooriya (2018):**

| Feature | Original paper | OntoInk extension |
|:--------|:---------------|:------------------|
| Cardinality | min/max count | Same |
| Datatype | XSD detection | Same |
| **sh:class** | Not covered | Infers target class from IRI value types |
| **sh:pattern** | Not covered | Auto-detects email, URL, uppercase patterns |
| **sh:minLength/maxLength** | Not covered | String length statistics |
| **sh:minInclusive/maxInclusive** | Not covered | Numeric range constraints |
| **Uniqueness** | Not covered | Detects potential identifiers |
| **Confidence** | Binary | Percentage-based (0-100%) |

Works from uploaded TTL data or directly from SPARQL endpoints. Navigate shapes with Prev/Next, edit, download individually, or accept into the visual editor.

#### The `ontoink.recommend` package (0.7.7)

The browser recommender above serves the SHACL Editor page. Since 0.7.7 the same job is also done at build time by `ontoink/recommend/`, drawn from a benchmark that compared shape-induction methods on six datasets plus two real ontologies (MWO, NFDIcore).

**The rule for what ships: published, citable methods only.** A recommendation a user cannot trace to a peer-reviewed method is one they cannot defend in review, so the method's paper travels with it — into the panel, the API catalogue and the docs. The research project alongside this one contains several unpublished experimental inducers; none of them are exposed here, whatever they score.

| Method | Reads | Reference | Mean F1 |
|:-------|:------|:----------|:--------|
| `baseline` | instance data | Mihindukulasooriya et al. (2018), SAC. [10.1145/3167132.3167341](https://doi.org/10.1145/3167132.3167341) | 0.871 |
| `astrea` | OWL axioms only | Cimmino et al. (2020), ESWC. [10.1007/978-3-030-49461-2_29](https://doi.org/10.1007/978-3-030-49461-2_29) | 0.148 |
| `shexer` | instance data | Fernández-Álvarez et al. (2022), KBS 238. [10.1016/j.knosys.2021.107975](https://doi.org/10.1016/j.knosys.2021.107975) | **0.903** |
| `auto` | both | Composition, not a method. The default. | 0.853 |

`astrea`'s 0.148 is the benchmark measuring the wrong case for it, not a weak method: half these datasets ship no ontology, so an axiom-driven inducer has nothing to read. On MWO and NFDIcore — restrictions, no individuals — it produces 39–58 useful constraints where `baseline` produces none. That is the case documentation ontologies are actually in, and it is why `auto` runs the axiom pass first: axioms are assertions the author made on purpose, so when both passes propose the same constraint the axiom-derived one keeps its provenance.

`shexer` is handled differently from the other two. `baseline` and `astrea` are reimplementations; `shexer` drives the authors' own library, because a reimplementation by someone else is not the same method and this package cites its sources. That makes it the only method with a dependency outside rdflib, so it is an optional extra (`pip install 'ontoink[shexer]'`) and asking for it without it installed degrades to `auto` with a notice rather than failing the build. Its SHACL serialiser needs three quirks normalised before its output can be compared with anything — `sh:dataType` with a capital T, object ranges expressed as `sh:node <OtherShape>` rather than `sh:class`, and a property shape for `rdf:type` itself — each a serialisation detail, none a change to what sheXer inferred.

Every method also declares its hyperparameters — name, type, default, range and what each one does — in one table that the fence, the API's `GET /recommend-methods`, the diagram panel and the SHACL Editor all read. **Knobs that do not change the output are deliberately absent.** `induce_baseline` takes a `max_samples` argument that caps retained sample values, which nothing in the method reads; exposing it would put a control on the panel that moves and does nothing.

Two more design decisions are worth stating:

- **Evidence travels with the constraint.** The research writers computed a confidence per constraint and dropped it during serialisation, which left a consumer unable to distinguish a constraint backed by 45 of 45 instances from one backed by 9 of 10. Emitted shapes now carry `sh:description` plus `oi:confidence`, `oi:support`, `oi:population` and `oi:method`. These are annotations — a SHACL processor ignores them, so the output is still a plain shapes graph you can hand to `pyshacl` unchanged.
- **Nothing is written on the user's behalf.** A suggestion can be copied, or appended to the Edit & Validate buffer, and that is where it stops. The proposal has to survive the user pressing *Validate* before they decide to keep it; a recommender that edits source files is one that has to be right every time.

### Client-side SPARQL Autocomplete

The SPARQL query editor provides Wikidata-style autocomplete:

- **Ctrl+Space** triggers the popup
- Fuzzy matching searches across IRI, label, and prefixed name simultaneously
- Classes, properties, and SPARQL keywords are all suggested with color-coded type badges
- Selecting an item inserts the full `<IRI>` into the query

### Automatic Ontology Label Resolution

OntoInk automatically fetches and caches labels from all ontologies referenced in the graph:

1. **On graph init** — collects all unique namespaces from nodes/edges and fetches ontology files in the background
2. **Known ontology registry** — maps namespaces to CORS-friendly download URLs (GitHub Pages, raw GitHub, W3C), bypassing servers that redirect without CORS headers (e.g., `nfdi.fiz-karlsruhe.de → ise-fizkarlsruhe.github.io`)
3. **Dual parser strategy** — merges results from a fast minimal parser with a robust line-based parser that handles complex OWL TTL (nested blank nodes, collections, multi-line strings)
4. **Label propagation** — resolved labels are used in:
   - Click popups ("More..." shows label, comment, type, subclass, deprecation status)
   - SPARQL autocomplete (Ctrl+Space shows `"contributor role"` + `NFDI_0000118`)
   - SPARQL class/property dropdowns (`contributor role (NFDI_0000118)` instead of just `NFDI_0000118`)
   - Query results (IRIs rendered as `label (prefixed:name)`)
5. **SPARQL Explorer endpoint fallback** — when the triplestore lacks labels, fetches ontology source files directly and extracts `rdfs:label`/`skos:prefLabel` from Turtle and RDF/XML
