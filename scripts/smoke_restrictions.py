"""Quick visual check that owl:Restriction edges are synthesized correctly."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8")
from ontoink.ttl_parser import parse_ttl_to_cytoscape

paths = [
    "demo/docs/anti-pattern-shapes/and-is-or/data.ttl",
    "demo/docs/anti-pattern-shapes/onlyness-is-loneliness/data.ttl",
    "demo/docs/anti-pattern-shapes/universal-existence/data.ttl",
    "demo/docs/anti-pattern-shapes/sum-of-some-is-never-equal-to-one/data.ttl",
    "demo/docs/anti-pattern-shapes/min-is-zero/data.ttl",
    "demo/docs/anti-pattern-shapes/some-means-at-least-one/data.ttl",
]
for p in paths:
    print(f"\n=== {p} ===")
    d = parse_ttl_to_cytoscape(p)
    r_edges = [e for e in d["edges"] if e["data"]["edgeType"] == "owl-restriction"]
    print(f"  total edges: {len(d['edges'])}, owl-restriction: {len(r_edges)}")
    for e in r_edges:
        dd = e["data"]
        src = dd["source"].split("/")[-1]
        tgt = dd["target"].split("/")[-1]
        print(f"    {dd['label']!r:30}  {src} -> {tgt}")
    isolated = [n for n in d["nodes"] if n["data"]["label"] in ("owl:Restriction", "Restriction")]
    if isolated:
        print(f"  WARNING: owl:Restriction leaked into nodes: {isolated}")
