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


def _apply_build_time_clustering(cytoscape_data, cluster_cfg):
    """Run Leiden (or the configured algorithm) on the parsed graph and swap
    it for an overview + side-store, in place.

    Silently no-ops when the ``ontoink[cluster]`` extras (python-igraph +
    leidenalg) aren't installed, when the graph is too small, or when the
    clustering pass raises — the JS side then falls back to browser-side
    namespace grouping and nothing looks broken.

    Args:
        cytoscape_data: dict from ``parse_ttl_to_cytoscape``; mutated in place.
            After a successful run:
              * ``nodes``/``edges`` shrink to top-level (super-nodes + surviving
                originals + synthetic super-edges).
              * ``clusters`` gets the meta list (id, title, size, member_ids,
                centrality) consumed by ``collapseSuperNode`` in the browser.
              * ``_side_store`` gets the per-cluster interior blobs; the fence
                pops this into its own base64 attribute (see below).
        cluster_cfg: dict from YAML — supports ``algorithm``, ``min_size``,
            ``max_supernodes``, and ``min_nodes`` (skip below this size).
    """
    if not isinstance(cytoscape_data, dict):
        return
    nodes = cytoscape_data.get("nodes") or []
    if not nodes:
        return
    min_nodes = int(cluster_cfg.get("min_nodes", 200) or 0)
    if len(nodes) < min_nodes:
        return

    try:
        # Local import so the top-level fence import stays cheap and the
        # ontoink[cluster] extras stay truly optional.
        from .cluster import detect_clusters
    except ImportError:
        return

    algorithm = str(cluster_cfg.get("algorithm", "leiden") or "leiden").lower()
    min_size = int(cluster_cfg.get("min_size", 8) or 8)
    max_supernodes = int(cluster_cfg.get("max_supernodes", 30) or 30)

    try:
        top_nodes, top_edges, clusters, side_store, centrality = detect_clusters(
            cytoscape_data,
            algorithm=algorithm,
            min_size=min_size,
            max_supernodes=max_supernodes,
        )
    except ImportError:
        # ``detect_clusters`` re-raises ImportError when igraph / leidenalg
        # aren't installed (silent skip path).
        return
    except Exception:
        # Any other failure (e.g. degenerate graph, algorithm-specific
        # blow-up) should not brick the build — leave the browser fallback
        # to run and log the traceback so authors can see it.
        traceback.print_exc()
        return

    cytoscape_data["nodes"] = top_nodes
    cytoscape_data["edges"] = top_edges
    cytoscape_data["clusters"] = clusters
    cytoscape_data["_side_store"] = side_store
    # Centrality per node id is useful for label sizing / diagnostics but
    # not consumed by the JS today; ship it anyway for downstream use.
    if centrality:
        cytoscape_data["_centrality"] = centrality


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

        # v0.7.3 — Build-time Leiden community detection.
        #
        # Wired here because it's the piece the plan calls the marquee
        # v0.7 feature but had never been called in shipped code — the
        # browser-side namespace fallback in ontoink.js was the only
        # thing making the "Group" checkbox mean anything. Now, when
        # `ontoink[cluster]` is installed (python-igraph + leidenalg)
        # AND the ontology crosses the threshold, we replace `data.nodes`
        # / `data.edges` with a coarser Leiden overview + a side-store
        # per community. On the browser side, `loadSideStore` picks up
        # the base64 blob and the auto-namespace fallback stands down
        # (its guard: `sideStore has keys ? skip`).
        #
        # Fully opt-in per fence via `cluster:` YAML key:
        #   cluster: true               # run with defaults
        #   cluster:
        #     algorithm: leiden         # or louvain / fastgreedy / walktrap
        #     min_size: 8               # smallest community to keep
        #     max_supernodes: 30        # keep at most N largest
        #     min_nodes: 200            # skip clustering under this size
        # When absent or `false`, clustering is skipped and the browser
        # fallback still fires for large graphs.
        cluster_cfg = config.get("cluster", None)
        if cluster_cfg is not None and cluster_cfg is not False:
            if cluster_cfg is True:
                cluster_cfg = {}
            _apply_build_time_clustering(cytoscape_data, cluster_cfg)

        # v0.7.3-fix (adversarial review finding #8): the metrics splash
        # opts out via ``metrics_splash: false`` in the fence YAML, but
        # the JS side reads ``data.metrics_splash``. Propagate it here so
        # the documented switch actually works.
        if "metrics_splash" in config and isinstance(cytoscape_data, dict):
            cytoscape_data["metrics_splash"] = bool(config["metrics_splash"])

        # Build-time SHACL validation
        if shape_path:
            try:
                validation = validate_graph(data_path, shape_path)
                cytoscape_data["validation"] = validation
            except Exception:
                cytoscape_data["validation"] = None
        else:
            cytoscape_data["validation"] = None

        # v0.7.0 — split the big-ontology side-store off to its own base64
        # attribute so the initial page payload stays lean.  The parser
        # emits `_side_store` when clustering ran; otherwise it's `{}` and
        # the JS `loadSideStore()` becomes a no-op.
        side_store = cytoscape_data.pop("_side_store", {}) if isinstance(cytoscape_data, dict) else {}
        side_b64 = base64.b64encode(json.dumps(side_store, ensure_ascii=False).encode("utf-8")).decode("ascii")

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
            f'data-ontoink-side-store="{side_b64}" '
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
            # v0.7.0 — Big-ontology controls: LOD slider + Hidden drawer +
            # "Group by namespace" toggle (renamed from "Super" in v0.7.2 —
            # the label used to say "Super" but did nothing because the
            # build-time Leiden pass was never wired in; now the checkbox
            # drives client-side namespace clustering). Sit in their own
            # toolbar group so the existing group-divider separates them
            # from the search input and the export buttons.
            f'    <div class="ov-toolbar-group">\n'
            # v0.7.4 — LOD dropdown replaces the slider. The slider was
            # slipping onto its own row on medium widths and users
            # struggled to hit L1 precisely. A <select> is precise, wraps
            # cleanly, and the descriptive text lives in each <option>.
            f'      <label class="ov-lod-label" title="Level of Detail — pick a discrete slice of the ontology">LOD</label>\n'
            f'      <select class="ov-lod-select" onchange="ontoink.setLodLevel(\'{graph_id}\',this.value)" title="Pick a level of detail">\n'
            f'        <option value="0">L0 · classes only</option>\n'
            f'        <option value="1">L1 · + hierarchy</option>\n'
            f'        <option value="2">L2 · + individuals &amp; object props</option>\n'
            f'        <option value="3">L3 · + OWL restrictions</option>\n'
            f'        <option value="4">L4 · + data props &amp; literals</option>\n'
            f'        <option value="5">L5 · everything except inferred</option>\n'
            f'        <option value="6" selected>L6 · everything</option>\n'
            f'      </select>\n'
            f'      <button class="ov-btn" onclick="ontoink.openAtticPanel(\'{graph_id}\')" title="Open the Hidden panel — everything the current LOD level has removed, with a Pin button to re-add any of it">Hidden</button>\n'
            f'      <label class="ov-super-toggle" title="Group by namespace — collapse each namespace into one hexagon super-node. Uncheck to see every node flat; click a hexagon to expand just that namespace."><input type="checkbox" checked onchange="ontoink.toggleSuperNodes(\'{graph_id}\',this.checked)"> Group</label>\n'
            # v0.7.3 — Faceted browsing (#33). Left-rail panel with
            # namespace / has-restriction / has-annotation checkboxes.
            f'      <button class="ov-btn" onclick="ontoink.openFacetsPanel(\'{graph_id}\')" title="Facets — narrow the view to one or more namespaces, or to nodes with OWL restrictions / annotations">Facets</button>\n'
            # v0.7.4 — Style preset dropdown. Ontoink default vs. Chowlk / Graffoo /
            # VOWL — swaps the cytoscape stylesheet; the "Ontoink default" option
            # restores the pre-preset snapshot via applyStylePreset.
            f'      <select class="ov-lod-select" onchange="ontoink.applyStylePreset(\'{graph_id}\',this.value)" title="Ontology visualization style preset">\n'
            f'        <option value="ontoink" selected>Style: Ontoink</option>\n'
            f'        <option value="chowlk">Style: Chowlk</option>\n'
            f'        <option value="graffoo">Style: Graffoo</option>\n'
            f'        <option value="vowl">Style: VOWL</option>\n'
            f'      </select>\n'
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
            # v0.7.0 — Attic drawer, hidden by default; ontoink.openAtticPanel
            # flips display and virtualises rows from inst.attic (Map).
            # Sits inside .ontoink-container so `isolation:isolate` keeps
            # its z-index contained under the host site's chrome.
            f'    <div class="ov-attic-panel" id="{graph_id}-attic" style="display:none;">\n'
            f'      <div class="ov-editor-header ov-panel-head">Hidden by LOD  ·  pin to reveal'
            f'<button class="ov-btn-close" onclick="ontoink.closeAtticPanel(\'{graph_id}\')" title="Close">&times;</button></div>\n'
            f'      <div class="ov-attic-body" id="{graph_id}-attic-body"></div>\n'
            f'    </div>\n'
            # v0.7.3 — Facets side panel (#33). Same layout language as
            # the Hidden-by-LOD panel; renderer at ontoink.js
            # `_renderFacetsList`.
            f'    <div class="ov-facets-panel ov-attic-panel" id="{graph_id}-facets" style="display:none;">\n'
            f'      <div class="ov-editor-header ov-panel-head">Facets  ·  narrow the view'
            f'<button class="ov-btn-close" onclick="ontoink.closeFacetsPanel(\'{graph_id}\')" title="Close">&times;</button></div>\n'
            f'      <div class="ov-attic-body" id="{graph_id}-facets-body"></div>\n'
            f'    </div>\n'
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
