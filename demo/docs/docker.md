# Docker & self-hosting

A production-ready image is provided that bundles OntoInk, MkDocs, Java (for HermiT), and Node.js (for the Konclude WASM reasoner).

```bash
cp .env.sample .env       # edit ONTOINK_MODE and ONTOINK_REASONER
docker compose up --build
```

Configuration is environment-driven — see [`.env.sample`](https://github.com/ISE-FIZKarlsruhe/ontoink/blob/main/.env.sample) for the full list:

| Variable | Values | Purpose |
|----------|--------|---------|
| `ONTOINK_MODE` | `serve` \| `build` \| `api` \| `all` | What the container runs: MkDocs dev server (docs only), one-shot static build, FastAPI endpoints (no docs), or **`all`** — combined docs + API on a single port (recommended for production self-hosting; the playground's "Server" reasoner option works because docs and `/reason` are same-origin) |
| `ONTOINK_REASONER` | `auto` \| `owlready2` \| `konclude` \| `owlrl` \| `none` | Which OWL reasoner to use (see below) |
| `ONTOINK_PORT` | integer | HTTP port for `serve` / `api` |

### Reasoner backends

| `ONTOINK_REASONER` | Profile | Engine | Notes |
|--------------------|---------|--------|-------|
| `owlready2` | OWL DL (HermiT) | Java, bundled with owlready2 | Default fallback; complete but Java-bound |
| `konclude` | OWL DL (SROIQ) | **Native [Konclude](https://github.com/konclude/Konclude)** C++ tableau binary | Upstream reasoner from University of Ulm; bundled in the production image. **Note**: Konclude requires OWL/XML input — TTL produced via rdflib is RDF/XML, a different format. For full inference from TTL playground/API input, use `owlready2` or `konclude-wasm`. `konclude` is best when you have a proper OWL/XML ontology |
| `konclude-wasm` | OWL DL (SROIQ) | **[rdf-reasoner-konclude](https://github.com/ThHanke/rdf-reasoner-konclude)** — Konclude compiled to WASM for **browsers and Node.js** | Java-free, no native binary needed |
| `owlrl` | OWL-RL | Pure Python | Fastest, weakest expressivity |
| `auto` | — | tries owlready2 → konclude → konclude-wasm → owlrl | Default |
| `none` | — | — | Disable reasoning |

### API mode

`ONTOINK_MODE=api` exposes:

- `POST /reason` — `{ttl, shacl?}` → inferred triples
- `POST /validate` — `{ttl, shacl}` → SHACL conformance report
- `GET /health` — health check incl. selected reasoner
