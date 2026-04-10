# Changelog

All notable changes to ontoink are documented here.
This project follows [Semantic Versioning](https://semver.org/).

[:fontawesome-brands-python: View all releases on PyPI](https://pypi.org/project/ontoink/#history){ .md-button }
[:fontawesome-brands-github: View all tags on GitHub](https://github.com/ISE-FIZKarlsruhe/ontoink/tags){ .md-button }

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
