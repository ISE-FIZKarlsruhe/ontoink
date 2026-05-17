# SHACL -- shape without target

> A `sh:NodeShape` has no `sh:targetClass`, `sh:targetNode`, `sh:targetSubjectsOf`, or `sh:targetObjectsOf`, so SHACL never applies it to anything.

| Severity | Source |
|----------|--------|
| `warning` | [https://ceur-ws.org/Vol-4064/UKG-paper3.pdf](https://ceur-ws.org/Vol-4064/UKG-paper3.pdf) |

## Example

The graph below contains the smallest TTL that exhibits the anti-pattern.
Click any **node** or **edge** to inspect it, and use **Edit & Validate** to
modify the data live.

```ontoink
source: anti-pattern-shapes/shape-without-target/data.ttl
shape:  anti-pattern-shapes/shape-without-target/shape.ttl
height: 420px
legend: true
```

## SHACL shape

The detector is a single `sh:NodeShape` plus a `sh:sparql` (or
`sh:property`) constraint. Run it locally with:

```bash
pyshacl -s demo/docs/anti-pattern-shapes/shape-without-target/shape.ttl \
        -d demo/docs/anti-pattern-shapes/shape-without-target/data.ttl \
        -f human
```

The same shape ships inside the bundled
[`shacl-shapes.ttl`](shacl-shapes.ttl) catalogue, alongside all 18
anti-pattern shapes.

## Reference

- SHACL -- shape without target -- [https://ceur-ws.org/Vol-4064/UKG-paper3.pdf](https://ceur-ws.org/Vol-4064/UKG-paper3.pdf)
- See [the full anti-pattern catalogue](../anti-patterns.md) for the
  related entries and the cross-paper provenance table.
