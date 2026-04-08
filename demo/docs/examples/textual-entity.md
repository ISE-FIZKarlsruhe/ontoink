# IAO Textual Entity

A textual entity ([IAO_0000300](http://purl.obolibrary.org/obo/IAO_0000300)) must always be about something via `iao:is_about`.

```ontoink
source: shapes/textual-entity/shape-data.ttl
shape: shapes/textual-entity/shape.ttl
height: 500px
```

## About This Example

This example uses the [Information Artifact Ontology (IAO)](http://www.obofoundry.org/ontology/iao.html) to model a publication that references a dataset. The SHACL constraint ensures every textual entity has at least one `is_about` relation.

## Try It

Click **Edit & Validate** and try removing the `iao:is_about` triple to trigger a constraint violation.
