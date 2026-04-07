# ontoink Demo

Interactive ontology visualization and SHACL validation plugin for MkDocs.

## Features

- Interactive graph visualization with formal ontology notation
- Click any node to see IRI, type, connections, and SHACL constraints
- Inline TTL editor with live validation
- Publication-ready PNG and SVG export (with legend included)
- Download TTL data directly
- Color-coded by ontology source (BFO, IAO, FOAF, Schema.org, etc.)
- Namespace legend with toggle to show/hide unused prefixes

## Examples

- [FOAF Person](examples/foaf-person.md) — every Person must have a name
- [Schema.org Article](examples/schema-article.md) — scholarly articles need author, title, date

## Quick Start

```bash
pip install ontoink
```

Add to `mkdocs.yml`:

```yaml
plugins:
  - ontoink
```

Use in markdown:

````
```ontoink
source: path/to/data.ttl
shape: path/to/shape.ttl
```
````
