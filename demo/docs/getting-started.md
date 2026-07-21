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

## Deploy to GitHub Pages

Publish your site automatically on every push with a GitHub Actions workflow — the same way this documentation is built.

[:material-download: Download the workflow](assets/deploy-mkdocs-pages.yml){ download="deploy.yml" .md-button .md-button--primary }

### 1. Add the workflow

Save the downloaded file (or the YAML below) as **`.github/workflows/deploy.yml`** in your repository:

```yaml
name: Deploy site

on:
  push:
    branches: [main]        # change to your default branch if different
  workflow_dispatch:        # also allow manual runs from the Actions tab

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - name: Install MkDocs + ontoink
        run: pip install mkdocs-material ontoink
      - name: Build the site
        run: mkdocs build   # outputs to ./site
      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: site

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

### 2. Enable GitHub Pages

In your repository, open **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**.

### 3. Set `site_url`

GitHub Pages serves project sites from a sub-path (`/<repo>/`). Set `site_url` in `mkdocs.yml` so internal links and ontoink's assets resolve correctly:

```yaml
site_url: https://<your-username>.github.io/<your-repo>/
```

### 4. Push

```bash
git add .github/workflows/deploy.yml mkdocs.yml
git commit -m "Deploy MkDocs + ontoink to GitHub Pages"
git push
```

The **Deploy site** workflow runs under the repository's **Actions** tab. When it finishes, your site is live at the URL shown in the workflow summary.

### 5. Reasoning — nothing to configure

**The workflow above already gives you working OWL reasoning.** No extra
dependencies, no Java, no server, no headers. Just rebuild and the
**Reasoning** button works.

Two layers do the work, both installed automatically by the plugin:

| Layer | When it runs | What you get |
|:------|:-------------|:-------------|
| **Build-time OWL-RL** | during `mkdocs build` | Inferences are computed once and baked into the page. The Reasoning panel shows them instantly, with no client-side work. Uses `owlrl`, which arrives with ontoink's own `pyshacl` dependency. |
| **Browser reasoners** | when a reader clicks **Reasoning** | **OWL-RL (JS)** — a built-in materialiser that runs in every browser. **Konclude WASM** — an OWL-DL reasoner; the plugin ships its bundle and a COOP/COEP service worker so it works on GitHub Pages, and falls back to the JS engine automatically if the WASM worker can't start. |

!!! tip "Optional: consistency checking with HermiT"
    One feature does need extra setup — the **consistency badge**
    (*"Ontology is consistent"* / *"N inconsistent classes"*), which requires
    the HermiT DL reasoner via `owlready2`. Add Java and the `reasoning`
    extra to your build job:

    ```yaml
      - uses: actions/setup-java@v4      # HermiT is a Java library
        with:
          distribution: temurin
          java-version: "17"
      - name: Install MkDocs + ontoink
        run: pip install mkdocs-material "ontoink[reasoning]"
    ```

    HermiT is a *classifier*: it is strongest at class subsumption and
    consistency, and typically reports **fewer** instance-level facts than
    OWL-RL. ontoink tries it first and automatically falls back to OWL-RL,
    so adding it never costs you inferences.

!!! question "How do I know the reasoner is working?"
    Reasoning correctly reports **0 inferences** for data that has nothing to
    infer — instance data with no `rdfs:subClassOf`, `rdfs:domain`, or
    property characteristics entails nothing, in any reasoner. To confirm
    your setup end to end, drop a file with real OWL axioms into a fence,
    e.g. `ex:Dog rdfs:subClassOf ex:Animal .` plus `ex:rex a ex:Dog .`, and
    check that `ex:rex a ex:Animal` appears in the panel. The
    [Reasoning & Inference](examples/reasoning-demo.md) examples are built
    for exactly this.

!!! tip "Self-hosting instead"
    The same `mkdocs build` output in `site/` is a plain static site you can
    serve from any host (Nginx, S3, Netlify, …). ontoink self-hosts all of
    its browser libraries from `site/vendor/`, so the site works offline and
    under a strict `script-src 'self'` policy — no CDN, no extra build tooling.

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
| `reasoning`  | `true`   | Enable OWL-RL reasoning (show Reasoning button)|

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
| **Reasoning**      | Toggle the reasoning panel — view inferred triples, show them on graph, validate with inferences |
| **Edit & Validate**| Open the inline TTL editor and SHACL validation panel     |

---

## How It Works

ontoink works in two phases:

**Build time (Python):**
The MkDocs plugin parses your TTL files with [rdflib](https://rdflib.readthedocs.io/), classifies nodes, resolves labels, detects ontology sources for color coding, extracts SHACL constraints, and runs [pySHACL](https://github.com/RDFLib/pySHACL) validation. The result is serialized as JSON and embedded in the HTML.

**Browser (JavaScript):**
[Cytoscape.js](https://js.cytoscape.org/) renders the interactive graph with a [dagre](https://github.com/dagrejs/dagre) layout. [CodeMirror](https://codemirror.net/5/) provides the TTL editor. A lightweight JavaScript SHACL checker enables live validation without server round-trips.

---

## OWL Reasoning

Reasoning works out of the box with `pip install ontoink` — there is nothing
to install or configure.

### Backends

ontoink reasons in two places, and picks the best backend available:

**At build time**, during `mkdocs build`, inferences are computed once and
baked into the page so readers see them instantly. The chain is
HermiT → Konclude → [owlrl](https://owl-rl.readthedocs.io/), falling through
to the next whenever one is unavailable or returns nothing. `owlrl` ships
with ontoink automatically (it comes in with `pyshacl`), so this layer always
works.

**In the browser**, when a reader clicks **Reasoning**, the dropdown offers
**OWL-RL (JS)** — a built-in materialiser that runs everywhere with no server
— and **Konclude WASM**, an OWL-DL reasoner whose bundle and COOP/COEP
service worker the plugin installs for you. If the WASM worker can't start,
ontoink falls back to the JS engine automatically. Server backends
(`ONTOINK_MODE=api`/`all`) appear when a `/reason` endpoint is reachable.

### Optional: HermiT for consistency checking

One feature needs extra setup — the consistency badge
(*"Ontology is consistent"* / *"N inconsistent classes"*), which comes from
the [HermiT](http://www.hermit-reasoner.com/) DL reasoner via
[owlready2](https://owlready2.readthedocs.io/). It requires Java:

```bash
pip install "ontoink[reasoning]"
```

HermiT is a classifier — strongest at subsumption and consistency, and
typically reporting fewer instance-level facts than OWL-RL. ontoink tries it
first and falls back automatically, so adding it never costs you inferences.

### What Gets Inferred

The reasoner computes:

- **Subclass chains** — if Dog < Mammal < Animal, then every Dog is also a Mammal and Animal
- **Inverse properties** — if `hasPet owl:inverseOf isPetOf`, then `alice hasPet rex` implies `rex isPetOf alice`
- **Transitive closures** — if `hasAncestor` is transitive and `alice hasAncestor bob`, `bob hasAncestor dave`, then `alice hasAncestor dave`
- **Symmetric properties** — if `knows` is symmetric and `alice knows bob`, then `bob knows alice`
- **And more** — equivalentClass, property chains, etc.

### Using Reasoning

The **Reasoning** button appears automatically when inferred triples are found. Click it to:

1. **View inferred triples** in a table
2. **Show on graph** — check the box to overlay inferred triples as purple dotted edges/nodes
3. **Validate with Inferences** — run SHACL validation with inferred triples included

Disable reasoning for a specific diagram with `reasoning: false`:

````markdown
```ontoink
source: data.ttl
shape: shape.ttl
reasoning: false
```
````

See the [OWL Reasoning example](examples/reasoning-demo.md) for a complete demo.

---

## Next Steps

- Browse the [Examples](examples/foaf-person.md) to see ontoink in action
- Read about [Contributing](contributing.md) if you'd like to help
- Check the [Changelog](changelog.md) for release history
- Learn how to [Cite ontoink](cite.md) in your publications
