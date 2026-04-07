# Changelog

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
