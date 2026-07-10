/*
 * ontoink-dsl.js — v0.7.4
 *
 * A D2-inspired ontology description language.  User types compact
 * arrow-notation triples; the parser emits RDF triples that ontoink
 * renders live.  The language is deliberately small — a superset of
 * "Turtle you can read at 3am" — plus a handful of shorthands lifted
 * from D2 / Manchester syntax.
 *
 * Grammar (informal):
 *
 *   file        := (stmt "\n")*
 *   stmt        := prefix | triple | block | class-decl | property-decl | COMMENT
 *   prefix      := "@prefix" WS name ":" WS "<" IRI ">"
 *   triple      := subject "-" predicate "->" objects
 *   block       := subject WS "{" (triple-in-block)* "}"
 *   triple-in-block := "-" predicate "->" objects
 *   subject     := iri | curie | blank
 *   predicate   := iri | curie | shortcut
 *   objects     := object ("," object)*
 *   object      := iri | curie | literal | blank
 *   literal     := DQ_STRING [ "^^" (curie|iri) | "@" LANG ]
 *                | NUMBER
 *                | BOOL
 *   shortcut    := "a" | "isa" | "type"
 *   curie       := name ":" name
 *   iri         := "<" IRI ">"
 *   blank       := "_:" name
 *
 * Predicate shortcuts:
 *   -a->    ≡ -rdf:type->
 *   -isa->  ≡ -rdfs:subClassOf->
 *   -type-> ≡ -rdf:type->
 *
 * Errors are collected during parsing and returned with 1-indexed line
 * + column numbers so the editor can render red gutter markers and
 * inline squiggles.
 *
 * Public surface:
 *   ontoinkDsl.parse(text)         → { triples, prefixes, errors }
 *   ontoinkDsl.toTurtle(parsed)    → string
 *   ontoinkDsl.toGraphData(parsed) → { nodes: [...], edges: [...] } for ontoink.js
 *   ontoinkDsl.exampleText()       → tutorial text used by /live-editor
 */

(function(global) {
  "use strict";

  var BUILTIN_PREFIXES = {
    rdf:  "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    rdfs: "http://www.w3.org/2000/01/rdf-schema#",
    owl:  "http://www.w3.org/2002/07/owl#",
    xsd:  "http://www.w3.org/2001/XMLSchema#",
    skos: "http://www.w3.org/2004/02/skos/core#",
    dc:   "http://purl.org/dc/elements/1.1/",
    dct:  "http://purl.org/dc/terms/",
    foaf: "http://xmlns.com/foaf/0.1/",
    prov: "http://www.w3.org/ns/prov#",
    schema: "https://schema.org/",
    bfo:  "http://purl.obolibrary.org/obo/BFO_",
    iao:  "http://purl.obolibrary.org/obo/IAO_",
    ro:   "http://purl.obolibrary.org/obo/RO_",
    sio:  "http://semanticscience.org/resource/",
    sh:   "http://www.w3.org/ns/shacl#",
    ex:   "http://example.org/"
  };

  // v0.7.5 — Well-known ontology terms for Ctrl+Space autocomplete.
  // Each entry: { curie, iri, label, kind, doc }. Kind: "class" |
  // "objectProperty" | "dataProperty" | "annotationProperty" | "datatype"
  // | "individual". The `label` is a human-readable name shown in the
  // popup; `doc` is a one-line description. When a term with a
  // still-undeclared prefix is picked, the editor auto-inserts the
  // `@prefix` line for it.
  //
  // Focus: RDF/RDFS/OWL/XSD (mechanics), SKOS/FOAF/Dublin Core/schema.org
  // (labels and content), PROV (provenance), BFO/IAO/RO/SIO (foundation
  // ontologies most curators reach for). Not exhaustive by design —
  // enough to cover ~80% of typing without becoming a browser.
  var WELL_KNOWN_TERMS = [
    // ─── RDF / RDFS ────────────────────────────────────────────────────
    { curie: "rdf:type",              iri: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",         label: "type",         kind: "objectProperty", doc: "The subject is an instance of a class" },
    { curie: "rdf:Property",          iri: "http://www.w3.org/1999/02/22-rdf-syntax-ns#Property",     label: "Property",     kind: "class",          doc: "The class of RDF properties" },
    { curie: "rdf:List",              iri: "http://www.w3.org/1999/02/22-rdf-syntax-ns#List",         label: "List",         kind: "class",          doc: "The class of RDF Lists" },
    { curie: "rdf:first",             iri: "http://www.w3.org/1999/02/22-rdf-syntax-ns#first",        label: "first",        kind: "objectProperty", doc: "First element of an rdf:List" },
    { curie: "rdf:rest",              iri: "http://www.w3.org/1999/02/22-rdf-syntax-ns#rest",         label: "rest",         kind: "objectProperty", doc: "Rest of an rdf:List" },
    { curie: "rdf:nil",               iri: "http://www.w3.org/1999/02/22-rdf-syntax-ns#nil",          label: "nil",          kind: "individual",     doc: "The empty rdf:List" },
    { curie: "rdfs:Class",            iri: "http://www.w3.org/2000/01/rdf-schema#Class",              label: "Class",        kind: "class",          doc: "The class of RDFS classes" },
    { curie: "rdfs:Resource",         iri: "http://www.w3.org/2000/01/rdf-schema#Resource",           label: "Resource",     kind: "class",          doc: "The most general RDF resource" },
    { curie: "rdfs:Literal",          iri: "http://www.w3.org/2000/01/rdf-schema#Literal",            label: "Literal",      kind: "class",          doc: "The class of RDF literals" },
    { curie: "rdfs:Datatype",         iri: "http://www.w3.org/2000/01/rdf-schema#Datatype",           label: "Datatype",     kind: "class",          doc: "A datatype (subclass of Literal)" },
    { curie: "rdfs:subClassOf",       iri: "http://www.w3.org/2000/01/rdf-schema#subClassOf",         label: "subClassOf",   kind: "objectProperty", doc: "Subject is a subclass of the object" },
    { curie: "rdfs:subPropertyOf",    iri: "http://www.w3.org/2000/01/rdf-schema#subPropertyOf",      label: "subPropertyOf",kind: "objectProperty", doc: "Subject is a sub-property of the object" },
    { curie: "rdfs:domain",           iri: "http://www.w3.org/2000/01/rdf-schema#domain",             label: "domain",       kind: "objectProperty", doc: "The class this property applies to" },
    { curie: "rdfs:range",            iri: "http://www.w3.org/2000/01/rdf-schema#range",              label: "range",        kind: "objectProperty", doc: "The class of values this property can take" },
    { curie: "rdfs:label",            iri: "http://www.w3.org/2000/01/rdf-schema#label",              label: "label",        kind: "annotationProperty", doc: "Human-readable name of the resource" },
    { curie: "rdfs:comment",          iri: "http://www.w3.org/2000/01/rdf-schema#comment",            label: "comment",      kind: "annotationProperty", doc: "Human-readable description" },
    { curie: "rdfs:seeAlso",          iri: "http://www.w3.org/2000/01/rdf-schema#seeAlso",            label: "seeAlso",      kind: "annotationProperty", doc: "Related resource pointer" },
    { curie: "rdfs:isDefinedBy",      iri: "http://www.w3.org/2000/01/rdf-schema#isDefinedBy",        label: "isDefinedBy",  kind: "annotationProperty", doc: "The ontology defining this term" },

    // ─── OWL ───────────────────────────────────────────────────────────
    { curie: "owl:Class",             iri: "http://www.w3.org/2002/07/owl#Class",                    label: "Class",        kind: "class",          doc: "OWL class (subclass of rdfs:Class)" },
    { curie: "owl:Thing",             iri: "http://www.w3.org/2002/07/owl#Thing",                    label: "Thing",        kind: "class",          doc: "The top OWL class — everything is a Thing" },
    { curie: "owl:Nothing",           iri: "http://www.w3.org/2002/07/owl#Nothing",                  label: "Nothing",      kind: "class",          doc: "The empty OWL class" },
    { curie: "owl:ObjectProperty",    iri: "http://www.w3.org/2002/07/owl#ObjectProperty",           label: "ObjectProperty", kind: "class",        doc: "A property whose range is another individual" },
    { curie: "owl:DatatypeProperty",  iri: "http://www.w3.org/2002/07/owl#DatatypeProperty",         label: "DatatypeProperty", kind: "class",      doc: "A property whose range is a literal" },
    { curie: "owl:AnnotationProperty",iri: "http://www.w3.org/2002/07/owl#AnnotationProperty",       label: "AnnotationProperty", kind: "class",    doc: "A property for human-readable metadata" },
    { curie: "owl:Restriction",       iri: "http://www.w3.org/2002/07/owl#Restriction",              label: "Restriction",  kind: "class",          doc: "An OWL class expression constraining a property" },
    { curie: "owl:NamedIndividual",   iri: "http://www.w3.org/2002/07/owl#NamedIndividual",          label: "NamedIndividual", kind: "class",       doc: "An individual with a stable IRI" },
    { curie: "owl:Ontology",          iri: "http://www.w3.org/2002/07/owl#Ontology",                 label: "Ontology",     kind: "class",          doc: "Marks a resource as an OWL ontology" },
    { curie: "owl:sameAs",            iri: "http://www.w3.org/2002/07/owl#sameAs",                   label: "sameAs",       kind: "objectProperty", doc: "Two IRIs denote the same individual" },
    { curie: "owl:differentFrom",     iri: "http://www.w3.org/2002/07/owl#differentFrom",            label: "differentFrom",kind: "objectProperty", doc: "Two IRIs denote distinct individuals" },
    { curie: "owl:equivalentClass",   iri: "http://www.w3.org/2002/07/owl#equivalentClass",          label: "equivalentClass", kind: "objectProperty", doc: "Two classes have the same extension" },
    { curie: "owl:equivalentProperty",iri: "http://www.w3.org/2002/07/owl#equivalentProperty",       label: "equivalentProperty", kind: "objectProperty", doc: "Two properties have the same extension" },
    { curie: "owl:disjointWith",      iri: "http://www.w3.org/2002/07/owl#disjointWith",             label: "disjointWith", kind: "objectProperty", doc: "No individual is instance of both classes" },
    { curie: "owl:inverseOf",         iri: "http://www.w3.org/2002/07/owl#inverseOf",                label: "inverseOf",    kind: "objectProperty", doc: "The property is the inverse of another" },
    { curie: "owl:onProperty",        iri: "http://www.w3.org/2002/07/owl#onProperty",               label: "onProperty",   kind: "objectProperty", doc: "Restriction's target property" },
    { curie: "owl:someValuesFrom",    iri: "http://www.w3.org/2002/07/owl#someValuesFrom",           label: "someValuesFrom", kind: "objectProperty", doc: "Existential restriction (∃)" },
    { curie: "owl:allValuesFrom",     iri: "http://www.w3.org/2002/07/owl#allValuesFrom",            label: "allValuesFrom",kind: "objectProperty", doc: "Universal restriction (∀)" },
    { curie: "owl:hasValue",          iri: "http://www.w3.org/2002/07/owl#hasValue",                 label: "hasValue",     kind: "objectProperty", doc: "Restriction to a specific value" },
    { curie: "owl:cardinality",       iri: "http://www.w3.org/2002/07/owl#cardinality",              label: "cardinality",  kind: "dataProperty",   doc: "Exact cardinality restriction" },
    { curie: "owl:minCardinality",    iri: "http://www.w3.org/2002/07/owl#minCardinality",           label: "minCardinality",kind: "dataProperty",  doc: "Minimum cardinality restriction" },
    { curie: "owl:maxCardinality",    iri: "http://www.w3.org/2002/07/owl#maxCardinality",           label: "maxCardinality",kind: "dataProperty",  doc: "Maximum cardinality restriction" },
    { curie: "owl:intersectionOf",    iri: "http://www.w3.org/2002/07/owl#intersectionOf",           label: "intersectionOf", kind: "objectProperty", doc: "Class defined as intersection of others" },
    { curie: "owl:unionOf",           iri: "http://www.w3.org/2002/07/owl#unionOf",                  label: "unionOf",      kind: "objectProperty", doc: "Class defined as union of others" },
    { curie: "owl:complementOf",      iri: "http://www.w3.org/2002/07/owl#complementOf",             label: "complementOf", kind: "objectProperty", doc: "Class defined as complement of another" },
    { curie: "owl:oneOf",             iri: "http://www.w3.org/2002/07/owl#oneOf",                    label: "oneOf",        kind: "objectProperty", doc: "Class defined by enumerating its members" },
    { curie: "owl:FunctionalProperty",iri: "http://www.w3.org/2002/07/owl#FunctionalProperty",       label: "FunctionalProperty", kind: "class",    doc: "Each subject has at most one value" },
    { curie: "owl:InverseFunctionalProperty", iri: "http://www.w3.org/2002/07/owl#InverseFunctionalProperty", label: "InverseFunctionalProperty", kind: "class", doc: "Each object has at most one subject" },
    { curie: "owl:TransitiveProperty",iri: "http://www.w3.org/2002/07/owl#TransitiveProperty",       label: "TransitiveProperty", kind: "class",    doc: "If a→b and b→c then a→c" },
    { curie: "owl:SymmetricProperty", iri: "http://www.w3.org/2002/07/owl#SymmetricProperty",        label: "SymmetricProperty",  kind: "class",    doc: "If a→b then b→a" },
    { curie: "owl:AsymmetricProperty",iri: "http://www.w3.org/2002/07/owl#AsymmetricProperty",       label: "AsymmetricProperty", kind: "class",    doc: "If a→b then not b→a" },
    { curie: "owl:ReflexiveProperty", iri: "http://www.w3.org/2002/07/owl#ReflexiveProperty",        label: "ReflexiveProperty",  kind: "class",    doc: "Every individual holds the property with itself" },
    { curie: "owl:IrreflexiveProperty",iri:"http://www.w3.org/2002/07/owl#IrreflexiveProperty",      label: "IrreflexiveProperty",kind: "class",    doc: "No individual holds the property with itself" },
    { curie: "owl:propertyChainAxiom", iri:"http://www.w3.org/2002/07/owl#propertyChainAxiom",       label: "propertyChainAxiom",kind: "objectProperty", doc: "Chain of properties whose composition implies this property (DSL: -chain->)" },

    // ─── XSD datatypes ─────────────────────────────────────────────────
    { curie: "xsd:string",            iri: "http://www.w3.org/2001/XMLSchema#string",                label: "string",       kind: "datatype",       doc: "Unicode string" },
    { curie: "xsd:integer",           iri: "http://www.w3.org/2001/XMLSchema#integer",               label: "integer",      kind: "datatype",       doc: "Signed integer" },
    { curie: "xsd:decimal",           iri: "http://www.w3.org/2001/XMLSchema#decimal",               label: "decimal",      kind: "datatype",       doc: "Arbitrary-precision decimal" },
    { curie: "xsd:double",            iri: "http://www.w3.org/2001/XMLSchema#double",                label: "double",       kind: "datatype",       doc: "IEEE 754 double-precision" },
    { curie: "xsd:float",             iri: "http://www.w3.org/2001/XMLSchema#float",                 label: "float",        kind: "datatype",       doc: "IEEE 754 single-precision" },
    { curie: "xsd:boolean",           iri: "http://www.w3.org/2001/XMLSchema#boolean",               label: "boolean",      kind: "datatype",       doc: "true or false" },
    { curie: "xsd:dateTime",          iri: "http://www.w3.org/2001/XMLSchema#dateTime",              label: "dateTime",     kind: "datatype",       doc: "ISO 8601 date-time" },
    { curie: "xsd:date",              iri: "http://www.w3.org/2001/XMLSchema#date",                  label: "date",         kind: "datatype",       doc: "ISO 8601 date" },
    { curie: "xsd:time",              iri: "http://www.w3.org/2001/XMLSchema#time",                  label: "time",         kind: "datatype",       doc: "ISO 8601 time" },
    { curie: "xsd:anyURI",            iri: "http://www.w3.org/2001/XMLSchema#anyURI",                label: "anyURI",       kind: "datatype",       doc: "An IRI" },
    { curie: "xsd:nonNegativeInteger",iri: "http://www.w3.org/2001/XMLSchema#nonNegativeInteger",    label: "nonNegativeInteger", kind: "datatype",  doc: "Zero or positive integer" },
    { curie: "xsd:positiveInteger",   iri: "http://www.w3.org/2001/XMLSchema#positiveInteger",       label: "positiveInteger", kind: "datatype",   doc: "Strictly positive integer" },
    { curie: "xsd:gYear",             iri: "http://www.w3.org/2001/XMLSchema#gYear",                 label: "gYear",        kind: "datatype",       doc: "Gregorian year (CCYY)" },

    // ─── SKOS ──────────────────────────────────────────────────────────
    { curie: "skos:Concept",          iri: "http://www.w3.org/2004/02/skos/core#Concept",            label: "Concept",      kind: "class",          doc: "A SKOS concept" },
    { curie: "skos:ConceptScheme",    iri: "http://www.w3.org/2004/02/skos/core#ConceptScheme",      label: "ConceptScheme",kind: "class",          doc: "A container for related concepts" },
    { curie: "skos:prefLabel",        iri: "http://www.w3.org/2004/02/skos/core#prefLabel",          label: "prefLabel",    kind: "annotationProperty", doc: "The preferred lexical label" },
    { curie: "skos:altLabel",         iri: "http://www.w3.org/2004/02/skos/core#altLabel",           label: "altLabel",     kind: "annotationProperty", doc: "An alternative lexical label" },
    { curie: "skos:definition",       iri: "http://www.w3.org/2004/02/skos/core#definition",         label: "definition",   kind: "annotationProperty", doc: "A formal definition" },
    { curie: "skos:note",             iri: "http://www.w3.org/2004/02/skos/core#note",               label: "note",         kind: "annotationProperty", doc: "A general note" },
    { curie: "skos:broader",          iri: "http://www.w3.org/2004/02/skos/core#broader",            label: "broader",      kind: "objectProperty", doc: "A broader (more general) concept" },
    { curie: "skos:narrower",         iri: "http://www.w3.org/2004/02/skos/core#narrower",           label: "narrower",     kind: "objectProperty", doc: "A narrower (more specific) concept" },
    { curie: "skos:related",          iri: "http://www.w3.org/2004/02/skos/core#related",            label: "related",      kind: "objectProperty", doc: "A related concept" },
    { curie: "skos:exactMatch",       iri: "http://www.w3.org/2004/02/skos/core#exactMatch",         label: "exactMatch",   kind: "objectProperty", doc: "Exact match to another concept" },
    { curie: "skos:closeMatch",       iri: "http://www.w3.org/2004/02/skos/core#closeMatch",         label: "closeMatch",   kind: "objectProperty", doc: "Close match to another concept" },
    { curie: "skos:inScheme",         iri: "http://www.w3.org/2004/02/skos/core#inScheme",           label: "inScheme",     kind: "objectProperty", doc: "The scheme containing this concept" },

    // ─── FOAF ──────────────────────────────────────────────────────────
    { curie: "foaf:Person",           iri: "http://xmlns.com/foaf/0.1/Person",                       label: "Person",       kind: "class",          doc: "A human person" },
    { curie: "foaf:Agent",            iri: "http://xmlns.com/foaf/0.1/Agent",                        label: "Agent",        kind: "class",          doc: "Any actor: person, group, or software" },
    { curie: "foaf:Organization",     iri: "http://xmlns.com/foaf/0.1/Organization",                 label: "Organization", kind: "class",          doc: "A kind of Agent representing an organisation" },
    { curie: "foaf:Group",            iri: "http://xmlns.com/foaf/0.1/Group",                        label: "Group",        kind: "class",          doc: "A collection of Agents" },
    { curie: "foaf:Document",         iri: "http://xmlns.com/foaf/0.1/Document",                     label: "Document",     kind: "class",          doc: "A document" },
    { curie: "foaf:name",             iri: "http://xmlns.com/foaf/0.1/name",                         label: "name",         kind: "dataProperty",   doc: "A name for something" },
    { curie: "foaf:givenName",        iri: "http://xmlns.com/foaf/0.1/givenName",                    label: "givenName",    kind: "dataProperty",   doc: "First name" },
    { curie: "foaf:familyName",       iri: "http://xmlns.com/foaf/0.1/familyName",                   label: "familyName",   kind: "dataProperty",   doc: "Family / surname" },
    { curie: "foaf:mbox",             iri: "http://xmlns.com/foaf/0.1/mbox",                         label: "mbox",         kind: "objectProperty", doc: "Personal mailbox (mailto: IRI)" },
    { curie: "foaf:knows",            iri: "http://xmlns.com/foaf/0.1/knows",                        label: "knows",        kind: "objectProperty", doc: "Person knows another person" },
    { curie: "foaf:homepage",         iri: "http://xmlns.com/foaf/0.1/homepage",                     label: "homepage",     kind: "objectProperty", doc: "A homepage of the agent" },
    { curie: "foaf:workplaceHomepage",iri: "http://xmlns.com/foaf/0.1/workplaceHomepage",            label: "workplaceHomepage", kind: "objectProperty", doc: "Homepage of the workplace" },
    { curie: "foaf:age",              iri: "http://xmlns.com/foaf/0.1/age",                          label: "age",          kind: "dataProperty",   doc: "Age in years" },
    { curie: "foaf:based_near",       iri: "http://xmlns.com/foaf/0.1/based_near",                   label: "based_near",   kind: "objectProperty", doc: "Location near which the agent is based" },

    // ─── Dublin Core Terms ─────────────────────────────────────────────
    { curie: "dct:title",             iri: "http://purl.org/dc/terms/title",                         label: "title",        kind: "annotationProperty", doc: "Title of the resource" },
    { curie: "dct:creator",           iri: "http://purl.org/dc/terms/creator",                       label: "creator",      kind: "objectProperty", doc: "Primary creator" },
    { curie: "dct:contributor",       iri: "http://purl.org/dc/terms/contributor",                   label: "contributor",  kind: "objectProperty", doc: "An additional contributor" },
    { curie: "dct:date",              iri: "http://purl.org/dc/terms/date",                          label: "date",         kind: "dataProperty",   doc: "A date associated with the resource" },
    { curie: "dct:issued",            iri: "http://purl.org/dc/terms/issued",                        label: "issued",       kind: "dataProperty",   doc: "Date of formal issuance" },
    { curie: "dct:modified",          iri: "http://purl.org/dc/terms/modified",                      label: "modified",     kind: "dataProperty",   doc: "Date on which the resource was last modified" },
    { curie: "dct:description",       iri: "http://purl.org/dc/terms/description",                   label: "description",  kind: "annotationProperty", doc: "Free-text description" },
    { curie: "dct:subject",           iri: "http://purl.org/dc/terms/subject",                       label: "subject",      kind: "objectProperty", doc: "Topic of the resource" },
    { curie: "dct:publisher",         iri: "http://purl.org/dc/terms/publisher",                     label: "publisher",    kind: "objectProperty", doc: "Publishing agent" },
    { curie: "dct:license",           iri: "http://purl.org/dc/terms/license",                       label: "license",      kind: "objectProperty", doc: "Legal license" },
    { curie: "dct:identifier",        iri: "http://purl.org/dc/terms/identifier",                    label: "identifier",   kind: "dataProperty",   doc: "Unambiguous reference" },
    { curie: "dct:isPartOf",          iri: "http://purl.org/dc/terms/isPartOf",                      label: "isPartOf",     kind: "objectProperty", doc: "Related resource that includes this one" },

    // ─── PROV-O ───────────────────────────────────────────────────────
    { curie: "prov:Entity",           iri: "http://www.w3.org/ns/prov#Entity",                       label: "Entity",       kind: "class",          doc: "A physical, digital or conceptual thing" },
    { curie: "prov:Activity",         iri: "http://www.w3.org/ns/prov#Activity",                     label: "Activity",     kind: "class",          doc: "Something that occurs over a period of time" },
    { curie: "prov:Agent",            iri: "http://www.w3.org/ns/prov#Agent",                        label: "Agent",        kind: "class",          doc: "Something that bears responsibility for an activity" },
    { curie: "prov:wasGeneratedBy",   iri: "http://www.w3.org/ns/prov#wasGeneratedBy",               label: "wasGeneratedBy", kind: "objectProperty", doc: "Entity was generated by activity" },
    { curie: "prov:wasDerivedFrom",   iri: "http://www.w3.org/ns/prov#wasDerivedFrom",               label: "wasDerivedFrom", kind: "objectProperty", doc: "Entity derived from another entity" },
    { curie: "prov:wasAssociatedWith",iri: "http://www.w3.org/ns/prov#wasAssociatedWith",            label: "wasAssociatedWith", kind: "objectProperty", doc: "Activity associated with an agent" },
    { curie: "prov:used",             iri: "http://www.w3.org/ns/prov#used",                         label: "used",         kind: "objectProperty", doc: "Activity used an entity" },

    // ─── Schema.org ────────────────────────────────────────────────────
    { curie: "schema:Person",         iri: "https://schema.org/Person",                              label: "Person",       kind: "class",          doc: "A person (schema.org)" },
    { curie: "schema:Organization",   iri: "https://schema.org/Organization",                        label: "Organization", kind: "class",          doc: "An organization (schema.org)" },
    { curie: "schema:Thing",          iri: "https://schema.org/Thing",                               label: "Thing",        kind: "class",          doc: "Most generic type (schema.org)" },
    { curie: "schema:name",           iri: "https://schema.org/name",                                label: "name",         kind: "dataProperty",   doc: "The name of the item" },
    { curie: "schema:description",    iri: "https://schema.org/description",                         label: "description",  kind: "dataProperty",   doc: "A description of the item" },

    // ─── BFO 2 (Basic Formal Ontology) ────────────────────────────────
    // Frequently cited foundation ontology in bio / OBO domains.
    { curie: "bfo:0000001",           iri: "http://purl.obolibrary.org/obo/BFO_0000001",             label: "entity",       kind: "class",          doc: "The top BFO class" },
    { curie: "bfo:0000002",           iri: "http://purl.obolibrary.org/obo/BFO_0000002",             label: "continuant",   kind: "class",          doc: "Entity persisting through time" },
    { curie: "bfo:0000003",           iri: "http://purl.obolibrary.org/obo/BFO_0000003",             label: "occurrent",    kind: "class",          doc: "Entity occurring in time (process/event)" },
    { curie: "bfo:0000004",           iri: "http://purl.obolibrary.org/obo/BFO_0000004",             label: "independent continuant", kind: "class",doc: "Continuant that does not depend on another for existence" },
    { curie: "bfo:0000015",           iri: "http://purl.obolibrary.org/obo/BFO_0000015",             label: "process",      kind: "class",          doc: "An occurrent that unfolds through time" },
    { curie: "bfo:0000019",           iri: "http://purl.obolibrary.org/obo/BFO_0000019",             label: "quality",      kind: "class",          doc: "A specifically dependent continuant" },
    { curie: "bfo:0000020",           iri: "http://purl.obolibrary.org/obo/BFO_0000020",             label: "specifically dependent continuant", kind: "class", doc: "Continuant that depends on another for existence" },
    { curie: "bfo:0000023",           iri: "http://purl.obolibrary.org/obo/BFO_0000023",             label: "role",         kind: "class",          doc: "A realizable entity depending on external circumstances" },
    { curie: "bfo:0000030",           iri: "http://purl.obolibrary.org/obo/BFO_0000030",             label: "object",       kind: "class",          doc: "Material entity that is a maximally cohesive whole" },
    { curie: "bfo:0000040",           iri: "http://purl.obolibrary.org/obo/BFO_0000040",             label: "material entity", kind: "class",       doc: "Independent continuant that has some portion of matter as part" },

    // ─── RO (Relation Ontology, used in OBO) ──────────────────────────
    { curie: "ro:0000053",            iri: "http://purl.obolibrary.org/obo/RO_0000053",              label: "bearer of",    kind: "objectProperty", doc: "Bears a dependent entity" },
    { curie: "ro:0000056",            iri: "http://purl.obolibrary.org/obo/RO_0000056",              label: "participates in", kind: "objectProperty", doc: "Individual participates in a process" },
    { curie: "ro:0000057",            iri: "http://purl.obolibrary.org/obo/RO_0000057",              label: "has participant", kind: "objectProperty", doc: "Process has a participant" },
    { curie: "ro:0000087",            iri: "http://purl.obolibrary.org/obo/RO_0000087",              label: "has role",     kind: "objectProperty", doc: "Individual bears a specific role" },
    { curie: "ro:0002215",            iri: "http://purl.obolibrary.org/obo/RO_0002215",              label: "capable of",   kind: "objectProperty", doc: "Individual has a disposition to a process" },

    // ─── IAO (Information Artifact Ontology) ──────────────────────────
    { curie: "iao:0000030",           iri: "http://purl.obolibrary.org/obo/IAO_0000030",             label: "information content entity", kind: "class", doc: "An entity that carries information" },
    { curie: "iao:0000115",           iri: "http://purl.obolibrary.org/obo/IAO_0000115",             label: "definition",   kind: "annotationProperty", doc: "Textual definition" },
    { curie: "iao:0000232",           iri: "http://purl.obolibrary.org/obo/IAO_0000232",             label: "curator note", kind: "annotationProperty", doc: "Curator note" },
    { curie: "iao:0000136",           iri: "http://purl.obolibrary.org/obo/IAO_0000136",             label: "is about",     kind: "objectProperty", doc: "An IC entity is about some other entity" },
    { curie: "iao:0000219",           iri: "http://purl.obolibrary.org/obo/IAO_0000219",             label: "denotes",      kind: "objectProperty", doc: "Reference relation between an IC entity and something" },

    // ─── SIO (Semanticscience Integrated Ontology) ────────────────────
    { curie: "sio:000008",            iri: "http://semanticscience.org/resource/SIO_000008",         label: "has attribute", kind: "objectProperty", doc: "SIO has-attribute" },
    { curie: "sio:000216",            iri: "http://semanticscience.org/resource/SIO_000216",         label: "has quality", kind: "objectProperty", doc: "SIO has-quality" },
    { curie: "sio:000029",            iri: "http://semanticscience.org/resource/SIO_000029",         label: "has part",   kind: "objectProperty", doc: "SIO has-part" },

    // ─── SHACL core ────────────────────────────────────────────────────
    { curie: "sh:NodeShape",          iri: "http://www.w3.org/ns/shacl#NodeShape",                   label: "NodeShape",    kind: "class",          doc: "A SHACL shape targeting nodes" },
    { curie: "sh:PropertyShape",      iri: "http://www.w3.org/ns/shacl#PropertyShape",               label: "PropertyShape",kind: "class",          doc: "A SHACL shape describing a property" },
    { curie: "sh:targetClass",        iri: "http://www.w3.org/ns/shacl#targetClass",                 label: "targetClass",  kind: "objectProperty", doc: "Instances of this class must conform" },
    { curie: "sh:path",               iri: "http://www.w3.org/ns/shacl#path",                        label: "path",         kind: "objectProperty", doc: "The property this shape describes" },
    { curie: "sh:datatype",           iri: "http://www.w3.org/ns/shacl#datatype",                    label: "datatype",     kind: "objectProperty", doc: "Constrain value datatype" },
    { curie: "sh:minCount",           iri: "http://www.w3.org/ns/shacl#minCount",                    label: "minCount",     kind: "dataProperty",   doc: "Minimum cardinality" },
    { curie: "sh:maxCount",           iri: "http://www.w3.org/ns/shacl#maxCount",                    label: "maxCount",     kind: "dataProperty",   doc: "Maximum cardinality" }
  ];

  var SHORTCUT_PREDICATES = {
    "a":     { prefix: "rdf",  local: "type" },
    "type":  { prefix: "rdf",  local: "type" },
    "isa":   { prefix: "rdfs", local: "subClassOf" },
    // v0.7.6 — Property chain shortcut. `-chain->` emits an
    // owl:propertyChainAxiom whose object is the rdf:List of the given
    // property terms.  Comma-separated objects become the chain steps.
    "chain": { prefix: "owl",  local: "propertyChainAxiom" }
  };

  // ---- Tokenizer helpers ---------------------------------------------------

  function isIdentStart(ch) {
    return (ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z") || ch === "_";
  }
  function isIdentPart(ch) {
    return isIdentStart(ch) || (ch >= "0" && ch <= "9") || ch === "-" || ch === ".";
  }

  // Reader over a single line; tracks column for precise error reporting.
  function Reader(line, lineNo) {
    this.text = line;
    this.pos = 0;
    this.line = lineNo;
    this.errors = [];
  }
  Reader.prototype.eof = function() { return this.pos >= this.text.length; };
  Reader.prototype.peek = function(n) { return this.text.charAt(this.pos + (n || 0)); };
  Reader.prototype.next = function() { return this.text.charAt(this.pos++); };
  Reader.prototype.skipWs = function() {
    while (!this.eof() && (this.peek() === " " || this.peek() === "\t")) this.pos++;
  };
  Reader.prototype.match = function(s) {
    if (this.text.substring(this.pos, this.pos + s.length) === s) {
      this.pos += s.length;
      return true;
    }
    return false;
  };
  Reader.prototype.err = function(msg) {
    this.errors.push({ line: this.line, col: this.pos + 1, message: msg });
  };
  Reader.prototype.rest = function() { return this.text.substring(this.pos); };

  // Read an identifier (word chars + limited punctuation used in local names).
  function readName(r) {
    if (!isIdentStart(r.peek())) return null;
    var start = r.pos;
    while (!r.eof() && isIdentPart(r.peek())) r.pos++;
    return r.text.substring(start, r.pos);
  }

  // v0.7.6 — Subject terms may additionally be inline blank nodes
  // `[pred obj; pred obj]` (Turtle-style) so SHACL / OWL restriction
  // subjects can be written compactly.
  function readSubjectTerm(r) {
    r.skipWs();
    if (r.peek() === "[") return readInlineBlank(r);
    return readCurieOrIri(r);
  }

  // Read a CURIE (prefix:local) or a bare local name that we treat as ex:local.
  function readCurieOrIri(r) {
    r.skipWs();
    if (r.peek() === "<") {
      // Full IRI: <http://…>
      r.pos++;
      var end = r.text.indexOf(">", r.pos);
      if (end < 0) { r.err("unterminated <IRI>"); return null; }
      var iri = r.text.substring(r.pos, end);
      r.pos = end + 1;
      return { kind: "iri", value: iri };
    }
    if (r.peek() === "_" && r.peek(1) === ":") {
      // Blank node: _:b1
      r.pos += 2;
      var bn = readName(r);
      if (!bn) { r.err("blank-node label expected after '_:'"); return null; }
      return { kind: "blank", value: bn };
    }
    var first = readName(r);
    if (first === null) return null;
    if (r.peek() === ":") {
      r.pos++;
      var local = readName(r) || "";
      return { kind: "curie", prefix: first, local: local };
    }
    // Bare local name — treat as ex:name by convention.
    return { kind: "curie", prefix: "ex", local: first };
  }

  // Read an object token: literal, IRI, CURIE, blank, parenthesized
  // expression (restriction or class expression — see readExpression), or
  // inline blank node `[pred obj; ...]` (v0.7.6).
  function readObject(r) {
    r.skipWs();
    if (r.peek() === '"') return readString(r);
    if (r.peek() === "(") return readExpression(r);
    if (r.peek() === "[") return readInlineBlank(r);
    if (r.peek() >= "0" && r.peek() <= "9") return readNumber(r);
    if (r.match("true"))  return { kind: "literal", value: "true",  datatype: "xsd:boolean" };
    if (r.match("false")) return { kind: "literal", value: "false", datatype: "xsd:boolean" };
    return readCurieOrIri(r);
  }

  // v0.7.6 — Inline blank-node syntax: `[predicate object; predicate object]`.
  // Returns a synthetic term of kind "inlineBlank" carrying the inner
  // property-value pairs. The parser's expansion step (see
  // `_expandInlineBlanks`, called from _expandExpressions) mints a fresh
  // blank-node subject and emits the accumulated triples.
  //
  // Predicates in the inline form can be any of: bare identifier
  // (interpreted as ex:name if unprefixed), CURIE, or the `a` shortcut for
  // `rdf:type`. Objects are the usual full grammar (nested blanks OK).
  var _inlineBlankCounter = 0;
  function readInlineBlank(r) {
    if (r.peek() !== "[") { r.err("expected '['"); return null; }
    r.pos++;
    var pairs = [];   // [{p, o}, ...]
    r.skipWs();
    while (!r.eof() && r.peek() !== "]") {
      // Read predicate: `a` shortcut (only when standalone — NOT the
      // leading char of a longer identifier like `age` or `apple`), CURIE,
      // or bare name.  v0.7.6-fix: use a non-consuming lookahead — the
      // previous `r.match("a")` advanced pos even when the guard failed,
      // silently eating the leading 'a' of predicates like `age` and
      // emitting `ex:ge` instead (adversarial review 2026-07-13).
      var predRaw;
      if (r.peek() === "a" && !isIdentPart(r.text.charAt(r.pos + 1))) {
        r.pos++;
        predRaw = { kind: "curie", prefix: "rdf", local: "type" };
      } else {
        predRaw = readCurieOrIri(r);
      }
      if (!predRaw) { r.err("expected predicate inside inline blank"); break; }
      r.skipWs();
      // Read one or more objects (comma-separated allowed here too).
      var objs = [];
      var first = readObject(r);
      if (!first) { r.err("expected object inside inline blank"); break; }
      objs.push(first);
      r.skipWs();
      while (r.peek() === ",") {
        r.pos++; r.skipWs();
        var o = readObject(r); if (!o) break;
        objs.push(o); r.skipWs();
      }
      for (var i = 0; i < objs.length; i++) pairs.push({ p: predRaw, o: objs[i] });
      // Optional separator `;`
      if (r.peek() === ";") { r.pos++; r.skipWs(); }
    }
    if (!r.match("]")) { r.err("expected ']' to close inline blank node"); }
    return { kind: "inlineBlank", pairs: pairs };
  }

  // v0.7.5 — Read a parenthesized expression: OWL restriction or class
  // expression. Manchester-style syntax that emits blank-node axioms.
  //
  //  Restriction:
  //    (some <prop> <filler>)     → owl:someValuesFrom
  //    (only <prop> <filler>)     → owl:allValuesFrom
  //    (value <prop> <indiv>)     → owl:hasValue
  //    (min N <prop> [<class>])   → owl:minCardinality / minQualifiedCardinality
  //    (max N <prop> [<class>])   → owl:maxCardinality / maxQualifiedCardinality
  //    (exactly N <prop> [<class>]) → owl:cardinality / qualifiedCardinality
  //
  //  Class expression:
  //    (<C1> and <C2> [and <C3>...]) → owl:intersectionOf
  //    (<C1> or  <C2> [or  <C3>...]) → owl:unionOf
  //    (not <C>)                     → owl:complementOf
  //
  // Returns a synthetic term of kind "expr" with sub-shape stored on the
  // term; toGraphData / toTurtle unfold these into blank-node axioms.
  function readExpression(r) {
    if (r.peek() !== "(") { r.err("expected '('"); return null; }
    r.pos++;
    r.skipWs();
    var quantWords = ["some", "only", "value", "min", "max", "exactly", "not"];
    var op = _matchWord(r, quantWords);
    if (op === "some" || op === "only" || op === "value") {
      r.skipWs();
      var prop = readCurieOrIri(r);
      r.skipWs();
      var filler = readCurieOrIri(r);
      r.skipWs();
      if (!r.match(")")) { r.err("expected ')' to close restriction"); }
      return { kind: "expr", exprKind: "restriction", op: op, prop: prop, filler: filler };
    }
    if (op === "min" || op === "max" || op === "exactly") {
      r.skipWs();
      var num = readNumber(r);
      r.skipWs();
      var prop2 = readCurieOrIri(r);
      r.skipWs();
      var qualifier = null;
      // Optional qualifier class (`min 1 ex:hasSeed ex:Seed`)
      if (r.peek() !== ")") qualifier = readCurieOrIri(r);
      r.skipWs();
      if (!r.match(")")) { r.err("expected ')' to close cardinality restriction"); }
      return { kind: "expr", exprKind: "cardinality", op: op, cardinality: num, prop: prop2, qualifier: qualifier };
    }
    if (op === "not") {
      r.skipWs();
      var arg = readCurieOrIri(r);
      r.skipWs();
      if (!r.match(")")) { r.err("expected ')' to close 'not' expression"); }
      return { kind: "expr", exprKind: "class-expr", op: "complementOf", operands: [arg] };
    }
    // No leading op token — this is a class expression: T1 and T2 and ...
    // First operand was already consumed as `op`? No — the op-match returns
    // null if no keyword matched, and rewinds the reader. So the current
    // pos is on the first operand.
    var first = readCurieOrIri(r);
    if (!first) { r.err("expected a term inside expression"); return null; }
    r.skipWs();
    var operands = [first];
    var combinator = null;
    while (r.peek() !== ")") {
      var kw = _matchWord(r, ["and", "or"]);
      if (!kw) { r.err("expected 'and', 'or', or ')' in class expression"); break; }
      if (combinator && combinator !== kw) {
        r.err("cannot mix 'and'/'or' in the same expression — parenthesise sub-expressions");
        break;
      }
      combinator = kw;
      r.skipWs();
      var t = readObject(r);
      if (!t) break;
      operands.push(t);
      r.skipWs();
    }
    if (!r.match(")")) r.err("expected ')' to close class expression");
    return {
      kind: "expr", exprKind: "class-expr",
      op: combinator === "and" ? "intersectionOf"
        : combinator === "or"  ? "unionOf"
        : "intersectionOf",   // single-operand degenerates to identity
      operands: operands
    };
  }

  // Match one of a set of keyword strings, respecting word boundaries.
  // Returns the matched word or null (in which case pos is unchanged).
  function _matchWord(r, words) {
    var save = r.pos;
    var w = readName(r);
    if (w == null) { r.pos = save; return null; }
    for (var i = 0; i < words.length; i++) {
      if (words[i] === w) return w;
    }
    r.pos = save;
    return null;
  }

  function readString(r) {
    // Assumes r.peek() === '"'
    r.pos++;
    var start = r.pos;
    while (!r.eof() && r.peek() !== '"') {
      if (r.peek() === "\\" && !r.eof()) r.pos++;
      r.pos++;
    }
    if (r.peek() !== '"') { r.err("unterminated string literal"); return null; }
    var raw = r.text.substring(start, r.pos);
    r.pos++;
    var lit = { kind: "literal", value: raw };
    if (r.match("^^")) {
      var dt = readCurieOrIri(r);
      if (dt) lit.datatype = _termLabel(dt);
    } else if (r.peek() === "@") {
      r.pos++;
      var lang = "";
      while (!r.eof() && /[a-zA-Z0-9\-]/.test(r.peek())) lang += r.next();
      if (lang) lit.lang = lang;
    }
    return lit;
  }

  function readNumber(r) {
    var start = r.pos;
    while (!r.eof() && /[0-9.\-eE+]/.test(r.peek())) r.pos++;
    var raw = r.text.substring(start, r.pos);
    var dt = raw.indexOf(".") >= 0 ? "xsd:decimal" : "xsd:integer";
    return { kind: "literal", value: raw, datatype: dt };
  }

  function _termLabel(t) {
    if (!t) return "";
    if (t.kind === "iri")   return "<" + t.value + ">";
    if (t.kind === "curie") return t.prefix + ":" + t.local;
    if (t.kind === "blank") return "_:" + t.value;
    return "";
  }

  // ---- Statement-level parser ---------------------------------------------

  // Parse the predicate portion between "-" and "->": returns a term.
  function parsePredicateArrow(r) {
    r.skipWs();
    if (!r.match("-")) { r.err("expected '-' before predicate"); return null; }
    r.skipWs();
    // Read up to "->" — most predicates are single tokens but shortcuts
    // like `a` are alphabetic, and CURIEs like `rdf:type` include a colon.
    // We scan until we see "-" followed by ">".
    var start = r.pos;
    while (!r.eof()) {
      if (r.peek() === "-" && r.peek(1) === ">") break;
      r.pos++;
    }
    if (!(r.peek() === "-" && r.peek(1) === ">")) { r.err("expected '->' to close predicate"); return null; }
    var raw = r.text.substring(start, r.pos).trim();
    r.pos += 2;
    return raw;
  }

  function resolvePredicate(raw, prefixes, r) {
    if (SHORTCUT_PREDICATES[raw]) {
      var s = SHORTCUT_PREDICATES[raw];
      return { kind: "curie", prefix: s.prefix, local: s.local };
    }
    // Parse `raw` back through a tiny sub-reader
    var sub = new Reader(raw, r.line);
    var t = readCurieOrIri(sub);
    if (!t) r.err("predicate '" + raw + "' is not a valid CURIE / IRI / shortcut");
    return t;
  }

  // Parse a list of comma-separated objects, appending to `out`.
  function parseObjects(r, out) {
    r.skipWs();
    var first = readObject(r);
    if (!first) { r.err("expected an object"); return; }
    out.push(first);
    while (true) {
      r.skipWs();
      if (r.peek() !== ",") break;
      r.pos++;
      r.skipWs();
      var nxt = readObject(r);
      if (!nxt) break;
      out.push(nxt);
    }
  }

  // Top-level parse. Returns { triples, prefixes, errors }.
  function parse(text) {
    var lines = String(text || "").split(/\r?\n/);
    var prefixes = {};
    // Auto-declare built-ins so users can type "ex:apple" without a header.
    for (var k in BUILTIN_PREFIXES) prefixes[k] = BUILTIN_PREFIXES[k];
    var triples = [];
    var errors = [];
    var currentSubject = null;   // For block form.
    var blockDepth = 0;

    for (var lineNo = 0; lineNo < lines.length; lineNo++) {
      var lineText = lines[lineNo];
      // Strip comments.
      var hashIdx = _unquotedHash(lineText);
      var effective = hashIdx >= 0 ? lineText.substring(0, hashIdx) : lineText;
      var stripped = effective.trim();
      if (!stripped) continue;

      var r = new Reader(effective, lineNo + 1);
      r.skipWs();

      // Block close.
      if (r.peek() === "}") {
        if (blockDepth === 0) { r.err("unexpected '}'"); errors = errors.concat(r.errors); continue; }
        blockDepth--;
        currentSubject = null;
        r.pos++;
        continue;
      }

      // Prefix declaration.
      if (r.match("@prefix")) {
        r.skipWs();
        var name = readName(r);
        r.skipWs();
        if (!r.match(":")) r.err("expected ':' after prefix name");
        r.skipWs();
        var iri = null;
        if (r.match("<")) {
          var e = r.text.indexOf(">", r.pos);
          if (e < 0) r.err("unterminated <IRI>");
          else { iri = r.text.substring(r.pos, e); r.pos = e + 1; }
        }
        if (name && iri) prefixes[name] = iri;
        errors = errors.concat(r.errors);
        continue;
      }

      // Triple-in-block: starts with "-".
      if (blockDepth > 0 && r.peek() === "-") {
        var predRaw = parsePredicateArrow(r);
        if (predRaw === null) { errors = errors.concat(r.errors); continue; }
        var pred = resolvePredicate(predRaw, prefixes, r);
        var objs = [];
        parseObjects(r, objs);
        if (pred && objs.length) {
          for (var oi = 0; oi < objs.length; oi++) {
            triples.push({ s: currentSubject, p: pred, o: objs[oi], line: r.line });
          }
        }
        errors = errors.concat(r.errors);
        continue;
      }

      // Top-level statement: <subject>[, <subject>]* ...
      // v0.7.6 — Multi-subject lines: comma-separated subjects apply the
      // same predicate/objects to each. `ex:a, ex:b -isa-> ex:C` emits
      // two triples, one per subject.
      var subjects = [];
      var firstSubj = readSubjectTerm(r);
      if (!firstSubj) { errors = errors.concat(r.errors); continue; }
      subjects.push(firstSubj);
      r.skipWs();
      while (r.peek() === ",") {
        r.pos++;
        r.skipWs();
        var nextSubj = readSubjectTerm(r);
        if (!nextSubj) {
          // v0.7.6-fix (adversarial 2026-07-13, finding #4): report a
          // trailing comma instead of silently discarding the line.
          r.err("expected subject after ',' in multi-subject list");
          break;
        }
        subjects.push(nextSubj);
        r.skipWs();
      }

      // Subject block: `<subj> {`  (only allowed on single-subject lines)
      if (r.peek() === "{") {
        if (subjects.length > 1) {
          r.err("subject block '{' is not supported with multiple subjects");
        }
        currentSubject = subjects[0];
        blockDepth++;
        r.pos++;
        continue;
      }

      // Regular triple: `<subj>[, <subj>]* -pred-> <obj>[, <obj>]*`
      if (r.peek() === "-") {
        var pr = parsePredicateArrow(r);
        if (pr === null) { errors = errors.concat(r.errors); continue; }
        var p = resolvePredicate(pr, prefixes, r);
        var oo = [];
        parseObjects(r, oo);
        if (p && oo.length) {
          for (var si = 0; si < subjects.length; si++) {
            for (var oj = 0; oj < oo.length; oj++) {
              triples.push({ s: subjects[si], p: p, o: oo[oj], line: r.line });
            }
          }
        }
      } else if (r.rest().trim()) {
        r.err("expected '-<predicate>->' or '{' after subject");
      }
      errors = errors.concat(r.errors);
    }

    if (blockDepth > 0) {
      errors.push({ line: lines.length, col: 1, message: "block opened with '{' but never closed with '}'" });
    }

    return {
      prefixes: prefixes,
      triples: triples,
      errors: errors
    };
  }

  // Find the index of a '#' that isn't inside a "..." string. Returns -1 if none.
  function _unquotedHash(text) {
    var inStr = false;
    for (var i = 0; i < text.length; i++) {
      var c = text.charAt(i);
      if (inStr) {
        if (c === "\\" && i + 1 < text.length) { i++; continue; }
        if (c === '"') inStr = false;
      } else {
        if (c === '"') inStr = true;
        else if (c === "#") return i;
      }
    }
    return -1;
  }

  // ---- Serializers --------------------------------------------------------

  // v0.7.5 / v0.7.6 — Expand expression objects, inline blank nodes, and
  // owl:propertyChainAxiom lists into standards-compliant blank-node
  // axioms BEFORE serialization / graph emission. Returns a NEW list of
  // triples where every synthetic term (expr / inlineBlank / chain) has
  // been replaced by concrete blank-node subjects and their asserted
  // properties. Also expands inline blanks in SUBJECT position.
  function _expandExpressions(triples) {
    var out = [];
    var bnCount = 0;
    function nextBn() { return { kind: "blank", value: "expr" + (++bnCount) }; }

    // Recursively substitute any {kind:"expr" | "inlineBlank"} occurrence
    // in a term position for a fresh blank node, and emit the equivalent
    // axioms into `out`. Returns the substituted term.
    //
    // v0.7.6-fix (adversarial 2026-07-13): memoize by term-object
    // identity so multi-object lines and subject blocks that reuse the
    // SAME inline-blank term across N triples resolve to ONE blank node
    // with the pair axioms emitted once — not N separate blanks each
    // getting their own copy of the pairs (findings #3, #8). Cache is
    // per _expandExpressions call; cross-parse contamination is impossible.
    var termCache = null;
    if (typeof Map === "function") termCache = new Map();
    else termCache = { has: function(){return false;}, get: function(){}, set: function(){} };

    function materializeTerm(term, line) {
      if (!term) return term;
      if (term.kind !== "expr" && term.kind !== "inlineBlank") return term;
      if (termCache.has(term)) return termCache.get(term);
      if (term.kind === "expr") {
        var bn = nextBn();
        termCache.set(term, bn);
        _emitExpressionAxioms(term, bn, out, nextBn, line);
        return bn;
      }
      // inlineBlank
      var ibn = nextBn();
      termCache.set(term, ibn);
      (term.pairs || []).forEach(function(pair) {
        var oo = materializeTerm(pair.o, line);
        out.push({ s: ibn, p: pair.p, o: oo, line: line });
      });
      return ibn;
    }

    triples.forEach(function(t) {
      var line = t.line;
      // Materialize subject (only inline blank nodes are legal here).
      var s = materializeTerm(t.s, line);
      // v0.7.6 — Property chain: when predicate is owl:propertyChainAxiom
      // and there are multiple objects (comma-separated), emit as
      // rdf:List instead of separate triples per object. Since the
      // parser already flattens comma-separated objects into N triples
      // sharing (s, p), we consume all *consecutive* triples with the
      // same subject + predicate here. That reunification is handled at
      // the CALLER level; here we just detect single-triple chain and
      // treat it as a list-of-one. The multi-object case is handled by
      // deferring — see below.
      // Handle both expr and inlineBlank in object position:
      var o = materializeTerm(t.o, line);
      out.push({ s: s, p: t.p, o: o, line: line });
    });

    // Second pass: coalesce consecutive triples with the same subject +
    // owl:propertyChainAxiom predicate into a single rdf:List axiom.
    return _coalescePropertyChain(out, nextBn);
  }

  // Group triples sharing (s, owl:propertyChainAxiom, line) into a single
  // triple whose object is an rdf:List of the collected property terms.
  // Non-chain triples pass through unchanged.
  //
  // v0.7.6-fix (adversarial 2026-07-13):
  //   1. Also require t2.line === t.line so two SEPARATE `-chain->`
  //      statements on the same subject don't merge into one 4-element
  //      list (finding #2). Each DSL statement becomes its own axiom.
  //   2. Group non-adjacent triples of the same (s, chain, line) too —
  //      because a chain statement with N comma-separated objects emits
  //      N consecutive triples, but if any other triple sneaks in
  //      between (rare) the run-based collection would emit multiple
  //      length-1 lists (finding #6). Bucket-then-emit instead.
  function _coalescePropertyChain(triples, nextBn) {
    // First pass: identify chain triples and bucket by (subject, line).
    var chainKeys = []; // preserve first-seen order for stable output
    var chainByKey = {};
    var isChainIdx = new Array(triples.length);
    for (var i = 0; i < triples.length; i++) {
      var t = triples[i];
      var isChain = t.p && t.p.kind === "curie" && t.p.prefix === "owl" && t.p.local === "propertyChainAxiom";
      isChainIdx[i] = isChain;
      if (!isChain) continue;
      var key = _termKey(t.s) + "|line=" + (t.line != null ? t.line : "?");
      if (!chainByKey[key]) {
        chainByKey[key] = { subj: t.s, pred: t.p, items: [], firstIdx: i, line: t.line };
        chainKeys.push(key);
      }
      chainByKey[key].items.push(t.o);
    }
    if (chainKeys.length === 0) return triples;
    // Second pass: rebuild the output.
    //   - non-chain triples emit in place.
    //   - the FIRST chain triple of each bucket emits the whole rdf:List
    //     for that bucket; subsequent chain triples of the same bucket
    //     are dropped.
    var emitted = {};
    var out = [];
    for (var i2 = 0; i2 < triples.length; i2++) {
      var t2 = triples[i2];
      if (!isChainIdx[i2]) { out.push(t2); continue; }
      var k = _termKey(t2.s) + "|line=" + (t2.line != null ? t2.line : "?");
      if (emitted[k]) continue;
      emitted[k] = true;
      var bucket = chainByKey[k];
      var listHead = nextBn();
      out.push({ s: bucket.subj, p: bucket.pred, o: listHead, line: bucket.line });
      for (var m = 0; m < bucket.items.length; m++) {
        out.push({ s: listHead, p: { kind: "curie", prefix: "rdf", local: "first" }, o: bucket.items[m], line: bucket.line });
        var next = (m === bucket.items.length - 1)
          ? { kind: "curie", prefix: "rdf", local: "nil" }
          : nextBn();
        out.push({ s: listHead, p: { kind: "curie", prefix: "rdf", local: "rest" }, o: next, line: bucket.line });
        listHead = next;
      }
    }
    return out;
  }
  function _termKey(t) {
    if (!t) return "";
    if (t.kind === "iri")   return "iri:" + t.value;
    if (t.kind === "curie") return "curie:" + t.prefix + ":" + t.local;
    if (t.kind === "blank") return "blank:" + t.value;
    return "";
  }
  function _termEq(a, b) {
    if (!a || !b) return false;
    if (a.kind !== b.kind) return false;
    if (a.kind === "iri")   return a.value === b.value;
    if (a.kind === "curie") return a.prefix === b.prefix && a.local === b.local;
    if (a.kind === "blank") return a.value === b.value;
    return false;
  }
  // Emit RDF-serializable triples for an expression term (restriction or
  // class expression), anchored at `bn`, into the output list.
  function _emitExpressionAxioms(expr, bn, out, nextBn, line) {
    var _rdf = { kind: "curie", prefix: "rdf", local: "type" };
    var owlKind = (expr.exprKind === "restriction" || expr.exprKind === "cardinality") ? "Restriction" : "Class";
    out.push({ s: bn, p: _rdf, o: { kind: "curie", prefix: "owl", local: owlKind }, line: line });
    if (expr.exprKind === "restriction") {
      out.push({ s: bn, p: { kind: "curie", prefix: "owl", local: "onProperty" }, o: expr.prop, line: line });
      var facetMap = { some: "someValuesFrom", only: "allValuesFrom", value: "hasValue" };
      out.push({ s: bn, p: { kind: "curie", prefix: "owl", local: facetMap[expr.op] }, o: expr.filler, line: line });
    } else if (expr.exprKind === "cardinality") {
      out.push({ s: bn, p: { kind: "curie", prefix: "owl", local: "onProperty" }, o: expr.prop, line: line });
      var qualified = !!expr.qualifier;
      var facet = expr.op === "min" ? "minCardinality" : expr.op === "max" ? "maxCardinality" : "cardinality";
      if (qualified) facet = "qualifiedCardinality" === facet ? facet
        : (expr.op === "min" ? "minQualifiedCardinality"
         : expr.op === "max" ? "maxQualifiedCardinality"
         : "qualifiedCardinality");
      out.push({ s: bn, p: { kind: "curie", prefix: "owl", local: facet },
                 o: { kind: "literal", value: String(expr.cardinality.value),
                      datatype: "xsd:nonNegativeInteger" }, line: line });
      if (qualified) {
        out.push({ s: bn, p: { kind: "curie", prefix: "owl", local: "onClass" }, o: expr.qualifier, line: line });
      }
    } else if (expr.exprKind === "class-expr") {
      if (expr.op === "complementOf") {
        out.push({ s: bn, p: { kind: "curie", prefix: "owl", local: "complementOf" }, o: expr.operands[0], line: line });
      } else {
        // owl:intersectionOf / owl:unionOf point at an RDF list of blank nodes.
        var listHead = nextBn();
        out.push({ s: bn, p: { kind: "curie", prefix: "owl", local: expr.op }, o: listHead, line: line });
        for (var i = 0; i < expr.operands.length; i++) {
          var op = expr.operands[i];
          // Recursively expand nested expressions before listing
          var listItem = op;
          if (op && op.kind === "expr") {
            var innerBn = nextBn();
            _emitExpressionAxioms(op, innerBn, out, nextBn, line);
            listItem = innerBn;
          }
          out.push({ s: listHead, p: { kind: "curie", prefix: "rdf", local: "first" }, o: listItem, line: line });
          var next = (i === expr.operands.length - 1)
            ? { kind: "curie", prefix: "rdf", local: "nil" }
            : nextBn();
          out.push({ s: listHead, p: { kind: "curie", prefix: "rdf", local: "rest" }, o: next, line: line });
          listHead = next;
        }
      }
    }
  }

  function toTurtle(parsed) {
    if (!parsed) return "";
    // Expand expressions to blank-node axioms so the Turtle round-trip is
    // standards-compliant.
    var expanded = _expandExpressions(parsed.triples);
    var out = [];
    var seenPrefixes = {};
    // Only emit the prefixes actually referenced by the triples.
    expanded.forEach(function(t) {
      [t.s, t.p, t.o].forEach(function(term) {
        if (term && term.kind === "curie") seenPrefixes[term.prefix] = true;
        if (term && term.datatype) {
          var dt = term.datatype.split(":");
          if (dt.length === 2) seenPrefixes[dt[0]] = true;
        }
      });
    });
    Object.keys(seenPrefixes).sort().forEach(function(p) {
      if (parsed.prefixes[p]) out.push("@prefix " + p + ": <" + parsed.prefixes[p] + "> .");
    });
    if (out.length) out.push("");
    expanded.forEach(function(t) {
      out.push(_ttlTerm(t.s) + " " + _ttlTerm(t.p) + " " + _ttlObj(t.o) + " .");
    });
    return out.join("\n") + (out.length ? "\n" : "");
  }
  function _ttlTerm(t) {
    if (!t) return "";
    if (t.kind === "iri")   return "<" + t.value + ">";
    if (t.kind === "curie") return t.prefix + ":" + t.local;
    if (t.kind === "blank") return "_:" + t.value;
    return "";
  }
  function _ttlObj(o) {
    if (!o) return "";
    if (o.kind !== "literal") return _ttlTerm(o);
    var v = '"' + String(o.value).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
    if (o.lang) return v + "@" + o.lang;
    if (o.datatype) return v + "^^" + o.datatype;
    return v;
  }

  // ---- ontoink graph data emitter ----------------------------------------

  // Convert parsed triples into the cytoscape_data shape ontoink.js expects.
  // Nodes deduplicated by their canonical IRI; edge types inferred from the
  // predicate (rdf:type → 'rdf-type', rdfs:subClassOf → 'subclass', literal
  // object → 'data-property', otherwise 'object-property').
  function toGraphData(parsed) {
    if (!parsed) return { nodes: [], edges: [] };
    // Expand expressions BEFORE materialising the graph so restrictions
    // and class expressions render as blank-node axiom stars (v0.7.5).
    var expanded = _expandExpressions(parsed.triples);
    parsed = { prefixes: parsed.prefixes, triples: expanded, errors: parsed.errors };
    var nodesById = {};
    var edges = [];
    var edgeIdCounter = 0;

    function ensureNode(term, isLiteralObj) {
      var id = _iriOf(term, parsed.prefixes);
      if (!id) return null;
      if (nodesById[id]) return nodesById[id];
      var label = _shortLabel(term);
      var type = "Individual";
      if (isLiteralObj) type = "Literal";
      else if (term.kind === "blank") type = "BlankNode";
      var n = { data: {
        id: id,
        iri: id,
        label: label,
        type: type,
        namespace: (term.kind === "curie" ? parsed.prefixes[term.prefix] || "" : ""),
        color: type === "Class" ? "#dbeafe" : (type === "Literal" ? "#f0fdf4" : "#f3f4f6")
      }};
      if (term.kind === "blank" || (typeof id === "string" && id.indexOf("_:") === 0)) {
        n.data.isBlankNode = true;
      }
      nodesById[id] = n;
      return n;
    }

    parsed.triples.forEach(function(t) {
      var predIri = _iriOf(t.p, parsed.prefixes);
      var predShort = _shortLabel(t.p);
      var isType = predIri === (parsed.prefixes.rdf || BUILTIN_PREFIXES.rdf) + "type";
      var isSubClassOf = predIri === (parsed.prefixes.rdfs || BUILTIN_PREFIXES.rdfs) + "subClassOf";
      var isSubPropOf = predIri === (parsed.prefixes.rdfs || BUILTIN_PREFIXES.rdfs) + "subPropertyOf";

      var sNode = ensureNode(t.s, false);
      // If this triple types the subject as a Class, upgrade its type.
      // Types recognised: owl:Class, rdfs:Class, owl:ObjectProperty, etc.
      if (isType && t.o && t.o.kind === "curie") {
        var objIri = _iriOf(t.o, parsed.prefixes);
        var owl = parsed.prefixes.owl || BUILTIN_PREFIXES.owl;
        if (sNode && (objIri === owl + "Class" || objIri === (parsed.prefixes.rdfs || BUILTIN_PREFIXES.rdfs) + "Class")) {
          sNode.data.type = "Class"; sNode.data.color = "#dbeafe";
        }
      }
      if (isSubClassOf) {
        if (sNode) { sNode.data.type = "Class"; sNode.data.color = "#dbeafe"; }
        var pNode = ensureNode(t.o, false);
        if (pNode) { pNode.data.type = "Class"; pNode.data.color = "#dbeafe"; }
      }

      if (t.o.kind === "literal") {
        var litId = _iriOf(t.s, parsed.prefixes) + "#lit_" + (edgeIdCounter++);
        var litLabel = String(t.o.value);
        var litNode = { data: {
          id: litId, iri: "", label: litLabel, type: "Literal",
          namespace: "", color: "#f0fdf4",
          datatype: t.o.datatype || "", lang: t.o.lang || ""
        }};
        nodesById[litId] = litNode;
        edges.push({ data: {
          id: "e" + (edgeIdCounter++),
          source: _iriOf(t.s, parsed.prefixes),
          target: litId,
          label: predShort,
          iri: predIri,
          predicate: predIri,
          edgeType: "data-property"
        }});
      } else {
        ensureNode(t.o, false);
        var edgeType = "object-property";
        if (isType) edgeType = "rdf-type";
        else if (isSubClassOf) edgeType = "subclass";
        else if (isSubPropOf) edgeType = "subclass";
        edges.push({ data: {
          id: "e" + (edgeIdCounter++),
          source: _iriOf(t.s, parsed.prefixes),
          target: _iriOf(t.o, parsed.prefixes),
          label: predShort,
          iri: predIri,
          predicate: predIri,
          edgeType: edgeType
        }});
      }
    });

    return { nodes: Object.keys(nodesById).map(function(k){return nodesById[k];}), edges: edges };
  }

  function _iriOf(term, prefixes) {
    if (!term) return "";
    if (term.kind === "iri")   return term.value;
    if (term.kind === "curie") {
      var ns = prefixes[term.prefix];
      if (!ns) return term.prefix + ":" + term.local;
      return ns + term.local;
    }
    if (term.kind === "blank") return "_:" + term.value;
    if (term.kind === "literal") return term.value;
    return "";
  }
  function _shortLabel(term) {
    if (!term) return "";
    if (term.kind === "iri")     { var v = term.value; var i = Math.max(v.lastIndexOf("/"), v.lastIndexOf("#")); return i > 0 ? v.substring(i+1) : v; }
    if (term.kind === "curie")   return term.prefix + ":" + term.local;
    if (term.kind === "blank")   return "_:" + term.value;
    if (term.kind === "literal") return String(term.value);
    return "";
  }

  // ---- Tutorial ----------------------------------------------------------

  function exampleText() {
    return [
      "# Live-editor tutorial — try editing this!",
      "# Common prefixes (ex, rdf, rdfs, owl, xsd, dc, skos) are auto-declared.",
      "",
      "# --- Classes -----------------------------",
      "ex:Fruit -a-> owl:Class",
      "ex:Apple -isa-> ex:Fruit             # -isa-> ≡ rdfs:subClassOf",
      "ex:Orange -isa-> ex:Fruit",
      "",
      "# --- Individuals --------------------------",
      "ex:appleOne -a-> ex:Apple",
      "ex:appleOne -rdfs:label-> \"Golden Delicious\"@en",
      "ex:appleOne -ex:weight-> 180.5^^xsd:decimal",
      "",
      "# --- Object properties --------------------",
      "ex:Tree -ex:bears-> ex:Fruit",
      "ex:orchardOne -ex:contains-> ex:Tree, ex:Bush, ex:Vine",
      "",
      "# --- Subject block: share the subject -----",
      "ex:Bush {",
      "  -a-> owl:Class",
      "  -rdfs:label-> \"Berry Bush\"",
      "  -ex:habitat-> ex:Forest",
      "}"
    ].join("\n");
  }

  // v0.7.4 — Predefined templates for the "Examples" dropdown. Each entry
  // is a fresh scenario the user can drop into the editor with one click.
  // First entry is the tutorial from exampleText(); others show narrower
  // idioms so users learn one concept at a time.
  function examples() {
    return [
      { id: "tutorial", label: "Tutorial · full walk-through", text: exampleText() },

      { id: "hello", label: "Hello world · one triple", text: [
        "# The simplest possible ontology: one class + one individual.",
        "ex:Fruit -a-> owl:Class",
        "ex:apple -a-> ex:Fruit"
      ].join("\n") },

      { id: "class-hierarchy", label: "Class hierarchy · subclasses", text: [
        "# rdfs:subClassOf built up with the -isa-> shortcut.",
        "ex:LivingThing -a-> owl:Class",
        "ex:Plant  -isa-> ex:LivingThing",
        "ex:Animal -isa-> ex:LivingThing",
        "ex:Fruit  -isa-> ex:Plant",
        "ex:Apple  -isa-> ex:Fruit",
        "ex:Orange -isa-> ex:Fruit",
        "ex:Dog    -isa-> ex:Animal",
        "ex:Cat    -isa-> ex:Animal"
      ].join("\n") },

      { id: "individuals-and-props", label: "Individuals · data + object props", text: [
        "# Two individuals connected by an object property; each also",
        "# carries a couple of data properties (label + a typed number).",
        "ex:Person -a-> owl:Class",
        "ex:alice -a-> ex:Person",
        "ex:alice -foaf:name-> \"Alice\"",
        "ex:alice -foaf:age-> 30",
        "",
        "ex:bob -a-> ex:Person",
        "ex:bob -foaf:name-> \"Bob\"",
        "ex:bob -foaf:age-> 27",
        "",
        "ex:alice -foaf:knows-> ex:bob"
      ].join("\n") },

      { id: "block", label: "Subject block · compact form", text: [
        "# Share a subject across many predicates with { ... }.",
        "ex:Book -a-> owl:Class",
        "",
        "ex:hobbit {",
        "  -a-> ex:Book",
        "  -rdfs:label-> \"The Hobbit\"@en",
        "  -dc:creator-> \"J.R.R. Tolkien\"",
        "  -dc:date-> \"1937\"^^xsd:gYear",
        "  -ex:pages-> 310",
        "}"
      ].join("\n") },

      { id: "multi", label: "Multi-value · comma lists", text: [
        "# One subject/predicate → multiple objects with commas.",
        "ex:RainbowColor -a-> owl:Class",
        "",
        "ex:rainbow -ex:hasColor-> ex:red, ex:orange, ex:yellow, ex:green, ex:blue, ex:indigo, ex:violet",
        "",
        "# Give each color its own class assertion. (Multi-SUBJECT lines",
        "# aren't supported — one subject per line, or use a block.)",
        "ex:red    -a-> ex:RainbowColor",
        "ex:orange -a-> ex:RainbowColor",
        "ex:yellow -a-> ex:RainbowColor",
        "ex:green  -a-> ex:RainbowColor"
      ].join("\n") },

      { id: "literals", label: "Literals · strings, numbers, langs, types", text: [
        "# Every literal form supported by the DSL, side by side.",
        "ex:thing -rdfs:label-> \"Plain string\"",
        "ex:thing -rdfs:label-> \"Français\"@fr",
        "ex:thing -rdfs:label-> \"日本語\"@ja",
        "ex:thing -ex:count-> 42",
        "ex:thing -ex:ratio-> 3.14",
        "ex:thing -ex:price-> \"9.99\"^^xsd:decimal",
        "ex:thing -ex:when-> \"2026-07-15\"^^xsd:date",
        "ex:thing -ex:active-> true",
        "ex:thing -ex:archived-> false"
      ].join("\n") },

      { id: "foaf", label: "FOAF person · a mini social graph", text: [
        "# A recognisable FOAF snippet — three people, work + know links.",
        "ex:Person -a-> owl:Class",
        "ex:Organization -a-> owl:Class",
        "",
        "ex:acme -a-> ex:Organization",
        "ex:acme -foaf:name-> \"Acme Corp\"",
        "",
        "ex:alice {",
        "  -a-> ex:Person",
        "  -foaf:name-> \"Alice\"",
        "  -foaf:mbox-> <mailto:alice@example.org>",
        "  -foaf:workplaceHomepage-> ex:acme",
        "}",
        "",
        "ex:bob {",
        "  -a-> ex:Person",
        "  -foaf:name-> \"Bob\"",
        "  -foaf:workplaceHomepage-> ex:acme",
        "}",
        "",
        "ex:alice -foaf:knows-> ex:bob"
      ].join("\n") },

      { id: "restrictions", label: "OWL restrictions · some / only / min / exactly", text: [
        "# Manchester-style restrictions in parenthesised expressions.",
        "# Each expression expands to an owl:Restriction blank node in Turtle.",
        "",
        "ex:Fruit  -a-> owl:Class",
        "ex:Color  -a-> owl:Class",
        "ex:Seed   -a-> owl:Class",
        "",
        "# 'Apple has SOME color' — existential quantification",
        "ex:Apple -isa-> (some ex:hasColor ex:Color)",
        "",
        "# 'Apple has AT LEAST 1 seed of type Seed' — qualified min cardinality",
        "ex:Apple -isa-> (min 1 ex:hasSeed ex:Seed)",
        "",
        "# 'Apple has EXACTLY 1 stalk'",
        "ex:Apple -isa-> (exactly 1 ex:hasStalk)",
        "",
        "# 'Kiwi has ONLY green as its color' — universal quantification",
        "ex:Kiwi -isa-> (only ex:hasColor ex:Green)",
        "",
        "# 'Something whose hasSize is exactly ex:Medium' — value restriction",
        "ex:MediumFruit -isa-> (value ex:hasSize ex:Medium)"
      ].join("\n") },

      { id: "chains", label: "Property chains · owl:propertyChainAxiom", text: [
        "# `-chain->` emits owl:propertyChainAxiom whose object is",
        "# an rdf:List of the given properties.",
        "",
        "ex:Person -a-> owl:Class",
        "ex:hasParent  -a-> owl:ObjectProperty",
        "ex:hasBrother -a-> owl:ObjectProperty",
        "ex:hasUncle   -a-> owl:ObjectProperty",
        "",
        "# The chain hasParent · hasBrother implies hasUncle:",
        "ex:hasUncle -chain-> ex:hasParent, ex:hasBrother",
        "",
        "# Longer chain:",
        "ex:hasGreatUncle -chain-> ex:hasParent, ex:hasParent, ex:hasBrother"
      ].join("\n") },

      { id: "shacl", label: "SHACL shapes · inline blank nodes `[...]`", text: [
        "# SHACL shapes fit naturally with inline blank nodes `[pred obj; ...]`.",
        "# The `sh:` prefix is auto-declared. Inline blanks are single-line.",
        "",
        "ex:Person -a-> owl:Class",
        "",
        "# Node shape: every Person must have a name (string) and an age (int)",
        "ex:PersonShape {",
        "  -a-> sh:NodeShape",
        "  -sh:targetClass-> ex:Person",
        "  -sh:property-> [sh:path foaf:name; sh:minCount 1; sh:datatype xsd:string]",
        "  -sh:property-> [sh:path foaf:age; sh:datatype xsd:integer; sh:minInclusive 0]",
        "}",
        "",
        "# Multi-subject shorthand: two shapes with identical constraints",
        "ex:AliceShape, ex:BobShape -sh:property-> [sh:path foaf:mbox; sh:minCount 1]"
      ].join("\n") },

      { id: "expressions", label: "Class expressions · and / or / not", text: [
        "# Class expressions build compound classes from simpler ones.",
        "# `and` = owl:intersectionOf, `or` = owl:unionOf, `not` = owl:complementOf",
        "",
        "ex:Fruit -a-> owl:Class",
        "ex:Red   -a-> owl:Class",
        "ex:Ripe  -a-> owl:Class",
        "ex:Vegetable -a-> owl:Class",
        "",
        "# Intersection: 'a Red AND Ripe Fruit'",
        "ex:RedRipeFruit -isa-> (ex:Fruit and ex:Red and ex:Ripe)",
        "",
        "# Union: 'a Fruit OR a Vegetable'",
        "ex:Produce -isa-> (ex:Fruit or ex:Vegetable)",
        "",
        "# Complement: 'anything that is NOT a Fruit'",
        "ex:NonFruit -isa-> (not ex:Fruit)",
        "",
        "# You can nest — `and` and `or` cannot mix in the same parens",
        "ex:NonRedFruit -isa-> (ex:Fruit and (not ex:Red))"
      ].join("\n") },

      { id: "blank", label: "Blank nodes · anonymous individuals", text: [
        "# Blank nodes with _:name — they render as dashed grey diamonds.",
        "ex:Event -a-> owl:Class",
        "ex:Person -a-> owl:Class",
        "",
        "# _:meeting is anonymous — no one refers to it outside this file.",
        "_:meeting -a-> ex:Event",
        "_:meeting -rdfs:label-> \"Weekly stand-up\"",
        "_:meeting -ex:attendee-> ex:alice, ex:bob",
        "",
        "ex:alice -a-> ex:Person",
        "ex:bob -a-> ex:Person"
      ].join("\n") }
    ];
  }

  // v0.7.5 — Simple fuzzy search over WELL_KNOWN_TERMS + optional
  // user-supplied terms. Scores each entry by a mix of prefix / substring
  // / label match, returns top N sorted by score descending.
  function autocompleteSearch(query, opts) {
    opts = opts || {};
    var maxN = opts.max || 20;
    var extraTerms = opts.extra || [];
    var pool = WELL_KNOWN_TERMS.concat(extraTerms);
    var q = (query || "").toLowerCase().trim();
    if (!q) return pool.slice(0, maxN);
    var scored = [];
    for (var i = 0; i < pool.length; i++) {
      var t = pool[i];
      var curie = (t.curie || "").toLowerCase();
      var label = (t.label || "").toLowerCase();
      var iri   = (t.iri || "").toLowerCase();
      var score = 0;
      if (curie === q) score += 1000;
      else if (curie.indexOf(q) === 0) score += 500;
      else if (curie.indexOf(q) > 0) score += 250;
      if (label === q) score += 800;
      else if (label.indexOf(q) === 0) score += 300;
      else if (label.indexOf(q) > 0) score += 150;
      if (iri.indexOf(q) > 0) score += 50;
      if (score > 0) scored.push({ term: t, score: score });
    }
    scored.sort(function(a, b) { return b.score - a.score; });
    return scored.slice(0, maxN).map(function(s) { return s.term; });
  }

  var api = {
    parse: parse,
    toTurtle: toTurtle,
    toGraphData: toGraphData,
    exampleText: exampleText,
    examples: examples,
    autocompleteSearch: autocompleteSearch,
    WELL_KNOWN_TERMS: WELL_KNOWN_TERMS,
    BUILTIN_PREFIXES: BUILTIN_PREFIXES
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.ontoinkDsl = api;

})(typeof window !== "undefined" ? window : globalThis);
