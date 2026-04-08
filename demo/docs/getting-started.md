# Getting Started

## Installation

Install ontoink from [PyPI](https://pypi.org/project/ontoink/):

```bash
pip install ontoink
```

Or install the latest development version directly from GitHub:

```bash
pip install git+https://github.com/ISE-FIZKarlsruhe/ontoink.git
```

### Requirements

- Python >= 3.9
- MkDocs >= 1.4

All other dependencies (rdflib, pySHACL, pymdown-extensions) are installed automatically.

Browser-side libraries are loaded from CDN — no npm or bundling needed:

- [Cytoscape.js](https://js.cytoscape.org/) + dagre layout + SVG export
- [CodeMirror 5](https://codemirror.net/5/) with Turtle syntax mode

---

## Setup

### 1. Configure `mkdocs.yml`

Add `ontoink` to your plugins and enable `pymdownx.superfences`:

```yaml
plugins:
  - search
  - ontoink

markdown_extensions:
  - pymdownx.superfences:
      preserve_tabs: true
```

### 2. Prepare your data

Place your RDF/Turtle files inside the `docs/` directory. A typical layout:

```
docs/
  shapes/
    my-example/
      data.ttl       # Instance data (individuals, triples)
      shape.ttl      # SHACL shape constraints
  index.md
```

### 3. Write an ontoink block

In any markdown page, use a fenced code block with the `ontoink` language:

````markdown
```ontoink
source: shapes/my-example/data.ttl
shape: shapes/my-example/shape.ttl
height: 600px
```
````

### 4. Build or serve

```bash
mkdocs serve       # development preview
mkdocs build       # production build
```

---

## Configuration Options

Each `ontoink` code block accepts these YAML options:

| Option       | Default  | Description                                    |
|:-------------|:---------|:-----------------------------------------------|
| `source`     | required | Path to TTL data file (relative to `docs/`)    |
| `shape`      | optional | Path to SHACL shape file                       |
| `height`     | `500px`  | Height of the graph canvas                     |
| `editor`     | `true`   | Show the **Edit & Validate** button            |
| `legend`     | `true`   | Show the legend overlay                        |
| `namespaces` | `true`   | Show the namespace prefixes overlay            |

---

## Visual Notation

ontoink uses a formal visual notation for ontology elements:

### Nodes

| Element       | Shape                  | Default Color      |
|:--------------|:-----------------------|:-------------------|
| Class         | Rectangle (solid)      | By ontology source |
| Individual    | Ellipse                | `#E6E6E6`          |
| Literal       | Ellipse (dashed)       | `#93D053`          |
| Datatype      | Diamond                | `#93D053`          |
| SHACL Shape   | Round-rectangle        | `#A5F3FC`          |

### Edges

| Relation          | Style                          | Color     |
|:------------------|:-------------------------------|:----------|
| Object Property   | Solid line, filled arrow       | `#2563eb`  |
| Data Property     | Solid line, hollow arrow       | `#16a34a`  |
| rdf:type          | Dashed line, hollow arrow      | `#9ca3af`  |
| rdfs:subClassOf   | Solid line, filled arrow       | `#374151`  |
| SHACL Constraint  | Dashed bold line, filled arrow | `#0891b2`  |

### Ontology Source Colors

Classes are automatically color-coded by their source ontology:

| Ontology   | Color                                                     |
|:-----------|:----------------------------------------------------------|
| BFO        | :material-circle:{ style="color: #F556CB" } `#F556CB`    |
| IAO        | :material-circle:{ style="color: #F6A252" } `#F6A252`    |
| RO         | :material-circle:{ style="color: #F43F5E" } `#F43F5E`    |
| OBI        | :material-circle:{ style="color: #F5D5B1" } `#F5D5B1`    |
| nfdicore   | :material-circle:{ style="color: #7777BB" } `#7777BB`    |
| PMD        | :material-circle:{ style="color: #46CAD3" } `#46CAD3`    |
| QUDT       | :material-circle:{ style="color: #C9DBFE" } `#C9DBFE`    |
| Schema.org | :material-circle:{ style="color: #E8D44D" } `#E8D44D`    |
| FOAF       | :material-circle:{ style="color: #4682B4" } `#4682B4`    |

---

## Toolbar Reference

Every ontoink diagram comes with a toolbar:

| Button             | Action                                                    |
|:-------------------|:----------------------------------------------------------|
| **+** / **-**      | Zoom in / out                                             |
| **Fit**            | Fit all nodes into the viewport                           |
| **Fullscreen**     | Toggle fullscreen mode                                    |
| **PNG**            | Export the current view as a high-DPI PNG image            |
| **SVG**            | Export as scalable vector graphics                        |
| **TTL**            | Download the current TTL data                             |
| **Edit Layout**    | Open the layout panel — change colors, shapes, edge styles|
| **Edit & Validate**| Open the inline TTL editor and SHACL validation panel     |

---

## How It Works

ontoink works in two phases:

**Build time (Python):**
The MkDocs plugin parses your TTL files with [rdflib](https://rdflib.readthedocs.io/), classifies nodes, resolves labels, detects ontology sources for color coding, extracts SHACL constraints, and runs [pySHACL](https://github.com/RDFLib/pySHACL) validation. The result is serialized as JSON and embedded in the HTML.

**Browser (JavaScript):**
[Cytoscape.js](https://js.cytoscape.org/) renders the interactive graph with a [dagre](https://github.com/dagrejs/dagre) layout. [CodeMirror](https://codemirror.net/5/) provides the TTL editor. A lightweight JavaScript SHACL checker enables live validation without server round-trips.

---

## Next Steps

- Browse the [Examples](examples/foaf-person.md) to see ontoink in action
- Read about [Contributing](contributing.md) if you'd like to help
- Check the [Changelog](changelog.md) for release history
- Learn how to [Cite ontoink](cite.md) in your publications
