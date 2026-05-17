---
hide:
  - toc
---

# Playground

Visualize any RDF/Turtle data instantly — no installation needed. Paste your TTL, optionally add SHACL shapes, and click **Visualize**.

<div id="pg-app" style="font-family:var(--md-text-font-family,Inter,sans-serif);">

<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
  <div>
    <label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">RDF/Turtle Data</label>
    <textarea id="pg-ttl" rows="14" style="width:100%;font-family:'JetBrains Mono','Fira Code',monospace;font-size:13px;border:1px solid #d1d5db;border-radius:8px;padding:10px;resize:vertical;background:#fff;color:#1f2937;" placeholder="Paste your Turtle data here...">@prefix ex:   <http://example.org/> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl:  <http://www.w3.org/2002/07/owl#> .

ex:Person a owl:Class .
ex:Organization a owl:Class .
ex:worksFor a owl:ObjectProperty .

ex:alice a ex:Person ;
    rdfs:label "Alice" ;
    ex:worksFor ex:acme .

ex:bob a ex:Person ;
    rdfs:label "Bob" ;
    ex:worksFor ex:acme .

ex:acme a ex:Organization ;
    rdfs:label "Acme Corp" .</textarea>
  </div>
  <div>
    <label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">SHACL Shapes <span style="font-weight:400;color:#9ca3af;">(optional)</span></label>
    <textarea id="pg-shacl" rows="14" style="width:100%;font-family:'JetBrains Mono','Fira Code',monospace;font-size:13px;border:1px solid #d1d5db;border-radius:8px;padding:10px;resize:vertical;background:#fff;color:#1f2937;" placeholder="Paste SHACL shapes here (optional)..."></textarea>
  </div>
</div>

<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap;">
  <button onclick="pgVisualize()" style="padding:8px 24px;background:#0891b2;color:#fff;border:none;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;">Visualize</button>
  <label style="padding:6px 14px;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;font-size:13px;background:#fff;color:#374151;">
    Upload TTL <input type="file" accept=".ttl,.owl,.rdf,.nt,.n3" id="pg-upload" style="display:none;" onchange="pgLoadFile(this)">
  </label>
  <label style="padding:6px 14px;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;font-size:13px;background:#fff;color:#374151;">
    Upload Shape <input type="file" accept=".ttl,.owl,.rdf" id="pg-upload-shape" style="display:none;" onchange="pgLoadShape(this)">
  </label>
  <button onclick="pgClear()" style="padding:6px 14px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:13px;font-family:inherit;color:#374151;">Clear</button>
  <span id="pg-status" style="font-size:12px;color:#6b7280;"></span>
</div>

<div id="pg-container" class="ontoink-container" style="display:none;" data-show-legend="true" data-show-ns="true">
  <div class="ov-toolbar">
    <div class="ov-toolbar-group">
      <button class="ov-btn" onclick="ontoink.zoomIn('pg-container')">+</button>
      <button class="ov-btn" onclick="ontoink.zoomOut('pg-container')">&minus;</button>
      <button class="ov-btn" onclick="ontoink.fit('pg-container')">Fit</button>
      <button class="ov-btn" onclick="ontoink.fullscreen('pg-container')">&#x26F6;</button>
      <select class="ov-layout-select" onchange="ontoink.changeLayout('pg-container',this.value)">
        <option value="dagre">Dagre</option><option value="cose">Force</option><option value="circle">Circle</option>
        <option value="concentric">Concentric</option><option value="breadthfirst">Tree</option><option value="grid">Grid</option>
      </select>
    </div>
    <div class="ov-toolbar-group">
      <input class="ov-search-input" type="text" placeholder="Search..." oninput="ontoink.search('pg-container',this.value)">
    </div>
    <div class="ov-toolbar-group">
      <button class="ov-btn" onclick="ontoink.exportPNG('pg-container')">PNG</button>
      <button class="ov-btn" onclick="ontoink.exportSVG('pg-container')">SVG</button>
      <button class="ov-btn" onclick="ontoink.downloadTTL('pg-container')">TTL</button>
    </div>
    <div class="ov-toolbar-group">
      <button class="ov-btn" onclick="ontoink.toggleColors('pg-container')">Edit Layout</button>
      <button class="ov-btn" onclick="ontoink.abstractView('pg-container')" title="Show only classes and class-level edges">Abstract</button>
      <button class="ov-btn" onclick="ontoink.toggleStats('pg-container')">Stats</button>
      <button class="ov-btn" onclick="ontoink.togglePathFinder('pg-container')">Paths</button>
      <button class="ov-btn" onclick="ontoink.toggleSparql('pg-container')">SPARQL</button>
    </div>
    <div class="ov-toolbar-group">
      <button class="ov-btn ov-btn-accent" onclick="ontoink.togglePlaygroundReasoning('pg-container')" title="Run OWL reasoning">Reasoning</button>
      <select class="ov-reasoner-select" id="pg-reasoner-select" title="Select reasoner backend"></select>
      <button class="ov-btn ov-btn-accent" onclick="ontoink.toggleEditor('pg-container')" title="Edit TTL &amp; Validate">Edit &amp; Validate</button>
    </div>
  </div>
  <div class="ov-canvas-wrap" style="position:relative;width:100%;height:600px;">
    <div class="ov-canvas" style="width:100%;height:100%;"></div>
    <div class="ov-legend-overlay ov-draggable" style="bottom:12px;left:12px;"></div>
    <div class="ov-ns-overlay ov-draggable" style="bottom:12px;right:12px;"></div>
    <div class="ov-minimap" style="position:absolute;top:8px;right:8px;width:150px;height:100px;border:1px solid #d1d5db;border-radius:6px;background:rgba(255,255,255,0.9);overflow:hidden;"></div>
  </div>
  <div class="ov-stats-panel" style="display:none;"></div>
  <div class="ov-pathfinder-panel" style="display:none;"></div>
  <div class="ov-sparql-panel" style="display:none;"></div>
  <div class="ov-reasoning-panel" style="display:none;"></div>
  <div class="ov-editor-panel" style="display:none;">
    <div class="ov-editor-header ov-panel-head">Edit &amp; Validate<button class="ov-panel-close" onclick="this.closest('.ov-editor-panel').style.display='none'">&times;</button></div>
    <div class="ov-editor-split">
      <div class="ov-editor-left">
        <div class="ov-editor-header">TTL Editor</div>
        <textarea class="ov-editor-textarea"></textarea>
      </div>
      <div class="ov-editor-right">
        <div class="ov-editor-header">Validation Results</div>
        <div class="ov-validation-output"></div>
      </div>
    </div>
    <div class="ov-editor-actions">
      <button class="ov-btn ov-btn-primary" onclick="ontoink.validate('pg-container')">Validate</button>
      <button class="ov-btn" onclick="ontoink.updateGraph('pg-container')">Update Graph</button>
      <button class="ov-btn" onclick="ontoink.resetEditor('pg-container')">Reset</button>
    </div>
  </div>
</div>

</div>

<script>
function pgStatus(msg) { document.getElementById("pg-status").textContent = msg; }
function pgVisualize() {
  var ttl = document.getElementById("pg-ttl").value.trim();
  if (!ttl) { alert("Please paste or upload some Turtle data."); return; }
  // Quick size estimate
  var lines = ttl.split("\n").length;
  if (lines > 5000) {
    if (!confirm("This file has " + lines + " lines. Large ontologies may be slow to render. Continue?")) return;
  }
  pgStatus("Parsing...");
  var shacl = document.getElementById("pg-shacl").value.trim() || "";
  var container = document.getElementById("pg-container");
  container.style.display = "";
  setTimeout(function() {
    try {
      ontoink.playground("pg-container", ttl, shacl);
      pgStatus("");
    } catch(e) {
      pgStatus("Error: " + e.message);
    }
  }, 50);
}
function pgLoadFile(input) {
  if (!input.files.length) return;
  var f = input.files[0];
  pgStatus("Loading " + f.name + " (" + (f.size/1024).toFixed(1) + " KB)...");
  var reader = new FileReader();
  reader.onload = function(e) {
    document.getElementById("pg-ttl").value = e.target.result;
    pgStatus("Loaded " + f.name + " — click Visualize");
  };
  reader.readAsText(f);
}
function pgLoadShape(input) {
  if (!input.files.length) return;
  var f = input.files[0];
  var reader = new FileReader();
  reader.onload = function(e) {
    document.getElementById("pg-shacl").value = e.target.result;
    pgStatus("Shape loaded — click Visualize");
  };
  reader.readAsText(f);
}
function pgClear() {
  document.getElementById("pg-ttl").value = "";
  document.getElementById("pg-shacl").value = "";
  document.getElementById("pg-container").style.display = "none";
  pgStatus("");
  // Clear URL params
  if (window.history.replaceState) window.history.replaceState({}, "", window.location.pathname);
}
function pgFetchUrl(url, target) {
  pgStatus("Fetching " + url + "...");
  return fetch(url)
    .then(function(r) { if (!r.ok) throw new Error(r.status + " " + r.statusText); return r.text(); })
    .then(function(text) { document.getElementById(target).value = text; return text; })
    .catch(function(e) { pgStatus("Failed to fetch: " + e.message); return null; });
}
// Auto-load from URL params: ?data=URL&shape=URL&auto=true
(function() {
  var params = new URLSearchParams(window.location.search);
  var dataUrl = params.get("data") || params.get("ttl") || params.get("source");
  var shapeUrl = params.get("shape");
  var autoRun = params.get("auto") !== "false"; // auto-visualize by default when URL provided
  if (!dataUrl) return;
  var promises = [pgFetchUrl(dataUrl, "pg-ttl")];
  if (shapeUrl) promises.push(pgFetchUrl(shapeUrl, "pg-shacl"));
  Promise.all(promises).then(function(results) {
    if (results[0] && autoRun) pgVisualize();
    else if (results[0]) pgStatus("Loaded — click Visualize");
  });
})();
</script>

## Share via URL

You can link directly to a visualization by passing URL parameters:

```
https://ise-fizkarlsruhe.github.io/ontoink/playground/?data=URL_TO_TTL
```

| Parameter | Description |
|:----------|:------------|
| `data`    | URL to a Turtle file (also accepts `ttl` or `source` as aliases) |
| `shape`   | URL to a SHACL shape file (optional) |
| `auto`    | Set to `false` to load without auto-visualizing |

**Example:**

```
https://ise-fizkarlsruhe.github.io/ontoink/playground/?data=https://raw.githubusercontent.com/ISE-FIZKarlsruhe/ontoink/main/demo/docs/shapes/reasoning-demo/shape-data.ttl&shape=https://raw.githubusercontent.com/ISE-FIZKarlsruhe/ontoink/main/demo/docs/shapes/reasoning-demo/shape.ttl
```

!!! warning "CORS"
    The TTL file must be served with CORS headers allowing cross-origin requests. GitHub raw files, GitLab raw files, and most ontology repositories support this.

!!! tip "How it works"
    The playground runs entirely in your browser. Your data is **never uploaded** to any server. The Turtle is parsed with a lightweight JavaScript parser and visualized with Cytoscape.js.

!!! info "Limitations"
    - **No OWL reasoning** — reasoning requires Python (HermiT via owlready2), which is only available when using the MkDocs plugin
    - **Simplified SHACL** — basic `sh:minCount`/`sh:maxCount` constraints are supported; advanced SHACL features require the full plugin
    - For production use with reasoning and full SHACL, [install ontoink](getting-started.md) as a MkDocs plugin
