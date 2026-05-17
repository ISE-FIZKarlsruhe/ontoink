# OIL (Corcho/Roussey) -- onlyness is loneliness

> Two universal restrictions on the same property point at disjoint fillers. The two `allValuesFrom` axioms reduce to `allValuesFrom owl:Nothing`, forcing the property to be empty on every instance of the class.

| Severity | Source |
|----------|--------|
| `error` | [https://liris.cnrs.fr/Documents/Liris-4441.pdf](https://liris.cnrs.fr/Documents/Liris-4441.pdf) |

## Example

The graph below contains the smallest TTL that exhibits the anti-pattern.
Click any **node** or **edge** to inspect it, and use **Edit & Validate** to
modify the data live.

```ontoink
source: anti-pattern-shapes/onlyness-is-loneliness/data.ttl
shape:  anti-pattern-shapes/onlyness-is-loneliness/shape.ttl
height: 420px
legend: true
```

## SHACL shape

The detector is a single `sh:NodeShape` plus a `sh:sparql` (or
`sh:property`) constraint. Run it locally with:

```bash
pyshacl -s demo/docs/anti-pattern-shapes/onlyness-is-loneliness/shape.ttl \
        -d demo/docs/anti-pattern-shapes/onlyness-is-loneliness/data.ttl \
        -f human
```

The same shape ships inside the bundled
[`shacl-shapes.ttl`](shacl-shapes.ttl) catalogue, alongside all 18
anti-pattern shapes.

## Reference

- OIL (Corcho/Roussey) -- onlyness is loneliness -- [https://liris.cnrs.fr/Documents/Liris-4441.pdf](https://liris.cnrs.fr/Documents/Liris-4441.pdf)
- See [the full anti-pattern catalogue](../anti-patterns.md) for the
  related entries and the cross-paper provenance table.
