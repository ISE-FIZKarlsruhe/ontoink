# Live Editor

Type ontology triples in a small text notation on the left, and see the
graph render live on the right. The generated Turtle sits at the bottom
so you can copy it into your project or save it as a file.

**"DSL"** stands for **Domain-Specific Language** — a tiny language
purpose-built for one job (here: writing RDF triples). It's a shorthand
for Turtle: `-a->` means `rdf:type`, `-isa->` means `rdfs:subClassOf`,
and every triple round-trips into standard Turtle. Pick an example from
the dropdown to see the shorthand in action, or open
[Syntax](live-editor-syntax.md) for the full reference.

**Press `Ctrl+Space`** (or `Cmd+Space` on Mac) anywhere in the editor to
open **autocomplete**: 144 well-known terms from RDF, RDFS, OWL, XSD,
SKOS, FOAF, Dublin Core, PROV, schema.org, BFO, RO, IAO, SIO, and SHACL.
Pick one and its `@prefix` line is auto-inserted at the top.

<div id="live-editor-app" class="ontoink-container">
  <div class="le-toolbar">
    <span class="le-title">Live editor</span>
    <span class="le-note">D2-style ontology DSL &middot; triples render as you type &middot; Ctrl+Space for autocomplete</span>
    <span class="le-spacer"></span>
    <label class="le-example-label" for="le-example-select">Load example:</label>
    <select id="le-example-select" onchange="if(this.value){ontoink.liveEditor.loadExample('live-editor-app',this.value);this.selectedIndex=0;}" title="Drop a predefined example into the editor">
      <option value="">— Pick an example —</option>
    </select>
    <button class="ov-btn" onclick="ontoink.liveEditor.reset('live-editor-app')" title="Restore the tutorial text">Reset</button>
    <button class="ov-btn" onclick="ontoink.liveEditor.copyTtl('live-editor-app')" title="Copy generated Turtle to clipboard">Copy TTL</button>
    <button class="ov-btn" onclick="ontoink.liveEditor.downloadTtl('live-editor-app')" title="Save as .ttl">Save .ttl</button>
    <button class="ov-btn" onclick="ontoink.liveEditor.downloadNTriples('live-editor-app')" title="Save as .nt (N-Triples)">Save .nt</button>
    <a class="ov-btn" href="../live-editor-syntax/" title="Syntax reference">Syntax</a>
  </div>
  <div class="le-split">
    <div class="le-pane le-pane-editor">
      <div class="le-pane-head">Ontology DSL &nbsp;<span class="le-pane-note">(Domain-Specific Language · Ctrl+Space for terms)</span></div>
      <textarea id="le-editor" class="le-editor" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off"></textarea>
      <div id="le-errors" class="le-errors" style="display:none;"></div>
    </div>
    <div class="le-pane le-pane-graph">
      <div class="le-pane-head">Graph <span id="le-graph-stats" class="le-graph-stats"></span></div>
      <div id="le-graph" class="ontoink-container le-graph">
        <div class="ov-toolbar">
          <div class="ov-toolbar-group">
            <button class="ov-btn" onclick="ontoink.zoomIn('le-graph')" title="Zoom in">+</button>
            <button class="ov-btn" onclick="ontoink.zoomOut('le-graph')" title="Zoom out">&minus;</button>
            <button class="ov-btn" onclick="ontoink.fit('le-graph')" title="Fit to view">Fit</button>
            <select class="ov-layout-select" onchange="ontoink.changeLayout('le-graph',this.value)" title="Layout algorithm">
              <option value="dagre">Dagre</option><option value="cose">Force</option><option value="circle">Circle</option>
              <option value="concentric">Concentric</option><option value="breadthfirst">Tree</option><option value="grid">Grid</option>
            </select>
          </div>
          <div class="ov-toolbar-group">
            <span class="ov-lod-label">LOD</span>
            <select class="ov-lod-select" onchange="ontoink.setLodLevel('le-graph', this.value)">
              <option value="0">L0 &middot; classes only</option>
              <option value="1">L1 &middot; + hierarchy</option>
              <option value="2">L2 &middot; + individuals &amp; object props</option>
              <option value="3">L3 &middot; + OWL restrictions</option>
              <option value="4">L4 &middot; + data props &amp; literals</option>
              <option value="5">L5 &middot; everything except inferred</option>
              <option value="6" selected>L6 &middot; everything</option>
            </select>
            <button class="ov-btn" onclick="ontoink.openAtticPanel('le-graph')" title="Hidden panel — everything the current LOD level has removed">Hidden</button>
            <label class="ov-super-toggle" title="Group by namespace — collapse each namespace into one hexagon super-node."><input type="checkbox" checked onchange="ontoink.toggleSuperNodes('le-graph',this.checked)"> Group</label>
            <button class="ov-btn" onclick="ontoink.openFacetsPanel('le-graph')" title="Facets — narrow the view">Facets</button>
            <select class="ov-lod-select" onchange="ontoink.applyStylePreset('le-graph',this.value)" title="Ontology visualization style preset">
              <option value="ontoink" selected>Style: Ontoink</option>
              <option value="chowlk">Style: Chowlk</option>
              <option value="graffoo">Style: Graffoo</option>
              <option value="vowl">Style: VOWL</option>
            </select>
          </div>
          <div class="ov-toolbar-group">
            <button class="ov-btn" onclick="ontoink.exportPNG('le-graph')" title="Export PNG">PNG</button>
            <button class="ov-btn" onclick="ontoink.exportSVG('le-graph')" title="Export SVG">SVG</button>
          </div>
        </div>
        <div class="ov-canvas-wrap" style="position:relative;width:100%;height:520px;">
          <div class="ov-canvas" style="width:100%;height:100%;"></div>
          <div class="ov-legend-overlay ov-draggable" style="bottom:12px;left:12px;"></div>
          <div class="ov-ns-overlay ov-draggable" style="bottom:12px;right:12px;"></div>
        </div>
        <!-- Hidden / Facets panels — target of ontoink.openAtticPanel / openFacetsPanel. -->
        <div class="ov-attic-panel" id="le-graph-attic" style="display:none;">
          <div class="ov-editor-header ov-panel-head">Hidden by LOD  ·  pin to reveal<button class="ov-btn-close" onclick="ontoink.closeAtticPanel('le-graph')" title="Close">&times;</button></div>
          <div class="ov-attic-body" id="le-graph-attic-body"></div>
        </div>
        <div class="ov-facets-panel ov-attic-panel" id="le-graph-facets" style="display:none;">
          <div class="ov-editor-header ov-panel-head">Facets  ·  narrow the view<button class="ov-btn-close" onclick="ontoink.closeFacetsPanel('le-graph')" title="Close">&times;</button></div>
          <div class="ov-attic-body" id="le-graph-facets-body"></div>
        </div>
      </div>
    </div>
  </div>
  <div class="le-pane-ttl">
    <div class="le-pane-head">Generated Turtle</div>
    <pre id="le-ttl-output" class="le-ttl"></pre>
  </div>
</div>

<!--
  ontoink.js + ontoink-dsl.js are both inlined by the mkdocs ontoink
  plugin's on_post_page hook (triggered by "ontoink.liveEditor" appearing
  on this page). The plugin script also calls liveEditor.mount() itself
  once its IIFE has finished exporting — no page-side <script> needed.
-->

<style>
#live-editor-app { display: block; }
#live-editor-app .le-toolbar {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 8px 12px; background: #f9fafb;
  border: 1px solid #e5e7eb; border-radius: 6px 6px 0 0;
  font-family: 'Inter','Segoe UI',system-ui,sans-serif;
}
#live-editor-app .le-title { font-weight: 700; color: #0e7490; }
#live-editor-app .le-note  { color: #6b7280; font-size: 12px; }
#live-editor-app .le-spacer{ flex: 1 1 auto; }
#live-editor-app .le-example-label { font-size: 12px; color: #374151; margin-right: 2px; }
#live-editor-app #le-example-select {
  font-family: inherit; font-size: 12px; padding: 3px 6px;
  border: 1px solid #cbd5e1; border-radius: 4px; background: #fff; color: #0f172a; cursor: pointer;
  max-width: 240px;
}
#live-editor-app .le-split { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 8px 0; }
#live-editor-app .le-pane  { display: flex; flex-direction: column; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; background: #fff; }
#live-editor-app .le-pane-head { padding: 6px 12px; background: #f3f4f6; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; color: #6b7280; text-transform: uppercase; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; justify-content: space-between; }
#live-editor-app .le-pane-note { color: #9ca3af; font-weight: 500; letter-spacing: 0; text-transform: none; font-size: 11px; }
#live-editor-app .le-graph-stats { font-weight: 500; letter-spacing: 0; color: #9ca3af; text-transform: none; font-size: 11px; }
#live-editor-app .le-editor {
  width: 100%; height: 480px; box-sizing: border-box;
  padding: 12px 14px; border: 0; outline: none; resize: vertical;
  font-family: 'Consolas','Menlo','Courier New',monospace;
  font-feature-settings: "liga" 0, "calt" 0;
  font-variant-ligatures: none;
  font-size: 13px; line-height: 1.55;
  background: #fff; color: #111827;
  tab-size: 2;
}
#live-editor-app .le-errors {
  border-top: 1px solid #fecaca; background: #fef2f2; color: #991b1b;
  padding: 8px 12px; font-family: 'Consolas','Menlo',monospace; font-size: 12px;
  max-height: 140px; overflow-y: auto;
}
#live-editor-app .le-errors .le-err-row { padding: 2px 0; }
#live-editor-app .le-errors .le-err-loc { color: #dc2626; font-weight: 700; margin-right: 8px; }
#live-editor-app .le-pane-ttl { border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; background: #fff; margin-top: 8px; }
#live-editor-app .le-ttl {
  margin: 0; padding: 12px 14px;
  font-family: 'Consolas','Menlo','Courier New',monospace; font-size: 12px; line-height: 1.55;
  font-feature-settings: "liga" 0, "calt" 0;
  background: #0f172a; color: #e2e8f0;
  white-space: pre-wrap; word-break: break-all;
  min-height: 60px; max-height: 260px; overflow-y: auto;
}
@media (max-width: 900px) {
  #live-editor-app .le-split { grid-template-columns: 1fr; }
}

/* v0.7.5 — Ctrl+Space autocomplete popup */
.le-autocomplete {
  position: fixed; z-index: 10000;
  width: 460px; max-height: 360px; overflow-y: auto;
  background: #ffffff; border: 1px solid #cbd5e1;
  border-radius: 6px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.15);
  font-family: 'Inter','Segoe UI',system-ui,sans-serif; font-size: 12px;
}
.le-autocomplete .le-ac-row {
  display: grid; grid-template-columns: 44px 130px 1fr; gap: 10px;
  align-items: center; padding: 6px 10px;
  border-bottom: 1px solid #f1f5f9; cursor: pointer;
}
.le-autocomplete .le-ac-row:hover, .le-autocomplete .le-ac-active {
  background: #f0f9ff;
}
.le-autocomplete .le-ac-kind {
  display: inline-block; color: #ffffff; font-size: 10px;
  font-weight: 700; padding: 2px 6px; border-radius: 4px;
  text-transform: uppercase; text-align: center; letter-spacing: 0.03em;
}
.le-autocomplete .le-ac-curie { font-family: 'Consolas','Menlo',monospace; font-size: 12px; color: #0e7490; font-weight: 600; }
.le-autocomplete .le-ac-label { color: #111827; font-size: 12px; }
.le-autocomplete .le-ac-doc { grid-column: 2 / -1; color: #6b7280; font-size: 11px; margin-top: 2px; }
</style>
