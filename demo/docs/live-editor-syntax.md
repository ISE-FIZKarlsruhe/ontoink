# Live Editor · Syntax Reference

The live editor accepts a compact, D2-inspired ontology DSL. Everything
below the "Basics" section is optional — the parser round-trips to Turtle
so any triple you can express in Turtle can be expressed here (usually
with fewer keystrokes).

## Auto-declared prefixes

You never need to declare these — they are always in scope:

| Prefix | IRI |
|--------|-----|
| `rdf:` | `http://www.w3.org/1999/02/22-rdf-syntax-ns#` |
| `rdfs:` | `http://www.w3.org/2000/01/rdf-schema#` |
| `owl:` | `http://www.w3.org/2002/07/owl#` |
| `xsd:` | `http://www.w3.org/2001/XMLSchema#` |
| `skos:` | `http://www.w3.org/2004/02/skos/core#` |
| `dc:` | `http://purl.org/dc/elements/1.1/` |
| `dct:` | `http://purl.org/dc/terms/` |
| `foaf:` | `http://xmlns.com/foaf/0.1/` |
| `ex:` | `http://example.org/` |

Add your own with `@prefix name: <IRI>`.

## Basics

### Simple triple

```
ex:apple -ex:hasColor-> "red"
```

Renders as: `ex:apple ex:hasColor "red" .`

### Shortcuts for common predicates

| Shortcut | Expands to |
|----------|------------|
| `-a->` | `-rdf:type->` |
| `-type->` | `-rdf:type->` |
| `-isa->` | `-rdfs:subClassOf->` |

```
ex:apple -a-> ex:Fruit
ex:Apple -isa-> ex:Fruit
```

### Multiple values

Comma-separate objects to emit N triples for the same subject/predicate:

```
ex:Tree -ex:hasFruit-> ex:apple, ex:orange, ex:banana
```

### Subject blocks

Share a subject across several predicates using `{ ... }`:

```
ex:Bush {
  -a-> owl:Class
  -rdfs:label-> "Berry Bush"
  -ex:habitat-> ex:Forest
}
```

## Literal forms

| Form | Example | Result |
|------|---------|--------|
| Plain string | `"hello"` | `"hello"` |
| Language-tagged | `"hello"@en` | `"hello"@en` |
| Typed literal | `"42"^^xsd:integer` | `"42"^^xsd:integer` |
| Integer shorthand | `42` | `"42"^^xsd:integer` |
| Decimal shorthand | `1.5` | `"1.5"^^xsd:decimal` |
| Boolean | `true` / `false` | `"true"^^xsd:boolean` |

## Term forms

| Kind | Syntax | Example |
|------|--------|---------|
| CURIE | `prefix:local` | `ex:apple` |
| Full IRI | `<IRI>` | `<http://example.org/apple>` |
| Blank node | `_:label` | `_:b1` |
| Bare local | `local` | `apple` &nbsp;⇒&nbsp; `ex:apple` |

## Error diagnostics

The editor shows line + column for every parse error in the red panel
below the DSL. Common cases:

- **`unterminated string literal`** — you forgot the closing `"`.
- **`unterminated <IRI>`** — you opened `<` without closing `>`.
- **`expected '->' to close predicate`** — the arrow is `-P->`, not `-P >` or `>P->`.
- **`expected '-<predicate>->' or '{' after subject`** — a subject
  needs either a triple or a block.
- **`block opened with '{' but never closed with '}'`** — one `}` per `{`.

## Turtle round-trip

The bottom pane shows the generated Turtle. Everything typed in the DSL
appears there in a canonical form — copy it into your project, or save
as `.ttl` / `.nt` from the toolbar.

## OWL restrictions

Parenthesised Manchester-style expressions that expand to `owl:Restriction`
axioms with a blank node:

| Syntax | Emitted axioms |
|--------|----------------|
| `(some ex:hasColor ex:Color)` | `owl:onProperty ex:hasColor` + `owl:someValuesFrom ex:Color` |
| `(only ex:hasSeed ex:Seed)` | `owl:onProperty ex:hasSeed` + `owl:allValuesFrom ex:Seed` |
| `(value ex:hasSize ex:Medium)` | `owl:onProperty ex:hasSize` + `owl:hasValue ex:Medium` |
| `(min 1 ex:hasSeed)` | `owl:onProperty ex:hasSeed` + `owl:minCardinality "1"^^xsd:nonNegativeInteger` |
| `(max 3 ex:hasSeed)` | `owl:onProperty ex:hasSeed` + `owl:maxCardinality "3"^^…` |
| `(exactly 2 ex:hasCore)` | `owl:onProperty ex:hasCore` + `owl:cardinality "2"^^…` |
| `(min 1 ex:hasSeed ex:Seed)` | qualified: `owl:minQualifiedCardinality …` + `owl:onClass ex:Seed` |
| `(max 2 ex:hasCore ex:Core)` | qualified: `owl:maxQualifiedCardinality …` + `owl:onClass ex:Core` |
| `(exactly 1 ex:hasBoss ex:Person)` | qualified: `owl:qualifiedCardinality …` + `owl:onClass ex:Person` |

Example:

```
ex:Apple -isa-> (some ex:hasColor ex:Color)
ex:Apple -isa-> (exactly 1 ex:hasStalk ex:Stalk)
```

## Class expressions

| Syntax | Emits |
|--------|-------|
| `(ex:Fruit and ex:Red)` | `owl:intersectionOf ( ex:Fruit ex:Red )` |
| `(ex:Fruit or ex:Vegetable)` | `owl:unionOf ( ex:Fruit ex:Vegetable )` |
| `(not ex:Fruit)` | `owl:complementOf ex:Fruit` |

`and` and `or` **cannot be mixed in the same parentheses** — nest them:

```
ex:RedRipeFruit -isa-> (ex:Fruit and ex:Red and ex:Ripe)
ex:FruitOrVeg -isa-> (ex:Fruit or ex:Vegetable)
ex:NonFruit -isa-> (not ex:Fruit)

# Nested
ex:NonRedFruit -isa-> (ex:Fruit and (not ex:Red))
```

## Ctrl+Space autocomplete

Anywhere in the editor, press **Ctrl+Space** (Cmd+Space on Mac) to open
a floating suggestion list. Type to filter; ↑/↓ navigates; **Enter**
or **Tab** inserts. **Esc** dismisses.

The suggestion pool contains **144 well-known terms** from these
vocabularies:

- **Core**: RDF, RDFS, OWL, XSD
- **Labels & content**: SKOS, FOAF, Dublin Core, schema.org
- **Provenance**: PROV-O
- **Foundation**: BFO 2, RO, IAO, SIO (OBO Foundry style)
- **Shapes**: SHACL core

Every entry shows a **kind badge** (`class`, `obj`, `dat`, `ann`,
`dty`, `ind`) and a one-line description. When you pick a term whose
prefix isn't declared, the `@prefix` line is auto-inserted at the top.

The autocomplete pool also includes prefixes YOU declared in the current
document, so `mwo:` terms you've already used will appear.

## Multi-subject lines

Comma-separate subjects to apply the same predicate/objects to each:

```
ex:red, ex:orange, ex:yellow -a-> ex:Color
ex:Apple, ex:Banana -isa-> ex:Fruit
```

## Property chains

The `-chain->` shortcut emits `owl:propertyChainAxiom` with an rdf:List:

```
ex:hasUncle -chain-> ex:hasParent, ex:hasBrother
```

Equivalent Turtle:
```turtle
ex:hasUncle owl:propertyChainAxiom ( ex:hasParent ex:hasBrother ) .
```

## Inline blank nodes `[...]`

Turtle-style inline blanks with `;`-separated predicate/object pairs.
Perfect for SHACL shapes and nested OWL axioms:

```
ex:PersonShape -sh:property-> [sh:path foaf:name; sh:minCount 1; sh:datatype xsd:string]
```

Inline blanks are **single-line** — for multi-property shapes, chain
multiple `-sh:property->` lines inside a subject block. See the SHACL
example in the "Load example" dropdown.

## What is NOT in the DSL

- Reified statements (use RDF-star in Turtle, then paste into the
  [playground](../playground/))
- SPARQL queries (a different language — use the SPARQL Explorer
  page instead)
- Multi-line inline blank nodes (put them on one line, or use a subject
  block)
