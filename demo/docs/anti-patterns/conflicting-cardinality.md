# SHACL -- conflicting min/max cardinality

> A property shape declares `sh:minCount > sh:maxCount`. The shape is unsatisfiable and silently passes only because no node ever matches.

| Severity | Source |
|----------|--------|
| `error` | [https://arxiv.org/abs/2406.08018](https://arxiv.org/abs/2406.08018) |

## Example

The graph below contains the smallest TTL that exhibits the anti-pattern.
Click any **node** or **edge** to inspect it, and use **Edit & Validate** to
modify the data live.

```ontoink
source: anti-pattern-shapes/conflicting-cardinality/data.ttl
shape:  anti-pattern-shapes/conflicting-cardinality/shape.ttl
height: 420px
legend: true
```

## SHACL shape

The detector is a single `sh:NodeShape` plus a `sh:sparql` (or
`sh:property`) constraint. Run it locally with:

```bash
pyshacl -s demo/docs/anti-pattern-shapes/conflicting-cardinality/shape.ttl \
        -d demo/docs/anti-pattern-shapes/conflicting-cardinality/data.ttl \
        -f human
```

The same shape ships inside the bundled
[`shacl-shapes.ttl`](shacl-shapes.ttl) catalogue, alongside all 18
anti-pattern shapes.

## Reference

- SHACL -- conflicting min/max cardinality -- [https://arxiv.org/abs/2406.08018](https://arxiv.org/abs/2406.08018)
- See [the full anti-pattern catalogue](../anti-patterns.md) for the
  related entries and the cross-paper provenance table.
