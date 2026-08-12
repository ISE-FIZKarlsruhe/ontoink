# Contributing

Thank you for your interest in contributing to OntoInk! Every contribution helps — from bug reports to code, documentation, and ideas.

---

## Reporting Issues

Found a bug? Have a feature request? Please open an issue on GitHub:

[:fontawesome-brands-github: Open an Issue](https://github.com/ISE-FIZKarlsruhe/ontoink/issues/new){ .md-button .md-button--primary }

### Bug Reports

When reporting a bug, please include:

1. **What you expected** to happen
2. **What actually happened** (screenshots help!)
3. **Steps to reproduce** the problem
4. **Your environment:** Python version, OntoInk version (`pip show ontoink`), browser
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
  __init__.py         # The single source of the version number
  plugin.py           # MkDocs plugin entry point + on_post_build artefacts
  fence.py            # Custom fence handler (```ontoink blocks)
  cq.py               # Competency-question fence (```ontoink-cq blocks)
  ttl_parser.py       # RDF/TTL parsing and Cytoscape JSON generation
  shacl_validator.py  # pySHACL validation wrapper
  report.py           # Build report, quality score, SVG badges, CI gate
  api.py              # Optional FastAPI server (ontoink[api])
  cluster.py          # Build-time Leiden clustering (ontoink[cluster])
  recommend/          # SHACL shape induction
    types.py          #   normalised Constraint / Shape / ShapeSet model
    profiler.py       #   per-class instance profiling
    methods.py        #   baseline (data-driven) + astrea (axiom-driven)
    writer.py         #   Turtle emission, with confidence annotations
    drift.py          #   committed shapes vs. what the data implies
  resources/
    ontoink.js        # Frontend: Cytoscape, editor, export, popups
    ontoink-dsl.js    # Live-editor DSL parser + autocomplete vocabulary
    ontoink.css       # Frontend: all styles
tests/
  test_fence.py       # fence rendering
  test_plugin.py      # full mkdocs build through the plugin
  test_ttl_parser.py
  test_shacl_validator.py
  test_recommend.py   # induction + drift
  test_cq.py          # competency questions
  test_report.py      # score, badges, quality gate
  test_hygiene.py     # regressions for the silent-correctness fixes
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
