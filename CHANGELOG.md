# Changelog

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
