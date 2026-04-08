# Changelog

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
