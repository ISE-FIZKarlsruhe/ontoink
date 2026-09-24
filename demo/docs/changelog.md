# Changelog

All notable changes to OntoInk are documented here. This project follows [Semantic Versioning](https://semver.org/).

[:fontawesome-brands-python: View all releases on PyPI](https://pypi.org/project/ontoink/#history){ .md-button } [:fontawesome-brands-github: View all tags on GitHub](https://github.com/ISE-FIZKarlsruhe/ontoink/tags){ .md-button }

---

## Unreleased

### Added — every recommendation method is one you can cite

- **sheXer, the original implementation.** `method: shexer` runs [the authors' own library](https://github.com/DaniFdezAlvarez/shexer) (Fernández-Álvarez et al. 2022, [doi:10.1016/j.knosys.2021.107975](https://doi.org/10.1016/j.knosys.2021.107975)) rather than reimplementing the algorithm — a reimplementation by someone else is not the same method. It contributes `sh:pattern` and length constraints neither other method derives, and takes the best mean F1 of the three (0.90 against baseline's 0.87 over six benchmarks). Optional: `pip install 'ontoink[shexer]'`; without it, asking for it degrades to `auto` and says so on the panel.
- **Pick a method, tune it, from the page.** The **Shapes** panel and the [SHACL Editor](shacl-editor.md) both carry a method picker with the paper cited inline, and a **Hyperparameters** menu holding whatever knobs that method actually reads. Changing either re-runs induction in the browser. Both are built from the engine's own method catalogue, so a method it cannot run is shown disabled with the reason instead of being offered and then failing.
- **`params:` on the fence and the API.** `recommend_shapes: {method: shexer, params: {acceptance_threshold: 0.2}}`. `auto` takes them keyed by sub-method, since it composes two. `GET /recommend-methods` returns the whole catalogue — labels, citations, DOIs, knobs, ranges and availability — so a client can build its own picker.
- **Only published methods ship, and only knobs that do something are offered.** A recommendation you cannot trace to a peer-reviewed method is one you cannot defend in review. `baseline` also accepts a `max_samples` argument that provably changes no output, so it is absent from the menu — a slider that moves and changes nothing is worse than no slider. See [Shape Recommendation](examples/shape-recommendation.md) for the full method and parameter tables.

### Changed

- **The benchmark suite now pins the port to the reference implementation rather than to a recorded score.** It asserted the shipped engine reproduced the research project's recorded F1 numbers; those depend on the gold shapes, so revising the gold broke four assertions with nothing wrong in the code. It now requires both implementations to produce identical constraint sets on the same graph.

---

## [0.7.8] - 2026-09-24

### Fixed — two assets that never reached installed sites, and a reasoner that ignored being switched off

- **`shacl.mjs` was missing from the wheel, so every `pip install ontoink` site silently lost SHACL Core validation.** The vendored `rdf-validate-shacl` bundle lived only in `demo/docs/assets/shacl/`, which is the demo site's own docs tree — it was never in `[tool.setuptools.package-data]` and `on_files` never copied it. Installed sites therefore 404'd on `/assets/shacl/shacl.mjs` and fell back to `validateMinimal()`, the cardinality-only checker, with nothing on screen to say so: a page could report *conforms* on a shape whose `sh:datatype` or `sh:pattern` was never evaluated. This is the same failure that hit the Konclude WASM bundle in 0.7.5, in the same way. The bundle now lives at `ontoink/resources/assets/shacl/`, ships in the wheel, and is copied into the built site next to the reasoner bundle; `scripts/build-shacl-bundle.mjs` writes to the new location.
- **`ONTOINK_REASONER=none` did not stop the OWL consistency check.** `_run_reasoning` honoured the variable, but `_check_consistency` was called unconditionally and consulted no setting at all, so every fence still paid a full HermiT/JVM round trip — on a seven-triple documentation fence that round trip *was* essentially the whole build cost. There is now `ONTOINK_CONSISTENCY` (`off` to disable), and `ONTOINK_REASONER=none` disables the check as well, on the grounds that asking for no reasoning should not start a reasoner. The two remain independent otherwise: `ONTOINK_REASONER` selects which backend materialises inferences, which is a different feature from checking for contradictions. When the check is skipped the payload records `status: "skipped"`, and the reasoning panel treats that like `"unknown"` rather than claiming "0 new triples inferred" — a result no reasoner produced.
- **`CITATION.cff` credited the wrong authors for the Konclude system description** (Liebig, Jaeger, Möller, Möller) while the file's own third reference had it right; it is Steigmiller, Liebig and Glimm. The `authors:` list also named only the first author where the project has three.

### Added — every recommendation method is now one you can cite

- **sheXer, the original implementation.** `method: shexer` runs [the authors' own library](https://github.com/DaniFdezAlvarez/shexer) (Fernández-Álvarez, Labra-Gayo & Gayo-Avello 2022, *Knowledge-Based Systems* 238, [10.1016/j.knosys.2021.107975](https://doi.org/10.1016/j.knosys.2021.107975)) and projects its SHACL output into the shared constraint model, rather than reimplementing the algorithm — a reimplementation by someone else is not the same method. It contributes `sh:pattern`, `sh:minLength` and `sh:maxLength`, which neither other method derives, and takes the best mean F1 of the three (0.903 against baseline's 0.871 over six benchmarks), almost all of the margin coming from real Wikidata. Optional: `pip install 'ontoink[shexer]'`. Without it, asking for it degrades to `auto` with a notice on the panel instead of failing the build. Three quirks of sheXer's SHACL serialiser are normalised so its output can be compared with anything — `sh:dataType` with a capital T, object ranges written as `sh:node <OtherShape>` rather than `sh:class`, and a property shape for `rdf:type` itself; each is a serialisation detail, none changes what sheXer inferred.
- **Method selection and hyperparameters in the UI.** The **Shapes** panel and the SHACL Editor both carry a method picker with the paper cited inline (DOI linked), and a **Hyperparameters** menu holding whatever knobs that method actually reads. Changing either re-runs induction in the browser and repaints. Both pickers are built from the engine's own catalogue rather than a hard-coded `<option>` list, so a method added to the engine appears without a second edit, and one this build cannot run (sheXer is Python-only in-browser) is shown disabled with the reason instead of being offered and then failing.
- **`params:` on the fence, the API and the Python entry points.** `recommend_shapes: {method: shexer, params: {acceptance_threshold: 0.2}}`. `auto` takes them keyed by sub-method (`params: {baseline: {min_count_threshold: 0.75}}`) because the two would otherwise share one namespace. Unknown keys are dropped rather than passed through — a typo in YAML would otherwise reach the method as an unexpected keyword and turn into a build error. Values are type-coerced and clamped to their declared range.
- **`GET /recommend-methods`** returns the catalogue — labels, citations, DOIs, declared knobs with defaults and ranges, and which methods that server can actually run — so a client can build its own picker without hard-coding a list.
- **The stated rule for what ships: published, citable methods only.** A recommendation a user cannot trace to a peer-reviewed method is one they cannot defend in review, so the reference now travels with the method into the panel, the API and the docs. The research project alongside this one holds several unpublished experimental inducers; none are exposed, whatever they score. `tests/test_recommend_parity.py` asserts every shipped method carries both a citation and a DOI.
- **Knobs that do nothing are deliberately not offered.** `induce_baseline` takes a `max_samples` argument that caps the sample values the profiler retains, which nothing in the method reads — datatype and class inference run off the full frequency counts, in this port and in the reference implementation. It is absent from the menu: a slider that moves and changes nothing is worse than no slider. sheXer's `all_classes_mode` is likewise not a checkbox — it is derived from whether the caller named target classes, so the two can never be set to contradict each other.

### Changed

- **`tests/test_benchmark_fidelity.py` now pins the port to the reference implementation, not to a recorded score.** It asserted that the shipped engine reproduced the F1 numbers in the research project's `eval.json` files; those are a function of the gold shapes, and when `data/gold/lubm-1u.ttl` was revised from 26 to 187 constraints, four assertions failed with nothing wrong in the code. A test that breaks when the ground truth improves is measuring the wrong thing. It now runs both implementations over the same graph and requires identical constraint sets, which catches real drift and survives gold revisions. The benchmark list is read from the research project's own `grid.yaml` rather than duplicated — the duplicate had gone stale, still naming the retired 47-triple `wd-q-subset` stub and knowing nothing of `wd-humans` or `dbpedia-scientists`.
- **`scripts/eval_recommender.py`** reads the same `grid.yaml`, runs every available method by default, and gained `--datasets` for a subset.
- **The JS↔Python parity suite covers the catalogue too** — same methods, same labels, same summaries, same citations down to the DOI, same knobs with the same defaults and ranges, and the same clamping of out-of-range and unknown parameters. A citation corrected on one side only is a wrong attribution shown to a reader.

### Fixed

- **`ontoink.js` was committed with CRLF line endings** while the repository stores LF, turning any diff of it into 21,000 changed lines and hiding the ~250 real ones.
- **Node-backed tests failed on Windows the moment the engine grew a non-ASCII citation.** `node -e <script>` passes the source through the console codepage and `subprocess(text=True)` decodes the reply with the ANSI codepage, so "Fernández" and "García" mangled the script going in and killed the reader thread coming back — `proc.stdout` came back `None` and 27 tests failed with an unrelated-looking JSON error. Both directions are now explicitly UTF-8.
- **The engine-extraction list used by the Node test harnesses was duplicated across two files.** Adding `_METHOD_SPECS` to the engine broke `test_shacl_editor_page.py` with `_METHOD_SPECS is not defined` — five failures caused by a list updated in one place and not the other. It now lives once, in `tests/js_engine.py`.

## [0.7.7] — 2026-08-11

[:fontawesome-brands-python: PyPI](https://pypi.org/project/ontoink/0.7.7/) &middot; [:fontawesome-brands-github: Release](https://github.com/ISE-FIZKarlsruhe/ontoink/releases/tag/v0.7.7)

### Added — SHACL shape recommendation

- **OntoInk can now propose the shapes you haven't written.** `recommend_shapes: true` on a fence adds a **Shapes** panel listing a `sh:NodeShape` for every class with no coverage, each constraint shown with the evidence behind it, plus Copy and *Add to editor* buttons. It runs at build time, so it works on GitHub Pages.
- Two induction methods, folded in from a benchmark of eight: **`baseline`** profiles instance data (Mihindukulasooriya et al. 2018), **`astrea`** derives constraints from OWL axioms alone — the only one that says anything about a documentation ontology that ships no individuals. **`auto`** runs both and merges them, recording which method proposed each constraint. The other six either over-predicted, produced output identical to the baseline on real ontologies, or were never fully implemented.
- **Confidence survives serialisation.** Emitted shapes carry `sh:description` plus `oi:confidence` / `oi:support` / `oi:population` / `oi:method`. They are annotations, so the file still validates with `pyshacl` unchanged.
- **Right-click a class → *Induce shape from this class*.** Proposals appear as dashed edges whose opacity is mapped from their confidence, with a trust slider that fades out the weakly-evidenced ones. Clicking a ghost edge accepts it: it becomes a real constraint edge and its Turtle lands in the **Edit & Validate** buffer, where Validate is one click away.
- **The `no-shacl-coverage` smell now generates the shape it asks for** — a ready-to-paste skeleton per uncovered class, with a copy button, instead of prose pointing at another tool.
- New `POST /recommend-shapes` endpoint in the API mode, so the fence, the SHACL editor and the graph context menu all run one implementation.

### Added — closing the loop back into CI

- **`shape_drift: warn`** compares committed shapes against what the data implies today: constraints the data supports that the file omits, committed constraints almost nothing satisfies (with a concrete relaxation), and classes with no shape. Findings go through the MkDocs logger, so `mkdocs build --strict` fails the build.
- **Competency questions are executable.** A new `ontoink-cq` fence pairs each question with SPARQL and an expectation and renders pass/fail cards with the query and bindings; `reasoning: true` merges inferred triples first, so a question can assert what the ontology *entails*. **Show on graph** selects a question's bound terms on the nearest diagram, without needing to know its id.
- **`ontoink-report.json` and README badges** are written on every build — SHACL conformance, the OntoSniff score, consistency, drift and CQ results in one machine-readable artefact. Badges are rendered locally, with no request to an external badge service. A `quality_gate:` config block fails the build on score regressions, new violations, inconsistency or drift.

### Added — trust and provenance

- **"Explain this inference."** Right-click an inferred edge for a proof tree: which OWL-RL rule fired, on which premises, down to asserted facts. Only the in-page reasoner can do this — Konclude, HermiT and the server backends return proof-free triples, and the panel says so rather than inventing a derivation.
- **Cite this ontology** — license badge, version, creators and a generated BibTeX block read from the `owl:Ontology` header.
- **Deprecated terms read as retired** (dimmed, dashed border) and the deprecation smell now names the successor declared via IAO:0100001 or `dcterms:isReplacedBy`.
- **Findings are actionable**: quality-smell chips and competency-question results can select their terms on the canvas, revealing anything the current LOD level had hidden.

### Fixed

- **Literal node ids are stable across builds.** They were `abs(hash(str)) % 999999`, and Python salts string hashing per process, so the same literal got a new id on every build.
- **Build-time SHACL validation failures are no longer silent.** A bare `except` turned a broken or missing shapes file into an unvalidated diagram with nothing in the build log.
- **`/reason`'s reasoner override no longer mutates the environment**, which two concurrent requests could race on.
- **Build-time and server validation agreed to disagree** — `none` versus `rdfs` inference, so the same file could conform on the page and fail in CI. Both now share one default, with `validation_inference:` to opt in.
- **The `predicates:` policy is reachable at last** — `hide_predicates` / `fold_into_badge` / `badge_predicates` have been implemented since 0.7.0 but nothing ever passed them from the fence YAML.
- **Style presets are matched case-insensitively**, so choosing "Style: Ontoink" after another preset restores the default instead of warning about an unknown preset.
- **One version, everywhere.** `pyproject.toml` reads it from `ontoink/__init__.py`, the API reports it instead of a hard-coded `0.7.2`, and the page exposes `window.ONTOINK_VERSION` in place of a header comment that had been stale since 0.7.4.
- **The wheel shipped the entire repository** — `tests/`, `scripts/`, the shape-recommender research project and the paper draft were all installed as top-level packages, because package discovery defaulted to namespace mode.
- **Three buttons were silently dead.** The no-eval attribute shim understood strings and numbers but not lists, and split argument lists at commas inside brackets — so any button passing a set of IRIs was mangled before it ran. That covered "Show class", the select action on OntoSniff chips, and "Show on graph" on competency-question results. Lists now parse, and a new test runs the real shim under Node against every call shape the plugin emits.
- **An apostrophe in a label broke its button** — *Alzheimer's disease* closed the single-quoted attribute argument early.
- **The axiom-driven method found nothing on an ontology with no instances** — the one case it exists for. It discovered properties by looking at which ones were *used* in the data; in a documentation ontology a property appears as the subject of `rdfs:domain` and is never used, so the whole domain/range branch silently produced nothing. None of the five research benchmarks could catch this, because every one of them ships instance data that exercises its properties.
- **`auto` mode threw away evidence it had already found**: when both induction methods derived the same constraint, the axiom-derived one won and its empty instance counts were what got serialised. Colliding derivations now merge.

---

## [0.7.6] — 2026-08-06

[:fontawesome-brands-python: PyPI](https://pypi.org/project/ontoink/0.7.6/) &middot; [:fontawesome-brands-github: Release](https://github.com/ISE-FIZKarlsruhe/ontoink/releases/tag/v0.7.6)

### Fixed — rendering and export resolution

- **Diagrams rendered at half resolution on HiDPI screens.** `pixelRatio: 1` arrived in 0.7.4 as a large-ontology optimization but was applied to every graph, pinning the canvas to one device pixel per CSS pixel — on a retina or 4K display the whole diagram was drawn at half the available resolution. The ratio now follows the display (capped at 2) and drops to 1 only for graphs of 500+ nodes; the motion optimizations became conditional for the same reason. `pixel_ratio: N` in the fence YAML overrides the choice either way.
- **PNG exports are sized for print.** The fixed `scale: 2` meant a compact diagram exported at ~1400 px on its long edge; the scale is now derived so the result lands near 3000 px, clamped to the browser's canvas limits. `ontoink.exportPNG(id, 4)` still forces an explicit scale.

### Changed — documentation

- The site is branded **OntoInk** (the package, module and fence name stay `ontoink`), the navigation collapsed from thirteen tabs to five, and the tab bar stays visible while scrolling.
- The landing page leads with the live diagram rather than prose; new **Architecture** and **Docker & self-hosting** pages carry the material that used to sit in the README.

---

## [0.7.5] — 2026-08-06

[:fontawesome-brands-python: PyPI](https://pypi.org/project/ontoink/0.7.5/) &middot; [:fontawesome-brands-github: Release](https://github.com/ISE-FIZKarlsruhe/ontoink/releases/tag/v0.7.5)

### Added — Size & Typography in Edit Layout

- **Edit Layout can now change how big the shapes are and which font they use.** A master **Scale** slider (40–300 %) moves shape size, node labels and edge labels together; below it sit explicit px boxes for each, a **font family** picker (Inter, Helvetica/Arial, Verdana, Georgia, Times, Mono), a **weight** picker and an **italic** toggle. Each node-type row also gained per-type **size** and **font** boxes that override the global values.
- Size is expressed as **padding around the label** rather than a fixed width/height, because every OntoInk stylesheet sizes nodes with `width/height: "label"` — so shapes grow with the scale and labels never clip.
- Typography values live in **element data** and are read through function mappers installed on every stylesheet — the fence, the playground, the live editor **and all four style presets** — so the settings survive layout changes, LOD sweeps, element re-creation and a switch to Chowlk/Graffoo/VOWL, and they are baked into PNG/SVG exports.
- New API: `ontoink.setTypography(id, key, value, scope)`, `applyTypography(id)`, `resetTypography(id)`, `getInstance(id)`.

### Added — Multi-selection and a right-click context menu

- **Ctrl/Cmd+click and Shift+click extend the selection**, Ctrl/Shift+drag rubber-bands, and dragging any selected node moves the whole selection. The node popup no longer fires during a multi-select gesture, and the selection renders with a cyan halo.
- **Right-click opens a context menu** with inline-SVG icons: align left/centre/right/top/middle/bottom; distribute horizontally/vertically with equal gaps; arrange as a grid or circle; snap to a 20 px grid; **tidy as taxonomy** (rows derived from `rdfs:subClassOf` depth); bigger/smaller/match size; pin & unpin (layout runs skip pinned nodes); colour the selection.
- **Ontology-specific verbs** beyond the drawing ones: select same type · same namespace · grow to neighbours · sub-class tree · super-classes · instances of the selected classes · SHACL shapes constraining them · connected component; isolate / hide / show hidden; path between exactly two selected nodes; copy IRIs, labels, the selection as TTL or as a Markdown table; download the selection as `.ttl`; export the selection as PNG.
- **Edge menu** — select both endpoints, select every use of this predicate, hide all edges of this type, copy the predicate IRI, copy the triple. **Cluster menu** — expand/collapse and select members.
- **Undo/redo** (`Ctrl+Z` / `Ctrl+Shift+Z`, 25 steps) for every position, size, pin and visibility verb.
- **Keyboard**: `Ctrl+A`, `Escape` (close menu, then clear selection), `Delete` hides the selection, arrow keys nudge it (`Shift` = 10×), `Shift+F10` / the Context-Menu key opens the menu with roving-tabindex arrow navigation and `role="menu"` semantics. Shortcuts are scoped to the graph under the pointer or keyboard focus, never stolen from the TTL editor.

### Fixed

- **The fonts never actually applied.** Every stylesheet asked for `"'Inter','Segoe UI',system-ui,sans-serif"` in CSS syntax, but Cytoscape validates `font-family` against a regex that forbids quotes — a quoted stack fails silently and falls back to the Cytoscape default (Helvetica Neue). All 25 declarations are now unquoted, so diagrams finally render in the font they always asked for.
- **The Konclude WASM reasoner bundle now actually ships in the wheel.** The package-data glob pointed at `resources/reasoner/*` while the vendored files live in `resources/assets/reasoner/*`, so `bundle.mjs`, `konclude.mjs`, `konclude.wasm` and `worker.js` were absent from every distribution and the plugin's `on_files` hook found an empty directory — every `pip install ontoink` site kept 404-ing on `/assets/reasoner/bundle.mjs`, the exact failure 0.7.4 set out to fix (it only ever worked from a source checkout).
- **SVG export cropped anything outside the viewport** — precisely what the new align/distribute verbs encourage. It now fits first when the graph extends past the viewport, then restores your zoom and pan.
- **"Copy selection as TTL" dropped `rdfs:subClassOf`** whenever the parent wasn't selected. It now emits every triple asserted by a selected subject, skips overlay-only edges (inferred / SHACL) and quotes literal objects.
- Selection and pinned-node styling is re-appended to every style preset instead of vanishing on a preset switch; manual arrangements are saved to the position cache (programmatic moves never fire `dragfree`); geometry verbs run inside `cy.batch()`.
- The live DSL editor had no selection layer at all — it is now wired like the fence and playground paths.

---

## [0.7.4] — 2026-07-21

[:fontawesome-brands-python: PyPI](https://pypi.org/project/ontoink/0.7.4/) &middot; [:fontawesome-brands-github: Release](https://github.com/ISE-FIZKarlsruhe/ontoink/releases/tag/v0.7.4)

### Added — Plugin auto-installs the browser reasoner bundle

- **The plugin ships a pre-built vendored `rdf-reasoner-konclude` bundle** (`bundle.mjs`, `konclude.mjs`, `konclude.wasm`, `worker.js`) and copies it to `<site>/assets/reasoner/` at build time. OntoInk's browser reasoner imports it same-origin — browsers reject cross-origin module Workers even with COEP credentialless, so without a same-origin copy the WASM Worker refused to spawn and the panel died with "Worker error — the WASM worker died during init". (See 0.7.5: a packaging glob bug meant this only worked from a source checkout until then.)
- **`coi-serviceworker.js` is copied to the site root** and injected at the top of every OntoInk page, so `SharedArrayBuffer` is available for the WASM reasoner on static hosts (GitHub Pages) that cannot send COOP/COEP headers.

### Added — Style presets

- **Chowlk, Graffoo and VOWL stylesheets** are selectable from the toolbar, alongside the OntoInk default. Presets approximate the canonical notations where Cytoscape can express them.

### Fixed

- **Blank nodes are styled as blank nodes** — rdflib emits blank subjects as `_:bN…`, which the parser tagged as Individuals; they now render as small dashed grey diamonds.
- **Exported figures explain their purple dotted edges** — overlay edge types that live only in Cytoscape (the inferred overlay) are now seeded into the export legend.
- **Viewport optimizations for large ontologies** — edges and labels hide during pan/zoom and the scene is bitmap-cached, with finer-grained wheel zoom.

---

## [0.7.3] — 2026-07-20

[:fontawesome-brands-python: PyPI](https://pypi.org/project/ontoink/0.7.3/) &middot; [:fontawesome-brands-github: Release](https://github.com/ISE-FIZKarlsruhe/ontoink/releases/tag/v0.7.3)

### Fixed — Reasoning panel

- **"0 inferences from a successful build-time reasoner" no longer falls through to the runtime reasoner.** When owlready2/HermiT runs in the build container, reports `consistent`, and returns an empty inferred list — typical for pure SHACL shape files with no OWL-DL entailments — the panel used to punt to the runtime reasoner, which on a static host has no `/reason` endpoint and errored with "No reasoner available". The panel now distinguishes the two cases via `data.consistency.status`: a reasoner that ran gets a "Build-time OWL reasoning: 0 new triples inferred" panel with a consistency badge and a re-run link, while `status: "unknown"` keeps the old fall-through so a local server or a `crossOriginIsolated` browser can still pick up the work.

---

## [0.7.2] — 2026-07-15

[:fontawesome-brands-python: PyPI](https://pypi.org/project/ontoink/0.7.2/) &middot; [:fontawesome-brands-github: Release](https://github.com/ISE-FIZKarlsruhe/ontoink/releases/tag/v0.7.2)

### Added — Embeddable, CSP-safe build

- **`ontoink.embed(el, {ttl, shape, layout, height, editor, reasoning})`** — mount an interactive OntoInk diagram from a Turtle string into any element on any page, no MkDocs required. It builds the toolbar/canvas/panels, parses the TTL client-side (the same path as `ontoink.playground`), and returns the container id. `shape` overlays SHACL constraints; `layout` sets the initial layout. See the new [Embedding](embedding.md) guide.
- **`scripts/build_embed_bundle.py`** — bundles the vendored libraries + the OntoInk runtime into a single self-contained `dist/ontoink.embed.js` (+ `dist/ontoink.embed.css`). Drop the two files next to your page, add a `<div class="ontoink-embed">`, and call `ontoink.embed()`.

### Changed — CSP-safe by default (no inline handlers, no CDN)

- **Every event handler is now CSP-safe.** All inline `on*=` handlers — in the fence toolbar and the runtime-generated panels/popups — are emitted as `data-oi-on*` attributes and attached with `addEventListener` by a small, eval-free interpreter (plus a `MutationObserver` for dynamically-created UI). OntoInk now runs under a strict `Content-Security-Policy` (`script-src 'self'`, no `'unsafe-inline'`), both embedded and on its own MkDocs pages.
- **Third-party libraries are self-hosted, not loaded from a CDN.** Cytoscape, dagre, cytoscape-dagre, cytoscape-svg and CodeMirror (+ turtle mode) are vendored under `ontoink/resources/vendor/`; the plugin copies them into the built site (`on_files` → `<site>/vendor/`) and injects local `<script>` tags. Pages now build and run fully offline and behind strict CSPs.

### Fixed

- **API version drift** — `ontoink.api` (`/health`, the FastAPI app title, and the deref `User-Agent`) reported `0.6.3` while the package had moved to `0.7.x`; it now reports the current version.

---

## [0.7.1] — 2026-07-10

[:fontawesome-brands-python: PyPI](https://pypi.org/project/ontoink/0.7.1/) &middot; [:fontawesome-brands-github: Release](https://github.com/ISE-FIZKarlsruhe/ontoink/releases/tag/v0.7.1)

### Fixed — Live-editor DSL parser

- **`@prefix ee: <http://ex#>` no longer reports "unterminated <IRI>"** — the line-comment stripper treated any `#` as a comment start, so `@prefix` lines whose namespace ended in `#` (the canonical form for RDFS / OWL) were silently truncated and the closing `>` disappeared. Fixed by tracking `<IRI>` context in the stripper. User-declared prefixes now surface correctly in the Prefixes overlay and the generated Turtle.
- **Empty-prefix CURIE `:Person` is accepted** — the parser used to silently drop any triple that started with a `:` (Turtle default namespace); `:Local` is now a first-class CURIE.
- **Typo detector for arrow shortcuts** — `-is->`, `-A->`, `-chian->`, and any bare-identifier arrow within Levenshtein distance ≤ 2 of a known shortcut now emits an error suggesting the correct one (`did you mean -isa-> ?`) plus the shortcut vocabulary.
- **Every parser error now carries a plain-English hint** — a second line under the error explains what an IRI, a CURIE, or a predicate arrow is, so non-experts learn how to fix it, not just where it broke.

### Fixed — Type inference

- **Rank-tiered strength**: an explicit `rdf:type` (or a vocabulary-position class) beats an inferred kind from a predicate signature; no more `owl:ObjectProperty` demoted to `DatatypeProperty` because someone hangs `rdfs:label` off it.
- **All conflict pairs reported**, not just the first-seen one.
- **Well-known annotation properties** (`rdfs:label`, `rdfs:comment`, `skos:definition`, `dc:title`, `dcterms:description`) are typed as `owl:AnnotationProperty` when they take a literal.
- **SHACL predicates feed the inference table**: `sh:path`, `sh:targetClass`, `sh:datatype`, `sh:class`, `sh:target[Objects|Subjects]Of`, `sh:node`, `sh:property`.
- **Datatype ⊑ Class subsumption** accepted in `_kindsCompatible`, so `xsd:integer` on a range doesn't fire a spurious conflict.
- **`undefined:undefined` gone from evidence labels** — full-IRI subjects now get a short label from the trailing path segment.
- **`xsd:*` on `rdfs:domain`** types the subject as `owl:DatatypeProperty`, not `owl:ObjectProperty`.

### Fixed — Rendering

- **Property chains and boolean class expressions collapse `rdf:List` scaffolding.** `owl:propertyChainAxiom`, `owl:intersectionOf`, and `owl:unionOf` no longer leak `_:list0` / `_:list1` / `rdf:first` / `rdf:rest` / `rdf:nil` bubbles into the diagram. Chain axioms render as `chain 1..N`, intersections as `and 1..N`, unions as `or 1..N`.

### Changed — Live editor UX

- **Line-number gutter** next to the DSL editor — errors that reference "line 12, column 5" are now visually locatable, and clicking an error row jumps the caret to that position.
- **Warnings are amber, not red** — the diagnostic strip distinguishes hard parse errors from type-inference warnings with a coloured kind pill and a hint line under the message.
- **Playground-parity super-node + hull expand/collapse taps** — clustered views behave the same everywhere.
- **Prefixes overlay filters to referenced prefixes only.**
- **Widened live-editor layout** — the mkdocs content column is widened via a `:has(#live-editor-app)` guard (leaves other docs pages untouched), the right-hand TOC is hidden on this page, and pane heights use `clamp()` so tall monitors give the graph more room without breaking mobile stacking.
- **Node / Edge popups + Legend + Prefixes overlays wired into the live editor** — the same panels the fence graphs use.

---

## [0.7.0] — 2026-07-09

[:fontawesome-brands-python: PyPI](https://pypi.org/project/ontoink/0.7.0/) &middot; [:fontawesome-brands-github: Release](https://github.com/ISE-FIZKarlsruhe/ontoink/releases/tag/v0.7.0)

### Added

- **Big-ontology mode — Semantic-Tile bundle** — a coordinated set of build-time + runtime knobs that lets one OntoInk diagram scale from a tiny example to a 100 000-triple ontology without swamping the browser. Opt-in: a fence with no YAML config still renders exactly the same graph 0.6.1 rendered.
    - **Build-time literal-fold + predicate-policy YAML config** — `predicates: { hide_predicates, fold_into_badge, badge_predicates }` (CURIEs resolve against the source graph's own prefixes; `prov:*` wildcards match by namespace URI). Folded literals migrate into `node_badges`; hidden predicates are dropped wholesale.
    - **Leiden clustering with LLM-titled super-nodes and JSON side-store** — needs `ontoink[cluster]` (python-igraph + leidenalg). `ontoink[topic]` (anthropic + openai) additionally names each community; a missing library or missing API key falls back to a deterministic synthetic title.
    - **Element-removing semantic zoom (L0..L6) slider** — new toolbar slider, default L2. L0 = super-nodes + top-K central classes only, L6 = everything (SHACL + inferred).
    - **Attic side panel for reversible progressive disclosure** — every element hidden by the LOD slider is snapshotted into a per-diagram Attic; a pin button re-adds it to the canvas regardless of the slider.
    - **SPARQL endpoint result graphs get the same LOD slider + Attic** — SELECT rows projecting `?s ?p ?o` now materialise into the live graph, are sanitised through the same `predicates:` policy, and settle into the Attic when hidden. Community detection stays build-time only.
- **Optional dependency groups** — `[cluster]` (python-igraph + leidenalg) for community detection, `[topic]` (anthropic + openai) for super-node titling. Neither is required for the default rendering path.

### Changed

- **Fence toolbar** gains a new group between search and export: LOD slider + LOD value badge + **Attic** button + **Super** checkbox.
- **Super-node styling** — hexagon with a double 3-px cyan border, chunkier font, and a `·N` member count in the label. Clicking a super-node expands / collapses its community; the ordinary node popup does not fire.
- **CSS design tokens** — new `--ov-attic-*`, `--ov-super-*`, `--ov-badge-*`, `--ov-restriction-*` tokens make every new control themable via Edit Layout.

### Fixed

- **No-config regression** — the predicate policy compiles to empty sets when no policy is given, so `parse_ttl_to_cytoscape(path)` returns the exact triple-by-triple output shape 0.6.1 emitted. Verified by the existing test suite (83 passed, 4 skipped, no test changes).
- **Attic z-index isolation** — the panel sits inside `.ontoink-container` (which is `isolation: isolate` since 0.6.1) so its `z-index: 400` cannot escape over the host site's sticky chrome.

---

## [0.6.3] — 2026-06-10

[:fontawesome-brands-python: PyPI](https://pypi.org/project/ontoink/0.6.3/) &middot; [:fontawesome-brands-github: Release](https://github.com/ISE-FIZKarlsruhe/ontoink/releases/tag/v0.6.3)

### Added

- **Full in-browser SHACL validation** — interactive **Validate** now runs a standards-compliant SHACL **Core** engine (`rdf-validate-shacl`) entirely in the browser, replacing the old cardinality-only checker. It catches `sh:datatype`, `sh:class`, `sh:nodeKind`, `sh:pattern`, value ranges, `sh:in`/`sh:hasValue`/`closed`, logical/shape-based constraints, property paths and inline blank-node shapes — verified against pyshacl. Ships as a committed same-origin bundle (`assets/shacl/shacl.mjs`), so it works on the static demo with no server. (SHACL-SPARQL constraints and SHACL-AF `sh:rule` still need the server/build-time pyshacl.)
- **Server-side ontology dereference proxy (`/deref`)** — a generic, CORS-free, SSRF-guarded alternative to the hard-coded mirror registry; the "More…" dereference prefers it when a server is reachable and works for any ontology (including FOAF)

### Fixed

- **Dead ontology-mirror URLs** — the BFO and IAO entries in the known-ontology registry returned 404 (files moved); nfdicore is now version-less. Browser dereferencing of those namespaces works again
- **Legend edge arrowheads** — the legend ignored the pointer shape chosen in *Edit Layout* and always drew a triangle; it now renders tee / vee / diamond / circle to match the graph
- **Playground "Edit & Validate" now has a SHACL Shapes pane** — the playground's editor was missing the shapes editor, so an uploaded or `?shape=`-linked SHACL file was never shown and validation ran against empty shapes. The panel now matches the fence-rendered editor (Source | SHACL Shapes + Validation Report), and validation falls back to the loaded shapes so `?data=…&shape=…` links validate even before the editor is opened

---

## [0.6.2] — 2026-06-08

[:fontawesome-brands-python: PyPI](https://pypi.org/project/ontoink/0.6.2/) &middot; [:fontawesome-brands-github: Release](https://github.com/ISE-FIZKarlsruhe/ontoink/releases/tag/v0.6.2)

### Fixed

- **All four OWL reasoner backends now return inferences** — `owlready2`/HermiT, native `konclude`, and `konclude-wasm` each failed silently before (Turtle vs RDF/XML, OWL-XML output parsed as RDF/XML, N-Quads vs N-Triples), so only `owlrl` ever produced results. All four now work on OWL 2 property-restriction ontologies
- **`owl:equivalentClass` (and `intersectionOf`-nested) restrictions are now visualised** — previously only `rdfs:subClassOf` restrictions were drawn. The two are distinguished: `⊑` (solid triangle) for a necessary condition vs `≡` (hollow diamond) for a definition
- **Browser (in-page) Konclude WASM `Error: unwind`** — the Emscripten exit sentinel is now caught and the inferred graph harvested
- **Edit & Validate → Update Graph (and the playground) no longer destroy restrictions** — a new blank-node-aware client-side parser collapses `owl:Restriction` into the same `⊑`/`≡` edges as the server-rendered diagrams, instead of exploding into raw `[ ]`/`owl:Restriction` nodes

### Added

- **`reasoner:` fence option** — set a diagram's default reasoner backend, e.g. `reasoner: owlrl`
- **Comprehensive Reasoning & Inference demo** — [examples/reasoning-demo.md](examples/reasoning-demo.md) now walks every RDF/RDFS/OWL/OWL2 reasoning feature with a small self-contained example each

### Changed

- **OLS IRI-dereference link** — dropped the "Found in: N ontologies" line; the cross-ontology link now reads "Ontologies using this IRI on OLS"

---

## [0.6.1] — 2026-06-04

[:fontawesome-brands-python: PyPI](https://pypi.org/project/ontoink/0.6.1/) &middot; [:fontawesome-brands-github: Release](https://github.com/ISE-FIZKarlsruhe/ontoink/releases/tag/v0.6.1)

### Added

- **SHACL Shapes editor pane in *Edit & Validate*** — two-column editor (data TTL + SHACL shapes) with CodeMirror Turtle highlighting and a constraint-count in the report line
- **Resizable popups** — drag the bottom-right corner to enlarge a popup

### Fixed

- **"Ontologies reusing this IRI on OLS" link returned zero results** — now derives the OBO short ID (e.g. `IAO:0000300`) so OLS search matches
- **Sticky toolbar bleeding over host-page chrome** — `.ontoink-container` now isolates its stacking context

---

## [0.6.0] — 2026-05-17

### Added

- **Browser-side reasoning in the playground** — Reasoning button with backend dropdown (Auto / Browser Konclude WASM / Server backends). Browser option enabled when cross-origin isolated; server options enabled when `/health` reachable
- **COOP/COEP service worker** so the playground's WASM Konclude works on GitHub Pages without server-side header support
- **Per-request `reasoner` override on `POST /reason`** — clients can choose the backend without restarting the server
- **Playground parity** — Abstract View and reasoning panel match the MkDocs fence path
- **Production Docker image** with `ONTOINK_MODE` env switch (`serve` / `build` / `api` / **`all`**) and `ONTOINK_REASONER` selector. The new `all` mode builds the docs once and serves them via FastAPI on the same origin as `/reason` — so the playground's "Server" reasoner works without a reverse proxy
- **Konclude two-pass reasoning** — native Konclude wrapper runs both `classification` and `realization`. **Note**: Konclude expects OWL/XML input; for TTL input use `owlready2` or `konclude-wasm`
- **Native Konclude reasoner** (`ONTOINK_REASONER=konclude`) — upstream Konclude C++ tableau binary, downloaded into the production Docker image
- **rdf-reasoner-konclude** (`ONTOINK_REASONER=konclude-wasm`) — WASM Konclude port for **browsers and Node.js**, no Java required
- **FastAPI mode** — `/reason`, `/validate`, `/health` endpoints when `ONTOINK_MODE=api`
- **SHACL constraint edges in the playground** — shapes now render as cyan dashed cardinality-labelled edges, matching the MkDocs build path
- **SHACL shape IRI dereferencing** — labels and axioms auto-fetched for `sh:path`, `sh:targetClass`, `sh:class`, `sh:datatype`, `sh:node` IRIs on graph load
- **GitHub Actions workflow** to build & push the Docker image to GHCR on each `v*` tag
- **TESTING.md** with end-to-end manual test plan (Python, JS, MkDocs, playground, Docker)
- `.env.sample`, `NOTICE`, and `CITATION.cff` files for deployment config and third-party attribution

### Fixed

- **Reasoning UI lock state** — the Reasoning button and dropdown disable while reasoning runs, with a visible **Cancel** button. Server requests are aborted via `AbortController`
- **SPARQL autocomplete on macOS** — added `Alt+/` as a universal trigger; macOS reserves `Ctrl+Space` for input source switching by default
- **Browser WASM reasoner module loading** — switched from jsdelivr's `/+esm` to `esm.sh`
- **Demo pages looked unstyled in `all` mode** — switched `Cross-Origin-Embedder-Policy` from `require-corp` to `credentialless`
- **Legend and namespace overlay** now refresh when the layout is switched
- **Edit Layout customizations propagate to the legend** — node color / node shape / edge color / line style / arrow shape changes immediately update the on-page legend
- **PNG and SVG exports** now embed Edit Layout customizations in the legend (previously the export legend always showed default styles)

### Changed

- Reasoner selection is now user-configurable via env var

---

## [0.5.2] — 2026-04-17

[:fontawesome-brands-python: PyPI](https://pypi.org/project/ontoink/0.5.2/) &middot; [:fontawesome-brands-github: Release](https://github.com/ISE-FIZKarlsruhe/ontoink/releases/tag/v0.5.2)

### Fixed

- **Broken parsing of TTL with periods inside strings** — the statement splitter now respects quoted strings, so descriptions like `"...time frame. Every batch..."` no longer break parsing
- **Hyphenated prefixes not recognized** — prefixes like `samm-c:`, `ext-built:`, `ext-classification:` are now correctly captured

---

## [0.5.1] — 2026-04-17

[:fontawesome-brands-python: PyPI](https://pypi.org/project/ontoink/0.5.1/) &middot; [:fontawesome-brands-github: Release](https://github.com/ISE-FIZKarlsruhe/ontoink/releases/tag/v0.5.1)

### Fixed

- **Playground hang on non-HTTP namespaces** — `urn:`, `oid:`, and other non-HTTP URI schemes are skipped during auto-dereference

---

## [0.5.0] — 2026-04-10

[:fontawesome-brands-python: PyPI](https://pypi.org/project/ontoink/0.5.0/) &middot; [:fontawesome-brands-github: Release](https://github.com/ISE-FIZKarlsruhe/ontoink/releases/tag/v0.5.0)

### Highlight: Automatic Ontology Label Resolution

OntoInk now **automatically fetches and resolves human-readable labels** from referenced ontologies. When your shape graph uses IRIs from nfdicore, BFO, IAO, or other ontologies, OntoInk fetches the ontology source files and extracts `rdfs:label`, `rdfs:comment`, type information, and more — so you see `"contributor role"` instead of `NFDI_0000118` everywhere.

This works across:

- **Click popups** — "More..." shows label, comment, type, subclass, deprecation status
- **SPARQL autocomplete** — Ctrl+Space shows both human label and IRI local name
- **SPARQL class/property dropdowns** — `contributor role (NFDI_0000118)` instead of just `NFDI_0000118`
- **Query results** — IRIs rendered as `label (prefixed:name)`
- **SPARQL Explorer** — when the endpoint lacks labels, fetches ontology source files as fallback

### Added

- **Automatic ontology label resolution** — background fetch of all referenced ontology namespaces on graph init
    - Known ontology URL registry bypasses CORS-broken redirects for nfdicore, BFO, IAO, RO, FOAF, Schema.org, SKOS
    - Robust line-based OWL TTL parser handles Protégé-style files with nested blank nodes, collections, and `"""` strings
    - Dual parser strategy: merges results from minimal + robust parsers for maximum coverage
- **Enhanced IRI dereferencing** — "More..." button shows label, comment, type, subClassOf, deprecation, SKOS definitions, editorial notes
- **Scrollable popups** — popup containers capped at 70vh with overflow scroll; deref results independently scrollable
- **Sticky toolbar** — toolbar stays fixed at viewport top while scrolling
- **SPARQL Explorer ontology fallback** — fetches nfdicore, BFO, IAO, FOAF, etc. when endpoint lacks rdfs:label
- **SPARQL results with labels** — query result IRIs shown as `label (prefixed:name)`
- **SPARQL dropdowns always fresh** — class/property selects rebuild with latest labels every time panel opens
- **OntoSniff** — ontology smell detector with 9 anti-patterns, quality score (0-100), standalone page
- **SPARQL Explorer** — endpoint connection, schema discovery, query builder, Ctrl+Space autocomplete
- **Abstract Model View**, **Search & Highlight**, **Layout Switcher**, **Graph Statistics**, **Path Finder**, **Minimap**, **Neighborhood Focus**, **Playground**, **SHACL Editor**

### Fixed

- IRI dereferencing for nfdicore and ontologies with CORS-broken 302 redirects
- SPARQL Explorer label fetching with batch loading and ontology source fallback
- SPARQL dropdowns refresh labels on every panel open (not just first build)
- PNG/SVG export: minimap hidden, scale 2x, reliable overlay positioning

---

## [0.3.0] — 2026-04-09

[:fontawesome-brands-python: PyPI](https://pypi.org/project/ontoink/0.3.0/) &middot; [:fontawesome-brands-github: Release](https://github.com/ISE-FIZKarlsruhe/ontoink/releases/tag/v0.3.0)

### Added

- **OWL Reasoning** — [HermiT](http://www.hermit-reasoner.com/) reasoner (via [owlready2](https://owlready2.readthedocs.io/)) runs at build time for full OWL DL reasoning, with [owlrl](https://owl-rl.readthedocs.io/) fallback for OWL-RL profile
    - **Reasoning** toolbar button opens an inferences panel showing all inferred triples in a table
    - **"Show on graph"** checkbox overlays inferred triples as purple dotted edges and nodes
    - **"Validate with Inferences"** button runs SHACL validation with inferred triples included
    - Smart filtering removes reflexive triples, built-in namespace noise, and domain/range propagation
    - Configuration option: `reasoning: true/false` per diagram
- **OWL Reasoning demo** — new [example](examples/reasoning-demo.md) with class hierarchy, inverse, transitive, and symmetric properties
- **Draggable popups** — node and edge popups can be repositioned by dragging the header
- **Collapsible popup sections** — Connections and SHACL Constraints are collapsed by default (click to expand)
- **IRI dereferencing** — "More…" button in popups fetches structured data from the IRI via content negotiation
- **Prefix editing** — toggle prefix visibility from the Edit Layout panel

### Fixed

- Prefix overlay only shows prefixes declared in the TTL source (not rdflib built-ins like dc, dcterms, skos, etc.)
- Popup toggle sections work correctly for all node types (fixed special character issue in IRI-based IDs)
- PNG/SVG export captures the exact viewport with overlays at their on-screen positions

---

## [0.2.0] — 2026-04-08

[:fontawesome-brands-python: PyPI](https://pypi.org/project/ontoink/0.2.0/) &middot; [:fontawesome-brands-github: Release](https://github.com/ISE-FIZKarlsruhe/ontoink/releases/tag/v0.2.0)

### Added

- **Edge click popup** — click any edge to see its label, type, IRI, source/target nodes, cardinality, and copy buttons
- **Edit Layout panel** — renamed from "Colors"; now includes:
    - Node shape selector (rectangle, ellipse, diamond, hexagon, triangle, star, and more)
    - Edge line style selector (solid, dashed, dotted)
    - Edge arrow shape selector (triangle, vee, circle, diamond, chevron, none, and more)
    - Color pickers for node types, edge types, and namespace groups
- **Documentation site** — full Material for MkDocs documentation with getting started guide, examples, contributing guide, citation info, and changelog

### Fixed

- **Export layout fidelity** — PNG and SVG exports now capture the exact viewport the user sees (zoom, pan, node positions) instead of re-fitting all elements
- **Export overlay positioning** — legend and namespace prefix boxes are drawn at their actual on-screen positions (respects user dragging)
- **Export overlay sizing** — legend and prefix boxes match their DOM dimensions; font sizes aligned to CSS (11px entries, 12px titles, 10px prefixes)

### Changed

- Toolbar button renamed from "Colors" to "Edit Layout"
- Package renamed to `ontoink` (from `ontoviz`)

---

## [0.1.0] — 2026-04-07

[:fontawesome-brands-python: PyPI](https://pypi.org/project/ontoink/0.1.0/) &middot; [:fontawesome-brands-github: Release](https://github.com/ISE-FIZKarlsruhe/ontoink/releases/tag/v0.1.0)

Initial public release.

### Added

- Interactive ontology visualization using Cytoscape.js with dagre layout
- Formal visual notation: classes (rectangles), individuals (ellipses), literals (dashed ellipses), datatypes (diamonds)
- Edge styles: object properties (blue), data properties (green), rdf:type (grey dashed), rdfs:subClassOf (black), SHACL constraints (cyan dashed bold)
- SHACL constraint overlay with cardinality badges `[min..max]`
- Click popup for nodes with IRI, type badge, ontology source, connections, copy buttons
- Inline TTL editor with CodeMirror and Turtle syntax highlighting
- Live SHACL validation with constraint checking (browser-side)
- Build-time SHACL validation using pySHACL
- Publication-ready PNG (3x hi-DPI) and SVG export with legend and namespace boxes
- Auto-generated interactive legend (draggable, resizable)
- Namespace prefix overlay with "show all" toggle
- Toolbar: zoom in/out, fit, fullscreen, export PNG/SVG/TTL, colors
- Color coding by ontology source (BFO, IAO, nfdicore, RO, OBI, PMD, QUDT, Schema.org, FOAF)
- Color customization panel for node types and namespace groups
- MkDocs plugin with `pymdownx.superfences` custom fence integration
- Configuration options: source, shape, height, editor, legend, namespaces
- Demo site with GitHub Pages deployment
- Comprehensive test suite with pytest (20 tests)
