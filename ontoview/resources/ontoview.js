/**
 * ontoview.js — Interactive ontology visualization with formal notation,
 * inline TTL editing, and SHACL validation.
 */
var ontoview = (function () {
  "use strict";

  var instances = {};   // graphId → { cy, data, editor, originalTtl }

  // ── Helpers ──────────────────────────────────────────────────────────────

  function esc(s) {
    if (!s) return "";
    return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  function copyText(text, btn) {
    navigator.clipboard.writeText(text).catch(function(){});
    var orig = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(function(){ btn.textContent = orig; }, 1200);
  }

  function removePopup(container) {
    var old = container.querySelector(".ov-popup");
    if (old) old.remove();
  }

  // ── Popup ────────────────────────────────────────────────────────────────

  function buildPopup(d, cy) {
    var badgeColors = { Class:"#FDFDC8", Individual:"#E6E6E6", Literal:"#93D053", "SHACL Shape":"#A5F3FC", Datatype:"#93D053" };
    var html =
      '<div class="ov-popup-head">' +
        '<span class="ov-popup-label">' + esc(d.label) + '</span>' +
        '<span class="ov-badge" style="background:' + (badgeColors[d.type]||"#eee") + '">' + esc(d.type) + '</span>' +
        '<button class="ov-popup-close" title="Close">&times;</button>' +
      '</div>';
    if (d.iri) {
      html += '<div class="ov-popup-iri"><a href="' + esc(d.iri) + '" target="_blank" rel="noopener">' + esc(d.iri) + '</a></div>';
    }
    if (d.source) {
      html += '<div class="ov-popup-meta">Ontology: <strong>' + esc(d.source) + '</strong></div>';
    }

    // Connected edges
    var node = cy.getElementById(d.id);
    var conEdges = node.connectedEdges();
    if (conEdges.length > 0) {
      html += '<div class="ov-popup-section"><strong>Connections:</strong><ul class="ov-popup-edges">';
      conEdges.forEach(function(e) {
        var ed = e.data();
        var other = ed.source === d.id ? ed.target : ed.source;
        var otherNode = cy.getElementById(other);
        var otherLabel = otherNode.data("label") || other;
        var dir = ed.source === d.id ? "\u2192" : "\u2190";
        html += '<li>' + dir + ' <em>' + esc(ed.label) + '</em> ' + esc(otherLabel) + '</li>';
      });
      html += '</ul></div>';
    }

    // SHACL constraints on this node
    var shacl = instances[node.cy().container().closest(".ontoview-container").id]?.data?.shacl || [];
    var relevant = shacl.filter(function(c) { return c.targetClass === d.iri; });
    if (relevant.length > 0) {
      html += '<div class="ov-popup-section"><strong>SHACL Constraints:</strong><ul class="ov-popup-edges">';
      relevant.forEach(function(c) {
        var card = c.minCount != null ? "[" + c.minCount + ".." + (c.maxCount != null ? c.maxCount : "*") + "]" : "";
        html += '<li>' + esc(c.pathLabel || c.path || "") + ' ' + card;
        if (c.message) html += '<br><small>' + esc(c.message) + '</small>';
        html += '</li>';
      });
      html += '</ul></div>';
    }

    html += '<div class="ov-popup-actions">';
    html += '<button class="ov-chip" data-action="copy-label">Copy Label</button>';
    if (d.iri) html += '<button class="ov-chip" data-action="copy-iri">Copy IRI</button>';
    html += '</div>';
    return html;
  }

  // ── Legend ───────────────────────────────────────────────────────────────

  function buildLegend(container, data) {
    var el = container.querySelector(".ov-legend");
    if (!el) return;
    if (container.getAttribute("data-show-legend") === "false") { el.style.display = "none"; return; }

    var nodeStyles = data.nodeStyles || {};
    var edgeStyles = data.edgeStyles || {};
    var usedTypes = {};
    var usedEdgeTypes = {};
    data.nodes.forEach(function(n) { usedTypes[n.data.type] = n.data.color; });
    data.edges.forEach(function(e) { usedEdgeTypes[e.data.edgeType] = true; });

    var html = '<div class="ov-legend-title">Legend</div><div class="ov-legend-grid">';

    // Node types
    html += '<div class="ov-legend-section"><strong>Nodes</strong>';
    Object.keys(usedTypes).forEach(function(t) {
      var shapeMap = { Class: "\u25A0", Individual: "\u25CF", Literal: "\u25CB", Datatype: "\u25C6", "SHACL Shape": "\u25A2" };
      html += '<div class="ov-legend-item"><span class="ov-legend-swatch" style="background:' + usedTypes[t] + '">' + (shapeMap[t]||"\u25A0") + '</span>' + esc(t) + '</div>';
    });
    html += '</div>';

    // Edge types
    var edgeLabels = {
      "object-property": { label: "Object Property", style: "solid", color: "#2563eb" },
      "data-property": { label: "Data Property", style: "dashed-green", color: "#16a34a" },
      "rdf-type": { label: "rdf:type", style: "dashed", color: "#9ca3af" },
      "subclass": { label: "rdfs:subClassOf", style: "solid", color: "#374151" },
      "shacl-constraint": { label: "SHACL Constraint", style: "dashed-bold", color: "#0891b2" },
    };
    html += '<div class="ov-legend-section"><strong>Edges</strong>';
    Object.keys(usedEdgeTypes).forEach(function(t) {
      var info = edgeLabels[t] || { label: t, color: "#999" };
      var cls = "ov-legend-line";
      if (t === "rdf-type" || t === "data-property") cls += " dashed";
      if (t === "shacl-constraint") cls += " shacl";
      html += '<div class="ov-legend-item"><span class="' + cls + '" style="border-color:' + info.color + ';color:' + info.color + ';">\u2192</span>' + esc(info.label) + '</div>';
    });
    html += '</div>';

    // Namespace boxes
    if (container.getAttribute("data-show-ns") !== "false" && data.namespaces) {
      var ns = data.namespaces;
      var keys = Object.keys(ns);
      if (keys.length > 0) {
        html += '<div class="ov-legend-section ov-legend-ns"><strong>Namespaces</strong>';
        keys.forEach(function(prefix) {
          html += '<div class="ov-legend-item ov-ns-item"><code>' + esc(prefix) + ':</code> <span class="ov-ns-uri">' + esc(ns[prefix]) + '</span></div>';
        });
        html += '</div>';
      }
    }

    html += '</div>';
    el.innerHTML = html;
  }

  // ── Init Graph ──────────────────────────────────────────────────────────

  function initGraph(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;
    var b64 = container.getAttribute("data-ontoview-graph");
    if (!b64) return;

    var data;
    try { data = JSON.parse(atob(b64)); } catch(e) { console.error("ontoview: decode error", e); return; }

    var canvas = container.querySelector(".ov-canvas");
    if (!canvas) return;

    var cy = cytoscape({
      container: canvas,
      elements: { nodes: data.nodes, edges: data.edges },
      style: [
        // ── Nodes ──
        { selector: "node", style: {
          "label": "data(label)", "background-color": "data(color)", "shape": "data(shape)",
          "text-valign": "center", "text-halign": "center",
          "width": "label", "height": "label", "padding": "14px",
          "font-size": "12px", "font-family": "'Inter','Segoe UI',system-ui,sans-serif",
          "text-wrap": "wrap", "text-max-width": "160px",
          "border-width": 1, "border-color": "#aaa", "border-opacity": 0.6, "color": "#222",
        }},
        { selector: 'node[type="Class"]', style: {
          "font-weight": "600", "border-width": 2, "border-color": "#666", "shape": "rectangle",
        }},
        { selector: 'node[type="Individual"]', style: {
          "shape": "ellipse", "border-style": "solid",
        }},
        { selector: 'node[type="Literal"]', style: {
          "shape": "ellipse", "font-style": "italic", "font-size": "11px",
          "border-style": "dashed", "border-color": "#6a9",
        }},
        { selector: 'node[type="Datatype"]', style: { "shape": "diamond" }},
        { selector: 'node[type="SHACL Shape"]', style: { "shape": "round-rectangle", "border-color": "#0891b2" }},
        { selector: "node:selected", style: { "border-width": 3, "border-color": "#0891b2" }},

        // ── Edges: object property (blue) ──
        { selector: "edge[edgeType='object-property']", style: {
          "label": "data(label)", "curve-style": "bezier",
          "target-arrow-shape": "triangle", "target-arrow-fill": "filled",
          "source-arrow-shape": "circle", "source-arrow-fill": "filled",
          "line-color": "#2563eb", "target-arrow-color": "#2563eb", "source-arrow-color": "#2563eb",
          "width": 2, "font-size": "10px", "text-rotation": "autorotate", "text-margin-y": -10,
          "color": "#2563eb", "text-background-color": "#fff", "text-background-opacity": 0.9, "text-background-padding": "2px",
          "font-family": "'Inter','Segoe UI',system-ui,sans-serif",
        }},
        // ── Edges: data property (green) ──
        { selector: "edge[edgeType='data-property']", style: {
          "label": "data(label)", "curve-style": "bezier",
          "target-arrow-shape": "triangle", "target-arrow-fill": "hollow",
          "source-arrow-shape": "circle", "source-arrow-fill": "hollow",
          "line-color": "#16a34a", "target-arrow-color": "#16a34a", "source-arrow-color": "#16a34a",
          "width": 1.5, "font-size": "10px", "text-rotation": "autorotate", "text-margin-y": -10,
          "color": "#16a34a", "text-background-color": "#fff", "text-background-opacity": 0.9, "text-background-padding": "2px",
          "font-family": "'Inter','Segoe UI',system-ui,sans-serif",
        }},
        // ── Edges: rdf:type (grey dashed) ──
        { selector: "edge[edgeType='rdf-type']", style: {
          "label": "data(label)", "curve-style": "bezier",
          "target-arrow-shape": "triangle", "target-arrow-fill": "hollow",
          "line-style": "dashed", "line-color": "#9ca3af", "target-arrow-color": "#9ca3af",
          "width": 1, "font-size": "9px", "text-rotation": "autorotate", "text-margin-y": -10,
          "color": "#888", "text-background-color": "#fff", "text-background-opacity": 0.9, "text-background-padding": "2px",
          "font-family": "'Inter','Segoe UI',system-ui,sans-serif",
        }},
        // ── Edges: subClassOf (black solid) ──
        { selector: "edge[edgeType='subclass']", style: {
          "label": "data(label)", "curve-style": "bezier",
          "target-arrow-shape": "triangle", "target-arrow-fill": "filled",
          "line-color": "#374151", "target-arrow-color": "#374151",
          "width": 2, "font-size": "9px", "text-rotation": "autorotate", "text-margin-y": -10,
          "color": "#555", "text-background-color": "#fff", "text-background-opacity": 0.9, "text-background-padding": "2px",
          "font-family": "'Inter','Segoe UI',system-ui,sans-serif",
        }},
        // ── Edges: SHACL constraint (cyan dashed bold) ──
        { selector: "edge[edgeType='shacl-constraint']", style: {
          "label": "data(label)", "curve-style": "bezier",
          "target-arrow-shape": "triangle", "target-arrow-fill": "filled",
          "line-style": "dashed", "line-color": "#0891b2", "target-arrow-color": "#0891b2",
          "width": 3, "font-size": "11px", "font-weight": "bold",
          "text-rotation": "autorotate", "text-margin-y": -12,
          "color": "#0891b2", "text-background-color": "#fff", "text-background-opacity": 0.95, "text-background-padding": "3px",
          "font-family": "'Inter','Segoe UI',system-ui,sans-serif",
        }},
      ],
      layout: { name: "dagre", rankDir: "BT", nodeSep: 60, rankSep: 80, edgeSep: 20, animate: false, fit: true, padding: 30 },
      wheelSensitivity: 0.3, minZoom: 0.15, maxZoom: 5,
    });

    instances[containerId] = { cy: cy, data: data, editor: null, originalTtl: data.rawTtl || "" };

    // ── Click popup ──
    cy.on("tap", "node", function(evt) {
      removePopup(container);
      var d = evt.target.data();
      var pos = evt.renderedPosition;
      var popup = document.createElement("div");
      popup.className = "ov-popup";
      popup.innerHTML = buildPopup(d, cy);

      var canvasR = canvas.getBoundingClientRect();
      var contR = container.getBoundingClientRect();
      popup.style.left = (canvasR.left - contR.left + pos.x + 15) + "px";
      popup.style.top = (canvasR.top - contR.top + pos.y - 15) + "px";
      container.appendChild(popup);

      requestAnimationFrame(function() {
        var pr = popup.getBoundingClientRect();
        if (pr.right > contR.right - 10) popup.style.left = (parseFloat(popup.style.left) - pr.width - 30) + "px";
        if (pr.bottom > contR.bottom - 10) popup.style.top = (parseFloat(popup.style.top) - pr.height) + "px";
      });

      popup.querySelector(".ov-popup-close").addEventListener("click", function() { popup.remove(); });
      popup.querySelectorAll(".ov-chip").forEach(function(btn) {
        btn.addEventListener("click", function() {
          var action = btn.getAttribute("data-action");
          copyText(action === "copy-iri" ? d.iri : d.label, btn);
        });
      });
    });
    cy.on("tap", function(evt) { if (evt.target === cy) removePopup(container); });

    // ── Legend ──
    buildLegend(container, data);

    // ── Init editor textarea ──
    var textarea = container.querySelector(".ov-editor-textarea");
    if (textarea && data.rawTtl) {
      textarea.value = data.rawTtl;
    }

    // ── Init validation output with build-time results ──
    if (data.validation) {
      var outEl = container.querySelector(".ov-validation-output");
      if (outEl) renderValidation(outEl, data.validation);
    }
  }

  // ── Editor ──────────────────────────────────────────────────────────────

  function toggleEditor(id) {
    var container = document.getElementById(id);
    var panel = container.querySelector(".ov-editor-panel");
    var inst = instances[id];
    if (!panel) return;

    var visible = panel.style.display !== "none";
    panel.style.display = visible ? "none" : "block";

    // Init CodeMirror on first open
    if (!visible && !inst.editor && typeof CodeMirror !== "undefined") {
      var textarea = container.querySelector(".ov-editor-textarea");
      inst.editor = CodeMirror.fromTextArea(textarea, {
        mode: "turtle",
        lineNumbers: true,
        lineWrapping: true,
        theme: "default",
        viewportMargin: Infinity,
      });
      inst.editor.setSize(null, "300px");
    }
  }

  function getEditorValue(id) {
    var inst = instances[id];
    if (!inst) return "";
    if (inst.editor) return inst.editor.getValue();
    var container = document.getElementById(id);
    var textarea = container.querySelector(".ov-editor-textarea");
    return textarea ? textarea.value : "";
  }

  // ── Lightweight JS SHACL Validator ─────────────────────────────────────
  // Handles the most common patterns: sh:minCount, sh:maxCount
  // by parsing TTL minimally and checking constraints.

  function validate(id) {
    var inst = instances[id];
    if (!inst) return;
    var container = document.getElementById(id);
    var outEl = container.querySelector(".ov-validation-output");
    if (!outEl) return;

    var ttl = getEditorValue(id);
    var shaclConstraints = inst.data.shacl || [];

    if (shaclConstraints.length === 0) {
      renderValidation(outEl, { conforms: null, violations: [], report: "No SHACL shapes defined." });
      return;
    }

    // Minimal TTL parser: extract (subject, predicate, object) triples
    var triples = parseTtlMinimal(ttl);

    // Find instances of target classes
    var violations = [];
    shaclConstraints.forEach(function(c) {
      if (!c.targetClass || !c.path) return;

      // Find all subjects that are rdf:type targetClass
      var targetInstances = [];
      triples.forEach(function(t) {
        if (t.p === "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" && t.o === c.targetClass) {
          targetInstances.push(t.s);
        }
      });
      // Also check subclass instances
      if (targetInstances.length === 0) {
        triples.forEach(function(t) {
          if (t.p === "http://www.w3.org/1999/02/22-rdf-syntax-ns#type") {
            // Check if this type is a subclass of targetClass
            triples.forEach(function(t2) {
              if (t2.s === t.o && t2.p === "http://www.w3.org/2000/01/rdf-schema#subClassOf" && t2.o === c.targetClass) {
                targetInstances.push(t.s);
              }
            });
          }
        });
      }

      targetInstances.forEach(function(inst) {
        var count = 0;
        triples.forEach(function(t) {
          if (t.s === inst && t.p === c.path) count++;
        });
        if (c.minCount != null && count < c.minCount) {
          violations.push({
            focusNode: inst,
            path: c.path,
            message: c.message || ("Expected at least " + c.minCount + " value(s) for " + (c.pathLabel||c.path) + ", found " + count),
            severity: "Violation",
          });
        }
        if (c.maxCount != null && count > c.maxCount) {
          violations.push({
            focusNode: inst,
            path: c.path,
            message: c.message || ("Expected at most " + c.maxCount + " value(s) for " + (c.pathLabel||c.path) + ", found " + count),
            severity: "Violation",
          });
        }
      });
    });

    renderValidation(outEl, {
      conforms: violations.length === 0,
      violations: violations,
      report: violations.length === 0 ? "All constraints satisfied." : violations.length + " violation(s) found.",
    });
  }

  function renderValidation(el, result) {
    if (result.conforms === null) {
      el.innerHTML = '<div class="ov-val-info">' + esc(result.report || "No validation performed.") + '</div>';
      return;
    }
    var html = "";
    if (result.conforms) {
      html = '<div class="ov-val-pass"><span class="ov-val-icon">&#x2714;</span> Conforms &mdash; all constraints satisfied.</div>';
    } else {
      html = '<div class="ov-val-fail"><span class="ov-val-icon">&#x2718;</span> ' + esc(result.report || "Violations found.") + '</div>';
      html += '<ul class="ov-val-list">';
      (result.violations || []).forEach(function(v) {
        var focusLabel = v.focusNode ? v.focusNode.split("/").pop().split("#").pop() : "?";
        html += '<li><strong>' + esc(focusLabel) + '</strong>: ' + esc(v.message || "Constraint violated") + '</li>';
      });
      html += '</ul>';
    }
    el.innerHTML = html;
  }

  // ── Minimal TTL Parser ─────────────────────────────────────────────────
  // Extracts prefixes and basic s-p-o triples from Turtle syntax.
  // Not a full parser — handles the common patterns in shape data.

  function parseTtlMinimal(ttl) {
    var prefixes = {};
    var triples = [];

    // Extract @prefix declarations
    var prefixRe = /@prefix\s+(\w*)\s*:\s*<([^>]+)>\s*\./g;
    var m;
    while ((m = prefixRe.exec(ttl)) !== null) {
      prefixes[m[1]] = m[2];
    }

    // Resolve a prefixed name or <IRI> to full IRI
    function resolve(term) {
      term = term.trim();
      if (term.startsWith("<") && term.endsWith(">")) return term.slice(1, -1);
      if (term === "a") return "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
      var colonIdx = term.indexOf(":");
      if (colonIdx >= 0) {
        var prefix = term.substring(0, colonIdx);
        var local = term.substring(colonIdx + 1);
        if (prefixes[prefix] !== undefined) return prefixes[prefix] + local;
      }
      return term;
    }

    // Strip comments
    var lines = ttl.split("\n").map(function(l) {
      var inAngle = false;
      for (var i = 0; i < l.length; i++) {
        if (l[i] === "<") inAngle = true;
        if (l[i] === ">") inAngle = false;
        if (l[i] === "#" && !inAngle) return l.substring(0, i);
      }
      return l;
    });
    var clean = lines.join("\n");

    // Remove prefix lines
    clean = clean.replace(/@prefix[^.]*\.\s*/g, "");
    clean = clean.replace(/@base[^.]*\.\s*/g, "");

    // Split into statements (by .)
    var statements = clean.split(/\.\s*(?=\S|$)/);
    statements.forEach(function(stmt) {
      stmt = stmt.trim();
      if (!stmt) return;

      // Split subject from predicate-object list
      var tokens = tokenize(stmt);
      if (tokens.length < 3) return;

      var subject = resolve(tokens[0]);
      var i = 1;
      while (i < tokens.length - 1) {
        var predicate = resolve(tokens[i]);
        i++;
        // Collect objects until we hit ; or end
        while (i < tokens.length) {
          var obj = tokens[i];
          i++;
          if (obj === ";") break;
          if (obj === ",") continue;
          triples.push({ s: subject, p: predicate, o: resolve(obj) });
          // Check if next token is , or ;
          if (i < tokens.length && tokens[i] === ",") { i++; continue; }
          if (i < tokens.length && tokens[i] === ";") { i++; break; }
        }
      }
    });

    return triples;
  }

  function tokenize(text) {
    var tokens = [];
    var i = 0;
    while (i < text.length) {
      // Skip whitespace
      while (i < text.length && /\s/.test(text[i])) i++;
      if (i >= text.length) break;

      if (text[i] === "<") {
        var end = text.indexOf(">", i);
        if (end < 0) end = text.length - 1;
        tokens.push(text.substring(i, end + 1));
        i = end + 1;
      } else if (text[i] === '"') {
        var j = i + 1;
        while (j < text.length && text[j] !== '"') { if (text[j] === "\\") j++; j++; }
        j++; // closing quote
        // Skip language tag or datatype
        while (j < text.length && (text[j] === "@" || text[j] === "^")) {
          if (text[j] === "@") { j++; while (j < text.length && /[a-zA-Z-]/.test(text[j])) j++; }
          if (text[j] === "^" && text[j+1] === "^") { j += 2; if (text[j] === "<") { j = text.indexOf(">", j) + 1; } else { while (j < text.length && /\S/.test(text[j]) && text[j] !== ";" && text[j] !== ",") j++; } }
        }
        tokens.push(text.substring(i, j));
        i = j;
      } else if (text[i] === ";" || text[i] === ",") {
        tokens.push(text[i]);
        i++;
      } else {
        var start = i;
        while (i < text.length && !/[\s;,]/.test(text[i])) i++;
        tokens.push(text.substring(start, i));
      }
    }
    return tokens;
  }

  // ── Update Graph ───────────────────────────────────────────────────────

  function updateGraph(id) {
    var inst = instances[id];
    if (!inst) return;
    var ttl = getEditorValue(id);
    var triples = parseTtlMinimal(ttl);

    // Rebuild nodes and edges from parsed triples
    var nodes = {};
    var edges = [];
    var classes = {};

    // First pass: find classes
    triples.forEach(function(t) {
      if (t.p === "http://www.w3.org/1999/02/22-rdf-syntax-ns#type") {
        classes[t.o] = true;
      }
      if (t.p === "http://www.w3.org/2000/01/rdf-schema#subClassOf") {
        classes[t.s] = true;
        classes[t.o] = true;
      }
    });

    triples.forEach(function(t) {
      [t.s, t.o].forEach(function(uri) {
        if (!nodes[uri] && !uri.startsWith('"')) {
          var isClass = classes[uri] || false;
          nodes[uri] = { data: {
            id: uri, label: uri.split("/").pop().split("#").pop(),
            type: isClass ? "Class" : "Individual",
            color: isClass ? "#FDFDC8" : "#E6E6E6",
            shape: isClass ? "rectangle" : "ellipse",
            iri: uri, source: "", namespace: "",
          }};
        }
      });

      var edgeType = "object-property";
      if (t.p === "http://www.w3.org/1999/02/22-rdf-syntax-ns#type") edgeType = "rdf-type";
      if (t.p === "http://www.w3.org/2000/01/rdf-schema#subClassOf") edgeType = "subclass";

      if (nodes[t.s] && nodes[t.o]) {
        edges.push({ data: {
          id: "e_" + edges.length, source: t.s, target: t.o,
          label: t.p.split("/").pop().split("#").pop(),
          iri: t.p, edgeType: edgeType,
        }});
      }
    });

    var cy = inst.cy;
    cy.elements().remove();
    cy.add(Object.values(nodes).concat(edges));
    cy.layout({ name: "dagre", rankDir: "BT", nodeSep: 60, rankSep: 80, animate: false, fit: true, padding: 30 }).run();
  }

  function resetEditor(id) {
    var inst = instances[id];
    if (!inst) return;
    if (inst.editor) inst.editor.setValue(inst.originalTtl);
    else {
      var container = document.getElementById(id);
      var ta = container.querySelector(".ov-editor-textarea");
      if (ta) ta.value = inst.originalTtl;
    }
    // Reset graph
    var cy = inst.cy;
    cy.elements().remove();
    cy.add(inst.data.nodes.concat(inst.data.edges));
    cy.layout({ name: "dagre", rankDir: "BT", nodeSep: 60, rankSep: 80, animate: false, fit: true, padding: 30 }).run();
    // Reset validation
    var container = document.getElementById(id);
    var outEl = container.querySelector(".ov-validation-output");
    if (outEl && inst.data.validation) renderValidation(outEl, inst.data.validation);
  }

  // ── Toolbar ─────────────────────────────────────────────────────────────

  function zoomIn(id)  { var cy = instances[id]?.cy; if (cy) cy.zoom({ level: cy.zoom() * 1.25, renderedPosition: { x: cy.width()/2, y: cy.height()/2 }}); }
  function zoomOut(id) { var cy = instances[id]?.cy; if (cy) cy.zoom({ level: cy.zoom() / 1.25, renderedPosition: { x: cy.width()/2, y: cy.height()/2 }}); }
  function fit(id)     { var cy = instances[id]?.cy; if (cy) cy.fit(null, 30); }

  function fullscreen(id) {
    var el = document.getElementById(id);
    if (!el) return;
    if (document.fullscreenElement === el) document.exitFullscreen();
    else el.requestFullscreen().catch(function(){});
  }

  function exportPNG(id) {
    var cy = instances[id]?.cy;
    if (!cy) return;
    var a = document.createElement("a");
    a.href = cy.png({ scale: 3, bg: "#ffffff", full: true });
    a.download = id + ".png";
    a.click();
  }

  function exportSVG(id) {
    var cy = instances[id]?.cy;
    if (!cy) return;
    try {
      var svgStr = cy.svg({ scale: 1, full: true, bg: "#ffffff" });
      var blob = new Blob([svgStr], { type: "image/svg+xml" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = id + ".svg";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch(e) {
      console.warn("SVG export requires cytoscape-svg extension:", e);
      alert("SVG export not available. Try PNG instead.");
    }
  }

  // ── Auto-init ──────────────────────────────────────────────────────────

  document.addEventListener("DOMContentLoaded", function() {
    document.querySelectorAll(".ontoview-container").forEach(function(el) { initGraph(el.id); });
  });

  return {
    zoomIn: zoomIn, zoomOut: zoomOut, fit: fit, fullscreen: fullscreen,
    exportPNG: exportPNG, exportSVG: exportSVG,
    toggleEditor: toggleEditor, validate: validate,
    updateGraph: updateGraph, resetEditor: resetEditor,
  };
})();
