# ontoview

**Interactive ontology visualization, SHACL validation, and live TTL editing for MkDocs.**

[![CI](https://github.com/ISE-FIZKarlsruhe/ontoview/actions/workflows/ci.yml/badge.svg)](https://github.com/ISE-FIZKarlsruhe/ontoview/actions/workflows/ci.yml)
[![PyPI](https://img.shields.io/pypi/v/ontoview)](https://pypi.org/project/ontoview/)
[![Python](https://img.shields.io/pypi/pyversions/ontoview)](https://pypi.org/project/ontoview/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

ontoview is a MkDocs plugin that transforms RDF/Turtle files into interactive, publication-ready ontology diagrams with SHACL constraint visualization. Write a simple code block in your markdown, and ontoview generates a fully interactive graph.

**[Live Demo](https://ise-fizkarlsruhe.github.io/ontoview/)**

## Features

### Interactive Graph Visualization
- Formal ontology notation with distinct shapes per type
- Hierarchical layout (dagre) optimized for ontology patterns
- Pan, zoom, fullscreen support
- Color-coded by ontology source (BFO, IAO, nfdicore, RO, PMD, QUDT, etc.)

### Visual Notation

| Element | Shape | Color |
|---------|-------|-------|
| Class | Yellow rectangle | By ontology source |
| Individual | Grey circle | `#E6E6E6` |
| Literal | Green ellipse | `#93D053` |
| Object Property | Blue solid line, filled arrow | `#2563eb` |
| Data Property | Green solid line, hollow arrow | `#16a34a` |
| rdf:type | Grey dashed line | `#9ca3af` |
| rdfs:subClassOf | Black solid line | `#374151` |
| SHACL Constraint | Cyan dashed bold line | `#0891b2` |

### Click Popups
- Node label, type badge, full IRI (clickable)
- Copy Label / Copy IRI buttons
- Ontology source indicator
- Connected edges (incoming/outgoing)
- SHACL constraints applicable to the node

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

### Publication-Ready Export
- PNG export (high-DPI, 3x scale, white background)
- SVG export (vector graphics for papers and presentations)

## Installation

```bash
pip install ontoview
```

Or install from source:

```bash
pip install git+https://github.com/ISE-FIZKarlsruhe/ontoview.git
```

## Usage

### 1. Add to mkdocs.yml

```yaml
plugins:
  - search
  - ontoview

markdown_extensions:
  - pymdownx.superfences:
      preserve_tabs: true
```

### 2. Write ontoview blocks in markdown

````markdown
```ontoview
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
| `namespaces` | `true` | Show namespace boxes in the legend |

### Full example

````markdown
```ontoview
source: shapes/role-bearer/shape-data.ttl
shape: shapes/role-bearer/shape.ttl
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
git clone https://github.com/ISE-FIZKarlsruhe/ontoview.git
cd ontoview
pip install -e ".[dev]"
pytest -v
```

### Demo site

```bash
cd demo
mkdocs serve
```

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
4. Ensure `pytest` passes
5. Submit a pull request

## License

MIT License. See [LICENSE](LICENSE).

## Author

[Ebrahim Norouzi](https://ebrahimnorouzi.github.io/) — [FIZ Karlsruhe](https://www.fiz-karlsruhe.de/), [ISE](https://www.fiz-karlsruhe.de/en/forschung/information-service-engineering)

## Acknowledgments

- Developed in the context of [NFDI](https://www.nfdi.de/) and [NFDI-MatWerk](https://nfdi-matwerk.de/)
- Inspired by [Graffoo](https://essepuntato.it/graffoo/) visual notation and [PMD Core Ontology](https://github.com/materialdigital/core-ontology) patterns
