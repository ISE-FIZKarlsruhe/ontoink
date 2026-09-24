"""Custom fence handler for ```ontoink code blocks."""

import base64
import json
import logging
import os
import traceback

import yaml

from .ttl_parser import parse_ttl_to_cytoscape
from .shacl_validator import validate_graph

# Logging under the "mkdocs.plugins." tree is what makes ontoink's warnings
# participate in `mkdocs build --strict` (MkDocs promotes warnings from its own
# logger tree to build failures). Anything ontoink wants a CI gate on has to go
# through this logger rather than print() or a swallowed exception.
log = logging.getLogger("mkdocs.plugins.ontoink")

_graph_counter = 0

# Per-build registry of every fence's quality summary, drained by
# OntoinkPlugin.on_post_build into site/badges/*.svg + ontoink-report.json.
# Module-level for the same reason _graph_counter is: superfences calls the
# fence handler as a bare function, so there is no plugin instance in scope.
# on_config resets it via reset_counter() — without that, `mkdocs serve`
# rebuilds would append to the previous build's rows and double-count.
_report_rows = []


def reset_counter():
    global _graph_counter
    _graph_counter = 0
    _report_rows.clear()


def get_report_rows():
    """Return the per-fence summaries collected during this build."""
    return list(_report_rows)


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


def _load_graphs(cytoscape_data, shape_path):
    """Re-materialise the data (and shapes) graph from the parsed payload.

    The payload already carries the raw Turtle, so this costs one rdflib parse
    and avoids widening ``parse_ttl_to_cytoscape``'s return contract just to
    hand the graph to the optional passes below.
    """
    from rdflib import Graph

    data_graph = Graph()
    data_graph.parse(data=cytoscape_data.get("rawTtl") or "", format="turtle")

    shape_graph = None
    shape_ttl = cytoscape_data.get("shapeTtl")
    if shape_path and shape_ttl:
        shape_graph = Graph()
        shape_graph.parse(data=shape_ttl, format="turtle")
    return data_graph, shape_graph


def _apply_shape_recommendation(cytoscape_data, shape_path, cfg):
    """Attach induced SHACL shapes to the payload.

    Follows the same optional-pass contract as _apply_build_time_clustering:
    lazy import, mutate in place, never break the build. Extra keys on the
    payload dict reach the browser for free — the fence base64-encodes the whole
    dict — so no transport work is needed for the panel to see this.
    """
    if not isinstance(cytoscape_data, dict):
        return
    if cfg is True:
        cfg = {}
    if not isinstance(cfg, dict):
        return

    try:
        from .recommend import recommend_payload
    except ImportError:
        return

    try:
        data_graph, shape_graph = _load_graphs(cytoscape_data, shape_path)
        # `params:` carries the chosen method's hyperparameters. For `auto` it
        # is keyed by sub-method (`params: {baseline: {...}, astrea: {...}}`),
        # because the two would otherwise share one namespace.
        params = cfg.get("params")
        cytoscape_data["shape_recommendations"] = recommend_payload(
            data_graph,
            method=str(cfg.get("method", "auto")),
            min_confidence=float(cfg.get("min_confidence", 0.0) or 0.0),
            shape_graph=shape_graph,
            only_uncovered=bool(cfg.get("only_uncovered", True)),
            max_shapes=int(cfg.get("max_shapes", 50) or 50),
            params=params if isinstance(params, dict) else None,
        )
    except Exception as exc:
        log.warning("ontoink: shape recommendation failed — %s: %s", type(exc).__name__, exc)


def _apply_shape_drift(cytoscape_data, shape_path, cfg, source_name):
    """Compare committed shapes against what the data implies today.

    ``shape_drift: warn`` logs findings through the mkdocs logger, so
    ``mkdocs build --strict`` fails the build; ``fail`` additionally marks the
    build report so the quality gate trips even without --strict.
    """
    if not isinstance(cytoscape_data, dict):
        return
    mode = cfg if isinstance(cfg, str) else ("warn" if cfg is True else None)
    options = cfg if isinstance(cfg, dict) else {}
    if isinstance(cfg, dict):
        mode = str(cfg.get("mode", "warn"))
    if not mode or mode == "off":
        return

    try:
        from .recommend.drift import check_drift, format_findings
    except ImportError:
        return

    try:
        data_graph, shape_graph = _load_graphs(cytoscape_data, shape_path)
        drift = check_drift(
            data_graph, shape_graph,
            method=str(options.get("method", "auto")),
            min_confidence=float(options.get("min_confidence", 0.9) or 0.9),
            stale_threshold=float(options.get("stale_threshold", 0.9) or 0.9),
        )
    except Exception as exc:
        log.warning("ontoink: shape drift check failed — %s: %s", type(exc).__name__, exc)
        return

    cytoscape_data["shape_drift"] = drift
    for message in format_findings(drift, source_name):
        log.warning("ontoink: %s", message)


def _collect_report_row(graph_id, config, cytoscape_data):
    """Record this fence's quality numbers for the build-level report.

    Best-effort by design: a malformed payload must never break the page that
    was otherwise rendered fine, so a failure here only costs one report row.
    """
    if not isinstance(cytoscape_data, dict):
        return
    try:
        from .report import summarize_fence

        _report_rows.append(summarize_fence(graph_id, config, cytoscape_data))
    except Exception as exc:  # pragma: no cover - defensive
        log.debug("ontoink: could not summarize %s for the report: %s", graph_id, exc)


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

        # Optional predicate policy (see ttl_parser.apply_predicate_policy):
        #   predicates:
        #     hide_predicates: [prov:*, dcterms:modified]
        #     fold_into_badge: [rdfs:label, skos:notation]
        #     badge_predicates: [ex:status]
        policy = None
        if isinstance(config.get("predicates"), dict):
            policy = {"predicates": config["predicates"]}

        # Parse TTL → Cytoscape JSON
        cytoscape_data = parse_ttl_to_cytoscape(data_path, shape_path, policy=policy)

        # Build-time Leiden community detection. When `ontoink[cluster]` is
        # installed (python-igraph + leidenalg) and the ontology crosses the
        # threshold, this replaces `data.nodes`/`data.edges` with a coarser
        # overview plus a side-store per community; the browser's
        # `loadSideStore` picks up the blob and its own namespace-fallback
        # clustering stands down. Opt-in per fence via `cluster:`:
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

        # `metrics_splash: false` is read by the JS side as data.metrics_splash.
        if "metrics_splash" in config and isinstance(cytoscape_data, dict):
            cytoscape_data["metrics_splash"] = bool(config["metrics_splash"])

        # ``pixel_ratio: N`` forces the canvas backing-store ratio. Otherwise
        # auto-selected (capped at 2; drops to 1 for graphs >= 500 nodes, where
        # frame rate matters more than sharpness) — see _pixelRatio in
        # ontoink.js. This is the escape hatch in either direction.
        if "pixel_ratio" in config and isinstance(cytoscape_data, dict):
            try:
                ratio = float(config["pixel_ratio"])
                if ratio > 0:
                    cytoscape_data["pixel_ratio"] = ratio
            except (TypeError, ValueError):
                pass

        # Build-time SHACL validation. Failures are logged under
        # mkdocs.plugins.* rather than swallowed, so a broken shapes file or
        # bad path surfaces in the build log and `mkdocs build --strict` fails.
        if shape_path:
            try:
                validation = validate_graph(
                    data_path, shape_path,
                    inference=config.get("validation_inference"),
                )
                cytoscape_data["validation"] = validation
            except Exception as exc:
                log.warning(
                    "ontoink: SHACL validation failed for %s against %s — %s: %s",
                    config.get("source"), config.get("shape"),
                    type(exc).__name__, exc,
                )
                cytoscape_data["validation"] = None
        else:
            cytoscape_data["validation"] = None

        # Optional shape passes, both after validation so they can see the
        # report, and both degrading to a no-op rather than failing the build.
        #   recommend_shapes: true
        #   recommend_shapes: {method: baseline, min_confidence: 0.8}
        #   shape_drift: warn | fail | off
        recommend_cfg = config.get("recommend_shapes")
        if recommend_cfg:
            _apply_shape_recommendation(cytoscape_data, shape_path, recommend_cfg)

        drift_cfg = config.get("shape_drift")
        if drift_cfg:
            _apply_shape_drift(
                cytoscape_data, shape_path, drift_cfg, str(config.get("source", ""))
            )

        _collect_report_row(graph_id, config, cytoscape_data)

        # The big-ontology side-store rides its own base64 attribute so the
        # initial page payload stays lean. The parser emits `_side_store` when
        # clustering ran; otherwise it's `{}` and `loadSideStore()` is a no-op.
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
            editor_btn = f'<button class="ov-btn ov-btn-accent" data-oi-onclick="ontoink.toggleEditor(\'{graph_id}\')" title="Edit TTL & Validate">Edit &amp; Validate</button>\n'

        reasoning_btn = ""
        if show_reasoning:
            reasoning_btn = f'<button class="ov-btn" data-oi-onclick="ontoink.toggleReasoning(\'{graph_id}\')" title="Show/hide inferred triples">Reasoning</button>\n'

        # Only surface the buttons whose panels have something to show — a dead
        # button that opens an empty drawer is worse than no button.
        shapes_btn = ""
        if cytoscape_data.get("shape_recommendations") or cytoscape_data.get("shape_drift"):
            shapes_btn = (
                f'<button class="ov-btn" data-oi-onclick="ontoink.toggleRecommendations(\'{graph_id}\')" '
                f'title="Suggested SHACL shapes for classes with no coverage">Shapes</button>\n'
            )

        cite_btn = ""
        if cytoscape_data.get("ontologyMetadata"):
            cite_btn = (
                f'<button class="ov-btn" data-oi-onclick="ontoink.toggleCitation(\'{graph_id}\')" '
                f'title="License, version and citation for this ontology">Cite</button>\n'
            )

        return (
            f'<div id="{graph_id}" class="ontoink-container" '
            f'data-ontoink-graph="{b64_data}" '
            f'data-ontoink-side-store="{side_b64}" '
            f'data-show-legend="{str(show_legend).lower()}" '
            f'data-reasoner="{default_reasoner}" '
            f'data-show-ns="{str(show_ns).lower()}">\n'
            f'  <div class="ov-toolbar">\n'
            f'    <div class="ov-toolbar-group">\n'
            f'      <button class="ov-btn" data-oi-onclick="ontoink.zoomIn(\'{graph_id}\')" title="Zoom in">+</button>\n'
            f'      <button class="ov-btn" data-oi-onclick="ontoink.zoomOut(\'{graph_id}\')" title="Zoom out">&minus;</button>\n'
            f'      <button class="ov-btn" data-oi-onclick="ontoink.fit(\'{graph_id}\')" title="Fit to view">Fit</button>\n'
            f'      <button class="ov-btn" data-oi-onclick="ontoink.fullscreen(\'{graph_id}\')" title="Fullscreen">&#x26F6;</button>\n'
            f'      <select class="ov-layout-select" data-oi-onchange="ontoink.changeLayout(\'{graph_id}\',this.value)" title="Layout algorithm">\n'
            f'        <option value="dagre">Dagre</option><option value="cose">Force</option><option value="circle">Circle</option>\n'
            f'        <option value="concentric">Concentric</option><option value="breadthfirst">Tree</option><option value="grid">Grid</option>\n'
            f'      </select>\n'
            f'    </div>\n'
            f'    <div class="ov-toolbar-group">\n'
            f'      <input class="ov-search-input" type="text" placeholder="Search..." data-oi-oninput="ontoink.search(\'{graph_id}\',this.value)" title="Fuzzy search nodes &amp; edges">\n'
            f'    </div>\n'
            # Big-ontology controls: LOD dropdown + Hidden drawer + "Group by
            # namespace" toggle, in their own group to stay separate from the
            # search input and the export buttons.
            f'    <div class="ov-toolbar-group">\n'
            f'      <label class="ov-lod-label" title="Level of Detail — pick a discrete slice of the ontology">LOD</label>\n'
            f'      <select class="ov-lod-select" data-oi-onchange="ontoink.setLodLevel(\'{graph_id}\',this.value)" title="Pick a level of detail">\n'
            f'        <option value="0">L0 · classes only</option>\n'
            f'        <option value="1">L1 · + hierarchy</option>\n'
            f'        <option value="2">L2 · + individuals &amp; object props</option>\n'
            f'        <option value="3">L3 · + OWL restrictions</option>\n'
            f'        <option value="4">L4 · + data props &amp; literals</option>\n'
            f'        <option value="5">L5 · everything except inferred</option>\n'
            f'        <option value="6" selected>L6 · everything</option>\n'
            f'      </select>\n'
            f'      <button class="ov-btn" data-oi-onclick="ontoink.openAtticPanel(\'{graph_id}\')" title="Open the Hidden panel — everything the current LOD level has removed, with a Pin button to re-add any of it">Hidden</button>\n'
            f'      <label class="ov-super-toggle" title="Group by namespace — collapse each namespace into one hexagon super-node. Uncheck to see every node flat; click a hexagon to expand just that namespace."><input type="checkbox" checked data-oi-onchange="ontoink.toggleSuperNodes(\'{graph_id}\',this.checked)"> Group</label>\n'
            f'      <button class="ov-btn" data-oi-onclick="ontoink.openFacetsPanel(\'{graph_id}\')" title="Facets — narrow the view to one or more namespaces, or to nodes with OWL restrictions / annotations">Facets</button>\n'
            # Style preset dropdown; swaps the cytoscape stylesheet. "Style:
            # Ontoink" restores the pre-preset snapshot via applyStylePreset.
            f'      <select class="ov-lod-select" data-oi-onchange="ontoink.applyStylePreset(\'{graph_id}\',this.value)" title="Ontology visualization style preset">\n'
            f'        <option value="ontoink" selected>Style: Ontoink</option>\n'
            f'        <option value="chowlk">Style: Chowlk</option>\n'
            f'        <option value="graffoo">Style: Graffoo</option>\n'
            f'        <option value="vowl">Style: VOWL</option>\n'
            f'      </select>\n'
            f'    </div>\n'
            f'    <div class="ov-toolbar-group">\n'
            f'      <button class="ov-btn" data-oi-onclick="ontoink.exportPNG(\'{graph_id}\')" title="Export PNG">PNG</button>\n'
            f'      <button class="ov-btn" data-oi-onclick="ontoink.exportSVG(\'{graph_id}\')" title="Export SVG">SVG</button>\n'
            f'      <button class="ov-btn" data-oi-onclick="ontoink.downloadTTL(\'{graph_id}\')" title="Download TTL">TTL</button>\n'
            f'    </div>\n'
            f'    <div class="ov-toolbar-group">\n'
            f'      <button class="ov-btn" data-oi-onclick="ontoink.toggleColors(\'{graph_id}\')" title="Edit layout, colors and shapes">Edit Layout</button>\n'
            f'      <button class="ov-btn" data-oi-onclick="ontoink.abstractView(\'{graph_id}\')" title="Show abstract model (classes only)">Abstract</button>\n'
            f'      <button class="ov-btn" data-oi-onclick="ontoink.toggleStats(\'{graph_id}\')" title="Graph statistics">Stats</button>\n'
            f'      <button class="ov-btn" data-oi-onclick="ontoink.togglePathFinder(\'{graph_id}\')" title="Find paths between nodes">Paths</button>\n'
            f'      <button class="ov-btn" data-oi-onclick="ontoink.toggleSparql(\'{graph_id}\')" title="SPARQL query">SPARQL</button>\n'
            f'      {shapes_btn}'
            f'      {cite_btn}'
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
            # Attic drawer, hidden by default; openAtticPanel flips display and
            # virtualises rows from inst.attic (a Map). Nested inside
            # .ontoink-container so `isolation:isolate` keeps its z-index
            # contained under the host site's chrome.
            f'    <div class="ov-attic-panel" id="{graph_id}-attic" style="display:none;">\n'
            f'      <div class="ov-editor-header ov-panel-head">Hidden by LOD  ·  pin to reveal'
            f'<button class="ov-btn-close" data-oi-onclick="ontoink.closeAtticPanel(\'{graph_id}\')" title="Close">&times;</button></div>\n'
            f'      <div class="ov-attic-body" id="{graph_id}-attic-body"></div>\n'
            f'    </div>\n'
            # Facets side panel, same layout language as the Hidden-by-LOD
            # panel; renderer at ontoink.js `_renderFacetsList`.
            f'    <div class="ov-facets-panel ov-attic-panel" id="{graph_id}-facets" style="display:none;">\n'
            f'      <div class="ov-editor-header ov-panel-head">Facets  ·  narrow the view'
            f'<button class="ov-btn-close" data-oi-onclick="ontoink.closeFacetsPanel(\'{graph_id}\')" title="Close">&times;</button></div>\n'
            f'      <div class="ov-attic-body" id="{graph_id}-facets-body"></div>\n'
            f'    </div>\n'
            f'  </div>\n'
            f'  <div class="ov-stats-panel" style="display:none;"></div>\n'
            f'  <div class="ov-pathfinder-panel" style="display:none;"></div>\n'
            f'  <div class="ov-sparql-panel" style="display:none;"></div>\n'
            # Suggested shapes + drift findings, rendered by
            # ontoink.toggleRecommendations; kept in sync with _oiEmbedSkeleton.
            f'  <div class="ov-recommend-panel" style="display:none;">\n'
            f'    <div class="ov-editor-header ov-panel-head">Suggested SHACL shapes'
            f'<button class="ov-panel-close" data-oi-onclick="this.closest(\'.ov-recommend-panel\').style.display=\'none\'">&times;</button></div>\n'
            f'    <div class="ov-recommend-content"></div>\n'
            f'  </div>\n'
            f'  <div class="ov-citation-panel" style="display:none;">\n'
            f'    <div class="ov-editor-header ov-panel-head">Cite this ontology'
            f'<button class="ov-panel-close" data-oi-onclick="this.closest(\'.ov-citation-panel\').style.display=\'none\'">&times;</button></div>\n'
            f'    <div class="ov-citation-content"></div>\n'
            f'  </div>\n'
            f'  <div class="ov-reasoning-panel" style="display:none;">\n'
            f'    <div class="ov-editor-header ov-panel-head">Inferred Triples (OWL-RL)<button class="ov-panel-close" data-oi-onclick="this.closest(\'.ov-reasoning-panel\').style.display=\'none\'">&times;</button></div>\n'
            f'    <div class="ov-reasoning-content"></div>\n'
            f'    <div class="ov-editor-actions">\n'
            f'      <label style="display:flex;align-items:center;gap:6px;font-size:13px;font-family:var(--ov-font);cursor:pointer;">'
            f'<input type="checkbox" class="ov-reasoning-graph-toggle" data-oi-onchange="ontoink.toggleInferredOnGraph(\'{graph_id}\',this.checked)"> Show on graph</label>\n'
            f'      <button class="ov-btn" data-oi-onclick="ontoink.validateWithReasoning(\'{graph_id}\')">Validate with Inferences</button>\n'
            f'    </div>\n'
            f'  </div>\n'
            f'  <div class="ov-editor-panel" style="display:none;">\n'
            f'    <div class="ov-editor-header ov-panel-head">Edit &amp; Validate<button class="ov-panel-close" data-oi-onclick="this.closest(\'.ov-editor-panel\').style.display=\'none\'">&times;</button></div>\n'
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
            f'      <button class="ov-btn ov-btn-primary" data-oi-onclick="ontoink.validate(\'{graph_id}\')">Validate</button>\n'
            f'      <button class="ov-btn" data-oi-onclick="ontoink.updateGraph(\'{graph_id}\')">Update Graph</button>\n'
            f'      <button class="ov-btn" data-oi-onclick="ontoink.resetEditor(\'{graph_id}\')">Reset</button>\n'
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
