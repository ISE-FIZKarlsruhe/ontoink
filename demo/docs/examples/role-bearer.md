# Role Bearer Shape

A role (BFO_0000023) must always have a bearer via `ro:role_of` and be realized in a process via `bfo:realized_in`.

```ontoink
source: shapes/role-bearer/shape-data.ttl
shape: shapes/role-bearer/shape.ttl
```

## Constraint Details

| Property | Path | Min count | Meaning |
|----------|------|-----------|---------|
| role_of | `RO_0000081` | 1 | The role must belong to some entity |
| realized_in | `BFO_0000054` | 1 | The role must be realized in some process |
