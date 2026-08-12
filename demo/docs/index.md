---
hide:
  - navigation
  - toc
---

<div class="ov-hero" markdown>

# OntoInk

<p class="ov-tagline">
A MkDocs plugin that renders RDF/Turtle as interactive, publication-ready ontology diagrams — with SHACL constraints, OWL reasoning and live editing on the page.
</p>

<div class="ov-badges">
  <a href="https://pypi.org/project/ontoink/"><img src="https://img.shields.io/pypi/v/ontoink?color=0891b2&style=flat-square" alt="PyPI"></a>
  <a href="https://pypi.org/project/ontoink/"><img src="https://img.shields.io/pypi/pyversions/ontoink?style=flat-square" alt="Python"></a>
  <a href="https://github.com/ISE-FIZKarlsruhe/ontoink/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/ISE-FIZKarlsruhe/ontoink/ci.yml?style=flat-square&label=CI" alt="CI"></a>
  <a href="https://github.com/ISE-FIZKarlsruhe/ontoink/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="License"></a>
  <a href="https://github.com/ISE-FIZKarlsruhe/ontoink"><img src="https://img.shields.io/github/stars/ISE-FIZKarlsruhe/ontoink?style=flat-square&color=e8d44d" alt="Stars"></a>
</div>

<div class="ov-cta">
  <a href="playground/" class="ov-primary">Open the Playground</a>
  <a href="getting-started/" class="ov-secondary">Get Started</a>
</div>

<div class="ov-install" markdown>

```bash
pip install ontoink
```

</div>

</div>

<p class="ov-demo-caption">
Not a screenshot. Click a node, drag it, right-click for align and selection tools, edit the Turtle below the canvas — the figure is generated from the source file at build time.
</p>

```ontoink
source: shapes/foaf-person/shape-data.ttl
shape: shapes/foaf-person/shape.ttl
height: 520px
```

<div class="ov-features" markdown>

<div class="ov-feature-card" markdown>
### :material-graph-outline: Graphs that hold up
Six layouts, level-of-detail and clustering for large ontologies, minimap, search, path finder.
</div>

<div class="ov-feature-card" markdown>
### :material-shield-check-outline: SHACL, in place
Constraints drawn on the graph with cardinality badges, validated at build time with pySHACL, re-validated as you edit. [Shape editor](shacl-editor.md)
</div>

<div class="ov-feature-card" markdown>
### :material-lightbulb-outline: Shapes, suggested
Classes with no SHACL coverage get a proposed `sh:NodeShape` from their instances and axioms — each constraint shown with the evidence behind it. [See it work](examples/shape-recommendation.md)
</div>

<div class="ov-feature-card" markdown>
### :material-brain: OWL reasoning
HermiT, Konclude (native or WASM) or owlrl. Inferred triples overlay the asserted ones; consistency is reported, not assumed — and any inference the in-page reasoner made can show its proof.
</div>

<div class="ov-feature-card" markdown>
### :material-check-decagram-outline: Gates for CI
Competency questions run at build time as red/green cards; shape drift and quality scores land in `ontoink-report.json` and README badges.
</div>

<div class="ov-feature-card" markdown>
### :material-tag-text-outline: Labels resolved
`NFDI_0000118` reads as *contributor role* — labels are fetched from the referenced ontologies and reused in popups, autocomplete and results.
</div>

<div class="ov-feature-card" markdown>
### :material-cursor-default-click-outline: Arrange it yourself
Ctrl+click to multi-select, right-click to align, distribute and pin. Size, font and colour per node type. Undo included.
</div>

<div class="ov-feature-card" markdown>
### :material-file-export-outline: Figures you can publish
PNG and SVG with legend and prefixes, TTL export, and a CSP-safe embed bundle for pages outside MkDocs.
</div>

</div>

---

## Three steps

<div class="ov-steps" markdown>

=== "1 · Install"

    ```bash
    pip install ontoink
    ```

=== "2 · Enable"

    ```yaml
    # mkdocs.yml
    plugins:
      - search
      - ontoink

    markdown_extensions:
      - pymdownx.superfences:
          preserve_tabs: true
    ```

=== "3 · Write a block"

    ````markdown
    ```ontoink
    source: path/to/data.ttl
    shape: path/to/shape.ttl
    ```
    ````

</div>

[Full guide, fence options and deployment :octicons-arrow-right-24:](getting-started.md){ .md-button }

---

## Also in the browser, no install

<div class="ov-links" markdown>

[**Playground**](playground.md) — paste Turtle, get a diagram · [**Live Editor**](live-editor.md) — a compact DSL that compiles to Turtle · [**SHACL Editor**](shacl-editor.md) — build shapes from templates · [**SPARQL Explorer**](sparql-explorer.md) — query an endpoint and plot the result · [**OntoSniff**](ontosniff.md) — anti-pattern report with a 0–100 score

</div>

---

<div class="ov-colophon" markdown>

Built at [ISE — FIZ Karlsruhe](https://www.fiz-karlsruhe.de/en/forschung/information-service-engineering) in the context of [NFDI](https://www.nfdi.de/) and [NFDI-MatWerk](https://nfdi-matwerk.de/). Rendering by [Cytoscape.js](https://js.cytoscape.org/) · MIT licensed.

[:fontawesome-brands-github: Source](https://github.com/ISE-FIZKarlsruhe/ontoink){ .md-button } [:fontawesome-brands-python: PyPI](https://pypi.org/project/ontoink/){ .md-button } [:material-format-quote-close: Cite](cite.md){ .md-button }

</div>
