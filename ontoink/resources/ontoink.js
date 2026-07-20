/**
 * ontoink.js v0.7.3 — Interactive ontology visualization with formal notation,
 * draggable legend/prefix overlays, inline TTL editing, SHACL validation, and color customization.
 */
var ontoink = (function () {
  "use strict";

  var instances = {};

  // ── Helpers ──────────────────────────────────────────────────────────────

  function esc(s) { return s ? s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;") : ""; }
  function copyText(t, btn) { navigator.clipboard.writeText(t).catch(function(){}); var o=btn.textContent; btn.textContent="Copied!"; setTimeout(function(){btn.textContent=o;},1200); }
  function removePopup(c) { var o=c.querySelector(".ov-popup"); if(o) o.remove(); }
  function makePopupDraggable(popup) {
    var ox, oy, sx, sy, dragging = false;
    var head = popup.querySelector(".ov-popup-head");
    if (!head) return;
    head.style.cursor = "grab";
    head.addEventListener("mousedown", function(e) {
      if (e.target.tagName === "BUTTON") return;
      dragging = true; head.style.cursor = "grabbing";
      ox = parseFloat(popup.style.left)||0; oy = parseFloat(popup.style.top)||0;
      sx = e.clientX; sy = e.clientY; e.preventDefault();
    });
    document.addEventListener("mousemove", function(e) {
      if (!dragging) return;
      popup.style.left = (ox + e.clientX - sx) + "px";
      popup.style.top = (oy + e.clientY - sy) + "px";
    });
    document.addEventListener("mouseup", function() { if (dragging) { dragging = false; head.style.cursor = "grab"; } });
  }

  // ── Drag support for overlay boxes ──────────────────────────────────────

  function makeDraggable(el) {
    var ox, oy, sx, sy, dragging = false;
    var handle = el.querySelector(".ov-overlay-head") || el;
    handle.style.cursor = "grab";
    handle.addEventListener("mousedown", function(e) {
      if (e.target.tagName === "BUTTON" || e.target.tagName === "INPUT") return;
      dragging = true; handle.style.cursor = "grabbing";
      var rect = el.getBoundingClientRect();
      var parentRect = el.parentElement.getBoundingClientRect();
      ox = rect.left - parentRect.left; oy = rect.top - parentRect.top;
      sx = e.clientX; sy = e.clientY;
      e.preventDefault();
    });
    document.addEventListener("mousemove", function(e) {
      if (!dragging) return;
      el.style.left = (ox + e.clientX - sx) + "px";
      el.style.top = (oy + e.clientY - sy) + "px";
      el.style.bottom = "auto"; el.style.right = "auto";
    });
    document.addEventListener("mouseup", function() { if (dragging) { dragging = false; handle.style.cursor = "grab"; } });

    // Resize handle
    var resizer = document.createElement("div");
    resizer.className = "ov-resize-handle";
    el.appendChild(resizer);
    var rw, rh, rsx, rsy, resizing = false;
    resizer.addEventListener("mousedown", function(e) {
      resizing = true; rw = el.offsetWidth; rh = el.offsetHeight; rsx = e.clientX; rsy = e.clientY;
      e.preventDefault(); e.stopPropagation();
    });
    document.addEventListener("mousemove", function(e) {
      if (!resizing) return;
      el.style.width = Math.max(140, rw + e.clientX - rsx) + "px";
      el.style.maxWidth = "none";
    });
    document.addEventListener("mouseup", function() { resizing = false; });
  }

  // ── Canvas 2D drawing for export overlays ───────────────────────────────

  function drawRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r);
    ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
    ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
    ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r);
    ctx.closePath();
  }

  var EDGE_DEFS_EXPORT = {
    "object-property": { l:"Object Property", c:"#2563eb", dash:false, fill:true, bold:false },
    "data-property":   { l:"Data Property",   c:"#16a34a", dash:true,  fill:false, bold:false },
    "rdf-type":        { l:"rdf:type",         c:"#9ca3af", dash:true,  fill:false, bold:false },
    "subclass":        { l:"rdfs:subClassOf",  c:"#374151", dash:false, fill:true,  bold:false },
    "shacl-constraint":{ l:"SHACL Constraint", c:"#0891b2", dash:true,  fill:true,  bold:true },
    "owl-restriction": { l:"OWL Restriction",  c:"#a855f7", dash:true,  fill:true,  bold:false },
    "inferred":        { l:"Inferred (OWL)",   c:"#a855f7", dash:true,  fill:true,  bold:false },
  };

  function drawLegendBox(ctx, data, x, y, s, domW, domH) {
    // s = pixel scale (e.g. 3 for hi-DPI), domW/domH = actual overlay size in CSS px
    var font = function(w, sz) { return w+" "+(sz*s)+"px Inter,Segoe UI,system-ui,sans-serif"; };

    var usedTypes = {}, usedEdge = {}, usedShapes = {};
    var live = data._live || {};
    data.nodes.forEach(function(n) {
      var t = n.data.type;
      usedTypes[t] = (live.typeColors && live.typeColors[t]) || n.data.color;
      usedShapes[t] = (live.typeShapes && live.typeShapes[t]) || n.data.shape || "rectangle";
    });
    data.edges.forEach(function(e) { usedEdge[e.data.edgeType] = true; });
    var nodeKeys = Object.keys(usedTypes), edgeKeys = Object.keys(usedEdge);
    var maxRows = Math.max(nodeKeys.length, edgeKeys.length);

    var boxW = domW ? domW*s : 300*s;
    // Match CSS: .ov-overlay-head font 12px, .ov-oentry font 11px, .ov-overlay-col-title 9px
    var pad = 12*s, row = 22*s, iconSz = 16*s, gap = 8*s, r = 10*s;
    var boxH = domH ? domH*s : pad*2 + row*(maxRows+2) + row*0.6;

    // Background
    drawRoundRect(ctx, x, y, boxW, boxH, r);
    ctx.fillStyle = "rgba(255,255,255,0.95)"; ctx.fill();
    ctx.strokeStyle = "#d1d5db"; ctx.lineWidth = 1.5*s; ctx.stroke();

    var ty = y + pad;
    // CSS: .ov-overlay-head font-size: 12px, font-weight: 700
    ctx.font = font("700",12); ctx.fillStyle = "#1f2937";
    ctx.fillText("Legend", x+pad, ty+12*s); ty += row+2*s;

    var col1 = x+pad, col2 = x + boxW/2 + 4*s;

    // Helper: draw a shape preview into the canvas (matches shapeIconSvg)
    function drawShape(shape, cx, cy, w, h, fill, stroke, strokeWidth, dashed) {
      ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = strokeWidth;
      if (dashed) ctx.setLineDash([3*s,2*s]); else ctx.setLineDash([]);
      var x = cx, y = cy;
      ctx.beginPath();
      switch (shape) {
        case "ellipse":
          ctx.ellipse(x+w/2, y+h/2, w/2, h/2, 0, 0, Math.PI*2); break;
        case "triangle":
          ctx.moveTo(x+w/2, y); ctx.lineTo(x+w, y+h); ctx.lineTo(x, y+h); ctx.closePath(); break;
        case "diamond":
          ctx.moveTo(x+w/2, y); ctx.lineTo(x+w, y+h/2); ctx.lineTo(x+w/2, y+h); ctx.lineTo(x, y+h/2); ctx.closePath(); break;
        case "hexagon":
          ctx.moveTo(x+w*0.25, y); ctx.lineTo(x+w*0.75, y); ctx.lineTo(x+w, y+h/2);
          ctx.lineTo(x+w*0.75, y+h); ctx.lineTo(x+w*0.25, y+h); ctx.lineTo(x, y+h/2); ctx.closePath(); break;
        case "octagon":
          ctx.moveTo(x+w*0.3, y); ctx.lineTo(x+w*0.7, y); ctx.lineTo(x+w, y+h*0.3);
          ctx.lineTo(x+w, y+h*0.7); ctx.lineTo(x+w*0.7, y+h); ctx.lineTo(x+w*0.3, y+h);
          ctx.lineTo(x, y+h*0.7); ctx.lineTo(x, y+h*0.3); ctx.closePath(); break;
        case "pentagon":
          ctx.moveTo(x+w/2, y); ctx.lineTo(x+w, y+h*0.4); ctx.lineTo(x+w*0.8, y+h);
          ctx.lineTo(x+w*0.2, y+h); ctx.lineTo(x, y+h*0.4); ctx.closePath(); break;
        case "star": {
          var cx2 = x+w/2, cy2 = y+h/2, R = w/2, r2 = w/4;
          for (var i = 0; i < 10; i++) {
            var ang = -Math.PI/2 + i * Math.PI/5;
            var rr = i % 2 ? r2 : R;
            var px = cx2 + Math.cos(ang)*rr, py = cy2 + Math.sin(ang)*rr;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath(); break;
        }
        case "round-rectangle":
          drawRoundRect(ctx, x, y, w, h, Math.min(w, h)*0.25); break;
        case "rectangle":
        default:
          ctx.rect(x, y, w, h); break;
      }
      ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
    }

    var STROKE_BY_TYPE = { Class:"#555", Individual:"#999", Literal:"#6a9", Datatype:"#6a9", "SHACL Shape":"#0891b2" };

    // Nodes column — CSS: .ov-overlay-col-title 9px, .ov-oentry 11px
    ctx.font = font("700",9); ctx.fillStyle = "#9ca3af";
    ctx.fillText("NODES", col1, ty+9*s);
    var ny = ty + row*0.8;
    nodeKeys.forEach(function(t) {
      var c = usedTypes[t], ix = col1, iy = ny+1*s;
      var shape = usedShapes[t] || (t === "Class" ? "rectangle" : t === "Individual" || t === "Literal" ? "ellipse" : "rectangle");
      var stroke = STROKE_BY_TYPE[t] || "#888";
      drawShape(shape, ix, iy, iconSz, iconSz*0.7, c, stroke, 1.5*s, t === "Literal");
      ctx.font = font("400",11); ctx.fillStyle = "#374151";
      ctx.fillText(t, ix+iconSz+gap, ny+11*s);
      ny += row*0.85;
    });

    // Edges column — use live edge styles when present
    ctx.font = font("700",9); ctx.fillStyle = "#9ca3af";
    ctx.fillText("EDGES", col2, ty+9*s);
    var ey = ty + row*0.8;
    edgeKeys.forEach(function(t) {
      var d = EDGE_DEFS_EXPORT[t] || {l:t,c:"#999",dash:false,fill:true,bold:false};
      var color = (live.edgeColors && live.edgeColors[t]) || d.c;
      var ls = (live.edgeLineStyles && live.edgeLineStyles[t]) || (d.dash ? "dashed" : "solid");
      var isDashed = ls === "dashed" || ls === "dotted";
      var lx = col2, ly = ey+7*s, len = 24*s;
      ctx.strokeStyle = color; ctx.lineWidth = (d.bold?2.5:1.5)*s;
      if (isDashed) ctx.setLineDash(ls === "dotted" ? [1*s,2*s] : [4*s,2*s]); else ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(lx,ly); ctx.lineTo(lx+len,ly); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = d.fill ? color : "#fff"; ctx.strokeStyle = color; ctx.lineWidth = 1*s;
      ctx.beginPath(); ctx.moveTo(lx+len,ly); ctx.lineTo(lx+len-5*s,ly-3.5*s); ctx.lineTo(lx+len-5*s,ly+3.5*s); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.font = font("400",11); ctx.fillStyle = "#374151";
      ctx.fillText(d.l, lx+len+gap+2*s, ey+11*s);
      ey += row*0.85;
    });

    return boxH;
  }

  function drawNsBox(ctx, data, x, y, s, domW, domH) {
    var font = function(w, sz) { return w+" "+(sz*s)+"px Inter,Segoe UI,system-ui,sans-serif"; };
    var ns = data.activeNamespaces || {};
    var keys = Object.keys(ns).sort();
    if (!keys.length) return 0;

    // Match CSS: .ov-overlay-head 12px, .ov-ns-tag 10px, .ov-ns-tag b bold
    var pad = 10*s, row = 18*s, r = 10*s;
    var boxW = domW ? domW*s : 300*s;
    var boxH = domH ? domH*s : pad*2 + row*(keys.length+1);

    drawRoundRect(ctx, x, y, boxW, boxH, r);
    ctx.fillStyle = "rgba(255,255,255,0.95)"; ctx.fill();
    ctx.strokeStyle = "#d1d5db"; ctx.lineWidth = 1.5*s; ctx.stroke();

    var ty = y + pad;
    ctx.font = font("700",12); ctx.fillStyle = "#1f2937";
    ctx.fillText("Prefixes", x+pad, ty+12*s); ty += row+2*s;

    keys.forEach(function(p) {
      ctx.font = font("600",10); ctx.fillStyle = "#3730a3";
      ctx.fillText(p+":", x+pad, ty+10*s);
      var pw = ctx.measureText(p+": ").width;
      ctx.font = font("400",10); ctx.fillStyle = "#6b7280";
      ctx.fillText(ns[p], x+pad+pw, ty+10*s);
      ty += row*0.85;
    });

    return boxH;
  }

  // ── Popup ────────────────────────────────────────────────────────────────

  function buildPopup(d, cy) {
    var bc = { Class:"#FDFDC8", Individual:"#E6E6E6", Literal:"#93D053", "SHACL Shape":"#A5F3FC" };
    var html = '<div class="ov-popup-head"><span class="ov-popup-label">' + esc(d.label) + '</span><span class="ov-badge" style="background:' + (bc[d.type]||"#eee") + '">' + esc(d.type) + '</span><button class="ov-popup-close">&times;</button></div>';
    if (d.iri) html += '<div class="ov-popup-iri"><a href="' + esc(d.iri) + '" target="_blank">' + esc(d.iri) + '</a></div>';
    if (d.source) html += '<div class="ov-popup-meta">Ontology: <strong>' + esc(d.source) + '</strong></div>';
    var node = cy.getElementById(d.id), edges = node.connectedEdges();
    if (edges.length) {
      html += '<div class="ov-popup-section ov-popup-toggle" data-section="conn"><strong>Connections</strong> <span class="ov-popup-count">' + edges.length + '</span> <span class="ov-toggle-arrow">\u25B6</span></div>';
      html += '<ul class="ov-popup-edges ov-collapsible" data-section="conn" style="display:none;">';
      edges.forEach(function(e) { var ed=e.data(), oth=ed.source===d.id?ed.target:ed.source; html+='<li>'+(ed.source===d.id?"\u2192":"\u2190")+' <em>'+esc(ed.label)+'</em> '+esc(cy.getElementById(oth).data("label")||oth)+'</li>'; });
      html += '</ul>';
    }
    var shacl = instances[node.cy().container().closest(".ontoink-container").id]?.data?.shacl || [];
    var rel = shacl.filter(function(c){return c.targetClass===d.iri;});
    if (rel.length) {
      html += '<div class="ov-popup-section ov-popup-toggle" data-section="shacl"><strong>SHACL Constraints</strong> <span class="ov-popup-count">' + rel.length + '</span> <span class="ov-toggle-arrow">\u25B6</span></div>';
      html += '<ul class="ov-popup-edges ov-collapsible" data-section="shacl" style="display:none;">';
      rel.forEach(function(c) { var cd = c.minCount!=null?"["+c.minCount+".."+(c.maxCount!=null?c.maxCount:"*")+"]":""; html+='<li>'+esc(c.pathLabel||c.path||"")+' '+cd+(c.message?'<br><small>'+esc(c.message)+'</small>':'')+'</li>'; });
      html += '</ul>';
    }
    html += '<div class="ov-popup-actions"><button class="ov-chip" data-action="copy-label">Copy Label</button>';
    if (d.iri) html += '<button class="ov-chip" data-action="copy-iri">Copy IRI</button>';
    if (d.iri) html += '<button class="ov-chip ov-deref-btn" data-iri="' + esc(d.iri) + '">More\u2026</button>';
    return html + '</div>';
  }

  function buildEdgePopup(d, cy) {
    var edgeTypeLabels = { "object-property":"Object Property", "data-property":"Data Property", "rdf-type":"rdf:type", "subclass":"rdfs:subClassOf", "shacl-constraint":"SHACL Constraint", "owl-restriction":"OWL Restriction" };
    var edgeTypeColors = { "object-property":"#dbeafe", "data-property":"#dcfce7", "rdf-type":"#f3f4f6", "subclass":"#e5e7eb", "shacl-constraint":"#cffafe", "owl-restriction":"#f3e8ff" };
    var typeLabel = edgeTypeLabels[d.edgeType] || d.edgeType || "Edge";
    var typeBg = edgeTypeColors[d.edgeType] || "#eee";
    var html = '<div class="ov-popup-head"><span class="ov-popup-label">' + esc(d.label) + '</span><span class="ov-badge" style="background:' + typeBg + '">' + esc(typeLabel) + '</span><button class="ov-popup-close">&times;</button></div>';
    if (d.iri) html += '<div class="ov-popup-iri"><a href="' + esc(d.iri) + '" target="_blank">' + esc(d.iri) + '</a></div>';
    var srcNode = cy.getElementById(d.source), tgtNode = cy.getElementById(d.target);
    var srcLabel = srcNode.data("label") || d.source, tgtLabel = tgtNode.data("label") || d.target;
    html += '<div class="ov-popup-section"><strong>Connection:</strong></div>';
    html += '<div style="font-size:12px;color:#4b5563;margin:4px 0 0 8px;">' + esc(srcLabel) + ' <span style="color:#9ca3af;">\u2192</span> ' + esc(tgtLabel) + '</div>';
    if (d.cardinality) html += '<div class="ov-popup-meta">Cardinality: <strong>' + esc(d.cardinality) + '</strong></div>';
    if (d.message) html += '<div class="ov-popup-meta">Message: ' + esc(d.message) + '</div>';
    // OWL restriction details: surface the operator + predicate + filler so the
    // reader sees the Manchester-style rendering even after the bnode is hidden.
    // v0.7.3-fix (adversarial finding #10): skip this block for FANNED
    // super-edges (clusterManaged + weight > 1) — the "Bundle: N relations"
    // block below already summarises them, and the owlOp/owlOpSymbol
    // fields are stale (they come from the first origEdge only, not the
    // aggregate). Keep it for non-fanned owl-restriction edges.
    if (d.edgeType === "owl-restriction" && !(d.clusterManaged && d.weight && d.weight > 1)) {
      var owlOp = d.owlOp || "";
      var owlSym = d.owlOpSymbol || "";
      var n = (d.owlCardinality != null) ? d.owlCardinality : "";
      var isEquiv = d.owlVia === "equivalentClass";
      // necessary (⊑) vs necessary-and-sufficient definition (≡)
      var viaSym = isEquiv ? "&equiv;" : "&sqsubseteq;";
      // The label is "[≡ ]<opSym>[n] <pred>"; strip the optional ≡ marker and
      // the operator token to leave just the on-property's short label.
      var body = d.label.replace(/^≡\s+/, "").replace(/^[^ ]+\s+/, "");
      html += '<div class="ov-popup-section"><strong>OWL restriction:</strong></div>';
      html += '<div style="font-size:12px;color:#4b5563;margin:4px 0 0 8px;font-family:monospace;">'
            + esc(srcLabel) + ' ' + viaSym + ' ' + esc(owlSym) + (n!==""?esc(String(n)):"")
            + ' ' + esc(body) + ' . ' + esc(tgtLabel === srcLabel ? "" : tgtLabel)
            + '</div>';
      html += '<div class="ov-popup-meta">Axiom: <strong>' + (isEquiv ? "definition (necessary &amp; sufficient)" : "necessary condition") + '</strong> &mdash; <code>' + (isEquiv ? "owl:equivalentClass" : "rdfs:subClassOf") + '</code></div>';
      html += '<div class="ov-popup-meta">Operator: <code>owl:' + esc(owlOp) + '</code></div>';
      if (d.owlPredicate) html += '<div class="ov-popup-meta">On property: <a href="'+esc(d.owlPredicate)+'" target="_blank">'+esc(d.owlPredicate)+'</a></div>';
      if (d.owlFiller) html += '<div class="ov-popup-meta">Filler: <a href="'+esc(d.owlFiller)+'" target="_blank">'+esc(d.owlFiller)+'</a></div>';
    }
    // v0.7.3 \u2014 Edge fanning: cluster-managed edge with weight > 1
    // aggregates N originals. Show the count + underlying predicate
    // list so the user sees WHAT connects the two clusters.
    if (d.clusterManaged && d.weight && d.weight > 1) {
      var fanArr = (d.fan && d.fan.length) ? d.fan : [];
      html += '<div class="ov-popup-section"><strong>Bundle:</strong> ' + esc(String(d.weight)) + ' relations</div>';
      if (fanArr.length) {
        var maxShow = 12;
        var shown = fanArr.slice(0, maxShow);
        html += '<div style="font-size:11px;color:#4b5563;margin:4px 0 0 8px;max-height:180px;overflow-y:auto;">';
        for (var fi = 0; fi < shown.length; fi++) {
          html += '<div style="margin:2px 0;font-family:monospace;">' + esc(shown[fi]) + '</div>';
        }
        if (fanArr.length > maxShow) {
          html += '<div style="margin:2px 0;color:#9ca3af;">\u2026and ' + (fanArr.length - maxShow) + ' more</div>';
        }
        html += '</div>';
      }
    }
    html += '<div class="ov-popup-actions"><button class="ov-chip" data-action="copy-label">Copy Label</button>';
    if (d.iri) html += '<button class="ov-chip" data-action="copy-iri">Copy IRI</button>';
    if (d.iri) html += '<button class="ov-chip ov-deref-btn" data-iri="' + esc(d.iri) + '">More\u2026</button>';
    return html + '</div>';
  }

  // ── IRI dereferencing ──────────────────────────────────────────────────
  // ── IRI Dereference helpers ───────────────────────────────────────────

  // Global cache for fetched ontology files (keyed by namespace URL)
  var _ontologyCache = {};  // namespace → { triples: [...], prefixes: {...} }
  var _ontologyFetchPromises = {};  // namespace → Promise (dedup in-flight fetches)

  var _DEREF_PROPS = {
    RL: "http://www.w3.org/2000/01/rdf-schema#label",
    RC: "http://www.w3.org/2000/01/rdf-schema#comment",
    RT: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
    SC: "http://www.w3.org/2000/01/rdf-schema#subClassOf",
    DOM: "http://www.w3.org/2000/01/rdf-schema#domain",
    RNG: "http://www.w3.org/2000/01/rdf-schema#range",
    DEPR: "http://www.w3.org/2002/07/owl#deprecated",
    SKOS_DEF: "http://www.w3.org/2004/02/skos/core#definition",
    SKOS_NOTE: "http://www.w3.org/2004/02/skos/core#editorialNote"
  };

  // Extract info for a single IRI from a parsed triples array
  function extractInfoFromTriples(triples, iri, prefixes) {
    var info = {}, P = _DEREF_PROPS;
    triples.forEach(function(t) {
      if (t.s === iri) {
        if (t.p === P.RL && !info["Label"]) info["Label"] = litVal(t.o);
        if (t.p === P.RC && !info["Comment"]) info["Comment"] = litVal(t.o).substring(0, 400);
        if (t.p === P.RT && !info["Type"]) info["Type"] = uriLabel(t.o, prefixes);
        if (t.p === P.SC) info["Subclass of"] = (info["Subclass of"] ? info["Subclass of"] + ", " : "") + uriLabel(t.o, prefixes);
        if (t.p === P.DOM && !info["Domain"]) info["Domain"] = uriLabel(t.o, prefixes);
        if (t.p === P.RNG && !info["Range"]) info["Range"] = uriLabel(t.o, prefixes);
        if (t.p === P.DEPR) info["Deprecated"] = litVal(t.o);
        if (t.p === P.SKOS_DEF && !info["Definition"]) info["Definition"] = litVal(t.o).substring(0, 400);
        if (t.p === P.SKOS_NOTE && !info["Note"]) info["Note"] = litVal(t.o).substring(0, 300);
      }
      if (t.o === iri && t.p === P.SC) {
        info["Superclass of"] = (info["Superclass of"] ? info["Superclass of"] + ", " : "") + uriLabel(t.s, prefixes);
      }
    });
    return info;
  }

  // Build a cache of all IRIs' info from parsed triples and merge into inst._derefCache
  function indexOntologyTriples(parsed, inst) {
    if (!inst) return;
    if (!inst._derefCache) inst._derefCache = {};
    var P = _DEREF_PROPS, pf = parsed.prefixes;
    var bySubject = {};
    parsed.triples.forEach(function(t) {
      if (!bySubject[t.s]) bySubject[t.s] = [];
      bySubject[t.s].push(t);
      // reverse subClassOf
      if (t.p === P.SC && t.o && t.o[0] !== '"') {
        if (!bySubject[t.o]) bySubject[t.o] = [];
        bySubject[t.o].push({ s: t.o, p: "__superclassOf__", o: t.s });
      }
    });
    for (var subj in bySubject) {
      var info = {};
      bySubject[subj].forEach(function(t) {
        if (t.p === "__superclassOf__") { info["Superclass of"] = (info["Superclass of"] ? info["Superclass of"] + ", " : "") + uriLabel(t.o, pf); return; }
        if (t.s !== subj) return;
        if (t.p === P.RL && !info["Label"]) info["Label"] = litVal(t.o);
        if (t.p === P.RC && !info["Comment"]) info["Comment"] = litVal(t.o).substring(0, 400);
        if (t.p === P.RT && !info["Type"]) info["Type"] = uriLabel(t.o, pf);
        if (t.p === P.SC) info["Subclass of"] = (info["Subclass of"] ? info["Subclass of"] + ", " : "") + uriLabel(t.o, pf);
        if (t.p === P.DOM && !info["Domain"]) info["Domain"] = uriLabel(t.o, pf);
        if (t.p === P.RNG && !info["Range"]) info["Range"] = uriLabel(t.o, pf);
        if (t.p === P.DEPR) info["Deprecated"] = litVal(t.o);
        if (t.p === P.SKOS_DEF && !info["Definition"]) info["Definition"] = litVal(t.o).substring(0, 400);
      });
      if (Object.keys(info).length) {
        // Merge (don't overwrite existing local data)
        var existing = inst._derefCache[subj] || {};
        for (var kk in info) { if (!existing[kk]) existing[kk] = info[kk]; }
        inst._derefCache[subj] = existing;
      }
    }
    // Enrich SPARQL catalog with resolved labels
    if (inst._sparqlCatalog) {
      inst._sparqlCatalog.forEach(function(item) {
        if (item.iri && inst._derefCache[item.iri] && inst._derefCache[item.iri]["Label"]) {
          if (!item.label) { item.label = inst._derefCache[item.iri]["Label"]; item.short = inst._derefCache[item.iri]["Label"]; }
        }
      });
      // Add IRIs found in ontology but not yet in catalog
      for (var cIri in inst._derefCache) {
        var cd = inst._derefCache[cIri];
        if (!cd["Label"]) continue;
        var inCat = false;
        for (var ci = 0; ci < inst._sparqlCatalog.length; ci++) { if (inst._sparqlCatalog[ci].iri === cIri) { inCat = true; break; } }
        if (!inCat) {
          var cType = (cd["Type"] || "").toLowerCase();
          inst._sparqlCatalog.push({ iri: cIri, label: cd["Label"], short: cd["Label"], type: cType.indexOf("property") >= 0 ? "prop" : "class" });
        }
      }
    }
  }

  // Get the namespace base from an IRI (for fetching the whole ontology)
  function getNamespaceBase(iri) {
    // Try hash namespace
    var hi = iri.lastIndexOf("#");
    if (hi >= 0) return iri.substring(0, hi + 1);
    // Try slash namespace (but not http:// or https://)
    var si = iri.lastIndexOf("/");
    if (si > 8) return iri.substring(0, si + 1);
    return iri;
  }

  // Known ontology URLs: maps namespace prefixes to CORS-friendly direct download URLs.
  // Many ontology servers (nfdi.fiz-karlsruhe.de, purl.obolibrary.org, etc.) return
  // 302 redirects WITHOUT CORS headers, so browser fetch() fails. These mappings let us
  // skip the redirect and fetch the ontology file directly from the final host.
  var _KNOWN_ONTOLOGY_URLS = [
    // nfdicore: prefer the version-less "latest" on GitHub Pages (no manual
    // version bumps); keep the pinned copy as a fallback if latest 404s.
    { ns: "https://nfdi.fiz-karlsruhe.de/ontology/", urls: ["https://ise-fizkarlsruhe.github.io/nfdicore/ontology.ttl", "https://ise-fizkarlsruhe.github.io/nfdicore/3.0.4/ontology.ttl"] },
    // OBO ontologies: must pin a release tag — the version-less PURL
    // (purl.obolibrary.org/obo/*.owl) 302-redirects WITHOUT CORS on the 30x
    // hop, so a browser can't follow it. Bump these tags when OBO releases.
    { ns: "http://purl.obolibrary.org/obo/BFO_", urls: ["https://raw.githubusercontent.com/BFO-ontology/BFO-2020/release-2024-01-29/src/owl/bfo-core.owl"] },
    { ns: "http://purl.obolibrary.org/obo/IAO_", urls: ["https://raw.githubusercontent.com/information-artifact-ontology/IAO/v2026-03-30/iao.owl"] },
    { ns: "http://purl.obolibrary.org/obo/RO_", urls: ["https://raw.githubusercontent.com/oborel/obo-relations/master/ro.owl"] },
    // FOAF: xmlns.com serves the spec WITHOUT CORS, so this only works via a
    // server-side deref proxy — no reliable client-side CORS mirror exists
    // (prefix.cc cert expired, DBpedia Archivo 500s, LOV paths are version-dated).
    { ns: "http://xmlns.com/foaf/0.1/", urls: ["https://xmlns.com/foaf/spec/index.rdf"] },
    { ns: "http://www.w3.org/2004/02/skos/core#", urls: ["https://www.w3.org/2009/08/skos-reference/skos.rdf"] },
    { ns: "https://schema.org/", urls: ["https://schema.org/version/latest/schemaorg-current-https.jsonld"] },
    { ns: "http://schema.org/", urls: ["https://schema.org/version/latest/schemaorg-current-http.jsonld"] },
  ];

  // Resolve a namespace to a direct, CORS-safe URL (or null if unknown)
  function resolveOntologyUrl(nsBase) {
    for (var i = 0; i < _KNOWN_ONTOLOGY_URLS.length; i++) {
      if (nsBase.indexOf(_KNOWN_ONTOLOGY_URLS[i].ns) === 0 || _KNOWN_ONTOLOGY_URLS[i].ns.indexOf(nsBase) === 0) {
        return _KNOWN_ONTOLOGY_URLS[i].urls;
      }
    }
    return null;
  }

  // Fetch a URL and detect format from content-type
  function fetchRdfUrl(url, acceptHeader) {
    return fetch(url, { headers: { "Accept": acceptHeader || "text/turtle, application/rdf+xml;q=0.9, application/ld+json;q=0.8" }, mode: "cors", redirect: "follow" })
      .then(function(r) {
        if (!r.ok) throw new Error(r.status);
        var ct = r.headers.get("content-type") || "";
        return r.text().then(function(body) {
          var fmt = "turtle";
          if (ct.indexOf("rdf+xml") >= 0 || ct.indexOf("/xml") >= 0 || (body.trimStart().charAt(0) === '<' && body.indexOf("rdf:RDF") >= 0)) fmt = "rdfxml";
          else if (ct.indexOf("json") >= 0 || body.trimStart().charAt(0) === '{' || body.trimStart().charAt(0) === '[') fmt = "jsonld";
          return { body: body, format: fmt };
        });
      });
  }

  // Robust TTL parser for complex OWL ontology files (handles nested blank nodes,
  // collections, multi-line strings). Instead of full parsing, we extract subject blocks
  // by tracking the current subject and scanning for well-known predicates.
  function parseTtlRobust(ttl) {
    var prefixes = {};
    var triples = [];
    var lines = ttl.split("\n");

    // Pass 1: extract prefixes and @base
    var baseUri = "";
    for (var i = 0; i < lines.length; i++) {
      var pMatch = lines[i].match(/^@prefix\s+([\w-]*)\s*:\s*<([^>]+)>\s*\./);
      if (pMatch) { prefixes[pMatch[1]] = pMatch[2]; continue; }
      var bMatch = lines[i].match(/^@base\s+<([^>]+)>\s*\./);
      if (bMatch) { baseUri = bMatch[1]; continue; }
      // Also handle PREFIX (SPARQL-style)
      var pMatch2 = lines[i].match(/^PREFIX\s+(\w*)\s*:\s*<([^>]+)>/i);
      if (pMatch2) { prefixes[pMatch2[1]] = pMatch2[2]; }
    }

    function resolveRef(token) {
      if (!token) return "";
      token = token.trim();
      if (token.charAt(0) === "<" && token.charAt(token.length - 1) === ">") return token.slice(1, -1);
      if (token === "a") return "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
      var ci = token.indexOf(":");
      if (ci >= 0) {
        var pfx = token.substring(0, ci);
        if (prefixes[pfx] !== undefined) return prefixes[pfx] + token.substring(ci + 1);
      }
      return token;
    }

    // Pass 2: line-by-line, track current subject and extract simple predicate-object pairs
    var currentSubject = "";
    var inMultiLineString = false;
    var bracketDepth = 0; // track [ ] nesting
    var parenDepth = 0;   // track ( ) nesting

    for (var j = 0; j < lines.length; j++) {
      var line = lines[j];

      // Skip prefix/base/comments
      if (/^@prefix\s/.test(line) || /^@base\s/.test(line) || /^PREFIX\s/i.test(line)) continue;
      if (/^\s*#/.test(line) || /^\s*$/.test(line)) continue;
      if (/^#{2,}/.test(line)) continue;  // ### section headers

      // Handle multi-line strings (""" ... """)
      if (inMultiLineString) {
        if (line.indexOf('"""') >= 0) inMultiLineString = false;
        continue;
      }
      var tripleQuoteCount = (line.match(/"""/g) || []).length;
      if (tripleQuoteCount === 1) { inMultiLineString = true; continue; }

      // Track bracket/paren depth (blank nodes and collections)
      for (var ci2 = 0; ci2 < line.length; ci2++) {
        var ch = line.charAt(ci2);
        if (ch === "[") bracketDepth++;
        else if (ch === "]") bracketDepth--;
        else if (ch === "(") parenDepth++;
        else if (ch === ")") parenDepth--;
      }

      // Detect new subject: line starts with < or prefix:name (not whitespace)
      var trimmed = line.trimStart();
      if (trimmed.charAt(0) === "<" || (/^\w+:\w/.test(trimmed) && line.charAt(0) !== " " && line.charAt(0) !== "\t")) {
        // Extract subject IRI
        var subjMatch = trimmed.match(/^(<[^>]+>)/);
        if (subjMatch) {
          currentSubject = resolveRef(subjMatch[1]);
        } else {
          var subjMatch2 = trimmed.match(/^(\w+:\w+)/);
          if (subjMatch2) currentSubject = resolveRef(subjMatch2[1]);
        }
        bracketDepth = 0; parenDepth = 0;
        // Count brackets on this line
        for (var ci3 = 0; ci3 < line.length; ci3++) {
          var ch2 = line.charAt(ci3);
          if (ch2 === "[") bracketDepth++;
          else if (ch2 === "]") bracketDepth--;
          else if (ch2 === "(") parenDepth++;
          else if (ch2 === ")") parenDepth--;
        }
      }

      if (!currentSubject) continue;
      // Only extract triples at top level (not inside blank nodes/collections)
      if (bracketDepth > 0 || parenDepth > 0) continue;

      // Extract predicate-object pairs from this line
      // Look for known predicates we care about
      var knownPreds = [
        { pattern: "rdfs:label", full: "http://www.w3.org/2000/01/rdf-schema#label" },
        { pattern: "rdfs:comment", full: "http://www.w3.org/2000/01/rdf-schema#comment" },
        { pattern: "rdf:type", full: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" },
        { pattern: "rdfs:subClassOf", full: "http://www.w3.org/2000/01/rdf-schema#subClassOf" },
        { pattern: "rdfs:domain", full: "http://www.w3.org/2000/01/rdf-schema#domain" },
        { pattern: "rdfs:range", full: "http://www.w3.org/2000/01/rdf-schema#range" },
        { pattern: "owl:deprecated", full: "http://www.w3.org/2002/07/owl#deprecated" },
        { pattern: "skos:definition", full: "http://www.w3.org/2004/02/skos/core#definition" },
        { pattern: "skos:prefLabel", full: "http://www.w3.org/2004/02/skos/core#prefLabel" },
        { pattern: "skos:altLabel", full: "http://www.w3.org/2004/02/skos/core#altLabel" },
      ];

      // Also check for "a" (rdf:type) — e.g., "rdf:type owl:Class"
      if (/\brdf:type\b/.test(trimmed) || /\ba\b/.test(trimmed)) {
        var typeMatch = trimmed.match(/(?:rdf:type|(?:^|\s)a)\s+(<[^>]+>|[\w]+:[\w]+)/);
        if (typeMatch) {
          triples.push({ s: currentSubject, p: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type", o: resolveRef(typeMatch[1]) });
        }
      }

      for (var ki = 0; ki < knownPreds.length; ki++) {
        var kp = knownPreds[ki];
        var pidx = trimmed.indexOf(kp.pattern);
        if (pidx < 0) continue;
        // Extract the object after the predicate
        var afterPred = trimmed.substring(pidx + kp.pattern.length).trim();
        if (!afterPred) continue;
        // Object is either <IRI>, "literal"@lang, "literal"^^type, or prefix:name
        var objMatch = afterPred.match(/^(<[^>]+>)/);
        if (objMatch) {
          triples.push({ s: currentSubject, p: kp.full, o: resolveRef(objMatch[1]) });
        } else {
          var litMatch = afterPred.match(/^("(?:[^"\\]|\\.)*"(?:@[\w-]+)?(?:\^\^(?:<[^>]+>|[\w]+:[\w]+))?)/);
          if (litMatch) {
            triples.push({ s: currentSubject, p: kp.full, o: litMatch[1] });
          } else {
            var prefMatch = afterPred.match(/^([\w]+:[\w]+)/);
            if (prefMatch) triples.push({ s: currentSubject, p: kp.full, o: resolveRef(prefMatch[1]) });
          }
        }
      }

      // Reset subject on statement end (line ends with .)
      if (/\.\s*$/.test(trimmed) && bracketDepth <= 0 && parenDepth <= 0) {
        currentSubject = "";
      }
    }

    return { triples: triples, prefixes: prefixes };
  }

  function parseRdfResponse(result) {
    if (result.format === "turtle") {
      // Use both parsers and merge: minimal handles simple TTL well,
      // robust handles complex OWL TTL with nested blank nodes/collections
      var p1 = parseTtlMinimal(result.body);
      var p2 = parseTtlRobust(result.body);
      if (!p1 || p1.triples.length === 0) return p2;
      if (!p2 || p2.triples.length === 0) return p1;
      // Merge: add triples from robust that aren't in minimal (deduplicated by s+p key)
      var seen = {};
      p1.triples.forEach(function(t) { seen[t.s + "|" + t.p + "|" + t.o] = true; });
      p2.triples.forEach(function(t) {
        var key = t.s + "|" + t.p + "|" + t.o;
        if (!seen[key]) { p1.triples.push(t); seen[key] = true; }
      });
      // Merge prefixes
      for (var pk in p2.prefixes) { if (!p1.prefixes[pk]) p1.prefixes[pk] = p2.prefixes[pk]; }
      return p1;
    }
    if (result.format === "rdfxml") return parseRdfXmlMinimal(result.body);
    if (result.format === "jsonld") {
      try { return parseJsonLdMinimal(JSON.parse(result.body)); } catch(e) { /* */ }
    }
    return null;
  }

  // Fetch ontology by content negotiation, caching the full result
  function fetchOntology(nsBase) {
    // Skip non-HTTP(S) URIs (e.g. urn:, oid:, tag:) — they cannot be dereferenced
    if (nsBase && nsBase.indexOf("http") !== 0) return Promise.reject("non-HTTP namespace");
    if (_ontologyCache[nsBase]) return Promise.resolve(_ontologyCache[nsBase]);
    if (_ontologyFetchPromises[nsBase]) return _ontologyFetchPromises[nsBase];

    // Step 0: Server-side deref proxy (generic — no registry, no version pins).
    // Used only when a same-origin ontoink server (api/all mode) answers /health.
    // On serverless GitHub Pages this rejects fast and we fall back to the registry.
    function tryProxy() {
      return probeServerReasoner().then(function(serverOk) {
        if (!serverOk) return Promise.reject("no server");
        return fetch("/deref?iri=" + encodeURIComponent(nsBase), { headers: { "Accept": "application/json" } })
          .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
          .then(function(j) {
            if (!j || !j.body) throw new Error("empty deref response");
            return { body: j.body, format: j.format };
          });
      });
    }

    // Step 1: Known URL registry (CORS-safe mirrors; fallback when no server)
    var knownUrls = resolveOntologyUrl(nsBase);

    function tryKnownUrls() {
      if (!knownUrls || !knownUrls.length) return Promise.reject("no known URLs");
      function tryUrl(idx) {
        if (idx >= knownUrls.length) return Promise.reject("all known URLs failed");
        return fetchRdfUrl(knownUrls[idx]).catch(function() { return tryUrl(idx + 1); });
      }
      return tryUrl(0);
    }

    // Step 2: Try direct content negotiation (for servers that DO support CORS)
    function tryContentNeg() {
      var accepts = ["text/turtle", "application/rdf+xml", "application/ld+json"];
      function tryAccept(idx) {
        if (idx >= accepts.length) return Promise.reject("exhausted");
        return fetchRdfUrl(nsBase, accepts[idx]).catch(function() { return tryAccept(idx + 1); });
      }
      return tryAccept(0);
    }

    _ontologyFetchPromises[nsBase] = tryProxy()
      .catch(function() { return tryKnownUrls(); })
      .catch(function() { return tryContentNeg(); })
      .then(function(result) {
        var parsed = parseRdfResponse(result);
        if (parsed && parsed.triples.length) {
          _ontologyCache[nsBase] = parsed;
        }
        delete _ontologyFetchPromises[nsBase];
        return parsed;
      }).catch(function(err) {
        delete _ontologyFetchPromises[nsBase];
        throw err;
      });
    return _ontologyFetchPromises[nsBase];
  }

  // Minimal RDF/XML parser → { triples: [], prefixes: {} }
  function parseRdfXmlMinimal(xmlText) {
    var triples = [], prefixes = {};
    try {
      var doc = new DOMParser().parseFromString(xmlText, "application/xml");
      var nsRDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
      var descs = doc.querySelectorAll("*");
      for (var i = 0; i < descs.length; i++) {
        var el = descs[i];
        var about = el.getAttributeNS(nsRDF, "about") || el.getAttribute("rdf:about");
        if (!about) continue;
        for (var j = 0; j < el.children.length; j++) {
          var ch = el.children[j];
          var pred = (ch.namespaceURI || "") + ch.localName;
          var obj = ch.getAttributeNS(nsRDF, "resource") || ch.getAttribute("rdf:resource");
          if (obj) { triples.push({ s: about, p: pred, o: obj }); }
          else if (ch.textContent) { triples.push({ s: about, p: pred, o: '"' + ch.textContent + '"' }); }
        }
      }
    } catch(e) { /* */ }
    return { triples: triples, prefixes: prefixes };
  }

  // Minimal JSON-LD → { triples: [], prefixes: {} }
  function parseJsonLdMinimal(data) {
    var triples = [], prefixes = {};
    var items = Array.isArray(data) ? data : (data["@graph"] || [data]);
    items.forEach(function(item) {
      var subj = item["@id"];
      if (!subj) return;
      for (var key in item) {
        if (key === "@id" || key === "@context") continue;
        var val = item[key];
        if (key === "@type") {
          var types = Array.isArray(val) ? val : [val];
          types.forEach(function(t) { triples.push({ s: subj, p: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type", o: t }); });
          continue;
        }
        var vals = Array.isArray(val) ? val : [val];
        vals.forEach(function(v) {
          if (typeof v === "object" && v !== null) {
            if (v["@id"]) triples.push({ s: subj, p: key, o: v["@id"] });
            else if (v["@value"] !== undefined) triples.push({ s: subj, p: key, o: '"' + v["@value"] + '"' });
          } else if (typeof v === "string") {
            if (v.indexOf("http") === 0) triples.push({ s: subj, p: key, o: v });
            else triples.push({ s: subj, p: key, o: '"' + v + '"' });
          }
        });
      }
    });
    return { triples: triples, prefixes: prefixes };
  }

  // Auto-fetch all unique namespaces used in the graph and cache their ontology data
  function autoDerefNamespaces(inst) {
    if (!inst || !inst.cy) return;
    var namespaces = {};
    // Collect unique namespaces from all nodes and edges
    inst.cy.nodes().forEach(function(n) {
      var iri = n.data("iri"); if (iri) namespaces[getNamespaceBase(iri)] = true;
    });
    inst.cy.edges().forEach(function(e) {
      var iri = e.data("iri"); if (iri) namespaces[getNamespaceBase(iri)] = true;
    });

    // Also collect IRIs referenced by SHACL shapes (sh:path, sh:targetClass, sh:class, sh:datatype, sh:node)
    if (inst.data && Array.isArray(inst.data.shacl)) {
      inst.data.shacl.forEach(function(c) {
        ["path", "targetClass", "class", "datatype", "node"].forEach(function(k) {
          var v = c[k]; if (v && typeof v === "string" && v.indexOf("http") === 0) namespaces[getNamespaceBase(v)] = true;
        });
      });
    }

    // Skip built-in namespaces (we don't need to fetch RDF/RDFS/OWL/XSD/SHACL)
    var skip = ["http://www.w3.org/1999/02/22-rdf-syntax-ns#", "http://www.w3.org/2000/01/rdf-schema#",
      "http://www.w3.org/2002/07/owl#", "http://www.w3.org/2001/XMLSchema#", "http://www.w3.org/ns/shacl#"];
    var toFetch = Object.keys(namespaces).filter(function(ns) {
      for (var si = 0; si < skip.length; si++) { if (ns === skip[si]) return false; }
      return true;
    });

    // Fetch each namespace ontology in parallel (fire-and-forget, enriches cache)
    toFetch.forEach(function(ns) {
      fetchOntology(ns).then(function(parsed) {
        if (parsed) indexOntologyTriples(parsed, inst);
      }).catch(function() { /* silently skip unreachable namespaces */ });
    });
  }

  function derefIri(iri, btn) {
    var popup = btn.closest(".ov-popup");
    var existing = popup.querySelector(".ov-deref-result");
    if (existing) { existing.remove(); return; }

    var containerId = popup.closest(".ontoink-container")?.id;
    var inst = containerId ? instances[containerId] : null;
    var info = {};

    // Check deref cache (populated by autoDerefNamespaces or previous lookups)
    if (inst && inst._derefCache && inst._derefCache[iri]) {
      info = Object.assign({}, inst._derefCache[iri]);
    }

    // If not in cache, check local TTL
    if (!Object.keys(info).length && inst) {
      var ttl = inst.originalTtl || "";
      if (ttl) {
        var parsed = parseTtlMinimal(ttl);
        info = extractInfoFromTriples(parsed.triples, iri, parsed.prefixes);
      }
      // Also check cytoscape data
      var cy = inst.cy;
      var node = cy.getElementById(iri);
      if (node.length) {
        if (!info["Type"]) info["Type"] = node.data("type") || "";
        if (node.data("source")) info["Ontology"] = node.data("source");
        info["Degree"] = node.degree() + " connections";
      }
    }

    // Show result (scrollable container)
    btn.textContent = "More\u2026";
    var el = document.createElement("div"); el.className = "ov-deref-result";
    el.style.cssText = "max-height:220px;overflow-y:auto;";

    if (Object.keys(info).length) {
      var h = "";
      for (var k in info) {
        if (k.charAt(0) === '_') continue;   // private keys (e.g. _olsListUrl) rendered separately below
        h += '<div class="ov-popup-meta"><strong>' + esc(k) + ':</strong> ' + esc(info[k]) + '</div>';
      }
      if (info._olsListUrl) {
        h += '<div style="margin-top:4px;"><a href="' + esc(info._olsListUrl) + '" target="_blank" style="font-size:11px;color:#2563eb;">' + esc(info._olsListText || "Ontologies using this IRI on OLS") + ' \u2197</a></div>';
      }
      h += '<div style="margin-top:4px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">'
        + '<a href="' + esc(iri) + '" target="_blank" style="font-size:11px;color:#2563eb;">Open IRI \u2197</a>'
        + '<button class="ov-btn ov-deref-fetch-btn" style="font-size:10px;padding:2px 8px;" data-oi-onclick="ontoink.derefIriRemote(\'' + esc(iri).replace(/'/g, "\\'") + '\',this)">Fetch from web</button>'
        + '</div>';
      el.innerHTML = h;
      if (inst) { if (!inst._derefCache) inst._derefCache = {}; inst._derefCache[iri] = info; }
    } else {
      // No local data at all → try fetching immediately
      el.innerHTML = '<div class="ov-popup-meta" style="color:#9ca3af;">Loading from web\u2026</div>';
      popup.querySelector(".ov-popup-actions").before(el);
      derefIriRemote(iri, btn);
      return;
    }

    popup.querySelector(".ov-popup-actions").before(el);
  }

  function derefIriRemote(iri, btn) {
    var popup = btn.closest(".ov-popup");
    var containerId = popup.closest(".ontoink-container")?.id;
    var inst = containerId ? instances[containerId] : null;

    // Toggle off if already shown
    var prevRemote = popup.querySelector(".ov-deref-remote");
    if (prevRemote) { prevRemote.remove(); return; }

    btn.textContent = "Loading\u2026"; btn.disabled = true;

    var nsBase = getNamespaceBase(iri);

    // Strategy: fetch the full ontology for this namespace (or use cached),
    // then extract info for this specific IRI plus index everything else
    function tryOntologyFetch() {
      return fetchOntology(nsBase).then(function(parsed) {
        if (parsed) {
          indexOntologyTriples(parsed, inst);
          return extractInfoFromTriples(parsed.triples, iri, parsed.prefixes);
        }
        return {};
      });
    }

    // Also try well-known APIs in parallel
    function tryApis() {
      // OBO Library → EBI OLS
      if (iri.indexOf("purl.obolibrary.org/obo/") >= 0) {
        return fetch("https://www.ebi.ac.uk/ols4/api/terms?iri=" + encodeURIComponent(iri))
          .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
          .then(function(data) { return parseOlsResponse(data, iri); });
      }
      // Wikidata
      if (iri.indexOf("wikidata.org/entity/") >= 0) {
        var qid = iri.split("/").pop();
        return fetch("https://www.wikidata.org/w/api.php?action=wbgetentities&ids=" + qid + "&format=json&origin=*&props=labels|descriptions")
          .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
          .then(function(data) {
            var info2 = {};
            if (data.entities) {
              var eid = Object.keys(data.entities)[0];
              var ent = data.entities[eid];
              if (ent.labels && ent.labels.en) info2["Label"] = ent.labels.en.value;
              if (ent.descriptions && ent.descriptions.en) info2["Description"] = ent.descriptions.en.value;
            }
            return info2;
          });
      }
      // Try EBI OLS for any IRI
      return fetch("https://www.ebi.ac.uk/ols4/api/terms?iri=" + encodeURIComponent(iri))
        .then(function(r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function(data) {
          var result = parseOlsResponse(data, iri);
          if (Object.keys(result).length) return result;
          throw new Error("no OLS data");
        });
    }

    // Run ontology fetch and API fetch in parallel, merge results
    Promise.allSettled([tryOntologyFetch(), tryApis()]).then(function(results) {
      var merged = {};
      results.forEach(function(r) {
        if (r.status === "fulfilled" && r.value) {
          for (var kk in r.value) { if (!merged[kk]) merged[kk] = r.value[kk]; }
        }
      });

      btn.textContent = "Fetch from web"; btn.disabled = false;

      // Cache merged result
      if (inst) {
        if (!inst._derefCache) inst._derefCache = {};
        var existing = inst._derefCache[iri] || {};
        for (var mk in merged) { if (!existing[mk]) existing[mk] = merged[mk]; }
        inst._derefCache[iri] = existing;
        // Enrich SPARQL catalog
        if (inst._sparqlCatalog && merged["Label"]) {
          var found = false;
          inst._sparqlCatalog.forEach(function(item) { if (item.iri === iri) { if (!item.label) { item.label = merged["Label"]; item.short = merged["Label"]; } found = true; } });
          if (!found) inst._sparqlCatalog.push({ iri: iri, label: merged["Label"], short: merged["Label"], type: (merged["Type"] || "").toLowerCase().indexOf("property") >= 0 ? "prop" : "class" });
        }
      }

      var el2 = document.createElement("div"); el2.className = "ov-deref-remote";
      el2.style.cssText = "max-height:180px;overflow-y:auto;";
      if (Object.keys(merged).length) {
        var h2 = '<div style="border-top:1px solid #e5e7eb;padding-top:4px;margin-top:4px;"><span style="font-size:10px;color:#9ca3af;">From web:</span></div>';
        for (var k2 in merged) {
          if (k2.charAt(0) === '_') continue;   // private keys (_olsListUrl, _olsListText) rendered separately below
          h2 += '<div class="ov-popup-meta"><strong>' + esc(k2) + ':</strong> ' + esc(merged[k2]) + '</div>';
        }
        if (merged._olsListUrl) {
          h2 += '<div style="margin-top:4px;"><a href="' + esc(merged._olsListUrl) + '" target="_blank" style="font-size:11px;color:#2563eb;">' + esc(merged._olsListText || "Ontologies using this IRI on OLS") + ' \u2197</a></div>';
        }
        h2 += '<div style="margin-top:4px;"><a href="' + esc(iri) + '" target="_blank" style="font-size:11px;color:#2563eb;">Open IRI in browser \u2197</a></div>';
        el2.innerHTML = h2;
      } else {
        el2.innerHTML = '<div class="ov-popup-meta" style="color:#9ca3af;">No structured data found. <a href="' + esc(iri) + '" target="_blank" style="color:#2563eb;">Open in browser \u2197</a></div>';
      }

      // If derefIri showed "Loading..." placeholder, replace it
      var placeholder = popup.querySelector(".ov-deref-result");
      if (placeholder && placeholder.querySelector(".ov-popup-meta") && placeholder.textContent.indexOf("Loading") >= 0) {
        if (Object.keys(merged).length) {
          placeholder.style.cssText = "max-height:220px;overflow-y:auto;";
          var hReplace = "";
          var all = Object.assign({}, inst && inst._derefCache ? inst._derefCache[iri] || {} : {}, merged);
          for (var kr in all) {
            if (kr.charAt(0) === '_') continue;   // private keys rendered separately below
            hReplace += '<div class="ov-popup-meta"><strong>' + esc(kr) + ':</strong> ' + esc(all[kr]) + '</div>';
          }
          if (all._olsListUrl) {
            hReplace += '<div style="margin-top:4px;"><a href="' + esc(all._olsListUrl) + '" target="_blank" style="font-size:11px;color:#2563eb;">' + esc(all._olsListText || "Ontologies using this IRI on OLS") + ' \u2197</a></div>';
          }
          hReplace += '<div style="margin-top:4px;"><a href="' + esc(iri) + '" target="_blank" style="font-size:11px;color:#2563eb;">Open IRI in browser \u2197</a></div>';
          placeholder.innerHTML = hReplace;
        } else {
          placeholder.innerHTML = '<div class="ov-popup-meta" style="color:#9ca3af;">No data found. <a href="' + esc(iri) + '" target="_blank" style="color:#2563eb;">Open in browser \u2197</a></div>';
        }
        return;
      }

      var localResult = popup.querySelector(".ov-deref-result");
      if (localResult) { localResult.after(el2); } else { popup.querySelector(".ov-popup-actions").before(el2); }
    });
  }

  function parseOlsResponse(data, iri) {
    var info2 = {};
    if (data._embedded && data._embedded.terms && data._embedded.terms[0]) {
      var terms = data._embedded.terms;
      var term  = terms[0];
      var total = (data.page && data.page.totalElements) || terms.length;
      if (term.label) info2["Label"] = term.label;
      if (term.description && term.description[0]) info2["Description"] = term.description[0].substring(0, 400);
      // OLS returns terms[0] from whichever ontology happened to come
      // first in its index — often NOT the authoritative one (e.g.
      // AGRO appears first for IAO_0000100 because it imports IAO).
      // Don't show that single name as if it were canonical. When the
      // IRI is in multiple ontologies, surface a link to the
      // cross-ontology list; otherwise the single name is safe.
      if (total > 1) {
        // Consumed by the popup renderer; rendered as a separate
        // anchor below the key/value list (not HTML-escaped via the
        // generic loop). OLS search returns "no results" for raw
        // URL-encoded IRIs (the tokenizer doesn't index them), but
        // matches reliably on the OBO short form like ``IAO:0000300``.
        // Use the short form when the IRI is an OBO PURL; fall back to
        // term.obo_id (always present in the OLS response) or the IRI.
        var q = iri || term.iri || "";
        var oboMatch = q.match(/purl\.obolibrary\.org\/obo\/([A-Za-z][A-Za-z0-9]*)_([0-9]+)/);
        if (oboMatch) {
          q = oboMatch[1] + ":" + oboMatch[2];
        } else if (term.obo_id) {
          q = term.obo_id;
        }
        info2["_olsListUrl"]  = "https://www.ebi.ac.uk/ols4/search?q=" + encodeURIComponent(q);
        info2["_olsListText"] = "Ontologies using this IRI on OLS";
      } else if (term.ontology_name) {
        info2["Ontology"] = term.ontology_name.toUpperCase();
      }
      if (term.obo_id) info2["OBO ID"] = term.obo_id;
      if (term.synonyms && term.synonyms.length) info2["Synonyms"] = term.synonyms.slice(0, 3).join(", ");
    }
    return info2;
  }

  // ── Big-Ontology Mode (LOD / Attic / Super-nodes / Folded Badges) ───────
  //
  // A single-file front-end for the "Semantic-Tile" pipeline stages:
  //
  //   1. loadSideStore(id)               — read the base64 side-store payload
  //   2. setLodLevel(id, level)          — reversibly show/hide elements
  //                                        via cy.add/cy.remove (never CSS
  //                                        display:none), snapshotting the
  //                                        cyto JSON into inst.attic Map
  //   3. expand/collapseSuperNode(...)   — swap a cluster placeholder for
  //                                        its interior sub-graph
  //   4. openAtticPanel / pinFromAttic   — surface hidden elements + let the
  //                                        user pin any one back onto the
  //                                        canvas
  //   5. renderNodeBadges                — chip overlays for folded
  //                                        annotations / data properties
  //   6. applyPredicatePolicyToElements  — used by runSparql to fold /
  //                                        drop predicates on freshly
  //                                        materialised triples
  //   7. triplesToElements               — helper for the SPARQL ?s ?p ?o
  //                                        materialisation
  //
  // ES5-compatible: var, Map, Set, Object.assign (all present elsewhere in
  // this file already).

  // Built-in predicate → LOD floor. Elements whose edgeType matches surface
  // only once the slider reaches this level.
  var _LOD_EDGE_FLOOR = {
    "subclass": 1,
    "rdf-type": 1,
    "object-property": 2,
    "owl-restriction": 3,
    "shacl-constraint": 3,
    "data-property": 4,
    "inferred": 6
  };
  // Built-in CURIE → prefix map for wildcard resolution when the graph
  // doesn't bind the prefix itself. Mirrors the Python side.
  var _BUILTIN_PREFIXES = {
    "rdf":  "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
    "owl":  "http://www.w3.org/2002/07/owl#",
    "xsd":  "http://www.w3.org/2001/XMLSchema#",
    "sh":   "http://www.w3.org/ns/shacl#",
    "skos": "http://www.w3.org/2004/02/skos/core#",
    "dct":  "http://purl.org/dc/terms/",
    "dc":   "http://purl.org/dc/elements/1.1/",
    "prov": "http://www.w3.org/ns/prov#",
    "schema": "http://schema.org/"
  };

  function _decodeUtf8Base64(b64) {
    var binStr = atob(b64);
    var bytes = new Uint8Array(binStr.length);
    for (var i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  }

  function loadSideStore(id) {
    var inst = instances[id]; if (!inst) return;
    var container = document.getElementById(id);
    if (!container) return;
    var b64 = container.getAttribute("data-ontoink-side-store");
    if (!b64) { inst.sideStore = {}; return; }
    try { inst.sideStore = JSON.parse(_decodeUtf8Base64(b64)); }
    catch (e) { inst.sideStore = {}; }
    // v0.7.3-fix (adversarial review finding #5): when build-time
    // clustering (fence.py + cluster.py) shipped the side-store, we
    // ALSO need to synthesize the two fields that only the browser-side
    // `_autoClusterByNamespace` writes: `_memberToCid` (id → cluster id)
    // for expandSuperNode / setLodLevel to identify cluster interior,
    // and `_origEdges` (pristine edge snapshot) for `_rebuildClusterBoundary`
    // to recompute cross-cluster edges on expand/collapse. Without this
    // the pre-built cluster path is a black hole: clicking a super-node
    // adds members but no boundary edges reconnect them to the rest of
    // the graph.
    _syncClusterMetaFromShipped(inst);
  }

  // Populate inst._memberToCid + inst._origEdges from inst.data.clusters
  // and inst.data.edges when they weren't produced by the browser-side
  // auto-clusterer. Safe to call multiple times — it's idempotent because
  // it overwrites the entire fields based on inst.data.
  function _syncClusterMetaFromShipped(inst) {
    if (!inst || !inst.data) return;
    var clusters = inst.data.clusters;
    if (!clusters || !clusters.length) return;
    var m = {};
    for (var c = 0; c < clusters.length; c++) {
      var cid = clusters[c].id;
      var members = clusters[c].member_ids || [];
      for (var mi = 0; mi < members.length; mi++) m[members[mi]] = cid;
    }
    inst._memberToCid = m;
    // Recover the pristine edge list. Shipped `data.edges` is the
    // top-level list AFTER clustering (contains super-edges); the
    // original member↔member edges live inside sideStore[cid].edges.
    // Fold both back into a single snapshot so _rebuildClusterBoundary
    // has enough to work with.
    var orig = [];
    (inst.data.edges || []).forEach(function(e) {
      // Skip synthetic super-edges when reconstructing origs — they
      // wouldn't help the rebuild anyway (their endpoints are already
      // super-nodes, not real members).
      if (e && e.data && !e.data.isSuperEdge && !e.data.clusterManaged) {
        orig.push({ group: "edges", data: e.data });
      }
    });
    // Interior edges live in sideStore[cid].edges; pristine cross-cluster
    // boundary edges (v0.7.3-fix round-3 finding #5) live in
    // sideStore[cid].boundary_edges when cluster.py emitted them. Fold
    // both back so _rebuildClusterBoundary has enough to recompute
    // real member↔outer links. Cross-cluster boundary edges are
    // stored on BOTH endpoints' sides — dedup by id so we don't
    // add each one twice.
    if (inst.sideStore) {
      var seenEdgeIds = {};
      Object.keys(inst.sideStore).forEach(function(cid) {
        var side = inst.sideStore[cid];
        if (!side) return;
        (side.edges || []).forEach(function(e) {
          var d = (e && e.data) || e;
          var eid = d && d.id;
          if (eid && seenEdgeIds[eid]) return;
          if (eid) seenEdgeIds[eid] = true;
          orig.push({ group: "edges", data: d });
        });
        (side.boundary_edges || []).forEach(function(e) {
          var d = (e && e.data) || e;
          var eid = d && d.id;
          if (eid && seenEdgeIds[eid]) return;
          if (eid) seenEdgeIds[eid] = true;
          orig.push({ group: "edges", data: d });
        });
      });
    }
    inst._origEdges = orig;
    // Mark clustered so browser-side _autoClusterByNamespace skips this
    // instance (it already guards on sideStore keys but this is defense
    // in depth).
    inst._nsClustered = true;
  }

  // Resolve an IRI to its CURIE using the instance's namespaces + the
  // built-in prefix table. Returns null if no known prefix matches.
  function _iriToCurie(iri, inst) {
    if (!iri) return null;
    var pf = (inst && inst.data && inst.data.namespaces) || {};
    var p;
    for (p in pf) {
      if (pf.hasOwnProperty(p) && iri.indexOf(pf[p]) === 0) return p + ":" + iri.substring(pf[p].length);
    }
    for (p in _BUILTIN_PREFIXES) {
      if (_BUILTIN_PREFIXES.hasOwnProperty(p) && iri.indexOf(_BUILTIN_PREFIXES[p]) === 0) {
        return p + ":" + iri.substring(_BUILTIN_PREFIXES[p].length);
      }
    }
    return null;
  }

  // Compute the minimum LOD level at which an element becomes visible.
  // Sources checked in order:
  //   (i)   data.lod_visibility[iri] from build time
  //   (ii)  policy.hide_at_level[curie]
  //   (iii) built-in edge-type / node-type floor
  function _lodFloorFor(el, inst) {
    var d = el.data ? el.data() : el;
    if (d && d.pinned) return 0;
    var iri = d.iri || d.id;
    var lodVis = (inst.data && inst.data.lod_visibility) || {};
    if (iri && lodVis.hasOwnProperty(iri)) return lodVis[iri] | 0;

    // Predicate-level overrides (policy.hide_at_level)
    var hideAt = (inst.policy && inst.policy.hide_at_level) || {};
    var curie = iri ? _iriToCurie(iri, inst) : null;
    if (curie && hideAt.hasOwnProperty(curie)) return hideAt[curie] | 0;
    // Wildcards ("prov:*")
    for (var k in hideAt) {
      if (!hideAt.hasOwnProperty(k)) continue;
      if (k.charAt(k.length - 1) === "*") {
        var stem = k.substring(0, k.length - 1);
        if (curie && curie.indexOf(stem) === 0) return hideAt[k] | 0;
      }
    }

    // Built-in floors
    if (el.isEdge && el.isEdge()) {
      // v0.7.4 — Cluster-managed super-edges always surface at L1+ so
      // users see WHICH clusters connect to which even at "hierarchy"
      // level. The underlying originals might be object-property
      // (floor 2) or subclass (floor 1) — treating the aggregate as
      // subclass-equivalent (floor 1) lets users navigate cluster
      // topology from L1 upward. Otherwise on ontologies where
      // cross-namespace subclass axioms are rare (e.g. mwo, where
      // most subclass edges are intra-namespace and become interior),
      // L1 shows only hexagons with zero visible connections and
      // users conclude "L1 doesn't work".
      if (d.clusterManaged) return 1;
      var et = d.edgeType;
      if (et && _LOD_EDGE_FLOOR.hasOwnProperty(et)) return _LOD_EDGE_FLOOR[et];
      return 2;
    }
    // Node
    // v0.7.3 — ClusterHull is a UI wrapper, not ontology content, but
    // it must survive LOD culling whenever its children survive. Give
    // it floor 0 (visible at every level) — the members inside decide
    // via Fix #3 (setLodLevel skip for expanded-cluster interior).
    if (d.isSuperNode || d.type === "SuperNode" || d.isClusterHull || d.type === "ClusterHull") return 0;
    if (d.type === "Class") return 0;
    if (d.inferred || d._inferred) return 6;
    // Literals only make sense once their carrying data-property edge is
    // visible (data-property floor = 4). Emitting them earlier produces
    // orphan labels floating next to their subject — the "disconnected
    // entities" bug reported on /examples/foaf-person/ pre-0.7.1.
    if (d.type === "Literal") return _LOD_EDGE_FLOOR["data-property"] || 4;
    return 2;
  }

  // For attic JSON (which isn't a live cy element), synthesize just enough
  // shape to reuse _lodFloorFor without duplicating the branching logic.
  function _lodFloorForJson(json, inst) {
    var proxy = {
      data: function() { return json.data || {}; },
      isEdge: function() { return json.group === "edges" || !!(json.data && json.data.source); }
    };
    return _lodFloorFor(proxy, inst);
  }

  // ==========================================================================
  // v0.7.3 — Layout position cache (#4 in docs/big-ontology-plan.md)
  //
  // Second open of the same ontology skips the dagre layout and reuses
  // the positions the user last dragged things to. Keyed by djb2 hash
  // of the source TTL (or the base64 fence blob when TTL text isn't
  // available). Persisted in localStorage — 5 MB is enough for a 3 k
  // node ontology (positions serialize to ~40 bytes each). Full-blown
  // IndexedDB is a v1.0 upgrade path.
  var _POS_CACHE_PREFIX = "ontoink.pos.";
  var _POS_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
  function _ttlHash(str) {
    // djb2 non-crypto hash; good enough to key cache entries and
    // uniformly distributed for common ontology text.
    if (!str) return "0";
    var h = 5381 | 0;
    for (var i = 0; i < str.length; i++) {
      h = (((h << 5) + h) ^ str.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
  }
  function _posCacheKeyFor(sourceText) {
    return _POS_CACHE_PREFIX + _ttlHash(sourceText || "");
  }
  function _positionsLoad(cacheKey) {
    if (!cacheKey) return null;
    try {
      var raw = window.localStorage && window.localStorage.getItem(cacheKey);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.positions || !parsed.ts) return null;
      if (Date.now() - parsed.ts > _POS_CACHE_MAX_AGE_MS) {
        try { window.localStorage.removeItem(cacheKey); } catch (e) {}
        return null;
      }
      return parsed.positions;
    } catch (e) { return null; }
  }
  function _positionsSave(cacheKey, cy) {
    if (!cacheKey || !cy) return;
    try {
      var positions = {};
      cy.nodes().forEach(function(n) {
        // Skip UI wrappers — the hull's position is derived from its
        // children each render and would only pollute the cache.
        var d = n.data();
        if (d && (d.isClusterHull || d.type === "ClusterHull")) return;
        var p = n.position();
        positions[n.id()] = { x: Math.round(p.x), y: Math.round(p.y) };
      });
      window.localStorage.setItem(cacheKey, JSON.stringify({
        ts: Date.now(),
        positions: positions
      }));
    } catch (e) {
      // QuotaExceededError, SecurityError (private-mode Safari), etc.
      // Silently skip — the graph still works, just no cache speed-up.
    }
  }
  // Apply cached positions to a live cy instance and fit. Returns true
  // if any positions were restored (caller uses this to skip the dagre
  // pass, though we currently run dagre first anyway for MVP simplicity).
  function _applyCachedPositions(cy, cachedPos) {
    if (!cy || !cachedPos) return false;
    var restored = 0;
    cy.nodes().forEach(function(n) {
      var pos = cachedPos[n.id()];
      if (pos) { try { n.position(pos); restored++; } catch (e) {} }
    });
    if (restored > 0) { try { cy.fit(cy.elements(), 30); } catch (e) {} }
    return restored > 0;
  }
  // v0.7.3-fix (adversarial finding #7 / #11): position cache used to
  // save exactly once (cy.one("layoutstop")); user drags after that
  // never persisted. `_wirePositionCache` binds a persistent listener
  // for both layout ends and user drag-drops, debounced to 500 ms so a
  // burst of layout events (dagre + preset) coalesces into one write.
  function _wirePositionCache(cy, cacheKeyGetter) {
    var pending = null;
    function schedule() {
      if (pending) return;
      pending = setTimeout(function() {
        pending = null;
        var key = cacheKeyGetter();
        if (key) _positionsSave(key, cy);
      }, 500);
    }
    cy.on("layoutstop", schedule);
    cy.on("dragfree", "node", schedule);
  }

  // ==========================================================================
  // v0.7.3 — Faceted browsing (#33 in docs/big-ontology-plan.md)
  //
  // Facets are a left-rail complement to the LOD slider: instead of "how
  // much detail", they answer "which slice of the ontology". Every facet
  // has a set of possible values (e.g. namespaces = {mwo, obo, nfdicore})
  // and either a Set of currently-selected values (whitelist) or `null`
  // (unfiltered — everything passes). Facet decisions plug into the same
  // attic pipeline as LOD so hidden elements are reversibly recoverable
  // when the user unchecks the facet.
  //
  // Facet values are computed once at load time from cy.nodes(); toggling
  // a checkbox mutates `inst.facetSelections` and re-runs setLodLevel.
  // Hulls and super-nodes always pass — they're UI wrappers, not data —
  // but they DO get filtered when the user unchecks their namespace.

  function _buildFacets(inst) {
    if (!inst || !inst.cy) return;
    var byNs = {};
    var restrCount = 0;
    var annCount = 0;
    inst.cy.nodes().forEach(function(n) {
      var d = n.data();
      // Skip UI wrappers when counting so facet totals reflect real content
      if (d.isClusterHull || d.type === "ClusterHull") return;
      // Super-nodes represent a whole cluster — count their memberCount
      var contribution = (d.isSuperNode && d.memberCount) ? d.memberCount : 1;
      var ns = d.namespace || _nsFromNodeData(d);
      if (ns) byNs[ns] = (byNs[ns] || 0) + contribution;
      if (!d.isSuperNode) {
        if (d.restrictions && d.restrictions.length) restrCount++;
        if (d.annotations && d.annotations.length) annCount++;
      }
    });
    inst.facets = {
      namespaces: byNs,
      hasRestrictions: restrCount,
      hasAnnotations: annCount
    };
    if (!inst.facetSelections) {
      inst.facetSelections = { namespaces: null, hasRestrictions: null, hasAnnotations: null };
    }
  }

  // Given the current facet selection state, does this element pass?
  // Returns true = keep visible, false = attic. Works on both live
  // cy elements (isNode/isEdge methods) and attic JSON (via proxy).
  function _passesFacets(inst, data, isEdge) {
    if (!inst || !inst.facetSelections) return true;
    var s = inst.facetSelections;
    // Edges pass their endpoints' decisions transitively — if either
    // endpoint is facet-hidden, its cascade in cy.remove will take the
    // edge with it. We only test edge facet state for edges with an
    // explicit `namespace` field (rare).
    if (isEdge) return true;
    // v0.7.3-fix (round-3 findings #1, #2): ClusterHull nodes previously
    // blanket-passed here, which produced two visible bugs:
    //   1. Uncheck an expanded cluster's namespace → interior members
    //      atticized, hull stays as a "N members · click to collapse"
    //      phantom with an empty interior.
    //   2. Clear-all-namespaces (empty Set) → collapsed super-nodes
    //      vanish (they carry data.namespace), but every expanded hull
    //      persists as a phantom.
    // Fix: hulls without a namespace still pass (rare), but hulls whose
    // namespace fails the whitelist fail — and cascade-cull their
    // children. Same rule as super-nodes (both carry data.namespace).
    // The empty-Set case is also covered: has() returns false for every
    // ns, so any hull with a namespace fails.
    // Namespace whitelist
    if (s.namespaces && s.namespaces.size !== undefined) {
      var ns = data.namespace;
      if (ns && !s.namespaces.has(ns)) return false;
    }
    // Non-namespace facets don't logically apply to structural wrappers.
    // We still let hulls/super-nodes pass has-restriction / has-annotation
    // since those are content-property filters that would just always
    // fail on wrappers, creating another phantom-empty-hull class of bug.
    if (data.isClusterHull || data.type === "ClusterHull") return true;
    if (data.isSuperNode || data.type === "SuperNode") return true;
    // has-restriction whitelist
    if (s.hasRestrictions === true) {
      var r = data.restrictions;
      if (!(r && r.length)) return false;
    }
    // has-annotation whitelist
    if (s.hasAnnotations === true) {
      var a = data.annotations;
      if (!(a && a.length)) return false;
    }
    return true;
  }
  function _passesFacetsJson(inst, json) {
    var d = json.data || {};
    var isEdge = (json.group === "edges") || !!(d.source && d.target);
    return _passesFacets(inst, d, isEdge);
  }

  function setLodLevel(id, level) {
    var inst = instances[id]; if (!inst) return;
    var cy = inst.cy; if (!cy) return;
    level = parseInt(level, 10); if (isNaN(level)) level = inst.lodLevel;
    inst.lodLevel = level;

    // Attic sweep: collect restore candidates. For nodes, facet + floor
    // is enough. For edges we additionally need BOTH endpoints present
    // (either already in cy or in nodeCandidates) — otherwise cy.add
    // throws "nonexistent source/target" and the entry stays stranded
    // in the attic on every subsequent setLodLevel call (adversarial
    // finding #2).
    var nodeCandidates = [];       // {key, json}
    var edgeCandidates = [];       // {key, json}
    inst.attic.forEach(function(json, key) {
      var floor = _lodFloorForJson(json, inst);
      if (floor > level) return;
      if (!_passesFacetsJson(inst, json)) return;
      var isEdge = (json.group === "edges") || !!(json.data && json.data.source && json.data.target);
      if (isEdge) edgeCandidates.push({ key: key, json: json });
      else        nodeCandidates.push({ key: key, json: json });
    });
    if (nodeCandidates.length) cy.add(nodeCandidates.map(function(c) { return c.json; }));
    for (var kn = 0; kn < nodeCandidates.length; kn++) inst.attic.delete(nodeCandidates[kn].key);
    // For each edge candidate, only restore if both endpoints exist in
    // cy right now. Leave the rest in the attic — a later setLodLevel
    // triggered by facet re-check / LOD change will retry.
    for (var ke = 0; ke < edgeCandidates.length; ke++) {
      var c = edgeCandidates[ke];
      var d = c.json.data || {};
      if (cy.getElementById(d.source).length === 0) continue;
      if (cy.getElementById(d.target).length === 0) continue;
      try { cy.add(c.json); inst.attic.delete(c.key); } catch (e) {}
    }

    // Now snapshot currently-visible elements whose floor exceeds level.
    // Collect first, remove after — never mutate during iteration.
    //
    // v0.7.3-fix (adversarial review 2026-07-10 findings 1/3/4/7):
    //   1. Facet check runs BEFORE the expanded-cluster shortcut so an
    //      unchecked namespace also hides expanded cluster interior.
    //   2. Edges are considered facet-failed when either endpoint is
    //      facet-failed — otherwise cy.remove's cascade removes them
    //      without the attic ever seeing them, and re-checking the
    //      namespace can't recover.
    //   3. We also pre-atticize the incident edges of every to-remove
    //      node so cy.remove's cascade doesn't drop unwritten JSON.
    //
    // First pass: identify all nodes that fail facets so the edge test
    // in the main pass can consult a Set instead of re-computing.
    var facetFailNodeIds = new Set();
    var hasFacetSelections = inst.facetSelections && (
      inst.facetSelections.namespaces ||
      inst.facetSelections.hasRestrictions === true ||
      inst.facetSelections.hasAnnotations === true
    );
    if (hasFacetSelections) {
      cy.nodes().forEach(function(n) {
        var nd = n.data();
        if (nd && nd.pinned) return;
        if (!_passesFacets(inst, nd, false)) facetFailNodeIds.add(n.id());
      });
    }
    var toRemove = [];
    cy.elements().forEach(function(el) {
      var d = el.data();
      if (d && d.pinned) return;
      // Super-node visibility toggle
      if ((d.isSuperNode || d.type === "SuperNode") && inst.showSuperNodes === false) {
        toRemove.push(el); return;
      }
      // v0.7.3-fix — Facet filter FIRST, before any early-return that
      // could smuggle a facet-hidden element past the cull. For edges,
      // "facet-hidden" means "either endpoint's namespace/annotation
      // filter fails" — otherwise the edge would cascade-remove without
      // being atticized (finding #1).
      var isEdge = el.isEdge && el.isEdge();
      if (hasFacetSelections) {
        if (isEdge) {
          if (facetFailNodeIds.has(d.source) || facetFailNodeIds.has(d.target)) {
            toRemove.push(el); return;
          }
        } else if (facetFailNodeIds.has(el.id())) {
          toRemove.push(el); return;
        }
      }
      // v0.7.2 — cluster interior is managed by sideStore, NOT the LOD attic.
      // Rule: an element whose owning cluster is currently EXPANDED stays
      // visible regardless of LOD level (facet check above already
      // handled facet exclusion).
      if (inst._memberToCid) {
        if (!isEdge) {
          var ncid = inst._memberToCid[el.id()];
          if (ncid && inst.expandedSuperNodes && inst.expandedSuperNodes.has(ncid)) return;
        } else {
          var e_s_cid = inst._memberToCid[d.source];
          var e_t_cid = inst._memberToCid[d.target];
          if (e_s_cid && e_s_cid === e_t_cid &&
              inst.expandedSuperNodes && inst.expandedSuperNodes.has(e_s_cid)) return;
        }
      }
      var floor = _lodFloorFor(el, inst);
      if (floor > level) toRemove.push(el);
    });
    // v0.7.3-fix — Atticize cascade victims BEFORE cy.remove takes them.
    // For every node in toRemove, snapshot its connected edges into the
    // attic if not already there. This preserves the edge for restore
    // when the user re-checks the facet / raises the LOD (findings 1/3).
    var toRemoveSet = new Set();
    for (var r0 = 0; r0 < toRemove.length; r0++) toRemoveSet.add(toRemove[r0].id());
    for (var r1 = 0; r1 < toRemove.length; r1++) {
      var el1 = toRemove[r1];
      if (!(el1.isNode && el1.isNode())) continue;
      var incident = el1.connectedEdges();
      incident.forEach(function(e) {
        var eid = e.id();
        if (toRemoveSet.has(eid)) return;  // already scheduled
        if (!inst.attic.has(eid)) inst.attic.set(eid, e.json());
      });
    }
    for (var r = 0; r < toRemove.length; r++) {
      var el2 = toRemove[r];
      var key2 = el2.id();
      // Do not double-attic
      if (!inst.attic.has(key2)) inst.attic.set(key2, el2.json());
      cy.remove(el2);
    }

    // Update slider value display — descriptive per-level label so
    // users understand the discrete stops without hunting through the
    // docs. Descriptions match the LOD spec: L0..L6.
    var _LOD_DESCRIPTIONS = {
      0: "L0 · classes only",
      1: "L1 · + hierarchy",
      2: "L2 · + individuals & object properties",
      3: "L3 · + OWL restrictions",
      4: "L4 · + data properties & literals",
      5: "L5 · everything except inferred",
      6: "L6 · everything"
    };
    var container = document.getElementById(id);
    if (container) {
      // v0.7.4 — LOD is now a dropdown (.ov-lod-select). The legacy
      // slider (.ov-lod-slider) and the descriptor span (.ov-lod-value)
      // may still be present in older fences — sync all three where
      // they exist so nothing goes stale.
      var span = container.querySelector(".ov-lod-value");
      if (span) span.textContent = _LOD_DESCRIPTIONS[level] || ("L" + level);
      var slider = container.querySelector(".ov-lod-slider");
      if (slider && String(slider.value) !== String(level)) slider.value = level;
      var select = container.querySelector(".ov-lod-select");
      if (select && String(select.value) !== String(level)) select.value = level;
    }

    // Re-render node badges surfaced at L4+
    if (level >= 4) renderNodeBadges(id);

    // Best-effort layout refresh (preserve positions).
    try { cy.layout({ name: "preset", animate: false, fit: false }).run(); } catch (e) {}
  }

  // Hull compound-parent id derived from a cluster id. Keeps the two
  // namespaces separate so a stray real IRI can never collide.
  function _hullIdFor(supernode_id) { return supernode_id + "__hull"; }

  function expandSuperNode(id, supernode_id) {
    var inst = instances[id]; if (!inst || !inst.cy) return;
    if (!inst.expandedSuperNodes) inst.expandedSuperNodes = new Set();
    if (inst.expandedSuperNodes.has(supernode_id)) return;
    var side = inst.sideStore ? inst.sideStore[supernode_id] : null;
    if (!side) return;
    var cy = inst.cy;

    // Snapshot the collapsed super-node's on-screen position so we can
    // seed the freshly-added members around it — otherwise Cytoscape
    // dumps them at (0,0) and the compound parent auto-sizes to a tiny
    // square at origin.
    var anchorPos = { x: 0, y: 0 };
    var sn = cy.getElementById(supernode_id);
    if (sn && sn.length) {
      try { anchorPos = sn.position(); } catch (e) {}
      cy.remove(sn);
    }

    // Build the "hull" — a compound-parent node that visually contains
    // the cluster's members. When expanded, the cluster is a dashed
    // rounded rectangle around its interior with a header label
    // "<title> · N · click header to collapse". Dragging the hull moves
    // every member with it (Cytoscape's built-in compound behavior).
    // Tapping the hull border/header calls collapseSuperNode via the tap
    // handler wired in fence + playground init.
    var clusters = (inst.data && inst.data.clusters) || [];
    var meta = null;
    for (var c = 0; c < clusters.length; c++) { if (clusters[c].id === supernode_id) { meta = clusters[c]; break; } }
    var memberCount = (meta && (meta.size || (meta.member_ids ? meta.member_ids.length : 0))) || (side.nodes ? side.nodes.length : 0);
    var title = (meta && meta.title) || supernode_id;
    var hullId = _hullIdFor(supernode_id);
    var subtitle = (meta && meta.type_breakdown)
      ? _clusterSubtitle(meta.type_breakdown, memberCount)
      : "";
    cy.add({ group: "nodes", data: {
      id: hullId,
      label: title + "  ·  " + memberCount +
             (subtitle ? ("  (" + subtitle + ")") : "") +
             "  ·  click header to collapse",
      type: "ClusterHull",
      isClusterHull: true,
      clusterId: supernode_id,
      memberCount: memberCount,
      // Carry the cluster's namespace so facet filters (v0.7.3 #33) can
      // treat the hull as belonging to the same namespace as its members.
      namespace: (meta && meta.ns) || null
    }});

    // Position + reparent members. Grid layout centered on the anchor
    // gives a predictable initial view for any cluster size. We CLONE
    // the sideStore JSON before mutating (side.nodes is the pristine
    // snapshot; mutating it in place would corrupt future expands).
    var cols = Math.max(2, Math.ceil(Math.sqrt(memberCount)));
    var cellW = 100, cellH = 70;
    var origin = { x: anchorPos.x - (cols * cellW) / 2, y: anchorPos.y - (Math.ceil(memberCount / cols) * cellH) / 2 };
    var nodesToAdd = (side.nodes || []).map(function(n, i) {
      var d = {};
      for (var k in n.data) if (Object.prototype.hasOwnProperty.call(n.data, k)) d[k] = n.data[k];
      // Preserve an interior node's OWN parent (sub-clustering) — a side-store
      // may nest compound boxes inside a cluster (e.g. category boxes holding
      // instances). Only nodes without their own parent attach to the hull.
      if (!d.parent) d.parent = hullId;
      var row = Math.floor(i / cols), col = i % cols;
      return {
        group: "nodes",
        data: d,
        position: { x: origin.x + col * cellW, y: origin.y + row * cellH }
      };
    });
    if (nodesToAdd.length) cy.add(nodesToAdd);
    if (side.edges && side.edges.length) cy.add(side.edges);

    // Merge side-store badges into instance policy so the badge renderer
    // picks them up on the newly added nodes.
    if (side.node_badges) {
      if (!inst.policy.node_badges) inst.policy.node_badges = {};
      Object.assign(inst.policy.node_badges, side.node_badges);
    }

    inst.expandedSuperNodes.add(supernode_id);
    // Rebuild boundary edges: cy.remove(super) killed every edge that
    // touched the super-node placeholder — those crossings need to
    // re-emerge pointing at real members now, or at other supers where
    // the far side is still collapsed. See _rebuildClusterBoundary.
    _rebuildClusterBoundary(inst, supernode_id);
    // Re-apply LOD so freshly added elements settle at the slider position.
    // Suppressed when inside a batch expand/collapse (toggleSuperNodes) —
    // running setLodLevel mid-loop would evict sibling super-nodes into
    // the attic, corrupting the pre-collapse state for later iterations
    // (adversarial review 2026-07-10).
    if (!inst._batchOp) setLodLevel(id, inst.lodLevel);
  }

  function collapseSuperNode(id, supernode_id) {
    var inst = instances[id]; if (!inst || !inst.cy) return;
    if (!inst.expandedSuperNodes || !inst.expandedSuperNodes.has(supernode_id)) return;
    var side = inst.sideStore ? inst.sideStore[supernode_id] : null;
    if (!side) return;
    var cy = inst.cy;

    // Snapshot the hull's current position so the reconstituted
    // hexagon lands roughly where the user last dragged the cluster
    // — otherwise it jumps back to (0,0) and the reading flow breaks.
    var hullAnchor = null;
    var hullId = _hullIdFor(supernode_id);
    var hullEl = cy.getElementById(hullId);
    if (hullEl && hullEl.length) {
      try { hullAnchor = hullEl.position(); } catch (e) {}
    }

    // Remove interior nodes (their edges follow automatically). We
    // iterate side.nodes rather than descendants of the hull because
    // a stray member with a stale parent field might have been dragged
    // outside the hull — we still want to remove it.
    var memberIds = (side.nodes || []).map(function(n) { return n.data && n.data.id; }).filter(Boolean);
    var interiorEdgeIds = (side.edges || []).map(function(ee) { return ee.data && ee.data.id; }).filter(Boolean);
    for (var i = 0; i < memberIds.length; i++) {
      var e = cy.getElementById(memberIds[i]);
      if (e && e.length) cy.remove(e);
    }
    // Now the hull is childless — remove it too. cy.remove on a parent
    // whose children still exist orphans them (their `parent` field is
    // unset). We removed the members above so this call is safe.
    if (hullEl && hullEl.length) cy.remove(hullEl);

    // Purge stale attic copies of these members/edges. Fix #3 keeps
    // cluster interior OUT of the LOD attic when the cluster is
    // expanded, but historical attic entries from an earlier session
    // state could still be there — belt-and-braces guarantees a later
    // re-expand won't collide with a stale `cy.add(side.nodes)` on the
    // same ids (adversarial review 2026-07-10).
    if (inst.attic && inst.attic.delete) {
      for (var mi = 0; mi < memberIds.length; mi++) inst.attic.delete(memberIds[mi]);
      for (var ei = 0; ei < interiorEdgeIds.length; ei++) inst.attic.delete(interiorEdgeIds[ei]);
      inst.attic.delete(hullId);
    }

    // Reconstitute the super-node placeholder from data.clusters
    var clusters = (inst.data && inst.data.clusters) || [];
    var meta = null;
    for (var c = 0; c < clusters.length; c++) { if (clusters[c].id === supernode_id) { meta = clusters[c]; break; } }
    if (meta) {
      var placeholder = {
        group: "nodes",
        data: {
          id: supernode_id,
          label: meta.title || supernode_id,
          type: "SuperNode",
          isSuperNode: true,
          memberCount: meta.size || (meta.member_ids ? meta.member_ids.length : 0),
          centrality: meta.centrality || 0,
          namespace: meta.ns || null,
          clusterId: supernode_id
        }
      };
      if (hullAnchor) placeholder.position = { x: hullAnchor.x, y: hullAnchor.y };
      cy.add(placeholder);
    }
    inst.expandedSuperNodes.delete(supernode_id);
    // Rebuild boundary edges: cy.remove(members) cascaded through their
    // outgoing edges; the freshly-added super-node has none. Recompute
    // super-edges from the pristine _origEdges snapshot.
    _rebuildClusterBoundary(inst, supernode_id);
    // Suppress the tail LOD run inside a batch collapse — see the twin
    // note in expandSuperNode above.
    if (!inst._batchOp) setLodLevel(id, inst.lodLevel);
  }

  // Windowed Attic renderer. First 200 rows on open; scroll near the bottom
  // appends the next 200 — keeps DOM cost bounded on very large graphs.
  function _renderAtticList(id) {
    var inst = instances[id]; if (!inst) return;
    var body = document.getElementById(id + "-attic-body");
    if (!body) return;
    var items = [];
    inst.attic.forEach(function(json, key) { items.push({ key: key, json: json }); });
    // Sort: nodes before edges, then by label
    items.sort(function(a, b) {
      var an = !((a.json.group === "edges") || (a.json.data && a.json.data.source));
      var bn = !((b.json.group === "edges") || (b.json.data && b.json.data.source));
      if (an !== bn) return an ? -1 : 1;
      var al = (a.json.data && (a.json.data.label || a.json.data.id)) || "";
      var bl = (b.json.data && (b.json.data.label || b.json.data.id)) || "";
      return al < bl ? -1 : al > bl ? 1 : 0;
    });
    inst._atticItems = items;
    inst._atticRendered = 0;
    body.innerHTML = "";
    _appendAtticRows(id, 200);
    // Wire lazy scroll
    body.onscroll = function() {
      if (body.scrollTop + body.clientHeight >= body.scrollHeight - 40) {
        _appendAtticRows(id, 200);
      }
    };
  }

  function _appendAtticRows(id, count) {
    var inst = instances[id]; if (!inst) return;
    var body = document.getElementById(id + "-attic-body");
    if (!body || !inst._atticItems) return;
    var start = inst._atticRendered || 0;
    var end = Math.min(start + count, inst._atticItems.length);
    if (end <= start) return;
    var html = "";
    for (var i = start; i < end; i++) {
      var it = inst._atticItems[i];
      var d = it.json.data || {};
      var isEdge = it.json.group === "edges" || !!(d.source && d.target);
      var label = d.label || d.id || "";
      var typeLabel = isEdge ? (d.edgeType || "edge") : (d.type || "node");
      var safeKey = String(it.key).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      html += '<div class="ov-attic-row">' +
              '<span class="ov-attic-row-label" title="' + esc(d.id || "") + '">' + esc(label) + '</span>' +
              '<span class="ov-attic-row-type">' + esc(typeLabel) + '</span>' +
              '<button class="ov-chip ov-attic-row-pin" data-oi-onclick="ontoink.pinFromAttic(\'' + id + '\',\'' + safeKey + '\')">Pin</button>' +
              '</div>';
    }
    body.insertAdjacentHTML("beforeend", html);
    inst._atticRendered = end;
  }

  function openAtticPanel(id) {
    var panel = document.getElementById(id + "-attic");
    if (!panel) return;
    panel.style.display = "block";
    _renderAtticList(id);
  }

  function closeAtticPanel(id) {
    var panel = document.getElementById(id + "-attic");
    if (panel) panel.style.display = "none";
  }

  function pinFromAttic(id, node_iri) {
    var inst = instances[id]; if (!inst) return;
    var json = inst.attic.get(node_iri);
    if (!json) return;
    inst.attic.delete(node_iri);
    if (!json.data) json.data = {};
    json.data.pinned = true;
    try { inst.cy.add(json); } catch (e) {}
    _renderAtticList(id);
  }

  // ── Facets panel (v0.7.3 #33) ──────────────────────────────────────
  // Windowed renderer for the facets panel; wired via the ``Facets``
  // toolbar button. The panel offers three sections: namespaces (a
  // scrollable list of prefixes with counts), has-restriction (single
  // toggle), and has-annotation (single toggle). Selecting/deselecting
  // any control writes to inst.facetSelections and re-runs setLodLevel
  // so LOD + facets stay coherent.
  function _renderFacetsList(id) {
    var inst = instances[id]; if (!inst) return;
    if (!inst.facets) _buildFacets(inst);
    var body = document.getElementById(id + "-facets-body");
    if (!body) return;
    var prefixes = (inst.data && (inst.data.prefixes || inst.data.namespaces || inst.data.activeNamespaces)) || {};

    // Namespace section — sort by count desc
    var entries = [];
    var byNs = (inst.facets && inst.facets.namespaces) || {};
    Object.keys(byNs).forEach(function(ns) { entries.push({ ns: ns, n: byNs[ns] }); });
    entries.sort(function(a, b) { return b.n - a.n; });
    var selNs = inst.facetSelections && inst.facetSelections.namespaces;

    var html = '<div class="ov-facet-section-head">Namespaces <span class="ov-facet-note">' + entries.length + '</span>';
    html += ' <button class="ov-chip" data-oi-onclick="ontoink.selectAllFacets(\'' + id + '\',\'namespaces\')">All</button>';
    html += ' <button class="ov-chip" data-oi-onclick="ontoink.clearFacet(\'' + id + '\',\'namespaces\')">Clear</button></div>';
    html += '<div class="ov-facet-list">';
    entries.forEach(function(e) {
      var label = _shortNsLabel(e.ns, prefixes);
      var checked = (!selNs || selNs.has(e.ns)) ? "checked" : "";
      var safeNs = e.ns.replace(/'/g, "\\'").replace(/"/g, '&quot;');
      html += '<label class="ov-facet-row" title="' + esc(e.ns) + '">' +
              '<input type="checkbox" ' + checked + ' data-oi-onchange="ontoink.toggleFacet(\'' + id + '\',\'namespaces\',\'' + safeNs + '\',this.checked)"> ' +
              '<span class="ov-facet-label">' + esc(label) + '</span>' +
              '<span class="ov-facet-count">' + e.n + '</span>' +
              '</label>';
    });
    html += '</div>';

    var restrOn = inst.facetSelections && inst.facetSelections.hasRestrictions === true;
    var annOn = inst.facetSelections && inst.facetSelections.hasAnnotations === true;
    html += '<div class="ov-facet-section-head">Only</div>';
    html += '<div class="ov-facet-list">';
    html += '<label class="ov-facet-row"><input type="checkbox" ' + (restrOn ? "checked" : "") +
            ' data-oi-onchange="ontoink.toggleFacet(\'' + id + '\',\'hasRestrictions\',null,this.checked)"> ' +
            '<span class="ov-facet-label">Has OWL restriction</span>' +
            '<span class="ov-facet-count">' + ((inst.facets && inst.facets.hasRestrictions) || 0) + '</span></label>';
    html += '<label class="ov-facet-row"><input type="checkbox" ' + (annOn ? "checked" : "") +
            ' data-oi-onchange="ontoink.toggleFacet(\'' + id + '\',\'hasAnnotations\',null,this.checked)"> ' +
            '<span class="ov-facet-label">Has annotation</span>' +
            '<span class="ov-facet-count">' + ((inst.facets && inst.facets.hasAnnotations) || 0) + '</span></label>';
    html += '</div>';

    body.innerHTML = html;
  }

  function openFacetsPanel(id) {
    var panel = document.getElementById(id + "-facets");
    if (!panel) return;
    panel.style.display = "block";
    _renderFacetsList(id);
  }
  function closeFacetsPanel(id) {
    var panel = document.getElementById(id + "-facets");
    if (panel) panel.style.display = "none";
  }

  // Toggle a single facet value.
  //  - `facet` = "namespaces" | "hasRestrictions" | "hasAnnotations"
  //  - `value` = namespace string (for "namespaces") or null (for booleans)
  //  - `checked` = the new checkbox state
  function toggleFacet(id, facet, value, checked) {
    var inst = instances[id]; if (!inst) return;
    if (!inst.facets) _buildFacets(inst);
    if (!inst.facetSelections) inst.facetSelections = { namespaces: null, hasRestrictions: null, hasAnnotations: null };
    var sel = inst.facetSelections;
    if (facet === "namespaces") {
      // First interaction: promote null → "all currently in facets" so we
      // have a set to remove from. Then flip the requested value.
      if (!sel.namespaces) {
        sel.namespaces = new Set(Object.keys(inst.facets.namespaces || {}));
      }
      if (checked) sel.namespaces.add(value);
      else         sel.namespaces.delete(value);
      // If the set now equals "everything", collapse back to null so we
      // skip the filter loop on every element (perf on big graphs).
      if (sel.namespaces.size === Object.keys(inst.facets.namespaces || {}).length) {
        sel.namespaces = null;
      }
    } else if (facet === "hasRestrictions" || facet === "hasAnnotations") {
      sel[facet] = checked ? true : null;
    }
    setLodLevel(id, inst.lodLevel);
    _renderFacetsList(id);
  }
  function selectAllFacets(id, facet) {
    var inst = instances[id]; if (!inst) return;
    if (!inst.facetSelections) return;
    if (facet === "namespaces") inst.facetSelections.namespaces = null;
    setLodLevel(id, inst.lodLevel);
    _renderFacetsList(id);
  }
  function clearFacet(id, facet) {
    var inst = instances[id]; if (!inst) return;
    if (!inst.facetSelections) return;
    if (facet === "namespaces") inst.facetSelections.namespaces = new Set();
    else inst.facetSelections[facet] = null;
    setLodLevel(id, inst.lodLevel);
    _renderFacetsList(id);
  }

  // ==========================================================================
  // v0.7.3 — Metrics dashboard splash (#38 in docs/big-ontology-plan.md)
  //
  // For big ontologies (>= 500 subjects), the honest entry point is a
  // dashboard, not a graph. The splash renders subject/edge counts,
  // type distribution, namespace shape, orphan count, and SHACL/OWL
  // constraint totals — with a LOD level picker so the user commits to
  // a starting slice before the graph unfurls. Replaces the earlier
  // `prompt()` UX (which was ugly and gave no context).

  // Test whether a node id / IRI looks like a blank node. rdflib emits
  // them as N-Triples-style "_:bN..." strings which flow through
  // ttl_parser unchanged. Blank-node detection is used for typing
  // (they aren't Individuals no matter what type field says) and for
  // metric-splash reporting (they clutter the count).
  function _isBlankNode(id) {
    if (!id || typeof id !== "string") return false;
    return id.indexOf("_:") === 0;
  }
  // Stamp isBlankNode=true on every cy node whose id starts with "_:".
  // The v0.7.4 style block matches this flag to render blank nodes as
  // dashed grey ghosts (round-diamond shape) so users see immediately
  // that they're OWL/SHACL scaffolding, not domain entities.
  function _flagBlankNodes(cy) {
    if (!cy) return;
    cy.nodes().forEach(function(n) {
      if (_isBlankNode(n.id())) {
        n.data("isBlankNode", true);
      }
    });
  }

  function _computeMetrics(inst) {
    if (!inst || !inst.data) return null;
    var nodes = inst.data.nodes || [];
    var edges = inst.data.edges || [];
    var byType = {}, byNs = {}, byEdgeType = {};
    var restrNodeCount = 0, annNodeCount = 0;
    var blankNodeCount = 0;
    var degree = {};
    var realNodeCount = 0;

    var clusterById = {};
    (inst.data.clusters || []).forEach(function(c) {
      if (c && c.id) clusterById[c.id] = c;
    });

    // v0.7.4 — Scan sideStore members too. When the graph is clustered
    // (browser or build-time), the vast majority of nodes with
    // annotations / restrictions live INSIDE sideStore[cid].nodes,
    // never in inst.data.nodes. Iterating only the top-level list was
    // reporting "0 OWL restrictions / 0 Annotated" on mwo, while the
    // Edge types bar reported 107 owl-restriction edges — same
    // ontology, contradictory numbers.
    function tally(d) {
      if (!d) return;
      if (d.isClusterHull || d.type === "ClusterHull") return;
      if (d.isSuperNode || d.type === "SuperNode") return;
      if (_isBlankNode(d.id)) blankNodeCount++;
      if (d.restrictions && d.restrictions.length) restrNodeCount++;
      if (d.annotations && d.annotations.length) annNodeCount++;
    }
    nodes.forEach(function(n) {
      var d = (n && n.data) || n || {};
      if (d.isClusterHull || d.type === "ClusterHull") return;
      if (d.isSuperNode || d.type === "SuperNode") {
        var meta = clusterById[d.id] || {};
        var count = meta.size || d.memberCount || 1;
        var ns = d.namespace || meta.ns || _nsFromNodeData(d);
        if (ns) byNs[ns] = (byNs[ns] || 0) + count;
        // Attribute cluster to Class bucket by default; enhanced when
        // per-cluster type breakdown is available (see meta.type_breakdown).
        var br = meta.type_breakdown;
        if (br) {
          Object.keys(br).forEach(function(t) { byType[t] = (byType[t] || 0) + br[t]; });
        } else {
          byType["Class"] = (byType["Class"] || 0) + count;
        }
        realNodeCount += count;
        return;
      }
      var t = d.type;
      // v0.7.4 — Blank nodes should not be typed as "Individual" (which
      // is what the current parser labels them). Give them a bucket
      // of their own in the metrics so users see how much of the
      // ontology is anonymous.
      if (_isBlankNode(d.id)) t = "BlankNode";
      byType[t || "Unknown"] = (byType[t || "Unknown"] || 0) + 1;
      realNodeCount++;
      var ns2 = d.namespace || _nsFromNodeData(d);
      if (ns2) byNs[ns2] = (byNs[ns2] || 0) + 1;
      tally(d);
    });
    // Sweep sideStore for restrictions / annotations / blanks that
    // live inside clusters. Uses inst.sideStore populated by either
    // the browser-side auto-clusterer or build-time cluster.py.
    if (inst.sideStore) {
      Object.keys(inst.sideStore).forEach(function(cid) {
        var side = inst.sideStore[cid];
        if (!side || !side.nodes) return;
        side.nodes.forEach(function(n) {
          var d = (n && n.data) || n || {};
          tally(d);
        });
      });
    }

    // Total edges = sum of weight (fanned super-edge counts as N).
    var totalEdgeCount = 0;
    // Distinct SUBJECTS restricted = unique source ids of owl-restriction
    // edges (matches Protégé's "Restricted class" concept). Falls back
    // to restrNodeCount when the parser emits inline `data.restrictions`
    // arrays instead of edges.
    var restrictedSubjects = {};
    edges.forEach(function(e) {
      var d = (e && e.data) || e || {};
      var w = (d.weight && d.weight > 1) ? d.weight : 1;
      totalEdgeCount += w;
      var et = d.edgeType || "other";
      byEdgeType[et] = (byEdgeType[et] || 0) + w;
      if (d.source) degree[d.source] = (degree[d.source] || 0) + 1;
      if (d.target) degree[d.target] = (degree[d.target] || 0) + 1;
      if (et === "owl-restriction" && d.source) restrictedSubjects[d.source] = true;
    });
    // Merge edge-derived restricted-subject count with node-inline count —
    // whichever the ontology's parse produced, we report the higher
    // (more informative) figure.
    var restrictionsMetric = Math.max(restrNodeCount, Object.keys(restrictedSubjects).length);

    var orphans = 0;
    nodes.forEach(function(n) {
      var d = (n && n.data) || n || {};
      if (!d.id) return;
      if (d.isClusterHull || d.type === "ClusterHull") return;
      if (d.isSuperNode || d.type === "SuperNode") return;
      if (!degree[d.id]) orphans++;
    });
    var shaclCount = (inst.data.shacl && inst.data.shacl.length) || 0;
    return {
      nodeCount: realNodeCount,
      edgeCount: totalEdgeCount,
      byType: byType,
      byNs: byNs,
      byEdgeType: byEdgeType,
      restrictionsCount: restrictionsMetric,
      annotationsCount: annNodeCount,
      blankNodeCount: blankNodeCount,
      orphans: orphans,
      shaclCount: shaclCount
    };
  }
  function _metricCard(label, value) {
    return '<div class="ov-metric-card"><div class="ov-metric-value">' + esc(String(value)) + '</div><div class="ov-metric-label">' + esc(label) + '</div></div>';
  }
  function _metricBars(entries, total, labelResolver) {
    var html = '<div class="ov-metrics-bars">';
    entries.forEach(function(e) {
      var pct = total > 0 ? Math.max(1, Math.round(100 * e.n / total)) : 0;
      var lab = labelResolver ? labelResolver(e) : e.k;
      var tt = e.title || e.k || "";
      html += '<div class="ov-metrics-bar-row">' +
              '<span class="ov-metrics-bar-label" title="' + esc(tt) + '">' + esc(lab) + '</span>' +
              '<span class="ov-metrics-bar"><span style="width:' + pct + '%"></span></span>' +
              '<span class="ov-metrics-bar-count">' + e.n + '</span>' +
              '</div>';
    });
    html += '</div>';
    return html;
  }
  function openMetricsSplash(id) {
    var inst = instances[id]; if (!inst) return;
    var container = document.getElementById(id); if (!container) return;
    var m = _computeMetrics(inst); if (!m) return;
    var prefixes = (inst.data && (inst.data.prefixes || inst.data.namespaces || inst.data.activeNamespaces)) || {};

    var overlay = container.querySelector(".ov-metrics-splash");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "ov-metrics-splash";
      container.appendChild(overlay);
    }

    var typeEntries = Object.keys(m.byType).map(function(k) { return { k: k, n: m.byType[k] }; })
                       .sort(function(a, b) { return b.n - a.n; });
    var nsEntries = Object.keys(m.byNs).map(function(k) { return { k: k, n: m.byNs[k], title: k }; })
                     .sort(function(a, b) { return b.n - a.n; })
                     .slice(0, 8);
    var edgeEntries = Object.keys(m.byEdgeType).map(function(k) { return { k: k, n: m.byEdgeType[k] }; })
                       .sort(function(a, b) { return b.n - a.n; });

    var currentLod = (inst.lodLevel != null) ? inst.lodLevel : 6;
    var lodRadios = "";
    var lodLabels = _LOD_DESCRIPTIONS_STATIC;
    for (var lv = 0; lv <= 6; lv++) {
      var checked = (lv === currentLod) ? "checked" : "";
      lodRadios += '<label class="ov-metrics-lod-row"><input type="radio" name="' + id + '-lod-pick" value="' + lv + '" ' + checked + '> <span>' + esc(lodLabels[lv]) + '</span></label>';
    }

    var html = '<div class="ov-metrics-panel">' +
      '<div class="ov-metrics-head">Ontology overview' +
        '<button class="ov-btn-close" data-oi-onclick="ontoink.closeMetricsSplash(\'' + id + '\')" title="Close">&times;</button>' +
      '</div>' +
      '<div class="ov-metrics-body">' +
        '<div class="ov-metrics-grid">' +
          _metricCard("Subjects", m.nodeCount) +
          _metricCard("Relations", m.edgeCount) +
          _metricCard("Orphans", m.orphans) +
          _metricCard("Blank nodes", m.blankNodeCount || 0) +
          _metricCard("Restricted classes", m.restrictionsCount) +
          _metricCard("Annotated", m.annotationsCount) +
          _metricCard("SHACL shapes", m.shaclCount) +
        '</div>' +
        '<div class="ov-metrics-section-head">By type</div>' +
        _metricBars(typeEntries, m.nodeCount) +
        '<div class="ov-metrics-section-head">Top namespaces</div>' +
        _metricBars(nsEntries, m.nodeCount, function(e) { return _shortNsLabel(e.k, prefixes); }) +
        '<div class="ov-metrics-section-head">Edge types</div>' +
        _metricBars(edgeEntries, m.edgeCount) +
        '<div class="ov-metrics-section-head">Start rendering at</div>' +
        '<div class="ov-metrics-lod-list">' + lodRadios + '</div>' +
        '<div class="ov-metrics-actions">' +
          '<button class="ov-btn ov-btn-accent" data-oi-onclick="ontoink._exploreFromSplash(\'' + id + '\')">Explore the graph</button>' +
        '</div>' +
      '</div>' +
    '</div>';
    overlay.innerHTML = html;
    overlay.style.display = "flex";
  }
  function _exploreFromSplash(id) {
    var container = document.getElementById(id); if (!container) return;
    var chosen = container.querySelector('input[name="' + id + '-lod-pick"]:checked');
    if (chosen) setLodLevel(id, parseInt(chosen.value, 10));
    closeMetricsSplash(id);
  }
  function closeMetricsSplash(id) {
    var container = document.getElementById(id); if (!container) return;
    var overlay = container.querySelector(".ov-metrics-splash");
    if (overlay) overlay.style.display = "none";
  }
  // Static copy of _LOD_DESCRIPTIONS (which is defined inside setLodLevel's
  // closure). Duplicated here to avoid a circular closure reference and to
  // stay independent of setLodLevel's internal state.
  var _LOD_DESCRIPTIONS_STATIC = {
    0: "L0 · classes only",
    1: "L1 · + hierarchy",
    2: "L2 · + individuals & object properties",
    3: "L3 · + OWL restrictions",
    4: "L4 · + data properties & literals",
    5: "L5 · everything except inferred",
    6: "L6 · everything"
  };

  // ==========================================================================
  // v0.7.2 — Client-side namespace clustering
  //
  // Problem the earlier build shipped with: `cluster.detect_clusters` (Python)
  // was never wired into the fence or playground pipeline, so the browser-side
  // `sideStore` was always `{}` and no node ever carried `isSuperNode=true`.
  // The "Super" checkbox (and every super-node code path) was therefore inert
  // for every real user — flip the box, nothing happens.
  //
  // v0.7.2 fixes that in the browser, without adding a Python dependency:
  // every ontoink instance auto-clusters its nodes by namespace at init time
  // if no build-time side-store was shipped. A namespace with `MIN_MEMBERS`
  // or more members collapses into one hexagonal super-node whose interior is
  // stashed in `sideStore[cid]` and re-emerges on click.
  //
  // Cross-cluster edges are rewritten to point at the containing super-nodes;
  // interior edges (both endpoints in the same namespace) stay in the
  // side-store and appear only when the cluster is expanded. Expand/collapse
  // stay consistent thanks to `_rebuildClusterBoundary`, which recomputes the
  // touched-cluster's boundary from an untouched `_origEdges` snapshot.
  //
  // The old "Super" checkbox is repurposed as **Group by namespace**:
  //   - checked  = grouped view (super-nodes visible, members hidden)
  //   - unchecked = flat view (every super-node expanded)
  var _CLUSTER_MIN_MEMBERS = 4;   // namespaces smaller than this stay flat
  var _CLUSTER_MIN_GRAPH   = 30;  // graphs smaller than this aren't clustered

  function _shortNsLabel(ns, prefixes) {
    // Prefer a declared prefix; fall back to the URL's last path segment.
    if (prefixes) {
      for (var p in prefixes) {
        if (Object.prototype.hasOwnProperty.call(prefixes, p) && prefixes[p] === ns) {
          return p || "(default)";
        }
      }
    }
    var tail = String(ns || "").replace(/[#/]$/, "");
    var idx = Math.max(tail.lastIndexOf("/"), tail.lastIndexOf("#"));
    var last = idx > 0 ? tail.substring(idx + 1) : tail;
    return last || tail || String(ns);
  }
  function _cidForNs(ns) {
    // Deterministic, DOM-safe, INJECTIVE id.
    // The naive `replace(/[^a-zA-Z0-9]/g, "_")` aliased common ontology
    // patterns: `http://ex.org/foo/` and `http://ex.org/foo#` both
    // collapse to `_grp_http___ex_org_foo_`, silently merging two
    // logically distinct namespace groups into one mislabeled super-node
    // (adversarial review 2026-07-10). Hex-encoding preserves round-trip
    // uniqueness while staying DOM-safe.
    return "_grp_" + String(ns || "").replace(/[^a-zA-Z0-9]/g, function(c) {
      return "_" + c.charCodeAt(0).toString(16) + "_";
    });
  }
  function _nsFromNodeData(d) {
    if (d.namespace) return d.namespace;
    var iri = d.iri || d.id || "";
    var idx = Math.max(iri.lastIndexOf("/"), iri.lastIndexOf("#"));
    return idx > 0 ? iri.substring(0, idx + 1) : "";
  }

  // Recompute the boundary edges for one cluster from the pristine
  // `_origEdges` snapshot. Used after every expand/collapse — cy.remove
  // cascade-kills every edge whose endpoint disappears, so both directions
  // need to re-emit their touching-cluster edges. The other side may be:
  //   - unclustered → keep the real IRI
  //   - in a currently-expanded cluster → keep the real IRI
  //   - in a currently-collapsed cluster → point at that cluster's super id
  // Dedup key is (visSrc, visTgt, edgeType); duplicates already in cy are
  // skipped so repeated calls are idempotent.
  function _rebuildClusterBoundary(inst, cid) {
    var cy = inst.cy; if (!cy) return;
    if (!inst._origEdges || !inst._memberToCid) return;
    // Purge stale cluster-managed attic entries — every boundary edge is
    // regenerable from _origEdges, so an attic copy that pre-dated the
    // current topology is by definition wrong. Without this, the sequence
    // expand-A → drop LOD below the object-property floor → collapse-A →
    // raise LOD would restore a stale A_member→B edge whose source is no
    // longer in cy, throwing "missing endpoint" (adversarial review 2026-07-10).
    var m = inst._memberToCid || {};
    var expanded = inst.expandedSuperNodes || new Set();
    // v0.7.3-fix (round-3 findings #3, #4): the purge previously nuked
    // EVERY clusterManaged attic entry — but this function only rebuilds
    // ONE cluster's boundary, so entries belonging to OTHER clusters
    // (e.g. a facet-hidden cluster B whose boundary edges are legitimately
    // atticized) got destroyed as collateral. Scope the purge: only
    // delete entries whose either endpoint touches `cid` (as member or
    // as the super-id itself).
    if (inst.attic && inst.attic.forEach) {
      var stale = [];
      inst.attic.forEach(function(json, key) {
        if (!(json && json.data && json.data.clusterManaged === true)) return;
        var d = json.data;
        var s_cid_p = m[d.source] || d.source;
        var t_cid_p = m[d.target] || d.target;
        if (s_cid_p === cid || t_cid_p === cid) stale.push(key);
      });
      for (var s = 0; s < stale.length; s++) inst.attic.delete(stale[s]);
    }
    // Snapshot the current edge set so dedup against it is O(1)
    var existing = {};
    cy.edges().forEach(function(ee) {
      var d = ee.data();
      existing[d.source + " " + d.target + " " + (d.edgeType || "")] = true;
    });
    // Bucket by (visSrc, visTgt, edgeType) so duplicates FAN — collect
    // weight + predicate list rather than skipping the extra edges
    // (#20 edge fanning).
    var bucket = {};
    var toAdd = [];
    for (var i = 0; i < inst._origEdges.length; i++) {
      var e = inst._origEdges[i];
      var s = e.data.source, t = e.data.target;
      var s_cid = m[s], t_cid = m[t];
      // Only rebuild edges TOUCHING this cluster
      if (s_cid !== cid && t_cid !== cid) continue;
      // Pure-interior edges live in sideStore[cid].edges — expand puts them
      // back directly, no boundary work needed.
      if (s_cid && s_cid === t_cid) continue;
      var visS = s_cid ? (expanded.has(s_cid) ? s : s_cid) : s;
      var visT = t_cid ? (expanded.has(t_cid) ? t : t_cid) : t;
      if (visS === visT) continue;
      // Skip if either endpoint isn't present in cy right now
      if (cy.getElementById(visS).length === 0) continue;
      if (cy.getElementById(visT).length === 0) continue;
      var key = visS + " " + visT + " " + (e.data.edgeType || "");
      if (existing[key]) continue;
      var pred_r = e.data.iri || e.data.label || e.data.predicate || "";
      if (bucket[key]) {
        bucket[key].weight++;
        if (pred_r && bucket[key].fan.indexOf(pred_r) < 0) bucket[key].fan.push(pred_r);
        continue;
      }
      bucket[key] = {
        firstIdx: i,
        weight: 1,
        fan: pred_r ? [pred_r] : [],
        source: visS, target: visT,
        edgeType: e.data.edgeType || "object-property",
        origLabel: e.data.label || ""
      };
    }
    Object.keys(bucket).forEach(function(k) {
      var b = bucket[k];
      toAdd.push({ group: "edges", data: {
        id: "_grp_e_" + cid + "_" + b.firstIdx,
        source: b.source,
        target: b.target,
        edgeType: b.edgeType,
        label: b.weight > 1 ? String(b.weight) : b.origLabel,
        weight: b.weight,
        fan: b.fan,
        clusterManaged: true
      }});
    });
    if (toAdd.length) cy.add(toAdd);
  }

  // v0.7.4 — Compact subtitle for a cluster's hexagon / hull header.
  // Examples: "52C · 8I · 5B" (Class / Individual / BlankNode counts),
  // or "no members" if empty. Only shows type entries with count > 0.
  // Edge-type entries (prefixed "e_") from the breakdown are ignored
  // here — they'd bloat the label; the popup shows the full picture.
  function _clusterSubtitle(br, size) {
    if (!br) return String(size || 0) + " members";
    var parts = [];
    var typeAbbr = { Class: "C", Individual: "I", Literal: "L", BlankNode: "B", SuperNode: "" };
    ["Class", "Individual", "Literal", "BlankNode"].forEach(function(t) {
      if (br[t]) parts.push(br[t] + typeAbbr[t]);
    });
    Object.keys(br).forEach(function(k) {
      if (k.indexOf("e_") === 0) return;
      if (typeAbbr.hasOwnProperty(k)) return;
      if (br[k]) parts.push(br[k] + " " + k.substring(0, 3));
    });
    return parts.length ? parts.join(" · ") : String(size || 0) + " members";
  }

  // Run the auto-clustering pass on `id`'s cy instance. Skips instances that
  // already carry a shipped side-store or cluster metadata (build-time Leiden
  // clustering takes precedence). Idempotent via `inst._nsClustered`.
  function _autoClusterByNamespace(id) {
    var inst = instances[id]; if (!inst || !inst.cy || !inst.data) return;
    if (inst._nsClustered) return;
    // Respect shipped side-store or cluster metadata — build-time Leiden wins.
    if (inst.sideStore && Object.keys(inst.sideStore).length > 0) return;
    if (inst.data.clusters && inst.data.clusters.length > 0) return;

    var cy = inst.cy;
    var nodes = cy.nodes().filter(function(n) {
      var d = n.data();
      return !d.isSuperNode && d.type !== "SuperNode" && d.type !== "Literal";
    });
    if (nodes.length < _CLUSTER_MIN_GRAPH) return;

    // Group non-literal nodes by namespace
    var byNs = {};
    nodes.forEach(function(n) {
      var ns = _nsFromNodeData(n.data());
      if (!ns) return;
      (byNs[ns] = byNs[ns] || []).push(n.id());
    });

    var prefixes = inst.data.prefixes || inst.data.namespaces || inst.data.activeNamespaces || {};
    var clusters = {};
    var memberToCid = {};
    var cidCount = 0;
    Object.keys(byNs).forEach(function(ns) {
      var members = byNs[ns];
      if (members.length < _CLUSTER_MIN_MEMBERS) return;
      var cid = _cidForNs(ns);
      var title = _shortNsLabel(ns, prefixes);
      // v0.7.4 — Per-cluster type breakdown: how many Classes vs
      // Individuals vs blank-nodes vs other. Used by the hexagon /
      // hull label so users see cluster composition at a glance
      // ("mwo · 65 · 52 classes · 8 individuals · 5 blanks").
      clusters[cid] = {
        id: cid, ns: ns, member_ids: members.slice(),
        size: members.length, title: title, centrality: 0,
        type_breakdown: {}
      };
      for (var i = 0; i < members.length; i++) memberToCid[members[i]] = cid;
      cidCount++;
    });
    if (cidCount === 0) return;

    // Pristine edge snapshot for boundary rebuilds
    inst._origEdges = cy.edges().map(function(e) { return e.json(); });
    inst._memberToCid = memberToCid;
    inst._clusterMeta = clusters;

    // Populate sideStore[cid] with interior nodes + interior edges only.
    // Simultaneously tally the type_breakdown for the hexagon label.
    if (!inst.sideStore) inst.sideStore = {};
    Object.keys(clusters).forEach(function(cid) {
      inst.sideStore[cid] = { nodes: [], edges: [], node_badges: {} };
    });
    nodes.forEach(function(n) {
      var cid = memberToCid[n.id()];
      if (!cid) return;
      inst.sideStore[cid].nodes.push(n.json());
      var nd = n.data();
      var t = nd.type || "Unknown";
      if (_isBlankNode(nd.id)) t = "BlankNode";
      var br = clusters[cid].type_breakdown;
      br[t] = (br[t] || 0) + 1;
    });
    // Interior edges + per-edgeType tally for label + boundary rebuild.
    cy.edges().forEach(function(e) {
      var d = e.data();
      var s_cid = memberToCid[d.source];
      var t_cid = memberToCid[d.target];
      if (s_cid && s_cid === t_cid) {
        inst.sideStore[s_cid].edges.push(e.json());
        var br = clusters[s_cid].type_breakdown;
        var et = "e_" + (d.edgeType || "other");
        br[et] = (br[et] || 0) + 1;
      }
    });

    // Publish clusters for collapseSuperNode (reads inst.data.clusters)
    inst.data.clusters = Object.keys(clusters).map(function(cid) { return clusters[cid]; });

    // Remove clustered nodes (cascade also removes their touching edges).
    // Unclustered nodes + edges between unclustered nodes stay put.
    var toRemove = nodes.filter(function(n) { return !!memberToCid[n.id()]; });
    if (toRemove.length) cy.remove(toRemove);

    // Add super-node placeholders. v0.7.4 — richer label built from the
    // per-cluster type breakdown (see `_clusterSubtitle`) so users can
    // read the composition without expanding: "mwo · 65 · 52C · 8I · 5B".
    var superNodes = Object.keys(clusters).map(function(cid) {
      var meta = clusters[cid];
      return { group: "nodes", data: {
        id: cid, label: meta.title, type: "SuperNode", isSuperNode: true,
        memberCount: meta.size, clusterId: cid, namespace: meta.ns,
        subtitle: _clusterSubtitle(meta.type_breakdown, meta.size),
        typeBreakdown: meta.type_breakdown
      }};
    });
    cy.add(superNodes);

    // Add cross-cluster + half-clustered super-edges. Duplicates of
    // (visS, visT, edgeType) FAN into one — we accumulate weight +
    // predicate list so the collapsed graph reads a thick "45" instead
    // of a single anonymous arrow (#20 edge fanning).
    var superEdges = [];
    var superEdgeMap = {};
    for (var i = 0; i < inst._origEdges.length; i++) {
      var oe = inst._origEdges[i];
      var s = oe.data.source, t = oe.data.target;
      var s_cid = memberToCid[s], t_cid = memberToCid[t];
      if (s_cid && s_cid === t_cid) continue;   // interior → sideStore already
      if (!s_cid && !t_cid) continue;            // both unclustered → still in cy
      var visS = s_cid || s;
      var visT = t_cid || t;
      if (visS === visT) continue;
      var key = visS + " " + visT + " " + (oe.data.edgeType || "");
      var pred_i = oe.data.iri || oe.data.label || oe.data.predicate || "";
      if (superEdgeMap[key]) {
        superEdgeMap[key].weight++;
        if (pred_i && superEdgeMap[key].fan.indexOf(pred_i) < 0) superEdgeMap[key].fan.push(pred_i);
        continue;
      }
      superEdgeMap[key] = {
        firstIdx: i,
        weight: 1,
        fan: pred_i ? [pred_i] : [],
        source: visS, target: visT,
        edgeType: oe.data.edgeType || "object-property",
        origLabel: oe.data.label || ""
      };
    }
    Object.keys(superEdgeMap).forEach(function(k) {
      var m = superEdgeMap[k];
      superEdges.push({ group: "edges", data: {
        id: "_grp_e_init_" + m.firstIdx,
        source: m.source, target: m.target,
        edgeType: m.edgeType,
        label: m.weight > 1 ? String(m.weight) : m.origLabel,
        weight: m.weight,
        fan: m.fan,
        clusterManaged: true
      }});
    });
    if (superEdges.length) cy.add(superEdges);

    inst._nsClustered = true;
    // Re-layout the grouped view — new node/edge set needs settlement
    try { cy.layout({ name: "dagre", rankDir: "BT", nodeSep: 60, rankSep: 80, animate: false, fit: true, padding: 30 }).run(); } catch (e) {}
  }

  // "Group by namespace" toggle — the renamed v0.7.2 replacement for the
  // inert "Super" checkbox.
  //   checked  → grouped view: collapse every currently-expanded cluster
  //   unchecked → flat view: expand every super-node still in cy
  //
  // Batched via inst._batchOp so expand/collapseSuperNode skip their tail
  // setLodLevel — otherwise the mid-loop LOD sweep sees the new
  // showSuperNodes state and evicts every still-collapsed sibling
  // super-node into the attic before the loop reaches it (adversarial
  // review 2026-07-10 finding #7). Similarly `showSuperNodes` is written
  // AFTER the loop so the sweep during the tail setLodLevel sees the
  // correct final state, not an intermediate one.
  function toggleSuperNodes(id, checked) {
    var inst = instances[id]; if (!inst || !inst.cy) return;
    var cy = inst.cy;
    inst._batchOp = true;
    try {
      if (!checked) {
        var toExpand = [];
        cy.nodes().forEach(function(n) {
          if (n.data("isSuperNode")) toExpand.push(n.id());
        });
        for (var i = 0; i < toExpand.length; i++) expandSuperNode(id, toExpand[i]);
      } else {
        var toCollapse = [];
        if (inst.expandedSuperNodes) {
          inst.expandedSuperNodes.forEach(function(sid) { toCollapse.push(sid); });
        }
        for (var j = 0; j < toCollapse.length; j++) collapseSuperNode(id, toCollapse[j]);
      }
    } finally {
      inst._batchOp = false;
    }
    inst.showSuperNodes = !!checked;
    setLodLevel(id, inst.lodLevel);
  }

  // Render badge chips as a compact overlay next to each node using the
  // popup mechanism. Stateless — safe to call repeatedly. Renders one
  // .ov-node-badge-layer per container; contents are position-synced with
  // cytoscape via a 'render' listener registered once per instance.
  function renderNodeBadges(id, nodeIds) {
    var inst = instances[id]; if (!inst || !inst.cy) return;
    var container = document.getElementById(id); if (!container) return;
    var badges = (inst.policy && inst.policy.node_badges) || {};
    if (!badges || !Object.keys(badges).length) return;
    var layer = container.querySelector(".ov-node-badge-layer");
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "ov-node-badge-layer";
      layer.style.cssText = "position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;z-index:2;";
      var canvas = container.querySelector(".ov-canvas");
      if (canvas) canvas.appendChild(layer);
      else container.appendChild(layer);
    }
    var cy = inst.cy;
    var canvasRect = (container.querySelector(".ov-canvas") || container).getBoundingClientRect();

    var targets = nodeIds && nodeIds.length ? nodeIds : Object.keys(badges);
    // Rebuild the layer wholesale — the set of visible nodes changes
    // constantly and virtual overlays are cheap.
    layer.innerHTML = "";
    for (var i = 0; i < targets.length; i++) {
      var iri = targets[i];
      var b = badges[iri]; if (!b) continue;
      var n = cy.getElementById(iri);
      if (!n || !n.length) continue;
      var counts = b.counts || {};
      var dp = (b.data_properties && b.data_properties.length) || 0;
      var ann = (b.annotations && b.annotations.length) || 0;
      if (!dp && !ann) continue;
      var chip = document.createElement("div");
      chip.className = "ov-node-badge";
      chip.style.cssText = "position:absolute;";
      var label = "";
      if (dp)  label += '<span class="ov-node-badge" title="Data properties">' + dp + ' data</span>';
      if (ann) label += '<span class="ov-node-badge" title="Annotations">[i] ' + ann + '</span>';
      chip.innerHTML = label;
      // Position: node.renderedPosition returns pixel coords inside the
      // cytoscape canvas — piggyback on that.
      var rp = n.renderedPosition();
      chip.style.left = (rp.x + 12) + "px";
      chip.style.top  = (rp.y - 20) + "px";
      layer.appendChild(chip);
    }
  }

  // Fold annotations / data-properties into node_badges and drop hidden
  // predicates. Used by the SPARQL result path where triples never touch
  // the Python side. Mutates its input and returns
  //   { nodes, edges, node_badges }.
  function applyPredicatePolicyToElements(cyElements, policy) {
    var nodes = (cyElements && cyElements.nodes) || [];
    var edges = (cyElements && cyElements.edges) || [];
    var hide  = (policy && policy.hide)  || [];
    var fold  = (policy && policy.fold)  || [];
    var badgePreds = (policy && policy.badge) || [];
    var node_badges = {};

    function inList(iri, list) {
      if (!iri || !list || !list.length) return false;
      for (var i = 0; i < list.length; i++) {
        var pat = list[i];
        if (pat === iri) return true;
        if (pat && pat.charAt(pat.length - 1) === "*") {
          var stem = pat.substring(0, pat.length - 1);
          if (iri.indexOf(stem) === 0) return true;
        }
      }
      return false;
    }

    // Common annotation predicates → annotations bucket
    var ANNOT = {
      "http://www.w3.org/2000/01/rdf-schema#label": 1,
      "http://www.w3.org/2000/01/rdf-schema#comment": 1,
      "http://www.w3.org/2004/02/skos/core#prefLabel": 1,
      "http://www.w3.org/2004/02/skos/core#altLabel": 1,
      "http://purl.org/dc/terms/title": 1,
      "http://purl.org/dc/terms/description": 1
    };

    var keptEdges = [];
    var referenced = {};
    for (var i = 0; i < edges.length; i++) {
      var e = edges[i];
      var d = e.data || {};
      var pred = d.predicate || d.iri || "";
      if (inList(pred, hide)) continue;
      // Fold data-property literals into badges
      if (d.edgeType === "data-property" && inList(pred, fold)) {
        var src = d.source;
        if (!node_badges[src]) node_badges[src] = { annotations: [], data_properties: [], counts: {} };
        var entry = { predicate: pred, value: d.label || "", datatype: d.datatype || "" };
        if (ANNOT[pred]) node_badges[src].annotations.push(entry);
        else            node_badges[src].data_properties.push(entry);
        continue; // drop the edge
      }
      // Badge object-properties: surface, don't drop
      if (inList(pred, badgePreds)) {
        var src2 = d.source;
        if (!node_badges[src2]) node_badges[src2] = { annotations: [], data_properties: [], counts: {} };
        node_badges[src2].data_properties.push({ predicate: pred, value: d.target || "", datatype: "" });
        continue;
      }
      keptEdges.push(e);
      if (d.source) referenced[d.source] = 1;
      if (d.target) referenced[d.target] = 1;
    }
    // Drop literal nodes that lost all incident edges after folding.
    var keptNodes = [];
    for (var j = 0; j < nodes.length; j++) {
      var n = nodes[j];
      var nd = n.data || {};
      if (nd.type === "Literal" && !referenced[nd.id]) continue;
      keptNodes.push(n);
    }
    // Fill counts
    for (var k in node_badges) {
      if (!node_badges.hasOwnProperty(k)) continue;
      node_badges[k].counts = {
        annotations:     node_badges[k].annotations.length,
        data_properties: node_badges[k].data_properties.length,
        hidden_object:   0
      };
    }
    return { nodes: keptNodes, edges: keptEdges, node_badges: node_badges };
  }

  // Convert SPARQL result rows (?s ?p ?o) into a Cytoscape elements payload.
  // The edgeType heuristic mirrors the TTL parser's rule set: object
  // literal → data-property; rdf:type → rdf-type; rdfs:subClassOf →
  // subclass; else object-property.
  function triplesToElements(rows) {
    if (!rows || !rows.length) return { nodes: [], edges: [] };
    var nodesById = {};
    var edges = [];

    function isLiteral(v) { return typeof v === "string" && v.length && v.charAt(0) === '"'; }
    function localName(iri) {
      if (!iri) return "";
      var h = iri.lastIndexOf("#");
      if (h >= 0) return iri.substring(h + 1);
      var s = iri.lastIndexOf("/");
      if (s >= 0) return iri.substring(s + 1);
      return iri;
    }
    function ensureNode(iri, isLit) {
      if (!iri || nodesById[iri]) return;
      nodesById[iri] = {
        group: "nodes",
        data: {
          id: iri,
          iri: iri,
          label: isLit ? iri.replace(/^"/, "").replace(/"[^"]*$/, "") : localName(iri),
          type: isLit ? "Literal" : "Individual",
          color: isLit ? "#dcfce7" : "#e0e7ff",
          shape: isLit ? "ellipse" : "ellipse"
        }
      };
    }

    var TYPE_IRI = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
    var SUB_IRI  = "http://www.w3.org/2000/01/rdf-schema#subClassOf";

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      // Find s/p/o regardless of the variable's exact name (?s, ?subject, …)
      var keys = Object.keys(row);
      var s = row["?s"] || row.s;
      var p = row["?p"] || row.p;
      var o = row["?o"] || row.o;
      // Fallback: first three columns
      if (s == null && keys.length > 0) s = row[keys[0]];
      if (p == null && keys.length > 1) p = row[keys[1]];
      if (o == null && keys.length > 2) o = row[keys[2]];
      if (!s || !p || o == null) continue;

      var oIsLit = isLiteral(o);
      var edgeType = oIsLit ? "data-property"
                    : (p === TYPE_IRI ? "rdf-type"
                    : (p === SUB_IRI ? "subclass" : "object-property"));

      ensureNode(s, false);
      ensureNode(o, oIsLit);

      edges.push({
        group: "edges",
        data: {
          id: "sparql-" + i,
          source: s,
          target: o,
          label: localName(p),
          iri: p,
          predicate: p,
          edgeType: edgeType
        }
      });
    }
    var nodeList = [];
    for (var k in nodesById) if (nodesById.hasOwnProperty(k)) nodeList.push(nodesById[k]);
    return { nodes: nodeList, edges: edges };
  }

  // ── Legend overlay (inside canvas) ──────────────────────────────────────

  // Read live styles from the cytoscape instance for the given container.
  // Returns null if no instance / no cytoscape — caller should fall back to data.
  function getLiveStyles(container) {
    var inst = container && container.id ? instances[container.id] : null;
    if (!inst || !inst.cy) return null;
    var typeColors = {}, typeShapes = {};
    var edgeColors = {}, edgeLineStyles = {}, edgeArrows = {};
    inst.cy.nodes().forEach(function(n) {
      var d = n.data();
      if (!d.type) return;
      typeColors[d.type] = n.style("background-color") || d.color;
      typeShapes[d.type] = n.style("shape") || d.shape || "rectangle";
    });
    inst.cy.edges().forEach(function(e) {
      var et = e.data("edgeType"); if (!et) return;
      edgeColors[et] = e.style("line-color");
      edgeLineStyles[et] = e.style("line-style");
      edgeArrows[et] = e.style("target-arrow-shape");
    });
    return { typeColors: typeColors, typeShapes: typeShapes,
             edgeColors: edgeColors, edgeLineStyles: edgeLineStyles, edgeArrows: edgeArrows };
  }

  // SVG snippet for a node shape preview (18x13). Used in the legend.
  function shapeIconSvg(shape, fill, stroke, extraAttrs) {
    var attrs = ' fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.5"' + (extraAttrs || "");
    switch (shape) {
      case "round-rectangle": return '<rect x="1" y="1" width="16" height="11" rx="5"' + attrs + '/>';
      case "ellipse":         return '<ellipse cx="9" cy="6.5" rx="7" ry="5"' + attrs + '/>';
      case "triangle":        return '<polygon points="9,1 17,12 1,12"' + attrs + '/>';
      case "diamond":         return '<polygon points="9,1 17,6.5 9,12 1,6.5"' + attrs + '/>';
      case "hexagon":         return '<polygon points="5,1 13,1 17,6.5 13,12 5,12 1,6.5"' + attrs + '/>';
      case "octagon":         return '<polygon points="6,1 12,1 17,5 17,8 12,12 6,12 1,8 1,5"' + attrs + '/>';
      case "pentagon":        return '<polygon points="9,1 17,6 14,12 4,12 1,6"' + attrs + '/>';
      case "star":            return '<polygon points="9,1 11,5 16,5 12,8 13,12 9,10 5,12 6,8 2,5 7,5"' + attrs + '/>';
      case "vee":             return '<polygon points="1,1 9,12 17,1 13,1 9,7 5,1"' + attrs + '/>';
      case "rectangle":
      default:                return '<rect x="1" y="1" width="16" height="11" rx="2"' + attrs + '/>';
    }
  }

  // SVG snippet for an edge arrowhead preview. The connecting line ends near
  // x=22 and the arrow tip sits at x=32 (vertical centre y=6). Mirrors
  // cytoscape's target-arrow-shape so Edit-Layout pointer changes show up in
  // the legend; `filled` controls hollow-vs-solid for closed heads.
  function arrowIconSvg(shape, color, filled) {
    var f = filled ? color : "none";
    switch (shape) {
      case "none":
        return "";
      case "tee":
        return '<line x1="22" y1="6" x2="30" y2="6" stroke="' + color + '" stroke-width="1.5"/>'
             + '<line x1="30.5" y1="1" x2="30.5" y2="11" stroke="' + color + '" stroke-width="2.2"/>';
      case "vee":
      case "chevron":
        return '<polyline points="22,2 32,6 22,10" fill="none" stroke="' + color + '" stroke-width="1.6"/>';
      case "circle":
        return '<circle cx="27" cy="6" r="4" fill="' + f + '" stroke="' + color + '" stroke-width="1"/>';
      case "diamond":
        return '<polygon points="22,6 27,1.5 32,6 27,10.5" fill="' + f + '" stroke="' + color + '" stroke-width="1"/>';
      case "triangle-tee":
        return '<polygon points="23,2 31,6 23,10" fill="' + color + '" stroke="' + color + '"/>'
             + '<line x1="21.5" y1="1.5" x2="21.5" y2="10.5" stroke="' + color + '" stroke-width="1.8"/>';
      case "circle-triangle":
        return '<polygon points="24,2 32,6 24,10" fill="' + color + '" stroke="' + color + '"/>'
             + '<circle cx="22" cy="6" r="2.8" fill="' + f + '" stroke="' + color + '" stroke-width="0.9"/>';
      case "triangle-backcurve":
      case "triangle":
      default:
        return '<polygon points="22,2 32,6 22,10" fill="' + f + '" stroke="' + color + '" stroke-width="0.8"/>';
    }
  }

  // Default style table for edge types (used when cytoscape isn't available)
  var EDGE_LEGEND_DEFAULTS = {
    "object-property": { l:"Object Property", c:"#2563eb", lineStyle:"solid",  filled:true,  bold:false },
    "data-property":   { l:"Data Property",   c:"#16a34a", lineStyle:"solid",  filled:false, bold:false },
    "rdf-type":        { l:"rdf:type",         c:"#9ca3af", lineStyle:"dashed", filled:false, bold:false },
    "subclass":        { l:"rdfs:subClassOf",  c:"#374151", lineStyle:"solid",  filled:true,  bold:false },
    "shacl-constraint":{ l:"SHACL Constraint", c:"#0891b2", lineStyle:"dashed", filled:true,  bold:true  },
    "owl-restriction": { l:"OWL Restriction",  c:"#a855f7", lineStyle:"dashed", filled:true,  bold:false },
    "inferred":        { l:"Inferred (OWL)",   c:"#a855f7", lineStyle:"dotted", filled:true,  bold:false },
  };

  function buildLegendOverlay(container, data) {
    var el = container.querySelector(".ov-legend-overlay");
    if (!el) return;
    if (container.getAttribute("data-show-legend") === "false") { el.style.display = "none"; return; }

    var live = getLiveStyles(container);
    var usedTypes = {}, usedEdge = {};
    data.nodes.forEach(function(n) {
      var t = n.data.type;
      usedTypes[t] = (live && live.typeColors[t]) || n.data.color;
    });
    data.edges.forEach(function(e) { usedEdge[e.data.edgeType] = true; });
    // Also pick up dynamically-added edge types like "inferred" (added by the
    // Show-inferences-on-graph overlay) — they're in cytoscape but not in data.edges.
    var inst = instances[container.id];
    if (inst && inst.cy) {
      inst.cy.edges().forEach(function(e) {
        var et = e.data("edgeType"); if (et) usedEdge[et] = true;
      });
    }

    // Per-type stroke colors for the node icon outlines
    var STROKE = { Class:"#555", Individual:"#999", Literal:"#6a9", Datatype:"#6a9", "SHACL Shape":"#0891b2" };

    var html = '<div class="ov-overlay-head"><span>Legend</span><button class="ov-overlay-close" data-oi-onclick="this.closest(\'.ov-legend-overlay\').style.display=\'none\'">&times;</button></div>';
    html += '<div class="ov-overlay-body"><div class="ov-overlay-cols">';

    // Nodes
    html += '<div class="ov-overlay-col"><div class="ov-overlay-col-title">Nodes</div>';
    Object.keys(usedTypes).forEach(function(t) {
      var fill = usedTypes[t] || "#FDFDC8";
      var stroke = STROKE[t] || "#555";
      // Prefer live shape (from cytoscape) so Edit Layout customizations are reflected
      var shape = (live && live.typeShapes[t]) || (t === "Class" ? "rectangle" : t === "Literal" || t === "Individual" ? "ellipse" : "rectangle");
      var extra = (t === "Literal") ? ' stroke-dasharray="2,1"' : "";
      html += '<div class="ov-oentry"><svg width="18" height="13">' + shapeIconSvg(shape, fill, stroke, extra) + '</svg><span>' + esc(t) + '</span></div>';
    });
    html += '</div>';

    // Edges — read color / dash / arrow from live styles when available
    html += '<div class="ov-overlay-col"><div class="ov-overlay-col-title">Edges</div>';
    Object.keys(usedEdge).forEach(function(t) {
      var def = EDGE_LEGEND_DEFAULTS[t] || { l:t, c:"#999", lineStyle:"solid", filled:true, bold:false };
      var color = (live && live.edgeColors[t]) || def.c;
      var ls = (live && live.edgeLineStyles[t]) || def.lineStyle;
      var arrow = (live && live.edgeArrows[t]) || "triangle";
      var dash = ls === "dashed" ? "4,2" : ls === "dotted" ? "1,2" : "";
      var da = dash ? ' stroke-dasharray="'+dash+'"' : '';
      // Render the live arrow shape (tee/vee/diamond/…) rather than a fixed
      // triangle, so Edit-Layout pointer changes are reflected. The connecting
      // line runs full-width when the edge has no arrowhead.
      var lineEnd = (arrow === "none") ? 32 : 22;
      html += '<div class="ov-oentry"><svg width="34" height="12"><line x1="0" y1="6" x2="'+lineEnd+'" y2="6" stroke="'+color+'" stroke-width="'+(def.bold?2.5:1.5)+'"'+da+'/>'+arrowIconSvg(arrow, color, def.filled)+'</svg><span>'+esc(def.l)+'</span></div>';
    });
    html += '</div></div></div>';
    el.innerHTML = html;
    el.style.display = "";
    makeDraggable(el);
  }

  function buildNsOverlay(container, data) {
    var el = container.querySelector(".ov-ns-overlay");
    if (!el) return;
    if (container.getAttribute("data-show-ns") === "false") { el.style.display = "none"; return; }

    var activeNs = data.activeNamespaces || {};
    var allNs = data.namespaces || {};
    var activeKeys = Object.keys(activeNs).sort();
    var allKeys = Object.keys(allNs).sort();
    if (activeKeys.length === 0 && allKeys.length === 0) { el.style.display = "none"; return; }

    var cid = container.id;
    var hasHidden = allKeys.length > activeKeys.length;
    var html = '<div class="ov-overlay-head"><span>Prefixes</span>';
    if (hasHidden) html += '<button class="ov-ns-toggle" data-oi-onclick="ontoink.toggleAllNs(\'' + cid + '\')">Show all</button>';
    html += '<button class="ov-overlay-close" data-oi-onclick="this.closest(\'.ov-ns-overlay\').style.display=\'none\'">&times;</button></div>';
    html += '<div class="ov-overlay-body"><div class="ov-ns-tags">';
    activeKeys.forEach(function(p) { html += '<span class="ov-ns-tag"><b>' + esc(p) + ':</b> ' + esc(activeNs[p]) + '</span>'; });
    if (hasHidden) {
      html += '<span class="ov-ns-all" style="display:none;">';
      allKeys.forEach(function(p) { if (!activeNs[p]) html += '<span class="ov-ns-tag ov-ns-dim"><b>' + esc(p) + ':</b> ' + esc(allNs[p]) + '</span>'; });
      html += '</span>';
    }
    html += '</div></div>';
    el.innerHTML = html;
    el.style.display = "";
    makeDraggable(el);
  }

  // ── Init Graph ──────────────────────────────────────────────────────────

  function initGraph(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;
    var b64 = container.getAttribute("data-ontoink-graph");
    if (!b64) return;
    // atob() returns a binary (Latin-1) string. Our JSON is UTF-8, so a
    // raw atob() splits each multi-byte glyph (e.g. the ∃/∀/≥/≤ operators
    // used in OWL restriction labels) into one tofu character per byte.
    // Decode the byte sequence as UTF-8 before JSON.parse.
    var data;
    try {
      var binStr = atob(b64);
      var bytes = new Uint8Array(binStr.length);
      for (var i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
      data = JSON.parse(new TextDecoder("utf-8").decode(bytes));
    } catch(e) { return; }
    var canvas = container.querySelector(".ov-canvas");
    if (!canvas) return;

    var cy = cytoscape({
      container: canvas,
      elements: { nodes: data.nodes, edges: data.edges },
      style: [
        { selector: "node", style: { "label":"data(label)","background-color":"data(color)","shape":"data(shape)","text-valign":"center","text-halign":"center","width":"label","height":"label","padding":"14px","font-size":"12px","font-family":"'Inter','Segoe UI',system-ui,sans-serif","text-wrap":"wrap","text-max-width":"160px","border-width":1,"border-color":"#aaa","border-opacity":0.6,"color":"#222" }},
        { selector: 'node[type="Class"]', style: { "font-weight":"600","border-width":2,"border-color":"#666","shape":"rectangle" }},
        { selector: 'node[type="Individual"]', style: { "shape":"ellipse" }},
        { selector: 'node[type="Literal"]', style: { "shape":"ellipse","font-style":"italic","font-size":"11px","border-style":"dashed","border-color":"#6a9" }},
        { selector: 'node[type="Datatype"]', style: { "shape":"diamond" }},
        { selector: 'node[type="SHACL Shape"]', style: { "shape":"round-rectangle","border-color":"#0891b2" }},
        // v0.7.0 — SuperNode gets a chunkier hexagon + double border so
        // it reads as a "container" node. Label mapper appends the member
        // count (e.g. "People and Addresses  ·  42") so the cluster size
        // is legible without a hover.
        { selector: 'node[?isSuperNode]', style: {
            "label": function(ele) {
              var n = ele.data("memberCount");
              var lab = ele.data("label") || "";
              return n ? (lab + "  ·  " + n) : lab;
            },
            "shape":"hexagon",
            // honour a per-node colour when set (distinct cluster hues); the
            // light default keeps legacy build-time super-nodes looking the same.
            "background-color": function(ele) { return ele.data("color") || "#e0f2fe"; },
            "border-width":3,
            "border-color":"#0891b2",
            "border-style":"double",
            "font-weight":"700",
            "font-size":"13px",
            "text-outline-width":2,
            "text-outline-color":"#fff",
            "padding":"18px",
            "text-max-width":"200px"
        }},
        { selector: 'node[?isSuperNode]:selected', style: { "border-color":"#0e7490","border-width":4 }},
        // v0.7.3 — ClusterHull compound parent for expanded clusters.
        // Dashed rounded rectangle that visually contains its members;
        // header label at top says "<title> · N · click header to
        // collapse". Draggable as a whole (Cytoscape's built-in
        // compound behavior), and tappable on border/header to trigger
        // collapse (see the tap wiring at ~line 2260).
        { selector: 'node[?isClusterHull]', style: {
          "shape":"round-rectangle","background-color":"#f0f9ff","background-opacity":0.35,
          "border-width":2,"border-style":"dashed","border-color":"#0891b2",
          "label":"data(label)","text-valign":"top","text-halign":"center","text-margin-y":-6,
          "font-weight":"700","font-size":"12px","color":"#0e7490",
          "text-background-color":"#e0f2fe","text-background-opacity":0.95,"text-background-padding":"4px",
          "text-background-shape":"round-rectangle","padding":"22px",
          "compound-sizing-wrt-labels":"include"
        }},
        { selector: 'node[?isClusterHull]:selected', style: { "border-color":"#0e7490","border-width":3,"background-color":"#dbeafe" }},
        // Nested compound box inside a cluster (e.g. a category holding its
        // instances). Coloured, labelled container; label sits at the top so it
        // doesn't overlap the members. Colour comes from data(color).
        { selector: 'node[?isCategoryBox]', style: {
          "shape":"round-rectangle",
          "background-color": function(ele) { return ele.data("color") || "#94a3b8"; },
          "background-opacity":0.10,
          "border-width":2,"border-style":"dashed",
          "border-color": function(ele) { return ele.data("color") || "#64748b"; },
          "label":"data(label)","text-valign":"top","text-halign":"center","text-margin-y":-4,
          "font-weight":"700","font-size":"12px",
          "color": function(ele) { return ele.data("color") || "#334155"; },
          "text-background-color":"#ffffff","text-background-opacity":0.9,
          "text-background-padding":"3px","text-background-shape":"round-rectangle",
          "padding":"16px","compound-sizing-wrt-labels":"include"
        }},
        // v0.7.4 — Blank-node styling. rdflib emits blank subjects as
        // "_:bN..." — they aren't real Individuals no matter what
        // ttl_parser tags them. `_flagBlankNodes` stamps `isBlankNode:true`
        // on init; the style below matches that flag reliably (avoiding
        // the escape-sensitive `[id ^= "_:"]` attribute-prefix selector).
        { selector: 'node[?isBlankNode]', style: {
          "background-color":"#f3f4f6","border-style":"dashed","border-color":"#9ca3af",
          "color":"#6b7280","font-style":"italic","opacity":0.7,
          "shape":"round-diamond","width":24,"height":24
        }},
        // v0.7.3 — Fanned super-edges: when multiple originals collapse
        // into one boundary edge, `data.weight > 1`. Widen the line
        // proportionally (mapData → 3..12 px) and paint it a distinct
        // "bundle" purple so users can tell "45 relations" apart from
        // a single relation. The `data.fan` array powers the hover
        // popup at buildEdgePopup.
        { selector: 'edge[?clusterManaged][weight > 1]', style: {
          "width": "mapData(weight, 1, 40, 3, 12)",
          "line-color":"#7c3aed","target-arrow-color":"#7c3aed","source-arrow-color":"#7c3aed",
          "color":"#5b21b6","font-weight":"700","font-size":"12px",
          "text-background-color":"#ede9fe","text-background-opacity":0.95,"text-background-padding":"3px"
        }},
        { selector: "node:selected", style: { "border-width":3,"border-color":"#0891b2" }},
        { selector: "edge[edgeType='object-property']", style: { "label":"data(label)","curve-style":"bezier","target-arrow-shape":"triangle","target-arrow-fill":"filled","source-arrow-shape":"circle","source-arrow-fill":"filled","line-color":"#2563eb","target-arrow-color":"#2563eb","source-arrow-color":"#2563eb","width":2,"font-size":"10px","text-rotation":"autorotate","text-margin-y":-10,"color":"#2563eb","text-background-color":"#fff","text-background-opacity":0.9,"text-background-padding":"2px","font-family":"'Inter','Segoe UI',system-ui,sans-serif" }},
        { selector: "edge[edgeType='data-property']", style: { "label":"data(label)","curve-style":"bezier","target-arrow-shape":"triangle","target-arrow-fill":"hollow","source-arrow-shape":"circle","source-arrow-fill":"hollow","line-color":"#16a34a","target-arrow-color":"#16a34a","source-arrow-color":"#16a34a","width":1.5,"font-size":"10px","text-rotation":"autorotate","text-margin-y":-10,"color":"#16a34a","text-background-color":"#fff","text-background-opacity":0.9,"text-background-padding":"2px","font-family":"'Inter','Segoe UI',system-ui,sans-serif" }},
        { selector: "edge[edgeType='rdf-type']", style: { "label":"data(label)","curve-style":"bezier","target-arrow-shape":"triangle","target-arrow-fill":"hollow","line-style":"dashed","line-color":"#9ca3af","target-arrow-color":"#9ca3af","width":1,"font-size":"9px","text-rotation":"autorotate","text-margin-y":-10,"color":"#888","text-background-color":"#fff","text-background-opacity":0.9,"text-background-padding":"2px","font-family":"'Inter','Segoe UI',system-ui,sans-serif" }},
        { selector: "edge[edgeType='subclass']", style: { "label":"data(label)","curve-style":"bezier","target-arrow-shape":"triangle","target-arrow-fill":"filled","line-color":"#374151","target-arrow-color":"#374151","width":2,"font-size":"9px","text-rotation":"autorotate","text-margin-y":-10,"color":"#555","text-background-color":"#fff","text-background-opacity":0.9,"text-background-padding":"2px","font-family":"'Inter','Segoe UI',system-ui,sans-serif" }},
        { selector: "edge[edgeType='shacl-constraint']", style: { "label":"data(label)","curve-style":"bezier","target-arrow-shape":"triangle","target-arrow-fill":"filled","line-style":"dashed","line-color":"#0891b2","target-arrow-color":"#0891b2","width":3,"font-size":"11px","font-weight":"bold","text-rotation":"autorotate","text-margin-y":-12,"color":"#0891b2","text-background-color":"#fff","text-background-opacity":0.95,"text-background-padding":"3px","font-family":"'Inter','Segoe UI',system-ui,sans-serif" }},
        { selector: "edge[edgeType='owl-restriction']", style: { "label":"data(label)","curve-style":"bezier","target-arrow-shape":"triangle","target-arrow-fill":"filled","line-style":"dashed","line-color":"#a855f7","target-arrow-color":"#a855f7","width":2,"font-size":"11px","font-weight":"bold","text-rotation":"autorotate","text-margin-y":-12,"color":"#a855f7","text-background-color":"#fff","text-background-opacity":0.95,"text-background-padding":"3px","font-family":"'Inter','Segoe UI',system-ui,sans-serif" }},
        { selector: "edge[edgeType='owl-restriction'][owlVia='equivalentClass']", style: { "target-arrow-shape":"diamond","target-arrow-fill":"hollow" }},
        { selector: "edge[edgeType='owl-restriction'][source = target]", style: { "curve-style":"bezier","control-point-step-size":40 }},
        { selector: "edge[edgeType='inferred']", style: { "label":"data(label)","curve-style":"bezier","target-arrow-shape":"triangle","target-arrow-fill":"filled","line-style":"dotted","line-color":"#a855f7","target-arrow-color":"#a855f7","width":1.5,"font-size":"9px","text-rotation":"autorotate","text-margin-y":-10,"color":"#a855f7","text-background-color":"#fff","text-background-opacity":0.9,"text-background-padding":"2px","font-family":"'Inter','Segoe UI',system-ui,sans-serif","opacity":0.75 }},
        { selector: "node[?inferred]", style: { "opacity":0.7,"border-style":"dotted","border-color":"#a855f7","border-width":2 }},
      ],
      layout: { name:"dagre", rankDir:"BT", nodeSep:60, rankSep:80, edgeSep:20, animate:false, fit:true, padding:30 },
      // v0.7.4 — Viewport optimizations for large ontologies. On pan/zoom
      // over hundreds of edges Cytoscape's canvas renderer thrashes; these
      // flags trade visual detail for interactivity: edges + labels hide
      // during motion, and the whole scene is bitmap-cached to a texture.
      // wheelSensitivity 0.15 gives finer-grained zoom control — the old
      // 0.3 skipped past the sweet spot on trackpads.
      wheelSensitivity: 0.15, minZoom: 0.05, maxZoom: 8,
      hideEdgesOnViewport: true,
      hideLabelsOnViewport: true,
      textureOnViewport: true,
      pixelRatio: 1,
    });

    instances[containerId] = {
      cy: cy, data: data, editor: null, originalTtl: data.rawTtl || "",
      sideStore: null,
      attic: new Map(),
      // Default: show EVERYTHING (L6) on small graphs — small examples
      // like /examples/foaf-person/ must render identically to pre-0.7.0.
      // Only "big" graphs (≥ 500 nodes) auto-collapse to L0 so the first
      // paint doesn't overwhelm; users can still drag right for more.
      // Authors can override with a fence YAML `lod: N`.
      lodLevel: (data.lod_default != null) ? data.lod_default
                : ((data.nodes && data.nodes.length >= 500) ? 0 : 6),
      policy: {
        hide_at_level: data.lod_hide_at_level || {},
        node_badges: data.node_badges || {},
        // hide/fold/badge lists only populated when SPARQL wants to re-fold
        hide: [], fold: [], badge: []
      },
      expandedSuperNodes: new Set(),
      showSuperNodes: true,
      _nodeBadgesRendered: new Set()
    };
    // Big-ontology bootstrap: side-store + auto-cluster + facets + LOD settlement.
    // loadSideStore first — it only fills sideStore if a build-time Leiden
    // blob was shipped (v0.7.3 wires cluster.py at build time when the
    // ontoink[cluster] extras are installed). If it comes back empty, the
    // browser-side namespace clusterer takes over so "Group" is meaningful.
    loadSideStore(containerId);
    _flagBlankNodes(cy);
    _autoClusterByNamespace(containerId);
    _buildFacets(instances[containerId]);
    // v0.7.3 — Position cache (#4). Reuse positions from a previous
    // open so second visits skip the dagre stall. Key = djb2 hash of
    // the base64 graph blob (stable per TTL). If nothing cached, we
    // persist positions on layoutstop below.
    try {
      var _cacheSrc = container.getAttribute("data-ontoink-graph") || "";
      instances[containerId]._posCacheKey = _posCacheKeyFor(_cacheSrc);
      var _cached = _positionsLoad(instances[containerId]._posCacheKey);
      if (_cached) _applyCachedPositions(cy, _cached);
      _wirePositionCache(cy, function() { return instances[containerId] && instances[containerId]._posCacheKey; });
    } catch (e) {}
    setLodLevel(containerId, instances[containerId].lodLevel);
    // v0.7.3 — open the metrics splash for big fence-side ontologies too
    // (#38). Author can suppress via ``metrics_splash: false`` in fence
    // YAML if they've placed the fence in a static docs page context.
    if (data.nodes && data.nodes.length >= 500 && data.metrics_splash !== false) {
      try { openMetricsSplash(containerId); } catch (e) {}
    }

    function wirePopup(popup, d) {
      popup.querySelector(".ov-popup-close").addEventListener("click",function(){popup.remove();});
      popup.querySelectorAll(".ov-chip").forEach(function(b){
        b.addEventListener("click",function(){
          if(b.classList.contains("ov-deref-btn")) { derefIri(b.dataset.iri, b); return; }
          copyText(b.dataset.action==="copy-iri"?d.iri:d.label,b);
        });
      });
      // Collapsible sections — match toggle to list by data-section attribute
      popup.querySelectorAll(".ov-popup-toggle").forEach(function(tog){
        tog.addEventListener("click",function(){
          var sec=tog.dataset.section;
          var tgt=popup.querySelector('.ov-collapsible[data-section="'+sec+'"]');
          if(!tgt)return;
          var open=tgt.style.display!=="none";
          tgt.style.display=open?"none":"block";
          var arrow=tog.querySelector(".ov-toggle-arrow");
          if(arrow)arrow.textContent=open?"\u25B6":"\u25BC";
        });
      });
      makePopupDraggable(popup);
    }
    // v0.7.0 — super-node tap: expand/collapse instead of showing the
    // generic popup. Bound BEFORE the generic 'node' handler so Cytoscape
    // fires the more-specific selector first; we stopPropagation() to
    // keep the generic handler off.
    cy.on("tap", 'node[?isSuperNode]', function(evt) {
      removePopup(container);
      var n = evt.target;
      var inst2 = instances[containerId];
      if (!inst2) return;
      if (!inst2.expandedSuperNodes) inst2.expandedSuperNodes = new Set();
      if (inst2.expandedSuperNodes.has(n.id())) collapseSuperNode(containerId, n.id());
      else                                       expandSuperNode(containerId, n.id());
      evt.stopPropagation();
    });
    // v0.7.3 — ClusterHull tap: collapse the cluster it wraps. The header
    // label already reads "click header to collapse" so this is the
    // discoverable affordance we promised. `evt.target` is the parent
    // only when the user hit the border/header/padding — clicks on child
    // members fire on the child (member data.parent === hullId doesn't
    // interfere). Cytoscape's compound-node hit-testing gives us this
    // out of the box.
    cy.on("tap", 'node[?isClusterHull]', function(evt) {
      removePopup(container);
      var cid = evt.target.data("clusterId");
      if (cid) collapseSuperNode(containerId, cid);
      evt.stopPropagation();
    });
    cy.on("tap", "node", function(evt) {
      // Don't double-fire for super-nodes or hulls (the selectors above
      // already handled them).
      if (evt.target.data("isSuperNode")) return;
      if (evt.target.data("isClusterHull")) return;
      removePopup(container);
      var d=evt.target.data(), pos=evt.renderedPosition;
      var popup=document.createElement("div"); popup.className="ov-popup"; popup.innerHTML=buildPopup(d,cy);
      var cR=canvas.getBoundingClientRect(), pR=container.getBoundingClientRect();
      popup.style.left=(cR.left-pR.left+pos.x+15)+"px"; popup.style.top=(cR.top-pR.top+pos.y-15)+"px";
      container.appendChild(popup);
      requestAnimationFrame(function(){var r=popup.getBoundingClientRect();if(r.right>pR.right-10)popup.style.left=(parseFloat(popup.style.left)-r.width-30)+"px";if(r.bottom>pR.bottom-10)popup.style.top=(parseFloat(popup.style.top)-r.height)+"px";});
      wirePopup(popup, d);
    });
    cy.on("tap", "edge", function(evt) {
      removePopup(container);
      var d=evt.target.data(), midpoint=evt.target.midpoint();
      var zoom = cy.zoom(), pan = cy.pan();
      var rx = midpoint.x * zoom + pan.x, ry = midpoint.y * zoom + pan.y;
      var popup=document.createElement("div"); popup.className="ov-popup"; popup.innerHTML=buildEdgePopup(d,cy);
      var cR=canvas.getBoundingClientRect(), pR=container.getBoundingClientRect();
      popup.style.left=(cR.left-pR.left+rx+15)+"px"; popup.style.top=(cR.top-pR.top+ry-15)+"px";
      container.appendChild(popup);
      requestAnimationFrame(function(){var r=popup.getBoundingClientRect();if(r.right>pR.right-10)popup.style.left=(parseFloat(popup.style.left)-r.width-30)+"px";if(r.bottom>pR.bottom-10)popup.style.top=(parseFloat(popup.style.top)-r.height)+"px";});
      wirePopup(popup, d);
    });
    cy.on("tap", function(e) { if(e.target===cy) removePopup(container); });

    buildLegendOverlay(container, data);
    buildNsOverlay(container, data);
    initMinimap(containerId, cy);
    autoFocusLargeGraph(instances[containerId], containerId);

    var ta = container.querySelector(".ov-editor-textarea");
    if (ta && data.rawTtl) ta.value = data.rawTtl;
    // SHACL shapes editor (parallel to the data editor). The shapes file
    // arrives via data.shapeTtl from parse_ttl_to_cytoscape; if there's
    // no shapes file, leave the pane empty and let the user type some.
    var sta = container.querySelector(".ov-editor-shapes-textarea");
    if (sta && data.shapeTtl) sta.value = data.shapeTtl;
    if (data.validation) { var o=container.querySelector(".ov-validation-output"); if(o) renderValidation(o,data.validation); }

    // Auto-fetch ontology data for all namespaces used in the graph (fire-and-forget)
    setTimeout(function() { autoDerefNamespaces(instances[containerId]); }, 500);
  }

  // ── Editor ──────────────────────────────────────────────────────────────

  function toggleEditor(id) {
    var c=document.getElementById(id),p=c.querySelector(".ov-editor-panel"),inst=instances[id]; if(!p)return;
    var v=p.style.display!=="none"; p.style.display=v?"none":"block";
    if(!v){
      // First-time open: seed both textareas with the current TTL +
      // shapes so the playground path (which never runs the fence-side
      // initialiser) and any other late-bound container shows real
      // content. Skip whichever textarea was pre-filled by the fence
      // renderer.
      var ta=c.querySelector(".ov-editor-textarea");
      if(ta&&!ta.value&&inst&&inst.originalTtl) ta.value=inst.originalTtl;
      var sta=c.querySelector(".ov-editor-shapes-textarea");
      if(sta&&!sta.value&&inst&&(inst.originalShapeTtl||(inst.data&&inst.data.shapeTtl))) {
        sta.value = inst.originalShapeTtl || inst.data.shapeTtl;
      }
      if(typeof CodeMirror!=="undefined"){
        if(!inst.editor&&ta){
          inst.editor=CodeMirror.fromTextArea(ta,{mode:"turtle",lineNumbers:true,lineWrapping:true,theme:"default",viewportMargin:Infinity});
          inst.editor.setSize(null,"280px");
        }
        if(!inst.shapeEditor&&sta){
          inst.shapeEditor=CodeMirror.fromTextArea(sta,{mode:"turtle",lineNumbers:true,lineWrapping:true,theme:"default",viewportMargin:Infinity});
          inst.shapeEditor.setSize(null,"280px");
        }
      }
    }
  }
  function getEditorValue(id) { var i=instances[id]; if(!i)return""; if(i.editor)return i.editor.getValue(); var t=document.getElementById(id).querySelector(".ov-editor-textarea"); return t?t.value:""; }
  function getShapesValue(id) { var i=instances[id]; if(!i)return""; if(i.shapeEditor)return i.shapeEditor.getValue(); var t=document.getElementById(id).querySelector(".ov-editor-shapes-textarea"); return t?t.value:""; }
  // Shapes to validate against: the shapes editor pane if it has content,
  // otherwise the originally-loaded shapes (inst.data.shapeTtl). Makes validation
  // work even when the editor pane wasn't opened/seeded — e.g. the playground
  // loads shapes via ?shape= and the user clicks Validate before (or without)
  // the pane being populated by the CodeMirror editor.
  function validationShapes(id) {
    var s = getShapesValue(id);
    if (s && s.trim()) return s;
    var i = instances[id];
    return (i && i.data && i.data.shapeTtl) || "";
  }

  // ── Validation ──────────────────────────────────────────────────────────

  // Re-extract SHACL property constraints from a triple list. Supports
  // the named-shape pattern: ``ex:Shape a sh:NodeShape ; sh:targetClass
  // foo:Bar ; sh:property ex:PropShape . ex:PropShape sh:path foo:p ;
  // sh:minCount 1 .`` Inline blank-node property shapes (``[ sh:path
  // ... ]``) aren't supported because the minimal TTL parser doesn't
  // expand brackets — but the fallback chain handles that case by
  // returning the build-time ``inst.data.shacl`` array.
  function extractShaclFromTriples(triples) {
    var SH = "http://www.w3.org/ns/shacl#";
    var bySubj = {};
    function bag(s) { if (!bySubj[s]) bySubj[s] = { properties: [] }; return bySubj[s]; }
    function lit(o) {
      if (typeof o !== "string" || o[0] !== '"') return o;
      var e = o.lastIndexOf('"'); return e > 0 ? o.substring(1, e) : o;
    }
    triples.forEach(function(t) {
      if (t.p === SH + "targetClass") bag(t.s).targetClass = t.o;
      else if (t.p === SH + "path")     bag(t.s).path = t.o;
      else if (t.p === SH + "minCount") bag(t.s).minCount = parseInt(lit(t.o), 10);
      else if (t.p === SH + "maxCount") bag(t.s).maxCount = parseInt(lit(t.o), 10);
      else if (t.p === SH + "message")  bag(t.s).message = lit(t.o);
      else if (t.p === SH + "property") bag(t.s).properties.push(t.o);
    });
    var out = [];
    Object.keys(bySubj).forEach(function(s) {
      var ns = bySubj[s];
      if (!ns.targetClass) return;
      // Case 1: target shape carries the property constraint itself.
      if (ns.path) {
        out.push({ targetClass: ns.targetClass, path: ns.path,
                   minCount: ns.minCount != null ? ns.minCount : null,
                   maxCount: ns.maxCount != null ? ns.maxCount : null,
                   message: ns.message || "", pathLabel: ns.path });
      }
      // Case 2: indirection via sh:property → another (named) shape.
      ns.properties.forEach(function(p) {
        var ps = bySubj[p] || {};
        if (!ps.path) return;
        out.push({ targetClass: ns.targetClass, path: ps.path,
                   minCount: ps.minCount != null ? ps.minCount : null,
                   maxCount: ps.maxCount != null ? ps.maxCount : null,
                   message: ps.message || "", pathLabel: ps.path });
      });
    });
    return out;
  }

  // ── SHACL validation ──────────────────────────────────────────────────
  //
  // Full SHACL (Core + SPARQL) runs in the browser via the vendored
  // rdf-validate-shacl bundle (demo/docs/assets/shacl/shacl.mjs), loaded
  // same-origin. If that bundle can't be loaded (e.g. an old deploy that
  // predates it), validate() falls back to validateMinimal() — the
  // cardinality-only checker that needs no bundle.
  var _shaclValidatorPromise = null;
  function loadShaclValidator() {
    if (_shaclValidatorPromise) return _shaclValidatorPromise;
    var base = (typeof window !== "undefined" && window.ONTOINK_ASSET_BASE) || "/assets/";
    _shaclValidatorPromise = import(base + "shacl/shacl.mjs").catch(function(e) {
      _shaclValidatorPromise = null;   // clear memo so a later attempt can retry
      throw e;
    });
    return _shaclValidatorPromise;
  }

  // Run the full engine and map its report onto the existing renderValidation
  // shape. Shapes are searched in BOTH the shapes pane and the data graph
  // (a diagram may define shapes inline in either), matching the old combined
  // behaviour; the data graph for target selection is dataTtl alone.
  function runShaclValidation(outEl, dataTtl, shapesTtl, withReasoning) {
    return loadShaclValidator().then(function(mod) {
      var shapesGraph = (shapesTtl || "") + "\n" + (dataTtl || "");
      var r = mod.validate(dataTtl || "", shapesGraph);
      var violations = (r.results || []).map(function(x) {
        return { focusNode: x.focusNode, path: x.path, severity: x.severity,
                 message: x.message || (x.component ? x.component.split(/[#/]/).pop() : "Constraint violated") };
      });
      var suffix = withReasoning ? " (with inferences)." : ".";
      var report = r.conforms
        ? "All constraints satisfied" + suffix
        : violations.length + " violation(s) found" + suffix;
      renderValidation(outEl, { conforms: r.conforms, violations: violations, report: report });
    });
  }

  function validate(id) {
    var inst = instances[id]; if (!inst) return;
    var outEl = document.getElementById(id).querySelector(".ov-validation-output"); if (!outEl) return;
    var ttl = getEditorValue(id), shapes = validationShapes(id);
    if (!(shapes && shapes.trim()) && !(inst.data.shacl || []).length) {
      renderValidation(outEl, { conforms: null, violations: [],
        report: "No SHACL shapes defined. Add a sh:NodeShape with sh:targetClass + sh:property on the right." });
      return;
    }
    renderValidation(outEl, { conforms: null, violations: [], report: "Validating…" });
    runShaclValidation(outEl, ttl, shapes, false).catch(function(err) {
      if (window.console) console.warn("ontoink: full SHACL bundle unavailable, using minimal checker —", (err && err.message) || err);
      validateMinimal(id, false);
    });
  }

  // Cardinality-only fallback (sh:targetClass + sh:min/maxCount, named-shape
  // pattern only). Used when the full SHACL bundle fails to load.
  function validateMinimal(id, withReasoning) {
    var inst = instances[id]; if (!inst) return;
    var outEl = document.getElementById(id).querySelector(".ov-validation-output"); if (!outEl) return;
    var ttl = getEditorValue(id), shapes = validationShapes(id);
    var combinedTtl = (ttl || "") + "\n" + (shapes || "");
    if (withReasoning) {
      (inst.data.inferred || []).forEach(function(t) {
        combinedTtl += "\n" + (t.isLiteral ? ("<" + t.s + "> <" + t.p + "> " + JSON.stringify(t.o) + " .")
                                            : ("<" + t.s + "> <" + t.p + "> <" + t.o + "> ."));
      });
    }
    var parsed = parseTtlMinimal(combinedTtl), triples = parsed.triples;
    var sc = extractShaclFromTriples(triples);
    if (!sc.length) sc = inst.data.shacl || [];
    if (!sc.length) {
      renderValidation(outEl, { conforms: null, violations: [],
        report: "No SHACL shapes defined. Add a sh:NodeShape with sh:targetClass + sh:property → sh:path/minCount/maxCount on the right." });
      return;
    }
    var violations = [];
    sc.forEach(function(c){
      if(!c.targetClass||!c.path)return;
      var ti=[];
      triples.forEach(function(t){if(t.p==="http://www.w3.org/1999/02/22-rdf-syntax-ns#type"&&t.o===c.targetClass)ti.push(t.s);});
      if(!ti.length)triples.forEach(function(t){if(t.p==="http://www.w3.org/1999/02/22-rdf-syntax-ns#type")triples.forEach(function(t2){if(t2.s===t.o&&t2.p==="http://www.w3.org/2000/01/rdf-schema#subClassOf"&&t2.o===c.targetClass)ti.push(t.s);});});
      ti.forEach(function(focus){var cnt=0;triples.forEach(function(t){if(t.s===focus&&t.p===c.path)cnt++;});
        if(c.minCount!=null&&cnt<c.minCount)violations.push({focusNode:focus,path:c.path,message:c.message||("Expected min "+c.minCount+" for "+(c.pathLabel||c.path)+", found "+cnt)});
        if(c.maxCount!=null&&cnt>c.maxCount)violations.push({focusNode:focus,path:c.path,message:c.message||("Expected max "+c.maxCount+" for "+(c.pathLabel||c.path)+", found "+cnt)});
      });
    });
    var suffix = withReasoning ? " (with inferences)." : ".";
    var summary = violations.length
      ? violations.length + " violation(s) found across " + sc.length + " constraint(s)" + suffix
      : "All " + sc.length + " constraint(s) satisfied" + suffix;
    renderValidation(outEl, { conforms: !violations.length, violations: violations, report: summary });
  }
  function renderValidation(el,r){
    if(r.conforms===null){el.innerHTML='<div class="ov-val-info">'+esc(r.report)+'</div>';return;}
    var h=r.conforms?'<div class="ov-val-pass"><span class="ov-val-icon">&#x2714;</span> Conforms</div>':'<div class="ov-val-fail"><span class="ov-val-icon">&#x2718;</span> '+esc(r.report)+'</div>';
    if(!r.conforms){h+='<ul class="ov-val-list">';(r.violations||[]).forEach(function(v){h+='<li><strong>'+esc((v.focusNode||"").split("/").pop().split("#").pop())+'</strong>: '+esc(v.message)+'</li>';});h+='</ul>';}
    el.innerHTML=h;
  }

  // ── TTL Parser ──────────────────────────────────────────────────────────

  function parseTtlMinimal(ttl){var pf={},tr=[];var re=/@prefix\s+([\w-]*)\s*:\s*<([^>]+)>\s*\./g,m;while((m=re.exec(ttl))!==null)pf[m[1]]=m[2];
    function res(t){t=t.trim();if(t[0]==="<"&&t[t.length-1]===">")return t.slice(1,-1);if(t==="a")return"http://www.w3.org/1999/02/22-rdf-syntax-ns#type";var ci=t.indexOf(":");if(ci>=0){var p=t.substring(0,ci);if(pf[p]!==undefined)return pf[p]+t.substring(ci+1);}return t;}
    var lines=ttl.split("\n").map(function(l){var inA=false;for(var i=0;i<l.length;i++){if(l[i]==="<")inA=true;if(l[i]===">")inA=false;if(l[i]==="#"&&!inA)return l.substring(0,i);}return l;});
    var cl=lines.join("\n").replace(/@prefix[^.]*\.\s*/g,"").replace(/@base[^.]*\.\s*/g,"");
    // Split on statement-ending "." while respecting quoted strings
    var stmts=[],cur="",inQ=false,esc=false;
    for(var si=0;si<cl.length;si++){var ch=cl[si];
      if(esc){cur+=ch;esc=false;continue;}
      if(ch==="\\"&&inQ){cur+=ch;esc=true;continue;}
      if(ch==='"'){inQ=!inQ;cur+=ch;continue;}
      if(!inQ&&ch==="."&&(si===cl.length-1||/\s/.test(cl[si+1])||cl[si+1]===undefined)){if(cur.trim())stmts.push(cur.trim());cur="";continue;}
      cur+=ch;}
    if(cur.trim())stmts.push(cur.trim());
    stmts.forEach(function(st){if(!st)return;var tk=tokenize(st);if(tk.length<3)return;var s=res(tk[0]),i=1;
      while(i<tk.length-1){var p=res(tk[i]);i++;while(i<tk.length){var o=tk[i];i++;if(o===";")break;if(o===",")continue;tr.push({s:s,p:p,o:res(o)});if(i<tk.length&&tk[i]===","){i++;continue;}if(i<tk.length&&tk[i]===";"){i++;break;}}}});
    return{triples:tr,prefixes:pf};}
  function tokenize(t){var tk=[],i=0;while(i<t.length){while(i<t.length&&/\s/.test(t[i]))i++;if(i>=t.length)break;
    if(t[i]==="<"){var e=t.indexOf(">",i);if(e<0)e=t.length-1;tk.push(t.substring(i,e+1));i=e+1;}
    else if(t[i]==='"'){var j=i+1;while(j<t.length&&t[j]!=='"'){if(t[j]==="\\")j++;j++;}j++;while(j<t.length&&(t[j]==="@"||t[j]==="^")){if(t[j]==="@"){j++;while(j<t.length&&/[a-zA-Z-]/.test(t[j]))j++;}if(j<t.length&&t[j]==="^"&&t[j+1]==="^"){j+=2;if(t[j]==="<")j=t.indexOf(">",j)+1;else while(j<t.length&&/\S/.test(t[j])&&t[j]!==";"&&t[j]!==",")j++;}}tk.push(t.substring(i,j));i=j;}
    else if(t[i]===";"||t[i]===","){tk.push(t[i]);i++;}
    else{var s=i;while(i<t.length&&!/[\s;,]/.test(t[i]))i++;tk.push(t.substring(s,i));}}return tk;}

  // ── Ontology source detection ──────────────────────────────────────────

  var OC=[["purl.obolibrary.org/obo/BFO_","BFO","#F556CB"],["purl.obolibrary.org/obo/IAO_","IAO","#F6A252"],["purl.obolibrary.org/obo/RO_","RO","#F43F5E"],["purl.obolibrary.org/obo/OBI_","OBI","#F5D5B1"],["nfdi.fiz-karlsruhe.de/ontology/","nfdicore","#7777BB"],["w3id.org/pmd/","PMD","#46CAD3"],["qudt.org/","QUDT","#C9DBFE"],["schema.org/","schema","#E8D44D"],["xmlns.com/foaf/","FOAF","#4682B4"]];
  function detectSource(u){for(var i=0;i<OC.length;i++)if(u.indexOf(OC[i][0])>=0)return{name:OC[i][1],color:OC[i][2]};return{name:"",color:"#FDFDC8"};}
  // Prefix (e.g. "ex", "ex2", "foaf") for an IRI, by longest-matching @prefix
  // namespace. Used so EVERY declared namespace — not just known ontologies —
  // is colourable in Edit Layout.
  function nsPrefix(u,pf){if(!u||u[0]==='"'||u.indexOf("http")!==0||!pf)return"";var best="",bl=-1;for(var p in pf){var ns=pf[p];if(ns&&u.indexOf(ns)===0&&ns.length>bl){best=p;bl=ns.length;}}return best;}
  function uriLabel(u,pf){if(pf){var bp="",bu="";for(var p in pf)if(u.indexOf(pf[p])===0&&pf[p].length>bu.length){bp=p;bu=pf[p];}if(bu)return bp?(bp+":"+u.substring(bu.length)):u.substring(bu.length);}var l=u.indexOf("#")>=0?u.split("#").pop():u.split("/").pop();var s=detectSource(u);return s.name?(s.name.toLowerCase()+":"+l):l;}
  function litVal(r){if(r[0]==='"'){var e=r.lastIndexOf('"');if(e>0)return r.substring(1,e);}return r;}
  function hashStr(s){var h=0;for(var i=0;i<s.length;i++)h=((h<<5)-h+s.charCodeAt(i))|0;return h;}

  // ── Blank-node-aware TTL parser + OWL restriction collapsing ─────────────
  // Unlike parseTtlMinimal, this generates ids for `[ ]` blank nodes and `( )`
  // collections and emits their inner triples, so owl:Restriction definitions
  // survive a client-side re-render (Edit & Validate → Update Graph, playground)
  // instead of exploding into stray `[`, `]`, owl:Restriction nodes. Mirrors the
  // build-time Python parser (_extract_owl_restrictions in ttl_parser.py).
  function tokenizeG(t){var tk=[],i=0;while(i<t.length){while(i<t.length&&/\s/.test(t[i]))i++;if(i>=t.length)break;var c=t[i];
    if(c==="<"){var e=t.indexOf(">",i);if(e<0)e=t.length-1;tk.push(t.substring(i,e+1));i=e+1;}
    else if(c==='"'){var j=i+1;while(j<t.length&&t[j]!=='"'){if(t[j]==="\\")j++;j++;}j++;while(j<t.length&&(t[j]==="@"||t[j]==="^")){if(t[j]==="@"){j++;while(j<t.length&&/[a-zA-Z-]/.test(t[j]))j++;}if(j<t.length&&t[j]==="^"&&t[j+1]==="^"){j+=2;if(t[j]==="<")j=t.indexOf(">",j)+1;else while(j<t.length&&/\S/.test(t[j])&&!/[;,\[\]()]/.test(t[j]))j++;}}tk.push(t.substring(i,j));i=j;}
    else if(c===";"||c===","||c==="["||c==="]"||c==="("||c===")"){tk.push(c);i++;}
    else{var s=i;while(i<t.length&&!/[\s;,\[\]()]/.test(t[i]))i++;tk.push(t.substring(s,i));}}return tk;}

  function parseTtlGraph(ttl){
    var RDFNS="http://www.w3.org/1999/02/22-rdf-syntax-ns#";
    var RF=RDFNS+"first",RR=RDFNS+"rest",RN=RDFNS+"nil",RTYPE=RDFNS+"type";
    var pf={},tr=[];var re=/@prefix\s+([\w-]*)\s*:\s*<([^>]+)>\s*\./g,m;while((m=re.exec(ttl))!==null)pf[m[1]]=m[2];
    function res(t){t=t.trim();if(t[0]==="<"&&t[t.length-1]===">")return t.slice(1,-1);if(t==="a")return RTYPE;if(t.indexOf("_:")===0)return t;var ci=t.indexOf(":");if(ci>=0){var p=t.substring(0,ci);if(pf[p]!==undefined)return pf[p]+t.substring(ci+1);}return t;}
    var lines=ttl.split("\n").map(function(l){var inA=false,inQ=false;for(var i=0;i<l.length;i++){if(l[i]==='"')inQ=!inQ;if(l[i]==="<"&&!inQ)inA=true;if(l[i]===">"&&!inQ)inA=false;if(l[i]==="#"&&!inA&&!inQ)return l.substring(0,i);}return l;});
    var cl=lines.join("\n").replace(/@prefix[^.]*\.\s*/g,"").replace(/@base[^.]*\.\s*/g,"").replace(/^\s*PREFIX[^\n]*$/gim,"");
    var stmts=[],cur="",inQ=false,esc=false;
    for(var si=0;si<cl.length;si++){var ch=cl[si];if(esc){cur+=ch;esc=false;continue;}if(ch==="\\"&&inQ){cur+=ch;esc=true;continue;}if(ch==='"'){inQ=!inQ;cur+=ch;continue;}if(!inQ&&ch==="."&&(si===cl.length-1||/\s/.test(cl[si+1])||cl[si+1]===undefined)){if(cur.trim())stmts.push(cur.trim());cur="";continue;}cur+=ch;}
    if(cur.trim())stmts.push(cur.trim());
    var bn={n:0};function fresh(){return "_:b"+(bn.n++);}
    function parseTerm(tk,pos){var t=tk[pos.i];if(t===undefined)return null;if(t==="["){pos.i++;var b=fresh();parsePO(b,tk,pos,"]");return b;}if(t==="("){pos.i++;return parseColl(tk,pos);}pos.i++;return res(t);}
    function parsePO(subj,tk,pos,endTok){while(pos.i<tk.length){var t=tk[pos.i];if(endTok&&t===endTok){pos.i++;return;}if(t===";"||t===","){pos.i++;continue;}var p=res(t);pos.i++;while(pos.i<tk.length){var ot=tk[pos.i];if(ot===";"||(endTok&&ot===endTok))break;if(ot===","){pos.i++;continue;}var o=parseTerm(tk,pos);if(o==null)break;tr.push({s:subj,p:p,o:o});}}}
    function parseColl(tk,pos){var head=null,prev=null;while(pos.i<tk.length&&tk[pos.i]!==")"){var item=parseTerm(tk,pos);if(item==null)break;var cell=fresh();tr.push({s:cell,p:RF,o:item});if(prev)tr.push({s:prev,p:RR,o:cell});else head=cell;prev=cell;}if(tk[pos.i]===")")pos.i++;if(prev)tr.push({s:prev,p:RR,o:RN});return head||RN;}
    stmts.forEach(function(st){if(!st)return;var tk=tokenizeG(st);if(tk.length<2)return;var pos={i:0};var subj=parseTerm(tk,pos);if(subj==null)return;parsePO(subj,tk,pos,null);});
    return{triples:tr,prefixes:pf};
  }

  function collapseOwlRestrictions(triples){
    var OWLNS="http://www.w3.org/2002/07/owl#",RDFNS="http://www.w3.org/1999/02/22-rdf-syntax-ns#",RDFSNS="http://www.w3.org/2000/01/rdf-schema#";
    var RTYPE=RDFNS+"type",SCOF=RDFSNS+"subClassOf",RREST=RDFNS+"rest",RFIRST=RDFNS+"first",RNIL=RDFNS+"nil";
    var OPS={someValuesFrom:"∃",allValuesFrom:"∀",hasValue:"=",cardinality:"=",minCardinality:"≥",maxCardinality:"≤",qualifiedCardinality:"=",minQualifiedCardinality:"≥",maxQualifiedCardinality:"≤"};
    var FILL=["someValuesFrom","allValuesFrom","hasValue","onClass","onDataRange"];
    var CARD=["cardinality","minCardinality","maxCardinality","qualifiedCardinality","minQualifiedCardinality","maxQualifiedCardinality"];
    function isB(x){return typeof x==="string"&&x.indexOf("_:")===0;}
    function val(s,p){for(var i=0;i<triples.length;i++)if(triples[i].s===s&&triples[i].p===p)return triples[i].o;return null;}
    function has(s,p,o){for(var i=0;i<triples.length;i++)if(triples[i].s===s&&triples[i].p===p&&triples[i].o===o)return true;return false;}
    function listNodes(h){var c={},cur=h,g=0;while(cur&&cur!==RNIL&&!c[cur]&&g++<9999){if(isB(cur))c[cur]=true;cur=val(cur,RREST);}return Object.keys(c);}
    function listItems(h){var out=[],cur=h,g=0;while(cur&&cur!==RNIL&&g++<9999){var f=val(cur,RFIRST);if(f!=null)out.push(f);cur=val(cur,RREST);}return out;}
    var axioms=[];
    [[OWLNS+"equivalentClass","equivalentClass"],[SCOF,"subClassOf"]].forEach(function(pair){
      triples.forEach(function(t){
        if(t.p!==pair[0]||!isB(t.o)||isB(t.s))return;
        if(has(t.o,RTYPE,OWLNS+"Restriction")){axioms.push({cls:t.s,restr:t.o,via:pair[1],consumed:[]});return;}
        var lst=val(t.o,OWLNS+"intersectionOf");
        if(lst!=null){var cons=[t.o].concat(listNodes(lst));listItems(lst).forEach(function(mem){if(isB(mem)&&has(mem,RTYPE,OWLNS+"Restriction"))axioms.push({cls:t.s,restr:mem,via:"subClassOf",consumed:cons});});}
      });
    });
    var seen={},edges=[],consumed={};
    axioms.forEach(function(ax){
      var key=ax.cls+"|"+ax.restr;if(seen[key])return;
      var onProp=val(ax.restr,OWLNS+"onProperty");if(onProp==null)return;
      var op=null,filler=null,card=null;
      for(var i=0;i<FILL.length;i++){var o=val(ax.restr,OWLNS+FILL[i]);if(o==null)continue;if(FILL[i]==="onClass"||FILL[i]==="onDataRange"){filler=o;continue;}op=FILL[i];filler=o;break;}
      for(var k=0;k<CARD.length;k++){var c=val(ax.restr,OWLNS+CARD[k]);if(c==null)continue;card=c;if(op==null)op=CARD[k];break;}
      if(op==null)return;
      seen[key]=true;ax.consumed.concat([ax.restr]).forEach(function(b){consumed[b]=true;});
      edges.push({source:ax.cls,predicate:onProp,op:op,opSymbol:OPS[op]||"?",via:ax.via,filler:filler,cardinality:card,isCard:CARD.indexOf(op)>=0});
    });
    // Boolean-class wrappers: an anonymous owl:Class defined by intersectionOf /
    // unionOf of NAMED classes → subClassOf edges to/from members (so the wrapper
    // isn't a stray node). intersectionOf: cls ⊑ member; unionOf: member ⊑ cls.
    var boolEdges=[];
    [OWLNS+"equivalentClass",SCOF].forEach(function(via){
      triples.forEach(function(t){
        if(t.p!==via||!isB(t.o)||isB(t.s))return;
        if(has(t.o,RTYPE,OWLNS+"Restriction"))return;
        [[OWLNS+"intersectionOf","⊓",false],[OWLNS+"unionOf","⊔",true]].forEach(function(bp){
          var lst=val(t.o,bp[0]);if(lst==null)return;
          consumed[t.o]=true;listNodes(lst).forEach(function(c){consumed[c]=true;});
          listItems(lst).forEach(function(m){
            if(isB(m))return;
            if(bp[2])boolEdges.push({sub:m,sup:t.s,op:bp[1]});
            else boolEdges.push({sub:t.s,sup:m,op:bp[1]});
          });
        });
      });
    });
    return{edges:edges,consumed:consumed,boolEdges:boolEdges};
  }

  // Push synthesized owl-restriction edges (from collapseOwlRestrictions) onto an
  // edges array, creating any missing class/filler nodes via the caller's `en`.
  function pushRestrictionEdges(rc,edges,en,pf){
    rc.edges.forEach(function(re){
      en(re.source);
      var tgt=re.source,fillerIri="";
      if(re.filler&&re.filler[0]!=='"'){fillerIri=re.filler;tgt=re.filler;en(tgt);}
      var predLabel=uriLabel(re.predicate,pf);
      var n=re.cardinality;var nClean=(n!=null&&typeof n==="string"&&n[0]==='"')?litVal(n):n;
      var label=(re.isCard&&nClean!=null)?(re.opSymbol+nClean+" "+predLabel):(re.opSymbol+" "+predLabel);
      var arrow="triangle";
      if(re.via==="equivalentClass"){label="≡ "+label;arrow="diamond";}
      edges.push({data:{id:"r_"+edges.length,source:re.source,target:tgt,label:label,iri:re.predicate,edgeType:"owl-restriction",owlOp:re.op,owlOpSymbol:re.opSymbol,owlVia:re.via,owlPredicate:re.predicate,owlFiller:fillerIri,owlCardinality:(nClean!=null?nClean:null),arrowShape:arrow}});
    });
    // Boolean-class member edges (owl:intersectionOf/unionOf) → subClassOf, labelled ⊓/⊔.
    (rc.boolEdges||[]).forEach(function(be){
      en(be.sub);en(be.sup);
      edges.push({data:{id:"r_"+edges.length,source:be.sub,target:be.sup,label:be.op,iri:"http://www.w3.org/2000/01/rdf-schema#subClassOf",edgeType:"subclass",owlBoolean:be.op}});
    });
  }

  // Meta-classes that should not become graph nodes (mirrors _IMPLICIT_TOPS in
  // ttl_parser.py). `X rdf:type owl:Class` etc. marks X's kind, not an edge.
  var OWL_CLASS_IRI = "http://www.w3.org/2002/07/owl#Class", RDFS_CLASS_IRI = "http://www.w3.org/2000/01/rdf-schema#Class";
  var IMPLICIT_TOPS = {};
  ["http://www.w3.org/2002/07/owl#Thing","http://www.w3.org/2000/01/rdf-schema#Resource",OWL_CLASS_IRI,RDFS_CLASS_IRI,"http://www.w3.org/2002/07/owl#NamedIndividual","http://www.w3.org/2002/07/owl#Ontology","http://www.w3.org/2002/07/owl#Restriction","http://www.w3.org/2002/07/owl#ObjectProperty","http://www.w3.org/2002/07/owl#DatatypeProperty","http://www.w3.org/2002/07/owl#AnnotationProperty","http://www.w3.org/1999/02/22-rdf-syntax-ns#Property"].forEach(function(u){IMPLICIT_TOPS[u]=true;});

  // ── Update Graph ───────────────────────────────────────────────────────

  function updateGraph(id){var inst=instances[id];if(!inst)return;var p=parseTtlGraph(getEditorValue(id)),tr=p.triples,pf=p.prefixes;
    var labels={},nodes={},edges=[],classes={};
    var RT="http://www.w3.org/1999/02/22-rdf-syntax-ns#type",SC="http://www.w3.org/2000/01/rdf-schema#subClassOf",RL="http://www.w3.org/2000/01/rdf-schema#label";
    var rc=collapseOwlRestrictions(tr);
    function isBn(x){return typeof x==="string"&&x.indexOf("_:")===0;}
    tr.forEach(function(t){if(t.p===RL&&t.o[0]==='"')labels[t.s]=litVal(t.o);});
    tr.forEach(function(t){if(isBn(t.s)||isBn(t.o))return;if(t.p===RT){if(t.o===OWL_CLASS_IRI||t.o===RDFS_CLASS_IRI)classes[t.s]=true;classes[t.o]=true;}if(t.p===SC){classes[t.s]=true;classes[t.o]=true;}});
    function en(u){if(nodes[u]||u[0]==='"')return;var ic=classes[u]||false,s=detectSource(u),np=nsPrefix(u,pf);nodes[u]={data:{id:u,label:labels[u]||uriLabel(u,pf),type:ic?"Class":"Individual",color:ic?s.color:"#E6E6E6",shape:ic?"rectangle":"ellipse",iri:u,source:s.name||np,namespace:np}};}
    tr.forEach(function(t){
      // Blank-node triples (owl:Restriction internals, collection cells) are
      // rendered as collapsed restriction edges below, not as raw nodes/edges.
      if(isBn(t.s)||isBn(t.o))return;
      // owl:Class / owl:Ontology / owl:ObjectProperty etc. are kinds, not nodes.
      // Skip the triple entirely; the subject still gets a node from any of its
      // other (rendered) triples or, for restriction-defined classes, from
      // pushRestrictionEdges below — matching the build-time Python parser.
      if(t.p===RT&&IMPLICIT_TOPS[t.o])return;
      if(t.p===RL){var li="lit_"+Math.abs(hashStr(t.s+t.p+t.o))%999999;if(!nodes[li])nodes[li]={data:{id:li,label:litVal(t.o),type:"Literal",color:"#93D053",shape:"ellipse",iri:"",source:"",namespace:""}};en(t.s);edges.push({data:{id:"e_"+edges.length,source:t.s,target:li,label:uriLabel(t.p,pf),iri:t.p,edgeType:"data-property"}});return;}
      en(t.s);if(t.o[0]==='"'){var li2="lit_"+Math.abs(hashStr(t.s+t.p+t.o))%999999;if(!nodes[li2])nodes[li2]={data:{id:li2,label:litVal(t.o),type:"Literal",color:"#93D053",shape:"ellipse",iri:"",source:"",namespace:""}};edges.push({data:{id:"e_"+edges.length,source:t.s,target:li2,label:uriLabel(t.p,pf),iri:t.p,edgeType:"data-property"}});}
      else{en(t.o);var et=t.p===RT?"rdf-type":t.p===SC?"subclass":"object-property";var sm=null;(inst.data.shacl||[]).forEach(function(c){if(c.path===t.p)sm=c;});
        if(sm){var cd="["+(sm.minCount!=null?sm.minCount:0)+".."+(sm.maxCount!=null?sm.maxCount:"*")+"]";edges.push({data:{id:"e_"+edges.length,source:t.s,target:t.o,label:uriLabel(t.p,pf)+" "+cd,iri:t.p,edgeType:"shacl-constraint",cardinality:cd,message:sm.message||""}});}
        else edges.push({data:{id:"e_"+edges.length,source:t.s,target:t.o,label:uriLabel(t.p,pf),iri:t.p,edgeType:et}});}
    });
    pushRestrictionEdges(rc,edges,en,pf);
    var cy=inst.cy;cy.elements().remove();cy.add(Object.values(nodes).concat(edges));
    cy.layout({name:"dagre",rankDir:"BT",nodeSep:60,rankSep:80,animate:false,fit:true,padding:30}).run();
    var c=document.getElementById(id);
    buildLegendOverlay(c,{nodes:Object.values(nodes),edges:edges,namespaces:pf,activeNamespaces:pf,shacl:inst.data.shacl});
    buildNsOverlay(c,{namespaces:pf,activeNamespaces:pf});
  }

  function resetEditor(id){var inst=instances[id];if(!inst)return;
    var c=document.getElementById(id);
    if(inst.editor)inst.editor.setValue(inst.originalTtl);else{var ta=c.querySelector(".ov-editor-textarea");if(ta)ta.value=inst.originalTtl;}
    // Reset the shapes pane too — pulls from inst.data.shapeTtl (set
    // by parse_ttl_to_cytoscape at fence-render time, or by the
    // playground entry point).
    var originalShapes = inst.originalShapeTtl || (inst.data && inst.data.shapeTtl) || "";
    if(inst.shapeEditor)inst.shapeEditor.setValue(originalShapes);
    else{var sta=c.querySelector(".ov-editor-shapes-textarea");if(sta)sta.value=originalShapes;}
    inst.cy.elements().remove();inst.cy.add(inst.data.nodes.concat(inst.data.edges));
    inst.cy.layout({name:"dagre",rankDir:"BT",nodeSep:60,rankSep:80,animate:false,fit:true,padding:30}).run();
    buildLegendOverlay(c,inst.data);buildNsOverlay(c,inst.data);
    var o=c.querySelector(".ov-validation-output");if(o&&inst.data.validation)renderValidation(o,inst.data.validation);
  }

  // ── Color Customization ────────────────────────────────────────────────

  var NODE_SHAPES = ["rectangle","ellipse","round-rectangle","diamond","hexagon","octagon","triangle","barrel","rhomboid","star","tag","vee"];
  var EDGE_LINE_STYLES = ["solid","dashed","dotted"];
  var EDGE_ARROW_SHAPES = ["triangle","triangle-tee","circle-triangle","triangle-backcurve","vee","tee","circle","diamond","chevron","none"];

  function toggleColors(id){
    var c=document.getElementById(id),ex=c.querySelector(".ov-color-panel");if(ex){ex.remove();return;}
    var inst=instances[id];if(!inst)return;
    var sources={},types={},typeShapes={};
    inst.cy.nodes().forEach(function(n){var d=n.data();if(d.source&&(sources[d.source]===undefined||d.type==="Class"))sources[d.source]=d.color;types[d.type]=d.color;typeShapes[d.type]=n.style("shape");});

    // Collect edge type styles
    var edgeStyles={};
    var edgeTypeLabels={"object-property":"Object Property","data-property":"Data Property","rdf-type":"rdf:type","subclass":"rdfs:subClassOf","shacl-constraint":"SHACL Constraint","owl-restriction":"OWL Restriction","inferred":"Inferred (overlay)"};
    inst.cy.edges().forEach(function(e){
      var et=e.data("edgeType");
      if(et&&!edgeStyles[et])edgeStyles[et]={color:e.style("line-color"),lineStyle:e.style("line-style"),arrowShape:e.style("target-arrow-shape")};
    });
    // Also surface "inferred" even when no overlay is currently on the graph,
    // so the user can pre-style the color before toggling the overlay on.
    if (!edgeStyles["inferred"]) edgeStyles["inferred"] = { color: "#a855f7", lineStyle: "dotted", arrowShape: "triangle" };

    var panel=document.createElement("div");panel.className="ov-color-panel";
    var h='<div class="ov-color-panel-head"><strong>Edit Layout</strong><button class="ov-popup-close" data-oi-onclick="this.closest(\'.ov-color-panel\').remove()">&times;</button></div>';

    // Node Types section: color + shape
    h+='<div class="ov-color-section"><div class="ov-color-section-title">Node Types</div>';
    Object.keys(types).forEach(function(t){
      var curShape=typeShapes[t]||"rectangle";
      h+='<div class="ov-color-row"><input type="color" value="'+types[t]+'" data-kind="type" data-key="'+esc(t)+'" class="ov-color-input">';
      h+='<select class="ov-shape-select" data-kind="node-shape" data-key="'+esc(t)+'">';
      NODE_SHAPES.forEach(function(s){h+='<option value="'+s+'"'+(s===curShape?' selected':'')+'>'+s+'</option>';});
      h+='</select>';
      h+='<span>'+esc(t)+'</span></div>';
    });
    h+='</div>';

    // Edge Types section: color + line style + arrow shape
    var edgeKeys=Object.keys(edgeStyles);
    if(edgeKeys.length){
      h+='<div class="ov-color-section"><div class="ov-color-section-title">Edge Types</div>';
      edgeKeys.forEach(function(et){
        var es=edgeStyles[et], lbl=edgeTypeLabels[et]||et;
        h+='<div class="ov-color-row"><input type="color" value="'+es.color+'" data-kind="edge-color" data-key="'+esc(et)+'" class="ov-color-input">';
        h+='<select class="ov-shape-select" data-kind="edge-line" data-key="'+esc(et)+'">';
        EDGE_LINE_STYLES.forEach(function(s){h+='<option value="'+s+'"'+(s===es.lineStyle?' selected':'')+'>'+s+'</option>';});
        h+='</select>';
        h+='<select class="ov-shape-select" data-kind="edge-arrow" data-key="'+esc(et)+'">';
        EDGE_ARROW_SHAPES.forEach(function(s){h+='<option value="'+s+'"'+(s===es.arrowShape?' selected':'')+'>'+s+'</option>';});
        h+='</select>';
        h+='<span>'+esc(lbl)+'</span></div>';
      });
      h+='</div>';
    }

    // Namespaces section
    if(Object.keys(sources).length){h+='<div class="ov-color-section"><div class="ov-color-section-title">Namespaces</div>';
      Object.keys(sources).sort().forEach(function(s){h+='<div class="ov-color-row"><input type="color" value="'+sources[s]+'" data-kind="source" data-key="'+esc(s)+'" class="ov-color-input"><span>'+esc(s)+'</span></div>';});
      h+='</div>';}

    // Prefix editing section
    var activeNs = inst.data.activeNamespaces || {};
    var activeKeys = Object.keys(activeNs).sort();
    if(activeKeys.length){
      h+='<div class="ov-color-section"><div class="ov-color-section-title">Prefixes (edit visibility)</div>';
      activeKeys.forEach(function(p){
        h+='<div class="ov-color-row"><label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;"><input type="checkbox" checked data-prefix="'+esc(p)+'" class="ov-prefix-toggle"><b style="color:#3730a3;">'+esc(p)+':</b> <span style="color:#6b7280;font-size:10px;overflow:hidden;text-overflow:ellipsis;">'+esc(activeNs[p])+'</span></label></div>';
      });
      h+='</div>';
    }

    panel.innerHTML=h;c.appendChild(panel);

    // Re-render legend & namespace overlay after each Edit Layout change
    function refreshLegend() { buildLegendOverlay(c, inst.data); buildNsOverlay(c, inst.data); }

    // Color inputs
    panel.querySelectorAll(".ov-color-input").forEach(function(inp){inp.addEventListener("input",function(){
      var kind=inp.dataset.kind,key=inp.dataset.key,col=inp.value;
      if(kind==="type") inst.cy.nodes().forEach(function(n){if(n.data("type")===key)n.data("color",col);});
      if(kind==="source") inst.cy.nodes().forEach(function(n){if(n.data("source")===key)n.data("color",col);});
      if(kind==="edge-color") inst.cy.edges().forEach(function(e){if(e.data("edgeType")===key){e.style({"line-color":col,"target-arrow-color":col,"source-arrow-color":col});}});
      // Also propagate to inst.data so exports + future legend re-renders pick it up
      if(kind==="type") inst.data.nodes.forEach(function(n){if(n.data.type===key)n.data.color=col;});
      if(kind==="source") inst.data.nodes.forEach(function(n){if(n.data.source===key)n.data.color=col;});
      refreshLegend();
    });});

    // Shape selects
    panel.querySelectorAll(".ov-shape-select").forEach(function(sel){sel.addEventListener("change",function(){
      var kind=sel.dataset.kind,key=sel.dataset.key,val=sel.value;
      if(kind==="node-shape") {
        inst.cy.nodes().forEach(function(n){if(n.data("type")===key){n.data("shape",val);n.style("shape",val);}});
        inst.data.nodes.forEach(function(n){if(n.data.type===key)n.data.shape=val;});
      }
      if(kind==="edge-line") inst.cy.edges().forEach(function(e){if(e.data("edgeType")===key)e.style("line-style",val);});
      if(kind==="edge-arrow") inst.cy.edges().forEach(function(e){if(e.data("edgeType")===key)e.style("target-arrow-shape",val);});
      refreshLegend();
    });});

    // Prefix toggle checkboxes
    panel.querySelectorAll(".ov-prefix-toggle").forEach(function(cb){cb.addEventListener("change",function(){
      var prefix=cb.dataset.prefix;
      var nsOverlay=c.querySelector(".ov-ns-overlay");
      if(!nsOverlay)return;
      var tags=nsOverlay.querySelectorAll(".ov-ns-tag");
      tags.forEach(function(tag){
        var b=tag.querySelector("b");
        if(b&&b.textContent.trim()===prefix+":") tag.style.display=cb.checked?"":"none";
      });
    });});
  }

  // ── Toolbar ─────────────────────────────────────────────────────────────

  function zoomIn(id){var cy=instances[id]?.cy;if(cy)cy.zoom({level:cy.zoom()*1.25,renderedPosition:{x:cy.width()/2,y:cy.height()/2}});}
  function zoomOut(id){var cy=instances[id]?.cy;if(cy)cy.zoom({level:cy.zoom()/1.25,renderedPosition:{x:cy.width()/2,y:cy.height()/2}});}
  function fit(id){var cy=instances[id]?.cy;if(cy)cy.fit(null,30);}
  function fullscreen(id){var el=document.getElementById(id);if(document.fullscreenElement===el)document.exitFullscreen();else el.requestFullscreen().catch(function(){});}

  // ── Export ─────────────────────────────────────────────────────────────

  // Read current node colors from cytoscape (reflects Edit Layout changes)
  function getLiveColors(inst) {
    var types = {}, sources = {};
    inst.cy.nodes().forEach(function(n) {
      var d = n.data();
      types[d.type] = n.style("background-color");
      if (d.source) sources[d.source] = n.style("background-color");
    });
    return { types: types, sources: sources };
  }

  function exportPNG(id){
    var inst=instances[id];if(!inst)return;
    var cy=inst.cy;
    var c=document.getElementById(id);
    var scale=2;

    // Hide minimap during export
    var minimap=c.querySelector(".ov-minimap"); if(minimap)minimap.style.visibility="hidden";

    // full:true = the whole graph (nothing cut). The legend/prefixes are then
    // placed in a clean margin BELOW so they never cover any nodes.
    var graphUrl=cy.png({scale:scale,bg:"#ffffff",full:true});
    if(minimap)minimap.style.visibility="";

    // Build export data with live colors / shapes / edge styles for the legend
    var liveStyles = getLiveStyles(c);
    var exportData = JSON.parse(JSON.stringify(inst.data));
    if (liveStyles) {
      exportData.nodes.forEach(function(n) {
        var t = n.data.type;
        if (liveStyles.typeColors[t]) n.data.color = liveStyles.typeColors[t];
        if (liveStyles.typeShapes[t]) n.data.shape = liveStyles.typeShapes[t];
      });
      exportData._live = liveStyles;
    }

    var legendEl=c.querySelector(".ov-legend-overlay");
    var nsEl=c.querySelector(".ov-ns-overlay");
    var showLegend = legendEl && legendEl.style.display !== "none";
    var showNs = nsEl && nsEl.style.display !== "none";

    var graphImg=new Image();
    graphImg.onload=function(){
      var pad=12*scale;
      // Measure each box at the size it will actually be drawn (offsetWidth/Height).
      var tc=document.createElement("canvas");tc.width=1;tc.height=1;
      var lW=showLegend?legendEl.offsetWidth*scale:0;
      var nW=showNs?nsEl.offsetWidth*scale:0;
      // Measure with the computed (row-based) height — offsetHeight can
      // under-measure and clip the last legend row.
      var lH=showLegend?drawLegendBox(tc.getContext("2d"),exportData,0,0,scale,legendEl.offsetWidth):0;
      var nH=showNs?drawNsBox(tc.getContext("2d"),exportData,0,0,scale,nsEl.offsetWidth):0;

      // Keep each box on the side it sits on screen (legend bottom-left,
      // prefixes bottom-right by default), but place them in a margin BELOW the
      // graph so they never cover any nodes.
      var wrap=c.querySelector(".ov-canvas-wrap"),wr=wrap?wrap.getBoundingClientRect():null;
      function onRight(el){if(!wr)return false;var r=el.getBoundingClientRect();return ((r.left+r.right)/2-wr.left)>wr.width/2;}
      var legendRight=showLegend&&onRight(legendEl),nsRight=showNs&&onRight(nsEl);
      // Side-by-side only if on opposite sides AND both fit across the graph
      // width; otherwise stack on two rows so the boxes never overlap each other.
      var sideBySide=showLegend&&showNs&&(legendRight!==nsRight)&&(lW+nW+pad*3<=graphImg.width);
      var stack=showLegend&&showNs&&!sideBySide;
      var margin=(showLegend||showNs)?((stack?lH+nH+pad:Math.max(lH,nH))+pad*2):0;

      var finalCanvas=document.createElement("canvas");
      finalCanvas.width=graphImg.width;
      finalCanvas.height=graphImg.height+margin;
      var ctx=finalCanvas.getContext("2d");
      ctx.fillStyle="#fff";ctx.fillRect(0,0,finalCanvas.width,finalCanvas.height);
      ctx.drawImage(graphImg,0,0);

      var by=graphImg.height+pad;
      if(showLegend){var lx=legendRight?(finalCanvas.width-lW-pad):pad;drawLegendBox(ctx,exportData,lx,by,scale,legendEl.offsetWidth);}
      if(showNs){var nx=nsRight?(finalCanvas.width-nW-pad):pad;var ny=(stack&&showLegend)?(by+lH+pad):by;drawNsBox(ctx,exportData,nx,ny,scale,nsEl.offsetWidth);}

      var a=document.createElement("a");a.href=finalCanvas.toDataURL("image/png");a.download=id+".png";a.click();
    };
    graphImg.src=graphUrl;
  }

  function exportSVG(id){
    var inst=instances[id];if(!inst)return;
    var cy=inst.cy;
    var c=document.getElementById(id);
    var legendEl=c.querySelector(".ov-legend-overlay");
    var nsEl=c.querySelector(".ov-ns-overlay");
    var showLegend = legendEl && legendEl.style.display !== "none";
    var showNs = nsEl && nsEl.style.display !== "none";

    try{
      // full:false = the current viewport (WYSIWYG), matching the browser so the
      // legend/prefixes boxes line up with their on-screen positions.
      var svgStr=cy.svg({scale:1,full:false,bg:"#fff"});
      var parser=new DOMParser();
      var doc=parser.parseFromString(svgStr,"image/svg+xml");
      var svgEl=doc.querySelector("svg");
      var origW=parseFloat(svgEl.getAttribute("width"))||800;
      var origH=parseFloat(svgEl.getAttribute("height"))||600;

      var live = getLiveStyles(c) || { typeColors:{}, typeShapes:{}, edgeColors:{}, edgeLineStyles:{}, edgeArrows:{} };
      var usedTypes={},usedShapes={},usedEdge={};
      inst.data.nodes.forEach(function(n){
        var t=n.data.type;
        usedTypes[t]=live.typeColors[t]||n.data.color;
        usedShapes[t]=live.typeShapes[t]||n.data.shape||"rectangle";
      });
      inst.data.edges.forEach(function(e){usedEdge[e.data.edgeType]=true;});
      var nodeKeys=Object.keys(usedTypes),edgeKeys=Object.keys(usedEdge);
      var ns=inst.data.activeNamespaces||{};var nsKeys=Object.keys(ns).sort();
      var pad=12, row=18;

      // Measure legend/ns sizes
      var lW=showLegend?legendEl.offsetWidth:0;
      var nW=(showNs&&nsKeys.length)?nsEl.offsetWidth:0;
      var legendH=pad*2+row*(Math.max(nodeKeys.length,edgeKeys.length)+2);
      var nsH=nsKeys.length?pad*2+row*(nsKeys.length+1):0;
      // Place the boxes in a clean margin BELOW the graph (legend on its side,
      // prefixes on its side — left/right by default) so they never cover nodes.
      var wrap=c.querySelector(".ov-canvas-wrap"),wr=wrap?wrap.getBoundingClientRect():null;
      function onRight(el){if(!wr)return false;var r=el.getBoundingClientRect();return ((r.left+r.right)/2-wr.left)>wr.width/2;}
      var hasNs=showNs&&nsKeys.length;
      var legendRight=showLegend&&onRight(legendEl), nsRight=hasNs&&onRight(nsEl);
      var legendBoxW=Math.min(lW,origW-pad*2), nsBoxW=Math.min(nW,origW-pad*2);
      // Side-by-side only if on opposite sides AND both fit; else stack on two rows.
      var sideBySide=showLegend&&hasNs&&(legendRight!==nsRight)&&(legendBoxW+nsBoxW+pad*3<=origW);
      var stack=showLegend&&hasNs&&!sideBySide;
      var margin=(showLegend||hasNs)?((stack?legendH+nsH+pad:Math.max(showLegend?legendH:0,hasNs?nsH:0))+pad*2):0;
      var totalH=origH+margin;
      svgEl.setAttribute("height",totalH);
      var vb=svgEl.getAttribute("viewBox");
      if(vb){var parts=vb.split(/[\s,]+/);parts[3]=totalH;svgEl.setAttribute("viewBox",parts.join(" "));}
      var bgRect=svgEl.querySelector("rect");
      if(bgRect&&bgRect.getAttribute("fill")==="#fff")bgRect.setAttribute("height",totalH);
      var by=origH+pad;
      var lp={x:legendRight?(origW-legendBoxW-pad):pad, y:by};
      var np={x:nsRight?(origW-nsBoxW-pad):pad, y:(stack&&showLegend)?(by+legendH+pad):by};

      // Legend box (overlaid on the graph at its on-screen corner)
      if(showLegend){
        var g=doc.createElementNS("http://www.w3.org/2000/svg","g");
        g.setAttribute("transform","translate("+lp.x+","+lp.y+")");
        var rect=doc.createElementNS("http://www.w3.org/2000/svg","rect");
        rect.setAttribute("x","0");rect.setAttribute("y","0");rect.setAttribute("width",Math.min(lW,origW-pad*2));rect.setAttribute("height",legendH);
        rect.setAttribute("rx","10");rect.setAttribute("fill","rgba(255,255,255,0.93)");rect.setAttribute("stroke","#d1d5db");rect.setAttribute("stroke-width","1");
        g.appendChild(rect);
        var title=doc.createElementNS("http://www.w3.org/2000/svg","text");
        title.setAttribute("x",pad);title.setAttribute("y",pad+12);title.setAttribute("font-family","Inter,Segoe UI,sans-serif");title.setAttribute("font-size","12");title.setAttribute("font-weight","700");title.setAttribute("fill","#1f2937");
        title.textContent="Legend";g.appendChild(title);
        var ty=pad+row+6;
        var hdr=doc.createElementNS("http://www.w3.org/2000/svg","text");
        hdr.setAttribute("x",pad);hdr.setAttribute("y",ty+9);hdr.setAttribute("font-family","Inter,sans-serif");hdr.setAttribute("font-size","9");hdr.setAttribute("font-weight","700");hdr.setAttribute("fill","#9ca3af");
        hdr.textContent="NODES";g.appendChild(hdr);ty+=row*0.8;
        nodeKeys.forEach(function(t){
          var clr=usedTypes[t];
          if(t==="Class"){var r2=doc.createElementNS("http://www.w3.org/2000/svg","rect");r2.setAttribute("x",pad);r2.setAttribute("y",ty);r2.setAttribute("width","14");r2.setAttribute("height","9");r2.setAttribute("rx","1");r2.setAttribute("fill",clr);r2.setAttribute("stroke","#555");r2.setAttribute("stroke-width","1.5");g.appendChild(r2);}
          else if(t==="Individual"){var ci=doc.createElementNS("http://www.w3.org/2000/svg","circle");ci.setAttribute("cx",pad+7);ci.setAttribute("cy",ty+4.5);ci.setAttribute("r","5");ci.setAttribute("fill",clr);ci.setAttribute("stroke","#999");g.appendChild(ci);}
          else if(t==="Literal"){var el2=doc.createElementNS("http://www.w3.org/2000/svg","ellipse");el2.setAttribute("cx",pad+7);el2.setAttribute("cy",ty+4.5);el2.setAttribute("rx","7");el2.setAttribute("ry","4");el2.setAttribute("fill",clr);el2.setAttribute("stroke","#6a9");el2.setAttribute("stroke-dasharray","2,1");g.appendChild(el2);}
          var lbl=doc.createElementNS("http://www.w3.org/2000/svg","text");lbl.setAttribute("x",pad+22);lbl.setAttribute("y",ty+9);lbl.setAttribute("font-family","Inter,sans-serif");lbl.setAttribute("font-size","11");lbl.setAttribute("fill","#374151");lbl.textContent=t;g.appendChild(lbl);
          ty+=row*0.85;
        });
        var col2=Math.min(lW,origW-pad*2)/2+4;ty=pad+row+6;
        var hdr2=doc.createElementNS("http://www.w3.org/2000/svg","text");hdr2.setAttribute("x",col2);hdr2.setAttribute("y",ty+9);hdr2.setAttribute("font-family","Inter,sans-serif");hdr2.setAttribute("font-size","9");hdr2.setAttribute("font-weight","700");hdr2.setAttribute("fill","#9ca3af");hdr2.textContent="EDGES";g.appendChild(hdr2);ty+=row*0.8;
        edgeKeys.forEach(function(t){
          var d=EDGE_DEFS_EXPORT[t]||{l:t,c:"#999",dash:false,fill:true,bold:false};
          var color=live.edgeColors[t]||d.c;
          var ls=live.edgeLineStyles[t]||(d.dash?"dashed":"solid");
          var line=doc.createElementNS("http://www.w3.org/2000/svg","line");
          line.setAttribute("x1",col2);line.setAttribute("y1",ty+7);line.setAttribute("x2",col2+24);line.setAttribute("y2",ty+7);
          line.setAttribute("stroke",color);line.setAttribute("stroke-width",d.bold?"2.5":"1.5");
          if(ls==="dashed")line.setAttribute("stroke-dasharray","4,2");
          else if(ls==="dotted")line.setAttribute("stroke-dasharray","1,2");
          g.appendChild(line);
          var arrow=doc.createElementNS("http://www.w3.org/2000/svg","polygon");
          arrow.setAttribute("points",(col2+24)+","+(ty+7)+" "+(col2+19)+","+(ty+3.5)+" "+(col2+19)+","+(ty+10.5));
          arrow.setAttribute("fill",d.fill?color:"none");arrow.setAttribute("stroke",color);arrow.setAttribute("stroke-width","0.8");g.appendChild(arrow);
          var lbl2=doc.createElementNS("http://www.w3.org/2000/svg","text");lbl2.setAttribute("x",col2+32);lbl2.setAttribute("y",ty+10);lbl2.setAttribute("font-family","Inter,sans-serif");lbl2.setAttribute("font-size","11");lbl2.setAttribute("fill","#374151");lbl2.textContent=d.l;g.appendChild(lbl2);
          ty+=row*0.85;
        });
        svgEl.appendChild(g);
      }

      // Prefixes box (overlaid on the graph at its on-screen corner)
      if(showNs&&nsKeys.length){
        var g2=doc.createElementNS("http://www.w3.org/2000/svg","g");
        g2.setAttribute("transform","translate("+np.x+","+np.y+")");
        var r3=doc.createElementNS("http://www.w3.org/2000/svg","rect");r3.setAttribute("x","0");r3.setAttribute("y","0");r3.setAttribute("width",Math.min(nW,origW-pad*2));r3.setAttribute("height",nsH);r3.setAttribute("rx","10");r3.setAttribute("fill","rgba(255,255,255,0.93)");r3.setAttribute("stroke","#d1d5db");r3.setAttribute("stroke-width","1");g2.appendChild(r3);
        var t3=doc.createElementNS("http://www.w3.org/2000/svg","text");t3.setAttribute("x",pad);t3.setAttribute("y",pad+12);t3.setAttribute("font-family","Inter,sans-serif");t3.setAttribute("font-size","12");t3.setAttribute("font-weight","700");t3.setAttribute("fill","#1f2937");t3.textContent="Prefixes";g2.appendChild(t3);
        var ny2=pad+row+2;
        nsKeys.forEach(function(p){
          var t4=doc.createElementNS("http://www.w3.org/2000/svg","text");t4.setAttribute("x",pad);t4.setAttribute("y",ny2+10);t4.setAttribute("font-family","Inter,sans-serif");t4.setAttribute("font-size","10");
          var ts1=doc.createElementNS("http://www.w3.org/2000/svg","tspan");ts1.setAttribute("font-weight","600");ts1.setAttribute("fill","#3730a3");ts1.textContent=p+": ";t4.appendChild(ts1);
          var ts2=doc.createElementNS("http://www.w3.org/2000/svg","tspan");ts2.setAttribute("fill","#6b7280");ts2.textContent=ns[p];t4.appendChild(ts2);
          g2.appendChild(t4);ny2+=row*0.85;
        });
        svgEl.appendChild(g2);
      }

      var finalSvg=new XMLSerializer().serializeToString(svgEl);
      var b=new Blob([finalSvg],{type:"image/svg+xml"});var a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=id+".svg";a.click();URL.revokeObjectURL(a.href);
    }catch(e){console.error(e);alert("SVG export failed.");}
  }

  function downloadTTL(id){var inst=instances[id];if(!inst)return;var ttl=inst.editor?inst.editor.getValue():inst.originalTtl;if(!ttl){alert("No TTL data.");return;}var b=new Blob([ttl],{type:"text/turtle"});var a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=id+".ttl";a.click();URL.revokeObjectURL(a.href);}

  function toggleAllNs(id){var c=document.getElementById(id);if(!c)return;var a=c.querySelector(".ov-ns-all"),b=c.querySelector(".ov-ns-toggle");if(!a)return;var h=a.style.display==="none";a.style.display=h?"inline":"none";if(b)b.textContent=h?"Hide unused":"Show all";}

  // ── Reasoning ──────────────────────────────────────────────────────────

  // Reasoning toggle — same interactive UI as the playground.
  // If pre-computed inferences (from MkDocs build time) exist, show them first;
  // the user can then re-run with any backend via the dropdown.
  function toggleReasoning(id) {
    var c = document.getElementById(id), inst = instances[id];
    if (!c || !inst) return;
    var panel = c.querySelector(".ov-reasoning-panel");
    if (!panel) return;
    var visible = panel.style.display !== "none";
    if (visible) { panel.style.display = "none"; return; }

    // If the container has no reasoner dropdown yet, inject one in the toolbar
    var selectEl = c.querySelector(".ov-reasoner-select");
    if (!selectEl) {
      var toolbar = c.querySelector(".ov-toolbar");
      if (toolbar) {
        var grp = document.createElement("div");
        grp.className = "ov-toolbar-group";
        grp.innerHTML = '<select class="ov-reasoner-select" title="Select reasoner backend"></select>';
        toolbar.appendChild(grp);
        selectEl = grp.querySelector(".ov-reasoner-select");
        populateReasonerSelect(selectEl);
      }
    }

    // Pre-fill the panel with any build-time inferences, before the user
    // chooses to re-run with a different backend.
    //
    // v0.7.3 — Distinguish "reasoner ran and produced zero triples" from
    // "no reasoner installed at build time". The consistency probe uses
    // the same owlready2 that _run_reasoning does, so its `status` field
    // tells us whether reasoning was actually available:
    //   - status "unknown" + "owlready2 not installed" → no build-time
    //     reasoner, and the runtime path (browser/server) is the only
    //     way to get results. Fall through.
    //   - any other status (consistent / inconsistent / …) → reasoning
    //     ran successfully; an empty `inferred` list means the graph
    //     genuinely has no new OWL-DL entailments (common for pure
    //     SHACL shape files), so show a friendly panel instead of
    //     silently punting to a runtime reasoner that isn't there.
    var pre = inst.data.inferred || [];
    var cons = inst.data.consistency || {};
    var buildReasonerRan = cons.status && cons.status !== "unknown";
    panel.style.display = "block";
    if (pre.length) {
      var rows = pre.map(function(t) {
        return '<tr><td>' + esc(t.sLabel || t.s) + '</td><td>' + esc(t.pLabel || t.p) + '</td><td>' + esc(t.oLabel || t.o) + '</td></tr>';
      }).join("");
      panel.innerHTML =
        '<div class="ov-panel-head">Reasoning <button class="ov-panel-close" data-oi-onclick="this.closest(\'.ov-reasoning-panel\').style.display=\'none\'">&times;</button></div>' +
        '<div class="ov-reasoning-body">' +
          '<div style="padding:8px 12px;color:#374151;font-size:13px;background:#f0fdf4;border-bottom:1px solid #d1d5db;"><strong>' + pre.length + '</strong> pre-computed inference' + (pre.length === 1 ? '' : 's') + ' from build time. <a href="#" data-oi-onclick="ontoink.togglePlaygroundReasoning(\'' + id + '\');ontoink.togglePlaygroundReasoning(\'' + id + '\');event.preventDefault();return false;">Re-run with selected backend ↻</a></div>' +
          '<table class="ov-reasoning-table"><thead><tr><th>Subject</th><th>Predicate</th><th>Object</th></tr></thead><tbody>' + rows + '</tbody></table>' +
        '</div>';
    } else if (buildReasonerRan) {
      // Reasoner ran at build time; produced no new triples.
      var consBadge = cons.status === "consistent"
        ? '<span style="color:#166534;background:#dcfce7;padding:1px 6px;border-radius:3px;font-size:11px;font-weight:600;">consistent</span>'
        : cons.status === "inconsistent"
          ? '<span style="color:#991b1b;background:#fee2e2;padding:1px 6px;border-radius:3px;font-size:11px;font-weight:600;">inconsistent</span>'
          : '<span style="color:#4b5563;background:#e5e7eb;padding:1px 6px;border-radius:3px;font-size:11px;font-weight:600;">' + esc(cons.status || 'unknown') + '</span>';
      panel.innerHTML =
        '<div class="ov-panel-head">Reasoning <button class="ov-panel-close" data-oi-onclick="this.closest(\'.ov-reasoning-panel\').style.display=\'none\'">&times;</button></div>' +
        '<div class="ov-reasoning-body">' +
          '<div style="padding:12px 14px;color:#374151;font-size:13px;background:#f0fdf4;border-bottom:1px solid #d1d5db;">' +
            '<strong>Build-time OWL reasoning: 0 new triples inferred.</strong> ' + consBadge +
            (cons.message ? '<div style="color:#6b7280;font-size:12px;margin-top:4px;">' + esc(cons.message) + '</div>' : '') +
            '<div style="color:#6b7280;font-size:12px;margin-top:8px;">This is normal for pure SHACL shape files, or ontologies that don\'t add any OWL-DL entailments beyond what\'s already asserted. ' +
            '<a href="#" data-oi-onclick="ontoink.togglePlaygroundReasoning(\'' + id + '\');event.preventDefault();return false;">Re-run with a different backend ↻</a></div>' +
          '</div>' +
        '</div>';
    } else {
      // No build-time reasoner (owlready2 not installed in the container
      // that built this page) — try browser/server at runtime.
      panel.style.display = "none";  // togglePlaygroundReasoning will toggle it back on
      togglePlaygroundReasoning(id);
    }
  }

  function renderInferred(container, inst) {
    var el = container.querySelector(".ov-reasoning-content");
    if (!el) return;
    var inferred = inst.data.inferred || [];
    if (!inferred.length) {
      el.innerHTML = '<div class="ov-val-info">No new triples were inferred by OWL-RL reasoning.</div>';
      return;
    }
    var h = '<div style="font-size:12px;color:#374151;margin-bottom:8px;"><strong>' + inferred.length + '</strong> inferred triple(s)</div>';
    h += '<table class="ov-inferred-table"><thead><tr><th>Subject</th><th>Predicate</th><th>Object</th></tr></thead><tbody>';
    inferred.forEach(function(t) {
      h += '<tr><td>' + esc(t.sLabel) + '</td><td>' + esc(t.pLabel) + '</td><td>' + esc(t.oLabel) + '</td></tr>';
    });
    h += '</tbody></table>';
    el.innerHTML = h;
  }

  function toggleInferredOnGraph(id, show) {
    var inst = instances[id];
    if (!inst) return;
    var cy = inst.cy;
    var inferred = inst.data.inferred || [];
    if (!inferred.length) return;

    if (!show) {
      // Remove inferred elements
      cy.elements("[?inferred]").remove();
      return;
    }

    // Add inferred triples as new nodes/edges with distinct styling
    var pf = inst.data.activeNamespaces || {};
    var existingIds = {};
    cy.nodes().forEach(function(n) { existingIds[n.id()] = true; });

    inferred.forEach(function(t, i) {
      // Ensure subject node exists
      if (!existingIds[t.s] && !cy.getElementById(t.s).length) {
        cy.add({ group: "nodes", data: { id: t.s, label: t.sLabel, type: "Individual", color: "#E6E6E6", shape: "ellipse", iri: t.s, source: "", namespace: "", inferred: true }});
        existingIds[t.s] = true;
      }
      if (!t.isLiteral) {
        // Ensure object node exists
        if (!existingIds[t.o] && !cy.getElementById(t.o).length) {
          cy.add({ group: "nodes", data: { id: t.o, label: t.oLabel, type: "Individual", color: "#E6E6E6", shape: "ellipse", iri: t.o, source: "", namespace: "", inferred: true }});
          existingIds[t.o] = true;
        }
        // Add edge
        cy.add({ group: "edges", data: { id: "inf_e_" + i, source: t.s, target: t.o, label: t.pLabel, iri: t.p, edgeType: "inferred", inferred: true }});
      }
    });

    // Run layout to incorporate new elements
    cy.layout({ name: "dagre", rankDir: "BT", nodeSep: 60, rankSep: 80, animate: true, animationDuration: 300, fit: true, padding: 30 }).run();
  }

  function validateWithReasoning(id) {
    var inst = instances[id];
    if (!inst) return;
    var c = document.getElementById(id);
    var outEl = c.querySelector(".ov-validation-output");
    if (!outEl) return;
    var inferred = inst.data.inferred || [];
    if (!inferred.length) { validate(id); return; }
    var ttl = getEditorValue(id), shapes = validationShapes(id);
    // Append inferred triples to the data graph as extra Turtle statements.
    var extra = "\n# ── Inferred triples (OWL-RL) ──\n";
    inferred.forEach(function(t) {
      extra += t.isLiteral ? ("<" + t.s + "> <" + t.p + "> " + JSON.stringify(t.o) + " .\n")
                           : ("<" + t.s + "> <" + t.p + "> <" + t.o + "> .\n");
    });
    var combinedData = (ttl || "") + extra;
    // Reveal the editor panel so the result is visible.
    var edPanel = c.querySelector(".ov-editor-panel");
    if (edPanel && edPanel.style.display === "none") edPanel.style.display = "block";
    renderValidation(outEl, { conforms: null, violations: [], report: "Validating…" });
    runShaclValidation(outEl, combinedData, shapes, true).catch(function() { validateMinimal(id, true); });
  }

  // ── Playground: build graph from raw TTL in the browser ─────────────

  function playground(containerId, ttl, shapeTtl) {
    var container = document.getElementById(containerId);
    if (!container) return;
    var canvas = container.querySelector(".ov-canvas");
    if (!canvas) return;

    var p = parseTtlGraph(ttl), tr = p.triples, pf = p.prefixes;
    var labels = {}, nodes = {}, edges = [], classes = {};
    var RT = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
    var SC = "http://www.w3.org/2000/01/rdf-schema#subClassOf";
    var RL = "http://www.w3.org/2000/01/rdf-schema#label";
    var SH_NS = "http://www.w3.org/ns/shacl#";
    var rc = collapseOwlRestrictions(tr);
    function isBn(x) { return typeof x === "string" && x.indexOf("_:") === 0; }

    tr.forEach(function(t) { if (t.p === RL && t.o[0] === '"') labels[t.s] = litVal(t.o); });
    tr.forEach(function(t) { if (isBn(t.s) || isBn(t.o)) return; if (t.p === RT) { if (t.o === OWL_CLASS_IRI || t.o === RDFS_CLASS_IRI) classes[t.s] = true; classes[t.o] = true; } if (t.p === SC) { classes[t.s] = true; classes[t.o] = true; } });

    // ── Parse SHACL shapes first (so constraint edges can overlay matching data triples) ──
    var shacl = [];
    var shapePrefixes = {};
    if (shapeTtl) {
      var sp = parseTtlMinimal(shapeTtl), str2 = sp.triples;
      shapePrefixes = sp.prefixes;
      var shapes = {};
      str2.forEach(function(t) { if (t.p === SH_NS + "targetClass") shapes[t.s] = { targetClass: t.o }; });
      var propNodes = {};
      str2.forEach(function(t) { if (t.p === SH_NS + "property") { if (shapes[t.s]) propNodes[t.o] = shapes[t.s].targetClass; } });
      var propData = {};
      str2.forEach(function(t) {
        if (propNodes[t.s]) {
          if (!propData[t.s]) propData[t.s] = { targetClass: propNodes[t.s] };
          if (t.p === SH_NS + "path") propData[t.s].path = t.o;
          if (t.p === SH_NS + "minCount") propData[t.s].minCount = parseInt(litVal(t.o));
          if (t.p === SH_NS + "maxCount") propData[t.s].maxCount = parseInt(litVal(t.o));
          if (t.p === SH_NS + "message") propData[t.s].message = litVal(t.o);
          if (t.p === SH_NS + "class") propData[t.s].class = t.o;
          if (t.p === SH_NS + "datatype") propData[t.s].datatype = t.o;
          if (t.p === SH_NS + "node") propData[t.s].node = t.o;
          if (t.p === SH_NS + "nodeKind") propData[t.s].nodeKind = t.o;
        }
      });
      Object.values(propData).forEach(function(c) {
        if (c.path && c.targetClass) {
          c.pathLabel = uriLabel(c.path, Object.assign({}, pf, sp.prefixes));
          shacl.push(c);
        }
      });
    }

    // Index shapes by path for fast lookup during edge building
    var shapesByPath = {};
    shacl.forEach(function(c) { if (c.path) (shapesByPath[c.path] = shapesByPath[c.path] || []).push(c); });

    function en(u) {
      if (nodes[u] || u[0] === '"') return;
      var ic = classes[u] || false, s = detectSource(u);
      var np = nsPrefix(u, pf);
      nodes[u] = { data: { id: u, label: labels[u] || uriLabel(u, pf), type: ic ? "Class" : "Individual", color: ic ? s.color : "#E6E6E6", shape: ic ? "rectangle" : "ellipse", iri: u, source: s.name || np, namespace: np } };
    }

    // Helper: build a SHACL constraint edge if the source's rdf:type matches a shape's targetClass
    function shaclEdgeFor(s, p, tgt) {
      var candidates = shapesByPath[p]; if (!candidates) return null;
      // Find subject's classes (from rdf:type triples)
      var sClasses = {};
      tr.forEach(function(tt) { if (tt.s === s && tt.p === RT) sClasses[tt.o] = true; });
      var match = null;
      candidates.forEach(function(c) { if (sClasses[c.targetClass]) match = c; });
      if (!match) return null;
      var cd = "[" + (match.minCount != null ? match.minCount : 0) + ".." + (match.maxCount != null ? match.maxCount : "*") + "]";
      return { id: "e_" + edges.length, source: s, target: tgt, label: uriLabel(p, pf) + " " + cd, iri: p, edgeType: "shacl-constraint", cardinality: cd, message: match.message || "" };
    }

    tr.forEach(function(t) {
      // Blank-node triples (owl:Restriction internals, collection cells) become
      // collapsed restriction edges (pushRestrictionEdges below), not raw nodes.
      if (isBn(t.s) || isBn(t.o)) return;
      // owl:Class / owl:Ontology / owl:ObjectProperty etc. are kinds, not nodes.
      if (t.p === RT && IMPLICIT_TOPS[t.o]) return;
      if (t.p === RL) {
        var li = "lit_" + Math.abs(hashStr(t.s + t.p + t.o)) % 999999;
        if (!nodes[li]) nodes[li] = { data: { id: li, label: litVal(t.o), type: "Literal", color: "#93D053", shape: "ellipse", iri: "", source: "", namespace: "" } };
        en(t.s); edges.push({ data: { id: "e_" + edges.length, source: t.s, target: li, label: uriLabel(t.p, pf), iri: t.p, edgeType: "data-property" } });
        return;
      }
      en(t.s);
      if (t.o[0] === '"') {
        var li2 = "lit_" + Math.abs(hashStr(t.s + t.p + t.o)) % 999999;
        if (!nodes[li2]) nodes[li2] = { data: { id: li2, label: litVal(t.o), type: "Literal", color: "#93D053", shape: "ellipse", iri: "", source: "", namespace: "" } };
        var se = shaclEdgeFor(t.s, t.p, li2);
        edges.push({ data: se || { id: "e_" + edges.length, source: t.s, target: li2, label: uriLabel(t.p, pf), iri: t.p, edgeType: "data-property" } });
      } else {
        en(t.o);
        var et = t.p === RT ? "rdf-type" : t.p === SC ? "subclass" : "object-property";
        var se2 = shaclEdgeFor(t.s, t.p, t.o);
        edges.push({ data: se2 || { id: "e_" + edges.length, source: t.s, target: t.o, label: uriLabel(t.p, pf), iri: t.p, edgeType: et } });
      }
    });

    // ── Render SHACL shapes that don't have matching data: targetClass → expected target (schema view) ──
    shacl.forEach(function(c) {
      // Skip if any data triple already produced a constraint edge for this (targetClass, path)
      var hasData = false;
      edges.forEach(function(e) { if (e.data.edgeType === "shacl-constraint" && e.data.iri === c.path) hasData = true; });
      if (hasData) return;
      // Ensure targetClass exists as a node
      classes[c.targetClass] = true;
      en(c.targetClass);
      if (nodes[c.targetClass]) nodes[c.targetClass].data.type = "Class";
      // Determine expected target: sh:class > sh:node > sh:datatype > literal placeholder
      var tgt = c.class || c.node;
      if (tgt) {
        classes[tgt] = true; en(tgt);
        if (nodes[tgt]) nodes[tgt].data.type = "Class";
      } else if (c.datatype) {
        tgt = "lit_dt_" + Math.abs(hashStr(c.path + c.datatype)) % 999999;
        if (!nodes[tgt]) nodes[tgt] = { data: { id: tgt, label: uriLabel(c.datatype, Object.assign({}, pf, shapePrefixes)), type: "Literal", color: "#93D053", shape: "ellipse", iri: c.datatype, source: "", namespace: "" } };
      } else {
        // No target type — anchor on a generic literal placeholder
        tgt = "lit_any_" + Math.abs(hashStr(c.path)) % 999999;
        if (!nodes[tgt]) nodes[tgt] = { data: { id: tgt, label: "·", type: "Literal", color: "#93D053", shape: "ellipse", iri: "", source: "", namespace: "" } };
      }
      var cd = "[" + (c.minCount != null ? c.minCount : 0) + ".." + (c.maxCount != null ? c.maxCount : "*") + "]";
      edges.push({ data: { id: "e_" + edges.length, source: c.targetClass, target: tgt, label: (c.pathLabel || uriLabel(c.path, pf)) + " " + cd, iri: c.path, edgeType: "shacl-constraint", cardinality: cd, message: c.message || "" } });
    });

    pushRestrictionEdges(rc, edges, en, pf);

    var nodeList = Object.values(nodes), data = {
      nodes: nodeList, edges: edges, shacl: shacl,
      namespaces: pf, activeNamespaces: pf,
      rawTtl: ttl, shapeTtl: shapeTtl || "", inferred: []
    };

    // Remove any prior instance
    if (instances[containerId] && instances[containerId].cy) instances[containerId].cy.destroy();

    var cy = cytoscape({
      container: canvas,
      elements: { nodes: nodeList, edges: edges },
      style: [
        { selector: "node", style: { "label":"data(label)","background-color":"data(color)","shape":"data(shape)","text-valign":"center","text-halign":"center","width":"label","height":"label","padding":"14px","font-size":"12px","font-family":"'Inter','Segoe UI',system-ui,sans-serif","text-wrap":"wrap","text-max-width":"160px","border-width":1,"border-color":"#aaa","border-opacity":0.6,"color":"#222" }},
        { selector: 'node[type="Class"]', style: { "font-weight":"600","border-width":2,"border-color":"#666","shape":"rectangle" }},
        { selector: 'node[type="Individual"]', style: { "shape":"ellipse" }},
        { selector: 'node[type="Literal"]', style: { "shape":"ellipse","font-style":"italic","font-size":"11px","border-style":"dashed","border-color":"#6a9" }},
        { selector: "edge[edgeType='object-property']", style: { "label":"data(label)","curve-style":"bezier","target-arrow-shape":"triangle","target-arrow-fill":"filled","source-arrow-shape":"circle","source-arrow-fill":"filled","line-color":"#2563eb","target-arrow-color":"#2563eb","source-arrow-color":"#2563eb","width":2,"font-size":"10px","text-rotation":"autorotate","text-margin-y":-10,"color":"#2563eb","text-background-color":"#fff","text-background-opacity":0.9,"text-background-padding":"2px","font-family":"'Inter','Segoe UI',system-ui,sans-serif" }},
        { selector: "edge[edgeType='data-property']", style: { "label":"data(label)","curve-style":"bezier","target-arrow-shape":"triangle","target-arrow-fill":"hollow","line-color":"#16a34a","target-arrow-color":"#16a34a","width":1.5,"font-size":"10px","text-rotation":"autorotate","text-margin-y":-10,"color":"#16a34a","text-background-color":"#fff","text-background-opacity":0.9,"text-background-padding":"2px","font-family":"'Inter','Segoe UI',system-ui,sans-serif" }},
        { selector: "edge[edgeType='rdf-type']", style: { "label":"data(label)","curve-style":"bezier","target-arrow-shape":"triangle","target-arrow-fill":"hollow","line-style":"dashed","line-color":"#9ca3af","target-arrow-color":"#9ca3af","width":1,"font-size":"9px","text-rotation":"autorotate","text-margin-y":-10,"color":"#888","text-background-color":"#fff","text-background-opacity":0.9,"text-background-padding":"2px","font-family":"'Inter','Segoe UI',system-ui,sans-serif" }},
        { selector: "edge[edgeType='subclass']", style: { "label":"data(label)","curve-style":"bezier","target-arrow-shape":"triangle","target-arrow-fill":"filled","line-color":"#374151","target-arrow-color":"#374151","width":2,"font-size":"9px","text-rotation":"autorotate","text-margin-y":-10,"color":"#555","text-background-color":"#fff","text-background-opacity":0.9,"text-background-padding":"2px","font-family":"'Inter','Segoe UI',system-ui,sans-serif" }},
        { selector: "edge[edgeType='shacl-constraint']", style: { "label":"data(label)","curve-style":"bezier","target-arrow-shape":"triangle","target-arrow-fill":"filled","line-style":"dashed","line-color":"#0891b2","target-arrow-color":"#0891b2","width":3,"font-size":"11px","font-weight":"bold","text-rotation":"autorotate","text-margin-y":-12,"color":"#0891b2","text-background-color":"#fff","text-background-opacity":0.95,"text-background-padding":"3px","font-family":"'Inter','Segoe UI',system-ui,sans-serif" }},
        { selector: "edge[edgeType='owl-restriction']", style: { "label":"data(label)","curve-style":"bezier","target-arrow-shape":"triangle","target-arrow-fill":"filled","line-style":"dashed","line-color":"#a855f7","target-arrow-color":"#a855f7","width":2,"font-size":"11px","font-weight":"bold","text-rotation":"autorotate","text-margin-y":-12,"color":"#a855f7","text-background-color":"#fff","text-background-opacity":0.95,"text-background-padding":"3px","font-family":"'Inter','Segoe UI',system-ui,sans-serif" }},
        { selector: "edge[edgeType='owl-restriction'][owlVia='equivalentClass']", style: { "target-arrow-shape":"diamond","target-arrow-fill":"hollow" }},
        { selector: "edge[edgeType='inferred']", style: { "label":"data(label)","curve-style":"bezier","target-arrow-shape":"triangle","target-arrow-fill":"filled","line-style":"dotted","line-color":"#a855f7","target-arrow-color":"#a855f7","width":1.5,"font-size":"9px","text-rotation":"autorotate","text-margin-y":-10,"color":"#a855f7","text-background-color":"#fff","text-background-opacity":0.9,"text-background-padding":"2px","font-family":"'Inter','Segoe UI',system-ui,sans-serif","opacity":0.75 }},
        { selector: "node[?inferred]", style: { "opacity":0.75,"border-style":"dotted","border-color":"#a855f7","border-width":2 }},
        // v0.7.2 — namespace-cluster super-nodes. Same visual language as
        // the fence-side style block (~line 1788): chunky hexagon, double
        // cyan border, member-count suffix. Ensures the playground and
        // fence renders read as one product.
        { selector: 'node[?isSuperNode]', style: {
          "label": function(ele) {
            // v0.7.4 — Multi-line label. Line 1: prefix + total count.
            // Line 2: type breakdown ("52C · 8I · 5B"). Uses \n which
            // Cytoscape renders when text-wrap='wrap' is applied.
            var n = ele.data("memberCount");
            var lab = ele.data("label") || "";
            var st  = ele.data("subtitle") || "";
            var line1 = n ? (lab + "  ·  " + n) : lab;
            return st ? (line1 + "\n" + st) : line1;
          },
          "text-wrap": "wrap",
          "line-height": 1.25,
          "shape":"hexagon","background-color":"#e0f2fe","border-width":3,"border-color":"#0891b2","border-style":"double",
          "font-weight":"700","font-size":"13px","text-outline-width":2,"text-outline-color":"#fff",
          "padding":"18px","text-max-width":"200px"
        }},
        { selector: 'node[?isSuperNode]:selected', style: { "border-color":"#0e7490","border-width":4 }},
        // v0.7.3 — ClusterHull compound parent for expanded clusters.
        // Same visual language as the fence-side hull (~line 2192).
        { selector: 'node[?isClusterHull]', style: {
          "shape":"round-rectangle","background-color":"#f0f9ff","background-opacity":0.35,
          "border-width":2,"border-style":"dashed","border-color":"#0891b2",
          "label":"data(label)","text-valign":"top","text-halign":"center","text-margin-y":-6,
          "font-weight":"700","font-size":"12px","color":"#0e7490",
          "text-background-color":"#e0f2fe","text-background-opacity":0.95,"text-background-padding":"4px",
          "text-background-shape":"round-rectangle","padding":"22px",
          "compound-sizing-wrt-labels":"include"
        }},
        { selector: 'node[?isClusterHull]:selected', style: { "border-color":"#0e7490","border-width":3,"background-color":"#dbeafe" }},
        // Nested compound box inside a cluster (e.g. a category holding its
        // instances). Coloured, labelled container; label sits at the top so it
        // doesn't overlap the members. Colour comes from data(color).
        { selector: 'node[?isCategoryBox]', style: {
          "shape":"round-rectangle",
          "background-color": function(ele) { return ele.data("color") || "#94a3b8"; },
          "background-opacity":0.10,
          "border-width":2,"border-style":"dashed",
          "border-color": function(ele) { return ele.data("color") || "#64748b"; },
          "label":"data(label)","text-valign":"top","text-halign":"center","text-margin-y":-4,
          "font-weight":"700","font-size":"12px",
          "color": function(ele) { return ele.data("color") || "#334155"; },
          "text-background-color":"#ffffff","text-background-opacity":0.9,
          "text-background-padding":"3px","text-background-shape":"round-rectangle",
          "padding":"16px","compound-sizing-wrt-labels":"include"
        }},
        // v0.7.4 — Blank-node styling. rdflib emits blank subjects as
        // "_:bN..." — they aren't real Individuals no matter what
        // ttl_parser tags them. `_flagBlankNodes` stamps `isBlankNode:true`
        // on init; the style below matches that flag reliably (avoiding
        // the escape-sensitive `[id ^= "_:"]` attribute-prefix selector).
        { selector: 'node[?isBlankNode]', style: {
          "background-color":"#f3f4f6","border-style":"dashed","border-color":"#9ca3af",
          "color":"#6b7280","font-style":"italic","opacity":0.7,
          "shape":"round-diamond","width":24,"height":24
        }},
        // v0.7.3 — Fanned super-edges: when multiple originals collapse
        // into one boundary edge, `data.weight > 1`. Widen the line
        // proportionally (mapData → 3..12 px) and paint it a distinct
        // "bundle" purple so users can tell "45 relations" apart from
        // a single relation. The `data.fan` array powers the hover
        // popup at buildEdgePopup.
        { selector: 'edge[?clusterManaged][weight > 1]', style: {
          "width": "mapData(weight, 1, 40, 3, 12)",
          "line-color":"#7c3aed","target-arrow-color":"#7c3aed","source-arrow-color":"#7c3aed",
          "color":"#5b21b6","font-weight":"700","font-size":"12px",
          "text-background-color":"#ede9fe","text-background-opacity":0.95,"text-background-padding":"3px"
        }},
      ],
      layout: { name: "dagre", rankDir: "BT", nodeSep: 60, rankSep: 80, edgeSep: 20, animate: false, fit: true, padding: 30 },
      // v0.7.4 — Viewport optimizations for large ontologies. On pan/zoom
      // over hundreds of edges Cytoscape's canvas renderer thrashes; these
      // flags trade visual detail for interactivity: edges + labels hide
      // during motion, and the whole scene is bitmap-cached to a texture.
      // wheelSensitivity 0.15 gives finer-grained zoom control — the old
      // 0.3 skipped past the sweet spot on trackpads.
      wheelSensitivity: 0.15, minZoom: 0.05, maxZoom: 8,
      hideEdgesOnViewport: true,
      hideLabelsOnViewport: true,
      textureOnViewport: true,
      pixelRatio: 1,
    });

    // Playground init — mirror the fence-side v0.7.0 semantic-tile fields
    // so LOD slider + Attic + Super toggle + node badges all work here.
    // The playground has no build-time side-store (no Leiden clustering
    // runs on the user's live TTL), so ``sideStore`` starts empty and
    // ``expandedSuperNodes`` stays untouched.
    //
    // Default LOD: small graphs land on L6 (show everything, pre-0.7.0
    // parity — the toolbar is the OPT-IN for hiding). Big graphs (≥ 500
    // nodes) get the metrics splash after render (see _openSplashIfBig
    // below), which shows the overview + a LOD picker the user commits
    // to before the graph unfurls. Until they pick, we start at L0 so
    // the initial paint is cheap.
    var _isBigGraph = (data.nodes && data.nodes.length >= 500);
    instances[containerId] = {
      cy: cy, data: data, editor: null, originalTtl: ttl,
      sideStore: {},
      attic: new Map(),
      lodLevel: _isBigGraph ? 0 : 6,
      policy: { hide_at_level: {}, node_badges: {}, hide: [], fold: [], badge: [] },
      expandedSuperNodes: new Set(),
      showSuperNodes: true,
      _nodeBadgesRendered: new Set(),
      _isPlayground: true
    };
    // v0.7.2 — run browser-side namespace clustering on the pasted TTL so
    // the "Group by namespace" checkbox is meaningful in the playground.
    // The fence path has an equivalent bootstrap at line ~1848; keeping
    // the two in sync is deliberate.
    _flagBlankNodes(cy);
    _autoClusterByNamespace(containerId);
    _buildFacets(instances[containerId]);
    // v0.7.3 — Position cache (#4). Keyed off the pasted TTL so the
    // same paste on a later session recovers its layout.
    try {
      instances[containerId]._posCacheKey = _posCacheKeyFor(ttl || "");
      var _cachedPos = _positionsLoad(instances[containerId]._posCacheKey);
      if (_cachedPos) _applyCachedPositions(cy, _cachedPos);
      _wirePositionCache(cy, function() { return instances[containerId] && instances[containerId]._posCacheKey; });
    } catch (e) {}
    // Bootstrap the LOD pipeline so the toolbar controls in
    // demo/docs/playground.md take effect the moment the graph appears.
    setLodLevel(containerId, instances[containerId].lodLevel);
    // v0.7.3 — on big graphs, open the metrics dashboard splash so the
    // user sees the shape of what they pasted (with a LOD picker) before
    // committing to a first render (#38 in docs/big-ontology-plan.md).
    if (_isBigGraph) { try { openMetricsSplash(containerId); } catch (e) {} }

    // Wire tap events
    function wirePlaygroundPopup(popup, d) {
      popup.querySelector(".ov-popup-close").addEventListener("click", function() { popup.remove(); });
      popup.querySelectorAll(".ov-chip").forEach(function(b) {
        b.addEventListener("click", function() {
          if (b.classList.contains("ov-deref-btn")) { derefIri(b.dataset.iri, b); return; }
          copyText(b.dataset.action === "copy-iri" ? d.iri : d.label, b);
        });
      });
      popup.querySelectorAll(".ov-popup-toggle").forEach(function(tog) {
        tog.addEventListener("click", function() {
          var sec = tog.dataset.section;
          var tgt = popup.querySelector('.ov-collapsible[data-section="' + sec + '"]');
          if (!tgt) return;
          var open = tgt.style.display !== "none";
          tgt.style.display = open ? "none" : "block";
          var arrow = tog.querySelector(".ov-toggle-arrow");
          if (arrow) arrow.textContent = open ? "\u25B6" : "\u25BC";
        });
      });
      makePopupDraggable(popup);
    }
    // v0.7.2 — super-node tap: expand/collapse the cluster instead of showing
    // the ordinary popup. Bound BEFORE the generic 'node' handler so
    // Cytoscape fires the more-specific selector first; stopPropagation()
    // then keeps the generic handler off. Mirrors the fence-side wiring
    // (~line 1874) so the playground and fence tap semantics match.
    cy.on("tap", 'node[?isSuperNode]', function(evt) {
      removePopup(container);
      var n = evt.target;
      var inst2 = instances[containerId];
      if (!inst2) return;
      if (!inst2.expandedSuperNodes) inst2.expandedSuperNodes = new Set();
      if (inst2.expandedSuperNodes.has(n.id())) collapseSuperNode(containerId, n.id());
      else                                       expandSuperNode(containerId, n.id());
      evt.stopPropagation();
    });
    // v0.7.3 — ClusterHull tap: collapse. Matches the fence wiring
    // (~line 2290). The header label reads "click header to collapse".
    cy.on("tap", 'node[?isClusterHull]', function(evt) {
      removePopup(container);
      var cid = evt.target.data("clusterId");
      if (cid) collapseSuperNode(containerId, cid);
      evt.stopPropagation();
    });
    cy.on("tap", "node", function(evt) {
      // Don't double-fire for super-nodes or hulls.
      if (evt.target.data("isSuperNode")) return;
      if (evt.target.data("isClusterHull")) return;
      removePopup(container);
      var d = evt.target.data(), pos = evt.renderedPosition;
      var popup = document.createElement("div"); popup.className = "ov-popup"; popup.innerHTML = buildPopup(d, cy);
      var cR = canvas.getBoundingClientRect(), pR = container.getBoundingClientRect();
      popup.style.left = (cR.left - pR.left + pos.x + 15) + "px"; popup.style.top = (cR.top - pR.top + pos.y - 15) + "px";
      container.appendChild(popup);
      requestAnimationFrame(function() { var r = popup.getBoundingClientRect(); if (r.right > pR.right - 10) popup.style.left = (parseFloat(popup.style.left) - r.width - 30) + "px"; if (r.bottom > pR.bottom - 10) popup.style.top = (parseFloat(popup.style.top) - r.height) + "px"; });
      wirePlaygroundPopup(popup, d);
    });
    cy.on("tap", "edge", function(evt) {
      removePopup(container);
      var d = evt.target.data(), midpoint = evt.target.midpoint();
      var zoom = cy.zoom(), pan = cy.pan();
      var rx = midpoint.x * zoom + pan.x, ry = midpoint.y * zoom + pan.y;
      var popup = document.createElement("div"); popup.className = "ov-popup"; popup.innerHTML = buildEdgePopup(d, cy);
      var cR = canvas.getBoundingClientRect(), pR = container.getBoundingClientRect();
      popup.style.left = (cR.left - pR.left + rx + 15) + "px"; popup.style.top = (cR.top - pR.top + ry - 15) + "px";
      container.appendChild(popup);
      requestAnimationFrame(function() { var r = popup.getBoundingClientRect(); if (r.right > pR.right - 10) popup.style.left = (parseFloat(popup.style.left) - r.width - 30) + "px"; if (r.bottom > pR.bottom - 10) popup.style.top = (parseFloat(popup.style.top) - r.height) + "px"; });
      wirePlaygroundPopup(popup, d);
    });
    cy.on("tap", function(e) { if (e.target === cy) removePopup(container); });

    buildLegendOverlay(container, data);
    buildNsOverlay(container, data);

    // Fire-and-forget: fetch labels/axioms for all IRIs (incl. SHACL shape targets)
    setTimeout(function() { autoDerefNamespaces(instances[containerId]); }, 500);
  }

  // ── Search & Highlight (fuzzy) ───────────────────────────────────────

  function fuzzyMatch(str, query) {
    str = str.toLowerCase(); query = query.toLowerCase();
    if (str.indexOf(query) >= 0) return 2; // exact substring = high score
    var qi = 0, score = 0;
    for (var i = 0; i < str.length && qi < query.length; i++) {
      if (str[i] === query[qi]) { score++; qi++; }
    }
    return qi === query.length ? score / query.length : 0;
  }

  var searchTimeout = null;
  function search(id, query) {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(function() { doSearch(id, query); }, 150);
  }
  function doSearch(id, query) {
    var inst = instances[id]; if (!inst) return;
    var cy = inst.cy;
    if (!query || !query.trim()) {
      cy.elements().style("opacity", 1);
      return;
    }
    var q = query.trim();
    cy.nodes().forEach(function(n) {
      var label = n.data("label") || "", iri = n.data("iri") || "", type = n.data("type") || "";
      var score = Math.max(fuzzyMatch(label, q), fuzzyMatch(iri, q), fuzzyMatch(type, q));
      n.style("opacity", score > 0 ? 1 : 0.12);
    });
    cy.edges().forEach(function(e) {
      var label = e.data("label") || "", iri = e.data("iri") || "";
      var score = Math.max(fuzzyMatch(label, q), fuzzyMatch(iri, q));
      e.style("opacity", score > 0 ? 1 : 0.08);
    });
  }

  // ── Layout Switcher ────────────────────────────────────────────────────

  function changeLayout(id, layoutName) {
    var inst = instances[id]; if (!inst) return;
    var opts = { name: layoutName, animate: true, animationDuration: 400, fit: true, padding: 30 };
    if (layoutName === "dagre") { opts.rankDir = "BT"; opts.nodeSep = 60; opts.rankSep = 80; opts.animate = false; }
    if (layoutName === "cose") { opts.nodeRepulsion = function() { return 8000; }; opts.idealEdgeLength = function() { return 80; }; }
    if (layoutName === "concentric") { opts.concentric = function(n) { return n.degree(); }; opts.levelWidth = function() { return 2; }; }
    inst.cy.layout(opts).run();
    // Re-render legend & namespace overlays so they reflect the current graph state
    var c = document.getElementById(id);
    if (c && inst.data) { buildLegendOverlay(c, inst.data); buildNsOverlay(c, inst.data); }
  }

  // ── Neighborhood Focus ─────────────────────────────────────────────────

  function focusNode(id, nodeId, hops) {
    var inst = instances[id]; if (!inst) return;
    var cy = inst.cy;
    var root = cy.getElementById(nodeId);
    if (!root.length) return;
    var neighborhood = root.closedNeighborhood();
    for (var i = 1; i < hops; i++) {
      neighborhood = neighborhood.closedNeighborhood();
    }
    cy.elements().style("opacity", 0.08);
    neighborhood.style("opacity", 1);
    cy.animate({ fit: { eles: neighborhood, padding: 40 } }, { duration: 400 });
  }

  function resetFocus(id) {
    var inst = instances[id]; if (!inst) return;
    inst.cy.elements().style("opacity", 1);
    inst.cy.fit(null, 30);
  }

  // Auto-focus for large graphs: if >30 nodes, start focused on most connected
  function autoFocusLargeGraph(inst, containerId) {
    var cy = inst.cy;
    if (cy.nodes().length <= 30) return;
    // Find the node with highest degree
    var best = null, bestDeg = 0;
    cy.nodes().forEach(function(n) {
      var d = n.degree(); if (d > bestDeg) { bestDeg = d; best = n; }
    });
    if (best) {
      var hood = best.closedNeighborhood().closedNeighborhood(); // 2-hop
      cy.elements().style("opacity", 0.08);
      hood.style("opacity", 1);
      cy.fit(hood, 40);
      // Show a hint overlay
      var c = document.getElementById(containerId);
      var hint = document.createElement("div");
      hint.className = "ov-focus-hint";
      hint.innerHTML = 'Focused on <strong>' + esc(best.data("label")) + '</strong> (most connected). <button class="ov-chip" data-oi-onclick="ontoink.resetFocus(\'' + containerId + '\');this.parentElement.remove();">Show All</button>';
      c.querySelector(".ov-canvas-wrap").appendChild(hint);
    }
  }

  // ── Graph Statistics Panel ─────────────────────────────────────────────

  // Known LOD namespaces for linker
  var LOD_DATASETS = {
    "http://dbpedia.org/": {name:"DBpedia", url:"https://dbpedia.org"},
    "http://www.wikidata.org/": {name:"Wikidata", url:"https://www.wikidata.org"},
    "http://schema.org/": {name:"Schema.org", url:"https://schema.org"},
    "http://xmlns.com/foaf/": {name:"FOAF", url:"http://xmlns.com/foaf/spec/"},
    "http://purl.org/dc/": {name:"Dublin Core", url:"https://www.dublincore.org"},
    "http://www.w3.org/2004/02/skos/": {name:"SKOS", url:"https://www.w3.org/2009/08/skos-reference/skos.html"},
    "http://www.w3.org/ns/prov": {name:"PROV-O", url:"https://www.w3.org/TR/prov-o/"},
    "http://purl.obolibrary.org/obo/": {name:"OBO Foundry", url:"https://obofoundry.org"},
    "https://nfdi.fiz-karlsruhe.de/": {name:"NFDIcore", url:"https://nfdi.fiz-karlsruhe.de"},
    "http://qudt.org/": {name:"QUDT", url:"https://www.qudt.org"},
    "http://www.w3.org/ns/shacl": {name:"SHACL", url:"https://www.w3.org/TR/shacl/"},
  };

  function toggleStats(id) {
    var c = document.getElementById(id), inst = instances[id];
    if (!c || !inst) return;
    var panel = c.querySelector(".ov-stats-panel");
    if (!panel) return;
    if (panel.style.display !== "none") { panel.style.display = "none"; return; }
    panel.style.display = "block";
    var cy = inst.cy;
    var metrics = inst.data.metrics || {};
    var consistency = inst.data.consistency || {};

    var nodeCount = cy.nodes().length, edgeCount = cy.edges().length;
    var typeCounts = {}, edgeTypeCounts = {};
    cy.nodes().forEach(function(n) { var t = n.data("type") || "Unknown"; typeCounts[t] = (typeCounts[t] || 0) + 1; });
    cy.edges().forEach(function(e) { var t = e.data("edgeType") || "other"; edgeTypeCounts[t] = (edgeTypeCounts[t] || 0) + 1; });
    var degrees = [];
    cy.nodes().forEach(function(n) { degrees.push({ label: n.data("label") || n.id(), degree: n.degree() }); });
    degrees.sort(function(a, b) { return b.degree - a.degree; });

    var h = '<div class="ov-editor-header ov-panel-head">Graph Statistics &amp; Ontology Metrics<button class="ov-panel-close" data-oi-onclick="this.closest(\'.ov-stats-panel\').style.display=\'none\'">&times;</button></div><div class="ov-stats-body">';

    // Consistency badge
    var conBg = consistency.status === "consistent" ? "#dcfce7" : consistency.status === "inconsistent" ? "#fef2f2" : "#f3f4f6";
    var conColor = consistency.status === "consistent" ? "#16a34a" : consistency.status === "inconsistent" ? "#dc2626" : "#6b7280";
    var conIcon = consistency.status === "consistent" ? "\u2714" : consistency.status === "inconsistent" ? "\u2718" : "?";
    h += '<div class="ov-consistency-badge" style="background:' + conBg + ';color:' + conColor + ';"><span style="font-size:16px;">' + conIcon + '</span> ' + esc(consistency.message || "Unknown") + '</div>';

    // Summary cards
    h += '<div class="ov-stats-row">';
    h += '<div class="ov-stats-card"><div class="ov-stats-num">' + nodeCount + '</div><div class="ov-stats-label">Nodes</div></div>';
    h += '<div class="ov-stats-card"><div class="ov-stats-num">' + edgeCount + '</div><div class="ov-stats-label">Edges</div></div>';
    h += '<div class="ov-stats-card"><div class="ov-stats-num">' + (metrics.totalTriples || "?") + '</div><div class="ov-stats-label">Triples</div></div>';
    h += '<div class="ov-stats-card"><div class="ov-stats-num">' + (metrics.maxHierarchyDepth || 0) + '</div><div class="ov-stats-label">Hierarchy Depth</div></div>';
    h += '</div>';

    // Ontology metrics
    h += '<div class="ov-stats-row">';
    h += '<div class="ov-stats-card"><div class="ov-stats-num">' + (metrics.classCount || 0) + '</div><div class="ov-stats-label">Classes</div></div>';
    h += '<div class="ov-stats-card"><div class="ov-stats-num">' + (metrics.individualCount || 0) + '</div><div class="ov-stats-label">Individuals</div></div>';
    h += '<div class="ov-stats-card"><div class="ov-stats-num">' + (metrics.objectPropertyCount || 0) + '</div><div class="ov-stats-label">Object Props</div></div>';
    h += '<div class="ov-stats-card"><div class="ov-stats-num">' + (metrics.dataPropertyCount || 0) + '</div><div class="ov-stats-label">Data Props</div></div>';
    h += '</div>';

    // Additional metrics
    h += '<div class="ov-stats-row">';
    h += '<div class="ov-stats-card"><div class="ov-stats-num">' + (metrics.annotationPropertyCount || 0) + '</div><div class="ov-stats-label">Annotation Props</div></div>';
    h += '<div class="ov-stats-card"><div class="ov-stats-num">' + (metrics.subclassAxioms || 0) + '</div><div class="ov-stats-label">SubClass Axioms</div></div>';
    h += '<div class="ov-stats-card"><div class="ov-stats-num">' + (metrics.typeAssertions || 0) + '</div><div class="ov-stats-label">Type Assertions</div></div>';
    h += '<div class="ov-stats-card"><div class="ov-stats-num">' + (metrics.blankNodeCount || 0) + '</div><div class="ov-stats-label">Blank Nodes</div></div>';
    h += '</div>';

    // Tables row
    h += '<div class="ov-stats-cols">';

    h += '<div class="ov-stats-section"><strong>Node Types</strong><table class="ov-stats-table">';
    Object.keys(typeCounts).sort().forEach(function(t) {
      h += '<tr><td>' + esc(t) + '</td><td class="ov-stats-val">' + typeCounts[t] + '</td></tr>';
    });
    h += '</table></div>';

    h += '<div class="ov-stats-section"><strong>Edge Types</strong><table class="ov-stats-table">';
    Object.keys(edgeTypeCounts).sort().forEach(function(t) {
      h += '<tr><td>' + esc(t) + '</td><td class="ov-stats-val">' + edgeTypeCounts[t] + '</td></tr>';
    });
    h += '</table></div>';

    h += '<div class="ov-stats-section"><strong>Most Connected</strong><table class="ov-stats-table">';
    degrees.slice(0, 5).forEach(function(d, i) {
      h += '<tr><td>' + (i + 1) + '. ' + esc(d.label) + '</td><td class="ov-stats-val">' + d.degree + '</td></tr>';
    });
    h += '</table></div>';

    h += '</div>'; // end cols

    // SHACL Coverage
    if (metrics.shaclCoveredClasses !== undefined) {
      var uncov = metrics.shaclUncoveredClasses || [];
      h += '<div class="ov-stats-section"><strong>SHACL Coverage</strong> ';
      h += '<span class="ov-badge" style="background:#dcfce7;color:#16a34a;">' + metrics.shaclCoveredClasses + ' covered</span> ';
      if (uncov.length) {
        h += '<span class="ov-badge" style="background:#fef2f2;color:#dc2626;">' + uncov.length + ' uncovered</span>';
        h += ' <button class="ov-chip" data-oi-onclick="ontoink.showCoverage(\'' + id + '\')">Show on graph</button>';
      }
      h += '</div>';
    }

    // OntoSniff — Smell Detection
    var smells = inst.data.smells || [];
    if (smells.length) {
      h += '<div class="ov-stats-section"><strong>OntoSniff \u2014 Quality</strong> <span style="font-size:10px;color:#9ca3af;">(' + smells.length + ' smell' + (smells.length > 1 ? 's' : '') + ')</span>';
      smells.forEach(function(s) {
        var sevColor = s.severity === "error" ? "#dc2626" : s.severity === "warning" ? "#f59e0b" : "#6b7280";
        var sevIcon = s.severity === "error" ? "\u2718" : s.severity === "warning" ? "\u26A0" : "\u2139";
        h += '<details style="margin:4px 0;font-size:12px;"><summary style="cursor:pointer;color:' + sevColor + ';">' + sevIcon + ' <strong>' + esc(s.name) + '</strong> <span style="color:#9ca3af;">(' + s.entities.length + ')</span></summary>';
        h += '<div style="padding:4px 0 4px 18px;color:#4b5563;">' + esc(s.description) + '</div>';
        if (s.suggestion) h += '<div style="padding:0 0 4px 18px;color:#0891b2;font-size:11px;">\u2192 ' + esc(s.suggestion) + '</div>';
        h += '<div style="padding:0 0 4px 18px;">';
        s.entities.forEach(function(e) { h += '<span style="display:inline-block;font-size:10px;background:#f3f4f6;padding:1px 6px;border-radius:3px;margin:1px;color:#374151;">' + esc(e.label) + '</span> '; });
        h += '</div></details>';
      });
      h += '</div>';
    } else {
      h += '<div class="ov-stats-section"><strong>OntoSniff</strong> <span style="font-size:11px;color:#16a34a;">\u2714 No smells detected</span></div>';
    }

    // LOD Cloud links
    var lodLinks = [];
    var allNs = inst.data.namespaces || {};
    Object.values(allNs).forEach(function(uri) {
      for (var prefix in LOD_DATASETS) {
        if (uri.indexOf(prefix) === 0 || prefix.indexOf(uri) === 0) {
          var d = LOD_DATASETS[prefix];
          if (lodLinks.indexOf(d.name) < 0) lodLinks.push(d.name);
        }
      }
    });
    if (lodLinks.length) {
      h += '<div class="ov-stats-section"><strong>Linked Open Data</strong><div style="font-size:12px;margin-top:4px;">';
      lodLinks.forEach(function(name) {
        var d; for (var p in LOD_DATASETS) { if (LOD_DATASETS[p].name === name) { d = LOD_DATASETS[p]; break; } }
        if (d) h += '<a href="' + esc(d.url) + '" target="_blank" class="ov-lod-link">' + esc(d.name) + '</a> ';
      });
      h += '</div></div>';
    }

    h += '</div>';
    panel.innerHTML = h;
  }

  // ── Validation Coverage Map ────────────────────────────────────────────

  function showCoverage(id) {
    var inst = instances[id]; if (!inst) return;
    var cy = inst.cy;
    var metrics = inst.data.metrics || {};
    var uncovered = new Set(metrics.shaclUncoveredClasses || []);
    var covered = new Set();
    (inst.data.shacl || []).forEach(function(s) { if (s.targetClass) covered.add(s.targetClass); });

    cy.nodes().forEach(function(n) {
      var iri = n.data("iri");
      if (covered.has(iri)) {
        n.style({ "border-color": "#16a34a", "border-width": 3 });
      } else if (uncovered.has(iri)) {
        n.style({ "border-color": "#dc2626", "border-width": 3, "border-style": "dashed" });
      }
    });
  }

  // ── Minimap ────────────────────────────────────────────────────────────

  function initMinimap(containerId, cy) {
    var c = document.getElementById(containerId);
    var minimapEl = c.querySelector(".ov-minimap");
    if (!minimapEl) return;
    var mmCy = cytoscape({
      container: minimapEl,
      elements: cy.elements().jsons(),
      style: [
        { selector: "node", style: { "background-color": "data(color)", "width": 6, "height": 6, "label": "" } },
        { selector: "edge", style: { "width": 0.5, "line-color": "#ccc", "target-arrow-shape": "none" } },
      ],
      layout: { name: "preset" },
      userZoomingEnabled: false, userPanningEnabled: false,
      autoungrabify: true, autounselectify: true,
    });
    mmCy.fit(null, 4);

    // Draw viewport rectangle
    function updateViewport() {
      var ext = cy.extent();
      minimapEl.querySelectorAll(".ov-mm-viewport").forEach(function(el) { el.remove(); });
      var mmExt = mmCy.extent();
      var mmZoom = mmCy.zoom(), mmPan = mmCy.pan();
      var x1 = (ext.x1 - mmExt.x1) / (mmExt.x2 - mmExt.x1) * minimapEl.offsetWidth;
      var y1 = (ext.y1 - mmExt.y1) / (mmExt.y2 - mmExt.y1) * minimapEl.offsetHeight;
      var w = (ext.w) / (mmExt.x2 - mmExt.x1) * minimapEl.offsetWidth;
      var h = (ext.h) / (mmExt.y2 - mmExt.y1) * minimapEl.offsetHeight;
      var vp = document.createElement("div");
      vp.className = "ov-mm-viewport";
      vp.style.cssText = "position:absolute;left:" + Math.max(0, x1) + "px;top:" + Math.max(0, y1) + "px;width:" + Math.min(w, minimapEl.offsetWidth) + "px;height:" + Math.min(h, minimapEl.offsetHeight) + "px;border:2px solid #0891b2;background:rgba(8,145,178,0.08);pointer-events:none;border-radius:2px;";
      minimapEl.appendChild(vp);
    }
    cy.on("viewport", updateViewport);
    updateViewport();
  }

  // ── Path Finder ────────────────────────────────────────────────────────

  // ── Abstract Model View ─────────────────────────────────────────────

  function abstractView(id) {
    var inst = instances[id]; if (!inst) return;
    var cy = inst.cy;
    // Save full elements if not already saved
    if (!inst._fullElements) inst._fullElements = cy.elements().jsons();
    // Extract schema: classes, subClassOf, domain/range, object properties between classes
    var classIds = new Set();
    cy.nodes().forEach(function(n) { if (n.data("type") === "Class") classIds.add(n.id()); });
    // Keep class nodes + edges between classes (subclass, object-property)
    var keepNodes = cy.nodes().filter(function(n) { return n.data("type") === "Class"; });
    var keepEdges = cy.edges().filter(function(e) {
      var et = e.data("edgeType");
      return (et === "subclass" || et === "object-property" || et === "shacl-constraint")
        && classIds.has(e.data("source")) && classIds.has(e.data("target"));
    });
    cy.elements().style("display", "none");
    keepNodes.style("display", "element");
    keepEdges.style("display", "element");
    cy.fit(keepNodes, 40);
    inst._abstractMode = true;
    // Show hint
    var c = document.getElementById(id);
    var old = c.querySelector(".ov-abstract-hint"); if (old) old.remove();
    var hint = document.createElement("div"); hint.className = "ov-focus-hint ov-abstract-hint";
    hint.innerHTML = 'Abstract Model View (' + keepNodes.length + ' classes). <button class="ov-chip" data-oi-onclick="ontoink.fullView(\'' + id + '\');this.parentElement.remove();">Show Full Graph</button>';
    c.querySelector(".ov-canvas-wrap").appendChild(hint);
  }

  function fullView(id) {
    var inst = instances[id]; if (!inst) return;
    inst.cy.elements().style("display", "element");
    inst.cy.fit(null, 30);
    inst._abstractMode = false;
    var c = document.getElementById(id);
    var hint = c.querySelector(".ov-abstract-hint"); if (hint) hint.remove();
  }

  function togglePathFinder(id) {
    var c = document.getElementById(id), inst = instances[id];
    if (!c || !inst) return;
    var panel = c.querySelector(".ov-pathfinder-panel");
    if (!panel) return;
    if (panel.style.display !== "none") { panel.style.display = "none"; return; }
    panel.style.display = "block";
    var cy = inst.cy;
    var nodeOpts = "";
    cy.nodes().forEach(function(n) {
      nodeOpts += '<option value="' + esc(n.id()) + '">' + esc(n.data("label") || n.id()) + '</option>';
    });
    panel.innerHTML = '<div class="ov-editor-header ov-panel-head">Path Finder<button class="ov-panel-close" data-oi-onclick="this.closest(\'.ov-pathfinder-panel\').style.display=\'none\'">&times;</button></div>'
      + '<div class="ov-pathfinder-body">'
      + '<div class="ov-pf-row"><label>From:</label><select class="ov-pf-select" id="pf-from-' + id + '">' + nodeOpts + '</select></div>'
      + '<div class="ov-pf-row"><label>To:</label><select class="ov-pf-select" id="pf-to-' + id + '">' + nodeOpts + '</select></div>'
      + '<div class="ov-pf-row"><button class="ov-btn ov-btn-primary" data-oi-onclick="ontoink.findPath(\'' + id + '\')">Find Path</button>'
      + '<button class="ov-btn" data-oi-onclick="ontoink.clearPath(\'' + id + '\')">Clear</button></div>'
      + '<div class="ov-pf-result" id="pf-result-' + id + '"></div>'
      + '</div>';
  }

  function findPath(id) {
    var inst = instances[id]; if (!inst) return;
    var cy = inst.cy;
    var fromId = document.getElementById("pf-from-" + id).value;
    var toId = document.getElementById("pf-to-" + id).value;
    var resultEl = document.getElementById("pf-result-" + id);
    if (fromId === toId) { resultEl.innerHTML = '<span style="color:#9ca3af;">Source and target are the same.</span>'; return; }

    // BFS shortest path
    var dijkstra = cy.elements().dijkstra(cy.getElementById(fromId), function() { return 1; });
    var pathTo = dijkstra.pathTo(cy.getElementById(toId));

    if (!pathTo.length) {
      resultEl.innerHTML = '<span style="color:#dc2626;">No path found between these nodes.</span>';
      return;
    }

    // Reset all styles
    cy.elements().style({ "opacity": 0.12 });
    // Highlight path with animation
    var pathNodes = pathTo.nodes(), pathEdges = pathTo.edges();
    pathTo.style("opacity", 1);

    // Animate path nodes sequentially with a pulse effect
    var delay = 0;
    pathNodes.forEach(function(n, i) {
      setTimeout(function() {
        n.style({ "border-width": 4, "border-color": "#f59e0b", "opacity": 1 });
        n.animate({ style: { "border-width": 3 } }, { duration: 300 });
      }, delay);
      delay += 200;
    });
    pathEdges.forEach(function(e) {
      setTimeout(function() {
        e.style({ "width": 4, "line-color": "#f59e0b", "target-arrow-color": "#f59e0b", "opacity": 1 });
        e.animate({ style: { "width": 3 } }, { duration: 400 });
      }, delay);
      delay += 150;
    });

    // Fit to path
    cy.animate({ fit: { eles: pathTo, padding: 60 } }, { duration: 500 });

    // Show result
    var labels = [];
    pathNodes.forEach(function(n) { labels.push(esc(n.data("label") || n.id())); });
    resultEl.innerHTML = '<div class="ov-pf-path-display">' + labels.join(' <span class="ov-pf-arrow">&#x2192;</span> ') + '</div><div style="font-size:11px;color:#6b7280;margin-top:4px;">' + pathNodes.length + ' nodes, ' + pathEdges.length + ' edges</div>';
  }

  function clearPath(id) {
    var inst = instances[id]; if (!inst) return;
    inst.cy.elements().removeStyle();
    inst.cy.elements().style("opacity", 1);
    var r = document.getElementById("pf-result-" + id);
    if (r) r.innerHTML = "";
  }

  // ── SPARQL Query Panel ─────────────────────────────────────────────────

  // Resolve a human-readable label for an IRI using deref cache and graph data
  function resolveIriLabel(iri, inst) {
    if (!iri || iri[0] === '"') return "";
    var dc = inst && inst._derefCache ? inst._derefCache : {};
    var localName = iri.indexOf("#") >= 0 ? iri.split("#").pop() : iri.split("/").pop();
    // Check deref cache first
    if (dc[iri] && dc[iri]["Label"]) return dc[iri]["Label"];
    // Check cytoscape graph
    if (inst && inst.cy) {
      var node = inst.cy.getElementById(iri);
      if (node.length) {
        var lbl = node.data("label");
        if (lbl && lbl !== localName && lbl !== iri) return lbl;
      }
    }
    return "";
  }

  // Build a display label: "human label (LocalName)" or just "LocalName"
  function buildDisplayLabel(iri, fallback, inst) {
    var dc = inst && inst._derefCache ? inst._derefCache : {};
    var localName = iri.indexOf("#") >= 0 ? iri.split("#").pop() : iri.split("/").pop();
    var resolved = dc[iri] && dc[iri]["Label"] ? dc[iri]["Label"] : "";
    var graphLabel = fallback || "";
    if (resolved && (graphLabel === localName || graphLabel === iri || !graphLabel)) {
      return resolved + " (" + localName + ")";
    }
    if (graphLabel && graphLabel !== localName && graphLabel !== iri) {
      return graphLabel + (resolved && resolved !== graphLabel ? " \u2014 " + resolved : "") + " (" + localName + ")";
    }
    return resolved ? resolved + " (" + localName + ")" : graphLabel || localName;
  }

  // Build/refresh the SPARQL catalog and class/property dropdowns
  function buildSparqlCatalog(id) {
    var inst = instances[id]; if (!inst) return;
    var cy = inst.cy, dc = inst._derefCache || {};

    // Build autocomplete catalog from graph + all TTL IRIs + deref cache
    inst._sparqlCatalog = [];
    var seenIris = {};
    cy.nodes().forEach(function(n) { var iri=n.data("iri"); if(iri) { seenIris[iri]=true; var lbl=resolveIriLabel(iri,inst)||n.data("label")||""; inst._sparqlCatalog.push({iri:iri,label:lbl,short:lbl||iri.split("/").pop().split("#").pop(),type:n.data("type")==="Class"?"class":"node"}); }});
    cy.edges().forEach(function(e) { var iri=e.data("iri"); if(iri&&!seenIris[iri]) { seenIris[iri]=true; var lbl=resolveIriLabel(iri,inst)||e.data("label")||""; inst._sparqlCatalog.push({iri:iri,label:lbl,short:lbl||iri.split("/").pop().split("#").pop(),type:"prop"}); }});

    // Enrich catalog with ALL IRIs from the original TTL (properties/classes not in graph)
    var ttlSrc = inst.originalTtl || "";
    if (ttlSrc) {
      var parsedTtl = parseTtlMinimal(ttlSrc);
      var ttlLabels = {};
      var RL2 = "http://www.w3.org/2000/01/rdf-schema#label";
      var RT2 = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
      var RDFS_CLASS = "http://www.w3.org/2000/01/rdf-schema#Class";
      var OWL_CLASS = "http://www.w3.org/2002/07/owl#Class";
      var OWL_OP = "http://www.w3.org/2002/07/owl#ObjectProperty";
      var OWL_DP = "http://www.w3.org/2002/07/owl#DatatypeProperty";
      var RDF_PROP = "http://www.w3.org/1999/02/22-rdf-syntax-ns#Property";
      var knownTypes = {};
      parsedTtl.triples.forEach(function(t) {
        if (t.p === RL2 && t.o[0] === '"') ttlLabels[t.s] = litVal(t.o);
        if (t.p === RT2) {
          if (t.o === OWL_CLASS || t.o === RDFS_CLASS) knownTypes[t.s] = "class";
          else if (t.o === OWL_OP || t.o === OWL_DP || t.o === RDF_PROP) knownTypes[t.s] = "prop";
        }
      });
      var rdfNs = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
      var rdfsNs = "http://www.w3.org/2000/01/rdf-schema#";
      var owlNs = "http://www.w3.org/2002/07/owl#";
      var xsdNs = "http://www.w3.org/2001/XMLSchema#";
      var shNs = "http://www.w3.org/ns/shacl#";
      parsedTtl.triples.forEach(function(t) {
        [t.s, t.p, t.o].forEach(function(u) {
          if (!u || u[0] === '"' || u[0] === "_" || seenIris[u]) return;
          if (u.indexOf(rdfNs) === 0 || u.indexOf(rdfsNs) === 0 || u.indexOf(owlNs) === 0 || u.indexOf(xsdNs) === 0 || u.indexOf(shNs) === 0) return;
          seenIris[u] = true;
          var label = ttlLabels[u] || (dc[u] && dc[u]["Label"]) || "";
          var type = knownTypes[u] || (u === t.p ? "prop" : "node");
          inst._sparqlCatalog.push({ iri: u, label: label, short: label || uriLabel(u, parsedTtl.prefixes), type: type });
        });
      });
    }
    // Add all entries from deref cache not yet in catalog
    if (dc) {
      for (var cachedIri in dc) {
        if (seenIris[cachedIri] || !dc[cachedIri]["Label"]) continue;
        seenIris[cachedIri] = true;
        var cType = (dc[cachedIri]["Type"] || "").toLowerCase();
        inst._sparqlCatalog.push({ iri: cachedIri, label: dc[cachedIri]["Label"], short: dc[cachedIri]["Label"], type: cType.indexOf("property") >= 0 ? "prop" : "class" });
      }
      // Update existing entries that have no label yet
      inst._sparqlCatalog.forEach(function(item) {
        if (!item.label && item.iri && dc[item.iri] && dc[item.iri]["Label"]) {
          item.label = dc[item.iri]["Label"];
          item.short = dc[item.iri]["Label"];
        }
      });
    }
    ["SELECT","WHERE","FILTER","OPTIONAL","GROUP BY","ORDER BY","LIMIT","COUNT","DISTINCT","CONTAINS","LCASE","STR","BIND","VALUES"].forEach(function(kw) { inst._sparqlCatalog.push({iri:"",label:kw,short:kw,type:"keyword"}); });
  }

  // Build dropdown HTML for class/property selects
  function buildSparqlDropdowns(id) {
    var inst = instances[id]; if (!inst) return {};
    var cy = inst.cy;
    var classOpts = '<option value="">-- class --</option>';
    var propOpts = '<option value="">-- property --</option>';
    var seenC = {}, seenP = {};
    cy.nodes().forEach(function(n) {
      var iri = n.data("iri"); if (!iri || seenC[iri]) return; seenC[iri] = true;
      if (n.data("type") === "Class") classOpts += '<option value="' + esc(iri) + '">' + esc(buildDisplayLabel(iri, n.data("label"), inst)) + '</option>';
    });
    cy.edges().forEach(function(e) {
      var iri = e.data("iri"); if (!iri || seenP[iri]) return; seenP[iri] = true;
      propOpts += '<option value="' + esc(iri) + '">' + esc(buildDisplayLabel(iri, e.data("label"), inst)) + '</option>';
    });
    return { classOpts: classOpts, propOpts: propOpts };
  }

  function toggleSparql(id) {
    var c = document.getElementById(id), inst = instances[id];
    if (!c || !inst) return;
    var panel = c.querySelector(".ov-sparql-panel");
    if (!panel) return;
    if (panel.style.display !== "none") { panel.style.display = "none"; return; }
    panel.style.display = "block";

    // Always refresh catalog and dropdowns (ontology fetch may have completed since last open)
    buildSparqlCatalog(id);
    var dd = buildSparqlDropdowns(id);

    if (panel.querySelector(".ov-sparql-textarea")) {
      // Panel already built — just refresh the dropdowns
      var classSel = panel.querySelector(".ov-sparql-class-sel");
      var propSel = panel.querySelector(".ov-sparql-prop-sel");
      var prevClass = classSel ? classSel.value : "";
      var prevProp = propSel ? propSel.value : "";
      if (classSel) { classSel.innerHTML = dd.classOpts; classSel.value = prevClass; }
      if (propSel) { propSel.innerHTML = dd.propOpts; propSel.value = prevProp; }
      return;
    }

    var isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    var acHint = isMac ? "⌥/ (Option-Slash) for autocomplete" : "Ctrl+Space or Alt+/ for autocomplete";
    panel.innerHTML = '<div class="ov-editor-header ov-panel-head">SPARQL Query <span style="font-size:10px;font-weight:400;color:#9ca3af;text-transform:none;">' + acHint + '</span><button class="ov-panel-close" data-oi-onclick="this.closest(\'.ov-sparql-panel\').style.display=\'none\'">&times;</button></div>'
      + '<div class="ov-sparql-body">'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;">'
      + '<select class="ov-shape-select" data-oi-onchange="ontoink.sparqlTemplate(\'' + id + '\',this.value)"><option value="">Template...</option><option value="all">All triples</option><option value="type">Instances of class</option><option value="props">Properties of class</option><option value="label">Find by label</option></select>'
      + '<select class="ov-shape-select ov-sparql-class-sel">' + dd.classOpts + '</select>'
      + '<select class="ov-shape-select ov-sparql-prop-sel">' + dd.propOpts + '</select>'
      + '</div>'
      + '<div style="position:relative;"><textarea class="ov-sparql-textarea" rows="6">SELECT ?s ?p ?o WHERE {\n  ?s ?p ?o\n} LIMIT 20</textarea></div>'
      + '<div class="ov-editor-actions"><button class="ov-btn ov-btn-primary" data-oi-onclick="ontoink.runSparql(\'' + id + '\')">Run Query</button>'
      + '<button class="ov-btn" data-oi-onclick="ontoink.sparqlHighlight(\'' + id + '\')">Highlight Results</button></div>'
      + '<div class="ov-sparql-result"></div>'
      + '</div>';

    // Wire autocomplete shortcuts. macOS reserves Cmd+Space (Spotlight) and
    // by default Ctrl+Space (previous input source) — so we also accept Alt+/
    // (Option+/ on Mac) as a universally-available trigger.
    var ta = panel.querySelector(".ov-sparql-textarea");
    ta.addEventListener("keydown", function(e) {
      var isCtrlSpace = (e.ctrlKey || e.metaKey) && e.key === " ";
      var isAltSlash = e.altKey && e.key === "/";
      if (isCtrlSpace || isAltSlash) { e.preventDefault(); showSparqlAC(id, ta); }
      if (e.key === "Escape") hideSparqlAC(id);
      if (e.key === "Tab") {
        var acEl = panel.querySelector(".ov-sparql-ac");
        if (acEl && acEl.style.display !== "none" && acEl._matches && acEl._matches.length) { e.preventDefault(); selectSparqlAC(id, 0); }
      }
    });
    ta.addEventListener("input", function() {
      var acEl = panel.querySelector(".ov-sparql-ac");
      if (acEl && acEl.style.display !== "none") showSparqlAC(id, ta);
    });
    ta.addEventListener("blur", function() {
      setTimeout(function() {
        var acEl2 = panel.querySelector(".ov-sparql-ac");
        if (acEl2 && acEl2.contains(document.activeElement)) return;
        hideSparqlAC(id);
      }, 250);
    });
  }

  function sparqlTemplate(id, t) {
    var c = document.getElementById(id);
    var cls = c.querySelector(".ov-sparql-class-sel").value;
    var prop = c.querySelector(".ov-sparql-prop-sel").value;
    var ta = c.querySelector(".ov-sparql-textarea");
    if (t === "all") ta.value = "SELECT ?s ?p ?o WHERE {\n  ?s ?p ?o\n} LIMIT 20";
    else if (t === "type") ta.value = "SELECT ?s WHERE {\n  ?s a <" + (cls || "CLASS_IRI") + "> .\n} LIMIT 50";
    else if (t === "props") ta.value = "SELECT ?prop (COUNT(?val) AS ?count) WHERE {\n  ?s a <" + (cls || "CLASS_IRI") + "> ;\n     ?prop ?val .\n} GROUP BY ?prop ORDER BY DESC(?count)";
    else if (t === "label") ta.value = 'SELECT ?s ?label WHERE {\n  ?s <http://www.w3.org/2000/01/rdf-schema#label> ?label .\n} LIMIT 50';
  }

  // Inline SPARQL autocomplete with search field
  function getSparqlACMatches(catalog, query) {
    if (!query) return catalog.slice(0, 12).map(function(item){return {item:item,score:1};});
    var matches = [];
    catalog.forEach(function(item) {
      var score = Math.max(fuzzyMatch(item.short, query), fuzzyMatch(item.label, query), item.iri ? fuzzyMatch(item.iri, query) : 0);
      if (score > 0) matches.push({item:item, score:score});
    });
    matches.sort(function(a,b){return b.score-a.score;});
    return matches.slice(0, 12);
  }

  function renderSparqlACItem(id, item, i) {
    var typeColor = item.type==="class"?"#6366f1":item.type==="prop"?"#0891b2":item.type==="node"?"#f59e0b":"#9ca3af";
    var localName = item.iri ? item.iri.split("/").pop().split("#").pop() : "";
    var displayLabel = item.label || item.short || localName;
    // Show label AND local name when they differ (so user sees both human label and IRI fragment)
    var showLocalName = item.iri && localName && displayLabel !== localName;
    return '<div style="padding:5px 10px;cursor:pointer;display:flex;align-items:center;gap:6px;border-bottom:1px solid #f3f4f6;" data-oi-onmousedown="ontoink.selectSparqlAC(\'' + id + '\',' + i + ')">'
      + '<span style="background:'+typeColor+';color:#fff;font-size:9px;padding:1px 5px;border-radius:3px;font-weight:600;">'+item.type+'</span>'
      + '<span style="color:#1f2937;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(displayLabel) + '</span>'
      + (showLocalName ? '<span style="color:#9ca3af;font-size:10px;white-space:nowrap;" title="'+esc(item.iri)+'">'+esc(localName)+'</span>' : '')
      + '</div>';
  }

  function showSparqlAC(id, ta) {
    var inst = instances[id]; if (!inst || !inst._sparqlCatalog) return;
    var pos = ta.selectionStart || 0, text = ta.value || "";
    var start = pos;
    while (start > 0 && /[^\s<>{}();\n]/.test(text[start-1])) start--;
    var word = text.substring(start, pos) || "";

    var panel = document.getElementById(id).querySelector(".ov-sparql-panel");
    var acEl = panel.querySelector(".ov-sparql-ac");
    if (!acEl) {
      acEl = document.createElement("div"); acEl.className = "ov-sparql-ac";
      acEl.style.cssText = "position:absolute;z-index:1000;background:#fff;border:1px solid #d1d5db;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.12);max-height:280px;overflow:hidden;font-size:12px;min-width:300px;bottom:100%;left:0;margin-bottom:4px;display:flex;flex-direction:column;";
      ta.parentElement.appendChild(acEl);
    }
    acEl.style.display = "flex";

    var searchVal = acEl._searchVal || word;
    var matches = getSparqlACMatches(inst._sparqlCatalog, searchVal);

    var h = '<div style="padding:5px 8px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:6px;">'
      + '<span style="color:#9ca3af;font-size:13px;">&#x1F50D;</span>'
      + '<input class="ov-sparql-ac-search" type="text" value="' + (searchVal||"").replace(/"/g,'&quot;') + '" placeholder="Search..." '
      + 'style="flex:1;padding:4px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;color:#374151;background:#fff;outline:none;">'
      + '</div><div class="ov-sparql-ac-list" style="overflow-y:auto;max-height:230px;">';
    matches.forEach(function(m, i) { h += renderSparqlACItem(id, m.item, i); });
    h += '</div>';
    acEl.innerHTML = h;
    acEl._matches = matches; acEl._start = start; acEl._pos = pos;

    // Wire search input
    var si = acEl.querySelector(".ov-sparql-ac-search");
    si.addEventListener("input", function() {
      acEl._searchVal = si.value;
      var m2 = getSparqlACMatches(inst._sparqlCatalog, si.value);
      acEl._matches = m2;
      var list = acEl.querySelector(".ov-sparql-ac-list");
      var h2 = "";
      m2.forEach(function(m, i) { h2 += renderSparqlACItem(id, m.item, i); });
      list.innerHTML = h2;
    });
    si.addEventListener("keydown", function(e) {
      if (e.key === "Escape") { hideSparqlAC(id); ta.focus(); }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (acEl._matches && acEl._matches.length) selectSparqlAC(id, 0);
      }
    });
    setTimeout(function() { si.focus(); si.selectionStart = si.selectionEnd = si.value.length; }, 10);
  }

  function selectSparqlAC(id, index) {
    var panel = document.getElementById(id).querySelector(".ov-sparql-panel");
    var acEl = panel.querySelector(".ov-sparql-ac");
    if (!acEl || !acEl._matches) return;
    var item = acEl._matches[index].item;
    var ta = panel.querySelector(".ov-sparql-textarea");
    var text = ta.value;
    var insert = item.type === "keyword" ? item.short : "<" + item.iri + ">";
    ta.value = text.substring(0, acEl._start) + insert + text.substring(acEl._pos);
    ta.selectionStart = ta.selectionEnd = acEl._start + insert.length;
    acEl._searchVal = "";
    ta.focus();
    hideSparqlAC(id);
  }

  function hideSparqlAC(id) {
    var panel = document.getElementById(id)?.querySelector(".ov-sparql-panel");
    if (!panel) return;
    var acEl = panel.querySelector(".ov-sparql-ac");
    if (acEl) { acEl.style.display = "none"; acEl._searchVal = ""; }
  }

  function runSparql(id) {
    var inst = instances[id]; if (!inst) return;
    var c = document.getElementById(id);
    var query = c.querySelector(".ov-sparql-textarea").value.trim();
    var resultEl = c.querySelector(".ov-sparql-result");
    if (!query) return;

    // Simple SPARQL SELECT parser over the TTL triples
    var ttl = getEditorValue(id) || inst.originalTtl;
    var parsed = parseTtlMinimal(ttl);
    var triples = parsed.triples, pf = parsed.prefixes;

    // Parse SELECT variables and WHERE pattern
    var selMatch = query.match(/SELECT\s+([\s\S]*?)\s+WHERE\s*\{([\s\S]*?)\}/i);
    if (!selMatch) { resultEl.innerHTML = '<span style="color:#dc2626;">Could not parse query. Use basic SELECT ... WHERE { ... } syntax.</span>'; return; }

    var vars = selMatch[1].trim().split(/\s+/);
    var patterns = selMatch[2].trim().split(/\s*\.\s*/).filter(function(p) { return p.trim(); });
    var limitMatch = query.match(/LIMIT\s+(\d+)/i);
    var limit = limitMatch ? parseInt(limitMatch[1]) : 100;

    // Resolve prefixed names in patterns
    function resolve(t) {
      t = t.trim();
      if (t === "a") return "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
      if (t[0] === "<" && t[t.length - 1] === ">") return t.slice(1, -1);
      var ci = t.indexOf(":");
      if (ci >= 0) { var p = t.substring(0, ci); if (pf[p]) return pf[p] + t.substring(ci + 1); }
      return t;
    }

    // Execute: simple single-pattern match
    var results = [];
    if (patterns.length === 1) {
      var parts = patterns[0].trim().split(/\s+/);
      if (parts.length >= 3) {
        var sp = parts[0], pp = parts[1], op = parts.slice(2).join(" ");
        var sVar = sp[0] === "?", pVar = pp[0] === "?", oVar = op[0] === "?";
        var sVal = sVar ? null : resolve(sp), pVal = pVar ? null : resolve(pp), oVal = oVar ? null : resolve(op);

        triples.forEach(function(t) {
          if (!sVar && t.s !== sVal) return;
          if (!pVar && t.p !== pVal) return;
          if (!oVar && t.o !== oVal) return;
          var row = {};
          if (sVar) row[sp] = t.s;
          if (pVar) row[pp] = t.p;
          if (oVar) row[op] = t.o;
          results.push(row);
        });
      }
    } else {
      // For multi-pattern: just match all triples (simplified)
      triples.forEach(function(t) {
        var row = {};
        vars.forEach(function(v) {
          if (v === "?s") row[v] = t.s;
          if (v === "?p") row[v] = t.p;
          if (v === "?o") row[v] = t.o;
        });
        results.push(row);
      });
    }

    results = results.slice(0, limit);
    inst._sparqlResults = results;

    if (!results.length) { resultEl.innerHTML = '<span style="color:#9ca3af;">No results.</span>'; return; }

    // v0.7.0 — SPARQL → LOD/Attic integration.
    // If the SELECT projected ?s ?p ?o (the canonical triple pattern),
    // materialise the rows into cytoscape elements so they participate in
    // the SAME LOD slider + Attic UX as fence-loaded graphs. We do NOT
    // client-side cluster — Leiden runs at build time only. Surface the
    // trade-off as a small info pill above the results table.
    var svars = selMatch[1].toLowerCase();
    var hasSPO = /\?s\b/.test(svars) && /\?p\b/.test(svars) && /\?o\b/.test(svars);
    var sparqlNoteHtml = "";
    if (hasSPO) {
      try {
        var raw = triplesToElements(results);
        // Filter out nodes/edges that already exist in cy (avoid duplicates
        // when the fence graph and the SPARQL selection overlap).
        var cy = inst.cy;
        var newNodes = [], newEdges = [];
        for (var ni = 0; ni < raw.nodes.length; ni++) {
          var nEl = raw.nodes[ni];
          if (nEl && nEl.data && !cy.getElementById(nEl.data.id).length) newNodes.push(nEl);
        }
        var edgeSeen = {};
        for (var ei = 0; ei < raw.edges.length; ei++) {
          var eEl = raw.edges[ei];
          if (!eEl || !eEl.data) continue;
          var key = eEl.data.source + "|" + eEl.data.predicate + "|" + eEl.data.target;
          if (edgeSeen[key]) continue;
          edgeSeen[key] = 1;
          // Only add if source & target exist (either in cy already or in new nodes)
          newEdges.push(eEl);
        }
        var filtered = { nodes: newNodes, edges: newEdges };

        // Fold / hide / badge predicates BEFORE they hit cytoscape.
        // inst.policy.{hide,fold,badge} may be empty — the helper is a
        // no-op in that case.
        var sanitised = applyPredicatePolicyToElements(filtered, inst.policy || {});

        if (sanitised.nodes.length || sanitised.edges.length) {
          if (sanitised.nodes.length) cy.add(sanitised.nodes);
          if (sanitised.edges.length) cy.add(sanitised.edges);
          // Merge folded badges so renderNodeBadges() picks them up.
          if (sanitised.node_badges) {
            if (!inst.policy) inst.policy = { hide_at_level: {}, node_badges: {} };
            if (!inst.policy.node_badges) inst.policy.node_badges = {};
            Object.assign(inst.policy.node_badges, sanitised.node_badges);
          }
          // Mark the newly-added elements so the Attic list can show
          // "from SPARQL" chips downstream, and so a page reload knows
          // to re-run the query to restore them.
          inst._sparqlSourced = true;
          for (var mi = 0; mi < sanitised.nodes.length; mi++) {
            var mn = sanitised.nodes[mi];
            if (mn && mn.data) mn.data.fromSparql = true;
          }
          // Settle at the current LOD slider position — SPARQL elements
          // whose floor exceeds the level land in the Attic identically
          // to fence-loaded ones.
          setLodLevel(id, inst.lodLevel);
        }
        sparqlNoteHtml = '<div class="ov-sparql-note" title="Community detection runs at build time only. LOD slider and Attic still work for live results.">'
                      + 'SPARQL results — clustering unavailable for live queries'
                      + '</div>';
      } catch (mErr) {
        // Materialisation must never break the table render.
        sparqlNoteHtml = '<div class="ov-sparql-note" style="background:#fef2f2;color:#991b1b;border-color:#fecaca;">'
                      + 'Could not materialise results into the graph: ' + esc(String(mErr && mErr.message || mErr))
                      + '</div>';
      }
    }

    // Render table with labels
    var h = sparqlNoteHtml
          + '<div style="font-size:12px;color:#374151;margin-bottom:6px;"><strong>' + results.length + '</strong> result(s)</div>';
    h += '<table class="ov-inferred-table"><thead><tr>';
    vars.forEach(function(v) { h += '<th>' + esc(v) + '</th>'; });
    h += '</tr></thead><tbody>';
    results.forEach(function(row) {
      h += '<tr>';
      vars.forEach(function(v) {
        var val = row[v] || "";
        if (val[0] === '"') {
          // Literal value
          h += '<td style="color:#059669;">' + esc(litVal(val)) + '</td>';
        } else if (val.indexOf("http") === 0) {
          // IRI — show label + prefixed name
          var label = resolveIriLabel(val, inst);
          var display = val;
          for (var p in pf) { if (val.indexOf(pf[p]) === 0) { display = p + ":" + val.substring(pf[p].length); break; } }
          if (label) {
            h += '<td title="' + esc(val) + '"><span style="color:#1f2937;">' + esc(label) + '</span> <span style="color:#9ca3af;font-size:11px;">(' + esc(display) + ')</span></td>';
          } else {
            h += '<td title="' + esc(val) + '">' + esc(display) + '</td>';
          }
        } else {
          h += '<td>' + esc(val) + '</td>';
        }
      });
      h += '</tr>';
    });
    h += '</tbody></table>';
    resultEl.innerHTML = h;
  }

  function sparqlHighlight(id) {
    var inst = instances[id]; if (!inst || !inst._sparqlResults) return;
    var cy = inst.cy;
    var uris = new Set();
    inst._sparqlResults.forEach(function(row) {
      Object.values(row).forEach(function(v) { if (v) uris.add(v); });
    });
    cy.elements().style("opacity", 0.12);
    cy.nodes().forEach(function(n) { if (uris.has(n.id()) || uris.has(n.data("iri"))) n.style("opacity", 1); });
    cy.edges().forEach(function(e) { if (uris.has(e.data("iri")) || uris.has(e.data("source")) || uris.has(e.data("target"))) e.style("opacity", 1); });
  }

  // ── Auto-init ──────────────────────────────────────────────────────────

  // ── Playground browser reasoning ─────────────────────────────────────
  //
  // The playground page is pure-browser. We expose three reasoner sources:
  //   - "browser"  → rdf-reasoner-konclude (Konclude WASM, needs cross-origin isolation)
  //   - "server"   → POST /reason on the same origin (Docker `api` mode or self-hosted)
  //   - "auto"     → browser first if isolated, else server, else error
  //
  // Each is enabled only if reachable (checked lazily, results cached).

  var _wasmReasoner = null;        // memoized RdfReasoner instance
  var _serverAvailable = null;     // tri-state: null = unknown, true/false
  var _browserAvailable = null;

  function isBrowserReasonerAvailable() {
    return typeof window !== "undefined" && window.crossOriginIsolated === true;
  }
  function probeServerReasoner() {
    if (_serverAvailable !== null) return Promise.resolve(_serverAvailable);
    return fetch("/health", { method: "GET" })
      .then(function(r) { _serverAvailable = r.ok; return _serverAvailable; })
      .catch(function() { _serverAvailable = false; return false; });
  }

  function populateReasonerSelect(selectEl) {
    if (!selectEl) return;
    var browserOk = isBrowserReasonerAvailable();
    _browserAvailable = browserOk;
    var options = [
      { value: "auto",            label: "Auto (best available)", enabled: true },
      { value: "browser",         label: browserOk ? "Browser: Konclude WASM" : "Browser: Konclude WASM (needs cross-origin isolation)", enabled: browserOk },
      { value: "server:auto",     label: "Server: Auto",                  enabled: true,  isServer: true },
      { value: "server:konclude", label: "Server: Konclude (native)",     enabled: true,  isServer: true },
      { value: "server:owlready2",label: "Server: HermiT (owlready2)",    enabled: true,  isServer: true },
      { value: "server:konclude-wasm", label: "Server: Konclude (WASM CLI)", enabled: true, isServer: true },
      { value: "server:owlrl",    label: "Server: OWL-RL (Python)",       enabled: true,  isServer: true },
    ];
    selectEl.innerHTML = options.map(function(o) {
      return '<option value="' + o.value + '"' + (o.enabled ? "" : " disabled") + '>' + esc(o.label) + '</option>';
    }).join("");
    // Per-diagram default from the fence `reasoner:` option (data-reasoner).
    // Bare backend names (e.g. "owlrl") map to the matching "server:*" option;
    // "auto"/"browser" are taken as-is. Falls back to the usual default when
    // unset or unavailable.
    var def = browserOk ? "browser" : "auto";
    var container = selectEl.closest(".ontoink-container");
    var preferred = container ? (container.getAttribute("data-reasoner") || "") : "";
    if (preferred) {
      var cand = (preferred === "auto" || preferred === "browser" || preferred.indexOf(":") >= 0) ? preferred : ("server:" + preferred);
      if (options.some(function(o) { return o.value === cand && o.enabled; })) def = cand;
    }
    selectEl.value = def;

    // When the user changes the backend, run again immediately so the result
    // reflects the new choice instead of keeping the previous cached output.
    selectEl.addEventListener("change", function() {
      var container = selectEl.closest(".ontoink-container");
      if (!container) return;
      var inst = instances[container.id];
      if (!inst || inst._reasoningInFlight) return;
      // Only auto-run if a result is already visible — otherwise wait for the user to click Reasoning
      var panel = container.querySelector(".ov-reasoning-panel");
      if (panel && panel.style.display === "block" && inst._lastReasoning) {
        togglePlaygroundReasoning(container.id, true /* forceRerun */);
      }
    });

    // Probe server in background and disable server-* options if offline
    probeServerReasoner().then(function(ok) {
      if (!ok) {
        selectEl.querySelectorAll('option[value^="server"]').forEach(function(opt) {
          opt.disabled = true;
          if (!/offline/.test(opt.textContent)) opt.textContent = opt.textContent + " (offline)";
        });
      }
    });
  }

  // v0.7.3 — Resolve the vendored bundle RELATIVE to the current page via
  // ONTOINK_ASSET_BASE (injected per-page by the MkDocs plugin as e.g.
  // "../../assets/"). The previous hardcoded root-absolute
  // "/assets/reasoner/bundle.mjs" only worked when the site was served at
  // the domain root (Docker `all` mode) — on ANY sub-path deploy (GitHub
  // Pages project sites at /ontoink/…, the FIZ matwerk deploy at
  // /matwerk/…) it resolved to the domain root, 404'd, silently fell back
  // to esm.sh, and the cross-origin Worker died during init.
  function _reasonerBundleUrl() {
    var base = (typeof window !== "undefined" && window.ONTOINK_ASSET_BASE) || "/assets/";
    // Make it absolute so error messages show exactly what was fetched.
    try { return new URL(base + "reasoner/bundle.mjs", location.href).href; }
    catch (e) { return base + "reasoner/bundle.mjs"; }
  }

  function loadBrowserReasoner() {
    if (_wasmReasoner) return Promise.resolve(_wasmReasoner);
    if (!isBrowserReasonerAvailable()) {
      return Promise.reject(new Error("Browser reasoner needs cross-origin isolation (COOP/COEP). Add the coi-serviceworker, or use the Server option."));
    }
    // Prefer the same-origin vendored bundle (works around the cross-origin
    // Worker restriction that fails for esm.sh). Fall back to esm.sh only if
    // the bundle is not deployed (e.g. an embed host without the vendor copy).
    function loadVendored() {
      return import(_reasonerBundleUrl()).then(function(mod) {
        // The bundle re-exports both rdf-reasoner-konclude AND n3 Store/Parser
        return { Konclude: mod, N3: mod };
      });
    }
    function loadCdn() {
      return Promise.all([
        import("https://esm.sh/rdf-reasoner-konclude@0.1.0"),
        import("https://esm.sh/n3@1.22.0"),
      ]).then(function(mods) { return { Konclude: mods[0], N3: mods[1] }; });
    }
    return loadVendored().catch(function() { return loadCdn(); }).then(function(ctx) {
      var reasoner = new ctx.Konclude.RdfReasoner();
      _wasmReasoner = { reasoner: reasoner, N3: ctx.N3, Konclude: ctx.Konclude };
      return _wasmReasoner;
    });
  }

  function reasonInBrowser(ttl, log) {
    log = log || function() {};
    return loadBrowserReasoner().then(function(ctx) {
      log("WASM module loaded. Parsing TTL into N3 store…");
      var store = new ctx.N3.Store();
      var parser = new ctx.N3.Parser({ format: "Turtle" });
      return new Promise(function(resolve, reject) {
        parser.parse(ttl, function(err, quad) {
          if (err) return reject(err);
          if (quad) store.addQuad(quad);
          else { log("Parsed " + store.size + " triples"); resolve(store); }
        });
      });
    }).then(function(store) {
      var ctx = _wasmReasoner;
      log("Waiting for Konclude WASM to be ready…");
      return ctx.reasoner.ready.catch(function(e) {
        // "Worker error" comes from an internal Worker.onerror handler that
        // strips detail. Capture what we can and rethrow with a clearer message.
        var msg = (e && e.message) || String(e);
        throw new Error(
          msg + " — the WASM worker died during init. Likely cause: " +
          "the reasoner bundle is being loaded cross-origin (browsers refuse " +
          "to spawn cross-origin module workers even with COEP credentialless). " +
          "Verify " + _reasonerBundleUrl() + " is reachable — " +
          "if it 404s, rebuild the site with ontoink >= 0.7.3 (the plugin " +
          "ships and installs the bundle automatically), or use a Server reasoner instead."
        );
      }).then(function() {
        log("Running classification + realization…");
        function quadRow(q) {
          var s = q.subject.value, p = q.predicate.value, o = q.object;
          var isLit = o.termType === "Literal";
          return {
            s: s, p: p, o: o.value, isLiteral: isLit,
            sLabel: s.split(/[#/]/).pop(),
            pLabel: p.split(/[#/]/).pop(),
            oLabel: isLit ? o.value : o.value.split(/[#/]/).pop(),
          };
        }
        var unwound = false;
        return ctx.reasoner.reason(store).catch(function(e) {
          // Emscripten unwinds the WASM call stack on program exit by throwing a
          // sentinel value ("unwind" / "Error: unwind"). Our vendored worker.js
          // swallows it in the classify RPC (v0.7.3), but the esm.sh fallback
          // ships the UNPATCHED upstream worker where the sentinel escapes and
          // reason() rejects BEFORE its getInferredNTriples harvest step. If
          // Konclude already populated the inferred graph, the run actually
          // succeeded — treat 'unwind' as non-fatal and let the collector below
          // verify / recover. Any other error is a real failure, re-thrown.
          var m = (e && (e.message || e.name)) || String(e);
          if (!/unwind/i.test(m)) throw e;
          unwound = true;
          log("Konclude unwound the WASM stack on exit (Emscripten); checking for results…");
        }).then(function() {
          var inferred = store.getQuads(null, null, null, ctx.Konclude.INFERRED_GRAPH_IRI);
          if (unwound && !inferred.length) {
            // v0.7.3 — reason() rejected before its own harvest step, but the
            // C++ reasoner instance in the worker survives the unwind (the
            // Node build relies on the same fact). Ask it directly for the
            // inferred triples instead of giving up. Timeboxed: if the worker
            // really is dead the RPC would otherwise hang forever.
            log("No results in the store after unwind — harvesting directly from the worker…");
            var fail = new Error(
              "Konclude WASM aborted with 'unwind' before producing any inferences — " +
              "an Emscripten exit/Asyncify issue in the in-browser worker. Pick a " +
              "Server reasoner in the dropdown (same Konclude engine, runs in Node and works)."
            );
            if (!ctx.reasoner || typeof ctx.reasoner._call !== "function") throw fail;
            var harvest = ctx.reasoner._call("getInferredNTriples").then(function(nt) {
              return new Promise(function(resolve, reject) {
                var got = [];
                new ctx.N3.Parser({ format: "N-Triples" }).parse(String(nt || ""), function(err, quad) {
                  if (err) return reject(fail);
                  if (quad) { got.push(quad); return; }
                  log("Recovered " + got.length + " inferred triple(s) from the worker after unwind");
                  resolve(got.map(quadRow));
                });
              });
            }, function() { throw fail; });
            var timeout = new Promise(function(_, reject) {
              setTimeout(function() { reject(fail); }, 15000);
            });
            return Promise.race([harvest, timeout]);
          }
          log("Konclude finished. Collecting " + inferred.length + " inferred quad(s)…");
          return inferred.map(quadRow);
        });
      });
    });
  }

  function reasonOnServer(ttl, reasoner, abortCtl) {
    var opts = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: ttl, reasoner: reasoner || null }),
    };
    if (abortCtl) opts.signal = abortCtl.signal;
    return fetch("/reason", opts).then(function(r) {
      if (!r.ok) throw new Error("/reason returned HTTP " + r.status);
      return r.json();
    }).then(function(data) { return data.inferred || []; });
  }

  function togglePlaygroundReasoning(id, forceRerun) {
    var c = document.getElementById(id); if (!c) return;
    var panel = c.querySelector(".ov-reasoning-panel"); if (!panel) return;
    var inst = instances[id]; if (!inst) { alert("Visualize a graph first."); return; }

    // If reasoning is in flight, just surface the panel — never start a second run
    if (inst._reasoningInFlight) {
      panel.style.display = "block";
      return;
    }

    // Determine current dropdown selection
    var dd = c.querySelector(".ov-reasoner-select") || document.getElementById("pg-reasoner-select");
    var currentChoice = dd ? dd.value : "auto";

    // If we have a cached result AND the user hasn't changed the backend AND we're not forcing a re-run,
    // show the cached panel. Otherwise re-run fresh so the user sees their selection actually applied.
    if (inst._lastReasoning && !forceRerun && inst._lastReasoning.backend === currentChoice) {
      panel.style.display = "block";
      renderResultPanel(id, inst._lastReasoning);
      return;
    }

    var ttl = inst.editor ? inst.editor.getValue() : (inst.originalTtl || "");
    if (!ttl.trim()) { alert("No TTL data to reason over."); return; }

    // Find the reasoner dropdown within this container, fall back to legacy id
    var selectEl = c.querySelector(".ov-reasoner-select") || document.getElementById("pg-reasoner-select");
    var choice = selectEl ? selectEl.value : "auto";
    var t0 = performance.now();
    var logs = [];
    var abortCtl = ("AbortController" in window) ? new AbortController() : null;
    // Lock the toolbar controls while reasoning is in flight
    var reasonBtn = c.querySelector('.ov-toolbar button[onclick*="toggleReasoning"], .ov-toolbar button[onclick*="togglePlaygroundReasoning"]');
    function setLock(locked) {
      inst._reasoningInFlight = locked;
      if (selectEl) selectEl.disabled = locked;
      if (reasonBtn) { reasonBtn.disabled = locked; reasonBtn.style.opacity = locked ? "0.6" : ""; }
    }
    function log(msg) {
      var t = (performance.now() - t0).toFixed(0);
      logs.push("[" + t.padStart(5) + "ms] " + msg);
      renderPanel("running");
    }

    function renderPanel(state, inferred, err) {
      var statusHtml = "";
      if (state === "running") {
        var stopId = id + "-stop-reasoning";
        statusHtml = '<div style="padding:10px 12px;color:#0891b2;display:flex;align-items:center;gap:10px;">' +
          '<div class="ov-spinner"></div>' +
          '<div>Reasoning… <span style="color:#6b7280;font-size:11px;">(' + esc(choice) + ')</span></div>' +
          '<button id="' + stopId + '" class="ov-chip ov-chip-danger" style="margin-left:auto;">⏹ Stop</button>' +
          '</div>';
        setTimeout(function() {
          var btn = document.getElementById(stopId);
          if (btn) btn.addEventListener("click", function() {
            if (abortCtl) abortCtl.abort();
            inst._reasoningAborted = true;
            log("User cancelled the reasoning request.");
            renderPanel("error", null, new Error("Cancelled by user"));
            setLock(false);
          });
        }, 0);
      } else if (state === "error") {
        var msg = String(err && err.message || err);
        var stack = (err && err.stack) ? String(err.stack) : "";
        statusHtml =
          '<div style="padding:10px 12px;color:#b91c1c;">' +
            '<strong>Reasoning failed:</strong> ' + esc(msg) +
            ' <button class="ov-chip" data-oi-onclick="ontoink.diagnoseReasoner(\'' + id + '\')" style="margin-left:8px;">Run diagnostic</button>' +
            ' <button class="ov-chip" data-oi-onclick="ontoink.togglePlaygroundReasoning(\'' + id + '\')" style="margin-left:4px;">↻ Retry</button>' +
          '</div>' +
          (stack ? '<details style="padding:0 12px 8px;font-size:11px;color:#6b7280;" open><summary style="cursor:pointer;">Stack trace</summary><pre style="background:#111827;color:#fbbf24;padding:10px;border-radius:6px;overflow:auto;max-height:240px;font-family:\'JetBrains Mono\',\'Fira Code\',ui-monospace,monospace;font-size:11px;line-height:1.4;margin:6px 0 0 0;">' + esc(stack) + '</pre></details>' : '');
      }

      // Build the panel HTML
      var headHtml = '<div class="ov-panel-head">Reasoning <button class="ov-panel-close" data-oi-onclick="this.closest(\'.ov-reasoning-panel\').style.display=\'none\'">&times;</button></div>';
      var logsHtml = '<details class="ov-reasoning-logs"' + (state === "error" ? ' open' : '') + '><summary>Reasoning log (' + logs.length + ' entries)</summary><pre>' + esc(logs.join("\n")) + '</pre></details>';

      if (state === "done") {
        // Cache for re-display when user re-clicks Reasoning later
        var elapsed = (performance.now() - t0).toFixed(0);
        inst._lastReasoning = {
          inferred: inferred,
          backend: choice,
          elapsedMs: Number(elapsed),
          logs: logs.slice(),
          inputTriples: ttl.split("\n").length,
        };
        renderResultPanel(id, inst._lastReasoning);
        return;
      }

      panel.innerHTML = headHtml + '<div class="ov-reasoning-body">' + statusHtml + logsHtml + '</div>';
    }

    panel.style.display = "block";
    setLock(true);
    inst._reasoningAborted = false;
    renderPanel("running");

    log("Selected backend: " + choice);
    log("Input size: " + ttl.length + " chars");

    function resolveReasoner() {
      if (choice === "browser") {
        log("Loading rdf-reasoner-konclude (WASM, ~8 MB on first load)…");
        return reasonInBrowser(ttl, log);
      }
      if (choice.indexOf("server:") === 0) {
        var backend = choice.slice("server:".length);
        log("Probing /health…");
        return probeServerReasoner().then(function(ok) {
          if (!ok) throw new Error("Server reasoner not reachable at /reason. Restart the container with ONTOINK_MODE=api or ONTOINK_MODE=all to enable the server endpoint.");
          log("Server reachable. POST /reason with reasoner=" + (backend === "auto" ? "(server default)" : backend));
          return reasonOnServer(ttl, backend === "auto" ? null : backend, abortCtl);
        });
      }
      // auto: prefer browser if isolated, else server, else give a clear error
      if (isBrowserReasonerAvailable()) {
        log("Page is cross-origin isolated. Trying browser WASM reasoner first.");
        return reasonInBrowser(ttl, log).catch(function(e) {
          log("Browser reasoner failed: " + (e.message || e) + ". Falling back to server.");
          return probeServerReasoner().then(function(ok) {
            if (!ok) throw new Error("No reasoner available.");
            return reasonOnServer(ttl, null, abortCtl);
          });
        });
      }
      log("Page is not cross-origin isolated. Routing to server.");
      return probeServerReasoner().then(function(ok) {
        if (!ok) throw new Error("No reasoner available. Reload the page once for the service worker to register (then pick 'Browser: Konclude WASM'), or restart the container with ONTOINK_MODE=api/all.");
        return reasonOnServer(ttl, null, abortCtl);
      });
    }

    resolveReasoner().then(function(inferred) {
      if (inst._reasoningAborted) return;  // user cancelled; renderPanel already updated
      log("Got " + inferred.length + " inferred triples");
      inst.data.inferred = inferred;
      inst._lastReasoning = { inferred: inferred, backend: choice, elapsedMs: performance.now() - t0 };
      renderPanel("done", inferred);
      setLock(false);
    }).catch(function(err) {
      if (inst._reasoningAborted) return;  // suppress error from aborted fetch
      log("Error: " + (err && err.message || err));
      renderPanel("error", null, err);
      setLock(false);
    });
  }

  // Render the result panel from a cached _lastReasoning record. Used both
  // directly after a successful run and when the user re-opens the panel.
  function renderResultPanel(id, last) {
    var c = document.getElementById(id); if (!c) return;
    var panel = c.querySelector(".ov-reasoning-panel"); if (!panel) return;
    var inst = instances[id]; if (!inst) return;

    var inferred = last.inferred || [];
    var count = inferred.length;
    var elapsed = last.elapsedMs;
    var backend = last.backend || "auto";
    var nodeCount = {}, edgeCount = {};
    inferred.forEach(function(t) {
      nodeCount[t.s] = true; if (!t.isLiteral) nodeCount[t.o] = true;
      edgeCount[t.p] = (edgeCount[t.p] || 0) + 1;
    });
    var distinctSubjects = Object.keys(nodeCount).length;
    var distinctProps = Object.keys(edgeCount).length;
    var overlayOn = !!inst._inferredOverlay;

    var statsHtml = '<div class="ov-reasoning-stats">' +
      '<div class="ov-stat"><div class="ov-stat-val">' + count + '</div><div class="ov-stat-lbl">inferred triple' + (count === 1 ? '' : 's') + '</div></div>' +
      '<div class="ov-stat"><div class="ov-stat-val">' + elapsed.toFixed(0) + ' ms</div><div class="ov-stat-lbl">reasoning time</div></div>' +
      '<div class="ov-stat"><div class="ov-stat-val">' + distinctSubjects + '</div><div class="ov-stat-lbl">distinct subjects</div></div>' +
      '<div class="ov-stat"><div class="ov-stat-val">' + distinctProps + '</div><div class="ov-stat-lbl">distinct predicates</div></div>' +
      '<div class="ov-stat"><div class="ov-stat-val" style="text-transform:uppercase;font-size:11px;">' + esc(backend) + '</div><div class="ov-stat-lbl">backend</div></div>' +
      '</div>';

    var actionsHtml = '<div class="ov-reasoning-actions">' +
      '<label class="ov-overlay-toggle"><input type="checkbox" ' + (overlayOn ? "checked" : "") + ' data-oi-onchange="ontoink.setInferredOverlay(\'' + id + '\',this.checked)"> Show inferences on graph</label>' +
      (count ? ' <button class="ov-chip" data-oi-onclick="ontoink.downloadInferences(\'' + id + '\')">Download (N-Triples)</button>' +
               ' <button class="ov-chip" data-oi-onclick="ontoink.copyInferences(\'' + id + '\')">Copy JSON</button>' : '') +
      ' <button class="ov-chip" data-oi-onclick="ontoink.togglePlaygroundReasoning(\'' + id + '\',true)" style="margin-left:auto;">↻ Re-run</button>' +
      '</div>';

    var resultHtml;
    if (count) {
      var rows = inferred.map(function(t) {
        var typeBadge = t.isLiteral ? '<span class="ov-type-badge lit">lit</span>' : '';
        return '<tr><td>' + esc(t.sLabel || t.s) + '</td><td>' + esc(t.pLabel || t.p) + '</td><td>' + esc(t.oLabel || t.o) + typeBadge + '</td></tr>';
      }).join("");
      resultHtml = '<table class="ov-reasoning-table">' +
        '<thead><tr><th>Subject</th><th>Predicate</th><th>Object</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table>';
    } else {
      resultHtml = '<div style="padding:12px;color:#6b7280;">No new inferences derived. The reasoner ran but did not find any triples beyond what is already stated. Try richer OWL declarations (<code>owl:Class</code>, <code>owl:ObjectProperty</code>, instances with <code>rdf:type</code>) or pick a different backend.</div>';
    }

    var logsHtml = '<details class="ov-reasoning-logs"><summary>Reasoning log (' + (last.logs || []).length + ' entries)</summary><pre>' + esc((last.logs || []).join("\n")) + '</pre></details>';

    panel.style.display = "block";
    panel.innerHTML =
      '<div class="ov-panel-head">Reasoning <button class="ov-panel-close" data-oi-onclick="this.closest(\'.ov-reasoning-panel\').style.display=\'none\'">&times;</button></div>' +
      '<div class="ov-reasoning-body">' + statsHtml + actionsHtml + resultHtml + logsHtml + '</div>';

    // If overlay was on previously, ensure it's still applied (e.g. after a Re-run replaced inferences)
    if (overlayOn) setInferredOverlay(id, true);
  }

  // Show or hide inferred triples as overlay edges (and helper nodes) on the graph.
  // Inferred elements get edgeType: "inferred" / data.inferred=true so the
  // cytoscape style block colors them distinctly (configurable via Edit Layout).
  function setInferredOverlay(id, show) {
    var inst = instances[id]; if (!inst || !inst.cy || !inst._lastReasoning) return;
    var cy = inst.cy;
    inst._inferredOverlay = !!show;
    // Always strip current overlay before reapplying
    cy.elements("[?inferred]").remove();
    if (!show) return;

    var inferred = inst._lastReasoning.inferred || [];
    var existingIds = {};
    cy.nodes().forEach(function(n) { existingIds[n.data("id")] = true; });
    inferred.forEach(function(t, i) {
      if (t.isLiteral) return;  // Skip literal triples in the visual overlay
      if (!existingIds[t.s] && !cy.getElementById(t.s).length) {
        cy.add({ group: "nodes", data: { id: t.s, label: t.sLabel || t.s.split(/[#/]/).pop(), type: "Individual", color: "#E6E6E6", shape: "ellipse", iri: t.s, source: "", namespace: "", inferred: true }});
        existingIds[t.s] = true;
      }
      if (!existingIds[t.o] && !cy.getElementById(t.o).length) {
        cy.add({ group: "nodes", data: { id: t.o, label: t.oLabel || t.o.split(/[#/]/).pop(), type: "Individual", color: "#E6E6E6", shape: "ellipse", iri: t.o, source: "", namespace: "", inferred: true }});
        existingIds[t.o] = true;
      }
      cy.add({ group: "edges", data: { id: "inf_" + i + "_" + Math.random().toString(36).slice(2,6), source: t.s, target: t.o, label: t.pLabel || t.p.split(/[#/]/).pop(), iri: t.p, edgeType: "inferred", inferred: true }});
    });
    cy.layout({ name: "dagre", rankDir: "BT", nodeSep: 60, rankSep: 80, animate: true, animationDuration: 300, fit: false, padding: 30 }).run();
    // Refresh the legend so the new "Inferred (OWL)" row appears (or disappears)
    var container = document.getElementById(id);
    if (container && inst.data) { buildLegendOverlay(container, inst.data); buildNsOverlay(container, inst.data); }
  }

  // Run a structured diagnostic and dump the result into the reasoning panel.
  // Tells the user exactly why browser reasoning isn't working (if it isn't).
  function diagnoseReasoner(id) {
    var c = document.getElementById(id); if (!c) return;
    var panel = c.querySelector(".ov-reasoning-panel");
    if (!panel) return;

    var lines = [];
    function row(label, ok, value, hint) {
      var icon = ok === true ? "✓" : ok === false ? "✗" : "?";
      var color = ok === true ? "#15803d" : ok === false ? "#b91c1c" : "#6b7280";
      lines.push(
        '<tr><td style="padding:4px 8px;width:24px;color:' + color + ';font-weight:700;">' + icon + '</td>' +
        '<td style="padding:4px 8px;font-weight:600;">' + esc(label) + '</td>' +
        '<td style="padding:4px 8px;font-family:monospace;font-size:11px;color:#374151;">' + esc(String(value)) + '</td>' +
        '<td style="padding:4px 8px;font-size:11px;color:#6b7280;">' + (hint ? esc(hint) : '') + '</td></tr>'
      );
    }

    row("Secure context (HTTPS or localhost)", window.isSecureContext, window.isSecureContext,
        window.isSecureContext ? "" : "Workers can only load same-origin scripts on non-secure origins");
    row("crossOriginIsolated", window.crossOriginIsolated === true, window.crossOriginIsolated,
        window.crossOriginIsolated ? "" : "Required for SharedArrayBuffer; check COOP/COEP response headers");
    row("SharedArrayBuffer available", typeof SharedArrayBuffer !== "undefined", typeof SharedArrayBuffer !== "undefined",
        typeof SharedArrayBuffer !== "undefined" ? "" : "Konclude WASM pthreads cannot start without it");
    row("Service worker controller", !!(navigator.serviceWorker && navigator.serviceWorker.controller),
        !!(navigator.serviceWorker && navigator.serviceWorker.controller),
        navigator.serviceWorker && navigator.serviceWorker.controller ? "" : "coi-serviceworker not yet active — reload the page once");
    row("Web Workers supported", typeof Worker !== "undefined", typeof Worker !== "undefined", "");
    row("WebAssembly supported", typeof WebAssembly !== "undefined", typeof WebAssembly !== "undefined", "");

    panel.style.display = "block";
    var diagnosticHtml =
      '<div class="ov-panel-head">Reasoner diagnostic <button class="ov-panel-close" data-oi-onclick="this.closest(\'.ov-reasoning-panel\').style.display=\'none\'">&times;</button></div>' +
      '<div class="ov-reasoning-body"><div style="padding:8px 12px;color:#374151;font-size:12px;">Capability check for the browser WASM reasoner. If any row is red, browser reasoning will fail — use the <em>Server</em> option in the dropdown instead.</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:12px;"><tbody>' + lines.join("") + '</tbody></table>' +
      '<div style="padding:10px 12px;border-top:1px solid #e5e7eb;font-size:12px;"><strong>Try loading the WASM module now:</strong> <button class="ov-chip" id="' + id + '-probe-wasm">Probe</button> <span id="' + id + '-probe-result" style="margin-left:8px;color:#6b7280;"></span></div>' +
      '<div style="padding:8px 12px;border-top:1px solid #e5e7eb;font-size:12px;"><strong>Probe server /health:</strong> <button class="ov-chip" id="' + id + '-probe-server">Probe</button> <span id="' + id + '-probe-server-result" style="margin-left:8px;color:#6b7280;"></span></div>' +
      '</div>';
    panel.innerHTML = diagnosticHtml;

    // Wire the probe buttons
    var wasmBtn = document.getElementById(id + "-probe-wasm");
    var wasmOut = document.getElementById(id + "-probe-result");
    if (wasmBtn) wasmBtn.addEventListener("click", function() {
      wasmBtn.disabled = true; wasmOut.textContent = "loading…";
      var t = performance.now();
      loadBrowserReasoner().then(function() {
        wasmOut.textContent = "✓ loaded in " + (performance.now() - t).toFixed(0) + " ms";
        wasmOut.style.color = "#15803d";
      }).catch(function(e) {
        wasmOut.textContent = "✗ " + (e && e.message || e);
        wasmOut.style.color = "#b91c1c";
      }).finally(function() { wasmBtn.disabled = false; });
    });
    var srvBtn = document.getElementById(id + "-probe-server");
    var srvOut = document.getElementById(id + "-probe-server-result");
    if (srvBtn) srvBtn.addEventListener("click", function() {
      srvBtn.disabled = true; srvOut.textContent = "checking…";
      _serverAvailable = null;  // force re-probe
      probeServerReasoner().then(function(ok) {
        srvOut.textContent = ok ? "✓ /health responded" : "✗ /reason endpoint not reachable";
        srvOut.style.color = ok ? "#15803d" : "#b91c1c";
      }).finally(function() { srvBtn.disabled = false; });
    });
  }

  // Download inferred triples as N-Triples (so they're loadable into any RDF tool)
  function downloadInferences(id) {
    var inst = instances[id]; if (!inst || !inst._lastReasoning) return;
    var lines = inst._lastReasoning.inferred.map(function(t) {
      var s = t.s.indexOf("http") === 0 ? "<" + t.s + ">" : "_:" + t.s;
      var p = "<" + t.p + ">";
      var o = t.isLiteral ? '"' + t.o.replace(/"/g, '\\"') + '"' : "<" + t.o + ">";
      return s + " " + p + " " + o + " .";
    });
    var blob = new Blob([lines.join("\n") + "\n"], { type: "application/n-triples" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = id + "-inferred.nt"; a.click();
    URL.revokeObjectURL(a.href);
  }

  function copyInferences(id) {
    var inst = instances[id]; if (!inst || !inst._lastReasoning) return;
    navigator.clipboard.writeText(JSON.stringify(inst._lastReasoning, null, 2)).catch(function() {});
  }

  // ==========================================================================
  // CSP-safe event wiring + programmatic embedding (embeddable build).
  //
  // A strict Content-Security-Policy (script-src 'self', no 'unsafe-inline')
  // blocks inline on* handlers — that is exactly the policy the NFDI-MatWerk
  // curation portal ships. So the fence/runtime markup emits its handlers as
  // data-oi-on* attributes (which the browser never executes as scripts) and
  // this shim attaches the real listeners with addEventListener, interpreting
  // the small fixed handler grammar WITHOUT eval(). It runs on every ontoink
  // page (MkDocs and embedded alike), so the whole library is now CSP-safe.
  // ==========================================================================
  var _OI_EVT = {
    "data-oi-onclick": "click", "data-oi-onchange": "change",
    "data-oi-oninput": "input", "data-oi-onmousedown": "mousedown",
    "data-oi-onkeydown": "keydown"
  };
  var _embedSeq = 0;

  function _oiSplitTop(code, sep) {
    // Split on `sep` at the top level, ignoring separators inside quotes.
    var out = [], cur = "", q = null;
    for (var i = 0; i < code.length; i++) {
      var c = code[i];
      if (q) { cur += c; if (c === q && code[i - 1] !== "\\") q = null; }
      else if (c === "'" || c === '"') { q = c; cur += c; }
      else if (c === sep) { out.push(cur); cur = ""; }
      else cur += c;
    }
    if (cur.length) out.push(cur);
    return out;
  }

  function _oiArg(a, el, ev) {
    a = a.trim();
    if (a === "this") return el;
    if (a === "this.value") return el.value;
    if (a === "this.checked") return el.checked;
    if (a === "event") return ev;
    if (a === "true") return true;
    if (a === "false") return false;
    if (a === "null") return null;
    if (/^-?\d+(\.\d+)?$/.test(a)) return parseFloat(a);
    var m = a.match(/^(['"])([\s\S]*)\1$/);
    if (m) return m[2].replace(/\\'/g, "'").replace(/\\"/g, '"');
    return a;
  }

  function _oiRun(stmt, el, ev) {
    stmt = stmt.trim();
    if (!stmt) return;
    if (stmt === "return false") { if (ev) ev.preventDefault(); return; }
    if (stmt === "event.preventDefault()") { if (ev) ev.preventDefault(); return; }
    if (stmt === "this.parentElement.remove()") {
      if (el.parentElement) el.parentElement.remove(); return;
    }
    var m;
    if ((m = stmt.match(/^ontoink\.([A-Za-z_$][\w$]*)\(([\s\S]*)\)$/))) {
      var fn = api[m[1]];
      if (typeof fn !== "function") return;
      var args = m[2].trim()
        ? _oiSplitTop(m[2], ",").map(function (a) { return _oiArg(a, el, ev); })
        : [];
      fn.apply(api, args);
      return;
    }
    if ((m = stmt.match(/^this\.closest\((['"])([\s\S]+?)\1\)\.style\.display=(['"])([\s\S]*?)\3$/))) {
      var t = el.closest(m[2]); if (t) t.style.display = m[4]; return;
    }
    if ((m = stmt.match(/^this\.closest\((['"])([\s\S]+?)\1\)\.remove\(\)$/))) {
      var t2 = el.closest(m[2]); if (t2) t2.remove(); return;
    }
    // Unknown statement shape — ignored on purpose (no eval, stays strict).
  }

  function _oiWireEl(el) {
    if (!el || el.nodeType !== 1 || el.__oiWired) return;
    var wired = false;
    Object.keys(_OI_EVT).forEach(function (attr) {
      if (!el.hasAttribute(attr)) return;
      var code = el.getAttribute(attr), evName = _OI_EVT[attr];
      el.addEventListener(evName, function (ev) {
        _oiSplitTop(code, ";").forEach(function (st) {
          try { _oiRun(st, el, ev); } catch (e) { /* one bad stmt shouldn't break the UI */ }
        });
      });
      wired = true;
    });
    if (wired) el.__oiWired = true;
  }

  var _OI_SEL = "[" + Object.keys(_OI_EVT).join("],[") + "]";
  function wireHandlers(root) {
    if (!root) return;
    if (root.nodeType === 1) _oiWireEl(root);
    if (root.querySelectorAll) root.querySelectorAll(_OI_SEL).forEach(_oiWireEl);
  }

  var _oiObserving = false;
  function _oiInstallObserver() {
    if (_oiObserving || typeof MutationObserver === "undefined" || !document.body) return;
    _oiObserving = true;
    // Dynamically-created panels/popups (facets, stats, SPARQL, node popups…)
    // carry data-oi-on* handlers too; wire them the moment they're inserted.
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes;
        for (var j = 0; j < added.length; j++) wireHandlers(added[j]);
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  // The interactive toolbar + canvas + panels, identical to the MkDocs fence
  // (ontoink/fence.py) but emitted with data-oi-on* handlers so it works under
  // a strict CSP. Kept in sync with fence.py.
  function _oiEmbedSkeleton(id, o) {
    var height = o.height || "500px";
    var showEditor = o.editor !== false;
    var showReasoning = o.reasoning !== false;
    var editorBtn = showEditor
      ? '<button class="ov-btn ov-btn-accent" data-oi-onclick="ontoink.toggleEditor(\'' + id + '\')" title="Edit TTL & Validate">Edit &amp; Validate</button>' : "";
    var reasoningBtn = showReasoning
      ? '<button class="ov-btn" data-oi-onclick="ontoink.toggleReasoning(\'' + id + '\')" title="Show/hide inferred triples">Reasoning</button>' : "";
    return '' +
      '<div class="ov-toolbar">' +
        '<div class="ov-toolbar-group">' +
          '<button class="ov-btn" data-oi-onclick="ontoink.zoomIn(\'' + id + '\')" title="Zoom in">+</button>' +
          '<button class="ov-btn" data-oi-onclick="ontoink.zoomOut(\'' + id + '\')" title="Zoom out">&minus;</button>' +
          '<button class="ov-btn" data-oi-onclick="ontoink.fit(\'' + id + '\')" title="Fit to view">Fit</button>' +
          '<button class="ov-btn" data-oi-onclick="ontoink.fullscreen(\'' + id + '\')" title="Fullscreen">&#x26F6;</button>' +
          '<select class="ov-layout-select" data-oi-onchange="ontoink.changeLayout(\'' + id + '\',this.value)" title="Layout algorithm">' +
            '<option value="dagre">Dagre</option><option value="cose">Force</option><option value="circle">Circle</option>' +
            '<option value="concentric">Concentric</option><option value="breadthfirst">Tree</option><option value="grid">Grid</option>' +
          '</select>' +
        '</div>' +
        '<div class="ov-toolbar-group">' +
          '<input class="ov-search-input" type="text" placeholder="Search..." data-oi-oninput="ontoink.search(\'' + id + '\',this.value)" title="Fuzzy search nodes &amp; edges">' +
        '</div>' +
        '<div class="ov-toolbar-group">' +
          '<label class="ov-lod-label" title="Level of Detail">LOD</label>' +
          '<select class="ov-lod-select" data-oi-onchange="ontoink.setLodLevel(\'' + id + '\',this.value)" title="Pick a level of detail">' +
            '<option value="0">L0 · classes only</option>' +
            '<option value="1">L1 · + hierarchy</option>' +
            '<option value="2">L2 · + individuals &amp; object props</option>' +
            '<option value="3">L3 · + OWL restrictions</option>' +
            '<option value="4">L4 · + data props &amp; literals</option>' +
            '<option value="5">L5 · everything except inferred</option>' +
            '<option value="6" selected>L6 · everything</option>' +
          '</select>' +
          '<button class="ov-btn" data-oi-onclick="ontoink.openAtticPanel(\'' + id + '\')" title="Open the Hidden panel">Hidden</button>' +
          '<label class="ov-super-toggle" title="Group by namespace"><input type="checkbox" checked data-oi-onchange="ontoink.toggleSuperNodes(\'' + id + '\',this.checked)"> Group</label>' +
          '<button class="ov-btn" data-oi-onclick="ontoink.openFacetsPanel(\'' + id + '\')" title="Facets">Facets</button>' +
          '<select class="ov-lod-select" data-oi-onchange="ontoink.applyStylePreset(\'' + id + '\',this.value)" title="Ontology visualization style preset">' +
            '<option value="ontoink" selected>Style: Ontoink</option>' +
            '<option value="chowlk">Style: Chowlk</option>' +
            '<option value="graffoo">Style: Graffoo</option>' +
            '<option value="vowl">Style: VOWL</option>' +
          '</select>' +
        '</div>' +
        '<div class="ov-toolbar-group">' +
          '<button class="ov-btn" data-oi-onclick="ontoink.exportPNG(\'' + id + '\')" title="Export PNG">PNG</button>' +
          '<button class="ov-btn" data-oi-onclick="ontoink.exportSVG(\'' + id + '\')" title="Export SVG">SVG</button>' +
          '<button class="ov-btn" data-oi-onclick="ontoink.downloadTTL(\'' + id + '\')" title="Download TTL">TTL</button>' +
        '</div>' +
        '<div class="ov-toolbar-group">' +
          '<button class="ov-btn" data-oi-onclick="ontoink.toggleColors(\'' + id + '\')" title="Edit layout, colors and shapes">Edit Layout</button>' +
          '<button class="ov-btn" data-oi-onclick="ontoink.abstractView(\'' + id + '\')" title="Show abstract model (classes only)">Abstract</button>' +
          '<button class="ov-btn" data-oi-onclick="ontoink.toggleStats(\'' + id + '\')" title="Graph statistics">Stats</button>' +
          '<button class="ov-btn" data-oi-onclick="ontoink.togglePathFinder(\'' + id + '\')" title="Find paths between nodes">Paths</button>' +
          '<button class="ov-btn" data-oi-onclick="ontoink.toggleSparql(\'' + id + '\')" title="SPARQL query">SPARQL</button>' +
          reasoningBtn +
          '<select class="ov-reasoner-select" title="Select reasoner backend"></select>' +
          editorBtn +
        '</div>' +
      '</div>' +
      '<div class="ov-canvas-wrap" style="position:relative;width:100%;height:' + height + ';">' +
        '<div class="ov-canvas" style="width:100%;height:100%;"></div>' +
        '<div class="ov-legend-overlay ov-draggable" style="bottom:12px;left:12px;"></div>' +
        '<div class="ov-ns-overlay ov-draggable" style="bottom:12px;right:12px;"></div>' +
        '<div class="ov-minimap" style="position:absolute;top:8px;right:8px;width:150px;height:100px;border:1px solid #d1d5db;border-radius:6px;background:rgba(255,255,255,0.9);overflow:hidden;"></div>' +
        '<div class="ov-attic-panel" id="' + id + '-attic" style="display:none;">' +
          '<div class="ov-editor-header ov-panel-head">Hidden by LOD  ·  pin to reveal<button class="ov-btn-close" data-oi-onclick="ontoink.closeAtticPanel(\'' + id + '\')" title="Close">&times;</button></div>' +
          '<div class="ov-attic-body" id="' + id + '-attic-body"></div>' +
        '</div>' +
        '<div class="ov-facets-panel ov-attic-panel" id="' + id + '-facets" style="display:none;">' +
          '<div class="ov-editor-header ov-panel-head">Facets  ·  narrow the view<button class="ov-btn-close" data-oi-onclick="ontoink.closeFacetsPanel(\'' + id + '\')" title="Close">&times;</button></div>' +
          '<div class="ov-attic-body" id="' + id + '-facets-body"></div>' +
        '</div>' +
      '</div>' +
      '<div class="ov-stats-panel" style="display:none;"></div>' +
      '<div class="ov-pathfinder-panel" style="display:none;"></div>' +
      '<div class="ov-sparql-panel" style="display:none;"></div>' +
      '<div class="ov-reasoning-panel" style="display:none;">' +
        '<div class="ov-editor-header ov-panel-head">Inferred Triples (OWL-RL)<button class="ov-panel-close" data-oi-onclick="this.closest(\'.ov-reasoning-panel\').style.display=\'none\'">&times;</button></div>' +
        '<div class="ov-reasoning-content"></div>' +
        '<div class="ov-editor-actions">' +
          '<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;"><input type="checkbox" class="ov-reasoning-graph-toggle" data-oi-onchange="ontoink.toggleInferredOnGraph(\'' + id + '\',this.checked)"> Show on graph</label>' +
          '<button class="ov-btn" data-oi-onclick="ontoink.validateWithReasoning(\'' + id + '\')">Validate with Inferences</button>' +
        '</div>' +
      '</div>' +
      '<div class="ov-editor-panel" style="display:none;">' +
        '<div class="ov-editor-header ov-panel-head">Edit &amp; Validate<button class="ov-panel-close" data-oi-onclick="this.closest(\'.ov-editor-panel\').style.display=\'none\'">&times;</button></div>' +
        '<div class="ov-editor-split">' +
          '<div class="ov-editor-left"><div class="ov-editor-header">Source (data TTL)</div><textarea class="ov-editor-textarea"></textarea></div>' +
          '<div class="ov-editor-right"><div class="ov-editor-header">SHACL Shapes</div><textarea class="ov-editor-shapes-textarea"></textarea></div>' +
        '</div>' +
        '<div class="ov-editor-report"><div class="ov-editor-header">Validation Report</div><div class="ov-validation-output"></div></div>' +
        '<div class="ov-editor-actions">' +
          '<button class="ov-btn ov-btn-primary" data-oi-onclick="ontoink.validate(\'' + id + '\')">Validate</button>' +
          '<button class="ov-btn" data-oi-onclick="ontoink.updateGraph(\'' + id + '\')">Update Graph</button>' +
          '<button class="ov-btn" data-oi-onclick="ontoink.resetEditor(\'' + id + '\')">Reset</button>' +
        '</div>' +
      '</div>';
  }

  function _oiB64(s) {
    // UTF-8 → base64, matching what initGraph's _decodeUtf8Base64 expects.
    return btoa(unescape(encodeURIComponent(s)));
  }

  // Programmatic embedding into any element, no MkDocs required.
  // Two modes:
  //   • {ttl|source, shape|shacl}  — parse Turtle client-side (playground path).
  //   • {graph, sideStore}         — a PRE-BUILT Cytoscape graph, optionally
  //     clustered: `graph` = {nodes, edges, clusters?}, `sideStore` = the
  //     per-cluster interiors ({clusterId:{nodes,edges,boundary_edges,...}}).
  //     This drives the same initGraph → loadSideStore → tap-to-expand super-node
  //     pipeline the MkDocs fences use, so a host can ship a big clustered map.
  // Common opts: layout, height, editor, reasoning, legend, namespaces, reasoner.
  function embed(elOrId, opts) {
    opts = opts || {};
    var el = typeof elOrId === "string" ? document.getElementById(elOrId) : elOrId;
    if (!el) { console.warn("[ontoink] embed: element not found:", elOrId); return null; }
    if (!el.id) el.id = "ontoink-embed-" + (++_embedSeq);
    var id = el.id;
    el.classList.add("ontoink-container");
    el.setAttribute("data-show-legend", String(opts.legend !== false));
    el.setAttribute("data-show-ns", String(opts.namespaces !== false));
    el.setAttribute("data-reasoner", opts.reasoner || "");
    el.innerHTML = _oiEmbedSkeleton(id, opts);
    wireHandlers(el);
    _oiInstallObserver();
    try { populateReasonerSelect(el.querySelector(".ov-reasoner-select")); } catch (e) {}
    if (opts.graph) {
      // pre-built (possibly clustered) graph — feed initGraph via the same
      // data-ontoink-graph / data-ontoink-side-store attributes fence.py emits.
      try {
        el.setAttribute("data-ontoink-graph", _oiB64(JSON.stringify(opts.graph)));
        if (opts.sideStore) {
          el.setAttribute("data-ontoink-side-store", _oiB64(JSON.stringify(opts.sideStore)));
        }
        initGraph(id);
      } catch (e) { console.error("[ontoink] embed(graph) failed", e); }
    } else {
      var ttl = opts.ttl || opts.source || "";
      var shape = opts.shape || opts.shacl || "";
      try { playground(id, ttl, shape); }
      catch (e) { console.error("[ontoink] embed render failed", e); }
    }
    if (opts.layout) { try { changeLayout(id, opts.layout); } catch (e2) {} }
    return id;
  }

  // Populate any reasoner dropdowns once DOM is ready
  document.addEventListener("DOMContentLoaded", function() {
    document.querySelectorAll(".ov-reasoner-select").forEach(populateReasonerSelect);
  });

  document.addEventListener("DOMContentLoaded",function(){
    document.querySelectorAll(".ontoink-container").forEach(function(el){initGraph(el.id);});
    wireHandlers(document);      // CSP-safe: attach real listeners to data-oi-on* markup
    _oiInstallObserver();        // …and to any panels/popups created later
  });

  // v0.7.4-fix — This was `return { ... };` but the giant IIFE had a
  // LOT of code below this point (style presets, live-editor module,
  // auto-mount hook) that would have been dead — `return` exits early
  // and never lets those statements execute. Users reported that
  // "Style dropdown does nothing" and "Live editor renders nothing";
  // both are consequences of the same dead-code trap. Switch to a
  // `var api = {...}` pattern and add `return api;` at the very end
  // of the IIFE so every subsequent statement runs.
  var api = { zoomIn:zoomIn, zoomOut:zoomOut, fit:fit, fullscreen:fullscreen, exportPNG:exportPNG, exportSVG:exportSVG, downloadTTL:downloadTTL, toggleEditor:toggleEditor, validate:validate, updateGraph:updateGraph, resetEditor:resetEditor, toggleAllNs:toggleAllNs, toggleColors:toggleColors, toggleReasoning:toggleReasoning, toggleInferredOnGraph:toggleInferredOnGraph, validateWithReasoning:validateWithReasoning, playground:playground, search:search, changeLayout:changeLayout, focusNode:focusNode, resetFocus:resetFocus, abstractView:abstractView, fullView:fullView, toggleStats:toggleStats, showCoverage:showCoverage, togglePathFinder:togglePathFinder, findPath:findPath, clearPath:clearPath, toggleSparql:toggleSparql, sparqlTemplate:sparqlTemplate, runSparql:runSparql, sparqlHighlight:sparqlHighlight, selectSparqlAC:selectSparqlAC, derefIriRemote:derefIriRemote, togglePlaygroundReasoning:togglePlaygroundReasoning, downloadInferences:downloadInferences, copyInferences:copyInferences, diagnoseReasoner:diagnoseReasoner, setInferredOverlay:setInferredOverlay,
    // v0.7.0 Big-ontology mode — LOD / Hidden / Super / clustering runtime.
    // These were defined in the IIFE but never surfaced to the public
    // ``window.ontoink`` object, so every onclick/oninput in the fence
    // template silently no-op'd. That's why the slider moved but stayed
    // at 2 — ``ontoink.setLodLevel`` didn't exist.
    setLodLevel: setLodLevel,
    openAtticPanel: openAtticPanel,
    closeAtticPanel: closeAtticPanel,
    pinFromAttic: pinFromAttic,
    toggleSuperNodes: toggleSuperNodes,
    expandSuperNode: expandSuperNode,
    collapseSuperNode: collapseSuperNode,
    loadSideStore: loadSideStore,
    applyPredicatePolicyToElements: applyPredicatePolicyToElements,
    renderNodeBadges: renderNodeBadges,
    // v0.7.3 — Faceted browsing (#33)
    openFacetsPanel: openFacetsPanel,
    closeFacetsPanel: closeFacetsPanel,
    toggleFacet: toggleFacet,
    selectAllFacets: selectAllFacets,
    clearFacet: clearFacet,
    // v0.7.3 — Metrics dashboard splash (#38)
    openMetricsSplash: openMetricsSplash,
    closeMetricsSplash: closeMetricsSplash,
    _exploreFromSplash: _exploreFromSplash,
    triplesToElements: triplesToElements,
    // v0.7.4 — Live editor with D2-inspired DSL. See ontoink-dsl.js
    // for the parser and demo/docs/live-editor.md for the page.
    // NOTE: `liveEditor` (declared as `var liveEditor = (function(){})()`)
    // is only bound AFTER this object literal evaluates. Reading it
    // here would capture `undefined`. Instead we bind api.liveEditor
    // right after the IIFE assigns it below.
    // liveEditor: liveEditor,   (bound at bottom of file — see line ~end)
    // v0.7.4 — Style presets (Chowlk / Graffoo / VOWL / UML-ODM).
    applyStylePreset: applyStylePreset,
    listStylePresets: listStylePresets,
    // Embeddable build — CSP-safe handler wiring + programmatic mount.
    embed: embed,
    wireHandlers: wireHandlers
  };

  // ==========================================================================
  // v0.7.4 — Style presets.
  //
  // A dropdown in the Edit Layout panel lets users swap ontoink's default
  // stylesheet for one of the canonical ontology-viz notations. Each preset
  // is a Cytoscape.js style array; on first apply we snapshot cy.style()
  // to `inst._originalStyle` so the "Ontoink default" option can revert
  // faithfully.
  //
  // The presets are approximations — not every OWL construct maps 1:1 to
  // Cytoscape.js shape/color, and the source tools (drawio, yEd, WebVOWL)
  // have their own quirks. Where the canonical rendering can't be
  // matched (Chowlk's underlined individuals, VOWL's edge-midpoint
  // property chips), we use the closest Cytoscape idiom and note the
  // compromise inline.

  function _chowlkStyle() {
    // Chowlk (Chávez-Feria et al., ESWC 2022).
    // Canonical reference: https://chowlk.linkeddata.es/notation
    //
    // The Chowlk notation is deliberately austere: white rectangles with
    // thin black borders, hand-drawable on a whiteboard. Distinction
    // between element kinds is by BORDER STYLE and TEXT DECORATION, not
    // by fill color (the paper explicitly leaves fill color free for
    // namespace tinting).
    //
    //  - Class:        white rect + solid black border
    //  - Individual:   white rect + solid border + UNDERLINED label
    //    (Cytoscape can't underline node labels — italic is our proxy)
    //  - Datatype:     white rect + DASHED border
    //  - Restriction:  white round-rect + DASHED border with the
    //                  restriction expression as label
    //  - subClassOf:   solid line + hollow triangle head (UML idiom)
    //  - rdf:type:     dashed line + hollow triangle
    //  - Object prop:  solid line + FILLED triangle head, straight not bezier
    return [
      { selector: "node", style: {
        shape: "rectangle",
        "background-color": "#ffffff",
        "border-color": "#000000", "border-width": 1, "border-style": "solid",
        color: "#000000", "font-family": "'Helvetica','Arial',sans-serif",
        "font-size": "12px", label: "data(label)",
        "text-valign": "center", "text-halign": "center",
        width: "label", height: "label", padding: "10px",
        "text-wrap": "wrap", "text-max-width": "180px"
      }},
      { selector: 'node[type="Class"]', style: { "border-style": "solid" }},
      { selector: 'node[type="Individual"]', style: { "font-style": "italic" }},
      { selector: 'node[type="Literal"]', style: { "border-style": "dashed" }},
      { selector: 'node[?isBlankNode]', style: { shape: "ellipse", "border-style": "solid" }},
      { selector: 'node[?isSuperNode]', style: { shape: "hexagon", "border-width": 3, "border-style": "double" }},
      { selector: 'node[?isClusterHull]', style: { shape: "round-rectangle", "background-opacity": 0.15, "border-style": "dashed" }},
      { selector: "edge", style: {
        "curve-style": "straight",   // Chowlk uses straight lines, not bezier
        "line-color": "#000000", "target-arrow-color": "#000000",
        "target-arrow-shape": "triangle", "target-arrow-fill": "filled",
        width: 1, label: "data(label)",
        "font-family": "'Helvetica','Arial',sans-serif", "font-size": "10px", color: "#000000",
        "text-background-color": "#ffffff", "text-background-opacity": 1, "text-background-padding": "2px"
      }},
      { selector: 'edge[edgeType="subclass"]', style: { "target-arrow-fill": "hollow" }},
      { selector: 'edge[edgeType="rdf-type"]', style: { "line-style": "dashed", "target-arrow-fill": "hollow" }},
    ];
  }

  function _graffooStyle() {
    // Graffoo (Falco, Gangemi, Peroni, Shotton, Vitali — ESWC 2014).
    // Canonical reference: https://essepuntato.it/graffoo/
    //
    // Faithful reproduction of the notation:
    //  - Bright-yellow rectangles (#FFFF66) with black borders for classes
    //  - Small filled circles (~14px navy) for individuals with the label
    //    positioned OUTSIDE (below) the shape — this is Graffoo's signature
    //  - Green parallelograms for datatype/literal
    //  - Object-property arrows: BLUE with a filled dot at the SOURCE end
    //    (the `●━━━▶` pattern is the visual signature that distinguishes
    //    Graffoo from every other ontology notation)
    //  - Data-property arrows: GREEN, same source-dot idiom
    //  - Straight edges (not bezier) matching the paper's diagrams
    //  - Property labels in blue italic (dark blue for object, dark green
    //    for data properties)
    return [
      { selector: "node", style: {
        label: "data(label)",
        "text-valign": "center", "text-halign": "center",
        "font-family": "'Helvetica','Arial',sans-serif", "font-size": "11px",
        color: "#000000",
        width: "label", height: "label", padding: "8px",
        "text-wrap": "wrap", "text-max-width": "180px"
      }},
      // Class: bright yellow ROUND-RECTANGLE with black border
      // (per the Graffoo legend at essepuntato.it/graffoo/graffoo-legend.pdf)
      { selector: 'node[type="Class"]', style: {
        shape: "round-rectangle",
        "background-color": "#FFFF00",   // canonical bright Graffoo yellow
        "border-color": "#000000",
        "border-width": 1,
        "font-weight": "500",
        padding: "10px"
      }},
      // Individuals: small PINK/MAGENTA filled circle with dark border
      // and label BELOW (per Graffoo legend "an instance of a class").
      { selector: 'node[type="Individual"]', style: {
        shape: "ellipse",
        "background-color": "#FF66CC",    // Graffoo pink
        "border-color": "#B00060",
        "border-width": 2,
        width: 18, height: 18,
        color: "#000000",
        "text-valign": "bottom",
        "text-halign": "center",
        "text-margin-y": 6,
        "font-style": "italic",
        padding: "0px"
      }},
      // Datatype / literal: GREEN parallelogram (rhomboid) per Graffoo spec
      { selector: 'node[type="Literal"]', style: {
        shape: "rhomboid",
        "background-color": "#98FB98",    // Graffoo pale green
        "border-color": "#000000", "border-width": 1,
        "font-style": "italic",
        padding: "8px"
      }},
      // Blank node / anonymous class expression: DASHED yellow round-rect
      // (Graffoo "class restriction" idiom — same yellow, dashed border).
      { selector: 'node[?isBlankNode]', style: {
        shape: "round-rectangle",
        "background-color": "#FFFF99", "border-color": "#000000",
        "border-style": "dashed", "border-width": 1
      }},
      { selector: 'node[?isSuperNode]', style: {
        shape: "hexagon", "background-color": "#FFFF00",
        "border-width": 2, "border-color": "#000000", "border-style": "double"
      }},
      { selector: 'node[?isClusterHull]', style: {
        shape: "round-rectangle",
        "background-color": "#FFFFCC", "background-opacity": 0.35,
        "border-style": "dashed", "border-color": "#000000"
      }},
      { selector: "edge", style: {
        // Straight lines match Graffoo diagrams; bezier curves don't
        "curve-style": "straight",
        label: "data(label)",
        "font-size": "10px", "font-family": "'Helvetica','Arial',sans-serif",
        "font-style": "italic",
        "target-arrow-shape": "triangle",
        "target-arrow-fill": "filled",
        width: 1.5,
        "text-background-color": "#ffffff",
        "text-background-opacity": 0.95,
        "text-background-padding": "2px"
      }},
      // Subclass: solid black line + hollow triangle head (UML generalisation)
      { selector: 'edge[edgeType="subclass"]', style: {
        "line-color": "#000000", "target-arrow-color": "#000000",
        "target-arrow-fill": "hollow", color: "#000000",
        "font-style": "normal"
      }},
      // rdf:type: dotted black with hollow triangle head
      { selector: 'edge[edgeType="rdf-type"]', style: {
        "line-color": "#000000", "target-arrow-color": "#000000",
        "line-style": "dotted", color: "#000000",
        "target-arrow-fill": "hollow",
        "font-style": "normal"
      }},
      // Object property: DARK-BLUE line + FILLED source circle + filled
      // triangle target. The source-dot is Graffoo's signature (●━━━▶).
      { selector: 'edge[edgeType="object-property"]', style: {
        "line-color": "#0000CD", "target-arrow-color": "#0000CD",
        "source-arrow-shape": "circle", "source-arrow-color": "#0000CD",
        "source-arrow-fill": "filled",
        "target-arrow-fill": "filled",
        color: "#0000CD",
        width: 1.5
      }},
      // Data property: GREEN line + HOLLOW source circle + HOLLOW triangle
      // (per Graffoo legend: ○━━━▷ green — datatype-side is hollow).
      { selector: 'edge[edgeType="data-property"]', style: {
        "line-color": "#008000", "target-arrow-color": "#008000",
        "source-arrow-shape": "circle", "source-arrow-color": "#008000",
        "source-arrow-fill": "hollow",
        "target-arrow-fill": "hollow",
        color: "#008000",
        width: 1.5
      }},
      // Annotation property: ORANGE/BROWN line + HOLLOW source circle +
      // HOLLOW triangle target (per Graffoo legend "annotation property").
      { selector: 'edge[edgeType="annotation-property"]', style: {
        "line-color": "#C86400", "target-arrow-color": "#C86400",
        "source-arrow-shape": "circle", "source-arrow-color": "#C86400",
        "source-arrow-fill": "hollow",
        "target-arrow-fill": "hollow",
        color: "#C86400",
        width: 1.5
      }},
    ];
  }

  function _vowlStyle() {
    // VOWL 2 / WebVOWL (Lohmann, Negru, Haag, Ertl — Semantic Web Journal 2016).
    // Canonical reference: http://vowl.visualdataweb.org/webvowl.html
    //
    // Faithful VOWL colors:
    //  - Class:            light blue circle    (#AACCFF fill, #333 border, no border)
    //  - External class:   dark blue circle     (#3366CC fill, white text)
    //  - Datatype/Literal: yellow rectangle     (#FFCC33 fill, black text)
    //  - Individual:       dashed white circle  (small)
    //  - Object property:  blue chip label on the edge midpoint (#AACCFF chip)
    //  - Data property:    green chip label on the edge midpoint (#99CC66 chip)
    //  - rdf:type:         thin dotted gray line, small filled triangle
    //  - subClassOf:       darker line + hollow triangle head
    return [
      { selector: "node", style: {
        label: "data(label)",
        "text-valign": "center", "text-halign": "center",
        "font-family": "'Helvetica','Arial',sans-serif", "font-size": "11px",
        "font-weight": "500",
        color: "#000000",
        "text-wrap": "wrap", "text-max-width": "120px"
      }},
      { selector: 'node[type="Class"]', style: {
        shape: "ellipse",
        "background-color": "#AACCFF",   // canonical WebVOWL light blue
        "border-color": "#000000", "border-width": 0,
        width: 78, height: 78, padding: "14px"
      }},
      { selector: 'node[?external]', style: {
        "background-color": "#3366CC", color: "#ffffff", "border-color": "#1F4788"
      }},
      { selector: 'node[type="Individual"]', style: {
        shape: "ellipse",
        "background-color": "#ffffff", "border-color": "#333333",
        "border-style": "dashed", "border-width": 2,
        width: 48, height: 48, padding: "6px",
        "font-size": "10px"
      }},
      // Datatype / Literal: yellow rectangle per VOWL 2 spec
      { selector: 'node[type="Literal"]', style: {
        shape: "rectangle",
        "background-color": "#FFCC33", "border-color": "#000000", "border-width": 0,
        padding: "10px"
      }},
      { selector: 'node[?isBlankNode]', style: {
        shape: "ellipse",
        "background-color": "#ffffff", "border-color": "#000000",
        width: 24, height: 24
      }},
      { selector: 'node[?isSuperNode]', style: { shape: "hexagon", "background-color": "#AACCFF", "border-width": 3, "border-color": "#3366CC", "border-style": "double" }},
      { selector: 'node[?isClusterHull]', style: { shape: "round-rectangle", "background-color": "#DDEEFF", "background-opacity": 0.35, "border-style": "dashed", "border-color": "#3366CC" }},
      { selector: "edge", style: {
        "curve-style": "straight",   // VOWL uses straight lines with midpoint labels
        label: "data(label)",
        "font-size": "10px", "font-family": "'Helvetica','Arial',sans-serif",
        "font-weight": "500",
        "target-arrow-shape": "triangle", "target-arrow-fill": "filled",
        // VOWL "chip" label: colored rectangle background on the edge midpoint
        "text-background-color": "#AACCFF",
        "text-background-opacity": 1,
        "text-background-padding": "5px",
        "text-background-shape": "rectangle",
        "text-border-color": "#3366CC",
        "text-border-opacity": 1,
        "text-border-width": 1,
        color: "#000000", width: 2
      }},
      // Subclass: gray with hollow triangle, no chip
      { selector: 'edge[edgeType="subclass"]', style: {
        "line-color": "#000000", "target-arrow-color": "#000000",
        "target-arrow-fill": "hollow",
        "text-background-color": "#f0f0f0",
        "text-border-color": "#777777"
      }},
      // rdf:type: thin dotted gray, small target arrow, no chip color
      { selector: 'edge[edgeType="rdf-type"]', style: {
        "line-color": "#999999", "target-arrow-color": "#999999",
        "line-style": "dotted", width: 1,
        "text-background-color": "#f8f8f8", "text-border-color": "#cccccc",
        "target-arrow-fill": "filled"
      }},
      // Object property: BLUE chip label (WebVOWL signature)
      { selector: 'edge[edgeType="object-property"]', style: {
        "line-color": "#3366CC", "target-arrow-color": "#3366CC",
        "text-background-color": "#AACCFF", "text-border-color": "#3366CC"
      }},
      // Data property: GREEN chip label (WebVOWL signature)
      { selector: 'edge[edgeType="data-property"]', style: {
        "line-color": "#5A5A5A", "target-arrow-color": "#5A5A5A",
        "text-background-color": "#99CC66", "text-border-color": "#4A8020"
      }},
      // Annotation property: PURPLE-tint chip
      { selector: 'edge[edgeType="annotation-property"]', style: {
        "line-color": "#999999", "target-arrow-color": "#999999",
        "text-background-color": "#EBE1F5", "text-border-color": "#9467BD"
      }},
    ];
  }

  var _STYLE_PRESETS = {
    ontoink:  null,             // sentinel — restore snapshot
    chowlk:   _chowlkStyle,
    graffoo:  _graffooStyle,
    vowl:     _vowlStyle
  };

  function listStylePresets() {
    return [
      { id: "ontoink", label: "Ontoink default" },
      { id: "chowlk",  label: "Chowlk (white rectangles, black borders)" },
      { id: "graffoo", label: "Graffoo (yellow classes, green individuals)" },
      { id: "vowl",    label: "VOWL / WebVOWL (blue circles)" }
    ];
  }
  function applyStylePreset(id, presetName) {
    var inst = instances[id];
    if (!inst || !inst.cy) {
      console.warn("[ontoink] applyStylePreset: no cy instance for '" + id + "'");
      return;
    }
    var cy = inst.cy;
    inst.stylePreset = presetName;
    if (presetName === "ontoink") {
      // v0.7.4-fix — Restoring the original stylesheet reliably requires
      // capturing it before we swapped it. `cy.style().json()` returns a
      // normalised form that doesn't round-trip cleanly through fromJson
      // on every Cytoscape version; rather than ship a fragile restore,
      // tell the user to reload for the default. The snapshot is kept
      // as a best-effort attempt for people who want to script it.
      if (inst._originalStyle) {
        try { cy.style(inst._originalStyle); console.info("[ontoink] restored Ontoink default"); return; }
        catch (e) { console.warn("[ontoink] snapshot restore failed; reload the page for Ontoink default:", e); return; }
      }
      console.info("[ontoink] Reload the page to restore Ontoink default style.");
      return;
    }
    if (!_STYLE_PRESETS[presetName]) {
      console.warn("[ontoink] applyStylePreset: unknown preset '" + presetName + "'");
      return;
    }
    // Snapshot the CURRENT stylesheet as best-effort so a later revert
    // has SOMETHING to try. Fails silently — not the critical path.
    if (!inst._originalStyle) {
      try { inst._originalStyle = cy.style().json(); }
      catch (e) { inst._originalStyle = null; }
    }
    var factory = _STYLE_PRESETS[presetName];
    var stylesheet = (typeof factory === "function") ? factory() : factory;
    try {
      cy.style(stylesheet);
      console.info("[ontoink] applied style preset '" + presetName + "' (" + stylesheet.length + " selectors)");
    } catch (e) {
      console.error("[ontoink] applyStylePreset failed for '" + presetName + "':", e);
    }
  }

  // ==========================================================================
  // v0.7.4 — Live editor. Small module that binds a <textarea> DSL editor to
  // an ontoink graph + a Turtle preview. Not a full ontoink instance — no
  // clustering, no facets — just a live viz of the parsed triples.
  //
  // Requires the ontoink-dsl.js sibling script to be loaded first
  // (demo/docs/live-editor.md includes it via <script src="…">).

  var liveEditor = (function() {

    // Style block for the live-editor graph. Deliberately simpler than the
    // playground: no OWL restrictions, no SHACL, no clustering — just
    // Class / Individual / Literal / BlankNode with the four common edge
    // types. Matches the ontoink defaults so the visuals feel continuous.
    function _leStyle() {
      return [
        { selector: "node", style: {
          "label":"data(label)","background-color":"data(color)",
          "text-valign":"center","text-halign":"center",
          "width":"label","height":"label","padding":"12px",
          "font-size":"12px","font-family":"'Inter','Segoe UI',system-ui,sans-serif",
          "text-wrap":"wrap","text-max-width":"160px",
          "border-width":1,"border-color":"#94a3b8","color":"#111827"
        }},
        { selector: 'node[type="Class"]', style: { "shape":"rectangle","border-width":2,"border-color":"#0891b2","font-weight":"600" }},
        { selector: 'node[type="Individual"]', style: { "shape":"ellipse" }},
        { selector: 'node[type="Literal"]', style: { "shape":"round-rectangle","font-style":"italic","font-size":"11px","border-style":"dashed","border-color":"#65a30d","background-color":"#f0fdf4","color":"#365314" }},
        { selector: 'node[?isBlankNode]', style: { "shape":"round-diamond","background-color":"#f3f4f6","border-style":"dashed","border-color":"#9ca3af","color":"#6b7280","font-style":"italic","opacity":0.75 }},
        { selector: "edge", style: {
          "label":"data(label)","curve-style":"bezier",
          "target-arrow-shape":"triangle","target-arrow-fill":"filled",
          "line-color":"#64748b","target-arrow-color":"#64748b",
          "width":1.5,"font-size":"10px","text-rotation":"autorotate","text-margin-y":-10,
          "color":"#334155","text-background-color":"#fff","text-background-opacity":0.9,"text-background-padding":"2px",
          "font-family":"'Inter','Segoe UI',system-ui,sans-serif"
        }},
        { selector: "edge[edgeType='subclass']", style: { "line-color":"#374151","target-arrow-color":"#374151","target-arrow-fill":"hollow","target-arrow-shape":"triangle","width":2 }},
        { selector: "edge[edgeType='rdf-type']", style: { "line-color":"#9ca3af","target-arrow-color":"#9ca3af","line-style":"dashed" }},
        { selector: "edge[edgeType='data-property']", style: { "line-color":"#16a34a","target-arrow-color":"#16a34a","target-arrow-fill":"hollow" }},
        { selector: "edge[edgeType='object-property']", style: { "line-color":"#2563eb","target-arrow-color":"#2563eb" }},
      ];
    }

    // Mount the editor into #<containerId>. Locates the textarea + graph
    // + TTL preview by known IDs (#le-editor / #le-graph / #le-ttl-output
    // / #le-errors / #le-graph-stats), sets up the cytoscape instance
    // registered under 'le-graph' so ontoink.setLodLevel works, wires
    // the debounced re-parse, and seeds the tutorial text.
    var _leState = {};
    function mount(containerId) {
      if (typeof window === "undefined") return;
      if (!window.ontoinkDsl) {
        console.warn("[ontoink.liveEditor] ontoink-dsl.js not loaded — skipping mount");
        return;
      }
      var editor = document.getElementById("le-editor");
      var graphContainer = document.getElementById("le-graph");
      var ttlOut = document.getElementById("le-ttl-output");
      var errBox = document.getElementById("le-errors");
      var stats = document.getElementById("le-graph-stats");
      if (!editor || !graphContainer || !ttlOut) return;
      var canvas = graphContainer.querySelector(".ov-canvas");
      if (!canvas) return;

      // Seed with the tutorial DSL.
      if (!editor.value) editor.value = window.ontoinkDsl.exampleText();

      var cy = cytoscape({
        container: canvas,
        elements: { nodes: [], edges: [] },
        style: _leStyle(),
        layout: { name: "dagre", rankDir: "BT", nodeSep: 60, rankSep: 80, animate: false, fit: true, padding: 30 },
        wheelSensitivity: 0.15, minZoom: 0.05, maxZoom: 8,
        hideEdgesOnViewport: true, hideLabelsOnViewport: true, textureOnViewport: true, pixelRatio: 1
      });

      // Register a minimal ontoink instance so LOD works.
      instances["le-graph"] = {
        cy: cy,
        data: { nodes: [], edges: [], prefixes: {}, namespaces: {}, activeNamespaces: {} },
        editor: null, originalTtl: "",
        sideStore: {}, attic: new Map(),
        lodLevel: 6,
        policy: { hide_at_level: {}, node_badges: {}, hide: [], fold: [], badge: [] },
        expandedSuperNodes: new Set(),
        showSuperNodes: true,
        _nodeBadgesRendered: new Set(),
        facetSelections: null,
        facets: null,
        _isLiveEditor: true
      };

      _leState[containerId] = { editor: editor, ttlOut: ttlOut, errBox: errBox, stats: stats, cy: cy, debounce: null };

      // v0.7.4 — populate the Examples dropdown with predefined templates.
      _populateExamplesDropdown();
      // v0.7.5 — install Ctrl+Space autocomplete on the editor textarea.
      _installAutocomplete(containerId, editor);
      // v0.7.1 — install a line-number gutter so error messages that
      // reference "line 12, column 5" are actually locatable.
      _installLineNumbers(editor);
      // v0.7.7 — Playground-parity supernode + hull expand/collapse
      // taps. Same handlers as initGraph — without these, tapping a
      // clustered namespace bubble in the live editor was a dead-end.
      cy.on("tap", 'node[?isSuperNode]', function(evt) {
        var n = evt.target;
        var inst2 = instances["le-graph"];
        if (!inst2) return;
        if (inst2.expandedSuperNodes.has(n.id())) collapseSuperNode("le-graph", n.id());
        else                                       expandSuperNode("le-graph", n.id());
        try { removePopup(graphContainer); } catch (e) {}
      });
      cy.on("tap", 'node[?isClusterHull]', function(evt) {
        var n = evt.target;
        var cid = n.data("clusterId") || n.id();
        if (cid) collapseSuperNode("le-graph", cid);
        try { removePopup(graphContainer); } catch (e) {}
      });

      // v0.7.7 — Playground-parity node + edge tap popups. Reuses the
      // main buildPopup / buildEdgePopup helpers so a live-editor node
      // shows the same IRI / CURIE / type-evidence panel a fence graph
      // does. Blank node (`_:` prefix) taps still show a popup — useful
      // because our type inference explains WHY the blank node exists.
      cy.on("tap", "node", function(evt) {
        try { removePopup(graphContainer); } catch (e) {}
        if (evt.target.data("isSuperNode") || evt.target.data("isClusterHull")) return;
        var d = evt.target.data(), pos = evt.renderedPosition;
        var popup = document.createElement("div");
        popup.className = "ov-popup";
        popup.innerHTML = buildPopup(d, cy);
        var cR = canvas.getBoundingClientRect(), pR = graphContainer.getBoundingClientRect();
        popup.style.left = (cR.left - pR.left + pos.x + 15) + "px";
        popup.style.top  = (cR.top  - pR.top  + pos.y - 15) + "px";
        graphContainer.appendChild(popup);
        _wireLivePopup(popup, d);
      });
      cy.on("tap", "edge", function(evt) {
        try { removePopup(graphContainer); } catch (e) {}
        var d = evt.target.data(), midpoint = evt.target.midpoint();
        var zoom = cy.zoom(), pan = cy.pan();
        var rx = midpoint.x * zoom + pan.x, ry = midpoint.y * zoom + pan.y;
        var popup = document.createElement("div");
        popup.className = "ov-popup";
        popup.innerHTML = buildEdgePopup(d, cy);
        var cR = canvas.getBoundingClientRect(), pR = graphContainer.getBoundingClientRect();
        popup.style.left = (cR.left - pR.left + rx + 15) + "px";
        popup.style.top  = (cR.top  - pR.top  + ry - 15) + "px";
        graphContainer.appendChild(popup);
        _wireLivePopup(popup, d);
      });
      cy.on("tap", function(e) { if (e.target === cy) { try { removePopup(graphContainer); } catch (e2) {} } });

      function refresh() {
        try { _refresh(containerId); } catch (e) {
          console.error("[ontoink.liveEditor] refresh failed", e);
        }
      }
      editor.addEventListener("input", function() {
        var st = _leState[containerId]; if (!st) return;
        if (st.debounce) clearTimeout(st.debounce);
        st.debounce = setTimeout(refresh, 350);
      });
      // Initial render.
      refresh();
    }

    // v0.7.7 — Minimal popup wiring shared by node + edge popups.
    // Handles close button and Copy Label / Copy IRI chips.
    function _wireLivePopup(popup, d) {
      var close = popup.querySelector(".ov-popup-close");
      if (close) close.addEventListener("click", function() { popup.remove(); });
      popup.querySelectorAll(".ov-chip").forEach(function(b) {
        b.addEventListener("click", function() {
          if (b.classList.contains("ov-deref-btn")) {
            try { derefIri(b.dataset.iri, b); } catch (e) {}
            return;
          }
          var text = b.dataset.action === "copy-iri" ? d.iri : d.label;
          try {
            copyText(text, b);
          } catch (e) {
            try { navigator.clipboard.writeText(String(text || "")); } catch (e2) {}
          }
        });
      });
      // Collapsible sections
      popup.querySelectorAll(".ov-popup-toggle").forEach(function(tog) {
        tog.addEventListener("click", function() {
          var sec = tog.dataset.section;
          var tgt = popup.querySelector('.ov-collapsible[data-section="' + sec + '"]');
          if (!tgt) return;
          var open = tgt.style.display !== "none";
          tgt.style.display = open ? "none" : "block";
          var arrow = tog.querySelector(".ov-toggle-arrow");
          if (arrow) arrow.textContent = open ? "▶" : "▼";
        });
      });
      try { makePopupDraggable(popup); } catch (e) {}
    }

    // v0.7.1 — Line-number gutter. Wraps the editor textarea in a flex
    // container and prepends a right-aligned monospace column that
    // renders "1\n2\n3…" up to the textarea's current line count. The
    // gutter's scroll offset mirrors the textarea's so long files stay
    // aligned. Font metrics are inherited from the textarea via
    // computed style so the gutter's baselines line up on any theme.
    function _installLineNumbers(editor) {
      if (!editor || editor.parentNode.classList.contains("le-editor-wrap")) return;
      var wrap = document.createElement("div");
      wrap.className = "le-editor-wrap";
      var gutter = document.createElement("div");
      gutter.className = "le-line-numbers";
      gutter.setAttribute("aria-hidden", "true");
      editor.parentNode.insertBefore(wrap, editor);
      wrap.appendChild(gutter);
      wrap.appendChild(editor);

      function render() {
        var lines = editor.value.split("\n").length;
        // Show at least 20 rows so an empty editor still has a gutter.
        var minRows = 20;
        if (lines < minRows) lines = minRows;
        var html = "";
        for (var i = 1; i <= lines; i++) html += i + "\n";
        gutter.textContent = html;
      }
      function sync() {
        gutter.scrollTop = editor.scrollTop;
      }
      editor.addEventListener("input", render);
      editor.addEventListener("scroll", sync);
      // Keep the gutter aligned when the textarea is resized (the CSS
      // uses resize:vertical, so the user can drag).
      new ResizeObserver(sync).observe(editor);
      render();
    }

    // v0.7.1 — Given a parser-error message, propose a plain-English
    // supplementary hint so non-experts learn what to fix. Returns "" if
    // no hint applies. The core message already contains the fix in
    // v0.7.1 (e.g. "unterminated <IRI> — expected a closing '>' before
    // end of line"); this adds a broader teaching aid.
    function _errorHint(msg) {
      if (!msg) return "";
      msg = String(msg);
      if (/unterminated <IRI>/i.test(msg))
        return "IRIs are wrapped in angle brackets, e.g. <http://example.org/Person>. A missing '>' truncates the URL; check whether a comment mark '#' inside the URL was mistaken for a comment (it shouldn't be — that's a bug, please report).";
      if (/expected ':' after prefix name/i.test(msg))
        return "@prefix declarations look like: @prefix ex: <http://example.org/> — a prefix name, a colon, then the full IRI in angle brackets.";
      if (/isn't a known shortcut/i.test(msg))
        return "The shorthand arrows are: -a-> (rdf:type), -isa-> (rdfs:subClassOf), -chain-> (owl:propertyChainAxiom). For anything else use a CURIE, e.g. -rdfs:label-> or -foaf:knows-> .";
      if (/is case-sensitive/i.test(msg))
        return "DSL shortcuts use lowercase: -a-> not -A-> . CURIEs like -RDFS:label-> also need the exact prefix casing from your @prefix declarations.";
      if (/missing '->' to close/i.test(msg) || /expected '-' to start a predicate arrow/i.test(msg))
        return "A triple in this DSL is written: SUBJECT -PREDICATE-> OBJECT. Both dashes and the angle bracket are required; without them the parser can't tell where the predicate ends.";
      if (/expected an object/i.test(msg))
        return "After the predicate arrow the parser needs an object: another term (ex:Bob), a literal (\"hello\" or 42), or a class expression like (ex:A and ex:B).";
      if (/blank-node label expected after '_:'/i.test(msg))
        return "Blank nodes are written _:name where name follows the CURIE local-part rules (letters, digits, hyphen).";
      if (/expected a local name after ':'/i.test(msg))
        return "The empty-prefix form :Name uses the empty prefix (declare it with @prefix : <http://…>).";
      if (/predicate .* isn't a valid CURIE/i.test(msg))
        return "Predicates must be one of: a known shortcut (-a->, -isa->, -chain->), a CURIE (prefix:local), or a full IRI (<http://…>).";
      if (/subject block '\{' is not supported with multiple subjects/i.test(msg))
        return "Subject blocks are one-subject shortcuts: ex:S { -p1-> o1; -p2-> o2 } — comma-separating subjects and opening a block would be ambiguous.";
      if (/expected subject after ','/i.test(msg))
        return "Multi-subject lines look like: ex:A, ex:B -isa-> ex:C — no trailing comma before the arrow.";
      return "";
    }

    // v0.7.5 — Ctrl+Space autocomplete popup. Wraps the editor textarea:
    //  - Ctrl+Space (or Cmd+Space on Mac) opens a floating suggestions
    //    list anchored at the caret; up/down navigates; Enter/Tab picks;
    //    Esc dismisses. Typing after opening filters live.
    //  - Suggestions come from ontoinkDsl.autocompleteSearch() which
    //    ranks the 144 well-known terms (RDF/RDFS/OWL/XSD/SKOS/FOAF/
    //    DC/PROV/BFO/RO/IAO/SIO/SHACL) plus user prefixes in the
    //    current document.
    //  - Picking a term auto-inserts the CURIE at the caret AND
    //    prepends `@prefix name: <IRI>` if the prefix isn't declared.
    function _installAutocomplete(containerId, editor) {
      var popup = null;      // floating <div> when open
      var items = [];        // current suggestion list
      var activeIdx = 0;
      var triggerStart = -1; // index in editor.value where the current word starts

      function _tokenStart(text, pos) {
        var i = pos;
        while (i > 0) {
          var ch = text.charAt(i - 1);
          if (/[\s(),\-{}"]/.test(ch)) break;
          i--;
        }
        return i;
      }

      function _caretRect() {
        // Approximate caret coordinates using a hidden mirror div.
        // Textarea doesn't expose caret pixel coords directly.
        var r = editor.getBoundingClientRect();
        var pos = editor.selectionStart;
        var mirror = document.createElement("div");
        var cs = window.getComputedStyle(editor);
        [ "font-family","font-size","font-weight","letter-spacing","line-height",
          "padding-top","padding-left","padding-right","padding-bottom",
          "border-top-width","border-left-width","border-right-width","border-bottom-width",
          "box-sizing","white-space","word-wrap","tab-size" ].forEach(function(p){
          mirror.style[p.replace(/-([a-z])/g,function(_,c){return c.toUpperCase();})] = cs.getPropertyValue(p);
        });
        mirror.style.position = "absolute";
        mirror.style.visibility = "hidden";
        mirror.style.whiteSpace = "pre-wrap";
        mirror.style.wordWrap = "break-word";
        mirror.style.width = editor.clientWidth + "px";
        mirror.style.height = "auto";
        mirror.style.top = "0";
        mirror.style.left = "-9999px";
        document.body.appendChild(mirror);
        var before = editor.value.substring(0, pos);
        var span = document.createElement("span");
        span.textContent = "|";
        mirror.textContent = before;
        mirror.appendChild(span);
        var sr = span.getBoundingClientRect();
        var mr = mirror.getBoundingClientRect();
        var localTop = sr.top - mr.top;
        var localLeft = sr.left - mr.left;
        document.body.removeChild(mirror);
        return {
          x: r.left - editor.scrollLeft + localLeft,
          y: r.top - editor.scrollTop + localTop + parseFloat(cs.fontSize) * 1.2
        };
      }

      function _extraTermsFromDoc() {
        // Include user's own @prefix declarations so they can autocomplete
        // e.g. their `mwo:` terms already seen in the document.
        var text = editor.value;
        var out = [];
        var seen = {};
        text.split(/\r?\n/).forEach(function(line) {
          var m = line.match(/@prefix\s+(\w+)\s*:\s*<([^>]+)>/);
          if (m && !seen["p:" + m[1]]) {
            seen["p:" + m[1]] = true;
            out.push({ curie: m[1] + ":", iri: m[2], label: m[1] + " (declared)", kind: "prefix", doc: "User-declared prefix in this document" });
          }
        });
        return out;
      }

      function _render(query, caret) {
        if (!window.ontoinkDsl || !window.ontoinkDsl.autocompleteSearch) return;
        items = window.ontoinkDsl.autocompleteSearch(query, { max: 12, extra: _extraTermsFromDoc() });
        if (!items.length) { _close(); return; }
        if (!popup) {
          popup = document.createElement("div");
          popup.className = "le-autocomplete";
          document.body.appendChild(popup);
        }
        popup.style.left = caret.x + "px";
        popup.style.top  = caret.y + "px";
        var kindColors = {
          class: "#0891b2", objectProperty: "#2563eb", dataProperty: "#16a34a",
          annotationProperty: "#7c3aed", datatype: "#c2410c", individual: "#374151",
          prefix: "#065f46"
        };
        var html = "";
        for (var i = 0; i < items.length; i++) {
          var t = items[i];
          var color = kindColors[t.kind] || "#374151";
          html += '<div class="le-ac-row' + (i === activeIdx ? " le-ac-active" : "") +
                  '" data-idx="' + i + '">' +
                  '<span class="le-ac-kind" style="background:' + color + '">' + _escHtml((t.kind || "").substring(0, 3)) + '</span>' +
                  '<span class="le-ac-curie">' + _escHtml(t.curie) + '</span>' +
                  '<span class="le-ac-label">' + _escHtml(t.label || "") + '</span>' +
                  '<div class="le-ac-doc">' + _escHtml(t.doc || "") + '</div>' +
                  '</div>';
        }
        popup.innerHTML = html;
        popup.style.display = "block";
        var rows = popup.querySelectorAll(".le-ac-row");
        for (var r2 = 0; r2 < rows.length; r2++) {
          (function(idx) {
            rows[idx].addEventListener("mousedown", function(ev) {
              ev.preventDefault();
              activeIdx = idx;
              _pick();
            });
          })(r2);
        }
      }

      function _close() {
        if (popup) { popup.style.display = "none"; }
        items = [];
        triggerStart = -1;
      }

      function _pick() {
        var t = items[activeIdx];
        if (!t) return _close();
        var v = editor.value;
        var caret = editor.selectionStart;
        var before = v.substring(0, triggerStart);
        var after = v.substring(caret);
        var insert = t.curie || t.label || "";
        // If the CURIE has a prefix that isn't declared in the document,
        // prepend an @prefix declaration.
        var prefix = "";
        var colonIdx = insert.indexOf(":");
        if (colonIdx > 0 && t.iri) {
          var pfxName = insert.substring(0, colonIdx);
          if (v.indexOf("@prefix " + pfxName + ":") < 0) {
            // Strip the trailing local part from the IRI to get the namespace.
            var localLen = insert.length - colonIdx - 1;
            var ns = t.iri.substring(0, t.iri.length - localLen);
            prefix = "@prefix " + pfxName + ": <" + ns + ">\n";
          }
        }
        var newVal = prefix + before + insert + after;
        editor.value = newVal;
        var newCaret = prefix.length + before.length + insert.length;
        editor.setSelectionRange(newCaret, newCaret);
        _close();
        editor.dispatchEvent(new Event("input"));
        editor.focus();
      }

      editor.addEventListener("keydown", function(ev) {
        // Ctrl+Space (or Cmd+Space): open the popup.
        if ((ev.ctrlKey || ev.metaKey) && ev.key === " ") {
          ev.preventDefault();
          var pos = editor.selectionStart;
          triggerStart = _tokenStart(editor.value, pos);
          var query = editor.value.substring(triggerStart, pos);
          activeIdx = 0;
          _render(query, _caretRect());
          return;
        }
        if (!popup || popup.style.display === "none") return;
        if (ev.key === "ArrowDown") {
          ev.preventDefault(); activeIdx = (activeIdx + 1) % Math.max(1, items.length);
          _render(editor.value.substring(triggerStart, editor.selectionStart), _caretRect());
        } else if (ev.key === "ArrowUp") {
          ev.preventDefault(); activeIdx = (activeIdx - 1 + items.length) % Math.max(1, items.length);
          _render(editor.value.substring(triggerStart, editor.selectionStart), _caretRect());
        } else if (ev.key === "Enter" || ev.key === "Tab") {
          ev.preventDefault(); _pick();
        } else if (ev.key === "Escape") {
          ev.preventDefault(); _close();
        }
      });
      editor.addEventListener("input", function() {
        if (!popup || popup.style.display === "none") return;
        var pos = editor.selectionStart;
        if (pos < triggerStart) { _close(); return; }
        var query = editor.value.substring(triggerStart, pos);
        activeIdx = 0;
        _render(query, _caretRect());
      });
      editor.addEventListener("blur", function() {
        // Delay close so mousedown on a row can fire first.
        setTimeout(_close, 200);
      });
    }

    function _refresh(containerId) {
      var st = _leState[containerId]; if (!st) return;
      var text = st.editor.value;
      var parsed = window.ontoinkDsl.parse(text);

      // Graph render (do this early so we can merge inference warnings).
      var graph = window.ontoinkDsl.toGraphData(parsed);

      // Error + warning panel. Errors are red, warnings are amber.
      // v0.7.1 — Each row now clickable (jumps caret to the referenced
      // line) and carries a plain-English hint under the message so
      // non-experts learn what's wrong instead of just where.
      if (st.errBox) {
        var rows = "";
        (parsed.errors || []).forEach(function(e) {
          var hint = _errorHint(e.message);
          rows += '<div class="le-err-row" data-jump-line="' + e.line + '" data-jump-col="' + e.col + '" title="Click to jump to line ' + e.line + '">' +
                  '<span class="le-err-loc le-err-red">' + e.line + ":" + e.col + '</span>' +
                  '<span class="le-err-kind">error</span>' +
                  '<span class="le-err-msg">' + _escHtml(e.message) + '</span>' +
                  (hint ? '<div class="le-err-hint">' + _escHtml(hint) + '</div>' : '') +
                  '</div>';
        });
        (graph.warnings || []).forEach(function(w) {
          var whint = _errorHint(w.message) || "Warnings don't stop the graph from rendering — they flag a pattern (like a term typed as both Class and Property) that usually indicates a mistake somewhere in the DSL.";
          rows += '<div class="le-err-row le-warn-row" data-jump-line="' + (w.line || 1) + '" data-jump-col="1" title="Click to jump to line ' + (w.line || 1) + '">' +
                  '<span class="le-err-loc le-err-amber">' + (w.line || "?") + '</span>' +
                  '<span class="le-err-kind le-err-amber">warning</span>' +
                  '<span class="le-err-msg">' + _escHtml(w.message) + '</span>' +
                  '<div class="le-err-hint">' + _escHtml(whint) + '</div>' +
                  '</div>';
        });
        if (rows) {
          st.errBox.innerHTML = rows;
          st.errBox.style.display = "block";
          // Wire the click-to-jump handler.
          st.errBox.querySelectorAll(".le-err-row").forEach(function(row) {
            row.addEventListener("click", function() {
              var ln = parseInt(row.dataset.jumpLine, 10);
              var co = parseInt(row.dataset.jumpCol, 10) || 1;
              if (!isNaN(ln) && st.editor) {
                var lines = st.editor.value.split("\n");
                var offset = 0;
                for (var i = 0; i < ln - 1 && i < lines.length; i++) offset += lines[i].length + 1;
                offset += co - 1;
                st.editor.focus();
                st.editor.setSelectionRange(offset, offset);
                // Scroll caret into view.
                try {
                  var lh = parseFloat(getComputedStyle(st.editor).lineHeight) || 20;
                  st.editor.scrollTop = Math.max(0, (ln - 3) * lh);
                } catch (_e) {}
              }
            });
          });
        } else {
          st.errBox.innerHTML = "";
          st.errBox.style.display = "none";
        }
      }

      // Turtle preview.
      if (st.ttlOut) st.ttlOut.textContent = window.ontoinkDsl.toTurtle(parsed);

      var cy = st.cy;
      cy.elements().remove();
      if (graph.nodes.length) cy.add(graph.nodes);
      if (graph.edges.length) cy.add(graph.edges);
      try { cy.layout({ name: "dagre", rankDir: "BT", animate: false, fit: true, padding: 30 }).run(); } catch (e) {}

      // v0.7.5 — Run the full ontoink pipeline on the live graph so the
      // playground-class toolbar works: flag blank nodes, auto-cluster
      // on big graphs, rebuild facets, then re-apply LOD.
      var inst = instances["le-graph"];
      if (inst) {
        inst.data.nodes = graph.nodes;
        inst.data.edges = graph.edges;
        inst.data.prefixes = parsed.prefixes;
        inst.data.namespaces = parsed.prefixes;
        // v0.7.7 — Filter activeNamespaces to only prefixes actually
        // referenced by the current graph. Without this, the Prefixes
        // overlay shows all 15 built-in prefixes even for a one-triple
        // document. Iterate all node IRIs + edge predicate IRIs and
        // record which registered prefixes they use.
        var referenced = {};
        function _bumpPrefix(iri) {
          if (!iri) return;
          for (var k in parsed.prefixes) {
            var ns = parsed.prefixes[k];
            if (ns && iri.indexOf(ns) === 0) { referenced[k] = ns; return; }
          }
        }
        graph.nodes.forEach(function(n) { _bumpPrefix(n.data && n.data.iri); });
        graph.edges.forEach(function(e) { _bumpPrefix(e.data && (e.data.iri || e.data.predicate)); });
        inst.data.activeNamespaces = Object.keys(referenced).length ? referenced : parsed.prefixes;
        // Reset the ns-clusterer's idempotency guard so a fresh parse
        // re-clusters cleanly (the DSL editor changes ontology shape
        // between keystrokes; we can't cache).
        inst._nsClustered = false;
        inst.sideStore = {};
        inst._memberToCid = null;
        inst._origEdges = null;
        inst.expandedSuperNodes = new Set();
        try { _flagBlankNodes(cy); } catch (e2) {}
        try { _autoClusterByNamespace("le-graph"); } catch (e3) {}
        try { _buildFacets(inst); } catch (e4) {}
        try { setLodLevel("le-graph", inst.lodLevel); } catch (e5) {}
      }

      // v0.7.7 — Playground-parity Legend + Prefixes overlays. The
      // graph container has `.ov-legend-overlay` and `.ov-ns-overlay`
      // divs; rebuild them from inst.data so their content stays in
      // sync with the current parse.
      try {
        var graphContainer = document.getElementById("le-graph");
        if (graphContainer && inst && inst.data) {
          buildLegendOverlay(graphContainer, inst.data);
          buildNsOverlay(graphContainer, inst.data);
        }
      } catch (e6) {}

      if (st.stats) {
        var errN = (parsed.errors && parsed.errors.length) || 0;
        var warnN = (graph.warnings && graph.warnings.length) || 0;
        var extras = "";
        if (errN)  extras += " · " + errN + " error" + (errN === 1 ? "" : "s");
        if (warnN) extras += " · " + warnN + " warning" + (warnN === 1 ? "" : "s");
        st.stats.textContent = graph.nodes.length + " nodes · " + graph.edges.length + " edges" + extras;
      }
    }

    function _escHtml(s) {
      return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function reset(containerId) {
      var st = _leState[containerId]; if (!st) return;
      st.editor.value = window.ontoinkDsl.exampleText();
      _refresh(containerId);
    }
    // v0.7.4 — Load one of the predefined DSL examples into the editor.
    // Wired to the "Examples" dropdown in demo/docs/live-editor.md.
    function loadExample(containerId, exampleId) {
      var st = _leState[containerId]; if (!st) return;
      var examples = (window.ontoinkDsl && window.ontoinkDsl.examples && window.ontoinkDsl.examples()) || [];
      var found = null;
      for (var i = 0; i < examples.length; i++) {
        if (examples[i].id === exampleId) { found = examples[i]; break; }
      }
      if (!found) return;
      st.editor.value = found.text;
      _refresh(containerId);
    }
    // v0.7.4-fix — Fill the Examples <select> with the predefined
    // options at mount time. Idempotent; if the dropdown already has
    // more than the initial single option we leave it alone.
    function _populateExamplesDropdown() {
      var sel = document.getElementById("le-example-select");
      if (!sel || sel.options.length > 1) return;
      var examples = (window.ontoinkDsl && window.ontoinkDsl.examples && window.ontoinkDsl.examples()) || [];
      // Preserve the first "placeholder" option added by the markdown.
      for (var i = 0; i < examples.length; i++) {
        var e = examples[i];
        var opt = document.createElement("option");
        opt.value = e.id; opt.textContent = e.label;
        sel.appendChild(opt);
      }
    }
    function copyTtl(containerId) {
      var st = _leState[containerId]; if (!st || !st.ttlOut) return;
      var text = st.ttlOut.textContent || "";
      try {
        navigator.clipboard.writeText(text);
      } catch (e) {
        var ta = document.createElement("textarea");
        ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); } catch (e2) {}
        document.body.removeChild(ta);
      }
    }
    function _download(text, filename, mime) {
      try {
        var blob = new Blob([text], { type: mime || "text/plain" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function() { URL.revokeObjectURL(url); }, 500);
      } catch (e) { console.error("[ontoink.liveEditor] download failed", e); }
    }
    function downloadTtl(containerId) {
      var st = _leState[containerId]; if (!st || !st.ttlOut) return;
      _download(st.ttlOut.textContent || "", "ontoink-live.ttl", "text/turtle");
    }
    function downloadNTriples(containerId) {
      var st = _leState[containerId]; if (!st) return;
      var parsed = window.ontoinkDsl.parse(st.editor.value);
      // N-Triples: each triple on one line with fully-expanded IRIs.
      var lines = [];
      parsed.triples.forEach(function(t) {
        lines.push(_ntTerm(t.s, parsed.prefixes) + " " + _ntTerm(t.p, parsed.prefixes) + " " + _ntObj(t.o, parsed.prefixes) + " .");
      });
      _download(lines.join("\n") + (lines.length ? "\n" : ""), "ontoink-live.nt", "application/n-triples");
    }
    function _ntTerm(t, prefixes) {
      if (!t) return "";
      if (t.kind === "iri")   return "<" + t.value + ">";
      if (t.kind === "curie") return "<" + ((prefixes[t.prefix] || (t.prefix + ":")) + t.local) + ">";
      if (t.kind === "blank") return "_:" + t.value;
      return "";
    }
    function _ntObj(o, prefixes) {
      if (!o) return "";
      if (o.kind !== "literal") return _ntTerm(o, prefixes);
      var v = '"' + String(o.value).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
      if (o.lang) return v + "@" + o.lang;
      if (o.datatype) {
        var dt = o.datatype;
        if (dt.indexOf(":") > 0 && dt.indexOf("<") < 0) {
          var p = dt.split(":");
          if (prefixes[p[0]]) return v + "^^<" + prefixes[p[0]] + p[1] + ">";
        }
        return v + "^^" + dt;
      }
      return v;
    }

    return {
      mount: mount,
      reset: reset,
      copyTtl: copyTtl,
      downloadTtl: downloadTtl,
      downloadNTriples: downloadNTriples,
      loadExample: loadExample
    };
  })();

  // v0.7.4-fix — Bind the liveEditor export NOW that the IIFE above has
  // finished. The `api` object literal higher up ran BEFORE `liveEditor`
  // was assigned; putting `liveEditor: liveEditor` there captured
  // `undefined`, and `ontoink.liveEditor` was silently null for callers
  // like fence toolbars and the live-editor page.
  api.liveEditor = liveEditor;

  // v0.7.4-fix — Auto-mount the live editor when the page has one.
  //
  // The user's first attempt of the live editor rendered nothing: the
  // page-side `<script>DOMContentLoaded -> mount<\/script>` fired BEFORE  // (escape the closing tag — else the HTML parser truncates the inlined JS)
  // the mkdocs plugin's injected `ontoink.js` had finished executing
  // (mkdocs-material can defer inline script execution), so at wake time
  // `window.ontoink` was still undefined and the listener silently
  // returned. Moving the auto-mount into ontoink.js itself guarantees
  // it runs strictly AFTER the IIFE has exported `liveEditor` — the
  // whole module + the DSL sibling are all present, no page-side
  // script needed.
  //
  // A small polling fallback handles the (rare) case where cytoscape
  // is still loading when we're first ready.
  if (typeof document !== "undefined") {
    var _autoMountAttempts = 0;
    function _autoMountLiveEditor() {
      var host = document.getElementById("live-editor-app");
      if (!host) return; // not a live-editor page
      if (typeof cytoscape === "undefined" || typeof window.ontoinkDsl === "undefined") {
        if (_autoMountAttempts++ < 40) {
          setTimeout(_autoMountLiveEditor, 100);
        } else {
          console.warn("[ontoink] live editor deps never loaded (cytoscape or ontoinkDsl missing)");
        }
        return;
      }
      try { liveEditor.mount("live-editor-app"); }
      catch (e) { console.error("[ontoink] live editor mount failed", e); }
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", _autoMountLiveEditor);
    } else {
      // DOM already parsed — fire on next tick so the rest of this IIFE
      // finishes attaching to `window` before mount runs.
      setTimeout(_autoMountLiveEditor, 0);
    }
  }

  // v0.7.4-fix — Emit the fully-populated api object out of the IIFE
  // (assigned to window.ontoink at the top). This MUST be the last
  // statement in the IIFE — any code after `return` becomes dead code
  // (which is exactly the bug this commit fixes).
  return api;
})();
