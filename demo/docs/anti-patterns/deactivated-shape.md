# SHACL -- deactivated / vacuous shape

> `sh:deactivated true` switches a shape off entirely. Handy during debugging, but easy to forget and ship a validation suite that no longer runs.

| Severity | Source |
|----------|--------|
| `info` | [https://www.w3.org/TR/shacl/#deactivated](https://www.w3.org/TR/shacl/#deactivated) |

## Example

The graph below contains the smallest TTL that exhibits the anti-pattern.
Click any **node** or **edge** to inspect it, and use **Edit & Validate** to
modify the data live.

```ontoink
source: anti-pattern-shapes/deactivated-shape/data.ttl
shape:  anti-pattern-shapes/deactivated-shape/shape.ttl
height: 420px
legend: true
```

## SHACL shape

The detector is a single `sh:NodeShape` plus a `sh:sparql` (or
`sh:property`) constraint. Run it locally with:

```bash
pyshacl -s demo/docs/anti-pattern-shapes/deactivated-shape/shape.ttl \
        -d demo/docs/anti-pattern-shapes/deactivated-shape/data.ttl \
        -f human
```

The same shape ships inside the bundled
[`shacl-shapes.ttl`](shacl-shapes.ttl) catalogue, alongside all 18
anti-pattern shapes.

## Reference

- SHACL -- deactivated / vacuous shape -- [https://www.w3.org/TR/shacl/#deactivated](https://www.w3.org/TR/shacl/#deactivated)
- See [the full anti-pattern catalogue](../anti-patterns.md) for the
  related entries and the cross-paper provenance table.
