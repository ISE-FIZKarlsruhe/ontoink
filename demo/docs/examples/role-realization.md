# BFO Role Realization

A role ([BFO_0000023](http://purl.obolibrary.org/obo/BFO_0000023)) must be realized in at least one process via `bfo:realized_in`.

```ontoink
source: shapes/role-realization/shape-data.ttl
shape: shapes/role-realization/shape.ttl
height: 500px
```

## About This Example

This is a simpler variant of the [Role Bearer](role-bearer.md) example — it only constrains the `realized_in` relation, without requiring `role_of`.

## Try It

Click **Edit & Validate** to open the editor. Try removing the `bfo:realized_in` triple and validate to see the SHACL violation.
