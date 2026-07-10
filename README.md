# ontoink

**Interactive ontology visualization, SHACL validation, and live TTL editing for MkDocs.**

[![CI](https://github.com/ISE-FIZKarlsruhe/ontoink/actions/workflows/ci.yml/badge.svg)](https://github.com/ISE-FIZKarlsruhe/ontoink/actions/workflows/ci.yml)
[![PyPI](https://img.shields.io/pypi/v/ontoink)](https://pypi.org/project/ontoink/)
[![Python](https://img.shields.io/pypi/pyversions/ontoink)](https://pypi.org/project/ontoink/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

ontoink is a MkDocs plugin that transforms RDF/Turtle files into interactive, publication-ready ontology diagrams with SHACL constraint visualization. Write a simple code block in your markdown, and ontoink generates a fully interactive graph.

**[Live Demo](https://ise-fizkarlsruhe.github.io/ontoink/)**

## Features

### Interactive Graph Visualization
- Formal ontology notation with distinct shapes per element type
- Multiple layouts: dagre (hierarchical), force-directed, circle, concentric, tree, grid
- Pan, zoom, fullscreen, fuzzy search with highlight
- Color-coded by ontology source (BFO, IAO, FOAF, Schema.org, etc.)
- Minimap for navigation on large graphs
- Auto-focus on most-connected node for large ontologies (>30 nodes)

### Click Popups & IRI Dereferencing
- Node label, type badge, full IRI (clickable)
- Copy Label / Copy IRI buttons
- Ontology source indicator
- Connected edges (incoming/outgoing)
- SHACL constraints applicable to the node
- **"More..." button** with automatic ontology dereferencing — fetches `rdfs:label`, `rdfs:comment`, type, subclass, and more from the original ontology source via content negotiation
- **Known ontology registry** — bypasses CORS-broken redirects for nfdicore, BFO, IAO, RO, FOAF, Schema.org, SKOS
- **Robust OWL parser** — handles complex Protégé-style TTL with nested blank nodes and collections
- Scrollable popup with `max-height: 70vh` for large result sets

### SHACL Constraint Overlay
- Constraints shown as bold dashed cyan edges with cardinality badges `[1..*]`
- Build-time validation using pySHACL
- Violations highlighted in the validation panel

### Inline TTL Editor + Live Validation
- Expandable editor panel below each diagram
- CodeMirror with Turtle syntax highlighting
- Edit TTL data and validate against SHACL shapes in real-time
- Update the graph live from edited TTL
- Reset to original data

### Export Preview + Publication-Ready Output
- **PNG export** — clicking PNG/SVG opens a preview dialog showing the final image
- Toggle options: include/exclude legend and namespace prefixes
- High-DPI (3x scale) with white background
- Legend rendered in a clean rounded box with proper shape icons and edge arrows
- Namespace prefixes shown as compact tags below the legend
- **SVG export** — vector graphics for papers and presentations
- **TTL download** — download the current (possibly edited) TTL data

### Edit Layout
- **Edit Layout** button opens a panel to customize the visualization
- Change colors per node type, edge type, and namespace
- Change node shapes (rectangle, ellipse, diamond, hexagon, triangle, star, etc.)
- Change edge line styles (solid, dashed, dotted) and arrow shapes
- Toggle prefix visibility

### OWL Reasoning
- **Reasoning** button shows inferred triples from OWL DL reasoning
- Powered by [HermiT](http://www.hermit-reasoner.com/) (via [owlready2](https://owlready2.readthedocs.io/)), with [owlrl](https://owl-rl.readthedocs.io/) fallback
- Infers subclass chains, inverse properties, transitive closures, symmetric relations
- **"Show on graph"** checkbox overlays inferred triples as purple dotted edges/nodes
- **"Validate with Inferences"** runs SHACL validation including inferred triples
- Smart filtering removes reflexive triples and built-in namespace noise

### Smart Namespace Legend
- Only active prefixes (used in the graph) shown by default
- "Show all" toggle reveals all declared prefixes
- Prefixes displayed as compact styled tags, separated from the main legend

### Graph Analytics
- **Statistics panel** with ontology metrics: class/property counts, hierarchy depth, triple count
- **Consistency check** via HermiT — green/red badge showing ontology consistency
- **SHACL coverage map** — color-codes classes by validation coverage
- **LOD Cloud links** — auto-detects linked open data sources (DBpedia, Wikidata, Schema.org, etc.)
- **Path finder** — Dijkstra shortest path between any two nodes with animated visualization
- **SPARQL queries** — run SELECT queries on the loaded graph, highlight results

### OntoSniff — Ontology Quality Checker
- **9 anti-pattern detectors** based on published research (Poveda-Villalón et al. 2014, Rector et al. 2004, Gangemi et al. 2006)
- Detects: lazy classes, missing labels, missing domain/range, singleton hierarchies, property soup, orphan classes, missing inverse, no SHACL coverage, label language gaps
- **Quality score** (0-100) with severity breakdown
- Integrated into the Stats panel for every diagram + standalone [OntoSniff page](https://ise-fizkarlsruhe.github.io/ontoink/ontosniff/)
- Shareable via URL: `?source=https://example.org/ontology.ttl`

### Browser-only Tools (no installation)
- **[Playground](https://ise-fizkarlsruhe.github.io/ontoink/playground/)** — paste or upload TTL and visualize instantly. Shareable via URL parameters.
- **[SHACL Editor](https://ise-fizkarlsruhe.github.io/ontoink/shacl-editor/)** — build SHACL shapes visually with templates, tooltips, live preview, and **Shape Recommender** that auto-generates constraints from instance data or SPARQL endpoints using data profiling (Mihindukulasooriya et al. 2018).
- **[SPARQL Explorer](https://ise-fizkarlsruhe.github.io/ontoink/sparql-explorer/)** — connect to any SPARQL endpoint, auto-discover schema, write queries with Ctrl+Space autocomplete. Adaptive discovery for large KGs (DBpedia, Wikidata). **Automatic label resolution** from ontology sources when the endpoint lacks `rdfs:label` — fetches nfdicore, BFO, IAO, FOAF, etc. directly.
- **[OntoSniff](https://ise-fizkarlsruhe.github.io/ontoink/ontosniff/)** — paste TTL and get instant quality analysis with a score and annotated anti-patterns.
- **Abstract Model View** — toggle between full graph and schema-only view (classes and class-level properties only).

## Architecture & Design Decisions

### Why ontoink?

Existing ontology visualization tools either require complex desktop installations (Protégé), produce static non-interactive diagrams (WebVOWL), or don't integrate with documentation workflows. ontoink fills this gap:

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

ontoink uses a two-stage reasoning approach:

1. **Primary: HermiT** (via owlready2) — full OWL DL tableau reasoner. Handles class hierarchy completion, inverse/transitive/symmetric property inference, consistency checking. Runs at MkDocs build time.
2. **Fallback: owlrl** — OWL-RL profile for environments without Java. Provides rdfs:subClassOf and basic property inference.
3. **Smart filtering** — removes reflexive triples (`x sameAs x`), built-in namespace noise (XSD, OWL, RDF, RDFS), and domain/range propagation to show only meaningful inferences.

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

| Feature | Original paper | ontoink extension |
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

### Client-side SPARQL Autocomplete

The SPARQL query editor provides Wikidata-style autocomplete:

- **Ctrl+Space** triggers the popup
- Fuzzy matching searches across IRI, label, and prefixed name simultaneously
- Classes, properties, and SPARQL keywords are all suggested with color-coded type badges
- Selecting an item inserts the full `<IRI>` into the query

### Automatic Ontology Label Resolution

ontoink automatically fetches and caches labels from all ontologies referenced in the graph:

1. **On graph init** — collects all unique namespaces from nodes/edges and fetches ontology files in the background
2. **Known ontology registry** — maps namespaces to CORS-friendly download URLs (GitHub Pages, raw GitHub, W3C), bypassing servers that redirect without CORS headers (e.g., `nfdi.fiz-karlsruhe.de → ise-fizkarlsruhe.github.io`)
3. **Dual parser strategy** — merges results from a fast minimal parser with a robust line-based parser that handles complex OWL TTL (nested blank nodes, collections, multi-line strings)
4. **Label propagation** — resolved labels are used in:
   - Click popups ("More..." shows label, comment, type, subclass, deprecation status)
   - SPARQL autocomplete (Ctrl+Space shows `"contributor role"` + `NFDI_0000118`)
   - SPARQL class/property dropdowns (`contributor role (NFDI_0000118)` instead of just `NFDI_0000118`)
   - Query results (IRIs rendered as `label (prefixed:name)`)
5. **SPARQL Explorer endpoint fallback** — when the triplestore lacks labels, fetches ontology source files directly and extracts `rdfs:label`/`skos:prefLabel` from Turtle and RDF/XML

## Installation

```bash
pip install ontoink
```

Or install from source:

```bash
pip install git+https://github.com/ISE-FIZKarlsruhe/ontoink.git
```

## Usage

### 1. Add to mkdocs.yml

```yaml
plugins:
  - search
  - ontoink

markdown_extensions:
  - pymdownx.superfences:
      preserve_tabs: true
```

### 2. Write ontoink blocks in markdown

````markdown
```ontoink
source: path/to/instance-data.ttl
shape: path/to/shacl-shape.ttl
```
````

### 3. Build or serve

```bash
mkdocs serve
```

### Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `source` | (required) | Path to TTL data file (relative to docs/) |
| `shape` | (optional) | Path to SHACL shape file |
| `height` | `500px` | Height of the graph canvas |
| `editor` | `true` | Show the "Edit & Validate" button |
| `legend` | `true` | Show the legend panel |
| `namespaces` | `true` | Show namespace prefixes |

### Full example

````markdown
```ontoink
source: shapes/foaf-person/shape-data.ttl
shape: shapes/foaf-person/shape.ttl
height: 600px
editor: true
legend: true
namespaces: true
```
````

## How It Works

1. **Build time (Python):** The plugin parses your TTL files with rdflib, classifies nodes (Class/Individual/Literal), resolves labels, detects ontology sources for color coding, extracts SHACL constraints, and runs pySHACL validation. The result is serialized as JSON and embedded in the HTML.

2. **Browser (JavaScript):** Cytoscape.js renders the graph with dagre layout. CodeMirror provides the TTL editor. A lightweight JavaScript SHACL checker enables live validation without server round-trips.

## Development

```bash
git clone https://github.com/ISE-FIZKarlsruhe/ontoink.git
cd ontoink
pip install -e ".[dev]"
pytest -v
```

### Demo site

```bash
cd demo
mkdocs serve
```

## Docker (production)

A production-ready image is provided that bundles ontoink, MkDocs, Java (for HermiT), and Node.js (for the Konclude WASM reasoner).

```bash
cp .env.sample .env       # edit ONTOINK_MODE and ONTOINK_REASONER
docker compose up --build
```

Configuration is environment-driven — see [`.env.sample`](.env.sample) for the full list:

| Variable | Values | Purpose |
|----------|--------|---------|
| `ONTOINK_MODE` | `serve` \| `build` \| `api` \| `all` | What the container runs: MkDocs dev server (docs only), one-shot static build, FastAPI endpoints (no docs), or **`all`** — combined docs + API on a single port (recommended for production self-hosting; the playground's "Server" reasoner option works because docs and `/reason` are same-origin) |
| `ONTOINK_REASONER` | `auto` \| `owlready2` \| `konclude` \| `owlrl` \| `none` | Which OWL reasoner to use (see below) |
| `ONTOINK_PORT` | integer | HTTP port for `serve` / `api` |

### Reasoner backends

| `ONTOINK_REASONER` | Profile | Engine | Notes |
|--------------------|---------|--------|-------|
| `owlready2` | OWL DL (HermiT) | Java, bundled with owlready2 | Default fallback; complete but Java-bound |
| `konclude` | OWL DL (SROIQ) | **Native [Konclude](https://github.com/konclude/Konclude)** C++ tableau binary | Upstream reasoner from University of Ulm; bundled in the production image. **Note**: Konclude requires OWL/XML input — TTL produced via rdflib is RDF/XML, a different format. For full inference from TTL playground/API input, use `owlready2` or `konclude-wasm`. `konclude` is best when you have a proper OWL/XML ontology |
| `konclude-wasm` | OWL DL (SROIQ) | **[rdf-reasoner-konclude](https://github.com/ThHanke/rdf-reasoner-konclude)** — Konclude compiled to WASM for **browsers and Node.js** | Java-free, no native binary needed |
| `owlrl` | OWL-RL | Pure Python | Fastest, weakest expressivity |
| `auto` | — | tries owlready2 → konclude → konclude-wasm → owlrl | Default |
| `none` | — | — | Disable reasoning |

### API mode

`ONTOINK_MODE=api` exposes:

- `POST /reason` — `{ttl, shacl?}` → inferred triples
- `POST /validate` — `{ttl, shacl}` → SHACL conformance report
- `GET /health` — health check incl. selected reasoner

## Requirements

- Python >= 3.9
- MkDocs >= 1.4
- rdflib >= 6.0
- pySHACL >= 0.25.0
- pymdown-extensions >= 10.0

Browser-side dependencies are loaded from CDN (no npm/bundling needed):
- Cytoscape.js, cytoscape-dagre, cytoscape-svg
- CodeMirror 5 with Turtle mode

## Contributing

Contributions are welcome. Please open an issue first to discuss proposed changes.

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure `pytest` passes — see [TESTING.md](TESTING.md) for the full local test guide (Python, JS, MkDocs demo, playground, and Docker)
5. Submit a pull request

## License

MIT License. See [LICENSE](LICENSE).

## Author

[Ebrahim Norouzi](https://ebrahimnorouzi.github.io/) — [FIZ Karlsruhe](https://www.fiz-karlsruhe.de/), [ISE](https://www.fiz-karlsruhe.de/en/forschung/information-service-engineering)

## Citing ontoink

If you use ontoink in published work, please cite this repository via the [`CITATION.cff`](CITATION.cff) file.

When you enable either Konclude backend (native via `ONTOINK_REASONER=konclude`, or WASM via `ONTOINK_REASONER=konclude-wasm`), please additionally cite the Konclude paper:

> Liebig, T., Jaeger, M., Möller, R., & Möller, B. (2014).
> Konclude: System Description.
> *Journal of Web Semantics*, 27-28, 78-85. [doi:10.1016/j.websem.2014.06.003](https://doi.org/10.1016/j.websem.2014.06.003)

The WASM port for **browsers and Node.js** is provided by Thomas Hanke's [`rdf-reasoner-konclude`](https://github.com/ThHanke/rdf-reasoner-konclude) (LGPL-3.0-or-later); see the [NOTICE](NOTICE) file for full attribution of all reasoner backends.

## Acknowledgments

- Developed in the context of [NFDI](https://www.nfdi.de/) and [NFDI-MatWerk](https://nfdi-matwerk.de/)
- Visual notation inspired by ontology diagramming best practices and formal OWL notation
- Interactive visualization powered by [Cytoscape.js](https://js.cytoscape.org/)
- Native OWL-DL reasoning via [Konclude](https://github.com/konclude/Konclude) (University of Ulm)
- OWL-DL reasoning in browsers and Node.js via [`rdf-reasoner-konclude`](https://github.com/ThHanke/rdf-reasoner-konclude), Thomas Hanke's WASM port of Konclude
- HermiT reasoning via [owlready2](https://owlready2.readthedocs.io/)
