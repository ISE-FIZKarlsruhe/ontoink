# Architecture & Design Decisions

How ontoink works under the hood: why it exists, how it talks to SPARQL
endpoints, how reasoning and shape recommendation are implemented, and how
labels get resolved.

### Why ontoink?

Existing ontology visualization tools either require complex desktop installations (Protégé), produce static non-interactive diagrams (WebVOWL), or don't integrate with documentation workflows. ontoink fills this gap:

- **Documentation-first**: embeds directly in MkDocs, the standard for Python project documentation
- **Interactive by default**: every diagram is explorable — click, search, zoom, export
- **Verifiable**: SHACL validation is built in, not an afterthought
- **Publication-ready**: export PNG/SVG with legend and prefixes for papers and presentations

### Adaptive Schema Discovery (SPARQL Explorer)

Connecting to a SPARQL endpoint with millions of triples (DBpedia: 9.5B, Wikidata: 17B) requires careful query design:

1. **Fast probe** — `SELECT * WHERE { ?s ?p ?o } LIMIT 1` with 10s timeout verifies the endpoint is reachable and supports CORS
2. **Class discovery with counts** — `SELECT ?class (COUNT(?inst) AS ?count) GROUP BY ?class LIMIT 100` gives the schema overview. If this times out (>15s), falls back to `SELECT DISTINCT ?class` which is orders of magnitude faster
3. **Property discovery with domain/range** — joins `?s a ?domain . ?o a ?range` to infer property signatures. Falls back to `SELECT DISTINCT ?prop` for large endpoints
4. **Batch label fetching** — `VALUES` clause retrieves labels for up to 80 IRIs in one query
5. **Ontology source fallback** — for IRIs still without labels after endpoint queries, fetches the ontology files directly (via known URL registry) and extracts `rdfs:label`/`skos:prefLabel` using a robust Turtle/RDF-XML parser

This adaptive approach means any endpoint works — from a 100-triple demo to Wikidata — and labels are always resolved even when the triplestore doesn't contain ontology annotations.

### OWL Reasoning Pipeline

ontoink uses a two-stage reasoning approach:

1. **Primary: HermiT** (via owlready2) — full OWL DL tableau reasoner. Handles class hierarchy completion, inverse/transitive/symmetric property inference, consistency checking. Runs at MkDocs build time.
2. **Fallback: owlrl** — OWL-RL profile for environments without Java. Provides rdfs:subClassOf and basic property inference.
3. **Smart filtering** — removes reflexive triples (`x sameAs x`), built-in namespace noise (XSD, OWL, RDF, RDFS), and domain/range propagation to show only meaningful inferences.

### SHACL Shape Recommendation

The Shape Recommender uses **data profiling** to auto-generate SHACL constraints:

1. **Class discovery** — identifies all classes with instances (`rdf:type`)
2. **Property profiling** — for each class, counts property usage across all instances
3. **Constraint inference**:
   - If 90%+ of instances have property P → `sh:minCount 1` (mandatory)
   - If no instance has >1 value → `sh:maxCount 1` (functional)
   - If all values are same XSD type → `sh:datatype`
   - If all values are IRIs → `sh:nodeKind sh:IRI`
4. **Confidence scoring** — percentage of instances exhibiting the pattern

Based on: *Mihindukulasooriya et al. (2018) "RDF Shape Induction using Knowledge Base Profiling"*.

**Novel extensions beyond Mihindukulasooriya (2018):**

| Feature | Original paper | ontoink extension |
|:--------|:---------------|:------------------|
| Cardinality | min/max count | Same |
| Datatype | XSD detection | Same |
| **sh:class** | Not covered | Infers target class from IRI value types |
| **sh:pattern** | Not covered | Auto-detects email, URL, uppercase patterns |
| **sh:minLength/maxLength** | Not covered | String length statistics |
| **sh:minInclusive/maxInclusive** | Not covered | Numeric range constraints |
| **Uniqueness** | Not covered | Detects potential identifiers |
| **Confidence** | Binary | Percentage-based (0-100%) |

Works from uploaded TTL data or directly from SPARQL endpoints. Navigate shapes with Prev/Next, edit, download individually, or accept into the visual editor.

### Client-side SPARQL Autocomplete

The SPARQL query editor provides Wikidata-style autocomplete:

- **Ctrl+Space** triggers the popup
- Fuzzy matching searches across IRI, label, and prefixed name simultaneously
- Classes, properties, and SPARQL keywords are all suggested with color-coded type badges
- Selecting an item inserts the full `<IRI>` into the query

### Automatic Ontology Label Resolution

ontoink automatically fetches and caches labels from all ontologies referenced in the graph:

1. **On graph init** — collects all unique namespaces from nodes/edges and fetches ontology files in the background
2. **Known ontology registry** — maps namespaces to CORS-friendly download URLs (GitHub Pages, raw GitHub, W3C), bypassing servers that redirect without CORS headers (e.g., `nfdi.fiz-karlsruhe.de → ise-fizkarlsruhe.github.io`)
3. **Dual parser strategy** — merges results from a fast minimal parser with a robust line-based parser that handles complex OWL TTL (nested blank nodes, collections, multi-line strings)
4. **Label propagation** — resolved labels are used in:
   - Click popups ("More..." shows label, comment, type, subclass, deprecation status)
   - SPARQL autocomplete (Ctrl+Space shows `"contributor role"` + `NFDI_0000118`)
   - SPARQL class/property dropdowns (`contributor role (NFDI_0000118)` instead of just `NFDI_0000118`)
   - Query results (IRIs rendered as `label (prefixed:name)`)
5. **SPARQL Explorer endpoint fallback** — when the triplestore lacks labels, fetches ontology source files directly and extracts `rdfs:label`/`skos:prefLabel` from Turtle and RDF/XML
