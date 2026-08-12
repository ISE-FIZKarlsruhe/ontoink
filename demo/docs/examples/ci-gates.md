# CI Gates — Competency Questions & Shape Drift

OntoInk can parse, reason over, validate and score an ontology. This page is about the step after that: making the build **fail** when something regresses, so a merge request that quietly breaks the model gets caught instead of merged.

Three mechanisms, all running at build time: executable competency questions, shape-drift detection, and a machine-readable build report with badges.

---

## Competency questions that actually run

A competency question is the requirement an ontology exists to satisfy — *"which people does the graph know about?"*, *"does every person have a name?"*. They are normally written in prose in a paper or a wiki, drift away from the ontology, and are never checked again.

The `ontoink-cq` fence pairs each question with the SPARQL that answers it and an expectation, then renders the result as a pass/fail card. This block is live — the cards below are the real output of running these queries against `shapes/foaf-person/shape-data.ttl` during this site's build:

```ontoink-cq
source: shapes/foaf-person/shape-data.ttl
title: FOAF competency questions
questions:
  - question: Which people does the graph describe?
    query: |
      PREFIX foaf: <http://xmlns.com/foaf/0.1/>
      SELECT ?person ?name WHERE {
        ?person a foaf:Person ; foaf:name ?name .
      }
    min_rows: 2
    note: Answering this at all is the point — an ontology nobody can query has failed.

  - question: Does every person have a name?
    ask: |
      PREFIX foaf: <http://xmlns.com/foaf/0.1/>
      ASK {
        ?person a foaf:Person .
        FILTER NOT EXISTS { ?person foaf:name ?n }
      }
    expect: false
    note: Phrased as "find me a counterexample", so the expected answer is false.

  - question: Is anybody's acquaintance also a described person?
    query: |
      PREFIX foaf: <http://xmlns.com/foaf/0.1/>
      SELECT ?a ?b WHERE {
        ?a foaf:knows ?b .
        ?b a foaf:Person .
      }
    min_rows: 1

  - question: Is every name a plain string rather than a typed literal?
    ask: |
      PREFIX foaf: <http://xmlns.com/foaf/0.1/>
      ASK {
        ?person foaf:name ?n .
        FILTER(datatype(?n) != <http://www.w3.org/2001/XMLSchema#string>)
      }
    expect: false
```

The diagram those questions run against:

```ontoink
source: shapes/foaf-person/shape-data.ttl
shape: shapes/foaf-person/shape.ttl
height: 380px
```

Press **Show on graph** on any passing card to select the bound terms on the diagram above.

### Writing the expectations

| Key | Applies to | Meaning |
|:----|:-----------|:--------|
| `expect: true` / `false` | `ask:` | The answer the ASK must return |
| `min_rows: N` | `query:` | At least N result rows |
| `max_rows: N` | `query:` | At most N rows — `0` asserts a query finds *nothing* |
| `expect_rows: N` | `query:` | Exactly N rows |
| *(none given)* | `query:` | Passes when the query returns at least one row |

Add `reasoning: true` to the fence and inferred triples are merged before the queries run, so a question can assert what the ontology **entails** rather than only what it literally states — which is how you test that a subclass chain or an inverse property actually does what you meant.

### What a failure looks like

Every question above passes, so this page's own build stays green. Add one that does not — in the FOAF fixture only Alice has a homepage, so requiring one of everybody fails:

````yaml
- question: Does every person have a homepage?
  query: |
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    SELECT ?person WHERE {
      ?person a foaf:Person .
      FILTER NOT EXISTS { ?person foaf:homepage ?h }
    }
  max_rows: 0
````

The card renders red with the reason on it, and the build log gets:

```text
WARNING - ontoink: competency question failed in shapes/foaf-person/shape-data.ttl
          - Does every person have a homepage? (1 row(s) returned; expected at most 0 row(s))
```

### The gate

So `mkdocs build --strict` turns a broken competency question into a failing build, and no extra CI configuration is needed.

Failures are **logged, not raised**. That is deliberate: pymdownx catches an exception thrown from a fence handler and silently falls back to rendering the block as plain text — raising would have thrown away the very diagnostics you need.

---

## Shape drift

Shapes rot. The data grows a property every instance now carries; a constraint written two years ago stops matching anything; a new class arrives with no shape at all. None of that breaks validation — the shapes still *pass* — so nothing tells you.

`shape_drift: warn` compares what you committed against what the data implies today:

```yaml
source: shapes/foaf-person/shape-data.ttl
shape: shapes/foaf-person/shape.ttl
shape_drift: warn
```

It reports three kinds of finding:

- **Missing** — a constraint the data supports that your shapes file does not state. In the FOAF example, every person has exactly one `foaf:name`, but the committed shape only requires `sh:minCount 1` — the `sh:maxCount 1` the data supports is missing.
- **Stale** — a committed constraint that almost no instance satisfies, with a concrete relaxation to consider (`Relax to sh:maxCount 3 — the largest number of values observed`).
- **Uncovered** — a class with instances or axioms and no `sh:targetClass` anywhere.

Findings go to the build log the same way, so the same `--strict` gate covers them:

```text
WARNING - ontoink: shape drift in shapes/foaf-person/shape-data.ttl
          - http://xmlns.com/foaf/0.1/Person - .../name sh:maxCount 1 is supported
            by 2/2 instances (100%) but the shapes file does not state it
```

Stale detection needs instance data to say anything — on an axiom-only ontology there is nothing to violate, so it reports none rather than guessing.

---

## The build report

Every build writes two artefacts into the site, whether or not anything failed.

`ontoink-report.json` carries one entry per diagram plus a build-level summary:

```json
{
  "ontoink": "0.7.7",
  "summary": {
    "graphs": 44, "minScore": 41, "meanScore": 59,
    "violations": 20, "conforms": false, "inconsistent": 3,
    "smells": { "errors": 5, "warnings": 126, "info": 129 },
    "shapeDrift": 5,
    "competencyQuestions": { "total": 4, "passed": 3, "failed": 1 }
  },
  "graphs": [ /* per-diagram detail */ ]
}
```

`badges/*.svg` are self-contained shields — rendered locally, with no request to an external badge service — for embedding in a README:

```markdown
![OntoSniff](https://your-site.example/badges/ontosniff.svg)
![SHACL](https://your-site.example/badges/shacl.svg)
![consistency](https://your-site.example/badges/consistency.svg)
```

To fail the build on a regression rather than only report it, set thresholds on the plugin:

```yaml
plugins:
  - ontoink:
      quality_gate:
        min_score: 75          # lowest acceptable OntoSniff score
        max_violations: 0      # SHACL violations across all diagrams
        require_consistent: true
        max_shape_drift: 0
      strict_quality: true     # fail outright; omit to rely on --strict
```

---

## Putting it in CI

Nothing here needs a plugin beyond ontoink itself. A minimal GitHub Actions step:

```yaml
- name: Build docs and gate on ontology quality
  run: |
    pip install ontoink
    mkdocs build --strict -f demo/mkdocs.yml

- name: Publish the quality report
  uses: actions/upload-artifact@v4
  with:
    name: ontoink-report
    path: demo/site/ontoink-report.json
```

`--strict` covers competency questions, shape drift, and any SHACL shapes file that failed to load. `quality_gate` covers score regressions and violation counts. The report artefact gives you the numbers to diff between runs.
