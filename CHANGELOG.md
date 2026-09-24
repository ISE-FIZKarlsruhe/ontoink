# Changelog

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

## [0.7.7] - 2026-08-11

### Added — SHACL shape recommendation

- **`ontoink/recommend/`** folds the two methods that earned it out of the accompanying shape-induction benchmark into the package itself: `baseline` (frequency profiling of instance data, Mihindukulasooriya et al. 2018 — best F1/complexity ratio of the eight benchmarked methods) and `astrea` (OWL axiom-driven, the only one that says anything about the documentation ontologies that ship no instance data). `auto` runs both and merges them, recording per constraint which method proposed it. rdflib-only, so the import adds no dependency. The six methods left behind either under-performed, duplicated the baseline in practice, or were never really implemented.
- **Confidence survives serialisation.** The research code computed a confidence for every constraint and dropped it on the way to Turtle. Emitted shapes now carry `sh:description` plus `oi:confidence` / `oi:support` / `oi:population` / `oi:method`. They are annotations, so the file still validates with pyshacl unchanged.
- **`recommend_shapes:` fence key** attaches suggestions to any diagram at build time — a **Shapes** panel listing a proposed `sh:NodeShape` per uncovered class with its evidence, a Copy button, and an Add-to-editor button that drops it into the Edit & Validate buffer where Validate is one click away. Works on static hosts; nothing runs in the browser.
- **Right-click a class → "Induce shape from this class".** Proposed constraints are drawn on the graph as dashed edges whose opacity is mapped from their confidence, with a trust slider to fade out weakly-evidenced ones. Clicking a ghost edge accepts it: it becomes a real constraint edge and its Turtle lands in the shapes editor. When the fence enabled `recommend_shapes:` the payload is reused; otherwise the constraints are induced in-page from the rendered graph.
- **The `no-shacl-coverage` smell now generates the shape it asks for.** Its suggestion used to be prose pointing at another tool; each uncovered class now carries a ready-to-paste `sh:NodeShape` skeleton derived from its axioms and instances, with a copy button on the chip.

### Added — closing the loop back into CI

- **`shape_drift: warn`** compares committed shapes against what the data implies today: constraints the data supports that the file omits, committed constraints almost nothing satisfies (with a concrete relaxation), and classes with no shape. Findings go through the MkDocs logger, so `mkdocs build --strict` fails the build.
- **`ontoink-cq` fence** runs competency questions at build time. Each question pairs prose with SPARQL and an expectation (`expect:` for ASK, `min_rows` / `max_rows` / `expect_rows` for SELECT) and renders a pass/fail card with its query and bindings; `reasoning: true` merges inferred triples first so a question can assert what the ontology *entails*. Failures are logged rather than raised — pymdownx swallows exceptions from a fence handler and falls back to plain text, which would have lost the diagnostics. Each card whose results bind IRIs gets a **Show on graph** button that selects them on the nearest diagram, resolved from the clicked button at click time — container ids come from a build-wide counter, so a page cannot know its own diagram's id and hard-coding one silently points at another page's graph. `graph:` remains available to target a specific container.
- **`ontoink-report.json` + `badges/*.svg`** are written by a new `on_post_build` hook. Every number already existed per diagram but only ever reached the rendered page; now SHACL conformance, the OntoSniff score, consistency, drift and CQ results aggregate into one machine-readable artefact plus README badges (rendered locally — no request to an external badge service). A `quality_gate:` config block fails the build on score regressions, new violations, inconsistency or drift.

### Added — trust and provenance

- **"Explain this inference".** Right-click an inferred edge for a proof tree: which OWL-RL rule fired, on which premises, recursively down to asserted facts. Every derivation in the in-page materializer now records its rule and premises at the single `add()` funnel. Only that backend can do this — Konclude, HermiT and the server backends return proof-free triples, and the panel says so instead of inventing a derivation.
- **Cite this ontology.** A panel with the license badge, version and version IRI, creators and a generated BibTeX block, read from the `owl:Ontology` header. Hidden when the graph declares no ontology.
- **Deprecated terms read as retired** — dimmed with a dashed border — and the `deprecated-entity` smell now names the successor declared via IAO:0100001 ("term replaced by") or `dcterms:isReplacedBy` rather than telling you to go find it.
- **Findings are actionable.** Quality-smell chips, and competency-question results, can select their terms on the canvas (`ontoink.selectIris`), revealing anything the current LOD level had filtered out.

### Fixed

- **Literal node ids are stable across builds.** They were `abs(hash(str)) % 999999`, and Python salts string hashing per process (`PYTHONHASHSEED`), so the same literal got a different id on every build — breaking anything that compares ids across parses and inviting collisions on large graphs. Now a truncated blake2b content digest.
- **Build-time SHACL validation failures are no longer silent.** A bare `except` turned a broken or missing shapes file into `validation = None` with nothing in the build log; the author got an unvalidated diagram and no hint. Now logged under `mkdocs.plugins.ontoink`, so `--strict` catches it.
- **`/reason`'s per-request reasoner override no longer mutates `os.environ`.** The environment is process-global, so two concurrent requests choosing different backends could race. `_run_reasoning` takes the backend as an argument.
- **Build-time and server validation agreed to disagree** — one passed `inference="none"`, the other `"rdfs"`, so the same data and shapes could conform on the page and fail in CI. Both now use one shared default (`none`, the only setting the browser engine can also reproduce) with an explicit opt-in via `validation_inference:` or the API request body.
- **The `predicates:` policy is reachable at last.** `parse_ttl_to_cytoscape` has accepted `hide_predicates` / `fold_into_badge` / `badge_predicates` since 0.7.0 with a docstring promising fence-level YAML, but nothing ever passed it.
- **Style preset names are matched case-insensitively.** The playground emitted `value="OntoInk"` against a lowercase lookup, so choosing "Style: Ontoink" after any other preset hit the unknown-preset branch instead of restoring the default.
- **The API reports the real version**, and there is now only one version to report. `api.py` hard-coded `0.7.2` in the app metadata, `/health` and the deref User-Agent while `__init__.py` and `pyproject.toml` each carried their own copy. All of them now derive from `ontoink.__version__`, which `pyproject.toml` reads dynamically.
- **The wheel shipped the entire repository.** `packages.find` in `pyproject.toml` defaults to namespace discovery, which treats every directory in the root as a package — so `pip install ontoink` also installed `tests/`, `scripts/`, the `shape-recommender/` research project and the LNCS paper draft, all importable as top-level packages. Discovery is now pinned to `ontoink*` with `namespaces = false`.
- **SHACL violations carry `sourceShape` and `sourceConstraintComponent`**, so a consumer can group by the constraint that failed rather than by the instance that tripped over it.
- **The CSP shim could not pass a list, so three buttons were silently dead.** `_oiArg` understood strings, numbers and booleans but not array literals, and `_oiSplitTop` did not track brackets — so `ontoink.selectIris('g0', [a, b])` was split at the array's own comma and the callee received three mangled strings. That killed "Show class" in the shapes panel, the select action on OntoSniff chips, and "Show on graph" on competency-question results. Array literals now parse, with elements recursing through the same strict grammar (still no eval, still no `JSON.parse`). `tests/test_csp_shim.py` runs the real shim source under Node against every call shape the fence emits, and asserts that every handler `fence.py` emits is exported on the api object — the contract whose violation makes a button dead rather than broken.
- **An apostrophe in an IRI or label broke its button.** `esc()` escapes `& < > "` but not `'`, while every `data-oi-on*` payload wraps arguments in single quotes — so a term like *Alzheimer's disease* terminated the argument early. IRI-bearing payloads now use `_oiStr`.
- **The axiom-driven method found nothing on an ontology with no instances** — the one case it exists for. `induce_astrea` discovered properties via `Graph.predicates()`, which yields properties *used* in instance data; in a documentation ontology a property appears as the *subject* of `rdfs:domain` and never in predicate position, so the whole domain/range branch silently produced zero constraints. It now iterates the subjects of `rdfs:domain`. The five research benchmarks could not catch this — every one of them ships instance data that exercises its properties — and neither could the unit tests, whose axiom-only fixture happened to exercise only the `owl:Restriction` branch. `tests/test_recommend.py` now covers a property that declares a domain and is never used, and the Python↔JS parity suite gained the same fixture (the JS port was already correct, so the two had silently diverged on exactly this input).
- **`auto` mode discarded the instance evidence it had just found.** The axiom pass runs first and carries no counts, and `ShapeSet.add` kept the first arrival on a key collision — so a constraint both methods derived was serialised as "from ontology axioms" with `oi:support 0`, even though the data pass had counted 45 of 45 instances agreeing. Colliding derivations now merge: the constraint keeps both method names and whichever counts are real.

## [0.7.6] - 2026-08-06

### Fixed — rendering and export resolution

- **`pixelRatio: 1` was applied to every graph, not just big ones.** It arrived in 0.7.4 as one of the "viewport optimizations for large ontologies", but it pins the canvas backing store to 1 device pixel per CSS pixel — so on a retina or 4K display every diagram was drawn at half (or a third of) the available resolution and labels looked soft. The ratio now follows the display, capped at 2, and drops to 1 only for graphs at or above 500 nodes, where the frame rate matters more than the sharpness. `hideEdgesOnViewport`, `hideLabelsOnViewport` and `textureOnViewport` became conditional for the same reason — texture caching is what makes a *stationary* small graph look blurry. The three duplicated option blocks are now one `_useMotionOptims`/`_pixelRatio` pair shared by the fence, playground and live-editor paths.
- **`pixel_ratio: N` in the fence YAML** overrides the automatic choice in either direction — `1` to buy back frame rate on a huge ontology, `2`/`3` to insist on a crisp figure.
- **PNG export resolution is now chosen, not fixed.** `exportPNG` hardcoded `scale: 2`, so a compact diagram exported at ~1400 px on its long edge — thin for print. The scale is now derived so the result lands near 3000 px, clamped to the browser's canvas limits, and it accounts for the renderer's pixel ratio (`cy.png()` multiplies by it, which the higher ratio above would otherwise have doubled silently). `ontoink.exportPNG(id, 4)` still forces an explicit scale.

### Changed — documentation

- **The site is branded OntoInk** (the package, module and fence name stay `ontoink`), and the navigation collapsed from thirteen top-level tabs to five — Home · Tools · Guide · Examples · About — with a sticky tab bar so the nav stays reachable while scrolling. The DSL syntax reference moved under Tools, where the Live Editor already links to it.
- **The landing page leads with the live diagram** instead of prose, and the feature grid, three-step install and tool index were cut to roughly half their previous length.
- **New pages**: Architecture (the design decisions that used to live in the README) and Docker & self-hosting. The README is now a short overview that points at the site; the docs changelog, three releases behind, is current again.

## [0.7.5] - 2026-08-06

### Added — Size & Typography in Edit Layout

- **The Edit Layout panel can now change how big the shapes are and which font they use.** A master **Scale** slider (40–300 %) moves shape size, node label size and edge label size together; below it are explicit px boxes for each, a **font family** picker (Inter, Helvetica/Arial, Verdana, Georgia, Times, Mono), a **weight** picker and an **italic** toggle. Every node-type row also gained per-type **size** and **font** boxes that override the global values, alongside that type's colour and shape.
- Size is expressed as **padding around the label**, not a fixed width/height: every stylesheet in the codebase sizes nodes with `width/height: "label"`, so padding is the dimension ontoink actually owns — and labels never clip at any scale. Label wrap width scales with it.
- Typography values live in **element data** (`oiPad`, `oiFontSize`, `oiFontFamily`, …) and are read through function mappers installed by the new `_typoPatch()`, which rewrites a Cytoscape stylesheet so any rule declaring font/padding honours a per-element override. It wraps the fence stylesheet, the playground stylesheet, the live-editor stylesheet **and every style preset**, so the settings survive layout changes, LOD sweeps, element re-creation and a switch to Chowlk/Graffoo/VOWL — and they are baked into PNG/SVG exports.
- New API: `ontoink.setTypography(id, key, value, scope)`, `ontoink.applyTypography(id)`, `ontoink.resetTypography(id)`, `ontoink.getInstance(id)`.

### Fixed — the fonts never actually applied

- Every stylesheet asked for `"'Inter','Segoe UI',system-ui,sans-serif"` in CSS syntax, but Cytoscape validates `font-family` against `/^([\w- .]+(?:\s*,\s*[\w- .]+)*)$/` — a **quoted** stack fails the regex and is silently dropped back to the Cytoscape default (Helvetica Neue). All 25 declarations are now unquoted, so ontoink diagrams finally render in the font they always claimed. Numeric `font-weight` must likewise reach Cytoscape as a number, not a string.

### Added — Multi-selection and a right-click context menu

- **Ctrl/Cmd+click and Shift+click extend the selection**, Ctrl/Shift+drag rubber-bands, and dragging any selected node moves the whole selection (Cytoscape's own modifier handling — what was missing was everything around it). The single-node popup no longer fires during a multi-select gesture, and the selection now renders with a cyan halo; pinned nodes get a double border.
- **Right-click opens a context menu** with inline-SVG icons: align left/centre/right/top/middle/bottom; distribute horizontally/vertically with equal gaps; arrange as grid or circle; snap to a 20 px grid; **tidy as taxonomy** (rows derived from `rdfs:subClassOf` depth); bigger/smaller/match size; pin & unpin; colour the selection.
- **Ontology-specific verbs** beyond the drawing ones: select same type, same namespace, grow to neighbours, sub-class tree, super-classes, instances of the selected classes, SHACL shapes constraining them, connected component; isolate / hide / show hidden; path between exactly two selected nodes; copy IRIs, labels, the selection as TTL or as a Markdown table; download the selection as `.ttl`; export the selection as PNG.
- **Edge menu** (edges were unreachable by right-click): select both endpoints, select every use of this predicate, hide all edges of this type, copy the predicate IRI, copy the triple.
- **Cluster menu** on super-nodes and cluster hulls: expand/collapse and select members — previously only reachable by a left tap that also fought ctrl+click.
- **Undo/redo** for every position, size, pin and visibility verb (`Ctrl+Z` / `Ctrl+Shift+Z`, 25 steps), because these verbs are one click and the position cache autosaves 500 ms later.
- **Keyboard**: `Ctrl+A`, `Escape` (close menu, then clear selection), `Delete` hides the selection, arrow keys nudge it (`Shift` = 10×), `Shift+F10` / the Context-Menu key opens the menu with roving-tabindex arrow navigation and `role="menu"` semantics. Shortcuts are scoped to the graph under the pointer or keyboard focus, never stolen from the TTL editor.
- Manual arrangements are persisted: programmatic moves don't fire `dragfree`, so every geometry verb now saves to the position cache explicitly.
- Wired into all three render paths — fence, playground **and the live DSL editor**, which had no selection layer at all.

### Fixed

- `exportSVG` used `full:false` (viewport only), so a diagram spread out with the new align/distribute verbs was silently cropped. It now fits first when anything sits outside the viewport, then restores the user's zoom/pan.
- "Copy selection as TTL" emitted a triple only when **both** endpoints were selected, dropping `rdfs:subClassOf` whenever the parent wasn't picked. It now emits every triple asserted by a selected subject, skips overlay-only edges (inferred / SHACL) and quotes literal objects.
- Selection and pinned-node styling is re-appended to every style preset (like the inferred-overlay rules), instead of vanishing on a preset switch.
- Geometry verbs run inside `cy.batch()` — one render tick per verb instead of one per node.
- **The Konclude WASM reasoner bundle now actually ships in the wheel.** `[tool.setuptools.package-data]` globbed `resources/reasoner/*`, but the vendored files live in `resources/assets/reasoner/*` — the glob matched nothing, so `bundle.mjs`, `konclude.mjs`, `konclude.wasm` and `worker.js` were absent from every built distribution and `plugin.py`'s `on_files` hook found an empty directory. Every `pip install ontoink` site therefore kept 404-ing on `/assets/reasoner/bundle.mjs` — the exact failure 0.7.4 set out to fix, which only ever worked from a source checkout. Verified by installing the built wheel into a clean virtualenv.

## [0.7.4] - 2026-07-21

### Added — Plugin auto-installs the browser reasoner bundle + COOP/COEP service worker

- **The ontoink MkDocs plugin now ships a pre-built vendored `rdf-reasoner-konclude` bundle** (`bundle.mjs`, `konclude.mjs`, `konclude.wasm`, `worker.js`) in `ontoink/resources/assets/reasoner/` and copies it verbatim to `<site>/assets/reasoner/` at build time (via `on_files`). Ontoink's browser reasoner does `import("<root>/assets/reasoner/bundle.mjs")` same-origin — without a same-origin copy of the bundle the WASM Worker constructor refused to spawn (browsers reject cross-origin module Workers even with COEP credentialless), so the panel died with "Worker error — the WASM worker died during init" and the esm.sh fallback path never worked on any static host. Previously only ontoink's own Docker image built + placed the bundle (via `docker/bundle-reasoner.sh` → `/opt/reasoner-vendor/*`); every other deploy (GitHub Pages, the FIZ-Karlsruhe matwerk deploy, any downstream MkDocs site using `pip install ontoink`) silently 404'd on `/assets/reasoner/bundle.mjs`. The plugin ships the bundle in the wheel so `pip install ontoink[reasoning]` is sufficient. All 4 files land in the SAME directory because `bundle.mjs` contains `new Worker(new URL("./worker.js", import.meta.url))` and Emscripten's glue expects `konclude.wasm` next to `konclude.mjs`.
- **The plugin also ships `coi-serviceworker.js` and copies it to the built site's ROOT** (via `on_files`), then injects a `<script src="{root}coi-serviceworker.js">` at the very top of every page that uses ontoink (via `on_post_page`, before the Cytoscape / dagre / CodeMirror libs). Downstream sites get `crossOriginIsolated === true` out-of-the-box on static hosts (GitHub Pages, S3, Caddy without header config) with no `extra_javascript` wiring required — which is the OTHER prerequisite for the "Browser: Konclude WASM" reasoner dropdown option. The tag is skipped if the page's HTML already contains `coi-serviceworker.js` (e.g. the user added it manually via `extra_javascript`) so there's no double-registration. Placing the file at the site root is deliberate: a service worker's default scope is its own directory, so nesting it under `assets/` would silently limit coverage to `/assets/*` and leave the actual pages uncovered — a footgun the previous `demo/docs/assets/coi-serviceworker.js` placement had.

### Fixed — Figure fidelity: SHACL scope, export legend, inferred-overlay styling

- **SHACL constraint edges ignored `sh:targetClass`.** The annotation loop in `ttl_parser.py` matched edges on the constraint's property IRI alone, so a shape's cardinality badge was painted on *every* edge using that predicate — including subjects the shape never targets. In the Reasoning & Inference §9 figure that drew `ex:rex rdfs:label "Rex"` as a cyan `[1..*]` constraint edge carrying the message *"Every person must have a label"*, even though `ex:rex a ex:Dog` and `ex:PersonShape` has `sh:targetClass ex:Person`. pySHACL reports zero focus nodes for `rex`; the diagram asserted a constraint that does not apply to it. Annotation is now gated on the edge's subject being a SHACL instance of the target class, descending `rdfs:subClassOf` per the SHACL spec (so a shape targeting `ex:Animal` still annotates `ex:rex`, a `ex:Dog`). Shapes with no `sh:targetClass` (or using target forms ontoink does not yet read — `sh:targetNode`, `sh:targetSubjectsOf`, `sh:targetObjectsOf`) annotate as before rather than silently dropping to zero.
- **PNG and SVG exports dropped the "Inferred (OWL)" legend row.** Both export paths derive legend rows from `inst.data.edges`, but the "Show inferences on graph" overlay `cy.add()`s its edges without appending them to `inst.data` — so an exported figure showed purple dotted edges with nothing in the key explaining them. (The on-screen legend already compensated by sweeping `cy.edges()`; the exports did not.) Both now pick up overlay-only edge types, so the exported legend matches what is on screen.
- **Inferred edge labels were 9 px**, roughly 3.8 pt once a figure is placed in a paper. Raised to 12 px. Note the 9 px floor is shared with `rdf:type` and `rdfs:subClassOf` edge labels, which are unchanged — only the inferred overlay, which exists to be read, was raised.
- **Style presets stripped the inferred overlay.** `cy.style()` replaces the entire stylesheet and none of the Chowlk / Graffoo / VOWL presets declared the inferred selectors, so switching preset silently turned inferred edges into ordinary-looking ones. The overlay rules are now factored into `_inferredOverlayRules()` and appended to every preset, including any added later.

### Fixed — Browser reasoning now matches the build-time backends exactly

- **`parseTtlMinimal` mangled Turtle blank nodes and collections.** It had no notion of `[ … ]` or `( … )`, so an anonymous restriction like `owl:equivalentClass [ a owl:Restriction ; owl:onProperty ex:p ]` tokenised `[` as an ordinary term and emitted junk triples. Those fed the reasoner, producing the nonsense rows reported against 0.7.3 — `buddhaBowl type [`, `buddhaBowl type type`, `buddhaBowl type Restriction`. The parser is now a proper recursive predicate-object-list reader: `[ … ]` mints a real `_:bN` subject and `( … )` expands to an `rdf:first`/`rdf:rest` list, matching what rdflib produces on the Python side.
- **The browser reasoner had no noise filter.** Build-time results pass through `_run_reasoning`'s filter (drop blank-node scaffolding, `owl:Thing`/`owl:Restriction` memberships, vocabulary-internal triples, `rdfs:domain`/`rdfs:range` propagation); the browser path returned everything raw. The same filter now applies client-side.
- **The JS materialiser gained the OWL 2 rule set**, so it no longer under-reports against the documented tables: `owl:someValuesFrom`, `owl:allValuesFrom`, `owl:hasValue`, `owl:intersectionOf`, `owl:unionOf`, `owl:propertyChainAxiom`, restriction subsumption (∃/∀ monotone in the filler), structural matching of a necessary restriction against a class definition, `owl:equivalentClass` / `owl:equivalentProperty` unfolding, `owl:FunctionalProperty` / `owl:InverseFunctionalProperty`, and `owl:sameAs` substitution. **All 12 examples on the Reasoning & Inference page now return exactly the same triples as the `owlrl` build-time backend**, including §8's negative case (`alice a BookLover` and `Subscriber ⊑ BookLover`, but *not* `alice a Subscriber`).

### Fixed — "Validate with Inferences" was unreachable

- The reasoning panel assigns `panel.innerHTML`, which discarded the **Validate with Inferences** button that `fence.py` renders statically inside `.ov-reasoning-panel`. On any diagram with a `shape:` the documented "run SHACL over the reasoned graph" step therefore had no control. Both panel renderers now re-emit the button whenever the diagram has SHACL shapes and there are inferences to add.
- **§9 of the Reasoning & Inference page never demonstrated its own point.** Its shape required only `rdfs:label`, which every person already had, so validation conformed identically before and after reasoning. The shape now also requires `ex:knows`: `ex:bob` has no stated `ex:knows`, so plain **Validate** reports a violation, while **Validate with Inferences** conforms — because `ex:knows` is an `owl:SymmetricProperty` and `alice knows bob` entails `bob knows alice`.

### Added — Built-in "Browser: OWL-RL (JS)" reasoner + automatic fallback

- **New dependency-free OWL-RL materialiser** (`_owlRlMaterialize`) that runs a fixpoint over the RDFS + OWL-RL rule subset ontoink diagrams actually exercise: `rdfs:subClassOf` / `rdfs:subPropertyOf` transitivity and propagation, `rdfs:domain` / `rdfs:range`, `owl:equivalentClass` / `owl:equivalentProperty`, `owl:inverseOf`, `owl:SymmetricProperty`, `owl:TransitiveProperty`, and `owl:sameAs` symmetry/transitivity — with iteration and output caps so pathological inputs can't hang the tab. Verified against 11 rule-level unit cases and against the reasoning-demo pages, where it reproduces the documented expected inferences exactly (`rex a Animal`, `alice hasParent berta`, `bob childOf alice`, `alice ancestorOf dan`, …).
- **"No reasoner available" is no longer a reachable outcome.** The materialiser appears in the dropdown as "Browser: OWL-RL (JS, always available)" — enabled in every browser, no cross-origin isolation, no server — and every backend path falls back to it: Konclude WASM failure → JS; no server reachable → JS; not isolated + no server → JS.
- **Konclude WASM crash recovery** — Konclude's nested pthread workers are unreliable under service-worker-emulated COOP/COEP (a nested worker load failure surfaces as an uncaught `[object ErrorEvent]` and poisons the whole thread pool, after which every `classify()` exits early with `'unwind'` and zero results — previously reported as a successful "0 inferences"). ontoink now: (1) treats an empty harvest after an unwind as the failure it is, (2) discards the crashed `RdfReasoner` instance instead of reusing it on the next click, (3) retries once with a completely fresh Worker, and only then (4) falls back to the JS materialiser with an explanatory log line. A healthy Konclude run (verified against the Node build: 2 inferred triples for `A ⊑ B, x:A`, twice on the same instance) completes without any of this engaging.

### Fixed — Browser reasoner "aborted with 'unwind'" losing its results

- **The vendored `worker.js` now swallows Emscripten's `unwind` exit sentinel inside the `classify` RPC.** Konclude's C++ core calls `exit()` after finishing classification; with ASYNCIFY that surfaces as a thrown `"unwind"` *after* the inferences are already computed. The upstream worker forwarded it as an RPC **error**, so the main thread's `reason()` rejected before its `getInferredNTriples` harvest step ever ran — the browser backend always failed with "Konclude WASM aborted with 'unwind' before producing any inferences" even though the inferred triples were sitting in worker memory. (The Node build swallows the same sentinel, which is why the Server backends never exhibited this.) The same patch is applied in `docker/bundle-reasoner.sh` for the Docker image's copy, with a guard that fails the build loudly if upstream's worker shape changes.
- **Belt-and-braces recovery in `reasonInBrowser`** — if an `unwind` still escapes (e.g. the esm.sh CDN fallback ships the unpatched upstream worker), ontoink now asks the still-alive worker instance directly for `getInferredNTriples`, parses the N-Triples, and recovers the results — time-boxed to 15 s so a genuinely dead worker still yields the actionable error instead of a hung panel.

### Fixed — Browser reasoner bundle URL on sub-path deploys

- **The vendored bundle is now imported relative to the page, not the domain root** — `loadBrowserReasoner` hardcoded `import("/assets/reasoner/bundle.mjs")`, which only resolved when the site was served at the domain root (Docker `all` mode at `http://host:8000/`). On every sub-path deploy — GitHub Pages project sites (`/ontoink/…`), the FIZ matwerk deploy (`/matwerk/…`) — the root-absolute URL pointed outside the site, 404'd, silently fell back to esm.sh, and the cross-origin Worker died with "Worker error — the WASM worker died during init" even though the bundle was sitting right there in `<site>/assets/reasoner/`. The loader now resolves `window.ONTOINK_ASSET_BASE + "reasoner/bundle.mjs"` (the per-page relative prefix the plugin already injects, same mechanism the SHACL validator module uses) and the error message prints the exact absolute URL that was attempted instead of a guessed path.

## [0.7.3] - 2026-07-20

### Fixed — Reasoning panel

- **"0 inferences from a successful build-time reasoner" no longer falls through to the runtime reasoner** — when owlready2/HermiT is installed in the build container, produces `consistency: {status: "consistent"}`, and returns an empty inferred list (typical for pure SHACL shape files that don't add any OWL-DL entailments), the Reasoning panel used to silently punt to `togglePlaygroundReasoning`, which on a static host (no `/reason` endpoint, no COOP/COEP) would error with "No reasoner available. Reload the page once for the service worker to register, or restart the container with ONTOINK_MODE=api/all." The panel now distinguishes the two cases via `data.consistency.status`:
    - `status !== "unknown"` (a reasoner ran at build time) → render a friendly "Build-time OWL reasoning: 0 new triples inferred" panel with a consistency badge (`consistent` / `inconsistent` / other) and a "Re-run with a different backend ↻" link.
    - `status === "unknown"` + `"owlready2 not installed"` (no reasoner at build time) → keep the previous fall-through so a locally running server or a `crossOriginIsolated` browser can still pick up the workload.

## [0.7.2] - 2026-07-15

### Added — Embeddable, CSP-safe build

- **`ontoink.embed(el, {ttl, shape, layout, height, editor, reasoning})`** — mount an interactive ontoink diagram from a Turtle string into any element on any page, with no MkDocs. It builds the toolbar/canvas/panels, parses the TTL client-side (the same path as `ontoink.playground`), and returns the container id. `shape` overlays SHACL constraints; `layout` sets the initial layout (`dagre` / `cose` / `circle` / `concentric` / `breadthfirst` / `grid`).
- **`scripts/build_embed_bundle.py`** — concatenates the vendored libraries and the ontoink runtime into a single self-contained `dist/ontoink.embed.js` (plus `dist/ontoink.embed.css`). Drop the two files next to your page, add one `<div class="ontoink-embed">` (or your own element), and call `ontoink.embed()`. See the new **Embedding** guide in the README and docs.

### Changed — CSP-safe by default (no inline handlers, no CDN)

- **Every event handler is now CSP-safe.** All inline `on*=` handlers — in the fence toolbar and in the runtime-generated panels/popups — are emitted as `data-oi-on*` attributes and attached with `addEventListener` by a small, eval-free interpreter (plus a `MutationObserver` for dynamically-created UI). ontoink therefore runs under a strict `Content-Security-Policy` (`script-src 'self'`, no `'unsafe-inline'`), both embedded and on its own MkDocs pages.
- **Third-party libraries are self-hosted, not loaded from a CDN.** Cytoscape, dagre, cytoscape-dagre, cytoscape-svg and CodeMirror (+ turtle mode) are vendored under `ontoink/resources/vendor/`; the plugin copies them into the built site (`on_files` → `<site>/vendor/`) and injects local `<script>` tags instead of jsDelivr. Pages now build and run fully offline and behind strict CSPs.

### Fixed

- **API version drift** — `ontoink.api` (`/health`, the FastAPI app title, and the deref `User-Agent`) reported `0.6.3` while the package had moved to `0.7.x`; it now reports the current version.

## [0.7.1] - 2026-07-10

### Fixed — Live-editor DSL parser
- **`@prefix ee: <http://ex#>` no longer reports "unterminated <IRI>"** — the line-comment stripper (`_unquotedHash`) treated every `#` as the start of a comment, so any `@prefix` whose namespace ended in `#` (the canonical form for RDFS / OWL vocabularies) was silently truncated and the closing `>` disappeared. The stripper now tracks whether it's inside a `<IRI>` and skips `#` characters that occur there. As a follow-on: user-declared prefixes now show up correctly in the Prefixes overlay and in the generated Turtle preview.
- **Empty-prefix CURIE `:Person` is accepted** — the parser refused to read a term starting with `:` (the Turtle default-namespace form), silently dropping the whole triple with no error. `:Local` is now a first-class CURIE with the empty prefix, and undeclared empty prefixes fall back to a literal `":Local"` token so the triple exists in the graph.
- **Typo detector for arrow shortcuts** — writing `-is-> `, `-A-> `, `-chian-> `, or any other bare-identifier arrow within Levenshtein distance ≤ 2 of a known shortcut now produces an error suggesting the correct one (`did you mean -isa-> ?`) and lists the full shortcut vocabulary (`-a-> rdf:type`, `-isa-> rdfs:subClassOf`, `-chain-> owl:propertyChainAxiom`). Case-only typos (`-A-> ` vs `-a-> `) are flagged separately.
- **Every parser error now includes a plain-English hint** — the error strip in the live editor no longer just says "unterminated <IRI> at line 1, col 16" and stops; a second line explains what an IRI is (angle brackets, closing `>` required) and what to check. Applies to `@prefix` errors, arrow syntax, blank-node labels, empty-prefix terms, subject blocks, and multi-subject lists.

### Fixed — Type inference
- **Rank-tiered strength**: an explicit `rdf:type` (or a class derived from a vocabulary position — `owl:Class`, `owl:ObjectProperty`, `sh:NodeShape` as an object of the type triple) now outranks a kind inferred from a predicate signature. Terms declared `owl:ObjectProperty` are no longer demoted to `DatatypeProperty` just because someone hangs `rdfs:label` off them.
- **All conflict pairs reported** — the inference pass previously stopped emitting warnings after the first contradictory pair for a term; every conflict now streams to the warning row so a single edit pass can address them all.
- **Well-known annotation properties recognised** — `rdfs:label`, `rdfs:comment`, `skos:definition`, `dc:title`, `dcterms:description` are recorded as `owl:AnnotationProperty` when they take a literal, instead of being classified as `owl:DatatypeProperty` by the literal-object fallback.
- **SHACL predicates feed the inference table** — `sh:path`, `sh:targetClass`, `sh:datatype`, `sh:class`, `sh:targetObjectsOf`, `sh:targetSubjectsOf`, `sh:node`, and `sh:property` now type both endpoints correctly.
- **`_kindsCompatible` accepts Datatype ⊑ Class subsumption** — a term typed `rdfs:Datatype` is compatible with `owl:Class` (as it is in OWL 2), so `xsd:integer` on a range no longer fires a spurious `Class ↔ Datatype` conflict.
- **`undefined:undefined` gone from evidence labels** — the vocabulary-position reason strings assumed every term was a CURIE; full-IRI subjects now get a display label via the trailing path segment.
- **`xsd:*` datatype detection on `rdfs:domain`** — `rdfs:domain xsd:string` types the subject as `owl:DatatypeProperty` rather than `owl:ObjectProperty`.

### Fixed — Rendering
- **Property chains and boolean class expressions collapse `rdf:List` scaffolding** — `owl:propertyChainAxiom`, `owl:intersectionOf`, and `owl:unionOf` no longer leak `_:list0` / `_:list1` / `rdf:first` / `rdf:rest` / `rdf:nil` bubbles into the diagram. A chain axiom renders as `chain 1..N`, an intersection as `and 1..N`, a union as `or 1..N`, matching the collapsed-blank-node style already used for restriction edges.

### Changed — Live editor UX
- **Line-number gutter next to the DSL editor** — errors that say "line 12, column 5" are now visually locatable, and clicking an error row jumps the caret to that position.
- **Warning rows are amber, not red** — the diagnostic strip now distinguishes hard parse errors (red badge, `ERROR`) from type-inference warnings (amber badge, `WARNING`) with a coloured kind pill and a hint line under the message.
- **Playground-parity super-node + hull expand/collapse taps** — taps on `?isSuperNode` nodes and cluster hulls now route to `expandSuperNode` / `collapseSuperNode` instead of firing the ordinary node popup, so clustered views behave the same everywhere.
- **Prefixes overlay filters to referenced prefixes only** — was listing every declared `@prefix`, including boilerplate ones the DSL had not yet used.
- **Widened live-editor layout** — the DSL / graph / Turtle panes were cramped on 1440-wide viewports; the page now widens the mkdocs content column via a `:has(#live-editor-app)` guard that leaves other docs pages untouched, hides the right-hand TOC on this page, and clamps pane heights with `clamp(min, calc(100vh − …), max)` so tall monitors give the graph more room without breaking mobile stacking.
- **Node / Edge popups + Legend + Prefixes overlays wired into the live editor** — the same node-click popup, edge-click popup, Legend overlay, and Prefixes overlay the fence graphs use are now mounted by the live editor.

## [0.7.0] - 2026-07-10

### Added — Live editor with a D2-inspired DSL
- **New `/live-editor/` page**: a compact ontology DSL on the left, live ontoink graph + generated Turtle on the right. Debounced render on every keystroke, line-precise error diagnostics, and 13 predefined templates (Tutorial · Hello · Class hierarchy · Individuals · Subject blocks · Multi-value · Literals · FOAF · OWL restrictions · Property chains · SHACL shapes · Class expressions · Blank nodes).
- **DSL grammar**: predicate shortcuts (`-a->`, `-isa->`, `-chain->`), subject blocks (`{…}`), multi-object comma lists, multi-subject comma lists, typed / language-tagged literals, inline blank nodes (`[pred obj; pred obj]`), OWL restrictions (`(some prop C)`, `(only prop C)`, `(value prop v)`, `(min N prop [C])`, `(max N prop [C])`, `(exactly N prop [C])`), class expressions (`(C and D)`, `(C or D)`, `(not C)`), and property chains (`-chain->` → `owl:propertyChainAxiom` rdf:List). Expressions expand to standards-compliant blank-node axioms in the generated Turtle.
- **Ctrl+Space autocomplete** with 145 well-known terms from RDF, RDFS, OWL, XSD, SKOS, FOAF, Dublin Core, PROV, schema.org, BFO 2, RO, IAO, SIO, SHACL. Fuzzy search over CURIE, label, IRI; keyboard nav; auto-inserts `@prefix` if the picked term's prefix isn't declared.
- **Copy / save**: Copy TTL, Save `.ttl`, Save `.nt` from the toolbar.

### Added — Big-ontology mode
- **LOD ladder L0..L6** with a dropdown (was a slider) that replaces elements in cy on level change — no `display:none` anti-pattern. Every edgeType has an explicit floor; nodes get floors by type + inference. Hidden panel exposes atticed elements with a Pin-to-reveal button.
- **Group by namespace** (renamed from the previously-inert "Super" toggle). Client-side clustering fires on any ontology; build-time Leiden clustering ships via `cluster: true` in fence YAML when `ontoink[cluster]` (python-igraph + leidenalg) is installed. Expanded clusters render as **dashed rounded-rectangle hulls** you can drag to move all members together; click the header to collapse.
- **Edge fanning**: cross-cluster edges aggregate into weighted "bundle" arrows with `weight` + `fan` predicates; popup lists the underlying relations.
- **Faceted browsing** side panel: namespace / has-restriction / has-annotation checkboxes intersect with LOD.
- **Metrics dashboard splash** for big (≥ 500 subjects) ontologies — a card grid + LOD radio picker replaces the older `prompt()`. Cards cover subjects · relations · orphans · blank nodes · restricted classes · annotated · SHACL shapes, plus by-type / by-namespace bars.
- **Position cache** in localStorage (djb2-hashed TTL key, 30-day TTL, saves on `layoutstop` + debounced `dragfree`). Second open of the same ontology reuses the previous layout.
- **Richer cluster labels**: hexagons show the per-cluster type breakdown (`nfdicore · 217 · 141C · 76I`).
- **Blank-node styling**: dashed grey round-diamonds; instances of `_:` are no longer mis-typed as Individuals in the metrics splash.
- **Viewport perf flags**: `hideEdgesOnViewport`, `hideLabelsOnViewport`, `textureOnViewport` on both cytoscape instances.

### Added — Style presets
- Swap the stylesheet between **Ontoink default**, **Chowlk**, **Graffoo**, and **VOWL / WebVOWL** faithful reproductions via the Style dropdown on every ontoink toolbar (fence pages, playground, SPARQL Explorer, live editor).

### Fixed
- **LOD Literal floor**: was 2 but data-property edge floor was 4, so literals appeared without their carrying edges (disconnected labels). Both are now 4.
- **`</script>` in a JS comment** was truncating the inlined `<script>` in every ontoink page, blank-paging everything. Escaped at source and belt-and-braces auto-escape added in the mkdocs plugin.
- **Dead-code IIFE**: an early `return` in ontoink.js hid the entire live-editor + style-preset block from the runtime. Restructured to `var api = {…}` + `return api` at the very end.
- Cross-cluster edges no longer disappear silently when a namespace is facet-hidden and then re-selected.
- Endpoint check on attic-restore prevents "nonexistent source/target" crashes when only one endpoint is currently visible.
- Boundary-attic purge is scoped to the cluster being rebuilt (was nuking every cluster's edges).
- Metrics splash miscounted Leiden-clustered ontologies (now unpacks super-nodes to real member counts).
- DSL parser: `readInlineBlank` no longer eats the leading `a` of predicates like `age` / `apple` / `about`; `_coalescePropertyChain` respects source-statement boundaries so two separate `-chain->` axioms on the same subject stay separate; `materializeTerm` memoizes by term identity so multi-object lines and blocks sharing an inline-blank subject resolve to one blank node, not N duplicates.

### Added — Semantic-Tile foundations (original 0.7.0 bundle)
- **Big-ontology mode — Semantic-Tile bundle** — a coordinated set of build-time + runtime knobs that let a single ontoink diagram scale from a 10-node example ontology to a 100 000-triple one without swamping the browser. The bundle is opt-in — a fence with no YAML config renders exactly the same graph 0.6.1 rendered — but a single top-level key in the fence body activates each layer. Nothing about the default rendering path changed.
  - **Build-time literal-fold + predicate-policy YAML config** — `parse_ttl_to_cytoscape(..., policy=...)` accepts a `predicates:` block with three lists: `hide_predicates:` (drop the triple entirely), `fold_into_badge:` (subject-object literals migrate into `node_badges[iri]` and the literal node/edge pair disappears), and `badge_predicates:` (object-property statements surface as badges on the subject instead of separate edges). CURIEs are resolved against the graph's own `@prefix` bindings first, with a built-in fallback map (`rdf`/`rdfs`/`owl`/`xsd`/`sh`/`skos`/`dct`/`dc`/`prov`/`schema`); wildcard form `prov:*` matches every predicate under a namespace URI. Compilation is a single pass — see `apply_predicate_policy` — so the Step-2 walk becomes a no-op when no policy is given, guaranteeing bit-identical output to 0.6.1 for existing diagrams.
  - **Leiden clustering with LLM-titled super-nodes and JSON side-store** — when `ontoink[cluster]` (python-igraph + leidenalg) is installed and the graph is large enough to warrant it, `ontoink.cluster.detect_clusters` partitions the graph into communities (Leiden by default; Louvain/fastgreedy/walktrap available), collapses each community into a single `SuperNode` (hexagon, double cyan border, `·N` member count) with a **synthetic super-edge weight = crossing-edge count**, and stores the interior sub-graph in a side-store the client re-hydrates on expand. `ontoink.cluster_titles.title_clusters` optionally rewrites each super-node's placeholder title via an Anthropic or OpenAI call (`ontoink[topic]`); missing library or missing API key falls back to a deterministic synthetic title derived from the top-two member local names — the pipeline never fails just because LLM titling was requested but couldn't run.
  - **Element-removing semantic zoom (L0..L6) slider** — a new toolbar range control (default = L2) sets an `lodLevel` on every element, and the client hides nodes/edges whose LOD floor exceeds the slider position. **L0** = super-nodes + top-K central classes only; **L1** = all classes + super-nodes; **L2** = class hierarchy + object properties; **L3** = OWL restrictions (rendered as amber `∃/∀/=` pills); **L4** = individuals; **L5** = data properties; **L6** = everything, including SHACL constraints and inferred triples. Elements hidden by a slider drop are snapshotted into an in-memory `attic` (Map) so nothing is destroyed — dragging the slider back restores them in place.
  - **Attic side panel for reversible progressive disclosure** — a docked right-hand drawer (`.ov-attic-panel`) lists everything the current LOD has hidden, virtualised by type, with a pin button that re-adds an individual node/edge to the canvas regardless of the slider. Because `.ontoink-container` sets `isolation: isolate` (0.6.1), the panel's z-index is scoped to the diagram — it cannot overwrite the host site's chrome. Full-width on narrow viewports via the existing `max-width:768px` media block.
- **Optional dependency groups** — `pip install ontoink[cluster]` pulls `python-igraph>=0.11` and `leidenalg>=0.10` for build-time community detection; `pip install ontoink[topic]` pulls `anthropic>=0.34` and `openai>=1.40` for LLM-backed super-node titling. Neither is required for the default rendering path — a missing extra emits a `RuntimeWarning` and falls back cleanly.
- **SPARQL endpoint result graphs get the same LOD slider + Attic** — when a built-in SPARQL SELECT projects `?s ?p ?o`, the result rows now materialise into the live Cytoscape graph via `triplesToElements`, are sanitised through the same `applyPredicatePolicyToElements` that the fence graph uses (so `fold_into_badge` / `hide_predicates` behave identically on live queries), receive their LOD floors, and settle into the Attic when the slider position hides them — no per-query code path. Community detection is build-time only; a small `.ov-sparql-note` chip reads *"SPARQL results — clustering unavailable for live queries"* to make that explicit.
- **`data-ontoink-side-store` payload attribute** — the fence handler now splits the cluster side-store off from the initial payload and emits it as its own base64 attribute on `.ontoink-container`, so the first paint isn't blocked by decoding thousands of interior triples that only get expanded on user click.

### Changed
- **Fence toolbar layout** — a new toolbar group between search and export hosts the LOD slider, LOD value badge, **Attic** button, and **Super** checkbox. The existing `.ov-toolbar-group:not(:last-child)::after` divider extends to the new group so the visual grouping remains consistent; `flex-wrap:wrap` on the toolbar keeps narrow viewports from breaking.
- **Super-node styling** — Cytoscape now styles `node[?isSuperNode]` as a hexagon with a double 3-px cyan border and a chunkier font, and appends the member count to the label (e.g. *"People and Addresses  ·  42"*). Selected super-nodes darken the border. Tapping a super-node routes to `expandSuperNode` / `collapseSuperNode` instead of firing the ordinary node popup.
- **CSS design tokens for the new controls** — `:root` gains `--ov-attic-accent`, `--ov-attic-bg`, `--ov-attic-row-hover`, `--ov-attic-row-border`, `--ov-super-accent`, `--ov-badge-*`, `--ov-restriction-*`, `--ov-muted`, `--ov-text`. All new selectors go through these tokens — no hardcoded colours — so the Edit-Layout panel can restyle the LOD/Attic/Super chrome the same way it themes the rest of the diagram.
- **GitHub Pages deploy workflow rationale** — the `ci.yml` `build-demo` + `deploy-demo` jobs (added in 0.6.3 as a downloadable starter) are the recommended way to publish a big-ontology diagram to a static site: the LOD slider + Attic + side-store bundle is static-only (no server code), so a `git push` to `main` is enough to ship an ontology of any size to `https://<org>.github.io/<repo>/`. The workflow uploads `demo/site` as a Pages artifact and calls `actions/deploy-pages@v4`; sub-path deploys resolve their assets via the `window.ONTOINK_ASSET_BASE` shim added in 0.6.3.

### Fixed
- **Predicate-policy no-op fast path** — when no policy is supplied to `parse_ttl_to_cytoscape`, `apply_predicate_policy` returns empty sets and `fold_literals_into_badges` short-circuits at the first `if not fold_set and not fold_prefixes: return`, so the Step-2 walk keeps the exact triple-by-triple output shape 0.6.1 emitted. This is verified by the existing `test_ttl_parser` / `test_fence` suites, which pass with no changes.
- **Clustering-off fast path** — `detect_clusters` is only invoked when the caller explicitly imports it, and even then a missing `igraph` install emits a single `RuntimeWarning` and returns the caller's original `nodes` / `edges` unchanged; the fence handler pops `_side_store` with a default of `{}`, so the JS `loadSideStore` call becomes a no-op on any diagram that did not run through clustering.
- **Attic z-index isolation** — the Attic panel sits inside `.ontoink-container`, which sets `isolation: isolate` (0.6.1), so its `z-index: 400` is scoped to the diagram's stacking context and cannot bleed over the host site's sticky chrome.

## [0.6.3] - 2026-06-10

### Added
- **Full in-browser SHACL validation** — the playground's interactive "Validate" (and "Validate with Inferences") now runs a standards-compliant SHACL engine (`rdf-validate-shacl`) entirely in the browser, replacing the previous hand-rolled checker that only understood `sh:targetClass` + `sh:minCount`/ `sh:maxCount` (named-shape pattern). It now covers full SHACL **Core** — `sh:datatype`, `sh:class`, `sh:nodeKind`, `sh:pattern`, value ranges, `sh:in`/`sh:hasValue`/`closed`, logical/shape-based constraints, property paths, inline blank-node property shapes, severity, etc. — and was verified to match pyshacl on `sh:datatype`/`sh:pattern`/`sh:in`/`sh:class`/ `sh:minInclusive` fixtures the old checker silently passed. The engine is a vendored same-origin ESM bundle at `demo/docs/assets/shacl/shacl.mjs` (built by `scripts/build-shacl-bundle.mjs`, committed to the repo) so it works on the static GitHub Pages demo with no server or WASM/cross-origin-isolation. If the bundle ever fails to load, `validate()` degrades to the cardinality-only checker (`validateMinimal`). Known gaps vs pyshacl (both need a SPARQL engine the browser bundle doesn't include): **SHACL-SPARQL constraints** (`sh:sparql`) and **SHACL-AF rules** (`sh:rule`/`sh:SPARQLRule`). A shape using `sh:sparql` currently throws inside the engine and falls back to the cardinality checker; `sh:rule` inferences are silently not applied. The build-time and `/validate` (pyshacl) reports remain the exact references for those.
- **Asset base path for sub-path deploys** — `plugin.py` now injects `window.ONTOINK_ASSET_BASE` (a per-page relative `…/assets/` prefix) so dynamically-imported same-origin ESM (the SHACL bundle) resolves correctly both at the site root (Docker `all`) and under a sub-path (GitHub Pages, `/ontoink/…`).
- **Server-side ontology dereference proxy (`GET /deref`)** — a generic alternative to the client-side `_KNOWN_ONTOLOGY_URLS` registry. Browsers cannot follow the CORS-less 30x redirects that canonical ontology IRIs use (`purl.obolibrary.org`, `nfdi.fiz-karlsruhe.de`, …), so the playground had to hard-code per-namespace mirror URLs that rot and need manual version bumps. The server has no CORS constraint: `/deref?iri=<iri>` dereferences any IRI with content negotiation, follows redirects, and relays the RDF back with permissive CORS as `{body, format, url}` for the existing client parsers to consume. The playground's `fetchOntology` now prefers `/deref` whenever a same-origin server (`api`/`all` mode) answers `/health`, and falls back to the registry + direct content negotiation only on serverless GitHub Pages. This makes the "More…" dereference work for *any* ontology — including FOAF, which has no reliable client-side CORS mirror. The endpoint is read-only and SSRF-guarded: it rejects private/loopback/link-local/reserved hosts (re-checked on every redirect hop), non-HTTP(S) schemes, and caps redirects (6) and body size (25 MB).

### Fixed
- **Three `_KNOWN_ONTOLOGY_URLS` mirror entries were dead**, so dereferencing those namespaces silently failed in the browser:
  - **BFO** pointed at `BFO-2020/master/src/owl/bfo-2020.owl` (404 — the file moved); now `release-2024-01-29/src/owl/bfo-core.owl`.
  - **IAO** pointed at `IAO/master/src/ontology/iao.owl` (404); now the release-tagged `IAO/v2026-03-30/iao.owl`.
  - **nfdicore** was pinned to `…/nfdicore/3.0.4/ontology.ttl`; now prefers the version-less `…/nfdicore/ontology.ttl` (no manual version bumps) with the pinned copy as a fallback. FOAF is annotated as having no client-side CORS mirror (xmlns.com sends no CORS header) — it now works via the `/deref` proxy instead.
- **The legend edge arrowhead always drew a triangle**, ignoring the pointer shape chosen in Edit Layout. `buildLegendOverlay` read the live `target-arrow-shape` into a variable but then rendered a hardcoded triangle `<polygon>`, so changing an edge type's arrow to tee / vee / diamond / circle updated the graph but not the legend. A new `arrowIconSvg` helper renders the actual shape. (The PNG/SVG *export* legends still draw a fixed triangle — a separate code path, not yet addressed.)
- **Playground "Edit & Validate" had no SHACL Shapes pane** — the playground page hand-codes its own container, and its editor panel omitted the `.ov-editor-shapes-textarea`, so the shapes file (including one passed via `?shape=`) was never shown and validation ran against empty shapes. The panel now mirrors the fence-rendered editor (Source | SHACL Shapes + a Validation Report row); the existing editor logic already seeds the pane from `data.shapeTtl`. The page's "Simplified SHACL" note was updated to reflect the full SHACL Core engine. Validation also now falls back to the originally loaded shapes (`inst.data.shapeTtl`) when the editor pane isn't seeded, so a `?data=…&shape=…` link validates even if the user clicks Validate before the shapes editor has populated.

## [0.6.2] - 2026-06-08

### Fixed
- **The three OWL-DL reasoner backends never returned inferences** through the `/reason` API — each failed silently (their wrappers catch exceptions and return `None`/empty), so only `owlrl` ever produced results and `auto` always fell through to it. Three independent bugs:
  1. **owlready2 / HermiT** — the graph was serialised to **Turtle**, but owlready2's bundled RDF parser rejects rdflib's Turtle output (`NTriples parsing error (or unrecognized file format)`). Now serialised as **RDF/XML**. Additionally `sync_reasoner(..., infer_data_property_values=True)` raised `TypeError` on owlready2 builds whose `sync_reasoner_hermit()` lacks that keyword; the call now falls back to `infer_property_values=True` only.
  2. **native Konclude** — Konclude emits **OWL 2 XML** on output (`<Ontology>` with `<SubClassOf>` / `<ClassAssertion>` elements), but the wrapper parsed it as **RDF/XML** via `rdflib.parse(format="xml")`, which silently yields nothing. Output is now translated by a dedicated `_add_konclude_owlxml_inferences` helper. A transient `owl:Ontology` declaration is also added to the RDF/XML input when the source graph lacks one, so arbitrary TTL classifies.
  3. **konclude-wasm** (`owl-reason` Node CLI) — the wrapper wrote the inferences as **N-Quads** (each line carried the `urn:konclude:inferred` graph term), which `rdflib.parse(format="nt")` rejects with `Invalid line`; and the Python caller passed `--format nt`, an argument the wrapper didn't accept (`Unknown argument: --format`). The wrapper now re-emits the inferences as default-graph triples (valid N-Triples) and tolerates `--format`.

  With these fixes all four backends (`owlready2`, `konclude`, `konclude-wasm`, `owlrl`) return inferences from OWL2 property-restriction ontologies; the OWL-DL reasoners additionally derive class subsumptions (e.g. `∃reads.Novel ⊑ ∃reads.Book`) that `owlrl` does not.
- **`owl:equivalentClass` property restrictions were never visualized** — the graph builder only walked `?C rdfs:subClassOf [owl:Restriction …]`, so a class *defined* by a restriction (e.g. `VegetarianDish ≡ ∀ingredient.VegetarianFood`) drew no restriction edge at all. `_extract_owl_restrictions` now also walks `owl:equivalentClass`, and the diagram distinguishes the two: a necessary `rdfs:subClassOf` restriction draws as **`⊑`** (solid triangle arrow), an `owl:equivalentClass` definition draws as **`≡`** (hollow diamond arrow, label prefixed with `≡`). Each edge carries `owlVia`, and the popup labels the axiom a "necessary condition" vs a "definition (necessary & sufficient)".
- **Anonymous boolean-class wrappers rendered as a disconnected blank node** — a class defined by `owl:intersectionOf` / `owl:unionOf` of *named* classes (e.g. `Mother ≡ Woman ⊓ Parent`) left a stray, unconnected anonymous `owl:Class` node. The wrapper is now collapsed into labelled `rdfs:subClassOf` edges (`⊓` — the class is below each conjunct; `⊔` — each disjunct is below the class) to/from its members, both at build time and in the client-side re-render.
- **Browser (in-page) Konclude WASM reasoner died with `Error: unwind`** — the Emscripten runtime unwinds the WASM stack on program exit by throwing an `unwind` sentinel. The Node CLI swallows it, but the esbuild browser bundle let it escape, killing an otherwise-successful run. `reasonInBrowser` now treats an `unwind` rejection as non-fatal and harvests the inferred graph, re-throwing only when nothing was produced.
- **Client-side re-render (Edit & Validate → Update Graph, and the playground) destroyed restrictions** — the JS parsers rendered owl:Restriction blank nodes as raw `[`, `]`, `owl:Restriction`, `owl:someValuesFrom` nodes/edges (`parseTtlMinimal`) or dropped them silently (`parseTtlRobust`), because neither understood Turtle `[ ]` blank-node / `( )` collection syntax. Added a blank-node-aware `parseTtlGraph` plus `collapseOwlRestrictions` (a JS mirror of the build-time `_extract_owl_restrictions`) and switched `updateGraph` and the playground builder to them, so restrictions now collapse into the same `⊑`/`≡` edges as the server-rendered diagrams. Both JS builders also now drop `owl:Class` / `owl:Ontology` / `owl:ObjectProperty` meta-nodes (mirroring `_IMPLICIT_TOPS`), matching the build-time render.

### Added
- **`reasoner:` fence option** — an ` ```ontoink ` block can now set the default reasoner backend for its dropdown, e.g. `reasoner: owlrl` (bare names map to the matching `Server:` option; `auto`/`browser`/`server:*` are taken as-is). Falls back to the usual default when unset or unavailable.
- **Comprehensive Reasoning & Inference demo** — `examples/reasoning-demo.md` now walks every RDF/RDFS/OWL/OWL2 reasoning feature with a small, self-contained example each (RDFS subClassOf/subPropertyOf/domain/range; OWL inverseOf, Symmetric/Transitive, Functional/InverseFunctional, sameAs, equivalentClass/ Property; OWL2 someValuesFrom/allValuesFrom/hasValue, intersectionOf/unionOf, propertyChainAxiom; subClassOf-vs-equivalentClass; and reasoning+SHACL). New ontologies under `demo/docs/shapes/reasoning-demo/`. Blocks default to `reasoner: owlrl` (the most complete materialiser).

### Changed
- **OLS IRI-dereference link** — the popup no longer shows a "Found in: N ontologies" line, and the cross-ontology link now reads "Ontologies using this IRI on OLS" (no count).

## [0.6.1] - 2026-06-04

### Added
- **SHACL Shapes editor pane in *Edit & Validate*** — the panel is now a two-column editor: data TTL on the left, SHACL shapes on the right, validation report as its own row below. Both panes wire up CodeMirror with Turtle syntax highlighting. Edited shapes are re-extracted client-side on each `Validate` click via a minimal `extractShaclFromTriples()` helper covering the named NodeShape → `sh:property` → property-shape pattern; if extraction yields nothing (e.g. inline blank-node property syntax the minimal parser can't read), validation falls back to the build-time `inst.data.shacl` array so the button still does something useful. The report line now includes the constraint count, e.g. *"3 violation(s) found across 7 constraint(s)"*.
- **Resizable popups** — the per-node / per-edge popup now uses CSS `resize: both` plus min (`240×140`) and max (`90vw × 80vh`) bounds, so the user can drag the bottom-right corner to enlarge a popup with a long IRI list or a dense validation report. A small chevron indicator marks the corner so the affordance is discoverable. The existing drag-the-header-to-move behaviour is unchanged.

### Fixed
- **"List N ontologies reusing this IRI on OLS" link returned zero results** — for an OBO PURL like `http://purl.obolibrary.org/obo/IAO_0000300`, the previous URL passed the full URL-encoded IRI to OLS search, which tokenises and returns nothing. The popup now derives the OBO short ID (`IAO:0000300`) when the IRI matches `purl.obolibrary.org/obo/<PREFIX>_<NUMBER>`, and falls back to `term.obo_id` from the OLS response for non-OBO IRIs; the resulting search consistently lists every ontology that reuses the IRI.
- **Sticky toolbar bleeding over host-page chrome** — when the page hosting an ontoink diagram had its own fixed/sticky chrome (MkDocs Material's collapsible nav drawer, for example), the toolbar's `z-index: 100` competed with the host page in the same stacking context and drew over the drawer. `.ontoink-container` now sets `isolation: isolate`, which creates a self-contained stacking context so the toolbar's z-index is scoped to the container and can never escape over external UI. Internal layering (toolbar above canvas, popup above legend) is preserved.

## [0.6.0] - 2026-05-17

### Added
- **Unified interactive Reasoning UI on every ontoink graph** (not just the playground) — fence-rendered diagrams in the demo home and `/ontosniff/` now get the same reasoner dropdown with progress status, elapsed-ms timing, scrollable log panel, and Download / Copy buttons for inferred triples
- **Persisted reasoning runs** — each `/reason` call writes `input.ttl`, `inferences.json`, and `inferences.nt` to a mounted volume (`ONTOINK_OUTPUT_DIR`, default `/output`). One timestamped subdirectory per request. Docker-compose mounts `./output:/output` automatically
- **Pytest suite for reasoners + API** — `tests/test_reasoners.py` and `tests/test_api.py` cover each backend's dispatch contract and every endpoint (health, reason, validate, output persistence, reasoner override). Backends without a binary skip cleanly; 52 tests pass, 2 skip on non-Docker hosts
- **Browser-side OWL-DL reasoning in the playground** — Reasoning button with backend dropdown (Auto / Browser WASM Konclude / Server: native Konclude / HermiT / WASM CLI / OWL-RL). Options are auto-detected: browser is enabled only when the page is cross-origin isolated, server options are enabled only when `/health` is reachable
- **`coi-serviceworker`** vendored at [`demo/docs/assets/coi-serviceworker.js`](demo/docs/assets/coi-serviceworker.js) so the playground's WASM Konclude works on GitHub Pages (no server-side header support required). Registers from `mkdocs.yml` via `extra_javascript`
- **COOP/COEP middleware** on the FastAPI `/reason` endpoint for self-hosted deployments
- **`reasoner` field on POST /reason** — clients can override the server's default `ONTOINK_REASONER` per request without restarting the container
- **Playground parity** — Abstract View and reasoning panel are now wired in the browser playground, matching the MkDocs fence path
- **Production Docker image** with `ONTOINK_MODE` env switch (`serve` / `build` / `api` / `all`) and `ONTOINK_REASONER` selector. `all` mode builds the docs once and serves them via FastAPI on the same origin as `/reason`, so the playground's "Server" reasoner option works without a reverse proxy
- **Konclude two-pass classification + realization** — native Konclude wrapper now invokes both subcommands and merges results. **Note**: Konclude expects OWL/XML input (different from rdflib's RDF/XML); for full inference from TTL input use `owlready2` or `konclude-wasm`
- **Native Konclude reasoner** (`ONTOINK_REASONER=konclude`) — upstream Konclude C++ tableau binary from University of Ulm, downloaded and installed in the production Docker image
- **rdf-reasoner-konclude integration** (`ONTOINK_REASONER=konclude-wasm`) — OWL-DL tableau reasoning via WASM Konclude for **browsers and Node.js**, no Java required. Ships with a thin CLI wrapper (`owl-reason`) compensating for an upstream packaging gap
- **FastAPI mode** — `/reason`, `/validate`, `/health` endpoints when `ONTOINK_MODE=api` (optional extra `pip install ontoink[api]`)
- **SHACL constraint edges in the playground** — `sh:path` / `sh:targetClass` shapes now render as cyan dashed cardinality-labelled edges, matching the MkDocs build path. Shapes with no instance data render against the targetClass and a placeholder target (`sh:class` / `sh:node` / `sh:datatype`).
- **SHACL shape IRI dereferencing** — labels and axioms auto-fetched for `sh:path`, `sh:targetClass`, `sh:class`, `sh:datatype`, `sh:node` IRIs on graph load
- **GitHub Actions workflow** to build & push the Docker image to GHCR on each `v*` tag (`.github/workflows/docker.yml`)
- **TESTING.md** with end-to-end manual test plan (Python, JS, MkDocs, playground, Docker)
- **.env.sample**, **NOTICE**, and **CITATION.cff** files documenting deployment config and third-party attribution

### Fixed
- **Browser WASM reasoner "Worker error"** — three independent issues stacked. Each is now addressed:
  1. The Web Worker was spawned cross-origin (esm.sh) and Chromium refused to start it.
  2. The bundle's `new Worker(new URL("./worker.js", import.meta.url))` requires `worker.js` to live next to the bundle, but it was never copied.
  3. `konclude.mjs` (Emscripten output) starts with a top-level `import { createRequire } from "module"` that throws in browsers — the `require()` it sets up is only used in Node-only branches. The Docker image now ships a same-origin esbuild bundle of rdf-reasoner-konclude + n3 at `/assets/reasoner/bundle.mjs`, with `worker.js`, `konclude.wasm`, and a patched `konclude.mjs` (browser-safe `require` stub) alongside. The JS loader prefers this vendored bundle and falls back to esm.sh only if it is unreachable.
- **Reasoning panel UX overhaul** —
  - Panel **no longer toggles off** on a second Reasoning click; cached results stay visible. Use the explicit ↻ Re-run button to redo reasoning.
  - **Statistics row** at the top of the result panel: inferred-triple count, elapsed ms, distinct subjects, distinct predicates, backend used.
  - **Show inferences on graph** checkbox — toggles inferred elements as a distinct purple-dotted overlay (`edgeType: "inferred"`), customisable from Edit Layout like every other edge type.
  - **Stop button** is now styled as a clear `⏹ Stop` action chip; on cancel, the request is aborted via `AbortController` and the UI re-enables cleanly.
  - **Retry** button on errors so the user can rerun without closing the panel.
  - **Reasoning logs** auto-expand when an error happens (you see what failed without clicking around).
- **Reasoning UI lock state** — the Reasoning button and reasoner dropdown are now disabled while a request is in flight, with a visible Cancel button. Server requests are aborted via `AbortController` when the user cancels
- **SPARQL autocomplete on macOS** — added `Alt+/` as a universal trigger because macOS reserves `Ctrl+Space` for input source switching by default. Hint text adapts to the user's platform
- **Browser WASM reasoner module loading** — switched from jsdelivr's `/+esm` to `esm.sh` (n3 is CommonJS and jsdelivr couldn't transpile it cleanly)
- **Demo pages looked unstyled in `all` mode** — switched `Cross-Origin-Embedder-Policy` from `require-corp` to `credentialless`, so cross-origin assets (Google Fonts, etc.) load without requiring every resource to set CORP
- **Legend and namespace overlay** now refresh when the layout is switched
- **Edit Layout customizations now propagate to the legend** — changing a node color, node shape, edge color, edge line style, or edge arrow shape immediately updates the legend in the page
- **PNG and SVG exports** now include Edit Layout customizations in the embedded legend (previously the legend in exports always showed the default colors and shapes regardless of edits)

### Changed
- Reasoner selection is now user-configurable via env var (was implicitly owlready2 → owlrl)

## [0.5.2] - 2026-04-17

### Fixed
- **Broken parsing of TTL with periods inside strings** — the statement splitter now respects quoted strings, so descriptions like `"...time frame. Every batch..."` no longer break parsing
- **Hyphenated prefixes not recognized** — prefixes like `samm-c:`, `ext-built:`, `ext-classification:` are now correctly captured (`\w` → `[\w-]` in prefix regex)

## [0.5.1] - 2026-04-17

### Fixed
- **Playground hang on non-HTTP namespaces** — `urn:`, `oid:`, and other non-HTTP URI schemes are skipped during auto-dereference

## [0.5.0] - 2026-04-10

### Added
- **OntoSniff** — ontology smell detector with 9 anti-patterns based on published research
    - Lazy Class, Missing Label, Missing Domain/Range, Singleton Hierarchy, Property Soup, Orphan Class, Missing Inverse, No SHACL Coverage, Label Language Gap
    - Quality score (0-100), integrated into Stats panel, standalone page with URL sharing
- **SPARQL Explorer** — connect to SPARQL endpoints, auto-discover schema, visual query builder with Ctrl+Space autocomplete, adaptive discovery for large KGs
- **OntoSniff page** with ?source= URL parameter for shareable reports
- **SPARQL Explorer page** with ?endpoint= URL parameter
- **Abstract Model View** — toggle button showing only classes and class-level edges
- **Search & Highlight** — fuzzy search in toolbar with real-time node/edge filtering
- **Layout Switcher** — dagre, force, circle, concentric, tree, grid layouts
- **Graph Statistics** — ontology metrics (12 cards), consistency badge, LOD links, SHACL coverage map
- **Path Finder** — Dijkstra shortest path with animated visualization
- **Built-in SPARQL** — query local graph with templates, class/property dropdowns, Ctrl+Space autocomplete
- **Minimap** — viewport overview in top-right corner
- **Neighborhood Focus** — auto-focus for large graphs (>30 nodes)
- **Playground** — full toolbar with all features (search, layout, stats, paths, SPARQL)
- **SHACL Editor** — load TTL, add/remove prefixes, tooltip help, class/property dropdowns with suggestions
- Close (×) button on all panels (Stats, Paths, SPARQL, Reasoning, Editor)
- **Automatic ontology label resolution** — on graph init, fetches and caches labels from all referenced ontologies
    - Known ontology URL registry bypasses CORS-broken redirects (nfdicore, BFO, IAO, RO, FOAF, Schema.org, SKOS)
    - Robust line-based OWL TTL parser handles nested blank nodes, collections, and multi-line strings
    - Labels propagated to click popups, SPARQL autocomplete, class/property dropdowns, and query results
- **Enhanced IRI dereferencing** — "More..." button in popups shows label, comment, type, subclass, deprecation, SKOS definitions from fetched ontology data
- **Scrollable popups** — popup and deref results scroll within bounded containers
- **Sticky toolbar** — toolbar stays fixed at top while scrolling the page
- **SPARQL Explorer ontology fallback** — when endpoint lacks labels, fetches ontology source files directly and extracts rdfs:label/skos:prefLabel
- **SPARQL results with labels** — query results render IRIs as `label (prefixed:name)` instead of bare IRIs

### Fixed
- SPARQL Explorer label fetching: batch loading, multiple predicates (rdfs:label, skos:prefLabel, schema:name), FILTER IN fallback
- PNG/SVG export: minimap hidden, scale 2x, reliable overlay positioning
- IRI dereferencing for nfdicore and other ontologies with CORS-broken redirects
- SPARQL dropdowns now refresh labels every time the panel is opened (not just on first build)

## [0.4.0] - 2026-04-09

### Added
- **OWL Reasoning** — HermiT reasoner (via owlready2) runs at build time, with owlrl fallback
    - Reasoning toolbar button with inferred triples panel (table view)
    - "Show on graph" checkbox to overlay inferred triples as purple dotted edges/nodes
    - "Validate with Inferences" button to run SHACL validation with inferred triples included
    - Smart filtering: removes reflexive triples, built-in namespace noise, domain/range propagation
    - Configuration option: `reasoning: true/false` per diagram
- **OWL Reasoning demo** — new example with class hierarchy, inverse/transitive/symmetric properties
- **Draggable popups** — node and edge popups can be moved by dragging the header
- **Collapsible popup sections** — Connections and SHACL Constraints collapse by default, click to expand
- **IRI dereferencing** — "More…" button fetches structured data (JSON-LD) from the IRI
- **Prefix editing** — toggle prefix visibility in the Edit Layout panel

### Fixed
- Prefix overlay now only shows prefixes declared in the TTL source (not rdflib built-ins)
- Popup sections work for all node types (fixed special character issue in IDs)
- PNG/SVG export captures the exact viewport with overlays at their on-screen positions

## [0.2.0] - 2026-04-08

### Added
- Edge click popup — click any edge to see label, type, IRI, source/target, cardinality, and copy buttons
- Edit Layout panel (renamed from "Colors") with node shape selector, edge line style, edge arrow shape, and color pickers
- Full documentation site with Material for MkDocs: getting started guide, all 5 examples, contributing guide, citation info, changelog

### Fixed
- PNG/SVG export now captures the exact viewport (zoom, pan, node positions) instead of re-fitting
- Export overlay positioning: legend and prefix boxes drawn at their actual on-screen positions
- Export overlay sizing: box dimensions and font sizes now match the DOM overlays

### Changed
- Toolbar button renamed from "Colors" to "Edit Layout"

## [0.1.0] - 2026-04-07

### Added
- Interactive ontology visualization using Cytoscape.js with dagre layout
- Formal visual notation: classes (yellow rectangles), individuals (grey circles), literals (green ellipses)
- Edge styles: object properties (blue), data properties (green), rdf:type (grey dashed), subClassOf (black), SHACL constraints (cyan dashed bold)
- SHACL constraint overlay with cardinality badges `[min..max]`
- Click popup with IRI, type badge, ontology source, connections, copy buttons
- Inline TTL editor with CodeMirror (Turtle syntax highlighting)
- Live SHACL validation with constraint checking
- Build-time validation using pySHACL
- Publication-ready PNG and SVG export
- Auto-generated legend with node types, edge types, and namespace boxes
- Toolbar: zoom, fit, fullscreen, export
- Color coding by ontology source (BFO, IAO, nfdicore, RO, OBI, PMD, QUDT, etc.)
- MkDocs plugin with `pymdownx.superfences` custom fence integration
- Demo site with GitHub Pages deployment
- Comprehensive test suite with pytest
