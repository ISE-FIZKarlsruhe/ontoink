---
hide:
  - toc
---

# SHACL Shape Editor

Build SHACL shapes visually — no Turtle knowledge needed. Load an existing shape file, use templates, or start from scratch.

<style>
.se-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0; }
@media (max-width: 900px) { .se-grid { grid-template-columns: 1fr; } }
.se-shape-card { border: 1px solid #d1d5db; border-radius: 10px; padding: 14px; background: #fff; margin-bottom: 12px; }
.se-shape-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; font-weight: 600; font-size: 14px; color: #1f2937; }
.se-prop-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; margin: 8px 0; background: #f9fafb; }
.se-field { display: flex; align-items: center; gap: 6px; margin: 4px 0; font-size: 13px; }
.se-field label { min-width: 80px; font-weight: 500; color: #4b5563; }
.se-field input, .se-field select { flex: 1; padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 13px; font-family: inherit; color: #374151; background: #fff; }
.se-field input:focus, .se-field select:focus { outline: 1px solid #0891b2; border-color: #0891b2; }
.se-actions { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0; }
.se-prefix-row { display: flex; gap: 4px; align-items: center; margin: 3px 0; font-size: 12px; background: #f9fafb; padding: 4px 8px; border-radius: 6px; border: 1px solid #e5e7eb; }
.se-prefix-row .se-pfx { font-weight: 600; color: #3730a3; min-width: 40px; }
.se-prefix-row input { padding: 2px 6px; border: 1px solid #d1d5db; border-radius: 3px; font-size: 11px; color: #374151; background: #fff; }
.se-output-wrap { position: sticky; top: 80px; }
.se-ttl-output { width: 100%; min-height: 300px; font-family: 'JetBrains Mono','Fira Code',monospace; font-size: 13px; border: 1px solid #d1d5db; border-radius: 8px; padding: 10px; background: #fff; color: #1f2937; resize: vertical; }
.se-bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
.se-tip { font-size: 11px; color: #9ca3af; font-style: italic; margin-left: 4px; }
.se-help { display: inline-block; width: 14px; height: 14px; border-radius: 50%; background: #dbeafe; color: #2563eb; font-size: 10px; text-align: center; line-height: 14px; cursor: pointer; font-style: normal; font-weight: 700; position: relative; }
.se-help-tip { display: none; position: absolute; bottom: 20px; left: -80px; width: 220px; background: #1f2937; color: #fff; font-size: 11px; font-weight: 400; padding: 8px 10px; border-radius: 6px; z-index: 100; line-height: 1.4; box-shadow: 0 4px 12px rgba(0,0,0,0.2); text-transform: none; letter-spacing: 0; }
.se-help-tip::after { content: ""; position: absolute; top: 100%; left: 90px; border: 6px solid transparent; border-top-color: #1f2937; }
.se-help:hover .se-help-tip, .se-help:focus .se-help-tip { display: block; }
</style>

<div id="se-app">

<div class="se-bar">
  <select id="se-template-select" onchange="seLoadTemplate(this.value)" style="padding:5px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;color:#374151;background:#fff;">
    <option value="">-- Templates --</option>
    <option value="person-name">Person must have a name</option>
    <option value="article-fields">Article: title + author + date</option>
    <option value="org-one-name">Organization: exactly one name</option>
    <option value="email-pattern">Person: valid email pattern</option>
  </select>
  <label style="padding:5px 12px;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;font-size:13px;background:#fff;color:#374151;">
    Load TTL <input type="file" accept=".ttl,.rdf" style="display:none;" onchange="seLoadFile(this)">
  </label>
  <button class="ov-btn" onclick="seAddShape()">+ Add Shape</button>
  <button class="ov-btn" onclick="seClear()">Clear All</button>
  <button class="ov-btn ov-btn-primary" onclick="seCopyTTL()">Copy TTL</button>
  <button class="ov-btn" onclick="seDownloadTTL()">Download</button>
  <button class="ov-btn ov-btn-accent" onclick="seVisualize()">Visualize</button>
</div>

<details style="margin-bottom:12px;">
  <summary style="font-size:14px;font-weight:600;cursor:pointer;color:#6366f1;">Shape Recommender — auto-generate shapes from data</summary>
  <div style="padding:10px 0;">
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px;">
      <label style="padding:5px 12px;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;font-size:13px;background:#fff;color:#374151;">
        Upload instance data <input type="file" accept=".ttl,.rdf,.owl" style="display:none;" onchange="seRecommendFromFile(this)">
      </label>
      <span style="color:#9ca3af;font-size:12px;">or</span>
      <input id="se-sparql-endpoint" placeholder="SPARQL endpoint URL" style="flex:1;min-width:200px;padding:5px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;color:#374151;background:#fff;">
      <button class="ov-btn" onclick="seRecommendFromEndpoint()">Recommend from Endpoint</button>
    </div>
    <textarea id="se-recommend-ttl" rows="6" placeholder="Or paste instance data TTL here..." style="width:100%;font-family:'JetBrains Mono',monospace;font-size:12px;border:1px solid #d1d5db;border-radius:6px;padding:8px;color:#374151;background:#fff;resize:vertical;"></textarea>
    <div style="display:flex;gap:8px;margin-top:6px;">
      <button class="ov-btn ov-btn-primary" onclick="seRecommendFromTTL()">Analyze &amp; Recommend</button>
      <span id="se-recommend-status" style="font-size:12px;color:#6b7280;"></span>
    </div>
    <div id="se-recommend-results"></div>
  </div>
</details>

<div class="se-grid">
  <div>
    <details open id="se-prefix-section">
      <summary style="font-size:13px;font-weight:600;cursor:pointer;margin-bottom:6px;">Prefixes <span class="se-help" title="Namespace prefixes used in shape IRIs. Add custom prefixes for your ontology.">?</span></summary>
      <div id="se-prefixes"></div>
      <div class="se-actions">
        <button class="ov-chip" onclick="seAddPrefix()">+ Add Prefix</button>
      </div>
    </details>
    <div id="se-builder"></div>
    <button class="ov-btn" onclick="seAddShape()" style="width:100%;">+ Add Shape</button>
  </div>
  <div>
    <div class="se-output-wrap">
      <label style="font-size:13px;font-weight:600;display:block;margin-bottom:4px;">Generated SHACL Turtle</label>
      <textarea id="se-ttl-output" class="se-ttl-output" readonly></textarea>
    </div>
  </div>
</div>

<div style="margin-top:16px;">
  <div id="se-preview-container" class="ontoink-container" style="display:none;" data-show-legend="true" data-show-ns="true">
    <div class="ov-toolbar">
      <div class="ov-toolbar-group">
        <button class="ov-btn" onclick="ontoink.zoomIn('se-preview-container')">+</button>
        <button class="ov-btn" onclick="ontoink.zoomOut('se-preview-container')">&minus;</button>
        <button class="ov-btn" onclick="ontoink.fit('se-preview-container')">Fit</button>
        <button class="ov-btn" onclick="ontoink.fullscreen('se-preview-container')">&#x26F6;</button>
        <select class="ov-layout-select" onchange="ontoink.changeLayout('se-preview-container',this.value)">
          <option value="dagre">Dagre</option><option value="cose">Force</option><option value="circle">Circle</option>
          <option value="breadthfirst">Tree</option>
        </select>
      </div>
      <div class="ov-toolbar-group">
        <input class="ov-search-input" type="text" placeholder="Search..." oninput="ontoink.search('se-preview-container',this.value)">
      </div>
      <div class="ov-toolbar-group">
        <button class="ov-btn" onclick="ontoink.exportPNG('se-preview-container')">PNG</button>
        <button class="ov-btn" onclick="ontoink.exportSVG('se-preview-container')">SVG</button>
      </div>
      <div class="ov-toolbar-group">
        <button class="ov-btn" onclick="ontoink.toggleColors('se-preview-container')">Edit Layout</button>
        <button class="ov-btn" onclick="ontoink.toggleStats('se-preview-container')">Stats</button>
        <button class="ov-btn" onclick="ontoink.togglePathFinder('se-preview-container')">Paths</button>
      </div>
      <div class="ov-toolbar-group">
        <button class="ov-btn ov-btn-accent" onclick="ontoink.toggleEditor('se-preview-container')" title="Edit sample data &amp; validate it against your shape">Edit &amp; Validate</button>
      </div>
    </div>
    <div class="ov-canvas-wrap" style="position:relative;width:100%;height:450px;">
      <div class="ov-canvas" style="width:100%;height:100%;"></div>
      <div class="ov-legend-overlay ov-draggable" style="bottom:12px;left:12px;"></div>
      <div class="ov-ns-overlay ov-draggable" style="bottom:12px;right:12px;"></div>
      <div class="ov-minimap" style="position:absolute;top:8px;right:8px;width:150px;height:100px;border:1px solid #d1d5db;border-radius:6px;background:rgba(255,255,255,0.9);overflow:hidden;"></div>
    </div>
    <div class="ov-stats-panel" style="display:none;"></div>
    <div class="ov-pathfinder-panel" style="display:none;"></div>
    <div class="ov-editor-panel" style="display:none;">
      <div class="ov-editor-header ov-panel-head">Edit &amp; Validate<button class="ov-panel-close" onclick="this.closest('.ov-editor-panel').style.display='none'">&times;</button></div>
      <div class="ov-editor-split">
        <div class="ov-editor-left">
          <div class="ov-editor-header">Sample data (edit me)</div>
          <textarea class="ov-editor-textarea"></textarea>
        </div>
        <div class="ov-editor-right">
          <div class="ov-editor-header">SHACL Shapes</div>
          <textarea class="ov-editor-shapes-textarea"></textarea>
        </div>
      </div>
      <div class="ov-editor-report">
        <div class="ov-editor-header">Validation Report</div>
        <div class="ov-validation-output"></div>
      </div>
      <div class="ov-editor-actions">
        <button class="ov-btn ov-btn-primary" onclick="ontoink.validate('se-preview-container')">Validate</button>
      </div>
    </div>
  </div>
</div>

</div>

<script>
var SE_PREFIXES = {
  "sh":"http://www.w3.org/ns/shacl#",
  "xsd":"http://www.w3.org/2001/XMLSchema#",
  "rdfs":"http://www.w3.org/2000/01/rdf-schema#",
  "rdf":"http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  "ex":"http://example.org/"
};
var CONSTRAINT_HELP = {
  "path": "The RDF property this constraint applies to (e.g., ex:name, rdfs:label)",
  "minCount": "Minimum number of values required. Use 1 to make it mandatory.",
  "maxCount": "Maximum number of values allowed. Use 1 for exactly-one.",
  "datatype": "Values must be this XSD type (e.g., xsd:string, xsd:integer, xsd:date)",
  "nodeKind": "What kind of RDF node the value must be (IRI, literal, or blank node)",
  "pattern": "A regular expression the value must match (e.g., ^[A-Z] for uppercase start)",
  "message": "Custom error message shown when this constraint is violated",
  "closed": "If checked, only the properties listed in sh:property are allowed. Any other property on the instance is a violation."
};
function help(key) { var t = CONSTRAINT_HELP[key]||""; return ' <span class="se-help" tabindex="0">?<span class="se-help-tip">' + t + '</span></span>'; }

var seState = { prefixes: Object.assign({}, SE_PREFIXES), shapes: [] };
var seCounter = 0;
function seId() { return "se_" + (seCounter++); }

function seAddShape() {
  seState.shapes.push({
    id: seId(), shapeIri: "ex:MyShape", targetClass: "ex:MyClass", closed: false,
    properties: [{ id: seId(), path: "", minCount: null, maxCount: null, datatype: "", nodeKind: "", pattern: "", message: "" }]
  });
  seRender();
}
function seRemoveShape(sid) { seState.shapes = seState.shapes.filter(function(s){return s.id!==sid;}); seRender(); }
function seAddProperty(sid) {
  seState.shapes.forEach(function(s) {
    if (s.id===sid) s.properties.push({ id:seId(), path:"", minCount:null, maxCount:null, datatype:"", nodeKind:"", pattern:"", message:"" });
  });
  seRender();
}
function seRemoveProperty(sid, pid) {
  seState.shapes.forEach(function(s) {
    if (s.id===sid) s.properties = s.properties.filter(function(p){return p.id!==pid;});
  });
  seRender();
}
function seUpdate(sid, field, value) {
  seState.shapes.forEach(function(s) { if (s.id===sid) s[field]=value; });
  seRenderTTL();
}
function seUpdateProp(sid, pid, field, value) {
  seState.shapes.forEach(function(s) {
    if (s.id===sid) s.properties.forEach(function(p) {
      if (p.id===pid) {
        if (field==="minCount"||field==="maxCount") p[field]=value===""?null:parseInt(value);
        else p[field]=value;
      }
    });
  });
  seRenderTTL();
}

// Prefix management
function seAddPrefix() {
  var p = prompt("Prefix name (e.g., foaf):");
  if (!p) return;
  var uri = prompt("Namespace URI (e.g., http://xmlns.com/foaf/0.1/):");
  if (!uri) return;
  seState.prefixes[p] = uri;
  seRender();
}
function seRemovePrefix(p) {
  if (p === "sh" || p === "xsd" || p === "rdf" || p === "rdfs") { alert("Cannot remove core prefix: " + p); return; }
  delete seState.prefixes[p];
  seRender();
}
function seUpdatePrefix(oldP, newUri) {
  if (newUri) seState.prefixes[oldP] = newUri;
  seRenderTTL();
}

// Load existing TTL shape file
function seLoadFile(input) {
  if (!input.files.length) return;
  var reader = new FileReader();
  reader.onload = function(e) { seParseAndLoad(e.target.result); };
  reader.readAsText(input.files[0]);
}
function seParseAndLoad(ttl) {
  // Parse prefixes
  var pfRe = /@prefix\s+(\w*)\s*:\s*<([^>]+)>\s*\./g, m;
  while ((m = pfRe.exec(ttl)) !== null) seState.prefixes[m[1]] = m[2];
  // Parse shapes (basic: find sh:NodeShape, sh:targetClass, sh:property blocks)
  var SH = "http://www.w3.org/ns/shacl#";
  // Use ontoink's parser if available
  if (typeof ontoink !== "undefined") {
    // We'll parse as triples
    // For now, just put TTL in output and let user edit
    document.getElementById("se-ttl-output").value = ttl;
  }
  seRender();
  alert("Prefixes loaded from file. Edit shapes below or paste the file content to modify.");
}

function seRender() {
  seRenderPrefixes();
  seRenderBuilder();
  seRenderTTL();
}

function seRenderPrefixes() {
  var h = "";
  Object.keys(seState.prefixes).sort().forEach(function(p) {
    var core = (p==="sh"||p==="xsd"||p==="rdf"||p==="rdfs");
    h += '<div class="se-prefix-row"><span class="se-pfx">' + p + ':</span>';
    h += '<input value="' + seState.prefixes[p] + '" onblur="seUpdatePrefix(\'' + p + '\',this.value)" style="flex:1;' + (core?'opacity:0.6;':'') + '">';
    if (!core) h += '<button class="ov-chip" onclick="seRemovePrefix(\'' + p + '\')" style="font-size:10px;padding:1px 6px;color:#dc2626;">&times;</button>';
    h += '</div>';
  });
  document.getElementById("se-prefixes").innerHTML = h;
}

function seRenderBuilder() {
  var h = "";
  seState.shapes.forEach(function(s) {
    h += '<div class="se-shape-card"><div class="se-shape-head">Shape: ' + s.shapeIri + ' <button class="ov-chip" onclick="seRemoveShape(\'' + s.id + '\')" style="margin-left:auto;font-size:11px;">Remove</button></div>';
    h += '<div class="se-field"><label>Shape IRI' + help("path") + '</label><input value="' + s.shapeIri + '" onblur="seUpdate(\'' + s.id + '\',\'shapeIri\',this.value)"></div>';
    h += '<div class="se-field"><label>Target Class</label><input list="se-class-list" value="' + s.targetClass + '" onblur="seUpdate(\'' + s.id + '\',\'targetClass\',this.value)" placeholder="e.g., ex:Person"></div>';
    h += '<div class="se-field"><label>sh:closed' + help("closed") + '</label><input type="checkbox" ' + (s.closed?"checked":"") + ' onchange="seUpdate(\'' + s.id + '\',\'closed\',this.checked)" style="flex:none;width:16px;height:16px;"></div>';

    s.properties.forEach(function(p) {
      h += '<div class="se-prop-card">';
      h += '<div class="se-field"><label>sh:path' + help("path") + '</label><input list="se-prop-list" value="' + (p.path||"") + '" onblur="seUpdateProp(\'' + s.id + '\',\'' + p.id + '\',\'path\',this.value)" placeholder="e.g., ex:name"></div>';
      h += '<div style="display:flex;gap:8px;">';
      h += '<div class="se-field" style="flex:1"><label>min' + help("minCount") + '</label><input type="number" min="0" value="' + (p.minCount!=null?p.minCount:"") + '" onblur="seUpdateProp(\'' + s.id + '\',\'' + p.id + '\',\'minCount\',this.value)" placeholder="0"></div>';
      h += '<div class="se-field" style="flex:1"><label>max' + help("maxCount") + '</label><input type="number" min="0" value="' + (p.maxCount!=null?p.maxCount:"") + '" onblur="seUpdateProp(\'' + s.id + '\',\'' + p.id + '\',\'maxCount\',this.value)" placeholder="*"></div>';
      h += '</div>';
      h += '<div class="se-field"><label>datatype' + help("datatype") + '</label><select onchange="seUpdateProp(\'' + s.id + '\',\'' + p.id + '\',\'datatype\',this.value)">';
      ["","xsd:string","xsd:integer","xsd:decimal","xsd:boolean","xsd:date","xsd:dateTime","xsd:anyURI","xsd:float","xsd:double"].forEach(function(dt) {
        h += '<option value="' + dt + '"' + (p.datatype===dt?' selected':'') + '>' + (dt||"-- any --") + '</option>';
      });
      h += '</select></div>';
      h += '<div class="se-field"><label>nodeKind' + help("nodeKind") + '</label><select onchange="seUpdateProp(\'' + s.id + '\',\'' + p.id + '\',\'nodeKind\',this.value)">';
      ["","sh:IRI","sh:BlankNode","sh:Literal","sh:BlankNodeOrIRI","sh:IRIOrLiteral"].forEach(function(nk) {
        h += '<option value="' + nk + '"' + (p.nodeKind===nk?' selected':'') + '>' + (nk||"-- any --") + '</option>';
      });
      h += '</select></div>';
      h += '<div class="se-field"><label>pattern' + help("pattern") + '</label><input value="' + (p.pattern||"") + '" onblur="seUpdateProp(\'' + s.id + '\',\'' + p.id + '\',\'pattern\',this.value)" placeholder="e.g., ^[A-Z]"></div>';
      h += '<div class="se-field"><label>message' + help("message") + '</label><input value="' + (p.message||"") + '" onblur="seUpdateProp(\'' + s.id + '\',\'' + p.id + '\',\'message\',this.value)" placeholder="Error message"></div>';
      h += '<button class="ov-chip" onclick="seRemoveProperty(\'' + s.id + '\',\'' + p.id + '\')" style="font-size:11px;color:#dc2626;">Remove Property</button>';
      h += '</div>';
    });

    h += '<div class="se-actions"><button class="ov-btn" onclick="seAddProperty(\'' + s.id + '\')">+ Add Property</button></div>';
    h += '</div>';
  });
  document.getElementById("se-builder").innerHTML = h;
}

function seRenderTTL() {
  var pf = seState.prefixes;
  var ttl = "";
  Object.keys(pf).sort().forEach(function(p) { ttl += "@prefix " + p + ": <" + pf[p] + "> .\n"; });
  ttl += "\n";
  seState.shapes.forEach(function(s) {
    var iri = s.shapeIri.indexOf("://")>=0 ? "<"+s.shapeIri+">" : s.shapeIri;
    var tc = s.targetClass.indexOf("://")>=0 ? "<"+s.targetClass+">" : s.targetClass;
    ttl += iri + " a sh:NodeShape ;\n";
    ttl += "    sh:targetClass " + tc + " ;\n";
    if (s.closed) ttl += "    sh:closed true ;\n";
    s.properties.forEach(function(p) {
      if (!p.path) return;
      var path = p.path.indexOf("://")>=0 ? "<"+p.path+">" : p.path;
      ttl += "    sh:property [\n";
      ttl += "        sh:path " + path + " ;\n";
      if (p.minCount!=null) ttl += "        sh:minCount " + p.minCount + " ;\n";
      if (p.maxCount!=null) ttl += "        sh:maxCount " + p.maxCount + " ;\n";
      if (p.datatype) ttl += "        sh:datatype " + p.datatype + " ;\n";
      if (p.nodeKind) ttl += "        sh:nodeKind " + p.nodeKind + " ;\n";
      if (p.pattern) ttl += '        sh:pattern "' + p.pattern.replace(/\\/g,"\\\\").replace(/"/g,'\\"') + '" ;\n';
      if (p.message) ttl += '        sh:message "' + p.message.replace(/"/g,'\\"') + '" ;\n';
      ttl += "    ] ;\n";
    });
    ttl = ttl.replace(/;\s*$/, ".\n\n");
  });
  document.getElementById("se-ttl-output").value = ttl;
}

function seCopyTTL() {
  var ta = document.getElementById("se-ttl-output");
  navigator.clipboard.writeText(ta.value).then(function(){
    var btn = document.querySelector('[onclick="seCopyTTL()"]');
    if (btn) { var o=btn.textContent; btn.textContent="Copied!"; setTimeout(function(){btn.textContent=o;},1200); }
  });
}
function seDownloadTTL() {
  var ttl = document.getElementById("se-ttl-output").value;
  var b = new Blob([ttl], {type:"text/turtle"});
  var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "shape.ttl"; a.click();
}
function seClear() {
  seState.shapes = [];
  seState.prefixes = Object.assign({}, SE_PREFIXES);
  seRender();
  document.getElementById("se-preview-container").style.display = "none";
}
function seVisualize() {
  var shapeTtl = document.getElementById("se-ttl-output").value;   // inline form the user copies
  if (!shapeTtl.trim()) { alert("Add at least one shape first."); return; }
  var pf = seState.prefixes;
  function ref(x) { return x.indexOf("://") >= 0 ? "<" + x + ">" : x; }
  var prefixDecls = "";
  Object.keys(pf).sort().forEach(function(p) { prefixDecls += "@prefix " + p + ": <" + pf[p] + "> .\n"; });

  // The in-browser parser can't read inline `sh:property [ … ]` blocks, so to
  // draw the SHAPE STRUCTURE (targetClass → each property → datatype/class with
  // min..max) we emit an equivalent NAMED-property-shape graph here. This is
  // diagram-only — se-ttl-output keeps the idiomatic inline form the user copies.
  // We also build sample instance data to seed the Edit & Validate "Source" pane.
  var vizShape = prefixDecls + "\n";
  var sampleData = prefixDecls + "\n";
  seState.shapes.forEach(function(s, si) {
    var tc = ref(s.targetClass);
    var psRefs = [], propBlocks = "";
    s.properties.forEach(function(p, pi) {
      if (!p.path) return;
      var ps = "ex:_ps_" + si + "_" + pi;
      psRefs.push(ps);
      propBlocks += ps + " sh:path " + ref(p.path);
      if (p.minCount != null && p.minCount !== "") propBlocks += " ; sh:minCount " + p.minCount;
      if (p.maxCount != null && p.maxCount !== "") propBlocks += " ; sh:maxCount " + p.maxCount;
      if (p.datatype) propBlocks += " ; sh:datatype " + p.datatype;
      if (p.nodeKind) propBlocks += " ; sh:nodeKind " + p.nodeKind;
      if (p.message) propBlocks += ' ; sh:message "' + String(p.message).replace(/"/g, '\\"') + '"';
      propBlocks += " .\n";
    });
    vizShape += ref(s.shapeIri) + " a sh:NodeShape ;\n    sh:targetClass " + tc;
    psRefs.forEach(function(r) { vizShape += " ;\n    sh:property " + r; });
    vizShape += " .\n" + propBlocks + "\n";

    sampleData += "ex:sample_" + si + " a " + tc + " ;\n    rdfs:label \"Sample " + s.targetClass.split(/[:#/]/).pop() + "\"";
    s.properties.forEach(function(p) {
      if (!p.path) return;
      if (p.datatype || p.nodeKind === "sh:Literal") sampleData += " ;\n    " + ref(p.path) + ' "example"';
      else sampleData += " ;\n    " + ref(p.path) + " ex:target_" + si;
    });
    sampleData += " .\n\n";
  });

  var c = document.getElementById("se-preview-container");
  c.style.display = "";
  setTimeout(function() {
    ontoink.playground("se-preview-container", prefixDecls, vizShape);   // draw the shape STRUCTURE
    // Seed Edit & Validate: Source = sample data, Shapes = the inline shape the user built.
    var ta = c.querySelector(".ov-editor-textarea"); if (ta) ta.value = sampleData;
    var sta = c.querySelector(".ov-editor-shapes-textarea"); if (sta) sta.value = shapeTtl;
  }, 50);
}

var SE_TEMPLATES = {
  "person-name": {
    shapes: [{ id:seId(), shapeIri:"ex:PersonShape", targetClass:"ex:Person", closed:false,
      properties: [{ id:seId(), path:"rdfs:label", minCount:1, maxCount:null, datatype:"xsd:string", nodeKind:"", pattern:"", message:"Every person must have a name" }]
    }]
  },
  "article-fields": {
    shapes: [{ id:seId(), shapeIri:"ex:ArticleShape", targetClass:"ex:Article", closed:false,
      properties: [
        { id:seId(), path:"ex:title", minCount:1, maxCount:1, datatype:"xsd:string", nodeKind:"", pattern:"", message:"Must have exactly one title" },
        { id:seId(), path:"ex:author", minCount:1, maxCount:null, datatype:"", nodeKind:"sh:IRI", pattern:"", message:"At least one author required" },
        { id:seId(), path:"ex:datePublished", minCount:1, maxCount:1, datatype:"xsd:date", nodeKind:"", pattern:"", message:"Must have a publication date" }
      ]
    }]
  },
  "org-one-name": {
    shapes: [{ id:seId(), shapeIri:"ex:OrgShape", targetClass:"ex:Organization", closed:false,
      properties: [{ id:seId(), path:"ex:name", minCount:1, maxCount:1, datatype:"xsd:string", nodeKind:"", pattern:"", message:"Organization must have exactly one name" }]
    }]
  },
  "email-pattern": {
    shapes: [{ id:seId(), shapeIri:"ex:PersonShape", targetClass:"ex:Person", closed:false,
      properties: [
        { id:seId(), path:"ex:name", minCount:1, maxCount:null, datatype:"xsd:string", nodeKind:"", pattern:"", message:"Must have a name" },
        { id:seId(), path:"ex:email", minCount:0, maxCount:1, datatype:"xsd:string", nodeKind:"", pattern:"^[^@]+@[^@]+\\.[^@]+$", message:"Email must be valid (user@domain.tld)" }
      ]
    }]
  }
};

function seLoadTemplate(name) {
  if (!name || !SE_TEMPLATES[name]) return;
  var t = JSON.parse(JSON.stringify(SE_TEMPLATES[name]));
  t.shapes.forEach(function(s) { s.id = seId(); s.properties.forEach(function(p) { p.id = seId(); }); });
  seState.shapes = t.shapes;
  seState.prefixes = Object.assign({}, SE_PREFIXES);
  seRender();
  document.getElementById("se-template-select").value = "";
}

seRender();

// ── Shape Recommender ──────────────────────────────────────────────
// Based on: Mihindukulasooriya et al. (2018) "RDF Shape Induction using Knowledge Base Profiling"
// Algorithm: profile instance data → compute property statistics per class → generate SHACL constraints

function seRecommendFromFile(input) {
  if (!input.files.length) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    document.getElementById("se-recommend-ttl").value = e.target.result;
    seRecommendFromTTL();
  };
  reader.readAsText(input.files[0]);
}

function seRecommendFromTTL() {
  var ttl = document.getElementById("se-recommend-ttl").value.trim();
  if (!ttl) { alert("Paste or upload instance data first."); return; }
  document.getElementById("se-recommend-status").textContent = "Analyzing...";

  // Parse TTL
  var prefixes = {};
  ttl.replace(/@prefix\s+(\w*)\s*:\s*<([^>]+)>\s*\./g, function(_, p, u) { prefixes[p] = u; });

  function resolve(t) {
    t = t.trim();
    if (t === "a") return "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
    if (t[0] === "<" && t[t.length-1] === ">") return t.slice(1,-1);
    var ci = t.indexOf(":"); if (ci >= 0 && prefixes[t.substring(0,ci)]) return prefixes[t.substring(0,ci)] + t.substring(ci+1);
    return t;
  }
  function shorten(u) { for (var p in prefixes) { if (u.indexOf(prefixes[p]) === 0) return p+":"+u.substring(prefixes[p].length); } return u.split("/").pop().split("#").pop(); }
  function isLiteral(v) { return v[0] === '"'; }
  function litType(v) {
    if (v.indexOf("^^") >= 0) { var dt = v.split("^^").pop(); return resolve(dt); }
    return "http://www.w3.org/2001/XMLSchema#string";
  }

  // Parse triples
  var triples = [];
  var RT = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
  var clean = ttl.replace(/#[^\n]*/g, "").replace(/@prefix[^.]*\.\s*/g, "").replace(/@base[^.]*\.\s*/g, "");
  clean.split(/\.\s*(?=\S|$)/).forEach(function(st) {
    st = st.trim(); if (!st) return;
    var parts = st.split(/\s+/);
    if (parts.length >= 3) {
      var s = resolve(parts[0]), i = 1;
      while (i < parts.length - 1) {
        var p = resolve(parts[i]); i++;
        while (i < parts.length) {
          var o = parts[i]; i++;
          if (o === ";") break; if (o === ",") continue;
          var rO = resolve(o);
          if (s && p && rO && s !== ";" && p !== ";" && rO !== ";") triples.push({s:s, p:p, o:rO, raw:parts[i-1]});
          if (i < parts.length && parts[i] === ",") { i++; continue; }
          if (i < parts.length && parts[i] === ";") { i++; break; }
        }
      }
    }
  });

  // Profile: for each class, find instances and their properties
  var classInstances = {}; // class -> [instance IRIs]
  triples.forEach(function(t) { if (t.p === RT) { (classInstances[t.o] = classInstances[t.o] || []).push(t.s); } });

  var recommendations = [];
  Object.keys(classInstances).forEach(function(cls) {
    if (cls.startsWith("http://www.w3.org/")) return;
    var instances = classInstances[cls];
    if (instances.length === 0) return;

    // For each property, profile usage across instances
    // Extended beyond Mihindukulasooriya (2018): tracks values for pattern/range/class inference
    var propStats = {}; // prop -> {count, maxCount, types, allIRI, values, iriTargetClasses, strLengths, numValues, uniqueVals}
    instances.forEach(function(inst) {
      var instProps = {};
      triples.forEach(function(t) {
        if (t.s === inst && t.p !== RT && t.p.indexOf("http") === 0) {
          instProps[t.p] = (instProps[t.p] || 0) + 1;
          if (!propStats[t.p]) propStats[t.p] = {count:0, maxCount:0, allIRI:true, types:new Set(), values:[], iriTargets:[], strLengths:[], numValues:[], uniqueVals:new Set()};
          var ps = propStats[t.p];
          var raw = t.raw || t.o;
          if (isLiteral(raw)) {
            ps.allIRI = false;
            ps.types.add(litType(raw));
            var val = raw.indexOf('"') === 0 ? raw.substring(1, raw.lastIndexOf('"')) : raw;
            ps.values.push(val);
            ps.uniqueVals.add(val);
            ps.strLengths.push(val.length);
            var num = parseFloat(val);
            if (!isNaN(num)) ps.numValues.push(num);
          } else {
            // Track target classes for sh:class inference
            var targetClass = null;
            triples.forEach(function(t2) { if (t2.s === t.o && t2.p === RT) targetClass = t2.o; });
            if (targetClass) ps.iriTargets.push(targetClass);
            ps.uniqueVals.add(t.o);
          }
        }
      });
      Object.keys(instProps).forEach(function(p) {
        if (!propStats[p]) propStats[p] = {count:0, maxCount:0, allIRI:true, types:new Set(), values:[], iriTargets:[], strLengths:[], numValues:[], uniqueVals:new Set()};
        propStats[p].count++;
        if (instProps[p] > propStats[p].maxCount) propStats[p].maxCount = instProps[p];
      });
    });

    // Generate constraints (extended algorithm)
    var props = [];
    Object.keys(propStats).forEach(function(p) {
      var s = propStats[p];
      var constraint = { path: p, pathLabel: shorten(p), extras: [] };
      var confidence = s.count / instances.length;

      // 1. Cardinality (Mihindukulasooriya 2018)
      if (confidence >= 0.9) constraint.minCount = 1;
      if (s.maxCount <= 1) constraint.maxCount = 1;

      // 2. Datatype (Mihindukulasooriya 2018)
      if (s.types.size === 1) constraint.datatype = shorten(Array.from(s.types)[0]);

      // 3. NodeKind (Mihindukulasooriya 2018)
      if (s.allIRI && s.types.size === 0) constraint.nodeKind = "sh:IRI";

      // 4. NEW: sh:class inference — if all IRI values are instances of the same class
      if (s.iriTargets.length > 0) {
        var classCounts = {};
        s.iriTargets.forEach(function(c) { classCounts[c] = (classCounts[c]||0) + 1; });
        var topClass = Object.keys(classCounts).sort(function(a,b){return classCounts[b]-classCounts[a];})[0];
        if (classCounts[topClass] >= s.iriTargets.length * 0.8) {
          constraint.extras.push("sh:class " + shorten(topClass));
        }
      }

      // 5. NEW: sh:pattern inference — detect common string patterns
      if (s.values.length >= 3) {
        var allEmail = s.values.every(function(v){return /^[^@]+@[^@]+\.[^@]+$/.test(v);});
        var allUrl = s.values.every(function(v){return /^https?:\/\//.test(v);});
        var allUpper = s.values.every(function(v){return /^[A-Z]/.test(v);});
        if (allEmail) constraint.extras.push('sh:pattern "^[^@]+@[^@]+\\\\.[^@]+$"');
        else if (allUrl) constraint.extras.push('sh:pattern "^https?://"');
        else if (allUpper) constraint.extras.push('sh:pattern "^[A-Z]"');
      }

      // 6. NEW: sh:minLength / sh:maxLength for strings
      if (s.strLengths.length >= 3) {
        var minLen = Math.min.apply(null, s.strLengths);
        var maxLen = Math.max.apply(null, s.strLengths);
        if (minLen > 0) constraint.extras.push("sh:minLength " + minLen);
        if (maxLen < 500 && maxLen === minLen) constraint.extras.push("sh:maxLength " + maxLen);
      }

      // 7. NEW: sh:minInclusive / sh:maxInclusive for numbers
      if (s.numValues.length >= 3) {
        var minNum = Math.min.apply(null, s.numValues);
        var maxNum = Math.max.apply(null, s.numValues);
        if (minNum >= 0) constraint.extras.push("sh:minInclusive " + minNum);
        constraint.extras.push("sh:maxInclusive " + maxNum);
      }

      // 8. NEW: uniqueness detection — all values unique suggests identifier
      if (s.uniqueVals.size === s.count && s.count >= 3) {
        constraint.extras.push("# unique values — potential identifier");
      }

      constraint.confidence = Math.round(confidence * 100);
      constraint.instanceCount = instances.length;
      constraint.usageCount = s.count;
      props.push(constraint);
    });

    if (props.length > 0) {
      recommendations.push({
        classIri: cls,
        classLabel: shorten(cls),
        instanceCount: instances.length,
        properties: props.sort(function(a,b) { return b.confidence - a.confidence; })
      });
    }
  });

  // Deduplicate by class IRI
  var seen = {};
  recommendations = recommendations.filter(function(r) {
    if (seen[r.classIri]) return false;
    seen[r.classIri] = true;
    return true;
  });

  seRenderRecommendations(recommendations, prefixes);
  document.getElementById("se-recommend-status").textContent = recommendations.length + " shape(s) recommended";
}

var seRecState = { recommendations: [], current: 0, prefixes: {} };

function seRenderRecommendations(recs, prefixes) {
  seRecState.recommendations = recs;
  seRecState.current = 0;
  seRecState.prefixes = prefixes;
  var el = document.getElementById("se-recommend-results");
  if (!recs.length) { el.innerHTML = '<div style="color:#9ca3af;padding:8px;">No classes with instances found.</div>'; return; }
  seRenderCurrentRec();
}

function seRenderCurrentRec() {
  var el = document.getElementById("se-recommend-results");
  var recs = seRecState.recommendations;
  var idx = seRecState.current;
  var rec = recs[idx];

  var h = '<div style="display:flex;align-items:center;gap:8px;margin:10px 0;">';
  h += '<button class="ov-btn" onclick="seRecPrev()" ' + (idx === 0 ? 'disabled style="opacity:0.4;"' : '') + '>&larr; Prev</button>';
  h += '<span style="font-size:13px;font-weight:600;color:#374151;">Shape ' + (idx+1) + ' / ' + recs.length + ': <span style="color:#6366f1;">' + rec.classLabel + '</span> (' + rec.instanceCount + ' instances)</span>';
  h += '<button class="ov-btn" onclick="seRecNext()" ' + (idx === recs.length-1 ? 'disabled style="opacity:0.4;"' : '') + '>Next &rarr;</button>';
  h += '<button class="ov-btn ov-btn-primary" onclick="seRecAccept(' + idx + ')">Accept &amp; Edit</button>';
  h += '<button class="ov-btn" onclick="seRecDownload(' + idx + ')">Download</button>';
  h += '</div>';

  h += '<table style="width:100%;border-collapse:collapse;font-size:12px;background:#fff;border:1px solid #d1d5db;border-radius:8px;overflow:hidden;">';
  var TH = 'style="padding:8px 10px;background:#1f2937;color:#f9fafb;font-size:11px;"';
  h += '<thead><tr><th '+TH+' style="text-align:left;padding:8px 10px;background:#1f2937;color:#f9fafb;">Property</th><th '+TH+'>min</th><th '+TH+'>max</th><th '+TH+'>datatype</th><th '+TH+'>nodeKind</th><th '+TH+'>extra</th><th '+TH+'>confidence</th></tr></thead><tbody>';
  rec.properties.forEach(function(p) {
    var confColor = p.confidence >= 90 ? "#16a34a" : p.confidence >= 50 ? "#f59e0b" : "#9ca3af";
    var TD = 'style="padding:6px 10px;border-bottom:1px solid #e5e7eb;color:#374151;"';
    var extras = (p.extras || []).join("; ");
    h += '<tr><td '+TD+' style="padding:6px 10px;border-bottom:1px solid #e5e7eb;color:#374151;font-weight:500;">' + p.pathLabel + '</td>';
    h += '<td '+TD+' style="padding:6px 10px;border-bottom:1px solid #e5e7eb;color:#374151;text-align:center;">' + (p.minCount != null ? p.minCount : '-') + '</td>';
    h += '<td '+TD+' style="padding:6px 10px;border-bottom:1px solid #e5e7eb;color:#374151;text-align:center;">' + (p.maxCount != null ? p.maxCount : '-') + '</td>';
    h += '<td '+TD+' style="padding:6px 10px;border-bottom:1px solid #e5e7eb;color:#374151;text-align:center;">' + (p.datatype || '-') + '</td>';
    h += '<td '+TD+' style="padding:6px 10px;border-bottom:1px solid #e5e7eb;color:#374151;text-align:center;">' + (p.nodeKind || '-') + '</td>';
    h += '<td '+TD+' style="padding:6px 10px;border-bottom:1px solid #e5e7eb;color:#6366f1;font-size:10px;">' + (extras || '-') + '</td>';
    h += '<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center;color:' + confColor + ';font-weight:600;">' + p.confidence + '%</td>';
    h += '</tr>';
  });
  h += '</tbody></table>';
  el.innerHTML = h;
}

function seRecPrev() { if (seRecState.current > 0) { seRecState.current--; seRenderCurrentRec(); } }
function seRecNext() { if (seRecState.current < seRecState.recommendations.length - 1) { seRecState.current++; seRenderCurrentRec(); } }

function seRecAccept(idx) {
  var rec = seRecState.recommendations[idx];
  var pf = seRecState.prefixes;
  // Merge prefixes
  for (var p in pf) { if (!seState.prefixes[p]) seState.prefixes[p] = pf[p]; }
  // Add shape
  var shape = {
    id: seId(), shapeIri: rec.classLabel.replace(":", "_") + "Shape", targetClass: rec.classLabel, closed: false,
    properties: rec.properties.map(function(p) {
      return { id: seId(), path: p.pathLabel, minCount: p.minCount || null, maxCount: p.maxCount || null,
        datatype: p.datatype || "", nodeKind: p.nodeKind || "", pattern: "", message: "" };
    })
  };
  seState.shapes.push(shape);
  seRender();
}

function seRecDownload(idx) {
  var rec = seRecState.recommendations[idx];
  var pf = Object.assign({}, SE_PREFIXES, seRecState.prefixes);
  var ttl = "";
  for (var p in pf) ttl += "@prefix " + p + ": <" + pf[p] + "> .\n";
  ttl += "\n";
  var iri = rec.classLabel.replace(":", "_") + "Shape";
  ttl += iri + " a sh:NodeShape ;\n    sh:targetClass " + rec.classLabel + " ;\n";
  rec.properties.forEach(function(p) {
    ttl += "    sh:property [\n        sh:path " + p.pathLabel + " ;\n";
    if (p.minCount != null) ttl += "        sh:minCount " + p.minCount + " ;\n";
    if (p.maxCount != null) ttl += "        sh:maxCount " + p.maxCount + " ;\n";
    if (p.datatype) ttl += "        sh:datatype " + p.datatype + " ;\n";
    if (p.nodeKind) ttl += "        sh:nodeKind " + p.nodeKind + " ;\n";
    if (p.extras) p.extras.forEach(function(ex) { if (ex[0] !== "#") ttl += "        " + ex + " ;\n"; });
    ttl += "    ] ;\n";
  });
  ttl = ttl.replace(/;\s*$/, ".\n");
  var b = new Blob([ttl], {type:"text/turtle"});
  var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = rec.classLabel.replace(":", "_") + "_shape.ttl"; a.click();
}

async function seRecommendFromEndpoint() {
  var endpoint = document.getElementById("se-sparql-endpoint").value.trim();
  if (!endpoint) { alert("Enter a SPARQL endpoint URL."); return; }
  document.getElementById("se-recommend-status").textContent = "Querying endpoint...";

  try {
    // Discover classes with instance counts
    var resp = await fetch(endpoint + "?query=" + encodeURIComponent("SELECT ?class (COUNT(?s) AS ?count) WHERE { ?s a ?class . } GROUP BY ?class ORDER BY DESC(?count) LIMIT 20"), {headers:{"Accept":"application/sparql-results+json"}});
    var data = await resp.json();
    var classes = data.results.bindings.map(function(b) { return {iri: b["class"].value, count: parseInt(b["count"].value)||0}; }).filter(function(c){return c.iri.indexOf("http")===0 && !c.iri.startsWith("http://www.w3.org/");});

    var recommendations = [];
    // For each class (top 10), profile properties
    for (var ci = 0; ci < Math.min(classes.length, 10); ci++) {
      var cls = classes[ci];
      document.getElementById("se-recommend-status").textContent = "Profiling " + (ci+1) + "/" + Math.min(classes.length, 10) + "...";
      try {
        var pResp = await fetch(endpoint + "?query=" + encodeURIComponent(
          "SELECT ?prop (COUNT(?val) AS ?usage) (COUNT(DISTINCT ?s) AS ?instances) (MIN(DATATYPE(?val)) AS ?dtype) WHERE { ?s a <" + cls.iri + "> ; ?prop ?val . FILTER(?prop != <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>) } GROUP BY ?prop ORDER BY DESC(?usage) LIMIT 30"
        ), {headers:{"Accept":"application/sparql-results+json"}});
        var pData = await pResp.json();
        var props = pData.results.bindings.map(function(b) {
          var instCount = parseInt(b["instances"]?.value) || 0;
          var confidence = cls.count > 0 ? Math.round(instCount / cls.count * 100) : 0;
          var short = b["prop"].value.indexOf("#") >= 0 ? b["prop"].value.split("#").pop() : b["prop"].value.split("/").pop();
          return {
            path: b["prop"].value, pathLabel: short,
            minCount: confidence >= 90 ? 1 : null,
            maxCount: null,
            datatype: b["dtype"]?.value ? (b["dtype"].value.indexOf("#")>=0 ? "xsd:"+b["dtype"].value.split("#").pop() : "") : "",
            nodeKind: "",
            confidence: confidence, instanceCount: cls.count, usageCount: parseInt(b["usage"]?.value)||0
          };
        });
        if (props.length) {
          var short2 = cls.iri.indexOf("#") >= 0 ? cls.iri.split("#").pop() : cls.iri.split("/").pop();
          recommendations.push({ classIri: cls.iri, classLabel: short2, instanceCount: cls.count, properties: props });
        }
      } catch(e) {}
    }
    seRenderRecommendations(recommendations, {});
    document.getElementById("se-recommend-status").textContent = recommendations.length + " shape(s) recommended from endpoint";
  } catch(e) {
    document.getElementById("se-recommend-status").textContent = "Error: " + e.message;
  }
}

// Datalist suggestions for common classes and properties
var COMMON_CLASSES = ["ex:Person","ex:Organization","ex:Article","ex:Event","ex:Place","ex:Document","ex:Agent","ex:Dataset","rdfs:Resource","owl:Thing","foaf:Person","foaf:Agent","schema:Person","schema:Organization","schema:Article","schema:Event","skos:Concept"];
var COMMON_PROPS = ["rdfs:label","rdfs:comment","ex:name","ex:title","ex:author","ex:date","ex:email","ex:description","ex:identifier","ex:url","ex:homepage","foaf:name","foaf:mbox","foaf:knows","schema:name","schema:author","schema:datePublished","schema:description","schema:url","skos:prefLabel","skos:altLabel","skos:definition","dc:title","dc:creator","dc:date"];

function buildDataLists() {
  // Remove old ones
  var old1 = document.getElementById("se-class-list"); if(old1) old1.remove();
  var old2 = document.getElementById("se-prop-list"); if(old2) old2.remove();
  // Build from prefixes + common
  var allPfx = Object.keys(seState.prefixes);
  var classes = COMMON_CLASSES.slice();
  var props = COMMON_PROPS.slice();
  // Add user-defined shapes as class suggestions
  seState.shapes.forEach(function(s) { if (classes.indexOf(s.targetClass)<0) classes.push(s.targetClass); });
  // Add prefix-based suggestions
  allPfx.forEach(function(p) { if (classes.indexOf(p+":MyClass")<0) classes.push(p+":MyClass"); });

  var dl1 = document.createElement("datalist"); dl1.id = "se-class-list";
  classes.forEach(function(c) { var o = document.createElement("option"); o.value = c; dl1.appendChild(o); });
  document.body.appendChild(dl1);

  var dl2 = document.createElement("datalist"); dl2.id = "se-prop-list";
  props.forEach(function(p) { var o = document.createElement("option"); o.value = p; dl2.appendChild(o); });
  document.body.appendChild(dl2);
}
buildDataLists();
// Rebuild datalists when prefixes change
var origSeRender = seRender;
seRender = function() { origSeRender(); buildDataLists(); };
</script>

---

## Shape Recommender — Methodology

The Shape Recommender uses **data profiling** to auto-generate SHACL constraints from instance data. It extends the approach from *Mihindukulasooriya et al. (2018) "RDF Shape Induction using Knowledge Base Profiling"* with novel constraint types.

### Algorithm

1. **Class discovery** — finds all classes with `rdf:type` instances
2. **Property profiling** — for each class, counts property usage across all instances
3. **Constraint inference:**
    - **Cardinality**: 90%+ coverage → `sh:minCount 1`; max 1 per instance → `sh:maxCount 1`
    - **Datatype**: consistent XSD type → `sh:datatype`
    - **NodeKind**: all IRI values → `sh:nodeKind sh:IRI`
    - **sh:class** *(novel)*: 80%+ of IRI values typed as same class → `sh:class`
    - **sh:pattern** *(novel)*: auto-detect email, URL, uppercase patterns from string values
    - **sh:minLength/maxLength** *(novel)*: from string length statistics
    - **sh:minInclusive/maxInclusive** *(novel)*: from numeric value ranges
    - **Uniqueness** *(novel)*: all values unique → potential identifier annotation
4. **Confidence scoring** — percentage of instances exhibiting each pattern

### Input Modes

- **Upload TTL** — client-side analysis, instant results
- **SPARQL endpoint** — remote profiling via SPARQL queries (top 10 classes, 30 properties each)

### References

- Mihindukulasooriya, N., Poveda-Villalón, M., Li, D., Gómez-Pérez, A. (2018). *RDF Shape Induction using Knowledge Base Profiling.* SAC 2018.
- Spahiu, B., Kontokostas, D., Hellmann, S., Auer, S. (2018). *Towards Improving the Quality of Knowledge Graphs with Data-driven Ontology Patterns.* ISWC 2018.

---

## What is SHACL?

[SHACL](https://www.w3.org/TR/shacl/) (Shapes Constraint Language) defines rules that RDF data must follow. Think of it as a "schema" for your knowledge graph.

### Key Concepts

| Concept | What it means | Example |
|:--------|:-------------|:--------|
| **sh:NodeShape** | A set of rules for a class | "Rules for Person instances" |
| **sh:targetClass** | Which class the rules apply to | `ex:Person` |
| **sh:property** | A constraint on a specific property | "must have a name" |
| **sh:minCount** | Minimum values required (0 = optional, 1 = mandatory) | `sh:minCount 1` |
| **sh:maxCount** | Maximum values allowed (1 = at most one) | `sh:maxCount 1` |
| **sh:datatype** | Value must be a specific type | `xsd:string`, `xsd:date` |
| **sh:nodeKind** | Value must be IRI, literal, or blank node | `sh:IRI` |
| **sh:pattern** | Value must match a regex | `^[A-Z]` |
| **sh:closed** | Only declared properties are allowed | Prevents unexpected data |
| **sh:message** | Custom error message | "Name is required" |

### Common Patterns

**Mandatory property:** `sh:minCount 1` — the property must exist at least once

**Exactly one:** `sh:minCount 1; sh:maxCount 1` — must have exactly one value

**Optional with limit:** `sh:maxCount 3` — at most 3 values (but can be 0)

**Type constraint:** `sh:datatype xsd:string` — value must be a string

**Email validation:** `sh:pattern "^[^@]+@[^@]+\\.[^@]+$"` — must match email regex
