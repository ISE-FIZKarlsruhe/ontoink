# AIO (Corcho/Roussey) -- intersection used for union

> Two existential restrictions on the same property, whose fillers are explicitly disjoint, force every instance to have two distinct values simultaneously. The class is satisfiable, but the modeller almost always intended a disjunction `exists R.(A union B)` rather than an intersection of existentials.

| Severity | Source |
|----------|--------|
| `warning` | [https://liris.cnrs.fr/Documents/Liris-4441.pdf](https://liris.cnrs.fr/Documents/Liris-4441.pdf) |

## Example

The graph below contains the smallest TTL that exhibits the anti-pattern.
Click any **node** or **edge** to inspect it, and use **Edit & Validate** to
modify the data live.

```ontoink
source: anti-pattern-shapes/and-is-or/data.ttl
shape:  anti-pattern-shapes/and-is-or/shape.ttl
height: 420px
legend: true
```

## SHACL shape

The detector is a single `sh:NodeShape` plus a `sh:sparql` (or
`sh:property`) constraint. Run it locally with:

```bash
pyshacl -s demo/docs/anti-pattern-shapes/and-is-or/shape.ttl \
        -d demo/docs/anti-pattern-shapes/and-is-or/data.ttl \
        -f human
```

The same shape ships inside the bundled
[`shacl-shapes.ttl`](shacl-shapes.ttl) catalogue, alongside all 18
anti-pattern shapes.

## Reference

- AIO (Corcho/Roussey) -- intersection used for union -- [https://liris.cnrs.fr/Documents/Liris-4441.pdf](https://liris.cnrs.fr/Documents/Liris-4441.pdf)
- See [the full anti-pattern catalogue](../anti-patterns.md) for the
  related entries and the cross-paper provenance table.
