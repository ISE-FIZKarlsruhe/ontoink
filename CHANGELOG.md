# Changelog

## [Unreleased] — targeting 0.6.0

### Added
- **Unified interactive Reasoning UI on every ontoink graph** (not just the playground) — fence-rendered diagrams in the demo home and `/ontosniff/` now get the same reasoner dropdown with progress status, elapsed-ms timing, scrollable log panel, and Download / Copy buttons for inferred triples
- **Persisted reasoning runs** — each `/reason` call writes `input.ttl`, `inferences.json`, and `inferences.nt` to a mounted volume (`ONTOINK_OUTPUT_DIR`, default `/output`). One timestamped subdirectory per request. Docker-compose mounts `./output:/output` automatically
- **Pytest suite for reasoners + API** — `tests/test_reasoners.py` and `tests/test_api.py` cover each backend's dispatch contract and every endpoint (health, reason, validate, output persistence, reasoner override). Backends without a binary skip cleanly; 52 tests pass, 2 skip on non-Docker hosts
- **Browser-side OWL-DL reasoning in the playground** — Reasoning button with backend dropdown (Auto / Browser WASM Konclude / Server: native Konclude / HermiT / WASM CLI / OWL-RL). Options are auto-detected: browser is enabled only when the page is cross-origin isolated, server options are enabled only when `/health` is reachable
- **`coi-serviceworker`** vendored at [`demo/docs/assets/coi-serviceworker.js`](demo/docs/assets/coi-serviceworker.js) so the playground's WASM Konclude works on GitHub Pages (no server-side header support required). Registers from `mkdocs.yml` via `extra_javascript`
- **COOP/COEP middleware** on the FastAPI `/reason` endpoint for self-hosted deployments
- **`reasoner` field on POST /reason** — clients can override the server's default `ONTOINK_REASONER` per request without restarting the container
- **Playground parity** — Abstract View and reasoning panel are now wired in the browser playground, matching the MkDocs fence path
- **Production Docker image** with `ONTOINK_MODE` env switch (`serve` / `build` / `api` / `all`) and `ONTOINK_REASONER` selector. `all` mode builds the docs once and serves them via FastAPI on the same origin as `/reason`, so the playground's "Server" reasoner option works without a reverse proxy
- **Konclude two-pass classification + realization** — native Konclude wrapper now invokes both subcommands and merges results. **Note**: Konclude expects OWL/XML input (different from rdflib's RDF/XML); for full inference from TTL input use `owlready2` or `konclude-wasm`
- **Native Konclude reasoner** (`ONTOINK_REASONER=konclude`) — upstream Konclude C++ tableau binary from University of Ulm, downloaded and installed in the production Docker image
- **rdf-reasoner-konclude integration** (`ONTOINK_REASONER=konclude-wasm`) — OWL-DL tableau reasoning via WASM Konclude for **browsers and Node.js**, no Java required. Ships with a thin CLI wrapper (`owl-reason`) compensating for an upstream packaging gap
- **FastAPI mode** — `/reason`, `/validate`, `/health` endpoints when `ONTOINK_MODE=api` (optional extra `pip install ontoink[api]`)
- **SHACL constraint edges in the playground** — `sh:path` / `sh:targetClass` shapes now render as cyan dashed cardinality-labelled edges, matching the MkDocs build path. Shapes with no instance data render against the targetClass and a placeholder target (`sh:class` / `sh:node` / `sh:datatype`).
- **SHACL shape IRI dereferencing** — labels and axioms auto-fetched for `sh:path`, `sh:targetClass`, `sh:class`, `sh:datatype`, `sh:node` IRIs on graph load
- **GitHub Actions workflow** to build & push the Docker image to GHCR on each `v*` tag (`.github/workflows/docker.yml`)
- **TESTING.md** with end-to-end manual test plan (Python, JS, MkDocs, playground, Docker)
- **.env.sample**, **NOTICE**, and **CITATION.cff** files documenting deployment config and third-party attribution

### Fixed
- **Browser WASM reasoner "Worker error"** — three independent issues stacked. Each is now addressed:
  1. The Web Worker was spawned cross-origin (esm.sh) and Chromium refused to start it.
  2. The bundle's `new Worker(new URL("./worker.js", import.meta.url))` requires `worker.js` to live next to the bundle, but it was never copied.
  3. `konclude.mjs` (Emscripten output) starts with a top-level `import { createRequire } from "module"` that throws in browsers — the `require()` it sets up is only used in Node-only branches.
  The Docker image now ships a same-origin esbuild bundle of rdf-reasoner-konclude + n3 at `/assets/reasoner/bundle.mjs`, with `worker.js`, `konclude.wasm`, and a patched `konclude.mjs` (browser-safe `require` stub) alongside. The JS loader prefers this vendored bundle and falls back to esm.sh only if it is unreachable.
- **Reasoning panel UX overhaul** —
  - Panel **no longer toggles off** on a second Reasoning click; cached results stay visible. Use the explicit ↻ Re-run button to redo reasoning.
  - **Statistics row** at the top of the result panel: inferred-triple count, elapsed ms, distinct subjects, distinct predicates, backend used.
  - **Show inferences on graph** checkbox — toggles inferred elements as a distinct purple-dotted overlay (`edgeType: "inferred"`), customisable from Edit Layout like every other edge type.
  - **Stop button** is now styled as a clear `⏹ Stop` action chip; on cancel, the request is aborted via `AbortController` and the UI re-enables cleanly.
  - **Retry** button on errors so the user can rerun without closing the panel.
  - **Reasoning logs** auto-expand when an error happens (you see what failed without clicking around).
- **Reasoning UI lock state** — the Reasoning button and reasoner dropdown are now disabled while a request is in flight, with a visible Cancel button. Server requests are aborted via `AbortController` when the user cancels
- **SPARQL autocomplete on macOS** — added `Alt+/` as a universal trigger because macOS reserves `Ctrl+Space` for input source switching by default. Hint text adapts to the user's platform
- **Browser WASM reasoner module loading** — switched from jsdelivr's `/+esm` to `esm.sh` (n3 is CommonJS and jsdelivr couldn't transpile it cleanly)
- **Demo pages looked unstyled in `all` mode** — switched `Cross-Origin-Embedder-Policy` from `require-corp` to `credentialless`, so cross-origin assets (Google Fonts, etc.) load without requiring every resource to set CORP
- **Legend and namespace overlay** now refresh when the layout is switched
- **Edit Layout customizations now propagate to the legend** — changing a node color, node shape, edge color, edge line style, or edge arrow shape immediately updates the legend in the page
- **PNG and SVG exports** now include Edit Layout customizations in the embedded legend (previously the legend in exports always showed the default colors and shapes regardless of edits)

### Changed
- Reasoner selection is now user-configurable via env var (was implicitly owlready2 → owlrl)

## [0.5.2] - 2026-04-17

### Fixed
- **Broken parsing of TTL with periods inside strings** — the statement splitter now respects quoted strings, so descriptions like `"...time frame. Every batch..."` no longer break parsing
- **Hyphenated prefixes not recognized** — prefixes like `samm-c:`, `ext-built:`, `ext-classification:` are now correctly captured (`\w` → `[\w-]` in prefix regex)

## [0.5.1] - 2026-04-17

### Fixed
- **Playground hang on non-HTTP namespaces** — `urn:`, `oid:`, and other non-HTTP URI schemes are skipped during auto-dereference

## [0.5.0] - 2026-04-10

### Added
- **OntoSniff** — ontology smell detector with 9 anti-patterns based on published research
    - Lazy Class, Missing Label, Missing Domain/Range, Singleton Hierarchy, Property Soup, Orphan Class, Missing Inverse, No SHACL Coverage, Label Language Gap
    - Quality score (0-100), integrated into Stats panel, standalone page with URL sharing
- **SPARQL Explorer** — connect to SPARQL endpoints, auto-discover schema, visual query builder with Ctrl+Space autocomplete, adaptive discovery for large KGs
- **OntoSniff page** with ?source= URL parameter for shareable reports
- **SPARQL Explorer page** with ?endpoint= URL parameter
- **Abstract Model View** — toggle button showing only classes and class-level edges
- **Search & Highlight** — fuzzy search in toolbar with real-time node/edge filtering
- **Layout Switcher** — dagre, force, circle, concentric, tree, grid layouts
- **Graph Statistics** — ontology metrics (12 cards), consistency badge, LOD links, SHACL coverage map
- **Path Finder** — Dijkstra shortest path with animated visualization
- **Built-in SPARQL** — query local graph with templates, class/property dropdowns, Ctrl+Space autocomplete
- **Minimap** — viewport overview in top-right corner
- **Neighborhood Focus** — auto-focus for large graphs (>30 nodes)
- **Playground** — full toolbar with all features (search, layout, stats, paths, SPARQL)
- **SHACL Editor** — load TTL, add/remove prefixes, tooltip help, class/property dropdowns with suggestions
- Close (×) button on all panels (Stats, Paths, SPARQL, Reasoning, Editor)
- **Automatic ontology label resolution** — on graph init, fetches and caches labels from all referenced ontologies
    - Known ontology URL registry bypasses CORS-broken redirects (nfdicore, BFO, IAO, RO, FOAF, Schema.org, SKOS)
    - Robust line-based OWL TTL parser handles nested blank nodes, collections, and multi-line strings
    - Labels propagated to click popups, SPARQL autocomplete, class/property dropdowns, and query results
- **Enhanced IRI dereferencing** — "More..." button in popups shows label, comment, type, subclass, deprecation, SKOS definitions from fetched ontology data
- **Scrollable popups** — popup and deref results scroll within bounded containers
- **Sticky toolbar** — toolbar stays fixed at top while scrolling the page
- **SPARQL Explorer ontology fallback** — when endpoint lacks labels, fetches ontology source files directly and extracts rdfs:label/skos:prefLabel
- **SPARQL results with labels** — query results render IRIs as `label (prefixed:name)` instead of bare IRIs

### Fixed
- SPARQL Explorer label fetching: batch loading, multiple predicates (rdfs:label, skos:prefLabel, schema:name), FILTER IN fallback
- PNG/SVG export: minimap hidden, scale 2x, reliable overlay positioning
- IRI dereferencing for nfdicore and other ontologies with CORS-broken redirects
- SPARQL dropdowns now refresh labels every time the panel is opened (not just on first build)

## [0.4.0] - 2026-04-09

### Added
- **OWL Reasoning** — HermiT reasoner (via owlready2) runs at build time, with owlrl fallback
    - Reasoning toolbar button with inferred triples panel (table view)
    - "Show on graph" checkbox to overlay inferred triples as purple dotted edges/nodes
    - "Validate with Inferences" button to run SHACL validation with inferred triples included
    - Smart filtering: removes reflexive triples, built-in namespace noise, domain/range propagation
    - Configuration option: `reasoning: true/false` per diagram
- **OWL Reasoning demo** — new example with class hierarchy, inverse/transitive/symmetric properties
- **Draggable popups** — node and edge popups can be moved by dragging the header
- **Collapsible popup sections** — Connections and SHACL Constraints collapse by default, click to expand
- **IRI dereferencing** — "More…" button fetches structured data (JSON-LD) from the IRI
- **Prefix editing** — toggle prefix visibility in the Edit Layout panel

### Fixed
- Prefix overlay now only shows prefixes declared in the TTL source (not rdflib built-ins)
- Popup sections work for all node types (fixed special character issue in IDs)
- PNG/SVG export captures the exact viewport with overlays at their on-screen positions

## [0.2.0] - 2026-04-08

### Added
- Edge click popup — click any edge to see label, type, IRI, source/target, cardinality, and copy buttons
- Edit Layout panel (renamed from "Colors") with node shape selector, edge line style, edge arrow shape, and color pickers
- Full documentation site with Material for MkDocs: getting started guide, all 5 examples, contributing guide, citation info, changelog

### Fixed
- PNG/SVG export now captures the exact viewport (zoom, pan, node positions) instead of re-fitting
- Export overlay positioning: legend and prefix boxes drawn at their actual on-screen positions
- Export overlay sizing: box dimensions and font sizes now match the DOM overlays

### Changed
- Toolbar button renamed from "Colors" to "Edit Layout"

## [0.1.0] - 2026-04-07

### Added
- Interactive ontology visualization using Cytoscape.js with dagre layout
- Formal visual notation: classes (yellow rectangles), individuals (grey circles), literals (green ellipses)
- Edge styles: object properties (blue), data properties (green), rdf:type (grey dashed), subClassOf (black), SHACL constraints (cyan dashed bold)
- SHACL constraint overlay with cardinality badges `[min..max]`
- Click popup with IRI, type badge, ontology source, connections, copy buttons
- Inline TTL editor with CodeMirror (Turtle syntax highlighting)
- Live SHACL validation with constraint checking
- Build-time validation using pySHACL
- Publication-ready PNG and SVG export
- Auto-generated legend with node types, edge types, and namespace boxes
- Toolbar: zoom, fit, fullscreen, export
- Color coding by ontology source (BFO, IAO, nfdicore, RO, OBI, PMD, QUDT, etc.)
- MkDocs plugin with `pymdownx.superfences` custom fence integration
- Demo site with GitHub Pages deployment
- Comprehensive test suite with pytest
