# OOPS! P03 -- `is` used as a property name

> A property named `is`, `isa`, or `is_a` duplicates the built-in `rdfs:subClassOf` / `rdf:type` / `owl:sameAs` relations and forces readers to guess which one was meant.

| Severity | Source |
|----------|--------|
| `error` | [https://oops.linkeddata.es/catalogue.jsp](https://oops.linkeddata.es/catalogue.jsp) |

## Example

The graph below contains the smallest TTL that exhibits the anti-pattern.
Click any **node** or **edge** to inspect it, and use **Edit & Validate** to
modify the data live.

```ontoink
source: anti-pattern-shapes/is-relationship/data.ttl
shape:  anti-pattern-shapes/is-relationship/shape.ttl
height: 420px
legend: true
```

## SHACL shape

The detector is a single `sh:NodeShape` plus a `sh:sparql` (or
`sh:property`) constraint. Run it locally with:

```bash
pyshacl -s demo/docs/anti-pattern-shapes/is-relationship/shape.ttl \
        -d demo/docs/anti-pattern-shapes/is-relationship/data.ttl \
        -f human
```

The same shape ships inside the bundled
[`shacl-shapes.ttl`](shacl-shapes.ttl) catalogue, alongside all 18
anti-pattern shapes.

## Reference

- OOPS! P03 -- `is` used as a property name -- [https://oops.linkeddata.es/catalogue.jsp](https://oops.linkeddata.es/catalogue.jsp)
- See [the full anti-pattern catalogue](../anti-patterns.md) for the
  related entries and the cross-paper provenance table.
