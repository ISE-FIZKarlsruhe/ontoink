# Reasoning & Inference

This page is a guided tour of the **reasoning features** ontoink can visualise —
from basic RDFS up to OWL 2 — each with a *small, self-contained* example.

**How to use each diagram:** click **Reasoning**, then read the inferred triples in
the panel. Tick **"Show on graph"** to overlay them as purple edges. Every diagram
below defaults its reasoner dropdown to **Server: OWL-RL**, which materialises the
full RDFS + OWL-RL closure and surfaces every inference listed. Switch to
**HermiT (owlready2)** or **Konclude** to compare an OWL-DL reasoner.

!!! note "Reasoner backends"
    - **OWL-RL** (default here) — pure-Python; the most complete *materialiser* of
      RDFS/OWL inferences, including class subsumptions like `Novel ⊑ Book ⟹ ∃reads.Novel ⊑ ∃reads.Book`.
    - **HermiT / Konclude** — OWL-DL tableau reasoners; strongest on
      classification & consistency.
    - **Browser: Konclude WASM** — runs in your browser (no server), but only
      classifies the T-box (class subsumptions), so it shows fewer instance-level facts.
    - **Browser: OWL-RL (JS)** — a built-in, dependency-free materialiser that runs
      in every browser with no server and no special headers. It covers the RDFS +
      OWL-RL rules used on this page and is also the automatic fallback whenever
      another backend is unavailable.
    - Server backends need the API (`ONTOINK_MODE=all`/`api`); the browser ones work on static hosts.

---

## 1. RDFS — taxonomy & property hierarchies

`rdfs:subClassOf`, `rdfs:subPropertyOf`, `rdfs:domain`, `rdfs:range`.

```ontoink
source: shapes/reasoning-demo/rdfs.ttl
reasoner: owlrl
height: 460px
```

| Axiom | Stated | Inferred |
|:------|:-------|:---------|
| `Dog ⊑ Animal` | `rex a Dog` | `rex a Animal` |
| `hasMother ⊑ hasParent` | `alice hasMother berta` | `alice hasParent berta` |
| `hasPet rdfs:domain Person` | `alice hasPet rex` | `alice a Person` |
| `hasPet rdfs:range Animal` | `alice hasPet rex` | `rex a Animal` |

---

## 2. OWL — property characteristics

`owl:inverseOf`, `owl:SymmetricProperty`, `owl:TransitiveProperty`.

```ontoink
source: shapes/reasoning-demo/properties.ttl
reasoner: owlrl
height: 460px
```

| Characteristic | Stated | Inferred |
|:---------------|:-------|:---------|
| `childOf owl:inverseOf hasChild` | `alice hasChild bob` | `bob childOf alice` |
| `marriedTo a owl:SymmetricProperty` | `alice marriedTo carol` | `carol marriedTo alice` |
| `ancestorOf a owl:TransitiveProperty` | `alice→bob→dan` | `alice ancestorOf dan` |

---

## 3. OWL — identity & keys

`owl:FunctionalProperty`, `owl:InverseFunctionalProperty`, `owl:sameAs`.

```ontoink
source: shapes/reasoning-demo/identity.ttl
reasoner: owlrl
height: 460px
```

| Axiom | Stated | Inferred |
|:------|:-------|:---------|
| `hasBirthMother a owl:FunctionalProperty` | `tom hasBirthMother mary, maria` | `mary owl:sameAs maria` |
| `hasEmail a owl:InverseFunctionalProperty` | `p1, p2 hasEmail e1` | `p1 owl:sameAs p2` |
| `alice owl:sameAs alicia` | `alice knows bob` | `alicia knows bob` |

---

## 4. OWL — class & property equivalence

`owl:equivalentClass`, `owl:equivalentProperty`.

```ontoink
source: shapes/reasoning-demo/equivalence.ttl
reasoner: owlrl
height: 440px
```

| Axiom | Stated | Inferred |
|:------|:-------|:---------|
| `Person ≡ Human` | `alice a Human` | `alice a Person` |
| `enjoys ≡ likes` | `alice likes coffee` | `alice enjoys coffee` |

---

## 5. OWL 2 — property restrictions

### 5a. Existential — `owl:someValuesFrom` (∃)

`Reader ≡ ∃reads.Book`, `NovelReader ≡ ∃reads.Novel`. Because every `Novel` is a
`Book`, the reasoner derives a class subsumption **and** classifies the reader.

```ontoink
source: shapes/reasoning-demo/some-values.ttl
reasoner: owlrl
height: 480px
```

Inferred: `NovelReader ⊑ Reader`, `mobyDick a Book`, `alice a Reader`, `alice a NovelReader`.

### 5b. Universal — `owl:allValuesFrom` (∀)

`VegetarianDish ≡ ∀ingredient.VegetarianFood`, `VeganDish ≡ ∀ingredient.VeganFood`.

```ontoink
source: shapes/reasoning-demo/all-values.ttl
reasoner: owlrl
height: 480px
```

Inferred: `VeganDish ⊑ VegetarianDish`, `buddhaBowl a VegetarianDish`, `tofu a VegetarianFood`.

### 5c. Value — `owl:hasValue`

`Italian ≡ (bornIn = Italy)`.

```ontoink
source: shapes/reasoning-demo/has-value.ttl
reasoner: owlrl
height: 420px
```

Inferred: `mario a Italian`.

---

## 6. OWL 2 — boolean class constructors

### 6a. Intersection — `owl:intersectionOf` (⊓)

`Mother ≡ Woman ⊓ Parent` (a defined class).

```ontoink
source: shapes/reasoning-demo/intersection.ttl
reasoner: owlrl
height: 440px
```

Inferred: `mary a Mother`, `Mother ⊑ Woman`, `Mother ⊑ Parent`.

### 6b. Union — `owl:unionOf` (⊔)

`Parent ≡ Mother ⊔ Father`.

```ontoink
source: shapes/reasoning-demo/union.ttl
reasoner: owlrl
height: 440px
```

Inferred: `Mother ⊑ Parent`, `Father ⊑ Parent`, `mary a Parent`.

---

## 7. OWL 2 — property chains

`owl:propertyChainAxiom`: `hasParent ∘ hasParent ⟹ hasGrandparent`.

```ontoink
source: shapes/reasoning-demo/property-chain.ttl
reasoner: owlrl
height: 420px
```

Inferred: `anna hasGrandparent carl`.

---

## 8. Necessary vs. definition — `rdfs:subClassOf` vs `owl:equivalentClass`

The **same** restriction body, `∃reads.Book`, attached two ways. ontoink draws them
differently — `⊑` (solid triangle) for the necessary condition, `≡` (hollow diamond)
for the definition — and the reasoner treats them differently.

```ontoink
source: shapes/reasoning-demo/subclass-vs-equivalent.ttl
reasoner: owlrl
height: 480px
```

- `Subscriber rdfs:subClassOf ∃reads.Book` — *necessary*: every Subscriber reads a Book, but a book-reader is **not** inferred to be a Subscriber.
- `BookLover owl:equivalentClass ∃reads.Book` — *definition*: a BookLover is *exactly* a book-reader, so `alice` **is** classified as a `BookLover`.

Inferred: `alice a BookLover` and `Subscriber ⊑ BookLover` — but **not** `alice a Subscriber`.

---

## 9. Reasoning + SHACL together

A small ontology with an inverse property, a symmetric property and a subclass.
After reasoning, click **"Validate with Inferences"** to run the SHACL shape over
the *reasoned* graph (the `Person` shape requires an `rdfs:label`).

```ontoink
source: shapes/reasoning-demo/shape-data.ttl
shape:  shapes/reasoning-demo/shape.ttl
reasoner: owlrl
height: 500px
```

Inferred: `rex isPetOf alice` (inverse), `bob knows alice` (symmetric), `rex a Animal` (subclass).

---

## Coverage at a glance

| Standard | Feature | Example |
|:---------|:--------|:--------|
| RDFS | `subClassOf`, `subPropertyOf`, `domain`, `range` | §1 |
| OWL | `inverseOf`, `SymmetricProperty`, `TransitiveProperty` | §2 |
| OWL | `FunctionalProperty`, `InverseFunctionalProperty`, `sameAs` | §3 |
| OWL | `equivalentClass`, `equivalentProperty` | §4 |
| OWL 2 | `someValuesFrom`, `allValuesFrom`, `hasValue` | §5 |
| OWL 2 | `intersectionOf`, `unionOf` | §6 |
| OWL 2 | `propertyChainAxiom` | §7 |
| Modelling | `subClassOf` vs `equivalentClass` (necessary vs definition) | §8 |
| SHACL | validation over inferred triples | §9 |

!!! tip "Try your own"
    Open the **Playground** and paste any of these snippets (or your own ontology),
    then click **Reasoning** and switch backends to see how RDFS, OWL-RL and OWL-DL
    reasoners differ.
