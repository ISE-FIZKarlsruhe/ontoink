# Changelog

All notable changes to ontoink are documented here.
This project follows [Semantic Versioning](https://semver.org/).

[:fontawesome-brands-python: View all releases on PyPI](https://pypi.org/project/ontoink/#history){ .md-button }
[:fontawesome-brands-github: View all tags on GitHub](https://github.com/ISE-FIZKarlsruhe/ontoink/tags){ .md-button }

---

## [0.7.2] — 2026-07-15

[:fontawesome-brands-python: PyPI](https://pypi.org/project/ontoink/0.7.2/)
 &middot; [:fontawesome-brands-github: Release](https://github.com/ISE-FIZKarlsruhe/ontoink/releases/tag/v0.7.2)

### Added — Embeddable, CSP-safe build

- **`ontoink.embed(el, {ttl, shape, layout, height, editor, reasoning})`** — mount an interactive ontoink diagram from a Turtle string into any element on any page, no MkDocs required. It builds the toolbar/canvas/panels, parses the TTL client-side (the same path as `ontoink.playground`), and returns the container id. `shape` overlays SHACL constraints; `layout` sets the initial layout. See the new [Embedding](embedding.md) guide.
- **`scripts/build_embed_bundle.py`** — bundles the vendored libraries + the ontoink runtime into a single self-contained `dist/ontoink.embed.js` (+ `dist/ontoink.embed.css`). Drop the two files next to your page, add a `<div class="ontoink-embed">`, and call `ontoink.embed()`.

### Changed — CSP-safe by default (no inline handlers, no CDN)

- **Every event handler is now CSP-safe.** All inline `on*=` handlers — in the fence toolbar and the runtime-generated panels/popups — are emitted as `data-oi-on*` attributes and attached with `addEventListener` by a small, eval-free interpreter (plus a `MutationObserver` for dynamically-created UI). ontoink now runs under a strict `Content-Security-Policy` (`script-src 'self'`, no `'unsafe-inline'`), both embedded and on its own MkDocs pages.
- **Third-party libraries are self-hosted, not loaded from a CDN.** Cytoscape, dagre, cytoscape-dagre, cytoscape-svg and CodeMirror (+ turtle mode) are vendored under `ontoink/resources/vendor/`; the plugin copies them into the built site (`on_files` → `<site>/vendor/`) and injects local `<script>` tags. Pages now build and run fully offline and behind strict CSPs.

### Fixed

- **API version drift** — `ontoink.api` (`/health`, the FastAPI app title, and the deref `User-Agent`) reported `0.6.3` while the package had moved to `0.7.x`; it now reports the current version.

---

## [0.7.1] — 2026-07-10

[:fontawesome-brands-python: PyPI](https://pypi.org/project/ontoink/0.7.1/)
 &middot; [:fontawesome-brands-github: Release](https://github.com/ISE-FIZKarlsruhe/ontoink/releases/tag/v0.7.1)

### Fixed — Live-editor DSL parser

- **`@prefix ee: <http://ex#>` no longer reports "unterminated <IRI>"** — the line-comment stripper treated any `#` as a comment start, so `@prefix` lines whose namespace ended in `#` (the canonical form for RDFS / OWL) were silently truncated and the closing `>` disappeared. Fixed by tracking `<IRI>` context in the stripper. User-declared prefixes now surface correctly in the Prefixes overlay and the generated Turtle.
- **Empty-prefix CURIE `:Person` is accepted** — the parser used to silently drop any triple that started with a `:` (Turtle default namespace); `:Local` is now a first-class CURIE.
- **Typo detector for arrow shortcuts** — `-is->`, `-A->`, `-chian->`, and any bare-identifier arrow within Levenshtein distance ≤ 2 of a known shortcut now emits an error suggesting the correct one (`did you mean -isa-> ?`) plus the shortcut vocabulary.
- **Every parser error now carries a plain-English hint** — a second line under the error explains what an IRI, a CURIE, or a predicate arrow is, so non-experts learn how to fix it, not just where it broke.

### Fixed — Type inference

- **Rank-tiered strength**: an explicit `rdf:type` (or a vocabulary-position class) beats an inferred kind from a predicate signature; no more `owl:ObjectProperty` demoted to `DatatypeProperty` because someone hangs `rdfs:label` off it.
- **All conflict pairs reported**, not just the first-seen one.
- **Well-known annotation properties** (`rdfs:label`, `rdfs:comment`, `skos:definition`, `dc:title`, `dcterms:description`) are typed as `owl:AnnotationProperty` when they take a literal.
- **SHACL predicates feed the inference table**: `sh:path`, `sh:targetClass`, `sh:datatype`, `sh:class`, `sh:target[Objects|Subjects]Of`, `sh:node`, `sh:property`.
- **Datatype ⊑ Class subsumption** accepted in `_kindsCompatible`, so `xsd:integer` on a range doesn't fire a spurious conflict.
- **`undefined:undefined` gone from evidence labels** — full-IRI subjects now get a short label from the trailing path segment.
- **`xsd:*` on `rdfs:domain`** types the subject as `owl:DatatypeProperty`, not `owl:ObjectProperty`.

### Fixed — Rendering

- **Property chains and boolean class expressions collapse `rdf:List` scaffolding.** `owl:propertyChainAxiom`, `owl:intersectionOf`, and `owl:unionOf` no longer leak `_:list0` / `_:list1` / `rdf:first` / `rdf:rest` / `rdf:nil` bubbles into the diagram. Chain axioms render as `chain 1..N`, intersections as `and 1..N`, unions as `or 1..N`.

### Changed — Live editor UX

- **Line-number gutter** next to the DSL editor — errors that reference "line 12, column 5" are now visually locatable, and clicking an error row jumps the caret to that position.
- **Warnings are amber, not red** — the diagnostic strip distinguishes hard parse errors from type-inference warnings with a coloured kind pill and a hint line under the message.
- **Playground-parity super-node + hull expand/collapse taps** — clustered views behave the same everywhere.
- **Prefixes overlay filters to referenced prefixes only.**
- **Widened live-editor layout** — the mkdocs content column is widened via a `:has(#live-editor-app)` guard (leaves other docs pages untouched), the right-hand TOC is hidden on this page, and pane heights use `clamp()` so tall monitors give the graph more room without breaking mobile stacking.
- **Node / Edge popups + Legend + Prefixes overlays wired into the live editor** — the same panels the fence graphs use.

---

## [0.7.0] — 2026-07-09

[:fontawesome-brands-python: PyPI](https://pypi.org/project/ontoink/0.7.0/)
 &middot; [:fontawesome-brands-github: Release](https://github.com/ISE-FIZKarlsruhe/ontoink/releases/tag/v0.7.0)

### Added

- **Big-ontology mode — Semantic-Tile bundle** — a coordinated set of build-time + runtime knobs that lets one ontoink diagram scale from a tiny example to a 100 000-triple ontology without swamping the browser. Opt-in: a fence with no YAML config still renders exactly the same graph 0.6.1 rendered.
    - **Build-time literal-fold + predicate-policy YAML config** — `predicates: { hide_predicates, fold_into_badge, badge_predicates }` (CURIEs resolve against the source graph's own prefixes; `prov:*` wildcards match by namespace URI). Folded literals migrate into `node_badges`; hidden predicates are dropped wholesale.
    - **Leiden clustering with LLM-titled super-nodes and JSON side-store** — needs `ontoink[cluster]` (python-igraph + leidenalg). `ontoink[topic]` (anthropic + openai) additionally names each community; a missing library or missing API key falls back to a deterministic synthetic title.
    - **Element-removing semantic zoom (L0..L6) slider** — new toolbar slider, default L2. L0 = super-nodes + top-K central classes only, L6 = everything (SHACL + inferred).
    - **Attic side panel for reversible progressive disclosure** — every element hidden by the LOD slider is snapshotted into a per-diagram Attic; a pin button re-adds it to the canvas regardless of the slider.
    - **SPARQL endpoint result graphs get the same LOD slider + Attic** — SELECT rows projecting `?s ?p ?o` now materialise into the live graph, are sanitised through the same `predicates:` policy, and settle into the Attic when hidden. Community detection stays build-time only.
- **Optional dependency groups** — `[cluster]` (python-igraph + leidenalg) for community detection, `[topic]` (anthropic + openai) for super-node titling. Neither is required for the default rendering path.

### Changed

- **Fence toolbar** gains a new group between search and export: LOD slider + LOD value badge + **Attic** button + **Super** checkbox.
- **Super-node styling** — hexagon with a double 3-px cyan border, chunkier font, and a `·N` member count in the label. Clicking a super-node expands / collapses its community; the ordinary node popup does not fire.
- **CSS design tokens** — new `--ov-attic-*`, `--ov-super-*`, `--ov-badge-*`, `--ov-restriction-*` tokens make every new control themable via Edit Layout.

### Fixed

- **No-config regression** — the predicate policy compiles to empty sets when no policy is given, so `parse_ttl_to_cytoscape(path)` returns the exact triple-by-triple output shape 0.6.1 emitted. Verified by the existing test suite (83 passed, 4 skipped, no test changes).
- **Attic z-index isolation** — the panel sits inside `.ontoink-container` (which is `isolation: isolate` since 0.6.1) so its `z-index: 400` cannot escape over the host site's sticky chrome.

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
- **Playground "Edit & Validate" now has a SHACL Shapes pane** — the playground's editor was missing the shapes editor, so an uploaded or `?shape=`-linked SHACL file was never shown and validation ran against empty shapes. The panel now matches the fence-rendered editor (Source | SHACL Shapes + Validation Report), and validation falls back to the loaded shapes so `?data=…&shape=…` links validate even before the editor is opened

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
