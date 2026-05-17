# SOSINETO (Corcho/Roussey) -- SOS combined with maxCardinality 1

> Two existential restrictions on disjoint fillers plus `owl:maxCardinality 1` on the same property -- the existentials demand two distinct values while the cardinality forbids more than one.

| Severity | Source |
|----------|--------|
| `error` | [https://liris.cnrs.fr/Documents/Liris-4441.pdf](https://liris.cnrs.fr/Documents/Liris-4441.pdf) |

## Example

The graph below contains the smallest TTL that exhibits the anti-pattern.
Click any **node** or **edge** to inspect it, and use **Edit & Validate** to
modify the data live.

```ontoink
source: anti-pattern-shapes/sum-of-some-is-never-equal-to-one/data.ttl
shape:  anti-pattern-shapes/sum-of-some-is-never-equal-to-one/shape.ttl
height: 420px
legend: true
```

## SHACL shape

The detector is a single `sh:NodeShape` plus a `sh:sparql` (or
`sh:property`) constraint. Run it locally with:

```bash
pyshacl -s demo/docs/anti-pattern-shapes/sum-of-some-is-never-equal-to-one/shape.ttl \
        -d demo/docs/anti-pattern-shapes/sum-of-some-is-never-equal-to-one/data.ttl \
        -f human
```

The same shape ships inside the bundled
[`shacl-shapes.ttl`](shacl-shapes.ttl) catalogue, alongside all 18
anti-pattern shapes.

## Reference

- SOSINETO (Corcho/Roussey) -- SOS combined with maxCardinality 1 -- [https://liris.cnrs.fr/Documents/Liris-4441.pdf](https://liris.cnrs.fr/Documents/Liris-4441.pdf)
- See [the full anti-pattern catalogue](../anti-patterns.md) for the
  related entries and the cross-paper provenance table.
