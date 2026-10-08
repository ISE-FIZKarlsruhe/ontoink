## OntoInk 0.7.9

One fix. A property drawn as a node was labelled an individual.

### Fixed — object and datatype properties were drawn as individuals

**Reported against the componency content pattern:** all four of its object properties — `has
component`, `is component of`, `hasPart`, `isPartOf` — appeared in the graph as individuals,
while being declared `rdf:type owl:ObjectProperty` three lines above them in the same file. The
pattern was correct; the visualisation was not.

The node-type decision was a two-way branch, written out at four separate call sites in
`ttl_parser.py`:

```python
node_type = "Class" if iri in classes else "Individual"
```

which is only correct for an ontology with no properties in it. A property that carries
statements of its own — `rdfs:domain`, `rdfs:range`, `rdfs:subPropertyOf` — becomes a node like
anything else, is not a member of `classes`, and so fell through to `"Individual"`. Nothing was
missing from the data: `_detect_property_types` had already collected both the object-property
and datatype-property sets, and the four callers simply did not consult them.

There is now one `_node_kind()` helper used at all four sites, and two new entries in
`NODE_STYLES` so a property has a shape and a colour of its own (a hexagon; blue for object,
green for datatype). A class still wins over a property when an IRI is somehow both, because
`classes` is also what the subclass edges are built from — typing such a node as a property
would draw a hierarchy between nodes not shown as classes.

**Scale, measured over the 163 ontology design patterns in the OntoBoard pattern library:**
1085 nodes across 147 of the 163 were affected — 997 object properties and 88 datatype
properties. `Individual` drops from 1657 nodes to 572. Class counts are unchanged by
construction, since the new helper tests `classes` first.

### Tests

`tests/test_property_node_types.py`, six cases: the reported shape reduced to its two
properties, a datatype property, a real individual still being an individual (the thing the old
branch got right), a punned IRI still drawn as a class, both property kinds having a style, and
an undeclared predicate *not* being promoted — guessing from use would type `:knows` as a
property on the strength of appearing in the predicate position, which is true of `rdfs:label`
too.

Full suite: 320 passed, 4 skipped.
