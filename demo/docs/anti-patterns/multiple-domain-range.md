# OOPS! P19 -- multiple `rdfs:domain` axioms

> A property carries more than one `rdfs:domain` axiom. OWL semantics interpret these as an *intersection*, not a *union*, so the property's effective domain becomes the (often empty) overlap of the listed classes.

| Severity | Source |
|----------|--------|
| `error` | [https://oops.linkeddata.es/catalogue.jsp](https://oops.linkeddata.es/catalogue.jsp) |

## Example

The graph below contains the smallest TTL that exhibits the anti-pattern.
Click any **node** or **edge** to inspect it, and use **Edit & Validate** to
modify the data live.

```ontoink
source: anti-pattern-shapes/multiple-domain-range/data.ttl
shape:  anti-pattern-shapes/multiple-domain-range/shape.ttl
height: 420px
legend: true
```

## SHACL shape

The detector is a single `sh:NodeShape` plus a `sh:sparql` (or
`sh:property`) constraint. Run it locally with:

```bash
pyshacl -s demo/docs/anti-pattern-shapes/multiple-domain-range/shape.ttl \
        -d demo/docs/anti-pattern-shapes/multiple-domain-range/data.ttl \
        -f human
```

The same shape ships inside the bundled
[`shacl-shapes.ttl`](shacl-shapes.ttl) catalogue, alongside all 18
anti-pattern shapes.

## Reference

- OOPS! P19 -- multiple `rdfs:domain` axioms -- [https://oops.linkeddata.es/catalogue.jsp](https://oops.linkeddata.es/catalogue.jsp)
- See [the full anti-pattern catalogue](../anti-patterns.md) for the
  related entries and the cross-paper provenance table.
