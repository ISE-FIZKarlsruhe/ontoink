# OWL Reasoning Demo

This example demonstrates ontoink's **OWL reasoning** powered by HermiT. A small ontology with an inverse property and a symmetric property is enough to trigger meaningful inferences.

```ontoink
source: shapes/reasoning-demo/shape-data.ttl
shape: shapes/reasoning-demo/shape.ttl
height: 500px
```

!!! note "Reasoning is enabled by default"
    The **Reasoning** button appears automatically when inferred triples are found. Add `reasoning: false` to disable it for a specific diagram.

## What Gets Inferred

| Axiom | Explicit Fact | Inferred |
|:------|:-------------|:---------|
| `isPetOf owl:inverseOf hasPet` | Alice hasPet Rex | **Rex isPetOf Alice** |
| `knows` is `owl:SymmetricProperty` | Alice knows Bob | **Bob knows Alice** |
| `Dog rdfs:subClassOf Animal` | Rex is a Dog | **Rex is an Animal** |

## Try It

1. Click **Reasoning** to see the inferred triples table
2. Check **"Show on graph"** to overlay them as purple dotted edges
3. Click **"Validate with Inferences"** to run SHACL with inferred knowledge

!!! info "Reasoner: HermiT (OWL DL)"
    ontoink uses [HermiT](http://www.hermit-reasoner.com/) via [owlready2](https://owlready2.readthedocs.io/) for full OWL DL reasoning. Falls back to [owlrl](https://owl-rl.readthedocs.io/) if owlready2 is not installed.
