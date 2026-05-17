# SMALO (Corcho/Roussey) -- redundant minCardinality 1 + someValuesFrom

> `owl:minCardinality 1` is redundant next to an `owl:someValuesFrom` on the same property -- the existential already entails *at least one*.

| Severity | Source |
|----------|--------|
| `info` | [https://liris.cnrs.fr/Documents/Liris-4441.pdf](https://liris.cnrs.fr/Documents/Liris-4441.pdf) |

## Example

The graph below contains the smallest TTL that exhibits the anti-pattern.
Click any **node** or **edge** to inspect it, and use **Edit & Validate** to
modify the data live.

```ontoink
source: anti-pattern-shapes/some-means-at-least-one/data.ttl
shape:  anti-pattern-shapes/some-means-at-least-one/shape.ttl
height: 420px
legend: true
```

## SHACL shape

The detector is a single `sh:NodeShape` plus a `sh:sparql` (or
`sh:property`) constraint. Run it locally with:

```bash
pyshacl -s demo/docs/anti-pattern-shapes/some-means-at-least-one/shape.ttl \
        -d demo/docs/anti-pattern-shapes/some-means-at-least-one/data.ttl \
        -f human
```

The same shape ships inside the bundled
[`shacl-shapes.ttl`](shacl-shapes.ttl) catalogue, alongside all 18
anti-pattern shapes.

## Reference

- SMALO (Corcho/Roussey) -- redundant minCardinality 1 + someValuesFrom -- [https://liris.cnrs.fr/Documents/Liris-4441.pdf](https://liris.cnrs.fr/Documents/Liris-4441.pdf)
- See [the full anti-pattern catalogue](../anti-patterns.md) for the
  related entries and the cross-paper provenance table.
