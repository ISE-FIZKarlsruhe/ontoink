# DOC (Corcho/Roussey) -- complementOf used for disjointWith

> `owl:complementOf` is stronger than `owl:disjointWith`: it claims the class is *exactly* the set of individuals not in the other. For the common case of "these two sets do not overlap", prefer `owl:disjointWith`.

| Severity | Source |
|----------|--------|
| `info` | [https://liris.cnrs.fr/Documents/Liris-4441.pdf](https://liris.cnrs.fr/Documents/Liris-4441.pdf) |

## Example

The graph below contains the smallest TTL that exhibits the anti-pattern.
Click any **node** or **edge** to inspect it, and use **Edit & Validate** to
modify the data live.

```ontoink
source: anti-pattern-shapes/disjointness-of-complement/data.ttl
shape:  anti-pattern-shapes/disjointness-of-complement/shape.ttl
height: 420px
legend: true
```

## SHACL shape

The detector is a single `sh:NodeShape` plus a `sh:sparql` (or
`sh:property`) constraint. Run it locally with:

```bash
pyshacl -s demo/docs/anti-pattern-shapes/disjointness-of-complement/shape.ttl \
        -d demo/docs/anti-pattern-shapes/disjointness-of-complement/data.ttl \
        -f human
```

The same shape ships inside the bundled
[`shacl-shapes.ttl`](shacl-shapes.ttl) catalogue, alongside all 18
anti-pattern shapes.

## Reference

- DOC (Corcho/Roussey) -- complementOf used for disjointWith -- [https://liris.cnrs.fr/Documents/Liris-4441.pdf](https://liris.cnrs.fr/Documents/Liris-4441.pdf)
- See [the full anti-pattern catalogue](../anti-patterns.md) for the
  related entries and the cross-paper provenance table.
