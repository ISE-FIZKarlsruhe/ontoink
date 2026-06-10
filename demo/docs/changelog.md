# Changelog

All notable changes to ontoink are documented here.
This project follows [Semantic Versioning](https://semver.org/).

[:fontawesome-brands-python: View all releases on PyPI](https://pypi.org/project/ontoink/#history){ .md-button }
[:fontawesome-brands-github: View all tags on GitHub](https://github.com/ISE-FIZKarlsruhe/ontoink/tags){ .md-button }

---

## [0.6.3] — 2026-06-10

[:fontawesome-brands-python: PyPI](https://pypi.org/project/ontoink/0.6.3/)
 &middot; [:fontawesome-brands-github: Release](https://github.com/ISE-FIZKarlsruhe/ontoink/releases/tag/v0.6.3)

### Added

- **Full in-browser SHACL validation** — interactive **Validate** now runs a standards-compliant SHACL **Core** engine (`rdf-validate-shacl`) entirely in the browser, replacing the old cardinality-only checker. It catches `sh:datatype`, `sh:class`, `sh:nodeKind`, `sh:pattern`, value ranges, `sh:in`/`sh:hasValue`/`closed`, logical/shape-based constraints, property paths and inline blank-node shapes — verified against pyshacl. Ships as a committed same-origin bundle (`assets/shacl/shacl.mjs`), so it works on the static demo with no server. (SHACL-SPARQL constraints and SHACL-AF `sh:rule` still need the server/build-time pyshacl.)
- **Server-side ontology dereference proxy (`/deref`)** — a generic, CORS-free, SSRF-guarded alternative to the hard-coded mirror registry; the "More…" dereference prefers it when a server is reachable and works for any ontology (including FOAF)

### Fixed

- **Dead ontology-mirror URLs** — the BFO and IAO entries in the known-ontology registry returned 404 (files moved); nfdicore is now version-less. Browser dereferencing of those namespaces works again
- **Legend edge arrowheads** — the legend ignored the pointer shape chosen in *Edit Layout* and always drew a triangle; it now renders tee / vee / diamond / circle to match the graph
- **Playground "Edit & Validate" now has a SHACL Shapes pane** — the playground's editor was missing the shapes editor, so an uploaded or `?shape=`-linked SHACL file was never shown and validation ran against empty shapes. The panel now matches the fence-rendered editor (Source | SHACL Shapes + Validation Report)

---

## [0.6.2] — 2026-06-08

[:fontawesome-brands-python: PyPI](https://pypi.org/project/ontoink/0.6.2/)
 &middot; [:fontawesome-brands-github: Release](https://github.com/ISE-FIZKarlsruhe/ontoink/releases/tag/v0.6.2)

### Fixed

- **All four OWL reasoner backends now return inferences** — `owlready2`/HermiT, native `konclude`, and `konclude-wasm` each failed silently before (Turtle vs RDF/XML, OWL-XML output parsed as RDF/XML, N-Quads vs N-Triples), so only `owlrl` ever produced results. All four now work on OWL 2 property-restriction ontologies
- **`owl:equivalentClass` (and `intersectionOf`-nested) restrictions are now visualised** — previously only `rdfs:subClassOf` restrictions were drawn. The two are distinguished: `⊑` (solid triangle) for a necessary condition vs `≡` (hollow diamond) for a definition
- **Browser (in-page) Konclude WASM `Error: unwind`** — the Emscripten exit sentinel is now caught and the inferred graph harvested
- **Edit & Validate → Update Graph (and the playground) no longer destroy restrictions** — a new blank-node-aware client-side parser collapses `owl:Restriction` into the same `⊑`/`≡` edges as the server-rendered diagrams, instead of exploding into raw `[ ]`/`owl:Restriction` nodes

### Added

- **`reasoner:` fence option** — set a diagram's default reasoner backend, e.g. `reasoner: owlrl`
- **Comprehensive Reasoning & Inference demo** — [examples/reasoning-demo.md](examples/reasoning-demo.md) now walks every RDF/RDFS/OWL/OWL2 reasoning feature with a small self-contained example each

### Changed

- **OLS IRI-dereference link** — dropped the "Found in: N ontologies" line; the cross-ontology link now reads "Ontologies using this IRI on OLS"

---

## [0.6.1] — 2026-06-04

[:fontawesome-brands-python: PyPI](https://pypi.org/project/ontoink/0.6.1/)
 &middot; [:fontawesome-brands-github: Release](https://github.com/ISE-FIZKarlsruhe/ontoink/releases/tag/v0.6.1)

### Added

- **SHACL Shapes editor pane in *Edit & Validate*** — two-column editor (data TTL + SHACL shapes) with CodeMirror Turtle highlighting and a constraint-count in the report line
- **Resizable popups** — drag the bottom-right corner to enlarge a popup

### Fixed

- **"Ontologies reusing this IRI on OLS" link returned zero results** — now derives the OBO short ID (e.g. `IAO:0000300`) so OLS search matches
- **Sticky toolbar bleeding over host-page chrome** — `.ontoink-container` now isolates its stacking context

---

## [0.6.0] — 2026-05-17

### Added

- **Browser-side reasoning in the playground** — Reasoning button with backend dropdown (Auto / Browser Konclude WASM / Server backends). Browser option enabled when cross-origin isolated; server options enabled when `/health` reachable
- **COOP/COEP service worker** so the playground's WASM Konclude works on GitHub Pages without server-side header support
- **Per-request `reasoner` override on `POST /reason`** — clients can choose the backend without restarting the server
- **Playground parity** — Abstract View and reasoning panel match the MkDocs fence path
- **Production Docker image** with `ONTOINK_MODE` env switch (`serve` / `build` / `api` / **`all`**) and `ONTOINK_REASONER` selector. The new `all` mode builds the docs once and serves them via FastAPI on the same origin as `/reason` — so the playground's "Server" reasoner works without a reverse proxy
- **Konclude two-pass reasoning** — native Konclude wrapper runs both `classification` and `realization`. **Note**: Konclude expects OWL/XML input; for TTL input use `owlready2` or `konclude-wasm`
- **Native Konclude reasoner** (`ONTOINK_REASONER=konclude`) — upstream Konclude C++ tableau binary, downloaded into the production Docker image
- **rdf-reasoner-konclude** (`ONTOINK_REASONER=konclude-wasm`) — WASM Konclude port for **browsers and Node.js**, no Java required
- **FastAPI mode** — `/reason`, `/validate`, `/health` endpoints when `ONTOINK_MODE=api`
- **SHACL constraint edges in the playground** — shapes now render as cyan dashed cardinality-labelled edges, matching the MkDocs build path
- **SHACL shape IRI dereferencing** — labels and axioms auto-fetched for `sh:path`, `sh:targetClass`, `sh:class`, `sh:datatype`, `sh:node` IRIs on graph load
- **GitHub Actions workflow** to build & push the Docker image to GHCR on each `v*` tag
- **TESTING.md** with end-to-end manual test plan (Python, JS, MkDocs, playground, Docker)
- `.env.sample`, `NOTICE`, and `CITATION.cff` files for deployment config and third-party attribution

### Fixed

- **Reasoning UI lock state** — the Reasoning button and dropdown disable while reasoning runs, with a visible **Cancel** button. Server requests are aborted via `AbortController`
- **SPARQL autocomplete on macOS** — added `Alt+/` as a universal trigger; macOS reserves `Ctrl+Space` for input source switching by default
- **Browser WASM reasoner module loading** — switched from jsdelivr's `/+esm` to `esm.sh`
- **Demo pages looked unstyled in `all` mode** — switched `Cross-Origin-Embedder-Policy` from `require-corp` to `credentialless`
- **Legend and namespace overlay** now refresh when the layout is switched
- **Edit Layout customizations propagate to the legend** — node color / node shape / edge color / line style / arrow shape changes immediately update the on-page legend
- **PNG and SVG exports** now embed Edit Layout customizations in the legend (previously the export legend always showed default styles)

### Changed

- Reasoner selection is now user-configurable via env var

---

## [0.5.2] — 2026-04-17

[:fontawesome-brands-python: PyPI](https://pypi.org/project/ontoink/0.5.2/)
 &middot; [:fontawesome-brands-github: Release](https://github.com/ISE-FIZKarlsruhe/ontoink/releases/tag/v0.5.2)

### Fixed

- **Broken parsing of TTL with periods inside strings** — the statement splitter now respects quoted strings, so descriptions like `"...time frame. Every batch..."` no longer break parsing
- **Hyphenated prefixes not recognized** — prefixes like `samm-c:`, `ext-built:`, `ext-classification:` are now correctly captured

---

## [0.5.1] — 2026-04-17

[:fontawesome-brands-python: PyPI](https://pypi.org/project/ontoink/0.5.1/)
 &middot; [:fontawesome-brands-github: Release](https://github.com/ISE-FIZKarlsruhe/ontoink/releases/tag/v0.5.1)

### Fixed

- **Playground hang on non-HTTP namespaces** — `urn:`, `oid:`, and other non-HTTP URI schemes are skipped during auto-dereference

---

## [0.5.0] — 2026-04-10

[:fontawesome-brands-python: PyPI](https://pypi.org/project/ontoink/0.5.0/)
 &middot; [:fontawesome-brands-github: Release](https://github.com/ISE-FIZKarlsruhe/ontoink/releases/tag/v0.5.0)

### Highlight: Automatic Ontology Label Resolution

ontoink now **automatically fetches and resolves human-readable labels** from referenced ontologies. When your shape graph uses IRIs from nfdicore, BFO, IAO, or other ontologies, ontoink fetches the ontology source files and extracts `rdfs:label`, `rdfs:comment`, type information, and more — so you see `"contributor role"` instead of `NFDI_0000118` everywhere.

This works across:

- **Click popups** — "More..." shows label, comment, type, subclass, deprecation status
- **SPARQL autocomplete** — Ctrl+Space shows both human label and IRI local name
- **SPARQL class/property dropdowns** — `contributor role (NFDI_0000118)` instead of just `NFDI_0000118`
- **Query results** — IRIs rendered as `label (prefixed:name)`
- **SPARQL Explorer** — when the endpoint lacks labels, fetches ontology source files as fallback

### Added

- **Automatic ontology label resolution** — background fetch of all referenced ontology namespaces on graph init
    - Known ontology URL registry bypasses CORS-broken redirects for nfdicore, BFO, IAO, RO, FOAF, Schema.org, SKOS
    - Robust line-based OWL TTL parser handles Protégé-style files with nested blank nodes, collections, and `"""` strings
    - Dual parser strategy: merges results from minimal + robust parsers for maximum coverage
- **Enhanced IRI dereferencing** — "More..." button shows label, comment, type, subClassOf, deprecation, SKOS definitions, editorial notes
- **Scrollable popups** — popup containers capped at 70vh with overflow scroll; deref results independently scrollable
- **Sticky toolbar** — toolbar stays fixed at viewport top while scrolling
- **SPARQL Explorer ontology fallback** — fetches nfdicore, BFO, IAO, FOAF, etc. when endpoint lacks rdfs:label
- **SPARQL results with labels** — query result IRIs shown as `label (prefixed:name)`
- **SPARQL dropdowns always fresh** — class/property selects rebuild with latest labels every time panel opens
- **OntoSniff** — ontology smell detector with 9 anti-patterns, quality score (0-100), standalone page
- **SPARQL Explorer** — endpoint connection, schema discovery, query builder, Ctrl+Space autocomplete
- **Abstract Model View**, **Search & Highlight**, **Layout Switcher**, **Graph Statistics**, **Path Finder**, **Minimap**, **Neighborhood Focus**, **Playground**, **SHACL Editor**

### Fixed

- IRI dereferencing for nfdicore and ontologies with CORS-broken 302 redirects
- SPARQL Explorer label fetching with batch loading and ontology source fallback
- SPARQL dropdowns refresh labels on every panel open (not just first build)
- PNG/SVG export: minimap hidden, scale 2x, reliable overlay positioning

---

## [0.3.0] — 2026-04-09

[:fontawesome-brands-python: PyPI](https://pypi.org/project/ontoink/0.3.0/)
 &middot; [:fontawesome-brands-github: Release](https://github.com/ISE-FIZKarlsruhe/ontoink/releases/tag/v0.3.0)

### Added

- **OWL Reasoning** — [HermiT](http://www.hermit-reasoner.com/) reasoner (via [owlready2](https://owlready2.readthedocs.io/)) runs at build time for full OWL DL reasoning, with [owlrl](https://owl-rl.readthedocs.io/) fallback for OWL-RL profile
    - **Reasoning** toolbar button opens an inferences panel showing all inferred triples in a table
    - **"Show on graph"** checkbox overlays inferred triples as purple dotted edges and nodes
    - **"Validate with Inferences"** button runs SHACL validation with inferred triples included
    - Smart filtering removes reflexive triples, built-in namespace noise, and domain/range propagation
    - Configuration option: `reasoning: true/false` per diagram
- **OWL Reasoning demo** — new [example](examples/reasoning-demo.md) with class hierarchy, inverse, transitive, and symmetric properties
- **Draggable popups** — node and edge popups can be repositioned by dragging the header
- **Collapsible popup sections** — Connections and SHACL Constraints are collapsed by default (click to expand)
- **IRI dereferencing** — "More…" button in popups fetches structured data from the IRI via content negotiation
- **Prefix editing** — toggle prefix visibility from the Edit Layout panel

### Fixed

- Prefix overlay only shows prefixes declared in the TTL source (not rdflib built-ins like dc, dcterms, skos, etc.)
- Popup toggle sections work correctly for all node types (fixed special character issue in IRI-based IDs)
- PNG/SVG export captures the exact viewport with overlays at their on-screen positions

---

## [0.2.0] — 2026-04-08

[:fontawesome-brands-python: PyPI](https://pypi.org/project/ontoink/0.2.0/)
 &middot; [:fontawesome-brands-github: Release](https://github.com/ISE-FIZKarlsruhe/ontoink/releases/tag/v0.2.0)

### Added

- **Edge click popup** — click any edge to see its label, type, IRI, source/target nodes, cardinality, and copy buttons
- **Edit Layout panel** — renamed from "Colors"; now includes:
    - Node shape selector (rectangle, ellipse, diamond, hexagon, triangle, star, and more)
    - Edge line style selector (solid, dashed, dotted)
    - Edge arrow shape selector (triangle, vee, circle, diamond, chevron, none, and more)
    - Color pickers for node types, edge types, and namespace groups
- **Documentation site** — full Material for MkDocs documentation with getting started guide, examples, contributing guide, citation info, and changelog

### Fixed

- **Export layout fidelity** — PNG and SVG exports now capture the exact viewport the user sees (zoom, pan, node positions) instead of re-fitting all elements
- **Export overlay positioning** — legend and namespace prefix boxes are drawn at their actual on-screen positions (respects user dragging)
- **Export overlay sizing** — legend and prefix boxes match their DOM dimensions; font sizes aligned to CSS (11px entries, 12px titles, 10px prefixes)

### Changed

- Toolbar button renamed from "Colors" to "Edit Layout"
- Package renamed to `ontoink` (from `ontoviz`)

---

## [0.1.0] — 2026-04-07

[:fontawesome-brands-python: PyPI](https://pypi.org/project/ontoink/0.1.0/)
 &middot; [:fontawesome-brands-github: Release](https://github.com/ISE-FIZKarlsruhe/ontoink/releases/tag/v0.1.0)

Initial public release.

### Added

- Interactive ontology visualization using Cytoscape.js with dagre layout
- Formal visual notation: classes (rectangles), individuals (ellipses), literals (dashed ellipses), datatypes (diamonds)
- Edge styles: object properties (blue), data properties (green), rdf:type (grey dashed), rdfs:subClassOf (black), SHACL constraints (cyan dashed bold)
- SHACL constraint overlay with cardinality badges `[min..max]`
- Click popup for nodes with IRI, type badge, ontology source, connections, copy buttons
- Inline TTL editor with CodeMirror and Turtle syntax highlighting
- Live SHACL validation with constraint checking (browser-side)
- Build-time SHACL validation using pySHACL
- Publication-ready PNG (3x hi-DPI) and SVG export with legend and namespace boxes
- Auto-generated interactive legend (draggable, resizable)
- Namespace prefix overlay with "show all" toggle
- Toolbar: zoom in/out, fit, fullscreen, export PNG/SVG/TTL, colors
- Color coding by ontology source (BFO, IAO, nfdicore, RO, OBI, PMD, QUDT, Schema.org, FOAF)
- Color customization panel for node types and namespace groups
- MkDocs plugin with `pymdownx.superfences` custom fence integration
- Configuration options: source, shape, height, editor, legend, namespaces
- Demo site with GitHub Pages deployment
- Comprehensive test suite with pytest (20 tests)
