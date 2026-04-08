# Contributing

Thank you for your interest in contributing to ontoink! Every contribution helps — from bug reports to code, documentation, and ideas.

---

## Reporting Issues

Found a bug? Have a feature request? Please open an issue on GitHub:

[:fontawesome-brands-github: Open an Issue](https://github.com/ISE-FIZKarlsruhe/ontoink/issues/new){ .md-button .md-button--primary }

### Bug Reports

When reporting a bug, please include:

1. **What you expected** to happen
2. **What actually happened** (screenshots help!)
3. **Steps to reproduce** the problem
4. **Your environment:** Python version, ontoink version (`pip show ontoink`), browser
5. **Relevant TTL files** (if possible) — a minimal example that triggers the bug

### Feature Requests

Have an idea for a new feature? We'd love to hear it. When opening a feature request:

1. Describe **the use case** — what problem does it solve?
2. Sketch out **the desired behavior**
3. Note any **alternatives** you've considered

---

## Development Setup

### 1. Fork and clone

```bash
git clone https://github.com/<your-username>/ontoink.git
cd ontoink
```

### 2. Install in editable mode

```bash
pip install -e ".[dev]"
```

### 3. Run the test suite

```bash
pytest -v
```

### 4. Serve the demo site locally

```bash
cd demo
mkdocs serve
```

Open `http://127.0.0.1:8000` to see your changes in real time.

---

## Code Contributions

### Workflow

1. **Open an issue first** to discuss proposed changes
2. **Fork** the repository
3. **Create a feature branch** from `main`
4. Make your changes
5. **Add tests** for new functionality
6. Ensure `pytest` passes
7. **Submit a pull request**

### Project Structure

```
ontoink/
  __init__.py
  plugin.py           # MkDocs plugin entry point
  fence.py            # Custom fence handler (```ontoink blocks)
  ttl_parser.py       # RDF/TTL parsing and Cytoscape JSON generation
  shacl_validator.py  # pySHACL validation wrapper
  resources/
    ontoink.js        # Frontend: Cytoscape, editor, export, popups
    ontoink.css       # Frontend: all styles
tests/
  test_fence.py
  test_ttl_parser.py
  test_shacl_validator.py
demo/
  mkdocs.yml          # Demo site configuration
  docs/               # Demo documentation pages
```

### Key Guidelines

- **Python** code is in `ontoink/` — parsing, validation, HTML generation
- **JavaScript** code is in `ontoink/resources/ontoink.js` — all frontend logic
- **CSS** is in `ontoink/resources/ontoink.css`
- Keep JS/CSS as single files (no build step, loaded inline by the plugin)
- All new features should have corresponding tests

---

## Questions?

Not sure where to start? Open a [discussion](https://github.com/ISE-FIZKarlsruhe/ontoink/issues) and we'll point you in the right direction.
