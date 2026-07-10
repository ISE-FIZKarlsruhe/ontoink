# Testing ontoink locally

This document covers how to verify ontoink end-to-end on your machine before opening a PR or cutting a release.

## 1. Python test suite

```bash
pip install -e ".[dev]"
pytest -v
```

41 tests should pass. Coverage spans the TTL parser, label resolution, OntoSniff anti-patterns, SHACL extraction, and reasoning fallbacks.

## 2. JavaScript syntax check

```bash
node --check ontoink/resources/ontoink.js
```

There is no JS test suite — JS is verified manually in the demo site (see §3) and via the playground (see §4).

## 3. MkDocs demo site

```bash
pip install -e ".[reasoning]" mkdocs-material
cd demo
mkdocs serve
```

Open <http://127.0.0.1:8000>. Check each diagram renders, the legend updates when you change layout, and the **"More…"** popups show fetched labels from external ontologies.

## 4. Playground manual checks

After `mkdocs serve`, open <http://127.0.0.1:8000/playground/>:

- **Paste a TTL** with description strings that contain periods (e.g. `"end of sentence. Next sentence."`) — confirm parsing completes (was broken pre-0.5.2)
- **Paste a TTL with hyphenated prefixes** like `samm-c:` — confirm prefixed names resolve (was broken pre-0.5.2)
- **Paste a TTL using `urn:` namespaces** — confirm the page does not hang on auto-deref (was broken pre-0.5.1)
- **Add SHACL shapes** referencing `sh:targetClass` / `sh:path` — confirm:
  - Cyan dashed constraint edges appear (new in 0.6.0)
  - Cardinality badges `[1..*]` show on the edge label
  - "More…" on shape IRIs returns labels (new in 0.6.0)
- **Switch layout** via the dropdown — confirm the legend re-renders with new colors/orientation (new in 0.6.0)
- **Edit Layout → change a node color, node shape, edge color, or arrow shape** — confirm the legend updates immediately, and a subsequent PNG/SVG export embeds the customised legend (new in 0.6.0)
- **Click Reasoning** — the panel opens with a backend dropdown. The default is **Browser: Konclude WASM** when the page is cross-origin isolated (check via `crossOriginIsolated === true` in DevTools). If you see "needs cross-origin isolation", reload once — the bundled service worker registers on first visit and the headers apply after reload (new in 0.6.0)
- **Switch reasoner** in the dropdown — try the server backends if the API is reachable. Each `server:*` choice is forwarded as the `reasoner` field in `POST /reason`

A working sample SHACL ontology pair is in [`demo/docs/examples/`](demo/docs/examples/).

## 4a. Big-ontology mode (v0.7.0)

The v0.7.0 Semantic-Tile bundle is opt-in — a fence with no YAML config
still renders the exact same graph 0.6.1 rendered — so first confirm the
default path is untouched:

```bash
# Regression: no policy, no clustering, no LOD toolbar changes
python -c "from ontoink.ttl_parser import parse_ttl_to_cytoscape; \
    r = parse_ttl_to_cytoscape('tests/fixtures/sample-data.ttl'); \
    print('nodes=', len(r['nodes']), 'edges=', len(r['edges']))"
```

The output must match the 0.6.1 snapshot. Then exercise the new
layers.

### Prerequisites

```bash
pip install -e ".[dev,cluster]"    # + [topic] if you want LLM-titled super-nodes
# On Windows, python-igraph may need a build toolchain — see igraph docs.
```

### Build the sample ontologies through the pipeline

Fetch a large public ontology (ChEBI or IAO) and run it through the
parser to confirm the clustering + predicate-policy pipeline handles it.

```bash
# ChEBI — very large (~2 GB uncompressed). Skip if you're on a slow disk.
mkdir -p /tmp/big-onto
curl -L -o /tmp/big-onto/chebi.owl.gz \
    "https://ftp.ebi.ac.uk/pub/databases/chebi/ontology/chebi.owl.gz"
gunzip /tmp/big-onto/chebi.owl.gz
# rdflib can parse OWL/XML directly — but ChEBI is a lot; give it time.

# IAO — smaller, still exercises the big-ontology paths.
curl -L -o /tmp/big-onto/iao.owl \
    "https://raw.githubusercontent.com/information-artifact-ontology/IAO/v2026-03-30/iao.owl"
```

Now run through the pipeline:

```bash
python - <<'PY'
from ontoink.ttl_parser import parse_ttl_to_cytoscape
from ontoink.cluster import detect_clusters
from ontoink.cluster_titles import title_clusters

policy = {
    "predicates": {
        "hide_predicates":  ["prov:*", "owl:versionInfo"],
        "fold_into_badge":  ["rdfs:label", "rdfs:comment", "skos:definition"],
        "badge_predicates": [],
    }
}

# NOTE: parse_ttl_to_cytoscape expects turtle; convert first if you fetched OWL/XML:
#     rapper -i rdfxml -o turtle /tmp/big-onto/iao.owl > /tmp/big-onto/iao.ttl
data = parse_ttl_to_cytoscape("/tmp/big-onto/iao.ttl", policy=policy)
print("Post-policy nodes:", len(data["nodes"]), "edges:", len(data["edges"]))
print("Badged subjects  :", len(data.get("node_badges", {})))

top_nodes, top_edges, clusters, side, cent = detect_clusters(
    data, algorithm="leiden", min_size=8, max_supernodes=30
)
title_clusters(clusters, side, provider="anthropic")  # optional — omit for synthetic titles
print("Super-nodes:", len(clusters), "avg size:",
      round(sum(c['size'] for c in clusters) / max(len(clusters), 1), 1))
print("Sample title:", clusters[0]["title"] if clusters else "(no communities)")
PY
```

Expected output for IAO: dozens of super-nodes, each 8-40 members, with
titles like *"Information Content Entities"* / *"Editor Notes and
Provenance"* (LLM path) or *"MaterialInformationEntity and ContinuantFiat"*
(synthetic path — deterministic fallback).

### Manual UI checks (in the playground)

After `mkdocs serve`, open a big diagram and step through:

- **LOD slider (0..6)** — drag left-to-right. Each stop should reveal a
  new layer:
  - L0 = super-nodes + top-K central classes only
  - L1 = adds every class
  - L2 = adds object-property edges (default)
  - L3 = adds OWL restriction pills (`∃/∀/=`)
  - L4 = adds individuals
  - L5 = adds data-property edges
  - L6 = adds SHACL constraints + inferred triples
  Verify: hiding a node also hides its incident edges (no dangling
  arrows), and dragging **back** restores the exact same layout — the
  Attic snapshot must be reversible.
- **Attic drawer** — click **Attic** in the toolbar. The panel opens on
  the right, virtualised by type. Pin a hidden node — it re-appears on
  the canvas regardless of the current LOD level. Close the panel via
  the × button.
- **Super-node click** — a hexagon with a `·N` count. Clicking should
  expand the community into its interior sub-graph (loaded from
  `data-ontoink-side-store`); a second click re-collapses. Confirm the
  ordinary node popup does **not** fire.
- **Super checkbox** — un-tick to render every community's members
  in-place (skipping the super-node collapse); re-tick to restore.
- **SPARQL results respect the predicate policy** — open the SPARQL
  panel, run `SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 100`. The result
  rows should materialise into the live graph, folded through the same
  `predicates:` policy the fence configured — hidden predicates stay
  hidden, folded literals become node badges, not separate literal
  nodes. A grey pill above the result table should read
  *"SPARQL results — clustering unavailable for live queries"*.

### Regression: fences with no YAML config

Open an existing (pre-0.7.0) example page and re-verify:

- The toolbar renders the LOD slider group but the default value (L2)
  produces the same set of visible elements the page rendered in 0.6.1.
- No super-nodes are present (clustering did not run).
- The Attic is empty — everything is on the canvas — until the user
  drags the slider left.

If any of those regressions fire, the culprit is almost always a
non-empty `pol` set leaking through when the config is absent. Reproduce
with:

```bash
python -c "from ontoink.ttl_parser import apply_predicate_policy; \
    from rdflib import Graph; \
    print(apply_predicate_policy(Graph(), None))"
# → {'hide': set(), 'fold': set(), 'badge': set(), ...}   ← must all be empty
```

## 5. Docker image

### Prerequisites

- Docker Desktop or Docker Engine ≥ 24
- `docker compose` v2+
- Working access to Docker Hub (`docker pull python:3.12-slim` must succeed)

### Build

```bash
docker build -t ontoink:local . 
#docker build --no-cache -t ontoink:local .
```

First build is slow (~5 min) — it installs Python deps, Node, Java, and the `rdf-reasoner-konclude` npm package. Subsequent builds use layer cache.

### Smoke test

```bash
# 1. Native Konclude CLI (upstream C++ binary)
docker run --rm ontoink:local konclude --help

# 2. WASM Konclude CLI (rdf-reasoner-konclude wrapper)
docker run --rm ontoink:local owl-reason --help

# 3. Build mode — produces site/ from the bundled demo and exits
docker run --rm -e ONTOINK_MODE=build ontoink:local

# 4. API-only mode — /health, /reason, /validate (no docs)
docker rm -f ontoink-api 2>/dev/null
docker run -d --rm --name ontoink-api -p 8000:8000 -e ONTOINK_MODE=api ontoink:local
sleep 5
curl http://localhost:8000/health   # → {"status":"ok",...}
docker rm -f ontoink-api

# 5. Combined mode — docs + API on the same origin (recommended for production)
#    Docs at /, playground at /playground/, API at /reason and /health.
#    Build uses --site-url=http://localhost:8000/ so links are root-relative
#    (matches where the FastAPI app mounts the static site).

# 5a. Make sure nothing else holds port 8000 (mkdocs serve from §3, another
#     container, etc.). If `ss` shows something, stop it first.
ss -ltn '( sport = :8000 )' 2>/dev/null || netstat -ano | grep :8000

# 5b. Drop any stale ontoink-all container, then start the new one. Note we
#     drop --rm here so we can still inspect logs after a crash. Add --rm
#     back once you've confirmed it boots cleanly.
docker rm -f ontoink-all 2>/dev/null
docker run -d --name ontoink-all -p 8000:8000 \
    -v "$PWD/output:/output" \
    -e ONTOINK_MODE=all ontoink:local

# 5c. Tail the logs until you see uvicorn announce it is listening. The
#     first-time docs build takes ~15-25 s; you'll see lines like:
#       ontoink: building docs into /app/demo/site (site_url=http://localhost:8000/)
#       INFO:     Uvicorn running on http://0.0.0.0:8000
docker logs -f ontoink-all          # Ctrl-C once you see "Uvicorn running on"

# 5d. Verify each endpoint responds. Every line should print 200.
curl -s -o /dev/null -w "/                       %{http_code}\n" http://localhost:8000/
curl -s -o /dev/null -w "/playground/            %{http_code}\n" http://localhost:8000/playground/
curl -s -o /dev/null -w "/examples/foaf-person/  %{http_code}\n" http://localhost:8000/examples/foaf-person/
curl -s -o /dev/null -w "/anti-patterns/         %{http_code}\n" http://localhost:8000/anti-patterns/
curl -s http://localhost:8000/health

# 5e. Open these in your browser and click through:
#       http://localhost:8000/                         home page (hero, feature cards)
#       http://localhost:8000/playground/              paste TTL and visualise
#       http://localhost:8000/examples/foaf-person/    SHACL example
#       http://localhost:8000/anti-patterns/           anti-pattern catalogue
#       http://localhost:8000/anti-patterns/and-is-or/ per-pattern page (graph + SHACL)

# 5f. If `docker ps` shows the container missing right after 5b, it crashed.
#     Inspect with:
#       docker logs ontoink-all          # last stderr/stdout
#       docker inspect ontoink-all --format '{{.State.ExitCode}} {{.State.Error}}'
#     Common causes:
#       - Port 8000 already bound (see 5a)
#       - mkdocs build failure (check the log for the offending page/extension)

# 5g. Tear down when finished.
docker rm -f ontoink-all

# 6. Docs-only mode (no /reason — playground "Server" option will report offline)
#    Same URLs as `all` mode; `--site-url` is unchanged here so this mode
#    serves the docs at the GitHub-Pages prefix /ontoink/.
docker rm -f ontoink-docs 2>/dev/null
docker run -d --rm --name ontoink-docs -p 8000:8000 -e ONTOINK_MODE=serve ontoink:local
# open http://localhost:8000/    (mkdocs serve uses the live config; root-relative)
docker rm -f ontoink-docs
```

### docker compose

```bash
cp .env.sample .env
# edit ONTOINK_MODE / ONTOINK_REASONER as needed
docker compose up --build
```

Then visit <http://localhost:8000>.

### One-shot verification of every reasoner

Before deploying, run the bundled script — it starts the container, hits each backend with a known-good ontology, and tears down. Exit code 0 means every backend responded successfully.

```bash
bash scripts/verify_reasoners.sh
# or target a published image:
IMAGE=ghcr.io/ise-fizkarlsruhe/ontoink:0.6.0 bash scripts/verify_reasoners.sh
```

Sample output:

```
→ Backend: owlready2     ✓ HTTP 200  count=0  reasoner=owlready2     elapsed=5 ms
→ Backend: konclude      ✓ HTTP 200  count=0  reasoner=konclude      elapsed=161 ms
→ Backend: konclude-wasm ✓ HTTP 200  count=0  reasoner=konclude-wasm elapsed=282 ms
→ Backend: owlrl         ✓ HTTP 200  count=1  reasoner=owlrl         elapsed=336 ms
All 4 reasoner backends are reachable.
```

Empty `count=0` for the OWL-DL backends is not a failure — they need OWL/XML or richer declarations to derive instance-level inferences from this minimal RDFS-only sample. What matters is they each returned `HTTP 200`, reported themselves in the response, and finished in a reasonable time.

### Reasoner smoke test (per backend)

Save the test ontology to a file (Windows PowerShell parses `<` as a redirect operator, so inline `-d '{"ttl": ...}'` won't work — use `-d @file`):

```bash
# WSL / bash
cat > /tmp/payload.json << 'EOF'
{"ttl": "@prefix ex: <http://example.org/> .\n@prefix owl: <http://www.w3.org/2002/07/owl#> .\n@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\nex: a owl:Ontology .\nex:A a owl:Class ; rdfs:subClassOf ex:B .\nex:B a owl:Class ; rdfs:subClassOf ex:C .\nex:C a owl:Class .\nex:alice a ex:A ."}
EOF

for r in owlready2 konclude konclude-wasm owlrl; do
  echo "=== $r ==="
  docker rm -f ontoink-api >/dev/null 2>&1
  docker run -d --name ontoink-api -p 8000:8000 \
    -e ONTOINK_MODE=api -e ONTOINK_REASONER="$r" ontoink:local >/dev/null
  sleep 4
  curl -s -X POST http://localhost:8000/reason \
    -H 'Content-Type: application/json' -d @/tmp/payload.json | head -c 400
  echo; echo
done
docker rm -f ontoink-api
```

Expected: each backend returns inferences for `ex:A rdfs:subClassOf ex:C` and/or `ex:alice rdf:type ex:B/C`. Empty results (`{"inferred":[],"count":0}`) usually mean the input lacks proper OWL ontology declarations — the OWL-DL reasoners (HermiT, Konclude) are stricter than OWL-RL.

### Debugging the browser WASM reasoner

If you see "Reasoning failed: …" with a Worker-related error, walk this checklist:

1. **Run the built-in diagnostic.** In the reasoning panel error message, click **Run diagnostic** (or paste `ontoink.diagnoseReasoner('pg-container')` into the DevTools console for the playground). A capability table appears showing the live state of:
   - `isSecureContext` — must be true (works on `localhost` and HTTPS)
   - `crossOriginIsolated` — must be true for SharedArrayBuffer
   - `SharedArrayBuffer` availability
   - Active service worker controller
   - `Worker` and `WebAssembly` availability

2. **The diagnostic includes two probe buttons:**
   - **Probe** the WASM module — actually runs `loadBrowserReasoner()` and reports how long it took or the exact error
   - **Probe server `/health`** — confirms whether the `/reason` endpoint is reachable

3. **Read the full stack trace.** Errors now expand a `<details>` block with the full stack — copy that when filing a bug.

4. **Common worker errors and fixes:**

   | Error message | Cause | Fix |
   |---------------|-------|-----|
   | "error loading dynamically imported module: …" | esm.sh blocked or CORS issue | Refresh the page; if persistent, your network blocks esm.sh — use the **Server** option in the dropdown |
   | "DataCloneError" / "An attempt was made to create an object on a thread which had access to it" | `SharedArrayBuffer` unavailable | Page not cross-origin isolated. Run `crossOriginIsolated` in the console — if `false`, reload (registers the service worker) |
   | "Failed to construct 'Worker': Script at … cannot be accessed from origin …" | Cross-origin worker creation blocked by browser | Open with `ONTOINK_MODE=all` (same-origin docs+API) rather than mixing local mkdocs serve + remote API |
   | "RangeError: WebAssembly.Memory(): could not allocate memory" | Out of memory (large ontology + small device) | Use the **Server** reasoner option, which has the container's full memory budget |

5. **Sanity check on the server side.** If browser reasoning is broken, the Server option should still work. From the reasoning panel dropdown pick e.g. `Server: HermiT (owlready2)` — that POSTs to `/reason` and bypasses the browser WASM entirely.

6. **Verify the backend independently:**

   ```bash
   # Inside or outside the container, send a known-good request
   curl -s http://localhost:8000/health        # → {"status":"ok",...}
   curl -s -X POST http://localhost:8000/reason \
     -H 'Content-Type: application/json' \
     -d @/tmp/payload.json | python3 -m json.tool
   ```

   This isolates whether the problem is in the browser or in the reasoner pipeline.

### Inspecting logs & persisted outputs

The container logs everything to stdout — view live with:

```bash
docker logs -f ontoink-all
```

You'll see:
- The mode banner (`ontoink: mode=all reasoner=auto port=8000`)
- The site-build phase (only on first run of `all` mode)
- Per-request uvicorn lines (`INFO: 172.17.0.1:... - "POST /reason HTTP/1.1" 200 OK`)
- Native Konclude banner when invoked (`{info} ... >> Konclude - Uni Ulm Parallel Reasoner ...`)

Every `POST /reason` request also persists to the mounted output volume when `ONTOINK_OUTPUT_DIR` is set (default in the image: `/output`). Mount it on the host:

```bash
docker run -d --rm --name ontoink-all -p 8000:8000 \
  -v "$PWD/output:/output" \
  -e ONTOINK_MODE=all ontoink:local
```

Each request creates a timestamped subdirectory:

```
output/
└── 20260513-105033-1a2b3c4d/
    ├── input.ttl
    ├── shapes.ttl            (if SHACL provided)
    ├── inferences.json       (full API response)
    └── inferences.nt         (N-Triples for downstream tools)
```

The `saved_to` field in the `/reason` response gives you the run ID. `docker compose` users get this automatically — the [docker-compose.yml](docker-compose.yml) mounts `./output:/output`.

## 6. CI

Two workflows run automatically:

- `.github/workflows/ci.yml` — pytest on every push/PR
- `.github/workflows/docker.yml` — builds & pushes the image to `ghcr.io/ise-fizkarlsruhe/ontoink` on every `v*` tag. Manual `workflow_dispatch` runs a build-only smoke test without publishing.

## 7. Pre-release checklist

Before tagging a release:

1. ✅ `pytest` passes locally
2. ✅ `node --check` on `ontoink.js` passes
3. ✅ `mkdocs serve` in `demo/` renders all pages, no JS errors in browser console
4. ✅ Playground manual checks (§4)
5. ✅ `docker build .` succeeds
6. ✅ All three `ONTOINK_MODE` values (`serve`, `build`, `api`) start without error
7. ✅ At least one `ONTOINK_REASONER` value returns inferences via `/reason`
8. ✅ Version bumped in `pyproject.toml`, `ontoink.js` header, `CHANGELOG.md`, `demo/docs/changelog.md`
9. ✅ Tag with `git tag vX.Y.Z && git push --tags`
