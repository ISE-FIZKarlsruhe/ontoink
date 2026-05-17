"""Debug why _extract_owl_restrictions returns nothing for and-is-or."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8")
from rdflib import Graph
from rdflib.namespace import OWL, RDF, RDFS
from ontoink.ttl_parser import _extract_owl_restrictions

g = Graph()
g.parse("demo/docs/anti-pattern-shapes/and-is-or/data.ttl", format="turtle")
print(f"total triples: {len(g)}")

# How many subClassOf triples?
sc = list(g.triples((None, RDFS.subClassOf, None)))
print(f"\nrdfs:subClassOf triples: {len(sc)}")
for s, _, o in sc:
    print(f"  {s} -- subClassOf -- {o}  (s={type(s).__name__}, o={type(o).__name__})")

# How many owl:Restriction-typed bnodes?
restrictions = list(g.subjects(RDF.type, OWL.Restriction))
print(f"\nowl:Restriction subjects: {len(restrictions)}")
for r in restrictions:
    print(f"  {r}  (type={type(r).__name__})")
    for p, o in g.predicate_objects(r):
        print(f"    -- {p.split('#')[-1].split('/')[-1]} --> {o}")

print("\n_extract_owl_restrictions result:")
records = _extract_owl_restrictions(g)
print(f"  found {len(records)} records")
for r in records:
    print(f"  {r}")
