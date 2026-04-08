# Schema.org Scholarly Article

A [Schema.org](https://schema.org/) ScholarlyArticle must have a name, at least one author, and exactly one publication date.

```ontoink
source: shapes/schema-article/shape-data.ttl
shape: shapes/schema-article/shape.ttl
height: 550px
```

## About This Example

This example uses Schema.org vocabulary to model a scholarly article with SHACL constraints:

| Property                | Constraint | Meaning                                     |
|:------------------------|:-----------|:--------------------------------------------|
| `schema:name`           | `[1..*]`   | Every article must have at least one title   |
| `schema:author`         | `[1..*]`   | At least one author is required              |
| `schema:datePublished`  | `[1..1]`   | Exactly one publication date                 |

## Try It

1. Click **Edit & Validate** to open the inline editor
2. Try removing `schema:author` or `schema:datePublished` and click **Validate** to see constraint violations
3. Click any edge to inspect the property details and cardinality
4. Use **Edit Layout** to customize the visual appearance
