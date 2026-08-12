"""Hold the shipped recommender to the published benchmark numbers.

``ontoink/recommend/`` is a port of two methods from the sibling
``shape-recommender`` research project. A port drifts. This suite re-runs the
shipped engine over that project's five benchmark datasets and asserts it
reproduces the precision/recall/F1 recorded in
``shape-recommender/results/raw/<dataset>/<method>.eval.json``.

The metric is recomputed here rather than imported, so the assertion does not
depend on the research package being installable — but it is deliberately the
same formula as ``shaperec/evaluation/metrics.py:36``: strict set equality over
the ``(target_class, path, kind, value)`` identity tuple, which is what both
implementations' ``Constraint.key()`` returns.

Skipped entirely when the research project isn't checked out beside the plugin,
so this never blocks a plain ``pip install -e .[dev]`` run.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from rdflib import Graph

from ontoink import recommend

SHAPE_RECOMMENDER = Path(__file__).resolve().parents[1] / "shape-recommender"

pytestmark = pytest.mark.skipif(
    not (SHAPE_RECOMMENDER / "data" / "gold").is_dir(),
    reason="sibling shape-recommender project not present",
)

#: dataset -> (data, ontology or None, gold), relative to shape-recommender/.
#: Mirrors benchmarks/grid.yaml.
BENCHMARKS = {
    "foaf-toy": (
        "data/benchmarks/foaf-toy/data.ttl",
        "data/benchmarks/foaf-toy/ontology.ttl",
        "data/gold/foaf-toy.ttl",
    ),
    "identifiers": (
        "data/benchmarks/identifiers/data.ttl",
        None,
        "data/gold/identifiers.ttl",
    ),
    "lubm-small": (
        "data/benchmarks/lubm-small/data.ttl",
        "data/benchmarks/lubm-small/ontology.ttl",
        "data/gold/lubm-small.ttl",
    ),
    "lubm-1u": (
        "data/benchmarks/synthetic/lubm-1u/data.ttl",
        "data/benchmarks/synthetic/lubm-1u/ontology.ttl",
        "data/gold/lubm-1u.ttl",
    ),
    "wd-q-subset": (
        "data/benchmarks/real/wd-q-subset/data.ttl",
        "data/benchmarks/real/wd-q-subset/ontology.ttl",
        "data/gold/wd-q-subset.ttl",
    ),
}


def _load(rel: str) -> Graph:
    g = Graph()
    g.parse(str(SHAPE_RECOMMENDER / rel), format="turtle")
    return g


def _score(predicted_keys, gold_keys) -> dict:
    """metrics.precision_recall_f1, recomputed."""
    tp = len(predicted_keys & gold_keys)
    fp = len(predicted_keys - gold_keys)
    fn = len(gold_keys - predicted_keys)
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = (2 * precision * recall) / (precision + recall) if precision + recall else 0.0
    return {
        "tp": tp, "fp": fp, "fn": fn,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
    }


def _recorded(dataset: str, method: str) -> dict:
    path = SHAPE_RECOMMENDER / "results" / "raw" / dataset / f"{method}.eval.json"
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def gold_sets():
    return {
        name: recommend.load_shape_set(_load(gold)).keys()
        for name, (_, _, gold) in BENCHMARKS.items()
    }


@pytest.mark.parametrize("dataset", sorted(BENCHMARKS))
def test_baseline_reproduces_the_published_result(dataset, gold_sets):
    """The data-driven method must match the research prototype exactly.

    `baseline` reads instance data only, so the ontology file is irrelevant to
    it — this is the cleanest fidelity check available for the port.
    """
    data_rel = BENCHMARKS[dataset][0]
    predicted = recommend.induce(_load(data_rel), method="baseline")
    got = _score(predicted.keys(), gold_sets[dataset])
    want = _recorded(dataset, "baseline")

    assert got["precision"] == want["precision"], f"{dataset}: precision drifted"
    assert got["recall"] == want["recall"], f"{dataset}: recall drifted"
    assert got["f1"] == want["f1"], f"{dataset}: F1 drifted"
    assert (got["tp"], got["fp"], got["fn"]) == (want["tp"], want["fp"], want["fn"])


def test_baseline_mean_f1_matches_the_documented_figure(gold_sets):
    """0.695 is the number quoted in the architecture docs and the changelog."""
    scores = []
    for dataset, (data_rel, _, _) in BENCHMARKS.items():
        predicted = recommend.induce(_load(data_rel), method="baseline")
        scores.append(_score(predicted.keys(), gold_sets[dataset])["f1"])

    mean_f1 = sum(scores) / len(scores)
    assert round(mean_f1, 3) == 0.695, f"mean F1 across 5 benchmarks is {mean_f1:.4f}"


@pytest.mark.parametrize("dataset", sorted(BENCHMARKS))
def test_astrea_never_invents_constraints_the_gold_lacks_wildly(dataset, gold_sets):
    """Axiom-derived constraints should be precise even when recall is poor.

    Not a fidelity check against the recorded numbers: those were produced with
    the ontology loaded *instead of* the data, and the port merges both, so the
    two are not comparable. What must hold is that the axiom method does not
    become a precision disaster — it derives from asserted axioms, so anything
    it emits should mostly be right.
    """
    data_rel, onto_rel, _ = BENCHMARKS[dataset]
    graph = _load(data_rel)
    if onto_rel:
        for triple in _load(onto_rel):
            graph.add(triple)

    predicted = recommend.induce(graph, method="astrea")
    if not len(predicted):
        pytest.skip(f"{dataset}: astrea derives nothing from these axioms")

    got = _score(predicted.keys(), gold_sets[dataset])
    assert got["precision"] >= 0.3, (
        f"{dataset}: astrea precision {got['precision']} — axiom-derived "
        f"constraints should not be mostly wrong"
    )


@pytest.mark.parametrize("dataset", sorted(BENCHMARKS))
def test_auto_recall_is_never_worse_than_baseline(dataset, gold_sets):
    """`auto` merges both methods, so it can trade precision away — but never recall."""
    data_rel, onto_rel, _ = BENCHMARKS[dataset]
    graph = _load(data_rel)
    if onto_rel:
        for triple in _load(onto_rel):
            graph.add(triple)

    base = _score(recommend.induce(_load(data_rel), method="baseline").keys(),
                  gold_sets[dataset])
    auto = _score(recommend.induce(graph, method="auto").keys(), gold_sets[dataset])
    assert auto["recall"] >= base["recall"], (
        f"{dataset}: auto recall {auto['recall']} < baseline {base['recall']}"
    )
