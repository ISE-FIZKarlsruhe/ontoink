---
hide:
  - toc
---

# SPARQL Explorer

Connect to any SPARQL endpoint, discover the schema, explore classes and properties visually, and write queries with auto-complete.

<style>
.spx-bar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:12px; }
.spx-bar input { flex:1; min-width:250px; padding:6px 12px; border:1px solid #d1d5db; border-radius:6px; font-size:13px; color:#374151; background:#fff; font-family:inherit; }
.spx-bar input:focus { border-color:#0891b2; outline:1px solid #0891b2; }
.spx-status { font-size:12px; color:#6b7280; }
.spx-status.ok { color:#16a34a; }
.spx-status.err { color:#dc2626; }
.spx-grid { display:grid; grid-template-columns:2fr 1fr; gap:12px; margin:12px 0; }
@media(max-width:900px){ .spx-grid{grid-template-columns:1fr;} }
.spx-sidebar { max-height:600px; overflow-y:auto; font-size:12px; }
.spx-sidebar-section { margin-bottom:12px; }
.spx-sidebar-section summary { cursor:pointer; user-select:none; padding:4px 0; }
.spx-sidebar-section summary strong { font-size:11px; text-transform:uppercase; color:#6366f1; letter-spacing:0.5px; }
.spx-item { padding:4px 8px; margin:2px 0; border-radius:4px; cursor:pointer; display:flex; justify-content:space-between; color:#374151; background:#fff; border:1px solid #e5e7eb; }
.spx-item:hover { background:#ede9fe; border-color:#c4b5fd; }
.spx-item .spx-count { color:#9ca3af; font-size:11px; }
.spx-query-section { margin:12px 0; }
.spx-query-grid { display:grid; grid-template-columns:220px 1fr; gap:12px; }
@media(max-width:700px){ .spx-query-grid{grid-template-columns:1fr;} }
.spx-query-editor { width:100%; min-height:220px; font-family:'JetBrains Mono','Fira Code',monospace; font-size:13px; padding:10px; border:1px solid #d1d5db; border-radius:8px; color:#1f2937; background:#fff; resize:vertical; line-height:1.5; }
.spx-builder { display:flex; flex-direction:column; gap:6px; }
.spx-builder select, .spx-builder input { padding:5px 8px; border:1px solid #d1d5db; border-radius:6px; font-size:13px; color:#374151; background:#fff; }
.spx-query-editor:focus { outline:1px solid #10b981; }
.spx-result-table { width:100%; border-collapse:collapse; font-size:12px; margin-top:8px; background:#fff; border-radius:8px; overflow:hidden; border:1px solid #e5e7eb; }
.spx-result-table th { text-align:left; padding:8px 10px; background:#1f2937; color:#f9fafb; font-size:11px; font-weight:700; letter-spacing:0.3px; }
.spx-result-table td { padding:6px 10px; border-bottom:1px solid #f3f4f6; color:#374151; max-width:350px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.spx-result-table tr:nth-child(even) td { background:#f9fafb; }
.spx-result-table tr:hover td { background:#ede9fe; }
.spx-actions { display:flex; gap:8px; flex-wrap:wrap; margin:8px 0; align-items:center; }
.spx-help { font-size:11px; color:#9ca3af; margin-top:4px; }
</style>

<div id="spx-app">

<div class="spx-bar">
  <select id="spx-presets" onchange="spxSelectPreset(this.value)" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;color:#374151;background:#fff;">
    <option value="">-- Presets --</option>
    <option value="https://nfdi.fiz-karlsruhe.de/matwerk/sparql">NFDI MatWerk</option>
    <option value="https://dbpedia.org/sparql">DBpedia (large, lightweight mode)</option>
    <option value="https://query.wikidata.org/sparql">Wikidata (large, lightweight mode)</option>
  </select>
  <input id="spx-endpoint" placeholder="https://your-endpoint/sparql" value="https://nfdi.fiz-karlsruhe.de/matwerk/sparql">
  <button class="ov-btn ov-btn-primary" onclick="spxConnect()">Connect</button>
  <select id="spx-limit" style="padding:5px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:12px;color:#374151;background:#fff;" title="Max classes/properties to load">
    <option value="50">50 items</option>
    <option value="100" selected>100 items</option>
    <option value="300">300 items</option>
    <option value="1000">1000 items</option>
    <option value="0">All (slow)</option>
  </select>
  <span id="spx-status" class="spx-status"></span>
</div>

<div id="spx-schema-section" style="display:none;">
  <div class="spx-grid">
    <div>
      <div id="spx-schema-container" class="ontoink-container" data-show-legend="true" data-show-ns="true">
        <div class="ov-toolbar">
          <div class="ov-toolbar-group">
            <button class="ov-btn" onclick="ontoink.zoomIn('spx-schema-container')">+</button>
            <button class="ov-btn" onclick="ontoink.zoomOut('spx-schema-container')">&minus;</button>
            <button class="ov-btn" onclick="ontoink.fit('spx-schema-container')">Fit</button>
            <select class="ov-layout-select" onchange="ontoink.changeLayout('spx-schema-container',this.value)">
              <option value="dagre">Dagre</option><option value="cose">Force</option><option value="circle">Circle</option>
              <option value="concentric">Concentric</option><option value="breadthfirst">Tree</option>
            </select>
          </div>
          <div class="ov-toolbar-group">
            <input class="ov-search-input" type="text" placeholder="Search..." oninput="ontoink.search('spx-schema-container',this.value)">
          </div>
          <div class="ov-toolbar-group">
            <button class="ov-btn" onclick="ontoink.exportPNG('spx-schema-container')">PNG</button>
            <button class="ov-btn" onclick="ontoink.exportSVG('spx-schema-container')">SVG</button>
          </div>
        </div>
        <div class="ov-canvas-wrap" style="position:relative;width:100%;height:500px;">
          <div class="ov-canvas" style="width:100%;height:100%;"></div>
          <div class="ov-legend-overlay ov-draggable" style="bottom:12px;left:12px;"></div>
          <div class="ov-ns-overlay ov-draggable" style="bottom:12px;right:12px;"></div>
          <div class="ov-minimap" style="position:absolute;top:8px;right:8px;width:150px;height:100px;border:1px solid #d1d5db;border-radius:6px;background:rgba(255,255,255,0.9);overflow:hidden;"></div>
        </div>
        <div class="ov-stats-panel" style="display:none;"></div>
      </div>
    </div>
    <div class="spx-sidebar">
      <details open class="spx-sidebar-section">
        <summary><strong>Classes</strong></summary>
        <input type="text" placeholder="Filter classes..." oninput="spxFilterList('spx-class-list',this.value)" style="width:100%;padding:4px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:11px;margin:4px 0;color:#374151;background:#fff;">
        <div id="spx-class-list" style="max-height:250px;overflow-y:auto;"></div>
      </details>
      <details open class="spx-sidebar-section">
        <summary><strong>Properties</strong></summary>
        <input type="text" placeholder="Filter properties..." oninput="spxFilterList('spx-prop-list',this.value)" style="width:100%;padding:4px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:11px;margin:4px 0;color:#374151;background:#fff;">
        <div id="spx-prop-list" style="max-height:250px;overflow-y:auto;"></div>
      </details>
    </div>
  </div>
</div>

<div id="spx-query-section" style="display:none;">
  <h3 style="margin:0 0 8px;font-size:15px;color:#1f2937;">Query Builder</h3>
  <div class="spx-query-grid">
    <div class="spx-builder">
      <label style="font-size:12px;font-weight:600;color:#4b5563;">Template</label>
      <select id="spx-template" onchange="spxAutoUpdateQuery()">
        <option value="">-- Select --</option>
        <option value="count">Count instances of a class</option>
        <option value="label">Find by label (text search)</option>
        <option value="props">All properties of a class</option>
        <option value="explore">Explore property values</option>
        <option value="describe">Describe a resource</option>
        <option value="triples">Sample triples</option>
      </select>
      <label style="font-size:12px;font-weight:600;color:#4b5563;">Class</label>
      <select id="spx-class-select" onchange="spxAutoUpdateQuery()"><option value="">--</option></select>
      <label style="font-size:12px;font-weight:600;color:#4b5563;">Property</label>
      <select id="spx-prop-select" onchange="spxAutoUpdateQuery()"><option value="">--</option></select>
      <label style="font-size:12px;font-weight:600;color:#4b5563;">Search text / IRI</label>
      <input id="spx-param" placeholder="e.g., Person or full IRI">
      <div class="spx-help">Select a template and fill in the fields, or write your own SPARQL. Press <strong>Ctrl+Space</strong> in the editor for autocomplete (classes, properties, keywords with fuzzy search).</div>
    </div>
    <div>
      <textarea id="spx-query-editor" class="spx-query-editor">SELECT ?s ?p ?o WHERE {
  ?s ?p ?o
} LIMIT 20</textarea>
    </div>
  </div>
  <div class="spx-actions">
    <button class="ov-btn ov-btn-primary" onclick="spxRunQuery()">Run Query</button>
    <button class="ov-btn" onclick="spxVisualizeResults()">Visualize Results</button>
    <span id="spx-query-status" class="spx-status"></span>
  </div>
</div>

<div id="spx-results" style="display:none;">
  <h3 style="margin:0 0 8px;font-size:15px;color:#1f2937;">Results <span id="spx-result-count" style="font-size:12px;color:#6b7280;"></span></h3>
  <div id="spx-result-table-wrap" style="max-height:400px;overflow:auto;background:#fff;border-radius:8px;padding:4px;"></div>
  <div id="spx-result-container" class="ontoink-container" style="display:none;" data-show-legend="true" data-show-ns="true">
    <div class="ov-toolbar">
      <div class="ov-toolbar-group">
        <button class="ov-btn" onclick="ontoink.zoomIn('spx-result-container')">+</button>
        <button class="ov-btn" onclick="ontoink.zoomOut('spx-result-container')">&minus;</button>
        <button class="ov-btn" onclick="ontoink.fit('spx-result-container')">Fit</button>
        <select class="ov-layout-select" onchange="ontoink.changeLayout('spx-result-container',this.value)">
          <option value="dagre">Dagre</option><option value="cose">Force</option><option value="circle">Circle</option>
        </select>
      </div>
      <div class="ov-toolbar-group">
        <button class="ov-btn" onclick="ontoink.exportPNG('spx-result-container')">PNG</button>
        <button class="ov-btn" onclick="ontoink.exportSVG('spx-result-container')">SVG</button>
      </div>
    </div>
    <div class="ov-canvas-wrap" style="position:relative;width:100%;height:400px;">
      <div class="ov-canvas" style="width:100%;height:100%;"></div>
      <div class="ov-legend-overlay ov-draggable" style="bottom:12px;left:12px;"></div>
      <div class="ov-ns-overlay ov-draggable" style="bottom:12px;right:12px;"></div>
    </div>
  </div>
</div>

</div>

<script>
var spxState = { endpoint:"", classes:[], hierarchy:[], objProps:[], labels:{}, prefixes:{} };
var spxResults = [];

function spxStatus(msg, ok) {
  var el = document.getElementById("spx-status");
  el.textContent = msg; el.className = "spx-status" + (ok === true ? " ok" : ok === false ? " err" : "");
}
function spxQStatus(msg) { document.getElementById("spx-query-status").textContent = msg; }

function spxSelectPreset(url) { if (url) document.getElementById("spx-endpoint").value = url; }

async function spxQuery(endpoint, sparql, timeoutMs) {
  timeoutMs = timeoutMs || 30000;
  var controller = new AbortController();
  var timer = setTimeout(function() { controller.abort(); }, timeoutMs);
  try {
    var encoded = encodeURIComponent(sparql);
    var resp = encoded.length > 1500
      ? await fetch(endpoint, { method:"POST", headers:{"Accept":"application/sparql-results+json","Content-Type":"application/x-www-form-urlencoded"}, body:"query="+encoded, signal:controller.signal })
      : await fetch(endpoint+"?query="+encoded, { headers:{"Accept":"application/sparql-results+json"}, signal:controller.signal });
    clearTimeout(timer);
    if (!resp.ok) throw new Error(resp.status+" "+resp.statusText);
    return resp.json();
  } catch(e) {
    clearTimeout(timer);
    if (e.name === "AbortError") throw new Error("Query timed out (" + (timeoutMs/1000) + "s)");
    throw e;
  }
}

function spxShorten(iri) {
  for (var p in spxState.prefixes) {
    if (iri.indexOf(spxState.prefixes[p]) === 0) return p + ":" + iri.substring(spxState.prefixes[p].length);
  }
  return iri.indexOf("#") >= 0 ? iri.split("#").pop() : iri.split("/").pop() || iri;
}

async function spxConnect() {
  var endpoint = document.getElementById("spx-endpoint").value.trim();
  if (!endpoint) { spxStatus("Enter an endpoint URL", false); return; }
  spxState.endpoint = endpoint;
  spxState.classes = []; spxState.hierarchy = []; spxState.objProps = []; spxState.labels = {};
  var limit = parseInt(document.getElementById("spx-limit").value) || 100;
  var limitClause = limit > 0 ? " LIMIT " + limit : "";
  var timeout = limit > 300 ? 30000 : 15000;
  spxStatus("Connecting...");

  try {
    // Phase 1: Quick probe
    spxStatus("Probing endpoint...");
    await spxQuery(endpoint, "SELECT * WHERE { ?s ?p ?o } LIMIT 1", 10000);

    // Phase 2: Discover classes
    spxStatus("Discovering classes (" + (limit > 0 ? "max " + limit : "all") + ")...");
    try {
      var classRes = await spxQuery(endpoint, "SELECT ?class (COUNT(?inst) AS ?count) WHERE { ?inst a ?class . } GROUP BY ?class ORDER BY DESC(?count)" + limitClause, timeout);
      spxState.classes = classRes.results.bindings.map(function(b) {
        return { iri: b["class"].value, count: parseInt(b["count"].value) || 0 };
      }).filter(function(c) { return c.iri.indexOf("http") === 0; });
    } catch(e) {
      spxStatus("Large endpoint, using lightweight discovery...");
      var classRes2 = await spxQuery(endpoint, "SELECT DISTINCT ?class WHERE { ?s a ?class . FILTER(isIRI(?class)) }" + limitClause, timeout);
      spxState.classes = classRes2.results.bindings.map(function(b) {
        return { iri: b["class"].value, count: 0 };
      });
    }

    // Phase 3: Hierarchy
    spxStatus("Discovering hierarchy...");
    try {
      var hierRes = await spxQuery(endpoint, "SELECT ?sub ?super WHERE { ?sub <http://www.w3.org/2000/01/rdf-schema#subClassOf> ?super . FILTER(isIRI(?sub) && isIRI(?super)) } LIMIT 500", 10000);
      spxState.hierarchy = hierRes.results.bindings.map(function(b) { return { sub: b["sub"].value, super_: b["super"].value }; });
    } catch(e) { spxState.hierarchy = []; }

    // Phase 4: Properties
    spxStatus("Discovering properties (" + (limit > 0 ? "max " + limit : "all") + ")...");
    try {
      var propRes = await spxQuery(endpoint, "SELECT ?prop ?domain ?range (COUNT(*) AS ?count) WHERE { ?s ?prop ?o . ?s a ?domain . ?o a ?range . FILTER(isIRI(?o) && ?prop != <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>) } GROUP BY ?prop ?domain ?range ORDER BY DESC(?count)" + limitClause, timeout);
      spxState.objProps = propRes.results.bindings.map(function(b) {
        return { prop: b["prop"].value, domain: b["domain"].value, range: b["range"].value, count: parseInt(b["count"].value) || 0 };
      });
    } catch(e) {
      try {
        var propRes2 = await spxQuery(endpoint, "SELECT DISTINCT ?prop WHERE { ?s ?prop ?o . FILTER(isIRI(?prop) && ?prop != <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>) }" + limitClause, timeout);
        spxState.objProps = propRes2.results.bindings.map(function(b) {
          return { prop: b["prop"].value, domain: "", range: "", count: 0 };
        });
      } catch(e2) { spxState.objProps = []; }
    }

    // Phase 5: Labels — fetch in batches (classes + properties separately)
    spxStatus("Fetching labels...");
    var labelPreds = [
      "<http://www.w3.org/2000/01/rdf-schema#label>",
      "<http://www.w3.org/2004/02/skos/core#prefLabel>",
      "<http://schema.org/name>"
    ];
    async function fetchLabelBatch(iris) {
      if (!iris.length) return;
      var values = iris.map(function(i){return "<"+i+">";}).join(" ");
      // Try each label predicate
      for (var li = 0; li < labelPreds.length; li++) {
        // Approach 1: VALUES (standard SPARQL 1.1)
        try {
          var q = "SELECT ?iri ?label WHERE { VALUES ?iri { " + values + " } ?iri " + labelPreds[li] + " ?label . }";
          var r = await spxQuery(endpoint, q, 15000);
          r.results.bindings.forEach(function(b) {
            if (!spxState.labels[b["iri"].value]) spxState.labels[b["iri"].value] = b["label"].value;
          });
          if (r.results.bindings.length > 0) return;
        } catch(e) {}
        // Approach 2: FILTER IN (for endpoints that don't support VALUES well)
        try {
          var filterIris = iris.map(function(i){return "<"+i+">";}).join(", ");
          var q2 = "SELECT ?iri ?label WHERE { ?iri " + labelPreds[li] + " ?label . FILTER(?iri IN (" + filterIris + ")) }";
          var r2 = await spxQuery(endpoint, q2, 15000);
          r2.results.bindings.forEach(function(b) {
            if (!spxState.labels[b["iri"].value]) spxState.labels[b["iri"].value] = b["label"].value;
          });
          if (r2.results.bindings.length > 0) return;
        } catch(e2) {}
      }
    }
    // Fetch labels in small chunks (30 IRIs each for reliability)
    var classIris = spxState.classes.map(function(c){return c.iri;});
    var propIris2 = []; var seenProp2 = {};
    spxState.objProps.forEach(function(p) {
      if (!seenProp2[p.prop]) { propIris2.push(p.prop); seenProp2[p.prop] = true; }
    });
    var allLabelIris = classIris.concat(propIris2);
    // Remove duplicates
    allLabelIris = allLabelIris.filter(function(v,i,a){return a.indexOf(v)===i;});
    var chunkSize = 30; // small chunks for endpoint compatibility
    for (var bi = 0; bi < allLabelIris.length; bi += chunkSize) {
      spxStatus("Fetching labels (" + Math.min(bi + chunkSize, allLabelIris.length) + "/" + allLabelIris.length + ")...");
      await fetchLabelBatch(allLabelIris.slice(bi, bi + chunkSize));
    }

    // Auto-detect prefixes
    spxState.prefixes = {"rdf":"http://www.w3.org/1999/02/22-rdf-syntax-ns#","rdfs":"http://www.w3.org/2000/01/rdf-schema#","owl":"http://www.w3.org/2002/07/owl#","xsd":"http://www.w3.org/2001/XMLSchema#"};
    var KNOWN_PFX = {"http://xmlns.com/foaf/0.1/":"foaf","http://schema.org/":"schema","http://purl.org/dc/terms/":"dcterms","http://www.w3.org/2004/02/skos/core#":"skos","https://nfdi.fiz-karlsruhe.de/ontology/":"nfdicore","http://purl.obolibrary.org/obo/":"obo","http://www.w3.org/ns/prov#":"prov","http://dbpedia.org/ontology/":"dbo","http://dbpedia.org/property/":"dbp","http://www.wikidata.org/entity/":"wd","http://www.wikidata.org/prop/":"wdt"};
    spxState.classes.concat(spxState.objProps).forEach(function(item) {
      var iri = item.iri || item.prop || "";
      for (var uri in KNOWN_PFX) { if (iri.indexOf(uri) === 0 && !spxState.prefixes[KNOWN_PFX[uri]]) spxState.prefixes[KNOWN_PFX[uri]] = uri; }
    });

    // Phase 5b: For IRIs still without labels, fetch from ontology source files
    var missingLabels = allLabelIris.filter(function(iri) { return !spxState.labels[iri]; });
    if (missingLabels.length > 0) {
      spxStatus("Fetching labels from ontology sources...");
      var nsGroups = {};
      missingLabels.forEach(function(iri) {
        var ns = iri.indexOf("#") >= 0 ? iri.substring(0, iri.lastIndexOf("#") + 1) : iri.substring(0, iri.lastIndexOf("/") + 1);
        if (!nsGroups[ns]) nsGroups[ns] = [];
        nsGroups[ns].push(iri);
      });
      var ONTO_URLS = {
        "https://nfdi.fiz-karlsruhe.de/ontology/": "https://ise-fizkarlsruhe.github.io/nfdicore/3.0.4/ontology.ttl",
        "http://purl.obolibrary.org/obo/BFO_": "https://raw.githubusercontent.com/BFO-ontology/BFO-2020/master/src/owl/bfo-2020.owl",
        "http://purl.obolibrary.org/obo/IAO_": "https://raw.githubusercontent.com/information-artifact-ontology/IAO/master/src/ontology/iao.owl",
        "http://purl.obolibrary.org/obo/RO_": "https://raw.githubusercontent.com/oborel/obo-relations/master/ro.owl",
        "http://xmlns.com/foaf/0.1/": "https://xmlns.com/foaf/spec/index.rdf",
        "http://www.w3.org/2004/02/skos/core#": "https://www.w3.org/2009/08/skos-reference/skos.rdf",
        "https://schema.org/": "https://schema.org/version/latest/schemaorg-current-https.jsonld",
      };
      // Resolve namespace to a known URL
      function resolveNsUrl(ns) {
        for (var key in ONTO_URLS) { if (ns.indexOf(key) === 0 || key.indexOf(ns) === 0) return ONTO_URLS[key]; }
        return ns; // try the namespace itself as fallback
      }
      var fetchedNs = {};
      for (var ns in nsGroups) {
        if (fetchedNs[ns]) continue; fetchedNs[ns] = true;
        var url = resolveNsUrl(ns);
        try {
          spxStatus("Fetching ontology: " + ns.split("/").slice(2, 4).join("/") + "...");
          var ontoResp = await fetch(url, { headers: { "Accept": "text/turtle, application/rdf+xml;q=0.9" }, mode: "cors", redirect: "follow" });
          if (!ontoResp.ok) continue;
          var ct = ontoResp.headers.get("content-type") || "";
          var body = await ontoResp.text();
          // Parse and extract rdfs:label triples
          var RL = "http://www.w3.org/2000/01/rdf-schema#label";
          if (ct.indexOf("xml") >= 0 || (body.trimStart().charAt(0) === '<' && body.indexOf("rdf:RDF") >= 0)) {
            // Parse RDF/XML
            try {
              var doc = new DOMParser().parseFromString(body, "application/xml");
              var els = doc.querySelectorAll("*");
              for (var ei = 0; ei < els.length; ei++) {
                var about = els[ei].getAttributeNS("http://www.w3.org/1999/02/22-rdf-syntax-ns#", "about") || els[ei].getAttribute("rdf:about");
                if (!about) continue;
                for (var ej = 0; ej < els[ei].children.length; ej++) {
                  var ch = els[ei].children[ej];
                  if ((ch.namespaceURI === "http://www.w3.org/2000/01/rdf-schema#" && ch.localName === "label") ||
                      (ch.namespaceURI === "http://www.w3.org/2004/02/skos/core#" && ch.localName === "prefLabel")) {
                    if (ch.textContent && !spxState.labels[about]) spxState.labels[about] = ch.textContent;
                  }
                }
              }
            } catch(xmlErr) {}
          } else {
            // Parse Turtle line-by-line (robust, handles complex OWL)
            var lines = body.split("\n"), pfx = {}, curSubj = "", inTripleQuote = false, bDepth = 0, pDepth = 0;
            for (var li2 = 0; li2 < lines.length; li2++) {
              var ln = lines[li2];
              var pfxM = ln.match(/^@prefix\s+(\w*)\s*:\s*<([^>]+)>\s*\./);
              if (pfxM) { pfx[pfxM[1]] = pfxM[2]; continue; }
              if (/^\s*#/.test(ln) || /^\s*$/.test(ln) || /^#{2,}/.test(ln)) continue;
              if (inTripleQuote) { if (ln.indexOf('"""') >= 0) inTripleQuote = false; continue; }
              if ((ln.match(/"""/g)||[]).length === 1) { inTripleQuote = true; continue; }
              for (var ci4 = 0; ci4 < ln.length; ci4++) { if (ln[ci4]==='[') bDepth++; else if (ln[ci4]===']') bDepth--; else if (ln[ci4]==='(') pDepth++; else if (ln[ci4]===')') pDepth--; }
              var trim2 = ln.trimStart();
              if (trim2.charAt(0) === '<' || (/^\w+:\w/.test(trim2) && ln.charAt(0) !== ' ' && ln.charAt(0) !== '\t')) {
                var sm = trim2.match(/^(<[^>]+>)/);
                if (sm) curSubj = sm[1].slice(1,-1);
                else { var sm2 = trim2.match(/^(\w+:\w+)/); if (sm2) { var ci5=sm2[1].indexOf(':'); var pp=sm2[1].substring(0,ci5); curSubj=pfx[pp]?pfx[pp]+sm2[1].substring(ci5+1):sm2[1]; } }
                bDepth = 0; pDepth = 0;
                for (var ci6 = 0; ci6 < ln.length; ci6++) { if (ln[ci6]==='[') bDepth++; else if (ln[ci6]===']') bDepth--; else if (ln[ci6]==='(') pDepth++; else if (ln[ci6]===')') pDepth--; }
              }
              if (!curSubj || bDepth > 0 || pDepth > 0) continue;
              // Extract rdfs:label
              var labelIdx = trim2.indexOf("rdfs:label");
              if (labelIdx < 0 && trim2.indexOf("skos:prefLabel") < 0) {
                if (/\.\s*$/.test(trim2) && bDepth <= 0 && pDepth <= 0) curSubj = "";
                continue;
              }
              var predStr = labelIdx >= 0 ? "rdfs:label" : "skos:prefLabel";
              var afterPred = trim2.substring(trim2.indexOf(predStr) + predStr.length).trim();
              var litM = afterPred.match(/^"((?:[^"\\]|\\.)*)"/);
              if (litM && !spxState.labels[curSubj]) spxState.labels[curSubj] = litM[1];
              if (/\.\s*$/.test(trim2) && bDepth <= 0 && pDepth <= 0) curSubj = "";
            }
          }
        } catch(fetchErr) { /* silently skip unreachable ontologies */ }
      }
    }

    var labelCount = Object.keys(spxState.labels).length;
    var uniqueProps = {}; spxState.objProps.forEach(function(p){uniqueProps[p.prop]=true;});
    spxStatus(spxState.classes.length + " classes, " + Object.keys(uniqueProps).length + " properties, " + labelCount + " labels loaded", true);
    spxRenderSchema();
    spxRenderSidebar();
    spxPopulateSelects();
    document.getElementById("spx-schema-section").style.display = "";
    document.getElementById("spx-query-section").style.display = "";

    // Update URL for sharing
    if (window.history.replaceState) {
      window.history.replaceState({}, "", window.location.pathname + "?endpoint=" + encodeURIComponent(endpoint));
    }
  } catch(e) {
    spxStatus("Error: " + e.message, false);
  }
}

function spxRenderSchema() {
  var pf = spxState.prefixes;
  var ttl = "";
  for (var p in pf) ttl += "@prefix " + p + ": <" + pf[p] + "> .\n";
  ttl += "@prefix owl: <http://www.w3.org/2002/07/owl#> .\n";
  ttl += "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n\n";

  spxState.classes.forEach(function(c) {
    var label = spxState.labels[c.iri] || spxShorten(c.iri);
    ttl += "<" + c.iri + "> a owl:Class ; rdfs:label \"" + label + " (" + c.count + ")\" .\n";
  });
  spxState.hierarchy.forEach(function(h) {
    ttl += "<" + h.sub + "> rdfs:subClassOf <" + h.super_ + "> .\n";
  });
  spxState.objProps.forEach(function(p) {
    ttl += "<" + p.prop + "> a owl:ObjectProperty ; rdfs:domain <" + p.domain + "> ; rdfs:range <" + p.range + "> ; rdfs:label \"" + spxShorten(p.prop) + " (" + p.count + ")\" .\n";
  });

  setTimeout(function() { ontoink.playground("spx-schema-container", ttl, ""); }, 50);
}

function spxDisplayLabel(iri) {
  var label = spxState.labels[iri];
  var short = spxShorten(iri);
  return label ? label : short;
}

function spxRenderSidebar() {
  var ch = "";
  spxState.classes.forEach(function(c) {
    var label = spxDisplayLabel(c.iri);
    var short = spxShorten(c.iri);
    var countStr = c.count > 0 ? c.count : "";
    ch += '<div class="spx-item" onclick="spxInsertClass(\'' + c.iri.replace(/'/g,"\\'") + '\')">';
    ch += '<div><div style="font-weight:500;">' + label + '</div><div style="font-size:10px;color:#9ca3af;word-break:break-all;">' + short + '</div></div>';
    if (countStr) ch += '<span class="spx-count">' + countStr + '</span>';
    ch += '</div>';
  });
  document.getElementById("spx-class-list").innerHTML = ch || '<div style="color:#9ca3af;">No classes found</div>';

  var ph = "";
  var seen = {};
  spxState.objProps.forEach(function(p) {
    if (seen[p.prop]) return; seen[p.prop] = true;
    var label = spxDisplayLabel(p.prop);
    var short = spxShorten(p.prop);
    var countStr = p.count > 0 ? p.count : "";
    ph += '<div class="spx-item" onclick="spxInsertProp(\'' + p.prop.replace(/'/g,"\\'") + '\')">';
    ph += '<div><div style="font-weight:500;">' + label + '</div><div style="font-size:10px;color:#9ca3af;word-break:break-all;">' + short + '</div></div>';
    if (countStr) ph += '<span class="spx-count">' + countStr + '</span>';
    ph += '</div>';
  });
  document.getElementById("spx-prop-list").innerHTML = ph || '<div style="color:#9ca3af;">No properties found</div>';
}

function spxOptionText(iri, count) {
  var label = spxState.labels[iri] || "";
  var short = spxShorten(iri);
  var parts = [];
  if (label && label !== short) parts.push(label);
  parts.push(short);
  if (count > 0) parts.push("(" + count + ")");
  return parts.join(" — ");
}

function spxPopulateSelects() {
  var co = '<option value="">-- select class --</option>';
  spxState.classes.forEach(function(c) {
    co += '<option value="' + c.iri + '">' + spxOptionText(c.iri, c.count) + '</option>';
  });
  document.getElementById("spx-class-select").innerHTML = co;

  var po = '<option value="">-- select property --</option>';
  var seen = {};
  spxState.objProps.forEach(function(p) {
    if (seen[p.prop]) return; seen[p.prop] = true;
    po += '<option value="' + p.prop + '">' + spxOptionText(p.prop, p.count) + '</option>';
  });
  document.getElementById("spx-prop-select").innerHTML = po;

  // Build autocomplete catalog for the query editor
  spxBuildAutocomplete();
}

function spxFilterList(listId, query) {
  var items = document.getElementById(listId).querySelectorAll(".spx-item");
  var q = query.toLowerCase();
  items.forEach(function(item) {
    var text = item.textContent.toLowerCase();
    item.style.display = (!q || text.indexOf(q) >= 0) ? "" : "none";
  });
}

function spxInsertClass(iri) {
  document.getElementById("spx-class-select").value = iri;
  spxAutoUpdateQuery();
}
function spxInsertProp(iri) {
  document.getElementById("spx-prop-select").value = iri;
  spxAutoUpdateQuery();
}

// Auto-update the query when class/property/template changes
function spxAutoUpdateQuery() {
  var t = document.getElementById("spx-template").value;
  if (t) spxInsertTemplate();
}

function spxInsertTemplate() {
  var t = document.getElementById("spx-template").value;
  var cls = document.getElementById("spx-class-select").value;
  var prop = document.getElementById("spx-prop-select").value;
  var param = document.getElementById("spx-param").value.trim();
  var q = "";
  var clsLabel = cls ? (spxState.labels[cls] || spxShorten(cls)) : "";
  var propLabel = prop ? (spxState.labels[prop] || spxShorten(prop)) : "";
  var clsComment = clsLabel ? "  # " + clsLabel + "\n" : "\n";
  var propComment = propLabel ? "  # " + propLabel + "\n" : "\n";

  if (t === "count") {
    q = "SELECT (COUNT(?x) AS ?count) WHERE {\n  ?x a <" + (cls||"CLASS_IRI") + "> ." + clsComment + "}";
  } else if (t === "label") {
    q = 'SELECT ?s ?label WHERE {\n  ?s <http://www.w3.org/2000/01/rdf-schema#label> ?label .\n  FILTER(CONTAINS(LCASE(STR(?label)), "' + (param||"search text").toLowerCase() + '"))\n} LIMIT 50';
  } else if (t === "props") {
    q = "SELECT ?prop (COUNT(?val) AS ?count) WHERE {\n  ?s a <" + (cls||"CLASS_IRI") + "> ;" + clsComment + "     ?prop ?val .\n} GROUP BY ?prop ORDER BY DESC(?count) LIMIT 50";
  } else if (t === "explore") {
    q = "SELECT ?s ?value WHERE {\n  ?s a <" + (cls||"CLASS_IRI") + "> ;" + clsComment + "     <" + (prop||"PROPERTY_IRI") + "> ?value ." + propComment + "} LIMIT 50";
  } else if (t === "describe") {
    q = "SELECT ?p ?o WHERE {\n  <" + (param||"RESOURCE_IRI") + "> ?p ?o .\n} LIMIT 100";
  } else if (t === "triples") {
    q = "SELECT ?s ?p ?o WHERE {\n  ?s ?p ?o\n} LIMIT 20";
  }
  if (q) document.getElementById("spx-query-editor").value = q;
}

// ── Autocomplete for SPARQL editor (Ctrl+Space) ─────────────────────

var spxCatalog = []; // [{iri, label, short, type}]

function spxBuildAutocomplete() {
  spxCatalog = [];
  spxState.classes.forEach(function(c) {
    var label = spxState.labels[c.iri] || "";
    var short = spxShorten(c.iri);
    spxCatalog.push({ iri: c.iri, label: label || short, short: short, type: "class" });
  });
  var seen = {};
  spxState.objProps.forEach(function(p) {
    if (seen[p.prop]) return; seen[p.prop] = true;
    var label = spxState.labels[p.prop] || "";
    var short = spxShorten(p.prop);
    spxCatalog.push({ iri: p.prop, label: label || short, short: short, type: "prop" });
  });
  // Add SPARQL keywords
  ["SELECT","WHERE","FILTER","OPTIONAL","UNION","GROUP BY","ORDER BY","LIMIT","OFFSET","COUNT","DISTINCT","AS","BIND","VALUES","HAVING","ASC","DESC","isIRI","isLiteral","CONTAINS","LCASE","STR","LANG","DATATYPE","CONCAT","SUBSTR","STRLEN","REGEX","BOUND","NOT EXISTS","EXISTS","MINUS","SERVICE"].forEach(function(kw) {
    spxCatalog.push({ iri: "", label: kw, short: kw, type: "keyword" });
  });
}

function spxFuzzyMatch(str, query) {
  str = str.toLowerCase(); query = query.toLowerCase();
  if (str.indexOf(query) >= 0) return 2;
  var qi = 0, score = 0;
  for (var i = 0; i < str.length && qi < query.length; i++) {
    if (str[i] === query[qi]) { score++; qi++; }
  }
  return qi === query.length ? score / query.length : 0;
}

function spxShowAutocomplete(editor) {
  var pos = editor.selectionStart || 0;
  var text = editor.value || "";
  var start = pos;
  while (start > 0 && /[^\s<>{}();\n]/.test(text[start - 1])) start--;
  var word = text.substring(start, pos) || "";

  var popup = document.getElementById("spx-autocomplete");
  if (!popup) {
    popup = document.createElement("div");
    popup.id = "spx-autocomplete";
    popup.style.cssText = "position:absolute;z-index:1000;background:#fff;border:1px solid #d1d5db;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.12);max-height:320px;overflow:hidden;font-size:12px;min-width:380px;display:flex;flex-direction:column;";
    editor.parentElement.style.position = "relative";
    editor.parentElement.appendChild(popup);
  }
  popup.style.display = "flex";

  // Build with search input at top
  var searchVal = popup._searchVal || word || "";
  var h = '<div style="padding:6px 8px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:6px;">'
    + '<span style="color:#9ca3af;font-size:14px;">&#x1F50D;</span>'
    + '<input id="spx-ac-search" type="text" value="' + searchVal.replace(/"/g,'&quot;') + '" placeholder="Search classes, properties, keywords..." '
    + 'style="flex:1;padding:5px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;color:#374151;background:#fff;outline:none;" '
    + 'oninput="spxFilterAC(this.value)" onkeydown="spxACKeydown(event)">'
    + '</div><div id="spx-ac-list" style="overflow-y:auto;max-height:260px;">';

  var query = searchVal || word;
  var matches = spxGetMatches(query);
  matches.forEach(function(m, i) {
    h += spxRenderACItem(m, i);
  });
  h += '</div>';
  popup.innerHTML = h;
  popup._matches = matches;
  popup._start = start;
  popup._pos = pos;

  // Focus the search input
  var si = document.getElementById("spx-ac-search");
  if (si) setTimeout(function() { si.focus(); si.selectionStart = si.selectionEnd = si.value.length; }, 10);
}

function spxGetMatches(query) {
  if (!query) return spxCatalog.slice(0, 15).map(function(item) { return {item:item, score:1}; });
  var matches = [];
  spxCatalog.forEach(function(item) {
    var score = Math.max(spxFuzzyMatch(item.short, query), spxFuzzyMatch(item.label, query), item.iri ? spxFuzzyMatch(item.iri, query) : 0);
    if (score > 0) matches.push({ item: item, score: score });
  });
  matches.sort(function(a, b) { return b.score - a.score; });
  return matches.slice(0, 15);
}

function spxRenderACItem(m, i) {
  var item = m.item;
  var typeColor = item.type === "class" ? "#6366f1" : item.type === "prop" ? "#0891b2" : "#9ca3af";
  var label = item.label || item.short;
  var iri = item.iri ? spxShorten(item.iri) : "";
  return '<div style="padding:5px 10px;cursor:pointer;display:flex;align-items:center;gap:6px;border-bottom:1px solid #f3f4f6;" onmousedown="spxSelectAutocomplete(' + i + ')">'
    + '<span style="background:'+typeColor+';color:#fff;font-size:9px;padding:1px 5px;border-radius:3px;font-weight:600;">'+item.type+'</span>'
    + '<span style="color:#1f2937;flex:1;">'+label+'</span>'
    + (iri ? '<span style="color:#9ca3af;font-size:10px;">'+iri+'</span>' : '')
    + '</div>';
}

function spxFilterAC(val) {
  var popup = document.getElementById("spx-autocomplete");
  if (!popup) return;
  popup._searchVal = val;
  var matches = spxGetMatches(val);
  popup._matches = matches;
  var list = document.getElementById("spx-ac-list");
  if (list) {
    var h = "";
    matches.forEach(function(m, i) { h += spxRenderACItem(m, i); });
    list.innerHTML = h;
  }
}

function spxACKeydown(e) {
  if (e.key === "Escape") { spxHideAutocomplete(); document.getElementById("spx-query-editor").focus(); }
  if (e.key === "Enter" || e.key === "Tab") {
    e.preventDefault();
    var popup = document.getElementById("spx-autocomplete");
    if (popup && popup._matches && popup._matches.length) spxSelectAutocomplete(0);
  }
}

function spxSelectAutocomplete(index) {
  var popup = document.getElementById("spx-autocomplete");
  if (!popup || !popup._matches) return;
  var item = popup._matches[index].item;
  var editor = document.getElementById("spx-query-editor");
  var text = editor.value;
  var insert = item.type === "keyword" ? item.short : "<" + item.iri + ">";
  editor.value = text.substring(0, popup._start) + insert + text.substring(popup._pos);
  editor.selectionStart = editor.selectionEnd = popup._start + insert.length;
  editor.focus();
  spxHideAutocomplete();
}

function spxHideAutocomplete() {
  var popup = document.getElementById("spx-autocomplete");
  if (popup) popup.style.display = "none";
}

// Wire up the editor — use setTimeout to ensure element exists after page render
function spxWireEditor() {
  var editor = document.getElementById("spx-query-editor");
  if (!editor) { setTimeout(spxWireEditor, 200); return; }
  if (editor._wired) return;
  editor._wired = true;
  editor.addEventListener("keydown", function(e) {
    if (e.ctrlKey && e.key === " ") { e.preventDefault(); spxShowAutocomplete(editor); }
    if (e.key === "Escape") spxHideAutocomplete();
    // Tab to accept first suggestion
    if (e.key === "Tab") {
      var popup = document.getElementById("spx-autocomplete");
      if (popup && popup.style.display !== "none" && popup._matches && popup._matches.length) {
        e.preventDefault(); spxSelectAutocomplete(0);
      }
    }
  });
  editor.addEventListener("input", function() {
    var popup = document.getElementById("spx-autocomplete");
    if (popup && popup.style.display !== "none") spxShowAutocomplete(editor);
  });
  editor.addEventListener("blur", function() {
    setTimeout(function() {
      var ac = document.getElementById("spx-autocomplete");
      if (ac && ac.contains(document.activeElement)) return;
      spxHideAutocomplete();
    }, 250);
  });
}
spxWireEditor();

async function spxRunQuery() {
  var q = document.getElementById("spx-query-editor").value.trim();
  if (!q) return;
  spxQStatus("Running...");
  try {
    var res = await spxQuery(spxState.endpoint, q);
    spxResults = res.results.bindings;
    var vars = res.head.vars;
    document.getElementById("spx-result-count").textContent = "(" + spxResults.length + " rows)";

    var h = '<table class="spx-result-table"><thead><tr>';
    vars.forEach(function(v) { h += '<th>' + v + '</th>'; });
    h += '</tr></thead><tbody>';
    spxResults.forEach(function(row) {
      h += '<tr>';
      vars.forEach(function(v) {
        var val = row[v] ? row[v].value : "";
        if (val.indexOf("http") === 0) {
          var label = spxState.labels[val] || "";
          var short = spxShorten(val);
          if (label && label !== short) {
            h += '<td title="' + val.replace(/"/g,'&quot;') + '"><span style="color:#1f2937;">' + label + '</span> <span style="color:#9ca3af;font-size:10px;">(' + short + ')</span></td>';
          } else {
            h += '<td title="' + val.replace(/"/g,'&quot;') + '">' + short + '</td>';
          }
        } else {
          h += '<td title="' + val.replace(/"/g,'&quot;') + '">' + val + '</td>';
        }
      });
      h += '</tr>';
    });
    h += '</tbody></table>';
    document.getElementById("spx-result-table-wrap").innerHTML = h;
    document.getElementById("spx-results").style.display = "";
    spxQStatus(spxResults.length + " results");
  } catch(e) {
    spxQStatus("Error: " + e.message);
  }
}

function spxVisualizeResults() {
  if (!spxResults.length) { alert("Run a query first."); return; }
  // Try to build TTL from results that have s/p/o or subject/predicate/object columns
  var pf = spxState.prefixes;
  var ttl = "";
  for (var p in pf) ttl += "@prefix " + p + ": <" + pf[p] + "> .\n";
  ttl += "\n";

  var vars = Object.keys(spxResults[0] || {});
  var sCol = vars.find(function(v){return v==="s"||v==="subject";}) || vars[0];
  var pCol = vars.find(function(v){return v==="p"||v==="predicate";}) || vars[1];
  var oCol = vars.find(function(v){return v==="o"||v==="object";}) || vars[2];

  if (sCol && pCol && oCol) {
    spxResults.forEach(function(row) {
      var s = row[sCol] ? row[sCol].value : "";
      var p2 = row[pCol] ? row[pCol].value : "";
      var o = row[oCol] ? row[oCol].value : "";
      if (!s || !p2 || !o) return;
      var oIsIri = row[oCol] && row[oCol].type === "uri";
      ttl += "<" + s + "> <" + p2 + "> " + (oIsIri ? "<" + o + ">" : '"' + o.replace(/"/g,'\\"') + '"') + " .\n";
    });
  } else {
    alert("Results don't have triple columns (s/p/o). Try a query that returns subjects, predicates, and objects.");
    return;
  }

  var c = document.getElementById("spx-result-container");
  c.style.display = "";
  setTimeout(function() { ontoink.playground("spx-result-container", ttl, ""); }, 50);
}

// Auto-load from URL: ?endpoint=URL
(function() {
  var params = new URLSearchParams(window.location.search);
  var ep = params.get("endpoint") || params.get("sparql");
  if (ep) {
    document.getElementById("spx-endpoint").value = ep;
    // Wait for DOM + scripts to load
    if (document.readyState === "complete") { spxConnect(); }
    else { window.addEventListener("load", function() { setTimeout(spxConnect, 200); }); }
  }
})();
</script>

!!! tip "How to use"
    1. Select a **preset** or enter your SPARQL endpoint URL
    2. Click **Connect** — the tool discovers classes, properties, and hierarchy
    3. Explore the **schema graph** (abstract model showing classes and relationships)
    4. Click classes/properties in the sidebar to select them for queries
    5. Choose a **query template** or press **Ctrl+Space** for autocomplete
    6. View results as a **table** or **visualize** them as a graph

## Share via URL

Link directly to an endpoint:

```
https://ise-fizkarlsruhe.github.io/ontoink/sparql-explorer/?endpoint=https://nfdi.fiz-karlsruhe.de/matwerk/sparql
```

## How it handles large endpoints

For knowledge graphs with millions of triples (DBpedia, Wikidata), ontoink uses **adaptive discovery**:

1. **Fast probe** — checks endpoint responds (1 triple, 10s timeout)
2. **Class discovery with counts** — tries `GROUP BY` with 15s timeout
3. **Fallback to lightweight mode** — if counts time out, uses `DISTINCT` (no counting, much faster)
4. **Property discovery** — tries domain/range detection, falls back to distinct properties
5. **Label fetching** — batch lookup for the top 80 IRIs

This means any endpoint works — small ones get full statistics, large ones get schema structure without counts.

!!! info "Requirements"
    - The SPARQL endpoint must support **CORS** (cross-origin requests)
    - Most public endpoints (DBpedia, Wikidata, NFDI) support this
    - For private endpoints, configure CORS headers on your server
