"""Evaluate ontoink's shipped shape recommender against the research benchmarks.

Runs ``ontoink.recommend`` over the datasets in the sibling ``shape-recommender``
project and scores the output against its hand-authored gold SHACL shapes, using
the same metric as that project's evaluator: strict set equality over the
``(target_class, path, kind, value)`` identity tuple.

Why this exists separately from the research harness:

* It evaluates the code that actually ships in the plugin, not the prototype.
  The two differ deliberately — see the astrea note below.
* It records provenance. The research ``eval.json`` files store no timestamp,
  git revision or library versions, so their numbers cannot be attributed to a
  state of the code.
* It reports the *input mode*. The shipped fence hands the engine one merged
  graph, while the prototype fed each method a different file. That choice moves
  the numbers, so it is recorded rather than assumed.

It never writes into ``results/raw`` or ``results/tables`` — those are the
research prototype's record, and overwriting them would destroy the only copy.

Usage::

    python scripts/eval_recommender.py
    python scripts/eval_recommender.py --out some/dir --methods baseline,auto
"""

from __future__ import annotations

import argparse
import csv
import json
import platform
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO))

from rdflib import Graph  # noqa: E402

import ontoink  # noqa: E402
from ontoink import recommend  # noqa: E402

DEFAULT_SR = REPO / "shape-recommender"
DEFAULT_OUT = DEFAULT_SR / "results" / "ontoink-port"

#: dataset -> (data, ontology or None, gold). Mirrors benchmarks/grid.yaml.
BENCHMARKS = {
    "foaf-toy": ("data/benchmarks/foaf-toy/data.ttl",
                 "data/benchmarks/foaf-toy/ontology.ttl",
                 "data/gold/foaf-toy.ttl"),
    "lubm-small": ("data/benchmarks/lubm-small/data.ttl",
                   "data/benchmarks/lubm-small/ontology.ttl",
                   "data/gold/lubm-small.ttl"),
    "identifiers": ("data/benchmarks/identifiers/data.ttl",
                    None,
                    "data/gold/identifiers.ttl"),
    "lubm-1u": ("data/benchmarks/synthetic/lubm-1u/data.ttl",
                "data/benchmarks/synthetic/lubm-1u/ontology.ttl",
                "data/gold/lubm-1u.ttl"),
    "wd-q-subset": ("data/benchmarks/real/wd-q-subset/data.ttl",
                    "data/benchmarks/real/wd-q-subset/ontology.ttl",
                    "data/gold/wd-q-subset.ttl"),
}


def score(predicted_keys, gold_keys) -> dict:
    """The research evaluator's metric (shaperec/evaluation/metrics.py:36)."""
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
        "n_predicted": len(predicted_keys),
        "n_gold": len(gold_keys),
    }


def provenance() -> dict:
    """Everything needed to attribute a number to a state of the code."""
    try:
        sha = subprocess.run(
            ["git", "-C", str(REPO), "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True, timeout=10,
        ).stdout.strip() or None
        dirty = bool(subprocess.run(
            ["git", "-C", str(REPO), "status", "--porcelain"],
            capture_output=True, text=True, timeout=10,
        ).stdout.strip())
    except Exception:
        sha, dirty = None, None

    import rdflib
    return {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "ontoink": ontoink.__version__,
        "git_sha": sha,
        "git_dirty": dirty,
        "rdflib": rdflib.__version__,
        "python": platform.python_version(),
        "evaluator": "scripts/eval_recommender.py",
        "metric": "strict set equality over (target_class, path, kind, value)",
    }


def load(path: Path) -> Graph:
    g = Graph()
    g.parse(str(path), format="turtle")
    return g


def run(sr: Path, out: Path, methods: list[str]) -> dict:
    rows = []
    for dataset, (data_rel, onto_rel, gold_rel) in BENCHMARKS.items():
        data_path, gold_path = sr / data_rel, sr / gold_rel
        if not data_path.is_file() or not gold_path.is_file():
            print(f"  ! skipping {dataset}: missing data or gold")
            continue

        data_graph = load(data_path)
        gold_keys = recommend.load_shape_set(load(gold_path)).keys()

        merged = Graph()
        for triple in data_graph:
            merged.add(triple)
        has_ontology = bool(onto_rel and (sr / onto_rel).is_file())
        if has_ontology:
            for triple in load(sr / onto_rel):
                merged.add(triple)

        for method in methods:
            # `baseline` reads instance data only, so the ontology is noise for
            # it; the axiom-driven methods need it. Recording which graph each
            # method saw is the point — it is the largest single source of
            # variation between runs.
            use_merged = method != "baseline"
            graph = merged if use_merged else data_graph
            mode = ("data+ontology" if use_merged and has_ontology else "data-only")

            predicted = recommend.induce(graph, method=method)
            result = score(predicted.keys(), gold_keys)
            result.update(method=method, dataset=dataset, input_mode=mode,
                          n_triples=len(graph))
            rows.append(result)

            cell_dir = out / dataset
            cell_dir.mkdir(parents=True, exist_ok=True)
            (cell_dir / f"{method}.eval.json").write_text(
                json.dumps({**result, "provenance": provenance()}, indent=2),
                encoding="utf-8")
            (cell_dir / f"{method}.predicted.ttl").write_text(
                recommend.write_shape_set(predicted), encoding="utf-8")

    return {"provenance": provenance(), "results": rows}


def write_summary(out: Path, payload: dict) -> None:
    rows = payload["results"]
    fields = ["method", "dataset", "input_mode", "tp", "fp", "fn",
              "precision", "recall", "f1", "n_predicted", "n_gold", "n_triples"]
    with (out / "summary.csv").open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    (out / "summary.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--shape-recommender", type=Path, default=DEFAULT_SR,
                        help="path to the sibling research project")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT,
                        help="output directory (never results/raw)")
    parser.add_argument("--methods", default="baseline,astrea,auto",
                        help="comma-separated induction methods")
    args = parser.parse_args()

    sr: Path = args.shape_recommender
    if not (sr / "data" / "gold").is_dir():
        print(f"error: no benchmark data under {sr}", file=sys.stderr)
        print("The research project is gitignored, so a fresh clone will not "
              "have it. Check it out beside the plugin to run this.", file=sys.stderr)
        return 1

    resolved = sr.resolve()
    if "results" in args.out.parts and args.out.resolve().name in {"raw", "tables"}:
        print("error: refusing to write into the research project's own record",
              file=sys.stderr)
        return 1

    methods = [m.strip() for m in args.methods.split(",") if m.strip()]
    args.out.mkdir(parents=True, exist_ok=True)
    print(f"Evaluating ontoink {ontoink.__version__} against {resolved.name} "
          f"({len(BENCHMARKS)} datasets x {len(methods)} methods)")

    payload = run(sr, args.out, methods)
    write_summary(args.out, payload)

    by_method: dict[str, list[float]] = {}
    print(f"\n{'dataset':<14}{'method':<10}{'input':<16}"
          f"{'P':>7}{'R':>7}{'F1':>7}{'   pred/gold':>13}")
    print("-" * 74)
    for row in payload["results"]:
        by_method.setdefault(row["method"], []).append(row["f1"])
        print(f"{row['dataset']:<14}{row['method']:<10}{row['input_mode']:<16}"
              f"{row['precision']:>7.3f}{row['recall']:>7.3f}{row['f1']:>7.3f}"
              f"{'   ' + str(row['n_predicted']) + '/' + str(row['n_gold']):>13}")
    print("-" * 74)
    for method, scores in by_method.items():
        print(f"  mean F1 {method:<10} {sum(scores) / len(scores):.4f}")

    print(f"\nWrote {args.out}")
    if "shape-recommender" in str(args.out):
        print("NOTE: that directory is gitignored (.gitignore: 'shape-recommender/*'), "
              "so these results are not under version control.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
