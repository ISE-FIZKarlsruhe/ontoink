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

        editor_btn = ""
        if show_editor:
            editor_btn = f'<button class="ov-btn ov-btn-accent" onclick="ontoink.toggleEditor(\'{graph_id}\')" title="Edit TTL & Validate">Edit &amp; Validate</button>\n'

        return (
            f'<div id="{graph_id}" class="ontoink-container" '
            f'data-ontoink-graph="{b64_data}" '
            f'data-show-legend="{str(show_legend).lower()}" '
            f'data-show-ns="{str(show_ns).lower()}">\n'
            f'  <div class="ov-toolbar">\n'
            f'    <div class="ov-toolbar-group">\n'
            f'      <button class="ov-btn" onclick="ontoink.zoomIn(\'{graph_id}\')" title="Zoom in">+</button>\n'
            f'      <button class="ov-btn" onclick="ontoink.zoomOut(\'{graph_id}\')" title="Zoom out">&minus;</button>\n'
            f'      <button class="ov-btn" onclick="ontoink.fit(\'{graph_id}\')" title="Fit to view">Fit</button>\n'
            f'      <button class="ov-btn" onclick="ontoink.fullscreen(\'{graph_id}\')" title="Fullscreen">&#x26F6;</button>\n'
            f'    </div>\n'
            f'    <div class="ov-toolbar-group">\n'
            f'      <button class="ov-btn" onclick="ontoink.exportPNG(\'{graph_id}\')" title="Export PNG">PNG</button>\n'
            f'      <button class="ov-btn" onclick="ontoink.exportSVG(\'{graph_id}\')" title="Export SVG">SVG</button>\n'
            f'      <button class="ov-btn" onclick="ontoink.downloadTTL(\'{graph_id}\')" title="Download TTL">TTL</button>\n'
            f'    </div>\n'
            f'    <div class="ov-toolbar-group">\n'
            f'      <button class="ov-btn" onclick="ontoink.toggleColors(\'{graph_id}\')" title="Edit layout, colors and shapes">Edit Layout</button>\n'
            f'      {editor_btn}'
            f'    </div>\n'
            f'  </div>\n'
            f'  <div class="ov-canvas-wrap" style="position:relative;width:100%;height:{height};">\n'
            f'    <div class="ov-canvas" style="width:100%;height:100%;"></div>\n'
            f'    <div class="ov-legend-overlay ov-draggable" style="bottom:12px;left:12px;"></div>\n'
            f'    <div class="ov-ns-overlay ov-draggable" style="bottom:12px;right:12px;"></div>\n'
            f'  </div>\n'
            f'  <div class="ov-editor-panel" style="display:none;">\n'
            f'    <div class="ov-editor-split">\n'
            f'      <div class="ov-editor-left">\n'
            f'        <div class="ov-editor-header">TTL Editor</div>\n'
            f'        <textarea class="ov-editor-textarea"></textarea>\n'
            f'      </div>\n'
            f'      <div class="ov-editor-right">\n'
            f'        <div class="ov-editor-header">Validation Results</div>\n'
            f'        <div class="ov-validation-output"></div>\n'
            f'      </div>\n'
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
