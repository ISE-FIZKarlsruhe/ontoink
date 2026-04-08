---
hide:
  - navigation
  - toc
---

<div class="ov-hero" markdown>

# ontoink

<p class="ov-tagline">
Turn RDF/Turtle into interactive, publication-ready ontology diagrams —
with SHACL constraint visualization and live editing — right inside MkDocs.
</p>

<div class="ov-badges">
  <a href="https://pypi.org/project/ontoink/"><img src="https://img.shields.io/pypi/v/ontoink?color=0891b2&style=flat-square" alt="PyPI"></a>
  <a href="https://pypi.org/project/ontoink/"><img src="https://img.shields.io/pypi/pyversions/ontoink?style=flat-square" alt="Python"></a>
  <a href="https://github.com/ISE-FIZKarlsruhe/ontoink/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/ISE-FIZKarlsruhe/ontoink/ci.yml?style=flat-square&label=CI" alt="CI"></a>
  <a href="https://github.com/ISE-FIZKarlsruhe/ontoink/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License"></a>
  <a href="https://github.com/ISE-FIZKarlsruhe/ontoink"><img src="https://img.shields.io/github/stars/ISE-FIZKarlsruhe/ontoink?style=flat-square&color=e8d44d" alt="Stars"></a>
</div>

<div class="ov-cta">
  <a href="getting-started/" class="ov-primary">Get Started</a>
  <a href="examples/foaf-person/" class="ov-secondary">See Examples</a>
</div>

<div class="ov-install" markdown>

```bash
pip install ontoink
```

</div>

</div>

---

## Why ontoink?

Ontology documentation should be **visual**, **interactive**, and **verifiable**.
ontoink embeds live ontology diagrams directly into your MkDocs site — no screenshots, no external tools, no manual drawing.

<div class="ov-features" markdown>

<div class="ov-feature-card" markdown>
### :material-graph-outline: Interactive Graphs
Pan, zoom, drag nodes, click any element for details.
Powered by Cytoscape.js with hierarchical dagre layout.
</div>

<div class="ov-feature-card" markdown>
### :material-shield-check-outline: SHACL Validation
Constraints are overlaid on the graph with cardinality badges.
Validate live in the browser — no server needed.
</div>

<div class="ov-feature-card" markdown>
### :material-pencil-outline: Live TTL Editor
Edit RDF/Turtle inline with syntax highlighting.
Update the graph instantly and validate against shapes.
</div>

<div class="ov-feature-card" markdown>
### :material-file-image-outline: Publication-Ready Export
Export PNG (3x hi-DPI) or SVG with legend and prefixes.
What you see is what you get.
</div>

<div class="ov-feature-card" markdown>
### :material-palette-outline: Customizable Layout
Change node colors, shapes, edge styles, and arrow types
per element type — all from the toolbar.
</div>

<div class="ov-feature-card" markdown>
### :material-puzzle-outline: Zero Config
One pip install, two lines in `mkdocs.yml`.
Write a fenced code block and you're done.
</div>

</div>

---

## Live Demo

Here is a FOAF Person ontology with SHACL constraints — click nodes and edges, try editing the TTL, change shapes in **Edit Layout**:

```ontoink
source: shapes/foaf-person/shape-data.ttl
shape: shapes/foaf-person/shape.ttl
height: 500px
```

---

## Quick Start

**1.** Install from PyPI:

```bash
pip install ontoink
```

**2.** Add to your `mkdocs.yml`:

```yaml
plugins:
  - search
  - ontoink

markdown_extensions:
  - pymdownx.superfences:
      preserve_tabs: true
```

**3.** Use in any markdown page:

````markdown
```ontoink
source: path/to/data.ttl
shape: path/to/shape.ttl
```
````

**4.** Serve and explore:

```bash
mkdocs serve
```

[:octicons-arrow-right-24: Full Getting Started Guide](getting-started.md)

---

<div style="text-align:center; padding: 1rem 0;" markdown>

**Built by [ISE — FIZ Karlsruhe](https://www.fiz-karlsruhe.de/en/forschung/information-service-engineering)**
in the context of [NFDI](https://www.nfdi.de/) and [NFDI-MatWerk](https://nfdi-matwerk.de/)

[:fontawesome-brands-github: GitHub](https://github.com/ISE-FIZKarlsruhe/ontoink){ .md-button }
[:fontawesome-brands-python: PyPI](https://pypi.org/project/ontoink/){ .md-button }

</div>
