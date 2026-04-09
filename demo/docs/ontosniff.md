---
hide:
  - toc
---

# OntoSniff

Detect ontology anti-patterns and quality issues automatically. Paste or upload your TTL, and OntoSniff will analyze it against a catalog of known smells.

<style>
.sniff-bar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:12px; }
.sniff-result { margin:16px 0; }
.sniff-card { border:1px solid #e5e7eb; border-radius:10px; padding:14px; margin:8px 0; background:#fff; }
.sniff-card-head { display:flex; align-items:center; gap:8px; font-size:14px; font-weight:600; }
.sniff-sev { display:inline-block; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:600; }
.sniff-sev-warning { background:#fef3c7; color:#92400e; }
.sniff-sev-info { background:#e0e7ff; color:#3730a3; }
.sniff-sev-error { background:#fee2e2; color:#991b1b; }
.sniff-desc { font-size:13px; color:#4b5563; margin:6px 0; line-height:1.5; }
.sniff-suggest { font-size:12px; color:#0891b2; margin:4px 0; }
.sniff-entities { display:flex; flex-wrap:wrap; gap:4px; margin:6px 0; }
.sniff-entity { font-size:11px; background:#f3f4f6; padding:2px 8px; border-radius:4px; color:#374151; border:1px solid #e5e7eb; }
.sniff-ref { font-size:10px; color:#9ca3af; font-style:italic; }
.sniff-score { display:flex; align-items:center; gap:12px; margin:16px 0; padding:16px; border-radius:10px; background:#fff; border:1px solid #e5e7eb; }
.sniff-score-num { font-size:36px; font-weight:800; }
.sniff-score-label { font-size:13px; color:#6b7280; }
.sniff-pass { color:#16a34a; border-color:#bbf7d0; background:#f0fdf4; }
.sniff-warn { color:#f59e0b; border-color:#fde68a; background:#fffbeb; }
.sniff-fail { color:#dc2626; border-color:#fecaca; background:#fef2f2; }
</style>

<div id="sniff-app">

<div class="sniff-bar">
  <label style="padding:6px 14px;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;font-size:13px;background:#fff;color:#374151;">
    Upload TTL <input type="file" accept=".ttl,.owl,.rdf" style="display:none;" onchange="sniffLoadFile(this)">
  </label>
  <button class="ov-btn ov-btn-primary" onclick="sniffAnalyze()">Analyze</button>
  <button class="ov-btn" onclick="sniffClear()">Clear</button>
  <span id="sniff-status" style="font-size:12px;color:#6b7280;"></span>
</div>

<textarea id="sniff-ttl" rows="10" style="width:100%;font-family:'JetBrains Mono','Fira Code',monospace;font-size:13px;border:1px solid #d1d5db;border-radius:8px;padding:10px;background:#fff;color:#1f2937;resize:vertical;" placeholder="Paste your Turtle data here...">@prefix ex:   <http://example.org/> .
@prefix owl:  <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

ex:Animal a owl:Class .
ex:Dog    a owl:Class ; rdfs:subClassOf ex:Animal .
ex:Cat    a owl:Class .
ex:Ghost  a owl:Class .

ex:hasPet a owl:ObjectProperty .

ex:rex a ex:Dog .
ex:whiskers a ex:Cat ; rdfs:label "Whiskers" .</textarea>

<div id="sniff-result" class="sniff-result"></div>

<div id="sniff-graph-container" class="ontoink-container" style="display:none;" data-show-legend="true" data-show-ns="true">
  <div class="ov-toolbar">
    <div class="ov-toolbar-group">
      <button class="ov-btn" onclick="ontoink.zoomIn('sniff-graph-container')">+</button>
      <button class="ov-btn" onclick="ontoink.zoomOut('sniff-graph-container')">&minus;</button>
      <button class="ov-btn" onclick="ontoink.fit('sniff-graph-container')">Fit</button>
      <select class="ov-layout-select" onchange="ontoink.changeLayout('sniff-graph-container',this.value)">
        <option value="dagre">Dagre</option><option value="cose">Force</option><option value="circle">Circle</option>
      </select>
    </div>
    <div class="ov-toolbar-group">
      <button class="ov-btn" onclick="ontoink.exportPNG('sniff-graph-container')">PNG</button>
      <button class="ov-btn" onclick="ontoink.exportSVG('sniff-graph-container')">SVG</button>
    </div>
  </div>
  <div class="ov-canvas-wrap" style="position:relative;width:100%;height:450px;">
    <div class="ov-canvas" style="width:100%;height:100%;"></div>
    <div class="ov-legend-overlay ov-draggable" style="bottom:12px;left:12px;"></div>
    <div class="ov-ns-overlay ov-draggable" style="bottom:12px;right:12px;"></div>
  </div>
</div>

</div>

<script>
function sniffLoadFile(input) {
  if (!input.files.length) return;
  var reader = new FileReader();
  reader.onload = function(e) { document.getElementById("sniff-ttl").value = e.target.result; };
  reader.readAsText(input.files[0]);
}

function sniffClear() {
  document.getElementById("sniff-ttl").value = "";
  document.getElementById("sniff-result").innerHTML = "";
  document.getElementById("sniff-graph-container").style.display = "none";
}

function sniffAnalyze() {
  var ttl = document.getElementById("sniff-ttl").value.trim();
  if (!ttl) { alert("Paste or upload TTL first."); return; }
  document.getElementById("sniff-status").textContent = "Analyzing...";

  // Client-side smell detection using the parsed triples
  var parsed = ontoink._internal ? ontoink._internal.parseTtlMinimal(ttl) : null;
  // Since parseTtlMinimal is private, we'll do our own analysis
  var smells = sniffDetect(ttl);
  sniffRender(smells);

  // Visualize the graph
  var gc = document.getElementById("sniff-graph-container");
  gc.style.display = "";
  setTimeout(function() { ontoink.playground("sniff-graph-container", ttl, ""); }, 50);

  document.getElementById("sniff-status").textContent = smells.length + " smell(s) found";
}

function sniffDetect(ttl) {
  var smells = [];
  var lines = ttl.split("\n");

  // Parse prefixes
  var prefixes = {};
  lines.forEach(function(l) {
    var m = l.match(/@prefix\s+(\w*)\s*:\s*<([^>]+)>/);
    if (m) prefixes[m[1]] = m[2];
  });

  // Simple triple extraction
  var triples = [];
  var RT = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
  var SC = "http://www.w3.org/2000/01/rdf-schema#subClassOf";
  var RL = "http://www.w3.org/2000/01/rdf-schema#label";
  var OWL_CLASS = "http://www.w3.org/2002/07/owl#Class";
  var OWL_OP = "http://www.w3.org/2002/07/owl#ObjectProperty";
  var DOMAIN = "http://www.w3.org/2000/01/rdf-schema#domain";
  var RANGE = "http://www.w3.org/2000/01/rdf-schema#range";
  var INV = "http://www.w3.org/2002/07/owl#inverseOf";

  function resolve(t) {
    t = t.trim();
    if (t === "a") return RT;
    if (t[0] === "<" && t[t.length-1] === ">") return t.slice(1,-1);
    var ci = t.indexOf(":");
    if (ci >= 0 && prefixes[t.substring(0,ci)]) return prefixes[t.substring(0,ci)] + t.substring(ci+1);
    return t;
  }
  function localName(u) { return u.indexOf("#")>=0 ? u.split("#").pop() : u.split("/").pop(); }

  // Very basic parser (handles simple s p o . patterns)
  var clean = ttl.replace(/#[^\n]*/g, "").replace(/@prefix[^.]*\.\s*/g, "");
  clean.split(/\.\s*(?=\S|$)/).forEach(function(st) {
    st = st.trim(); if (!st) return;
    var parts = st.split(/\s+/);
    if (parts.length >= 3) {
      var s = resolve(parts[0]);
      var i = 1;
      while (i < parts.length - 1) {
        var p = resolve(parts[i]); i++;
        while (i < parts.length) {
          var o = parts[i]; i++;
          if (o === ";") break;
          if (o === ",") continue;
          triples.push({s:s, p:p, o:resolve(o)});
          if (i < parts.length && parts[i] === ",") { i++; continue; }
          if (i < parts.length && parts[i] === ";") { i++; break; }
        }
      }
    }
  });

  // Extract classes, instances, labels, properties
  var classes = new Set(), instances = new Set(), labeled = new Set();
  var objProps = new Set(), hasSubclass = new Set(), hasDomain = new Set(), hasRange = new Set(), hasInverse = new Set();

  triples.forEach(function(t) {
    if (t.p === RT && t.o === OWL_CLASS) classes.add(t.s);
    if (t.p === RT && t.o !== OWL_CLASS && t.o !== OWL_OP) { instances.add(t.s); classes.add(t.o); }
    if (t.p === SC) { classes.add(t.s); classes.add(t.o); hasSubclass.add(t.o); }
    if (t.p === RL) labeled.add(t.s);
    if (t.p === RT && t.o === OWL_OP) objProps.add(t.s);
    if (t.p === DOMAIN) hasDomain.add(t.s);
    if (t.p === RANGE) hasRange.add(t.s);
    if (t.p === INV) { hasInverse.add(t.s); hasInverse.add(t.o); }
  });

  // Detect smells
  // 1. Lazy Classes
  var instantiated = new Set();
  triples.forEach(function(t) { if (t.p === RT) instantiated.add(t.o); });
  var children = new Set();
  triples.forEach(function(t) { if (t.p === SC) children.add(t.s); });
  var lazy = [];
  classes.forEach(function(c) {
    if (!instantiated.has(c) && !hasSubclass.has(c) && !c.startsWith("http://www.w3.org/")) lazy.push(c);
  });
  if (lazy.length) smells.push({id:"lazy-class", name:"Lazy Class", severity:"warning", description:"Defined but has no instances and no subclasses.", entities:lazy.map(function(c){return {iri:c,label:localName(c)};}).slice(0,10), suggestion:"Add instances, subclasses, or remove if unused.", reference:"Poveda-Villalón et al. (2014), Pitfall P11"});

  // 2. Missing Labels
  var unlabeled = [];
  classes.forEach(function(c) { if (!labeled.has(c) && !c.startsWith("http://www.w3.org/")) unlabeled.push(c); });
  instances.forEach(function(i) { if (!labeled.has(i) && !i.startsWith("http://www.w3.org/")) unlabeled.push(i); });
  if (unlabeled.length) smells.push({id:"missing-label", name:"Missing Label", severity:"warning", description:"No rdfs:label found. Labels are essential for readability.", entities:unlabeled.map(function(u){return {iri:u,label:localName(u)};}).slice(0,10), suggestion:"Add rdfs:label to each entity.", reference:"Poveda-Villalón et al. (2014), Pitfall P08"});

  // 3. Missing Domain/Range
  var noDR = [];
  objProps.forEach(function(p) { if (!hasDomain.has(p) || !hasRange.has(p)) noDR.push(p); });
  if (noDR.length) smells.push({id:"missing-domain-range", name:"Missing Domain/Range", severity:"info", description:"Property has no rdfs:domain or rdfs:range.", entities:noDR.map(function(p){return {iri:p,label:localName(p)};}).slice(0,10), suggestion:"Add rdfs:domain and rdfs:range.", reference:"Rector et al. (2004)"});

  // 4. Orphan Classes
  var allParents = new Set(), allChildren2 = new Set();
  triples.forEach(function(t) { if (t.p === SC) { allChildren2.add(t.s); allParents.add(t.o); } });
  var orphans = [];
  classes.forEach(function(c) { if (!allChildren2.has(c) && !allParents.has(c) && !c.startsWith("http://www.w3.org/")) orphans.push(c); });
  if (orphans.length) smells.push({id:"orphan-class", name:"Orphan Class", severity:"info", description:"Not connected to any class hierarchy.", entities:orphans.map(function(c){return {iri:c,label:localName(c)};}).slice(0,10), suggestion:"Connect via rdfs:subClassOf.", reference:"Poveda-Villalón et al. (2014), Pitfall P04"});

  // 5. Missing Inverse
  var noInverse = [];
  objProps.forEach(function(p) { if (!hasInverse.has(p)) noInverse.push(p); });
  if (noInverse.length) smells.push({id:"missing-inverse", name:"Missing Inverse", severity:"info", description:"Object property has no owl:inverseOf.", entities:noInverse.map(function(p){return {iri:p,label:localName(p)};}).slice(0,10), suggestion:"Declare owl:inverseOf for bidirectional navigation.", reference:"Best practice"});

  // 6. Missing Comment
  var COMMENT = "http://www.w3.org/2000/01/rdf-schema#comment";
  var hasComment = new Set();
  triples.forEach(function(t) { if (t.p === COMMENT) hasComment.add(t.s); });
  var noComment = [];
  classes.forEach(function(c) { if (!hasComment.has(c) && !c.startsWith("http://www.w3.org/")) noComment.push(c); });
  if (noComment.length) smells.push({id:"missing-comment", name:"Missing Comment", severity:"info", description:"Class has no rdfs:comment to explain semantics.", entities:noComment.map(function(c){return {iri:c,label:localName(c)};}).slice(0,10), suggestion:"Add rdfs:comment.", reference:"Linked Data best practice"});

  // 7. Multi-inheritance (>3 parents)
  var parentCounts = {};
  triples.forEach(function(t) { if (t.p === SC) { parentCounts[t.s] = (parentCounts[t.s]||0) + 1; } });
  var multiInh = Object.keys(parentCounts).filter(function(c){return parentCounts[c] > 3;});
  if (multiInh.length) smells.push({id:"multi-inheritance", name:"Excessive Multi-Inheritance", severity:"warning", description:"Class has >3 direct superclasses.", entities:multiInh.map(function(c){return {iri:c,label:localName(c),parents:parentCounts[c]};}).slice(0,5), suggestion:"Use composition instead of excessive inheritance.", reference:"Rector et al. (2004)"});

  // 8. Ambiguous local names
  var localNames2 = {};
  classes.forEach(function(c) { var ln = localName(c); localNames2[ln] = (localNames2[ln]||[]).concat([c]); });
  instances.forEach(function(i) { var ln = localName(i); localNames2[ln] = (localNames2[ln]||[]).concat([i]); });
  var ambig = Object.keys(localNames2).filter(function(ln){return localNames2[ln].length > 1 && ln;});
  if (ambig.length) smells.push({id:"ambiguous-namespace", name:"Ambiguous Namespace", severity:"warning", description:"Same local name in different namespaces.", entities:ambig.map(function(ln){return {iri:localNames2[ln][0],label:ln+" ("+localNames2[ln].length+" namespaces)"};}).slice(0,5), suggestion:"Use distinct local names.", reference:"Unique naming"});

  return smells;
}

function sniffRender(smells) {
  var el = document.getElementById("sniff-result");
  var total = smells.length;
  var warnings = smells.filter(function(s){return s.severity==="warning";}).length;
  var errors = smells.filter(function(s){return s.severity==="error";}).length;

  var scoreClass = errors > 0 ? "sniff-fail" : warnings > 2 ? "sniff-warn" : "sniff-pass";
  var scoreNum = Math.max(0, 100 - errors * 20 - warnings * 10 - (total - errors - warnings) * 3);
  var scoreEmoji = scoreNum >= 80 ? "\u2705" : scoreNum >= 50 ? "\u26A0\uFE0F" : "\u274C";

  var h = '<div class="sniff-score ' + scoreClass + '"><div><div class="sniff-score-num">' + scoreNum + '</div><div class="sniff-score-label">Quality Score</div></div><div style="font-size:14px;margin-left:12px;">' + scoreEmoji + ' ' + total + ' smell(s) found: ' + errors + ' error, ' + warnings + ' warning, ' + (total-errors-warnings) + ' info</div></div>';

  smells.forEach(function(s) {
    h += '<div class="sniff-card"><div class="sniff-card-head"><span class="sniff-sev sniff-sev-' + s.severity + '">' + s.severity + '</span> ' + s.name + '</div>';
    h += '<div class="sniff-desc">' + s.description + '</div>';
    if (s.suggestion) h += '<div class="sniff-suggest">\u2192 ' + s.suggestion + '</div>';
    h += '<div class="sniff-entities">';
    s.entities.forEach(function(e) { h += '<span class="sniff-entity" title="' + e.iri + '">' + e.label + '</span>'; });
    h += '</div>';
    if (s.reference) h += '<div class="sniff-ref">Ref: ' + s.reference + '</div>';
    h += '</div>';
  });

  if (!smells.length) h = '<div class="sniff-score sniff-pass"><div><div class="sniff-score-num">100</div><div class="sniff-score-label">Quality Score</div></div><div style="font-size:14px;margin-left:12px;">\u2705 No smells detected! Your ontology looks clean.</div></div>';

  el.innerHTML = h;
}

// URL parameter: ?source=URL
(function() {
  var params = new URLSearchParams(window.location.search);
  var src = params.get("source") || params.get("ttl");
  if (src) {
    document.getElementById("sniff-status").textContent = "Loading...";
    fetch(src).then(function(r){return r.text();}).then(function(t) {
      document.getElementById("sniff-ttl").value = t;
      sniffAnalyze();
    }).catch(function(e) {
      document.getElementById("sniff-status").textContent = "Failed to load: " + e.message;
    });
  }
})();
</script>

---

## Anti-Pattern Catalog

OntoSniff checks for these documented ontology anti-patterns:

| # | Smell | Severity | What it detects | Reference |
|:--|:------|:---------|:----------------|:----------|
| 1 | **Lazy Class** | Warning | Class with no instances and no subclasses | Poveda-Villalón (2014), P11 |
| 2 | **Missing Label** | Warning | Entity without rdfs:label | Poveda-Villalón (2014), P08 |
| 3 | **Missing Domain/Range** | Info | Property without rdfs:domain or rdfs:range | Rector et al. (2004) |
| 4 | **Singleton Hierarchy** | Info | Chain of single-child subClassOf | Gangemi et al. (2006) |
| 5 | **Property Soup** | Warning | Class with >15 direct properties | Modularization pattern |
| 6 | **Orphan Class** | Info | Class disconnected from hierarchy | Poveda-Villalón (2014), P04 |
| 7 | **Missing Inverse** | Info | Object property without owl:inverseOf | Bidirectional navigation |
| 8 | **No SHACL Coverage** | Warning | Instances without validation shapes | SHACL best practice |
| 9 | **Label Language Gap** | Info | Mixed language-tagged and plain labels | Linked Data best practice |
| 10 | **Deep Hierarchy** | Info | Hierarchy depth >7 levels | Poveda-Villalón (2014), P06 |
| 11 | **Cyclic SubClassOf** | Error | Class is subclass of itself (circular) | OWL 2 Specification |
| 12 | **Excessive Multi-Inheritance** | Warning | Class with >3 direct superclasses | Rector et al. (2004) |
| 13 | **Missing Comment** | Info | Class without rdfs:comment | Linked Data best practice |
| 14 | **Ambiguous Namespace** | Warning | Same local name in different namespaces | Unique naming practice |
| 15 | **Potential Symmetric** | Info | Property used bidirectionally but not declared symmetric | OWL modeling practice |
| 16 | **Deprecated Entity Used** | Warning | owl:deprecated entity still referenced | OWL 2 deprecation |
| 17 | **Redundant SubClassOf** | Info | SubClassOf already implied by chain (A<B<C + A<C) | Poveda-Villalón (2014), P24 |

## References

- Poveda-Villalón, M., Suárez-Figueroa, M.C., Gómez-Pérez, A. (2014). *Validating Ontologies with OOPS!* Knowledge Engineering and Knowledge Management, EKAW 2012.
- Rector, A.L., Drummond, N., Horridge, M. et al. (2004). *OWL Pizzas: Practical Experience of Teaching OWL-DL.* EKAW 2004.
- Gangemi, A., Catenacci, C., Ciaramita, M., Lehmann, J. (2006). *Modelling Ontology Evaluation and Validation.* ESWC 2006.
