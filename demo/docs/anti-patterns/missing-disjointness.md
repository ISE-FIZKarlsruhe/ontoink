# OOPS! P10 -- sibling subclasses with no disjointness

> Two classes share a parent but no `owl:disjointWith` axiom links them. A reasoner cannot prove that an instance of one cannot be an instance of the other -- which is almost always what the modeller intended.

| Severity | Source |
|----------|--------|
| `warning` | [https://oops.linkeddata.es/catalogue.jsp](https://oops.linkeddata.es/catalogue.jsp) |

## Example

The graph below contains the smallest TTL that exhibits the anti-pattern.
Click any **node** or **edge** to inspect it, and use **Edit & Validate** to
modify the data live.

```ontoink
source: anti-pattern-shapes/missing-disjointness/data.ttl
shape:  anti-pattern-shapes/missing-disjointness/shape.ttl
height: 420px
legend: true
```

## SHACL shape

The detector is a single `sh:NodeShape` plus a `sh:sparql` (or
`sh:property`) constraint. Run it locally with:

```bash
pyshacl -s demo/docs/anti-pattern-shapes/missing-disjointness/shape.ttl \
        -d demo/docs/anti-pattern-shapes/missing-disjointness/data.ttl \
        -f human
```

The same shape ships inside the bundled
[`shacl-shapes.ttl`](shacl-shapes.ttl) catalogue, alongside all 18
anti-pattern shapes.

## Reference

- OOPS! P10 -- sibling subclasses with no disjointness -- [https://oops.linkeddata.es/catalogue.jsp](https://oops.linkeddata.es/catalogue.jsp)
- See [the full anti-pattern catalogue](../anti-patterns.md) for the
  related entries and the cross-paper provenance table.
