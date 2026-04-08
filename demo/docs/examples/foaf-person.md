# FOAF Person

A [FOAF](http://xmlns.com/foaf/0.1/) Person must have a name and at most one mailbox.

```ontoink
source: shapes/foaf-person/shape-data.ttl
shape: shapes/foaf-person/shape.ttl
height: 500px
```

## About This Example

This example demonstrates two SHACL constraints on `foaf:Person`:

| Property       | Constraint   | Meaning                              |
|:---------------|:-------------|:-------------------------------------|
| `foaf:name`    | `[1..*]`     | Every person must have at least one name |
| `foaf:mbox`    | `[0..1]`     | A person may have at most one mailbox    |

The graph contains two individuals — **Alice** and **Bob** — both typed as `foaf:Person`, with Alice knowing Bob.

## Try It

1. Click any **node** to see its IRI, type, connections, and applicable SHACL constraints
2. Click any **edge** to see the property IRI, source/target, and cardinality
3. Click **Edit & Validate** to open the TTL editor
4. Try removing `foaf:name "Alice Smith"` from Alice and click **Validate** to see the SHACL violation
5. Click **Edit Layout** to change node shapes or edge styles
6. Export your customized diagram as **PNG** or **SVG**

!!! tip "Keyboard shortcuts"
    Use the mouse wheel to zoom, and drag the canvas to pan. You can also drag individual nodes to reposition them.
