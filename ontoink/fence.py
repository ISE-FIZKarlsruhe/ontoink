"""Custom fence handler for ```ontoink code blocks."""

import base64
import json
import os
import traceback

import yaml

from .ttl_parser import parse_ttl_to_cytoscape
from .shacl_validator import validate_graph

_graph_counter = 0


def reset_counter():
    global _graph_counter
    _graph_counter = 0


def render_ontoink(source, language, class_name, options, md, **kwargs):
    """
    Custom fence handler called by pymdownx.superfences.

    Source block YAML:
        source: shapes/role-bearer/shape-data.ttl
        shape: shapes/role-bearer/shape.ttl
        height: 500px          # optional, default 500px
        editor: true           # optional, default true
        legend: true           # optional, default true
        namespaces: true       # optional, default true
    """
    global _graph_counter
    graph_id = f"ontoink-graph-{_graph_counter}"
    _graph_counter += 1

    try:
        config = yaml.safe_load(source)
        docs_dir = getattr(render_ontoink, "docs_dir", ".")

        data_path = os.path.join(docs_dir, config["source"])
        shape_path = ""
        if "shape" in config:
            shape_path = os.path.join(docs_dir, config["shape"])

        # Parse TTL → Cytoscape JSON
        cytoscape_data = parse_ttl_to_cytoscape(data_path, shape_path)

        # Build-time SHACL validation
        if shape_path:
            try:
                validation = validate_graph(data_path, shape_path)
                cytoscape_data["validation"] = validation
            except Exception:
                cytoscape_data["validation"] = None
        else:
            cytoscape_data["validation"] = None

        json_str = json.dumps(cytoscape_data, ensure_ascii=False)
        b64_data = base64.b64encode(json_str.encode("utf-8")).decode("ascii")

        height = config.get("height", "500px")
        show_editor = str(config.get("editor", "true")).lower() == "true"
        show_legend = str(config.get("legend", "true")).lower() == "true"
        show_ns = str(config.get("namespaces", "true")).lower() == "true"

        show_reasoning = str(config.get("reasoning", "true")).lower() == "true"
        # Optional per-diagram default reasoner for the dropdown, e.g.
        #   reasoner: owlrl            (→ Server: OWL-RL)
        #   reasoner: server:owlready2 | browser | auto
        # Bare backend names map to the matching Server: option.
        default_reasoner = str(config.get("reasoner", "")).strip()

        editor_btn = ""
        if show_editor:
            editor_btn = f'<button class="ov-btn ov-btn-accent" onclick="ontoink.toggleEditor(\'{graph_id}\')" title="Edit TTL & Validate">Edit &amp; Validate</button>\n'

        reasoning_btn = ""
        if show_reasoning:
            reasoning_btn = f'<button class="ov-btn" onclick="ontoink.toggleReasoning(\'{graph_id}\')" title="Show/hide inferred triples">Reasoning</button>\n'

        return (
            f'<div id="{graph_id}" class="ontoink-container" '
            f'data-ontoink-graph="{b64_data}" '
            f'data-show-legend="{str(show_legend).lower()}" '
            f'data-reasoner="{default_reasoner}" '
            f'data-show-ns="{str(show_ns).lower()}">\n'
            f'  <div class="ov-toolbar">\n'
            f'    <div class="ov-toolbar-group">\n'
            f'      <button class="ov-btn" onclick="ontoink.zoomIn(\'{graph_id}\')" title="Zoom in">+</button>\n'
            f'      <button class="ov-btn" onclick="ontoink.zoomOut(\'{graph_id}\')" title="Zoom out">&minus;</button>\n'
            f'      <button class="ov-btn" onclick="ontoink.fit(\'{graph_id}\')" title="Fit to view">Fit</button>\n'
            f'      <button class="ov-btn" onclick="ontoink.fullscreen(\'{graph_id}\')" title="Fullscreen">&#x26F6;</button>\n'
            f'      <select class="ov-layout-select" onchange="ontoink.changeLayout(\'{graph_id}\',this.value)" title="Layout algorithm">\n'
            f'        <option value="dagre">Dagre</option><option value="cose">Force</option><option value="circle">Circle</option>\n'
            f'        <option value="concentric">Concentric</option><option value="breadthfirst">Tree</option><option value="grid">Grid</option>\n'
            f'      </select>\n'
            f'    </div>\n'
            f'    <div class="ov-toolbar-group">\n'
            f'      <input class="ov-search-input" type="text" placeholder="Search..." oninput="ontoink.search(\'{graph_id}\',this.value)" title="Fuzzy search nodes &amp; edges">\n'
            f'    </div>\n'
            f'    <div class="ov-toolbar-group">\n'
            f'      <button class="ov-btn" onclick="ontoink.exportPNG(\'{graph_id}\')" title="Export PNG">PNG</button>\n'
            f'      <button class="ov-btn" onclick="ontoink.exportSVG(\'{graph_id}\')" title="Export SVG">SVG</button>\n'
            f'      <button class="ov-btn" onclick="ontoink.downloadTTL(\'{graph_id}\')" title="Download TTL">TTL</button>\n'
            f'    </div>\n'
            f'    <div class="ov-toolbar-group">\n'
            f'      <button class="ov-btn" onclick="ontoink.toggleColors(\'{graph_id}\')" title="Edit layout, colors and shapes">Edit Layout</button>\n'
            f'      <button class="ov-btn" onclick="ontoink.abstractView(\'{graph_id}\')" title="Show abstract model (classes only)">Abstract</button>\n'
            f'      <button class="ov-btn" onclick="ontoink.toggleStats(\'{graph_id}\')" title="Graph statistics">Stats</button>\n'
            f'      <button class="ov-btn" onclick="ontoink.togglePathFinder(\'{graph_id}\')" title="Find paths between nodes">Paths</button>\n'
            f'      <button class="ov-btn" onclick="ontoink.toggleSparql(\'{graph_id}\')" title="SPARQL query">SPARQL</button>\n'
            f'      {reasoning_btn}'
            f'      <select class="ov-reasoner-select" title="Select reasoner backend"></select>\n'
            f'      {editor_btn}'
            f'    </div>\n'
            f'  </div>\n'
            f'  <div class="ov-canvas-wrap" style="position:relative;width:100%;height:{height};">\n'
            f'    <div class="ov-canvas" style="width:100%;height:100%;"></div>\n'
            f'    <div class="ov-legend-overlay ov-draggable" style="bottom:12px;left:12px;"></div>\n'
            f'    <div class="ov-ns-overlay ov-draggable" style="bottom:12px;right:12px;"></div>\n'
            f'    <div class="ov-minimap" style="position:absolute;top:8px;right:8px;width:150px;height:100px;border:1px solid #d1d5db;border-radius:6px;background:rgba(255,255,255,0.9);overflow:hidden;"></div>\n'
            f'  </div>\n'
            f'  <div class="ov-stats-panel" style="display:none;"></div>\n'
            f'  <div class="ov-pathfinder-panel" style="display:none;"></div>\n'
            f'  <div class="ov-sparql-panel" style="display:none;"></div>\n'
            f'  <div class="ov-reasoning-panel" style="display:none;">\n'
            f'    <div class="ov-editor-header ov-panel-head">Inferred Triples (OWL-RL)<button class="ov-panel-close" onclick="this.closest(\'.ov-reasoning-panel\').style.display=\'none\'">&times;</button></div>\n'
            f'    <div class="ov-reasoning-content"></div>\n'
            f'    <div class="ov-editor-actions">\n'
            f'      <label style="display:flex;align-items:center;gap:6px;font-size:13px;font-family:var(--ov-font);cursor:pointer;">'
            f'<input type="checkbox" class="ov-reasoning-graph-toggle" onchange="ontoink.toggleInferredOnGraph(\'{graph_id}\',this.checked)"> Show on graph</label>\n'
            f'      <button class="ov-btn" onclick="ontoink.validateWithReasoning(\'{graph_id}\')">Validate with Inferences</button>\n'
            f'    </div>\n'
            f'  </div>\n'
            f'  <div class="ov-editor-panel" style="display:none;">\n'
            f'    <div class="ov-editor-header ov-panel-head">Edit &amp; Validate<button class="ov-panel-close" onclick="this.closest(\'.ov-editor-panel\').style.display=\'none\'">&times;</button></div>\n'
            f'    <div class="ov-editor-split">\n'
            f'      <div class="ov-editor-left">\n'
            f'        <div class="ov-editor-header">Source (data TTL)</div>\n'
            f'        <textarea class="ov-editor-textarea"></textarea>\n'
            f'      </div>\n'
            f'      <div class="ov-editor-right">\n'
            f'        <div class="ov-editor-header">SHACL Shapes</div>\n'
            f'        <textarea class="ov-editor-shapes-textarea"></textarea>\n'
            f'      </div>\n'
            f'    </div>\n'
            f'    <div class="ov-editor-report">\n'
            f'      <div class="ov-editor-header">Validation Report</div>\n'
            f'      <div class="ov-validation-output"></div>\n'
            f'    </div>\n'
            f'    <div class="ov-editor-actions">\n'
            f'      <button class="ov-btn ov-btn-primary" onclick="ontoink.validate(\'{graph_id}\')">Validate</button>\n'
            f'      <button class="ov-btn" onclick="ontoink.updateGraph(\'{graph_id}\')">Update Graph</button>\n'
            f'      <button class="ov-btn" onclick="ontoink.resetEditor(\'{graph_id}\')">Reset</button>\n'
            f'    </div>\n'
            f'  </div>\n'
            f'</div>\n'
        )

    except Exception as e:
        tb = traceback.format_exc()
        return (
            f'<div class="ov-error">'
            f'<strong>Error rendering ontoink:</strong><br>'
            f'<code>{e}</code>'
            f'<pre style="font-size:11px;overflow:auto;max-height:200px;">{tb}</pre>'
            f'</div>'
        )
