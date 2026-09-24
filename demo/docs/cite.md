# Cite OntoInk

If you use OntoInk in your research, documentation, or publications, please cite it.

---

## BibTeX

```bibtex
@software{norouzi2026ontoink,
  author       = {Norouzi, Ebrahim},
  title        = {OntoInk: Interactive Ontology Visualization, SHACL Validation, and Live TTL Editing for MkDocs},
  year         = {2026},
  version      = {0.7.8},
  publisher    = {GitHub},
  url          = {https://github.com/ISE-FIZKarlsruhe/ontoink},
  note         = {Python package available at \url{https://pypi.org/project/ontoink/}}
}
```

Machine-readable metadata lives in [`CITATION.cff`](https://github.com/ISE-FIZKarlsruhe/ontoink/blob/main/CITATION.cff), which GitHub reads for its "Cite this repository" button.

## APA

> Norouzi, E. (2026). *OntoInk: Interactive Ontology Visualization, SHACL Validation, and Live TTL Editing for MkDocs* (Version 0.7.8) [Computer software]. GitHub. https://github.com/ISE-FIZKarlsruhe/ontoink

---

## Citing an ontology you rendered

Every diagram carries a **Cite** button when its source declares an `owl:Ontology` header. It reads the license, version, version IRI and creators straight out of that header and generates a BibTeX entry for the *ontology* — not for OntoInk — so a reader can cite what they are looking at without leaving the page. The button is hidden when the graph has no ontology declaration, which is itself a useful signal: an ontology published without header metadata cannot be cited properly by anyone.

---

## GitHub Repository

If you prefer to link directly:

```
https://github.com/ISE-FIZKarlsruhe/ontoink
```

Please star the repository if you find it useful — it helps others discover the project.

[:fontawesome-brands-github: Star on GitHub](https://github.com/ISE-FIZKarlsruhe/ontoink){ .md-button .md-button--primary }

---

## PyPI Package

```
https://pypi.org/project/ontoink/
```

[:fontawesome-brands-python: View on PyPI](https://pypi.org/project/ontoink/){ .md-button }

---

## Acknowledgments

OntoInk is developed by [Ebrahim Norouzi](https://ebrahimnorouzi.github.io/) at the [Information Service Engineering (ISE)](https://www.fiz-karlsruhe.de/en/forschung/information-service-engineering) group, [FIZ Karlsruhe — Leibniz Institute for Information Infrastructure](https://www.fiz-karlsruhe.de/).

This work is carried out in the context of:

- [NFDI](https://www.nfdi.de/) — National Research Data Infrastructure (Germany)
- [NFDI-MatWerk](https://nfdi-matwerk.de/) — NFDI for Materials Science and Engineering

### Open-Source Libraries

OntoInk is powered by these excellent open-source projects:

| Library | Role |
|:--------|:-----|
| [Cytoscape.js](https://js.cytoscape.org/) | Interactive graph rendering |
| [dagre](https://github.com/dagrejs/dagre) | Hierarchical graph layout |
| [rdflib](https://rdflib.readthedocs.io/) | RDF/Turtle parsing (Python) |
| [pySHACL](https://github.com/RDFLib/pySHACL) | SHACL validation (Python) |
| [CodeMirror](https://codemirror.net/5/) | TTL editor with syntax highlighting |
| [MkDocs](https://www.mkdocs.org/) | Static site generation |
| [Material for MkDocs](https://squidfunk.github.io/mkdocs-material/) | Documentation theme |
