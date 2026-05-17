# EID (Corcho/Roussey) -- equivalent yet disjoint

> Two classes are asserted both `owl:equivalentClass` and `owl:disjointWith`. The only model that satisfies both is the empty interpretation, so both classes collapse to `owl:Nothing`.

| Severity | Source |
|----------|--------|
| `error` | [https://liris.cnrs.fr/Documents/Liris-4441.pdf](https://liris.cnrs.fr/Documents/Liris-4441.pdf) |

## Example

The graph below contains the smallest TTL that exhibits the anti-pattern.
Click any **node** or **edge** to inspect it, and use **Edit & Validate** to
modify the data live.

```ontoink
source: anti-pattern-shapes/equivalence-is-difference/data.ttl
shape:  anti-pattern-shapes/equivalence-is-difference/shape.ttl
height: 420px
legend: true
```

## SHACL shape

The detector is a single `sh:NodeShape` plus a `sh:sparql` (or
`sh:property`) constraint. Run it locally with:

```bash
pyshacl -s demo/docs/anti-pattern-shapes/equivalence-is-difference/shape.ttl \
        -d demo/docs/anti-pattern-shapes/equivalence-is-difference/data.ttl \
        -f human
```

The same shape ships inside the bundled
[`shacl-shapes.ttl`](shacl-shapes.ttl) catalogue, alongside all 18
anti-pattern shapes.

## Reference

- EID (Corcho/Roussey) -- equivalent yet disjoint -- [https://liris.cnrs.fr/Documents/Liris-4441.pdf](https://liris.cnrs.fr/Documents/Liris-4441.pdf)
- See [the full anti-pattern catalogue](../anti-patterns.md) for the
  related entries and the cross-paper provenance table.
