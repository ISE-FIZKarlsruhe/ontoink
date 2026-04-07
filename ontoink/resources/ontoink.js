/**
 * ontoink.js v0.2.0 — Interactive ontology visualization with formal notation,
 * draggable legend/prefix overlays, inline TTL editing, SHACL validation, and color customization.
 */
var ontoink = (function () {
  "use strict";

  var instances = {};

  // ── Helpers ──────────────────────────────────────────────────────────────

  function esc(s) { return s ? s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;") : ""; }
  function copyText(t, btn) { navigator.clipboard.writeText(t).catch(function(){}); var o=btn.textContent; btn.textContent="Copied!"; setTimeout(function(){btn.textContent=o;},1200); }
  function removePopup(c) { var o=c.querySelector(".ov-popup"); if(o) o.remove(); }

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
  };

  function drawLegendBox(ctx, data, x, y, s) {
    var font = function(w, sz) { return w+" "+(sz*s)+"px Inter,Segoe UI,system-ui,sans-serif"; };
    var pad = 12*s, row = 20*s, iconSz = 14*s, gap = 8*s, r = 8*s;

    var usedTypes = {}, usedEdge = {};
    data.nodes.forEach(function(n) { usedTypes[n.data.type] = n.data.color; });
    data.edges.forEach(function(e) { usedEdge[e.data.edgeType] = true; });
    var nodeKeys = Object.keys(usedTypes), edgeKeys = Object.keys(usedEdge);
    var maxRows = Math.max(nodeKeys.length, edgeKeys.length);
    var boxW = 300*s, boxH = pad*2 + row*(maxRows+2);

    // Background
    drawRoundRect(ctx, x, y, boxW, boxH, r);
    ctx.fillStyle = "rgba(255,255,255,0.95)"; ctx.fill();
    ctx.strokeStyle = "#d1d5db"; ctx.lineWidth = 1.5*s; ctx.stroke();

    var ty = y + pad;
    ctx.font = font("700",12); ctx.fillStyle = "#1f2937";
    ctx.fillText("Legend", x+pad, ty+12*s); ty += row+2*s;

    var col1 = x+pad, col2 = x + boxW/2 + 4*s;

    // Nodes column
    ctx.font = font("700",8.5); ctx.fillStyle = "#9ca3af";
    ctx.fillText("NODES", col1, ty+9*s);
    var ny = ty + row*0.8;
    nodeKeys.forEach(function(t) {
      var c = usedTypes[t], ix = col1, iy = ny+1*s;
      if (t === "Class") {
        ctx.fillStyle = c; ctx.fillRect(ix, iy, iconSz, iconSz*0.65);
        ctx.strokeStyle = "#555"; ctx.lineWidth = 1.5*s; ctx.strokeRect(ix, iy, iconSz, iconSz*0.65);
      } else if (t === "Individual") {
        ctx.fillStyle = c; ctx.strokeStyle = "#999"; ctx.lineWidth = 1*s;
        ctx.beginPath(); ctx.arc(ix+iconSz/2, iy+iconSz*0.32, iconSz*0.32, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      } else if (t === "Literal") {
        ctx.fillStyle = c; ctx.strokeStyle = "#6a9"; ctx.lineWidth = 1*s;
        ctx.setLineDash([3*s,2*s]);
        ctx.beginPath(); ctx.ellipse(ix+iconSz/2, iy+iconSz*0.32, iconSz*0.45, iconSz*0.28, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = c; ctx.fillRect(ix, iy, iconSz, iconSz*0.65);
        ctx.strokeStyle = "#888"; ctx.lineWidth = 1*s; ctx.strokeRect(ix, iy, iconSz, iconSz*0.65);
      }
      ctx.font = font("400",10); ctx.fillStyle = "#374151";
      ctx.fillText(t, ix+iconSz+gap, ny+10*s);
      ny += row*0.85;
    });

    // Edges column
    ctx.font = font("700",8.5); ctx.fillStyle = "#9ca3af";
    ctx.fillText("EDGES", col2, ty+9*s);
    var ey = ty + row*0.8;
    edgeKeys.forEach(function(t) {
      var d = EDGE_DEFS_EXPORT[t] || {l:t,c:"#999",dash:false,fill:true,bold:false};
      var lx = col2, ly = ey+7*s, len = 24*s;
      ctx.strokeStyle = d.c; ctx.lineWidth = (d.bold?2.5:1.5)*s;
      if (d.dash) ctx.setLineDash([4*s,2*s]); else ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(lx,ly); ctx.lineTo(lx+len,ly); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = d.fill ? d.c : "#fff"; ctx.strokeStyle = d.c; ctx.lineWidth = 1*s;
      ctx.beginPath(); ctx.moveTo(lx+len,ly); ctx.lineTo(lx+len-5*s,ly-3.5*s); ctx.lineTo(lx+len-5*s,ly+3.5*s); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.font = font("400",10); ctx.fillStyle = "#374151";
      ctx.fillText(d.l, lx+len+gap+2*s, ey+10*s);
      ey += row*0.85;
    });

    return boxH;
  }

  function drawNsBox(ctx, data, x, y, s) {
    var font = function(w, sz) { return w+" "+(sz*s)+"px Inter,Segoe UI,system-ui,sans-serif"; };
    var pad = 10*s, row = 16*s, r = 8*s;
    var ns = data.activeNamespaces || {};
    var keys = Object.keys(ns).sort();
    if (!keys.length) return 0;

    var boxW = 300*s, boxH = pad*2 + row*(keys.length+1);

    drawRoundRect(ctx, x, y, boxW, boxH, r);
    ctx.fillStyle = "rgba(255,255,255,0.95)"; ctx.fill();
    ctx.strokeStyle = "#d1d5db"; ctx.lineWidth = 1.5*s; ctx.stroke();

    var ty = y + pad;
    ctx.font = font("700",10); ctx.fillStyle = "#1f2937";
    ctx.fillText("Prefixes", x+pad, ty+10*s); ty += row+2*s;

    keys.forEach(function(p) {
      ctx.font = font("600",9); ctx.fillStyle = "#3730a3";
      ctx.fillText(p+":", x+pad, ty+9*s);
      var pw = ctx.measureText(p+": ").width;
      ctx.font = font("400",8.5); ctx.fillStyle = "#6b7280";
      ctx.fillText(ns[p], x+pad+pw, ty+9*s);
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
      html += '<div class="ov-popup-section"><strong>Connections:</strong><ul class="ov-popup-edges">';
      edges.forEach(function(e) { var ed=e.data(), oth=ed.source===d.id?ed.target:ed.source; html+='<li>'+(ed.source===d.id?"\u2192":"\u2190")+' <em>'+esc(ed.label)+'</em> '+esc(cy.getElementById(oth).data("label")||oth)+'</li>'; });
      html += '</ul></div>';
    }
    var shacl = instances[node.cy().container().closest(".ontoink-container").id]?.data?.shacl || [];
    var rel = shacl.filter(function(c){return c.targetClass===d.iri;});
    if (rel.length) {
      html += '<div class="ov-popup-section"><strong>SHACL Constraints:</strong><ul class="ov-popup-edges">';
      rel.forEach(function(c) { var cd = c.minCount!=null?"["+c.minCount+".."+(c.maxCount!=null?c.maxCount:"*")+"]":""; html+='<li>'+esc(c.pathLabel||c.path||"")+' '+cd+(c.message?'<br><small>'+esc(c.message)+'</small>':'')+'</li>'; });
      html += '</ul></div>';
    }
    html += '<div class="ov-popup-actions"><button class="ov-chip" data-action="copy-label">Copy Label</button>';
    if (d.iri) html += '<button class="ov-chip" data-action="copy-iri">Copy IRI</button>';
    return html + '</div>';
  }

  // ── Legend overlay (inside canvas) ──────────────────────────────────────

  function buildLegendOverlay(container, data) {
    var el = container.querySelector(".ov-legend-overlay");
    if (!el) return;
    if (container.getAttribute("data-show-legend") === "false") { el.style.display = "none"; return; }

    var usedTypes = {}, usedEdge = {};
    data.nodes.forEach(function(n) { usedTypes[n.data.type] = n.data.color; });
    data.edges.forEach(function(e) { usedEdge[e.data.edgeType] = true; });

    var icons = {
      Class:        '<svg width="18" height="13"><rect x="1" y="1" width="16" height="11" rx="2" fill="'+(usedTypes.Class||"#FDFDC8")+'" stroke="#555" stroke-width="1.5"/></svg>',
      Individual:   '<svg width="18" height="13"><ellipse cx="9" cy="6.5" rx="7" ry="5" fill="#E6E6E6" stroke="#999" stroke-width="1"/></svg>',
      Literal:      '<svg width="18" height="13"><ellipse cx="9" cy="6.5" rx="7" ry="4" fill="#93D053" stroke="#6a9" stroke-width="1" stroke-dasharray="2,1"/></svg>',
      Datatype:     '<svg width="18" height="13"><polygon points="9,1 17,6.5 9,12 1,6.5" fill="#93D053" stroke="#6a9" stroke-width="1"/></svg>',
      "SHACL Shape":'<svg width="18" height="13"><rect x="1" y="1" width="16" height="11" rx="5" fill="#A5F3FC" stroke="#0891b2" stroke-width="1"/></svg>',
    };
    var edgeDefs = {
      "object-property": { l:"Object Property", c:"#2563eb", d:"", f:true },
      "data-property":   { l:"Data Property",   c:"#16a34a", d:"3,2", f:false },
      "rdf-type":        { l:"rdf:type",         c:"#9ca3af", d:"4,2", f:false },
      "subclass":        { l:"rdfs:subClassOf",  c:"#374151", d:"", f:true },
      "shacl-constraint":{ l:"SHACL Constraint", c:"#0891b2", d:"4,2", f:true },
    };

    var html = '<div class="ov-overlay-head"><span>Legend</span><button class="ov-overlay-close" onclick="this.closest(\'.ov-legend-overlay\').style.display=\'none\'">&times;</button></div>';
    html += '<div class="ov-overlay-body"><div class="ov-overlay-cols">';

    html += '<div class="ov-overlay-col"><div class="ov-overlay-col-title">Nodes</div>';
    Object.keys(usedTypes).forEach(function(t) { html += '<div class="ov-oentry">' + (icons[t]||icons.Class) + '<span>' + esc(t) + '</span></div>'; });
    html += '</div>';

    html += '<div class="ov-overlay-col"><div class="ov-overlay-col-title">Edges</div>';
    Object.keys(usedEdge).forEach(function(t) {
      var d = edgeDefs[t] || { l:t, c:"#999", d:"", f:true };
      var da = d.d ? ' stroke-dasharray="'+d.d+'"' : '';
      html += '<div class="ov-oentry"><svg width="34" height="12"><line x1="0" y1="6" x2="22" y2="6" stroke="'+d.c+'" stroke-width="'+(t==="shacl-constraint"?2.5:1.5)+'"'+da+'/><polygon points="22,2 32,6 22,10" fill="'+(d.f?d.c:"none")+'" stroke="'+d.c+'" stroke-width="0.8"/></svg><span>'+esc(d.l)+'</span></div>';
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
    var data; try { data = JSON.parse(atob(b64)); } catch(e) { return; }
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
      ],
      layout: { name:"dagre", rankDir:"BT", nodeSep:60, rankSep:80, edgeSep:20, animate:false, fit:true, padding:30 },
      wheelSensitivity: 0.3, minZoom: 0.15, maxZoom: 5,
    });

    instances[containerId] = { cy:cy, data:data, editor:null, originalTtl:data.rawTtl||"" };

    cy.on("tap", "node", function(evt) {
      removePopup(container);
      var d=evt.target.data(), pos=evt.renderedPosition;
      var popup=document.createElement("div"); popup.className="ov-popup"; popup.innerHTML=buildPopup(d,cy);
      var cR=canvas.getBoundingClientRect(), pR=container.getBoundingClientRect();
      popup.style.left=(cR.left-pR.left+pos.x+15)+"px"; popup.style.top=(cR.top-pR.top+pos.y-15)+"px";
      container.appendChild(popup);
      requestAnimationFrame(function(){var r=popup.getBoundingClientRect();if(r.right>pR.right-10)popup.style.left=(parseFloat(popup.style.left)-r.width-30)+"px";if(r.bottom>pR.bottom-10)popup.style.top=(parseFloat(popup.style.top)-r.height)+"px";});
      popup.querySelector(".ov-popup-close").addEventListener("click",function(){popup.remove();});
      popup.querySelectorAll(".ov-chip").forEach(function(b){b.addEventListener("click",function(){copyText(b.dataset.action==="copy-iri"?d.iri:d.label,b);});});
    });
    cy.on("tap", function(e) { if(e.target===cy) removePopup(container); });

    buildLegendOverlay(container, data);
    buildNsOverlay(container, data);

    var ta = container.querySelector(".ov-editor-textarea");
    if (ta && data.rawTtl) ta.value = data.rawTtl;
    if (data.validation) { var o=container.querySelector(".ov-validation-output"); if(o) renderValidation(o,data.validation); }
  }

  // ── Editor ──────────────────────────────────────────────────────────────

  function toggleEditor(id) {
    var c=document.getElementById(id),p=c.querySelector(".ov-editor-panel"),inst=instances[id]; if(!p)return;
    var v=p.style.display!=="none"; p.style.display=v?"none":"block";
    if(!v&&!inst.editor&&typeof CodeMirror!=="undefined"){inst.editor=CodeMirror.fromTextArea(c.querySelector(".ov-editor-textarea"),{mode:"turtle",lineNumbers:true,lineWrapping:true,theme:"default",viewportMargin:Infinity});inst.editor.setSize(null,"300px");}
  }
  function getEditorValue(id) { var i=instances[id]; if(!i)return""; if(i.editor)return i.editor.getValue(); var t=document.getElementById(id).querySelector(".ov-editor-textarea"); return t?t.value:""; }

  // ── Validation ──────────────────────────────────────────────────────────

  function validate(id) {
    var inst=instances[id]; if(!inst)return;
    var outEl=document.getElementById(id).querySelector(".ov-validation-output"); if(!outEl)return;
    var ttl=getEditorValue(id), sc=inst.data.shacl||[];
    if(!sc.length){renderValidation(outEl,{conforms:null,violations:[],report:"No SHACL shapes defined."});return;}
    var parsed=parseTtlMinimal(ttl), triples=parsed.triples, violations=[];
    sc.forEach(function(c){
      if(!c.targetClass||!c.path)return;
      var ti=[];
      triples.forEach(function(t){if(t.p==="http://www.w3.org/1999/02/22-rdf-syntax-ns#type"&&t.o===c.targetClass)ti.push(t.s);});
      if(!ti.length)triples.forEach(function(t){if(t.p==="http://www.w3.org/1999/02/22-rdf-syntax-ns#type")triples.forEach(function(t2){if(t2.s===t.o&&t2.p==="http://www.w3.org/2000/01/rdf-schema#subClassOf"&&t2.o===c.targetClass)ti.push(t.s);});});
      ti.forEach(function(inst){var cnt=0;triples.forEach(function(t){if(t.s===inst&&t.p===c.path)cnt++;});
        if(c.minCount!=null&&cnt<c.minCount)violations.push({focusNode:inst,path:c.path,message:c.message||("Expected min "+c.minCount+" for "+(c.pathLabel||c.path)+", found "+cnt)});
        if(c.maxCount!=null&&cnt>c.maxCount)violations.push({focusNode:inst,path:c.path,message:c.message||("Expected max "+c.maxCount+" for "+(c.pathLabel||c.path)+", found "+cnt)});
      });
    });
    renderValidation(outEl,{conforms:!violations.length,violations:violations,report:violations.length?violations.length+" violation(s) found.":"All constraints satisfied."});
  }
  function renderValidation(el,r){
    if(r.conforms===null){el.innerHTML='<div class="ov-val-info">'+esc(r.report)+'</div>';return;}
    var h=r.conforms?'<div class="ov-val-pass"><span class="ov-val-icon">&#x2714;</span> Conforms</div>':'<div class="ov-val-fail"><span class="ov-val-icon">&#x2718;</span> '+esc(r.report)+'</div>';
    if(!r.conforms){h+='<ul class="ov-val-list">';(r.violations||[]).forEach(function(v){h+='<li><strong>'+esc((v.focusNode||"").split("/").pop().split("#").pop())+'</strong>: '+esc(v.message)+'</li>';});h+='</ul>';}
    el.innerHTML=h;
  }

  // ── TTL Parser ──────────────────────────────────────────────────────────

  function parseTtlMinimal(ttl){var pf={},tr=[];var re=/@prefix\s+(\w*)\s*:\s*<([^>]+)>\s*\./g,m;while((m=re.exec(ttl))!==null)pf[m[1]]=m[2];
    function res(t){t=t.trim();if(t[0]==="<"&&t[t.length-1]===">")return t.slice(1,-1);if(t==="a")return"http://www.w3.org/1999/02/22-rdf-syntax-ns#type";var ci=t.indexOf(":");if(ci>=0){var p=t.substring(0,ci);if(pf[p]!==undefined)return pf[p]+t.substring(ci+1);}return t;}
    var lines=ttl.split("\n").map(function(l){var inA=false;for(var i=0;i<l.length;i++){if(l[i]==="<")inA=true;if(l[i]===">")inA=false;if(l[i]==="#"&&!inA)return l.substring(0,i);}return l;});
    var cl=lines.join("\n").replace(/@prefix[^.]*\.\s*/g,"").replace(/@base[^.]*\.\s*/g,"");
    cl.split(/\.\s*(?=\S|$)/).forEach(function(st){st=st.trim();if(!st)return;var tk=tokenize(st);if(tk.length<3)return;var s=res(tk[0]),i=1;
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

  // ── Update Graph ───────────────────────────────────────────────────────

  function updateGraph(id){var inst=instances[id];if(!inst)return;var p=parseTtlMinimal(getEditorValue(id)),tr=p.triples,pf=p.prefixes;
    var labels={},nodes={},edges=[],classes={};
    var RT="http://www.w3.org/1999/02/22-rdf-syntax-ns#type",SC="http://www.w3.org/2000/01/rdf-schema#subClassOf",RL="http://www.w3.org/2000/01/rdf-schema#label";
    tr.forEach(function(t){if(t.p===RL&&t.o[0]==='"')labels[t.s]=litVal(t.o);});
    tr.forEach(function(t){if(t.p===RT)classes[t.o]=true;if(t.p===SC){classes[t.s]=true;classes[t.o]=true;}});
    function en(u){if(nodes[u]||u[0]==='"')return;var ic=classes[u]||false,s=detectSource(u);nodes[u]={data:{id:u,label:labels[u]||uriLabel(u,pf),type:ic?"Class":"Individual",color:ic?s.color:"#E6E6E6",shape:ic?"rectangle":"ellipse",iri:u,source:s.name,namespace:""}};}
    tr.forEach(function(t){
      if(t.p===RL){var li="lit_"+Math.abs(hashStr(t.s+t.p+t.o))%999999;if(!nodes[li])nodes[li]={data:{id:li,label:litVal(t.o),type:"Literal",color:"#93D053",shape:"ellipse",iri:"",source:"",namespace:""}};en(t.s);edges.push({data:{id:"e_"+edges.length,source:t.s,target:li,label:uriLabel(t.p,pf),iri:t.p,edgeType:"data-property"}});return;}
      en(t.s);if(t.o[0]==='"'){var li2="lit_"+Math.abs(hashStr(t.s+t.p+t.o))%999999;if(!nodes[li2])nodes[li2]={data:{id:li2,label:litVal(t.o),type:"Literal",color:"#93D053",shape:"ellipse",iri:"",source:"",namespace:""}};edges.push({data:{id:"e_"+edges.length,source:t.s,target:li2,label:uriLabel(t.p,pf),iri:t.p,edgeType:"data-property"}});}
      else{en(t.o);var et=t.p===RT?"rdf-type":t.p===SC?"subclass":"object-property";var sm=null;(inst.data.shacl||[]).forEach(function(c){if(c.path===t.p)sm=c;});
        if(sm){var cd="["+(sm.minCount!=null?sm.minCount:0)+".."+(sm.maxCount!=null?sm.maxCount:"*")+"]";edges.push({data:{id:"e_"+edges.length,source:t.s,target:t.o,label:uriLabel(t.p,pf)+" "+cd,iri:t.p,edgeType:"shacl-constraint",cardinality:cd,message:sm.message||""}});}
        else edges.push({data:{id:"e_"+edges.length,source:t.s,target:t.o,label:uriLabel(t.p,pf),iri:t.p,edgeType:et}});}
    });
    var cy=inst.cy;cy.elements().remove();cy.add(Object.values(nodes).concat(edges));
    cy.layout({name:"dagre",rankDir:"BT",nodeSep:60,rankSep:80,animate:false,fit:true,padding:30}).run();
    var c=document.getElementById(id);
    buildLegendOverlay(c,{nodes:Object.values(nodes),edges:edges,namespaces:pf,activeNamespaces:pf,shacl:inst.data.shacl});
    buildNsOverlay(c,{namespaces:pf,activeNamespaces:pf});
  }

  function resetEditor(id){var inst=instances[id];if(!inst)return;
    if(inst.editor)inst.editor.setValue(inst.originalTtl);else{var ta=document.getElementById(id).querySelector(".ov-editor-textarea");if(ta)ta.value=inst.originalTtl;}
    inst.cy.elements().remove();inst.cy.add(inst.data.nodes.concat(inst.data.edges));
    inst.cy.layout({name:"dagre",rankDir:"BT",nodeSep:60,rankSep:80,animate:false,fit:true,padding:30}).run();
    var c=document.getElementById(id);buildLegendOverlay(c,inst.data);buildNsOverlay(c,inst.data);
    var o=c.querySelector(".ov-validation-output");if(o&&inst.data.validation)renderValidation(o,inst.data.validation);
  }

  // ── Color Customization ────────────────────────────────────────────────

  function toggleColors(id){
    var c=document.getElementById(id),ex=c.querySelector(".ov-color-panel");if(ex){ex.remove();return;}
    var inst=instances[id];if(!inst)return;
    var sources={},types={};
    inst.cy.nodes().forEach(function(n){var d=n.data();if(d.source)sources[d.source]=d.color;types[d.type]=d.color;});
    var panel=document.createElement("div");panel.className="ov-color-panel";
    var h='<div class="ov-color-panel-head"><strong>Colors</strong><button class="ov-popup-close" onclick="this.closest(\'.ov-color-panel\').remove()">&times;</button></div>';
    h+='<div class="ov-color-section"><div class="ov-color-section-title">Node Types</div>';
    Object.keys(types).forEach(function(t){h+='<div class="ov-color-row"><input type="color" value="'+types[t]+'" data-kind="type" data-key="'+esc(t)+'" class="ov-color-input"><span>'+esc(t)+'</span></div>';});
    h+='</div>';
    if(Object.keys(sources).length){h+='<div class="ov-color-section"><div class="ov-color-section-title">Namespaces</div>';
      Object.keys(sources).sort().forEach(function(s){h+='<div class="ov-color-row"><input type="color" value="'+sources[s]+'" data-kind="source" data-key="'+esc(s)+'" class="ov-color-input"><span>'+esc(s)+'</span></div>';});
      h+='</div>';}
    panel.innerHTML=h;c.appendChild(panel);
    panel.querySelectorAll(".ov-color-input").forEach(function(inp){inp.addEventListener("input",function(){
      var kind=inp.dataset.kind,key=inp.dataset.key,col=inp.value;
      inst.cy.nodes().forEach(function(n){var d=n.data();if(kind==="type"&&d.type===key)n.data("color",col);if(kind==="source"&&d.source===key&&d.type==="Class")n.data("color",col);});
    });});
  }

  // ── Toolbar ─────────────────────────────────────────────────────────────

  function zoomIn(id){var cy=instances[id]?.cy;if(cy)cy.zoom({level:cy.zoom()*1.25,renderedPosition:{x:cy.width()/2,y:cy.height()/2}});}
  function zoomOut(id){var cy=instances[id]?.cy;if(cy)cy.zoom({level:cy.zoom()/1.25,renderedPosition:{x:cy.width()/2,y:cy.height()/2}});}
  function fit(id){var cy=instances[id]?.cy;if(cy)cy.fit(null,30);}
  function fullscreen(id){var el=document.getElementById(id);if(document.fullscreenElement===el)document.exitFullscreen();else el.requestFullscreen().catch(function(){});}

  // ── Export (draws legend/prefixes at their overlay positions) ───────────

  function exportPNG(id){
    var inst=instances[id];if(!inst)return;
    var c=document.getElementById(id);
    var legendEl=c.querySelector(".ov-legend-overlay");
    var nsEl=c.querySelector(".ov-ns-overlay");
    var showLegend = legendEl && legendEl.style.display !== "none";
    var showNs = nsEl && nsEl.style.display !== "none";
    var scale=3;
    var graphUrl=inst.cy.png({scale:scale,bg:"#ffffff",full:true});

    var graphImg=new Image();
    graphImg.onload=function(){
      // Measure legend and ns box heights
      var legendH = 0, nsH = 0, pad = 16*scale, boxGap = 8*scale;
      var tempC = document.createElement("canvas"); tempC.width = graphImg.width; tempC.height = 1;
      var tempCtx = tempC.getContext("2d");
      if (showLegend) legendH = drawLegendBox(tempCtx, inst.data, 0, 0, scale);
      if (showNs) nsH = drawNsBox(tempCtx, inst.data, 0, 0, scale);

      var extraH = 0;
      if (showLegend || showNs) extraH = pad + (showLegend ? legendH + boxGap : 0) + (showNs ? nsH : 0) + pad;

      var finalCanvas=document.createElement("canvas");
      finalCanvas.width=graphImg.width;
      finalCanvas.height=graphImg.height + extraH;
      var ctx=finalCanvas.getContext("2d");
      ctx.fillStyle="#fff";ctx.fillRect(0,0,finalCanvas.width,finalCanvas.height);
      ctx.drawImage(graphImg,0,0);

      // Draw legend and ns below the graph, side by side if they fit, stacked otherwise
      var bx = pad, by = graphImg.height + pad;
      if (showLegend) {
        drawLegendBox(ctx, inst.data, bx, by, scale);
      }
      if (showNs) {
        // Place ns box to the right of legend if both fit, otherwise below
        var nsX = showLegend ? bx + 310*scale : bx;
        var nsY = (showLegend && nsX + 310*scale < graphImg.width) ? by : by + (showLegend ? legendH + boxGap : 0);
        drawNsBox(ctx, inst.data, nsX, nsY, scale);
      }

      var a=document.createElement("a");a.href=finalCanvas.toDataURL("image/png");a.download=id+".png";a.click();
    };
    graphImg.src=graphUrl;
  }

  function exportSVG(id){
    var inst=instances[id];if(!inst)return;
    var cy=inst.cy;
    // For SVG: render the graph, then append a legend group below
    try{
      var svgStr=cy.svg({scale:1,full:true,bg:"#fff"});
      // Parse SVG, get dimensions, add legend below
      var parser=new DOMParser();
      var doc=parser.parseFromString(svgStr,"image/svg+xml");
      var svgEl=doc.querySelector("svg");
      var origW=parseFloat(svgEl.getAttribute("width"))||800;
      var origH=parseFloat(svgEl.getAttribute("height"))||600;

      // Build legend as SVG group
      var usedTypes={},usedEdge={};
      inst.data.nodes.forEach(function(n){usedTypes[n.data.type]=n.data.color;});
      inst.data.edges.forEach(function(e){usedEdge[e.data.edgeType]=true;});
      var nodeKeys=Object.keys(usedTypes),edgeKeys=Object.keys(usedEdge);
      var ns=inst.data.activeNamespaces||{};var nsKeys=Object.keys(ns).sort();

      var legendY=origH+10, pad=12, row=18, legendH=pad*2+row*(Math.max(nodeKeys.length,edgeKeys.length)+2);
      var nsExtraH = nsKeys.length ? row*(nsKeys.length+2)+8 : 0;
      var totalH = origH + legendH + nsExtraH + 30;
      svgEl.setAttribute("height", totalH);
      // Also update viewBox if present, or remove clip
      var vb = svgEl.getAttribute("viewBox");
      if (vb) {
        var parts = vb.split(/[\s,]+/);
        parts[3] = totalH;
        svgEl.setAttribute("viewBox", parts.join(" "));
      }

      var g=doc.createElementNS("http://www.w3.org/2000/svg","g");
      g.setAttribute("transform","translate("+pad+","+legendY+")");

      // Legend box background
      var rect=doc.createElementNS("http://www.w3.org/2000/svg","rect");
      rect.setAttribute("x","0");rect.setAttribute("y","0");rect.setAttribute("width",Math.min(origW-pad*2,320));rect.setAttribute("height",legendH);
      rect.setAttribute("rx","8");rect.setAttribute("fill","rgba(255,255,255,0.95)");rect.setAttribute("stroke","#d1d5db");rect.setAttribute("stroke-width","1.5");
      g.appendChild(rect);

      // Title
      var title=doc.createElementNS("http://www.w3.org/2000/svg","text");
      title.setAttribute("x",pad);title.setAttribute("y",pad+12);title.setAttribute("font-family","Inter,Segoe UI,sans-serif");title.setAttribute("font-size","12");title.setAttribute("font-weight","700");title.setAttribute("fill","#1f2937");
      title.textContent="Legend";g.appendChild(title);

      // Node entries
      var ty=pad+row+6;
      var hdr=doc.createElementNS("http://www.w3.org/2000/svg","text");
      hdr.setAttribute("x",pad);hdr.setAttribute("y",ty+9);hdr.setAttribute("font-family","Inter,sans-serif");hdr.setAttribute("font-size","8.5");hdr.setAttribute("font-weight","700");hdr.setAttribute("fill","#9ca3af");
      hdr.textContent="NODES";g.appendChild(hdr);ty+=row*0.8;

      nodeKeys.forEach(function(t){
        var c=usedTypes[t];
        if(t==="Class"){var r2=doc.createElementNS("http://www.w3.org/2000/svg","rect");r2.setAttribute("x",pad);r2.setAttribute("y",ty);r2.setAttribute("width","14");r2.setAttribute("height","9");r2.setAttribute("rx","1");r2.setAttribute("fill",c);r2.setAttribute("stroke","#555");r2.setAttribute("stroke-width","1.5");g.appendChild(r2);}
        else if(t==="Individual"){var ci=doc.createElementNS("http://www.w3.org/2000/svg","circle");ci.setAttribute("cx",pad+7);ci.setAttribute("cy",ty+4.5);ci.setAttribute("r","5");ci.setAttribute("fill",c);ci.setAttribute("stroke","#999");g.appendChild(ci);}
        else if(t==="Literal"){var el2=doc.createElementNS("http://www.w3.org/2000/svg","ellipse");el2.setAttribute("cx",pad+7);el2.setAttribute("cy",ty+4.5);el2.setAttribute("rx","7");el2.setAttribute("ry","4");el2.setAttribute("fill",c);el2.setAttribute("stroke","#6a9");el2.setAttribute("stroke-dasharray","2,1");g.appendChild(el2);}
        var lbl=doc.createElementNS("http://www.w3.org/2000/svg","text");lbl.setAttribute("x",pad+22);lbl.setAttribute("y",ty+9);lbl.setAttribute("font-family","Inter,sans-serif");lbl.setAttribute("font-size","10");lbl.setAttribute("fill","#374151");lbl.textContent=t;g.appendChild(lbl);
        ty+=row*0.85;
      });

      // Edge entries
      var col2=160;ty=pad+row+6;
      var hdr2=doc.createElementNS("http://www.w3.org/2000/svg","text");hdr2.setAttribute("x",col2);hdr2.setAttribute("y",ty+9);hdr2.setAttribute("font-family","Inter,sans-serif");hdr2.setAttribute("font-size","8.5");hdr2.setAttribute("font-weight","700");hdr2.setAttribute("fill","#9ca3af");hdr2.textContent="EDGES";g.appendChild(hdr2);ty+=row*0.8;

      edgeKeys.forEach(function(t){
        var d=EDGE_DEFS_EXPORT[t]||{l:t,c:"#999",dash:false,fill:true,bold:false};
        var line=doc.createElementNS("http://www.w3.org/2000/svg","line");
        line.setAttribute("x1",col2);line.setAttribute("y1",ty+7);line.setAttribute("x2",col2+24);line.setAttribute("y2",ty+7);
        line.setAttribute("stroke",d.c);line.setAttribute("stroke-width",d.bold?"2.5":"1.5");
        if(d.dash)line.setAttribute("stroke-dasharray","4,2");g.appendChild(line);
        var arrow=doc.createElementNS("http://www.w3.org/2000/svg","polygon");
        arrow.setAttribute("points",(col2+24)+","+(ty+7)+" "+(col2+19)+","+(ty+3.5)+" "+(col2+19)+","+(ty+10.5));
        arrow.setAttribute("fill",d.fill?d.c:"none");arrow.setAttribute("stroke",d.c);arrow.setAttribute("stroke-width","0.8");g.appendChild(arrow);
        var lbl2=doc.createElementNS("http://www.w3.org/2000/svg","text");lbl2.setAttribute("x",col2+32);lbl2.setAttribute("y",ty+10);lbl2.setAttribute("font-family","Inter,sans-serif");lbl2.setAttribute("font-size","10");lbl2.setAttribute("fill","#374151");lbl2.textContent=d.l;g.appendChild(lbl2);
        ty+=row*0.85;
      });

      // Extend background rect if present
      var bgRect = svgEl.querySelector("rect");
      if (bgRect && bgRect.getAttribute("fill") === "#fff") {
        bgRect.setAttribute("height", totalH);
      }

      svgEl.appendChild(g);

      // Namespace group
      if(nsKeys.length){
        var g2=doc.createElementNS("http://www.w3.org/2000/svg","g");
        g2.setAttribute("transform","translate("+pad+","+(legendY+legendH+8)+")");
        var nsH=pad*2+row*(nsKeys.length+1);
        var r3=doc.createElementNS("http://www.w3.org/2000/svg","rect");r3.setAttribute("x","0");r3.setAttribute("y","0");r3.setAttribute("width",Math.min(origW-pad*2,320));r3.setAttribute("height",nsH);r3.setAttribute("rx","8");r3.setAttribute("fill","rgba(255,255,255,0.95)");r3.setAttribute("stroke","#d1d5db");r3.setAttribute("stroke-width","1.5");g2.appendChild(r3);
        var t3=doc.createElementNS("http://www.w3.org/2000/svg","text");t3.setAttribute("x",pad);t3.setAttribute("y",pad+10);t3.setAttribute("font-family","Inter,sans-serif");t3.setAttribute("font-size","10");t3.setAttribute("font-weight","700");t3.setAttribute("fill","#1f2937");t3.textContent="Prefixes";g2.appendChild(t3);
        var ny2=pad+row+2;
        nsKeys.forEach(function(p){
          var t4=doc.createElementNS("http://www.w3.org/2000/svg","text");t4.setAttribute("x",pad);t4.setAttribute("y",ny2+9);t4.setAttribute("font-family","Inter,sans-serif");t4.setAttribute("font-size","9");
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

  // ── Auto-init ──────────────────────────────────────────────────────────

  document.addEventListener("DOMContentLoaded",function(){document.querySelectorAll(".ontoink-container").forEach(function(el){initGraph(el.id);});});

  return { zoomIn:zoomIn, zoomOut:zoomOut, fit:fit, fullscreen:fullscreen, exportPNG:exportPNG, exportSVG:exportSVG, downloadTTL:downloadTTL, toggleEditor:toggleEditor, validate:validate, updateGraph:updateGraph, resetEditor:resetEditor, toggleAllNs:toggleAllNs, toggleColors:toggleColors };
})();
