"""Hold the shipped recommender to the reference implementations it ports.

``ontoink/recommend/`` reimplements methods from the sibling
``shape-recommender`` research project. A port drifts, so this suite pins it —
but it pins it to the **reference implementation**, not to a recorded score.

That distinction is the whole design of this file. An earlier version asserted
the port reproduced the F1 numbers in
``shape-recommender/results/raw/<dataset>/<method>.eval.json``. Those numbers
are a function of the gold shapes, and gold is research material that gets
revised — when ``data/gold/lubm-1u.ttl`` grew from 26 to 187 constraints, four
assertions failed even though the port had not changed a line. A test that
breaks when the ground truth improves is measuring the wrong thing.

So: run both implementations over the same graph and require identical
constraint sets. That catches real drift, survives gold revisions, and needs no
recorded artefact at all. Scores are still computed, but only to assert
properties that stay true across gold revisions.

Skipped entirely when the research project isn't checked out beside the plugin.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from rdflib import Graph

from ontoink import recommend

SHAPE_RECOMMENDER = Path(__file__).resolve().parents[1] / "shape-recommender"
GRID = SHAPE_RECOMMENDER / "benchmarks" / "grid.yaml"

pytestmark = pytest.mark.skipif(
    not (SHAPE_RECOMMENDER / "data" / "gold").is_dir() or not GRID.is_file(),
    reason="sibling shape-recommender project not present",
)


def _load_grid() -> dict:
    """Read the benchmark set from the research project's own config.

    Hard-coding the list here would silently keep testing datasets the project
    has retired — it dropped `wd-q-subset` for `wd-humans` and
    `dbpedia-scientists`, and a stale list would have gone on reporting the
    old one as covered.
    """
    import yaml

    cfg = yaml.safe_load(GRID.read_text(encoding="utf-8"))
    out = {}
    for ds in cfg.get("datasets", []):
        name, data, gold = ds.get("name"), ds.get("data"), ds.get("gold")
        if not (name and data and gold):
            continue
        if not (SHAPE_RECOMMENDER / data).is_file():
            continue
        if not (SHAPE_RECOMMENDER / gold).is_file():
            continue
        out[name] = (data, ds.get("ontology"), gold)
    return out


BENCHMARKS = _load_grid() if GRID.is_file() else {}
DATASETS = sorted(BENCHMARKS)


def _load(rel: str) -> Graph:
    g = Graph()
    g.parse(str(SHAPE_RECOMMENDER / rel), format="turtle")
    return g


def _score(predicted_keys, gold_keys) -> dict:
    tp = len(predicted_keys & gold_keys)
    fp = len(predicted_keys - gold_keys)
    fn = len(gold_keys - predicted_keys)
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = (2 * precision * recall) / (precision + recall) if precision + recall else 0.0
    return {"tp": tp, "fp": fp, "fn": fn, "precision": round(precision, 4),
            "recall": round(recall, 4), "f1": round(f1, 4)}


@pytest.fixture(scope="module")
def reference():
    """The research package, importable from its own src/ tree."""
    src = str(SHAPE_RECOMMENDER / "src")
    if src not in sys.path:
        sys.path.insert(0, src)
    try:
        from shaperec.core.types import BenchmarkSpec
        from shaperec.methods.baseline_2018 import Baseline2018
    except Exception as exc:  # pragma: no cover - environment dependent
        pytest.skip(f"shaperec not importable: {exc}")
    return {"Baseline2018": Baseline2018, "BenchmarkSpec": BenchmarkSpec}


@pytest.fixture(scope="module")
def gold_sets():
    return {
        name: recommend.load_shape_set(_load(gold)).keys()
        for name, (_, _, gold) in BENCHMARKS.items()
    }


def test_the_benchmark_suite_was_discovered():
    assert BENCHMARKS, "grid.yaml declared no usable datasets"


# ── port fidelity: identical output to the reference implementation ────────

@pytest.mark.parametrize("dataset", DATASETS)
def test_baseline_matches_the_reference_implementation(dataset, reference):
    """Same graph, same algorithm, same constraint set — or the port drifted."""
    data_rel, _, gold_rel = BENCHMARKS[dataset]
    graph = _load(data_rel)

    spec = reference["BenchmarkSpec"](
        name=dataset,
        data_path=SHAPE_RECOMMENDER / data_rel,
        gold_path=SHAPE_RECOMMENDER / gold_rel,
    )
    theirs = reference["Baseline2018"]().induce(graph, spec).keys()
    ours = recommend.induce(graph, method="baseline").keys()

    assert ours == theirs, (
        f"{dataset}: only in ontoink: {sorted(ours - theirs)[:5]}; "
        f"only in shaperec: {sorted(theirs - ours)[:5]}"
    )


@pytest.mark.parametrize("dataset", DATASETS)
def test_baseline_threshold_is_actually_honoured(dataset):
    """Lowering the coverage threshold must not *reduce* what is proposed.

    Guards the hyperparameter plumbing: a knob that silently fails to reach the
    method is worse than no knob, because the UI reports a value that did
    nothing.
    """
    graph = _load(BENCHMARKS[dataset][0])
    strict = recommend.induce(graph, method="baseline",
                              params={"min_count_threshold": 1.0}).keys()
    loose = recommend.induce(graph, method="baseline",
                             params={"min_count_threshold": 0.1}).keys()
    assert loose >= strict, f"{dataset}: a lower threshold dropped constraints"


# ── properties that survive a gold revision ───────────────────────────────

@pytest.mark.parametrize("dataset", DATASETS)
def test_baseline_finds_most_of_the_gold(dataset, gold_sets):
    """Recall is the property this method is chosen for; 0.4 is a floor, not a target."""
    graph = _load(BENCHMARKS[dataset][0])
    got = _score(recommend.induce(graph, method="baseline").keys(), gold_sets[dataset])
    assert got["recall"] >= 0.4, f"{dataset}: baseline recall collapsed to {got['recall']}"


@pytest.mark.parametrize("dataset", DATASETS)
def test_auto_recall_is_never_worse_than_baseline(dataset, gold_sets):
    """`auto` merges both methods, so it may trade precision away — never recall."""
    data_rel, onto_rel, _ = BENCHMARKS[dataset]
    graph = _load(data_rel)
    if onto_rel and (SHAPE_RECOMMENDER / onto_rel).is_file():
        for triple in _load(onto_rel):
            graph.add(triple)

    base = _score(recommend.induce(_load(data_rel), method="baseline").keys(),
                  gold_sets[dataset])
    auto = _score(recommend.induce(graph, method="auto").keys(), gold_sets[dataset])
    assert auto["recall"] >= base["recall"], (
        f"{dataset}: auto recall {auto['recall']} < baseline {base['recall']}"
    )


# ── sheXer, when its optional library is installed ─────────────────────────

@pytest.mark.skipif(not recommend.shexer_available(), reason="sheXer not installed")
@pytest.mark.parametrize("dataset", DATASETS)
def test_shexer_runs_and_contributes(dataset, gold_sets):
    """The point of shipping sheXer is the kinds the other methods never emit."""
    graph = _load(BENCHMARKS[dataset][0])
    predicted = recommend.induce(graph, method="shexer")
    assert len(predicted), f"{dataset}: sheXer produced nothing"

    got = _score(predicted.keys(), gold_sets[dataset])
    assert got["recall"] >= 0.4, f"{dataset}: sheXer recall {got['recall']}"

    methods = {c.method for c in predicted.all_constraints()}
    assert methods == {"shexer"}, f"provenance not recorded: {methods}"


@pytest.mark.skipif(not recommend.shexer_available(), reason="sheXer not installed")
def test_shexer_acceptance_threshold_reaches_the_library():
    """A threshold of 1.0 must not propose more than a threshold of 0."""
    graph = _load(BENCHMARKS[DATASETS[0]][0])
    loose = recommend.induce(graph, method="shexer",
                             params={"acceptance_threshold": 0.0}).keys()
    strict = recommend.induce(graph, method="shexer",
                              params={"acceptance_threshold": 1.0}).keys()
    assert len(strict) <= len(loose)
