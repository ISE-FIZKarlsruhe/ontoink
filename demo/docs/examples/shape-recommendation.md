# Shape Recommendation

Most ontologies published as documentation have no SHACL shapes at all. Writing the first one is the hard part — not because the syntax is difficult, but because it means reading every class and deciding what is actually required.

OntoInk can propose that first draft. Add `recommend_shapes: true` to a fence and the built page ships a **Shapes** panel with a `sh:NodeShape` for every class that has no coverage, along with the evidence behind each constraint.

## From instance data

The FOAF example below has no shapes file, so every class is a candidate. Open **Shapes** in the toolbar.

```ontoink
source: shapes/foaf-person/shape-data.ttl
recommend_shapes: true
height: 420px
```

The proposal for `foaf:Person` is worth reading closely, because it shows what the evidence buys you:

- `foaf:name` gets **both** `sh:minCount 1` and `sh:maxCount 1` — every person in the data has exactly one name.
- `foaf:mbox` and `foaf:homepage` get only `sh:maxCount 1`. Just one person has each, so the recommender will not claim they are required.
- `foaf:knows` gets `sh:class foaf:Person`, because every observed value is one.

That distinction — required versus merely observed — is the whole point of showing support counts next to each constraint rather than a bare list.

## From axioms alone, with no data

A documentation ontology usually ships zero individuals, which leaves a frequency-based recommender with nothing to count. The axiom-driven method reads `rdfs:domain` / `rdfs:range`, `owl:FunctionalProperty` and the cardinality and value restrictions instead, so a class that has never been instantiated still gets a shape.

```ontoink
source: shapes/role-bearer/shape-data.ttl
recommend_shapes:
  method: auto
  min_confidence: 0.8
height: 420px
```

`auto` (the default) runs the axiom pass first and then the data pass, merging the results. Each constraint records which method proposed it, so you can tell an assertion the author made on purpose from a pattern the data happens to show.

## Accepting constraints one at a time

Reading a generated shape and pasting it wholesale is the low-trust path. The alternative is on the canvas: **right-click any class → Induce shape from this class**.

Proposed constraints appear as dashed violet edges. Their opacity is mapped from confidence, so a suggestion backed by three of three instances is drawn solid and one backed by six of ten is visibly faint — and the trust slider that appears with them hides anything below a threshold you choose.

Clicking a dashed edge accepts it: it turns into a normal SHACL constraint edge and its Turtle is appended to the **Edit & Validate** shapes buffer, where `Validate` is one click away. Nothing is written to your files; the suggestion has to survive validation before you decide to keep it.

## Keeping shapes honest as the data changes

Once shapes exist, they drift. `shape_drift: warn` compares what you committed against what the data implies on every build:

```yaml
source: shapes/foaf-person/shape-data.ttl
shape: shapes/foaf-person/shape.ttl
shape_drift: warn
```

It reports three things: constraints the data now supports that your file does not state, committed constraints that almost no instance satisfies (with a concrete relaxation to consider), and classes with no shape at all. Findings go to the build log, so `mkdocs build --strict` turns them into a failing build — which is how a merge request that changes the ontology without updating its shapes gets caught.

## The methods, and who published them

Every method OntoInk offers is one you can cite. That is a deliberate limit: a recommendation you cannot trace to a peer-reviewed method is one you cannot defend in review, so unpublished and experimental inducers are not exposed here even though the research project alongside this one contains several.

| Method | Reads | Reference |
|:-------|:------|:----------|
| `baseline` | instance data | Mihindukulasooriya, N., Rashid, M. R. A., Rizzo, G., García-Castro, R., Corcho, O., & Torchiano, M. (2018). *RDF Shape Induction Using Knowledge Base Profiling*. SAC 2018. [doi:10.1145/3167132.3167341](https://doi.org/10.1145/3167132.3167341) |
| `astrea` | OWL axioms | Cimmino, A., Fernández-Izquierdo, A., & García-Castro, R. (2020). *Astrea: Automatic Generation of SHACL Shapes from Ontologies*. ESWC 2020. [doi:10.1007/978-3-030-49461-2_29](https://doi.org/10.1007/978-3-030-49461-2_29) |
| `shexer` | instance data | Fernández-Álvarez, D., Labra-Gayo, J. E., & Gayo-Avello, D. (2022). *Automatic extraction of shapes using sheXer*. Knowledge-Based Systems, 238, 107975. [doi:10.1016/j.knosys.2021.107975](https://doi.org/10.1016/j.knosys.2021.107975) |
| `auto` | both | Not a method — runs `astrea` then `baseline` and merges them. The default. |

`baseline` and `astrea` are reimplementations, and are held to their originals by test. `shexer` is different: it drives [the authors' own library](https://github.com/DaniFdezAlvarez/shexer) rather than reimplementing the algorithm, because a reimplementation by someone else is not the same method — and for a tool that cites its sources, that distinction is the whole point. It is an optional dependency:

```bash
pip install 'ontoink[shexer]'
```

Without it, asking for `method: shexer` falls back to `auto` and says so on the panel rather than failing the build. sheXer is Python-only, so the in-browser engine reports it as unavailable instead of offering a choice that cannot work.

What each one is good for:

- **`baseline`** — the best F1-to-complexity ratio of the methods benchmarked, and the one to pick when being wrong costs more than missing something.
- **`astrea`** — the only one that works on an ontology with no individuals at all, which is the normal state of a documentation ontology. It restates what the author already asserted, so it cannot be wrong about the data; it can only be silent.
- **`shexer`** — contributes `sh:pattern`, `sh:minLength` and `sh:maxLength`, which neither of the other two derives.

## Choosing a method and tuning it

The **Shapes** panel has a method picker with the citation shown inline, and a **Hyperparameters** menu holding whatever knobs that method actually reads. Changing either re-runs induction in the browser and repaints the panel.

Only knobs that change the output are offered. `baseline` also takes a `max_samples` argument, for instance, and it is deliberately absent from the menu: it caps the sample values the profiler retains, which nothing in the method reads — datatype and class inference run off the full frequency counts. A slider that moves and changes nothing is worse than no slider.

| Method | Parameter | Default | What it does |
|:-------|:----------|:--------|:-------------|
| `baseline` | `min_count_threshold` | `0.9` | Emit `sh:minCount 1` when at least this fraction of a class's instances carry the property. Lower proposes more and is wrong more often. |
| `astrea` | — | — | Deterministic from the axioms; nothing to tune. |
| `shexer` | `acceptance_threshold` | `0.0` | Keep a constraint when its observed conformance is at least this. |
| `shexer` | `instances_cap` | `-1` | Stop after this many instances per class. `-1` examines every one. |
| `shexer` | `detect_minimal_iri` | `true` | Let sheXer shorten IRIs against the declared prefixes. |
| `shexer` | `infer_numeric_types` | `true` | Type untyped literals that look numeric. |

The same knobs are settable at build time, so a page renders with the settings you chose rather than the defaults:

```yaml
source: data.ttl
recommend_shapes:
  method: shexer
  params:
    acceptance_threshold: 0.2
```

`auto` composes two methods, so its parameters are keyed by which one they belong to — a flat namespace would let the two collide:

```yaml
recommend_shapes:
  method: auto
  params:
    baseline: {min_count_threshold: 0.75}
```

Over HTTP, `GET /recommend-methods` returns the same catalogue — labels, citations, declared knobs, ranges, and which methods that server can actually run — so a client can build its own picker without hard-coding a list. `POST /recommend-shapes` takes `params` in the same shape as the fence.

## How it is evaluated

The methods are not taken on trust. The metric is the standard one for this task: strict set equality over the `(target_class, path, kind, value)` identity tuple, scored against hand-authored gold SHACL shapes. F1 across the research project's six benchmarks:

| Benchmark | `baseline` | `shexer` | `astrea` | `auto` |
|:----------|:---:|:---:|:---:|:---:|
| foaf-toy | 1.000 | 1.000 | 0.737 | 1.000 |
| lubm-small | **0.963** | 0.963 | 0.125 | 0.897 |
| identifiers | 0.880 | 0.880 | — | 0.880 |
| lubm-1u | 0.846 | **0.861** | 0.029 | 0.809 |
| wd-humans | 0.571 | **0.789** | — | 0.571 |
| dbpedia-scientists | **0.963** | 0.923 | — | 0.963 |
| **mean** | 0.871 | **0.903** | 0.148 | 0.853 |

Read that table carefully, because the headline number is the least interesting thing in it.

`astrea` scores near zero, and three cells are blank. That is not a failure — it is the method working as designed on the wrong input. Three of these benchmarks ship no ontology at all, so an axiom-driven method has nothing to read; where an ontology does exist, the gold shapes were written from the data rather than from the axioms. On the real MWO and NFDIcore ontologies, which have restrictions and no individuals, the same method produces 39–58 useful constraints and `baseline` produces none. The benchmark measures the case `astrea` is not for.

`shexer` leads on the mean, and the margin comes almost entirely from `wd-humans` (0.789 against 0.571) — real, messy Wikidata, where `sh:pattern` and length constraints recover structure a frequency counter cannot express. On the clean synthetic benchmarks it ties `baseline` exactly.

`auto` never beats its best component on these datasets: merging in axiom-derived constraints adds false positives on `lubm-small` and `lubm-1u`. It stays the default because it is the only choice that produces something on both kinds of input, but if you know your graph has instances, name a data-driven method explicitly.

Two suites hold this in place, and they test different things:

- `tests/test_benchmark_fidelity.py` runs the shipped engine and the research implementation over the same graph and requires **identical constraint sets**. It pins the port to its original, not to a score — an earlier version asserted the recorded F1 numbers and broke the day the gold shapes were revised, which is a test failing for the ground truth improving.
- `tests/test_recommend_parity.py` runs the Python engine and its browser twin over identical fixtures and requires the same output, the same evidence counts, the same knobs, and the same citations down to the DOI.

To run either yourself, check out the `shape-recommender` project beside the plugin; both suites skip themselves when it is absent. `python scripts/eval_recommender.py` regenerates the table above, with provenance (timestamp, git revision, library versions) attached to every cell.

Generated shapes carry their evidence as annotations:

```turtle
sh:property [
    sh:path foaf:name ;
    sh:minCount 1 ;
    sh:datatype xsd:string ;
    sh:description "Suggested by ontoink — sh:minCount 1 (baseline, 2/2 instances (100%))" ;
    oi:confidence 1.0000 ;
    oi:support 2 ;
    oi:population 2 ;
    oi:method "baseline"
] .
```

The `oi:` terms are plain annotations, so the file is still a valid shapes graph you can hand to `pyshacl` unchanged.
