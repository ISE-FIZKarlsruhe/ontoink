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

## Where the methods come from

Both inducers were ported from a benchmark comparing eight shape-induction methods:

| Method | What it reads | Where it helps |
|:-------|:--------------|:---------------|
| `baseline` | instance data | Best F1/complexity ratio in the benchmark. Needs individuals. |
| `astrea` | OWL axioms | The only one that works on an ontology with no data at all. |
| `auto` | both | Default. Axioms first, then data, merged and deduplicated. |

`baseline` reimplements Mihindukulasooriya et al. (2018), *RDF Shape Induction Using Knowledge Base Profiling*; `astrea` follows Cimmino et al. (2020). The other five benchmarked methods are not shipped: they either over-predicted, produced output identical to the baseline on real ontologies, or were never fully implemented.

## How it is evaluated

The methods are not taken on trust. `tests/test_benchmark_fidelity.py` re-runs the shipped engine over the research project's five benchmark datasets and asserts it reproduces the published precision/recall/F1 exactly. The metric is the standard one for this task: strict set equality over the `(target_class, path, kind, value)` identity tuple, scored against hand-authored gold SHACL shapes.

| Benchmark | `baseline` P | R | F1 |
|:----------|:---:|:---:|:---:|
| foaf-toy | 1.00 | 1.00 | **1.000** |
| lubm-small | 0.93 | 1.00 | **0.963** |
| identifiers | 1.00 | 0.79 | **0.880** |
| wd-q-subset | 0.57 | 0.47 | **0.516** |
| lubm-1u | 0.07 | 0.35 | **0.117** |
| | | mean | **0.695** |

The two hard cases are honest signal, not noise. `wd-q-subset` is a real Wikidata slice where the gold shapes encode editorial judgement a frequency counter cannot recover; `lubm-1u` is a generated dataset whose gold set is much smaller than what the data supports, so a data-driven method drowns in true- but-unwanted constraints. A recommender that scored 1.0 on all five would be overfitted to the easy ones.

`auto` trades precision for recall rather than dominating: on `lubm-1u` it roughly doubles baseline's F1 (0.117 → 0.237) by adding axiom-derived constraints, but on `lubm-small` and `wd-q-subset` it scores slightly *below* baseline because those axioms introduce false positives. If you care more about not being wrong than about coverage, pick `baseline` explicitly.

To run the evaluation yourself, check out the `shape-recommender` project beside the plugin and run `pytest tests/test_benchmark_fidelity.py` — the suite skips itself when that project isn't present.

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
