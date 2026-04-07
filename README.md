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
- Formal ontology notation with distinct shapes per element type
- Hierarchical layout (dagre) optimized for ontology patterns
- Pan, zoom, fullscreen support
- Color-coded by ontology source (BFO, IAO, FOAF, Schema.org, etc.)

### Visual Notation

| Element | Shape | Default Color |
|---------|-------|---------------|
| Class | Rectangle (solid border) | By ontology source |
| Individual | Ellipse | `#E6E6E6` |
| Literal | Ellipse (dashed border) | `#93D053` |
| Object Property | Blue solid line, filled arrow | `#2563eb` |
| Data Property | Green line, hollow arrow | `#16a34a` |
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

### Export Preview + Publication-Ready Output
- **PNG export** — clicking PNG/SVG opens a preview dialog showing the final image
- Toggle options: include/exclude legend and namespace prefixes
- High-DPI (3x scale) with white background
- Legend rendered in a clean rounded box with proper shape icons and edge arrows
- Namespace prefixes shown as compact tags below the legend
- **SVG export** — vector graphics for papers and presentations
- **TTL download** — download the current (possibly edited) TTL data

### Color Customization
- **Colors** button in the toolbar opens a color settings panel
- Change colors per node type (Class, Individual, Literal)
- Change colors per namespace (all BFO nodes, all FOAF nodes, etc.)
- Changes apply live to the graph and are reflected in exports

### Smart Namespace Legend
- Only active prefixes (used in the graph) shown by default
- "Show all" toggle reveals all declared prefixes
- Unused prefixes shown dimmed
- Prefixes displayed as compact styled tags, separated from the main legend

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
| `namespaces` | `true` | Show namespace prefixes |

### Full example

````markdown
```ontoview
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
- Visual notation inspired by ontology diagramming best practices and formal OWL notation
- Interactive visualization powered by [Cytoscape.js](https://js.cytoscape.org/)
