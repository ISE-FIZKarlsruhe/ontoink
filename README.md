# ontoink

**Interactive ontology visualization, SHACL validation, and live TTL editing for MkDocs.**

[![CI](https://github.com/ISE-FIZKarlsruhe/ontoink/actions/workflows/ci.yml/badge.svg)](https://github.com/ISE-FIZKarlsruhe/ontoink/actions/workflows/ci.yml)
[![PyPI](https://img.shields.io/pypi/v/ontoink)](https://pypi.org/project/ontoink/)
[![Python](https://img.shields.io/pypi/pyversions/ontoink)](https://pypi.org/project/ontoink/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

ontoink is a MkDocs plugin that turns RDF/Turtle files into interactive,
publication-ready ontology diagrams with SHACL constraint visualization. Write a
code block in your markdown and ontoink renders a fully interactive graph.

**[Live demo & full documentation →](https://ise-fizkarlsruhe.github.io/ontoink/)**

## Install

```bash
pip install ontoink
```

## Use

```yaml
# mkdocs.yml
plugins:
  - search
  - ontoink

markdown_extensions:
  - pymdownx.superfences:
      preserve_tabs: true
```

````markdown
```ontoink
source: shapes/foaf-person/shape-data.ttl
shape: shapes/foaf-person/shape.ttl
height: 600px
```
````

Then `mkdocs serve`. See **[Getting Started](https://ise-fizkarlsruhe.github.io/ontoink/getting-started/)**
for all fence options, GitHub Pages deployment and reasoner setup.

## What you get

- **Interactive graphs** — formal ontology notation, six layouts, pan/zoom/search, minimap,
  level-of-detail and clustering for large ontologies, style presets (ontoink, Chowlk, Graffoo, VOWL)
- **Editable layout** — colours, shapes, edge styles, shape size and fonts; multi-select with
  Ctrl+click and a right-click menu for align / distribute / arrange, selection-scoped ontology
  actions, and undo
- **SHACL** — constraint overlay on the graph, build-time validation with pySHACL, live re-validation
  in the inline TTL editor
- **OWL reasoning** — HermiT, Konclude (native or WASM) or owlrl, with inferred triples overlaid on
  the graph and consistency checking
- **Analytics** — ontology metrics, SHACL coverage, shortest paths, in-page SPARQL, and OntoSniff
  quality checks with a 0–100 score
- **Publication-ready export** — PNG/SVG with legend and namespace prefixes, plus TTL download
- **Browser-only tools** — [Playground](https://ise-fizkarlsruhe.github.io/ontoink/playground/) ·
  [SHACL Editor](https://ise-fizkarlsruhe.github.io/ontoink/shacl-editor/) ·
  [SPARQL Explorer](https://ise-fizkarlsruhe.github.io/ontoink/sparql-explorer/) ·
  [OntoSniff](https://ise-fizkarlsruhe.github.io/ontoink/ontosniff/)
- **Embeddable** — `ontoink.embed()` mounts a graph in any page, under a strict CSP, with no CDN

## Documentation

| | |
|---|---|
| [Getting Started](https://ise-fizkarlsruhe.github.io/ontoink/getting-started/) | install, configure, deploy |
| [Embedding](https://ise-fizkarlsruhe.github.io/ontoink/embedding/) | use ontoink outside MkDocs |
| [Docker & self-hosting](https://ise-fizkarlsruhe.github.io/ontoink/docker/) | production image, reasoner backends, API mode |
| [Architecture](https://ise-fizkarlsruhe.github.io/ontoink/design/) | how it works and why |
| [Changelog](CHANGELOG.md) · [Backlog](FEATURE-BACKLOG.md) | what changed, what's next |

## Development

```bash
git clone https://github.com/ISE-FIZKarlsruhe/ontoink.git
cd ontoink
pip install -e ".[dev]"
pytest -v          # see TESTING.md for the full local test guide
cd demo && mkdocs serve
```

Contributions welcome — please open an issue first to discuss proposed changes,
add tests, and make sure `pytest` passes.

## Requirements

Python ≥ 3.9 · MkDocs ≥ 1.4 · rdflib ≥ 6.0 · pySHACL ≥ 0.25 · pymdown-extensions ≥ 10.0.
Browser-side dependencies (Cytoscape.js, dagre, CodeMirror) are vendored — no npm, no CDN.

## License & citation

MIT — see [LICENSE](LICENSE). If you use ontoink in published work, please cite it via
[`CITATION.cff`](CITATION.cff); when using either Konclude backend, additionally cite
Liebig et al. (2014), *Konclude: System Description*, Journal of Web Semantics 27-28, 78-85.
See [NOTICE](NOTICE) for full attribution of the bundled reasoners.

## Author

[Ebrahim Norouzi](https://ebrahimnorouzi.github.io/) — [FIZ Karlsruhe](https://www.fiz-karlsruhe.de/),
[ISE](https://www.fiz-karlsruhe.de/en/forschung/information-service-engineering).
Developed in the context of [NFDI](https://www.nfdi.de/) and [NFDI-MatWerk](https://nfdi-matwerk.de/);
visualization powered by [Cytoscape.js](https://js.cytoscape.org/).
