# ontoview Demo

Interactive ontology visualization and SHACL validation plugin for MkDocs.

## Features

- Interactive graph visualization with formal ontology notation
- Click any node to see IRI, type, connections, and SHACL constraints
- Inline TTL editor with live validation
- Publication-ready SVG/PNG export
- Color-coded by ontology source (BFO, IAO, nfdicore, etc.)

## Examples

- [Role Bearer](examples/role-bearer.md) — A role must have a bearer and be realized in a process
- [Textual Entity](examples/textual-entity.md) — A textual entity must be about something
- [Role Realization](examples/role-realization.md) — A role must be realized in a process

## Quick Start

Install:

```bash
pip install ontoview
```

Add to `mkdocs.yml`:

```yaml
plugins:
  - ontoview
```

Use in markdown:

````
```ontoview
source: path/to/data.ttl
shape: path/to/shape.ttl
```
````
