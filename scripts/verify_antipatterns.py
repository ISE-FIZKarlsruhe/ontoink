"""Smoke-test every per-pattern shape against its data.

For each demo/docs/anti-pattern-shapes/<slug>/, run pyshacl with
shape.ttl as the SHACL graph and data.ttl as the data graph. Report
whether the example *actually* triggers the detector (conforms=False).

A passing run prints `slug: TRIGGERS (conforms=False)` for every pattern.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pyshacl
from rdflib import Graph

REPO = Path(__file__).resolve().parents[1]
SHAPES_DIR = REPO / "demo" / "docs" / "anti-pattern-shapes"


def main() -> int:
    fail = 0
    for slug_dir in sorted(SHAPES_DIR.iterdir()):
        if not slug_dir.is_dir():
            continue
        slug = slug_dir.name
        shape_path = slug_dir / "shape.ttl"
        data_path = slug_dir / "data.ttl"
        sg = Graph()
        sg.parse(str(shape_path), format="turtle")
        dg = Graph()
        dg.parse(str(data_path), format="turtle")
        conforms, _, report_text = pyshacl.validate(
            data_graph=dg,
            shacl_graph=sg,
            advanced=True,
            inference="rdfs",
        )
        # pyshacl uses two header strings depending on context:
        #   "Constraint Violation in ..."  (bundle / Violation severity)
        #   "Validation Result in ..."     (single-shape / Info|Warning severity)
        n_violations = (
            report_text.count("Constraint Violation in ")
            + report_text.count("Validation Result in ")
        )
        status = "TRIGGERS" if not conforms else "MISSES"
        print(f"{slug:42s} {status:9s} conforms={conforms} violations={n_violations}")
        if conforms:
            fail += 1
    return fail


if __name__ == "__main__":
    sys.exit(main())
