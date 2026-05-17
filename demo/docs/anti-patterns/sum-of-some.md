# SOS (Corcho/Roussey) -- sum of some

> Two existential restrictions on the same property, with disjoint fillers, force the class to have at least two distinct values on `R` simultaneously. The class is satisfiable but the modeller usually meant a disjunction.

| Severity | Source |
|----------|--------|
| `warning` | [https://liris.cnrs.fr/Documents/Liris-4441.pdf](https://liris.cnrs.fr/Documents/Liris-4441.pdf) |

## Example

The graph below contains the smallest TTL that exhibits the anti-pattern.
Click any **node** or **edge** to inspect it, and use **Edit & Validate** to
modify the data live.

```ontoink
source: anti-pattern-shapes/sum-of-some/data.ttl
shape:  anti-pattern-shapes/sum-of-some/shape.ttl
height: 420px
legend: true
```

## SHACL shape

The detector is a single `sh:NodeShape` plus a `sh:sparql` (or
`sh:property`) constraint. Run it locally with:

```bash
pyshacl -s demo/docs/anti-pattern-shapes/sum-of-some/shape.ttl \
        -d demo/docs/anti-pattern-shapes/sum-of-some/data.ttl \
        -f human
```

The same shape ships inside the bundled
[`shacl-shapes.ttl`](shacl-shapes.ttl) catalogue, alongside all 18
anti-pattern shapes.

## Reference

- SOS (Corcho/Roussey) -- sum of some -- [https://liris.cnrs.fr/Documents/Liris-4441.pdf](https://liris.cnrs.fr/Documents/Liris-4441.pdf)
- See [the full anti-pattern catalogue](../anti-patterns.md) for the
  related entries and the cross-paper provenance table.
