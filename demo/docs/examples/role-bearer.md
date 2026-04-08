# BFO Role Bearer

A role ([BFO_0000023](http://purl.obolibrary.org/obo/BFO_0000023)) must always have a bearer via `ro:role_of` and be realized in a process via `bfo:realized_in`.

```ontoink
source: shapes/role-bearer/shape-data.ttl
shape: shapes/role-bearer/shape.ttl
height: 500px
```

## Constraint Details

| Property       | Path          | Constraint | Meaning                                         |
|:---------------|:--------------|:-----------|:------------------------------------------------|
| `role_of`      | `RO_0000081`  | `[1..*]`   | The role must belong to some entity              |
| `realized_in`  | `BFO_0000054` | `[1..*]`   | The role must be realized in some process         |

## Try It

This example uses the [Basic Formal Ontology (BFO)](https://basic-formal-ontology.org/) and the [Relation Ontology (RO)](http://www.obofoundry.org/ontology/ro.html). Click nodes and edges to explore the ontology structure, or edit the TTL to test constraint violations.
