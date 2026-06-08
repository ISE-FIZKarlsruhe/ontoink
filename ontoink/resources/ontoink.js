/**
 * ontoink.js v0.6.2 — Interactive ontology visualization with formal notation,
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
    var boxH = domH ? domH*s : pad*2 + row*(maxRows+2);

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
    if (d.edgeType === "owl-restriction") {
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
    { ns: "https://nfdi.fiz-karlsruhe.de/ontology/", urls: ["https://ise-fizkarlsruhe.github.io/nfdicore/3.0.4/ontology.ttl"] },
    { ns: "http://purl.obolibrary.org/obo/BFO_", urls: ["https://raw.githubusercontent.com/BFO-ontology/BFO-2020/master/src/owl/bfo-2020.owl"] },
    { ns: "http://purl.obolibrary.org/obo/IAO_", urls: ["https://raw.githubusercontent.com/information-artifact-ontology/IAO/master/src/ontology/iao.owl"] },
    { ns: "http://purl.obolibrary.org/obo/RO_", urls: ["https://raw.githubusercontent.com/oborel/obo-relations/master/ro.owl"] },
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

    // Step 1: Check known URL registry (bypasses CORS-broken redirects)
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

    _ontologyFetchPromises[nsBase] = tryKnownUrls()
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
        + '<button class="ov-btn ov-deref-fetch-btn" style="font-size:10px;padding:2px 8px;" onclick="ontoink.derefIriRemote(\'' + esc(iri).replace(/'/g, "\\'") + '\',this)">Fetch from web</button>'
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

    var html = '<div class="ov-overlay-head"><span>Legend</span><button class="ov-overlay-close" onclick="this.closest(\'.ov-legend-overlay\').style.display=\'none\'">&times;</button></div>';
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
      var arrow = (live && live.edgeArrows[t]) || (def.filled ? "triangle" : "triangle");
      var dash = ls === "dashed" ? "4,2" : ls === "dotted" ? "1,2" : "";
      var da = dash ? ' stroke-dasharray="'+dash+'"' : '';
      var fillArrow = def.filled ? color : "none";
      html += '<div class="ov-oentry"><svg width="34" height="12"><line x1="0" y1="6" x2="22" y2="6" stroke="'+color+'" stroke-width="'+(def.bold?2.5:1.5)+'"'+da+'/><polygon points="22,2 32,6 22,10" fill="'+fillArrow+'" stroke="'+color+'" stroke-width="0.8"/></svg><span>'+esc(def.l)+'</span></div>';
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
    if (hasHidden) html += '<button class="ov-ns-toggle" onclick="ontoink.toggleAllNs(\'' + cid + '\')">Show all</button>';
    html += '<button class="ov-overlay-close" onclick="this.closest(\'.ov-ns-overlay\').style.display=\'none\'">&times;</button></div>';
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
      wheelSensitivity: 0.3, minZoom: 0.15, maxZoom: 5,
    });

    instances[containerId] = { cy:cy, data:data, editor:null, originalTtl:data.rawTtl||"" };

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
    cy.on("tap", "node", function(evt) {
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

  function validate(id) {
    var inst=instances[id]; if(!inst)return;
    var outEl=document.getElementById(id).querySelector(".ov-validation-output"); if(!outEl)return;
    var ttl = getEditorValue(id);
    var shapes = getShapesValue(id);
    // Combined parse: data triples come from the source pane, shape
    // triples from the shapes pane. We pass both to parseTtlMinimal as
    // one document so prefix declarations from either side apply.
    var combinedTtl = (ttl || "") + "\n" + (shapes || "");
    var parsed = parseTtlMinimal(combinedTtl), triples = parsed.triples;
    // Try to re-extract constraints from the edited shapes; fall back
    // to the build-time array if extraction yields nothing (e.g. when
    // shapes use inline blank-node property syntax the minimal parser
    // can't read).
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
    var summary = violations.length
      ? violations.length + " violation(s) found across " + sc.length + " constraint(s)."
      : "All " + sc.length + " constraint(s) satisfied.";
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
    function en(u){if(nodes[u]||u[0]==='"')return;var ic=classes[u]||false,s=detectSource(u);nodes[u]={data:{id:u,label:labels[u]||uriLabel(u,pf),type:ic?"Class":"Individual",color:ic?s.color:"#E6E6E6",shape:ic?"rectangle":"ellipse",iri:u,source:s.name,namespace:""}};}
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
    inst.cy.nodes().forEach(function(n){var d=n.data();if(d.source)sources[d.source]=d.color;types[d.type]=d.color;typeShapes[d.type]=n.style("shape");});

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
    var h='<div class="ov-color-panel-head"><strong>Edit Layout</strong><button class="ov-popup-close" onclick="this.closest(\'.ov-color-panel\').remove()">&times;</button></div>';

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
      if(kind==="source") inst.cy.nodes().forEach(function(n){if(n.data("source")===key&&n.data("type")==="Class")n.data("color",col);});
      if(kind==="edge-color") inst.cy.edges().forEach(function(e){if(e.data("edgeType")===key){e.style({"line-color":col,"target-arrow-color":col,"source-arrow-color":col});}});
      // Also propagate to inst.data so exports + future legend re-renders pick it up
      if(kind==="type") inst.data.nodes.forEach(function(n){if(n.data.type===key)n.data.color=col;});
      if(kind==="source") inst.data.nodes.forEach(function(n){if(n.data.source===key&&n.data.type==="Class")n.data.color=col;});
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

    // full:true = tight crop, no whitespace, no minimap
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
      var pad=12*scale, gap=10*scale;
      // Measure overlay heights
      var tc=document.createElement("canvas");tc.width=1;tc.height=1;
      var lH=showLegend?drawLegendBox(tc.getContext("2d"),exportData,0,0,scale):0;
      var nH=showNs?drawNsBox(tc.getContext("2d"),exportData,0,0,scale):0;
      var lW=showLegend?legendEl.offsetWidth*scale:0;
      var nW=showNs?nsEl.offsetWidth*scale:0;
      var sideBySide=showLegend&&showNs&&(lW+gap+nW+pad*2<=graphImg.width);
      var overlayH=0;
      if(showLegend||showNs){
        overlayH=pad+(sideBySide?Math.max(lH,nH):(showLegend?lH+gap:0)+(showNs?nH:0))+pad;
      }

      var finalCanvas=document.createElement("canvas");
      finalCanvas.width=graphImg.width;
      finalCanvas.height=graphImg.height+overlayH;
      var ctx=finalCanvas.getContext("2d");
      ctx.fillStyle="#fff";ctx.fillRect(0,0,finalCanvas.width,finalCanvas.height);
      ctx.drawImage(graphImg,0,0);

      if(showLegend||showNs){
        var by=graphImg.height+pad;
        if(showLegend)drawLegendBox(ctx,exportData,pad,by,scale,legendEl.offsetWidth,legendEl.offsetHeight);
        if(showNs){
          var nsX=sideBySide?pad+lW+gap:pad;
          var nsY=sideBySide?by:by+(showLegend?lH+gap:0);
          drawNsBox(ctx,exportData,nsX,nsY,scale,nsEl.offsetWidth,nsEl.offsetHeight);
        }
      }

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
      // full:true = tight crop, no minimap, no whitespace
      var svgStr=cy.svg({scale:1,full:true,bg:"#fff"});
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
      var sideBySide=showLegend&&showNs&&nsKeys.length&&(lW+8+nW+pad*2<=origW);
      var overlayH=0;
      if(showLegend||(showNs&&nsKeys.length)){
        overlayH=pad+(sideBySide?Math.max(legendH,nsH):(showLegend?legendH+8:0)+(nsKeys.length?nsH:0))+pad;
      }
      var totalH=origH+overlayH;

      svgEl.setAttribute("height",totalH);
      var vb=svgEl.getAttribute("viewBox");
      if(vb){var parts=vb.split(/[\s,]+/);parts[3]=totalH;svgEl.setAttribute("viewBox",parts.join(" "));}
      var bgRect=svgEl.querySelector("rect");
      if(bgRect&&bgRect.getAttribute("fill")==="#fff")bgRect.setAttribute("height",totalH);

      var by=origH+pad;

      // Legend below graph
      if(showLegend){
        var g=doc.createElementNS("http://www.w3.org/2000/svg","g");
        g.setAttribute("transform","translate("+pad+","+by+")");
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

      // Prefixes below or beside legend
      if(showNs&&nsKeys.length){
        var nsX=sideBySide?pad+lW+8:pad;
        var nsY=sideBySide?by:by+(showLegend?legendH+8:0);
        var g2=doc.createElementNS("http://www.w3.org/2000/svg","g");
        g2.setAttribute("transform","translate("+nsX+","+nsY+")");
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
    var pre = inst.data.inferred || [];
    panel.style.display = "block";
    if (pre.length) {
      var rows = pre.map(function(t) {
        return '<tr><td>' + esc(t.sLabel || t.s) + '</td><td>' + esc(t.pLabel || t.p) + '</td><td>' + esc(t.oLabel || t.o) + '</td></tr>';
      }).join("");
      panel.innerHTML =
        '<div class="ov-panel-head">Reasoning <button class="ov-panel-close" onclick="this.closest(\'.ov-reasoning-panel\').style.display=\'none\'">&times;</button></div>' +
        '<div class="ov-reasoning-body">' +
          '<div style="padding:8px 12px;color:#374151;font-size:13px;background:#f0fdf4;border-bottom:1px solid #d1d5db;"><strong>' + pre.length + '</strong> pre-computed inference' + (pre.length === 1 ? '' : 's') + ' from build time. <a href="#" onclick="ontoink.togglePlaygroundReasoning(\'' + id + '\');ontoink.togglePlaygroundReasoning(\'' + id + '\');event.preventDefault();return false;">Re-run with selected backend ↻</a></div>' +
          '<table class="ov-reasoning-table"><thead><tr><th>Subject</th><th>Predicate</th><th>Object</th></tr></thead><tbody>' + rows + '</tbody></table>' +
        '</div>';
    } else {
      // No pre-computed inferences — go straight to interactive flow
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
    // Get current TTL and append inferred triples as additional TTL statements
    var ttl = getEditorValue(id);
    var inferred = inst.data.inferred || [];
    if (!inferred.length) { validate(id); return; }
    // Build extra triples in Turtle syntax
    var extra = "\n# ── Inferred triples (OWL-RL) ──\n";
    inferred.forEach(function(t) {
      if (t.isLiteral) {
        extra += "<" + t.s + "> <" + t.p + "> " + JSON.stringify(t.o) + " .\n";
      } else {
        extra += "<" + t.s + "> <" + t.p + "> <" + t.o + "> .\n";
      }
    });
    var combined = ttl + extra;
    var sc = inst.data.shacl || [];
    if (!sc.length) { renderValidation(outEl, { conforms: null, violations: [], report: "No SHACL shapes defined." }); return; }
    var parsed = parseTtlMinimal(combined), triples = parsed.triples, violations = [];
    sc.forEach(function(cn) {
      if (!cn.targetClass || !cn.path) return;
      var ti = [];
      triples.forEach(function(t) { if (t.p === "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" && t.o === cn.targetClass) ti.push(t.s); });
      if (!ti.length) triples.forEach(function(t) { if (t.p === "http://www.w3.org/1999/02/22-rdf-syntax-ns#type") triples.forEach(function(t2) { if (t2.s === t.o && t2.p === "http://www.w3.org/2000/01/rdf-schema#subClassOf" && t2.o === cn.targetClass) ti.push(t.s); }); });
      ti.forEach(function(inst2) { var cnt = 0; triples.forEach(function(t) { if (t.s === inst2 && t.p === cn.path) cnt++; });
        if (cn.minCount != null && cnt < cn.minCount) violations.push({ focusNode: inst2, path: cn.path, message: cn.message || ("Expected min " + cn.minCount + " for " + (cn.pathLabel || cn.path) + ", found " + cnt) });
        if (cn.maxCount != null && cnt > cn.maxCount) violations.push({ focusNode: inst2, path: cn.path, message: cn.message || ("Expected max " + cn.maxCount + " for " + (cn.pathLabel || cn.path) + ", found " + cnt) });
      });
    });
    renderValidation(outEl, { conforms: !violations.length, violations: violations, report: violations.length ? violations.length + " violation(s) found (with inferences)." : "All constraints satisfied (with inferences)." });
    // Make editor panel visible so user sees result
    var edPanel = c.querySelector(".ov-editor-panel");
    if (edPanel && edPanel.style.display === "none") edPanel.style.display = "block";
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
      nodes[u] = { data: { id: u, label: labels[u] || uriLabel(u, pf), type: ic ? "Class" : "Individual", color: ic ? s.color : "#E6E6E6", shape: ic ? "rectangle" : "ellipse", iri: u, source: s.name, namespace: "" } };
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
      ],
      layout: { name: "dagre", rankDir: "BT", nodeSep: 60, rankSep: 80, edgeSep: 20, animate: false, fit: true, padding: 30 },
      wheelSensitivity: 0.3, minZoom: 0.15, maxZoom: 5,
    });

    instances[containerId] = { cy: cy, data: data, editor: null, originalTtl: ttl };

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
    cy.on("tap", "node", function(evt) {
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
      hint.innerHTML = 'Focused on <strong>' + esc(best.data("label")) + '</strong> (most connected). <button class="ov-chip" onclick="ontoink.resetFocus(\'' + containerId + '\');this.parentElement.remove();">Show All</button>';
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

    var h = '<div class="ov-editor-header ov-panel-head">Graph Statistics &amp; Ontology Metrics<button class="ov-panel-close" onclick="this.closest(\'.ov-stats-panel\').style.display=\'none\'">&times;</button></div><div class="ov-stats-body">';

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
        h += ' <button class="ov-chip" onclick="ontoink.showCoverage(\'' + id + '\')">Show on graph</button>';
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
    hint.innerHTML = 'Abstract Model View (' + keepNodes.length + ' classes). <button class="ov-chip" onclick="ontoink.fullView(\'' + id + '\');this.parentElement.remove();">Show Full Graph</button>';
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
    panel.innerHTML = '<div class="ov-editor-header ov-panel-head">Path Finder<button class="ov-panel-close" onclick="this.closest(\'.ov-pathfinder-panel\').style.display=\'none\'">&times;</button></div>'
      + '<div class="ov-pathfinder-body">'
      + '<div class="ov-pf-row"><label>From:</label><select class="ov-pf-select" id="pf-from-' + id + '">' + nodeOpts + '</select></div>'
      + '<div class="ov-pf-row"><label>To:</label><select class="ov-pf-select" id="pf-to-' + id + '">' + nodeOpts + '</select></div>'
      + '<div class="ov-pf-row"><button class="ov-btn ov-btn-primary" onclick="ontoink.findPath(\'' + id + '\')">Find Path</button>'
      + '<button class="ov-btn" onclick="ontoink.clearPath(\'' + id + '\')">Clear</button></div>'
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
    panel.innerHTML = '<div class="ov-editor-header ov-panel-head">SPARQL Query <span style="font-size:10px;font-weight:400;color:#9ca3af;text-transform:none;">' + acHint + '</span><button class="ov-panel-close" onclick="this.closest(\'.ov-sparql-panel\').style.display=\'none\'">&times;</button></div>'
      + '<div class="ov-sparql-body">'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;">'
      + '<select class="ov-shape-select" onchange="ontoink.sparqlTemplate(\'' + id + '\',this.value)"><option value="">Template...</option><option value="all">All triples</option><option value="type">Instances of class</option><option value="props">Properties of class</option><option value="label">Find by label</option></select>'
      + '<select class="ov-shape-select ov-sparql-class-sel">' + dd.classOpts + '</select>'
      + '<select class="ov-shape-select ov-sparql-prop-sel">' + dd.propOpts + '</select>'
      + '</div>'
      + '<div style="position:relative;"><textarea class="ov-sparql-textarea" rows="6">SELECT ?s ?p ?o WHERE {\n  ?s ?p ?o\n} LIMIT 20</textarea></div>'
      + '<div class="ov-editor-actions"><button class="ov-btn ov-btn-primary" onclick="ontoink.runSparql(\'' + id + '\')">Run Query</button>'
      + '<button class="ov-btn" onclick="ontoink.sparqlHighlight(\'' + id + '\')">Highlight Results</button></div>'
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
    return '<div style="padding:5px 10px;cursor:pointer;display:flex;align-items:center;gap:6px;border-bottom:1px solid #f3f4f6;" onmousedown="ontoink.selectSparqlAC(\'' + id + '\',' + i + ')">'
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

    // Render table with labels
    var h = '<div style="font-size:12px;color:#374151;margin-bottom:6px;"><strong>' + results.length + '</strong> result(s)</div>';
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

  function loadBrowserReasoner() {
    if (_wasmReasoner) return Promise.resolve(_wasmReasoner);
    if (!isBrowserReasonerAvailable()) {
      return Promise.reject(new Error("Browser reasoner needs cross-origin isolation (COOP/COEP). Add the coi-serviceworker, or use the Server option."));
    }
    // Prefer the same-origin vendored bundle (works around the cross-origin
    // Worker restriction that fails for esm.sh). Fall back to esm.sh only if
    // the bundle is not deployed (e.g. on GitHub Pages without the vendor copy).
    function loadVendored() {
      return import("/assets/reasoner/bundle.mjs").then(function(mod) {
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
        var origin = location.origin;
        throw new Error(
          msg + " — the WASM worker died during init. Likely cause: " +
          "the reasoner bundle is being loaded cross-origin (browsers refuse " +
          "to spawn cross-origin module workers even with COEP credentialless). " +
          "Verify /assets/reasoner/bundle.mjs is reachable from " + origin + " — " +
          "if it 404s, vendor the bundle (see TESTING.md §Reasoning), or use a Server reasoner instead."
        );
      }).then(function() {
        log("Running classification + realization…");
        var unwound = false;
        return ctx.reasoner.reason(store).catch(function(e) {
          // Emscripten unwinds the WASM call stack on program exit by throwing a
          // sentinel value ("unwind" / "Error: unwind"). The Node build swallows
          // it; the esbuild browser bundle lets it escape. If Konclude already
          // populated the inferred graph, the run actually succeeded — so treat
          // an 'unwind' as non-fatal and let the collector below verify. Any
          // other error is a real failure and is re-thrown.
          var m = (e && (e.message || e.name)) || String(e);
          if (!/unwind/i.test(m)) throw e;
          unwound = true;
          log("Konclude unwound the WASM stack on exit (Emscripten); checking for results…");
        }).then(function() {
          var inferred = store.getQuads(null, null, null, ctx.Konclude.INFERRED_GRAPH_IRI);
          if (unwound && !inferred.length) {
            throw new Error(
              "Konclude WASM aborted with 'unwind' before producing any inferences — " +
              "an Emscripten exit/Asyncify issue in the in-browser worker. Pick a " +
              "Server reasoner in the dropdown (same Konclude engine, runs in Node and works)."
            );
          }
          log("Konclude finished. Collecting " + inferred.length + " inferred quad(s)…");
          return inferred.map(function(q) {
            var s = q.subject.value, p = q.predicate.value, o = q.object;
            var isLit = o.termType === "Literal";
            return {
              s: s, p: p, o: o.value, isLiteral: isLit,
              sLabel: s.split(/[#/]/).pop(),
              pLabel: p.split(/[#/]/).pop(),
              oLabel: isLit ? o.value : o.value.split(/[#/]/).pop(),
            };
          });
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
            ' <button class="ov-chip" onclick="ontoink.diagnoseReasoner(\'' + id + '\')" style="margin-left:8px;">Run diagnostic</button>' +
            ' <button class="ov-chip" onclick="ontoink.togglePlaygroundReasoning(\'' + id + '\')" style="margin-left:4px;">↻ Retry</button>' +
          '</div>' +
          (stack ? '<details style="padding:0 12px 8px;font-size:11px;color:#6b7280;" open><summary style="cursor:pointer;">Stack trace</summary><pre style="background:#111827;color:#fbbf24;padding:10px;border-radius:6px;overflow:auto;max-height:240px;font-family:\'JetBrains Mono\',\'Fira Code\',ui-monospace,monospace;font-size:11px;line-height:1.4;margin:6px 0 0 0;">' + esc(stack) + '</pre></details>' : '');
      }

      // Build the panel HTML
      var headHtml = '<div class="ov-panel-head">Reasoning <button class="ov-panel-close" onclick="this.closest(\'.ov-reasoning-panel\').style.display=\'none\'">&times;</button></div>';
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
      '<label class="ov-overlay-toggle"><input type="checkbox" ' + (overlayOn ? "checked" : "") + ' onchange="ontoink.setInferredOverlay(\'' + id + '\',this.checked)"> Show inferences on graph</label>' +
      (count ? ' <button class="ov-chip" onclick="ontoink.downloadInferences(\'' + id + '\')">Download (N-Triples)</button>' +
               ' <button class="ov-chip" onclick="ontoink.copyInferences(\'' + id + '\')">Copy JSON</button>' : '') +
      ' <button class="ov-chip" onclick="ontoink.togglePlaygroundReasoning(\'' + id + '\',true)" style="margin-left:auto;">↻ Re-run</button>' +
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
      '<div class="ov-panel-head">Reasoning <button class="ov-panel-close" onclick="this.closest(\'.ov-reasoning-panel\').style.display=\'none\'">&times;</button></div>' +
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
      '<div class="ov-panel-head">Reasoner diagnostic <button class="ov-panel-close" onclick="this.closest(\'.ov-reasoning-panel\').style.display=\'none\'">&times;</button></div>' +
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

  // Populate any reasoner dropdowns once DOM is ready
  document.addEventListener("DOMContentLoaded", function() {
    document.querySelectorAll(".ov-reasoner-select").forEach(populateReasonerSelect);
  });

  document.addEventListener("DOMContentLoaded",function(){document.querySelectorAll(".ontoink-container").forEach(function(el){initGraph(el.id);});});

  return { zoomIn:zoomIn, zoomOut:zoomOut, fit:fit, fullscreen:fullscreen, exportPNG:exportPNG, exportSVG:exportSVG, downloadTTL:downloadTTL, toggleEditor:toggleEditor, validate:validate, updateGraph:updateGraph, resetEditor:resetEditor, toggleAllNs:toggleAllNs, toggleColors:toggleColors, toggleReasoning:toggleReasoning, toggleInferredOnGraph:toggleInferredOnGraph, validateWithReasoning:validateWithReasoning, playground:playground, search:search, changeLayout:changeLayout, focusNode:focusNode, resetFocus:resetFocus, abstractView:abstractView, fullView:fullView, toggleStats:toggleStats, showCoverage:showCoverage, togglePathFinder:togglePathFinder, findPath:findPath, clearPath:clearPath, toggleSparql:toggleSparql, sparqlTemplate:sparqlTemplate, runSparql:runSparql, sparqlHighlight:sparqlHighlight, selectSparqlAC:selectSparqlAC, derefIriRemote:derefIriRemote, togglePlaygroundReasoning:togglePlaygroundReasoning, downloadInferences:downloadInferences, copyInferences:copyInferences, diagnoseReasoner:diagnoseReasoner, setInferredOverlay:setInferredOverlay };
})();
