# Changelog

All notable changes to ontoink are documented here.
This project follows [Semantic Versioning](https://semver.org/).

[:fontawesome-brands-python: View all releases on PyPI](https://pypi.org/project/ontoink/#history){ .md-button }
[:fontawesome-brands-github: View all tags on GitHub](https://github.com/ISE-FIZKarlsruhe/ontoink/tags){ .md-button }

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
