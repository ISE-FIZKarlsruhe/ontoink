"""Regression tests for style presets vs. the Edit Layout panel.

Two failures motivated these, both reported as "Edit Layout is not synced
between styles, and the Ontoink style changes after switching":

1. `applyStylePreset` snapshotted the default stylesheet with
   `cy.style().json()`. Cytoscape serialises a *function* mapper as the literal
   string ``"fn"`` (``parse()``: ``if(y(t))return{...,strValue:"fn",...}``;
   ``json()``: ``a[s.name]=s.strValue``). Since `_typoPatch` turns every
   font/padding value into a function mapper, restoring "Ontoink default"
   replayed ``font-size: fn`` / ``padding: fn`` — invalid, so Cytoscape dropped
   them — and ``font-family: fn`` — valid-looking, so it stuck as a bogus
   family. Node padding collapsed to 0, super-node labels became the text
   "fn", and Size & Typography stopped working entirely.

2. The presets hard-code ``background-color`` / ``shape`` instead of honouring
   element data, so the Edit Layout colour picker was a no-op under Chowlk,
   Graffoo and VOWL while the swatch still moved.

These drive the REAL stylesheets from ontoink.js against the REAL vendored
Cytoscape, headless under Node. Skipped when Node is unavailable.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
RESOURCES = ROOT / "ontoink" / "resources"
ONTOINK_JS = RESOURCES / "ontoink.js"
CYTOSCAPE_JS = RESOURCES / "vendor" / "cytoscape.min.js"

pytestmark = pytest.mark.skipif(
    shutil.which("node") is None, reason="Node.js is not installed"
)

PRESETS = ["chowlk", "graffoo", "vowl"]


def _extract_function(source: str, name: str) -> str:
    """Slice one top-level function out of the IIFE by brace matching."""
    start = source.index(f"function {name}(")
    depth = 0
    for i in range(source.index("{", start), len(source)):
        if source[i] == "{":
            depth += 1
        elif source[i] == "}":
            depth -= 1
            if depth == 0:
                return source[start:i + 1]
    raise AssertionError(f"unbalanced braces while extracting {name}")


def _extract_var_object(source: str, name: str) -> str:
    """Slice a top-level `var NAME = {...};` / `= [...];` declaration."""
    start = source.index(f"var {name} = ")
    open_at = start + len(f"var {name} = ")
    opener = source[open_at]
    closer = {"{": "}", "[": "]"}[opener]
    depth = 0
    for i in range(open_at, len(source)):
        if source[i] == opener:
            depth += 1
        elif source[i] == closer:
            depth -= 1
            if depth == 0:
                return source[start:i + 1] + ";"
    raise AssertionError(f"unbalanced brackets while extracting {name}")


@pytest.fixture(scope="module")
def harness() -> str:
    """The real style machinery from ontoink.js, loadable under Node."""
    src = ONTOINK_JS.read_text(encoding="utf-8")
    parts = [
        # Load the vendored Cytoscape the same build the browser gets.
        "const _src = require('fs').readFileSync("
        f"{json.dumps(str(CYTOSCAPE_JS))}, 'utf8');",
        "const _m = { exports: {} };",
        "new Function('module','exports',_src)(_m, _m.exports);",
        "const cytoscape = _m.exports;",
        _extract_var_object(src, "TYPO_BASE"),
        _extract_function(src, "_typoPatchRule"),
        _extract_function(src, "_typoPatch"),
        _extract_var_object(src, "_APPEARANCE_NODE"),
        _extract_var_object(src, "_APPEARANCE_EDGE"),
        _extract_var_object(src, "_APPEARANCE_DEFAULTS"),
        _extract_function(src, "_appearanceFallback"),
        _extract_function(src, "_appearancePatchRule"),
        _extract_function(src, "_appearanceBaseRule"),
        _extract_function(src, "_appearancePatch"),
        _extract_function(src, "_baseStyleRules"),
        _extract_function(src, "_chowlkStyle"),
        _extract_function(src, "_graffooStyle"),
        _extract_function(src, "_vowlStyle"),
        _extract_function(src, "_inferredOverlayRules"),
        _extract_function(src, "_selectionOverlayRules"),
        # Mirror applyStylePreset's assembly without needing a DOM instance.
        """
        var _STYLE_PRESETS = { chowlk:_chowlkStyle, graffoo:_graffooStyle, vowl:_vowlStyle };
        function buildStyle(preset) {
          var arr = preset === 'ontoink' ? _baseStyleRules() : _STYLE_PRESETS[preset]();
          return _appearancePatch(_typoPatch(
            arr.concat(_inferredOverlayRules()).concat(_selectionOverlayRules())));
        }
        """,
    ]
    return "\n".join(parts)


def run_js(harness: str, body: str, tmp_path: Path) -> dict:
    """Execute `body` against the harness; it must console.log one JSON object.

    Written to a file rather than passed to `node -e`: the harness carries the
    whole base stylesheet, which overruns the Windows command-line limit.
    """
    script = tmp_path / "run.js"
    script.write_text(harness + "\n" + body + "\nprocess.exit(0);", encoding="utf-8")
    out = subprocess.run(
        ["node", str(script)], capture_output=True, text=True,
    )
    if out.returncode != 0:
        raise AssertionError(f"node failed:\n{out.stdout}\n{out.stderr}")
    # Cytoscape chatters warnings on stdout; the payload is the last JSON line.
    for line in reversed(out.stdout.strip().splitlines()):
        line = line.strip()
        if line.startswith("{"):
            return json.loads(line)
    raise AssertionError(f"no JSON payload:\n{out.stdout}\n{out.stderr}")


ELEMENTS = """
  var elements = { nodes: [
    { data: { id:'c', label:'Person',  type:'Class',      color:'#3b82f6', shape:'rectangle' } },
    { data: { id:'i', label:'alice',   type:'Individual', color:'#22c55e', shape:'ellipse' } },
    { data: { id:'s', label:'Cluster', isSuperNode:true, memberCount:42 } }
  ], edges: [
    { data: { id:'e', source:'c', target:'i', label:'knows', edgeType:'object-property' } }
  ]};
"""


# ── 1. the Ontoink default must survive a round-trip through a preset ──────

def test_ontoink_default_survives_a_preset_round_trip(harness, tmp_path):
    """ontoink → chowlk → ontoink must reproduce the original rendered style."""
    result = run_js(harness, ELEMENTS + """
      function snap(cy) {
        var n = cy.$('#c'), s = cy.$('#s'), e = cy.$('#e');
        return { fontSize:n.style('font-size'), fontFamily:n.style('font-family'),
                 padding:n.style('padding'), bg:n.style('background-color'),
                 shape:n.style('shape'), superLabel:s.style('label'),
                 superBg:s.style('background-color'), edgeFont:e.style('font-size') };
      }
      var cy = cytoscape({ headless:true, styleEnabled:true,
                           elements:elements, style:buildStyle('ontoink') });
      var before = snap(cy);
      cy.style(buildStyle('chowlk'));
      cy.style(buildStyle('ontoink'));
      console.log(JSON.stringify({ before:before, after:snap(cy) }));
    """, tmp_path)
    assert result["after"] == result["before"], (
        "restoring 'Ontoink default' changed the rendered style: "
        f"{result['before']} != {result['after']}"
    )


def test_ontoink_default_keeps_its_typography_mappers(harness, tmp_path):
    """The concrete symptoms of the `fn` round-trip, pinned individually."""
    result = run_js(harness, ELEMENTS + """
      var cy = cytoscape({ headless:true, styleEnabled:true,
                           elements:elements, style:buildStyle('ontoink') });
      cy.style(buildStyle('vowl'));
      cy.style(buildStyle('ontoink'));
      var n = cy.$('#c');
      console.log(JSON.stringify({ padding:n.style('padding'),
                                   fontFamily:n.style('font-family'),
                                   superLabel:cy.$('#s').style('label') }));
    """, tmp_path)
    assert result["padding"] != "0px", "node padding collapsed — mappers were lost"
    assert result["fontFamily"] != "fn", "font-family restored as the literal 'fn'"
    assert result["superLabel"] != "fn", "super-node label restored as the literal 'fn'"


def test_typography_still_applies_after_a_round_trip(harness, tmp_path):
    """Size & Typography must keep working once you have switched styles."""
    result = run_js(harness, ELEMENTS + """
      var cy = cytoscape({ headless:true, styleEnabled:true,
                           elements:elements, style:buildStyle('ontoink') });
      cy.style(buildStyle('graffoo'));
      cy.style(buildStyle('ontoink'));
      var n = cy.$('#c');
      n.data('oiFontSize', 28); n.data('oiPad', 30);
      console.log(JSON.stringify({ fontSize:n.style('font-size'), padding:n.style('padding') }));
    """, tmp_path)
    assert result["fontSize"] == "28px"
    assert result["padding"] == "30px"


# ── 2. Edit Layout overrides must apply under EVERY preset ────────────────

@pytest.mark.parametrize("preset", ["ontoink"] + PRESETS)
def test_node_colour_override_applies(harness, preset, tmp_path):
    result = run_js(harness, ELEMENTS + f"""
      var cy = cytoscape({{ headless:true, styleEnabled:true,
                            elements:elements, style:buildStyle({preset!r}) }});
      var n = cy.$('#c');
      n.data('oiColor', '#ff0000');
      console.log(JSON.stringify({{ bg:n.style('background-color') }}));
    """, tmp_path)
    assert result["bg"] == "rgb(255,0,0)", (
        f"Edit Layout colour was ignored under the {preset} preset"
    )


@pytest.mark.parametrize("preset", ["ontoink"] + PRESETS)
def test_node_shape_override_applies(harness, preset, tmp_path):
    result = run_js(harness, ELEMENTS + f"""
      var cy = cytoscape({{ headless:true, styleEnabled:true,
                            elements:elements, style:buildStyle({preset!r}) }});
      var n = cy.$('#c');
      n.data('oiShape', 'hexagon');
      console.log(JSON.stringify({{ shape:n.style('shape') }}));
    """, tmp_path)
    assert result["shape"] == "hexagon", (
        f"Edit Layout shape was ignored under the {preset} preset"
    )


@pytest.mark.parametrize("preset", ["ontoink"] + PRESETS)
def test_edge_overrides_apply(harness, preset, tmp_path):
    result = run_js(harness, ELEMENTS + f"""
      var cy = cytoscape({{ headless:true, styleEnabled:true,
                            elements:elements, style:buildStyle({preset!r}) }});
      var e = cy.$('#e');
      e.data('oiEdgeColor', '#ff0000');
      e.data('oiEdgeLineStyle', 'dashed');
      e.data('oiEdgeArrow', 'diamond');
      console.log(JSON.stringify({{ line:e.style('line-color'),
                                    arrowColor:e.style('target-arrow-color'),
                                    lineStyle:e.style('line-style'),
                                    arrow:e.style('target-arrow-shape') }}));
    """, tmp_path)
    assert result["line"] == "rgb(255,0,0)", f"edge colour ignored under {preset}"
    assert result["arrowColor"] == "rgb(255,0,0)", f"arrow colour ignored under {preset}"
    assert result["lineStyle"] == "dashed", f"edge line style ignored under {preset}"
    assert result["arrow"] == "diamond", f"edge arrow ignored under {preset}"


def test_overrides_survive_switching_between_presets(harness, tmp_path):
    """The user's edits must follow them across every style, in both directions."""
    result = run_js(harness, ELEMENTS + """
      var cy = cytoscape({ headless:true, styleEnabled:true,
                           elements:elements, style:buildStyle('ontoink') });
      var n = cy.$('#c'), e = cy.$('#e');
      n.data('oiColor', '#ff0000'); n.data('oiShape', 'star');
      e.data('oiEdgeColor', '#ff0000');
      var seen = {};
      ['chowlk','graffoo','vowl','ontoink'].forEach(function (p) {
        cy.style(buildStyle(p));
        seen[p] = { bg:n.style('background-color'), shape:n.style('shape'),
                    line:e.style('line-color') };
      });
      console.log(JSON.stringify(seen));
    """, tmp_path)
    for preset, got in result.items():
        assert got == {"bg": "rgb(255,0,0)", "shape": "star", "line": "rgb(255,0,0)"}, (
            f"edits were lost switching to {preset}: {got}"
        )


# ── 3. presets keep their own look when the user has NOT overridden ───────

def test_presets_keep_their_own_palette_without_overrides(harness, tmp_path):
    """The patch must not flatten the notations into one another."""
    result = run_js(harness, ELEMENTS + """
      var cy = cytoscape({ headless:true, styleEnabled:true,
                           elements:elements, style:buildStyle('ontoink') });
      var out = {};
      ['ontoink','chowlk','graffoo','vowl'].forEach(function (p) {
        cy.style(buildStyle(p));
        out[p] = cy.$('#c').style('background-color');
      });
      console.log(JSON.stringify(out));
    """, tmp_path)
    assert result["ontoink"] == "rgb(59,130,246)", "base palette lost data(color)"
    assert result["chowlk"] == "rgb(255,255,255)", "Chowlk lost its white fill"
    assert result["graffoo"] == "rgb(255,255,0)", "Graffoo lost its yellow fill"
    assert result["vowl"] == "rgb(170,204,255)", "VOWL lost its blue fill"


# ── 4. the panel's own state layer ────────────────────────────────────────

@pytest.fixture(scope="module")
def panel_harness(harness: str) -> str:
    """`harness` plus the Edit Layout state machinery (setAppearance & co)."""
    src = ONTOINK_JS.read_text(encoding="utf-8")
    return "\n".join([
        harness,
        "var instances = {};",
        _extract_function(src, "_setEleData"),
        _extract_function(src, "_setJsonData"),
        _extract_function(src, "_toHexColor"),
        "var _appearSeq = 0;",
        _extract_function(src, "_appear"),
        _extract_function(src, "applyAppearance"),
        _extract_function(src, "setAppearance"),
        """
        function makeInst(preset) {
          var data = JSON.parse(JSON.stringify({ nodes: elements.nodes, edges: elements.edges }));
          var cy = cytoscape({ headless:true, styleEnabled:true,
                               elements:elements, style:buildStyle(preset || 'ontoink') });
          instances['g'] = { cy: cy, data: data };
          return instances['g'];
        }
        """,
    ])


@pytest.mark.parametrize("raw,expected", [
    ("rgb(255,0,0)", "#ff0000"),
    ("rgb(59, 130, 246)", "#3b82f6"),
    ("rgba(0,0,0,0.5)", "#000000"),
    ("#abc", "#aabbcc"),
    ("#3b82f6", "#3b82f6"),
    ("", "#999999"),
    ("nonsense", "#999999"),
])
def test_to_hex_color(panel_harness, raw, expected, tmp_path):
    """<input type="color"> only accepts #rrggbb; Cytoscape reports rgb()."""
    result = run_js(panel_harness, ELEMENTS + f"""
      console.log(JSON.stringify({{ v: _toHexColor({raw!r}, '#999999') }}));
    """, tmp_path)
    assert result["v"] == expected


@pytest.mark.parametrize("preset", ["ontoink"] + PRESETS)
def test_panel_colour_change_moves_the_graph(panel_harness, preset, tmp_path):
    """The end-to-end path a colour picker takes, under every preset."""
    result = run_js(panel_harness, ELEMENTS + f"""
      var inst = makeInst({preset!r});
      setAppearance('g', 'type', 'Class', '#ff0000');
      setAppearance('g', 'node-shape', 'Class', 'hexagon');
      setAppearance('g', 'edge-color', 'object-property', '#00ff00');
      setAppearance('g', 'edge-line', 'object-property', 'dashed');
      var n = inst.cy.$('#c'), e = inst.cy.$('#e');
      console.log(JSON.stringify({{
        bg:n.style('background-color'), shape:n.style('shape'),
        line:e.style('line-color'), lineStyle:e.style('line-style'),
        // the inst.data mirror is what survives an attic round-trip
        mirroredColor:inst.data.nodes[0].data.oiColor,
        mirroredShape:inst.data.nodes[0].data.oiShape,
        mirroredEdge:inst.data.edges[0].data.oiEdgeColor
      }}));
    """, tmp_path)
    assert result["bg"] == "rgb(255,0,0)", f"colour not applied under {preset}"
    assert result["shape"] == "hexagon", f"shape not applied under {preset}"
    assert result["line"] == "rgb(0,255,0)", f"edge colour not applied under {preset}"
    assert result["lineStyle"] == "dashed", f"edge line style not applied under {preset}"
    assert result["mirroredColor"] == "#ff0000", "inst.data mirror missing oiColor"
    assert result["mirroredShape"] == "hexagon", "inst.data mirror missing oiShape"
    assert result["mirroredEdge"] == "#00ff00", "inst.data mirror missing oiEdgeColor"


def test_namespace_and_type_colour_last_edit_wins(panel_harness, tmp_path):
    """A node can match both controls; the most recent edit wins, as before."""
    result = run_js(panel_harness, """
      var elements = { nodes: [
        { data: { id:'c', label:'Person', type:'Class', source:'foaf', color:'#3b82f6' } }
      ], edges: [] };
      var inst = makeInst('ontoink');
      setAppearance('g', 'type', 'Class', '#ff0000');
      var afterType = inst.cy.$('#c').style('background-color');
      setAppearance('g', 'source', 'foaf', '#00ff00');
      var afterSource = inst.cy.$('#c').style('background-color');
      setAppearance('g', 'type', 'Class', '#0000ff');
      var afterTypeAgain = inst.cy.$('#c').style('background-color');
      console.log(JSON.stringify({ afterType:afterType, afterSource:afterSource,
                                   afterTypeAgain:afterTypeAgain }));
    """, tmp_path)
    assert result["afterType"] == "rgb(255,0,0)"
    assert result["afterSource"] == "rgb(0,255,0)", "namespace edit did not win"
    assert result["afterTypeAgain"] == "rgb(0,0,255)", "type edit did not take back over"


def test_overrides_replay_onto_re_added_elements(panel_harness, tmp_path):
    """The LOD attic stows elements as JSON; overrides must come back with them."""
    result = run_js(panel_harness, ELEMENTS + """
      var inst = makeInst('graffoo');
      setAppearance('g', 'type', 'Class', '#ff0000');
      // what the LOD sweep does: json() out, remove, later add() back
      var stowed = inst.cy.$('#c').json();
      inst.cy.remove(inst.cy.$('#c'));
      inst.cy.add(stowed);
      var beforeReplay = inst.cy.$('#c').style('background-color');
      applyAppearance('g');                       // the cy.on('add') hook
      console.log(JSON.stringify({ before:beforeReplay,
                                   after:inst.cy.$('#c').style('background-color') }));
    """, tmp_path)
    assert result["after"] == "rgb(255,0,0)", (
        "the override was not replayed onto the re-added element"
    )


# ── 5. Size & Typography must bite under every preset ─────────────────────

@pytest.mark.parametrize("preset", ["ontoink"] + PRESETS)
def test_shape_size_drives_padding(harness, preset, tmp_path):
    """Shapes are `width:"label"`, so padding is what grows them. Every preset
    must route the Shape size control to it — VOWL's base node rule declares no
    padding at all, which used to leave the control dead for unnamed types."""
    result = run_js(harness, ELEMENTS + f"""
      var cy = cytoscape({{ headless:true, styleEnabled:true,
                            elements:elements, style:buildStyle({preset!r}) }});
      var n = cy.$('#c'), s = cy.$('#s');       // #s is a type no preset names
      n.data('oiPad', 28); s.data('oiPad', 28); // Scale slider at 200%
      console.log(JSON.stringify({{ named:n.style('padding'), unnamed:s.style('padding') }}));
    """, tmp_path)
    assert result["named"] == "28px", f"Shape size ignored under {preset}"
    assert result["unnamed"] == "28px", (
        f"Shape size ignored for an unnamed node type under {preset}"
    )


def test_fixed_pixel_shapes_scale_with_shape_size(harness, tmp_path):
    """VOWL/Graffoo pin some shapes in px, where padding cannot reach them."""
    result = run_js(harness, ELEMENTS + """
      var out = {};
      [['vowl','#c'], ['graffoo','#i']].forEach(function (pair) {
        var cy = cytoscape({ headless:true, styleEnabled:true,
                             elements:elements, style:buildStyle(pair[0]) });
        var n = cy.$(pair[1]);
        var before = n.width();
        n.data('oiPad', 28);                    // 2x TYPO_BASE.pad
        out[pair[0]] = { before:before, after:n.width() };
      });
      console.log(JSON.stringify(out));
    """, tmp_path)
    assert result["vowl"] == {"before": 78, "after": 156}, (
        f"VOWL class circle did not scale: {result['vowl']}"
    )
    assert result["graffoo"] == {"before": 18, "after": 36}, (
        f"Graffoo individual dot did not scale: {result['graffoo']}"
    )


@pytest.mark.parametrize("preset", ["ontoink"] + PRESETS)
def test_label_size_and_font_apply(harness, preset, tmp_path):
    """A type the preset never names must still honour the font controls."""
    result = run_js(harness, ELEMENTS + f"""
      var cy = cytoscape({{ headless:true, styleEnabled:true,
                            elements:elements, style:buildStyle({preset!r}) }});
      // 'Cluster' is a super-node: none of the presets give it a font rule.
      var s = cy.$('#s');
      s.data('oiFontSize', 27);
      s.data('oiFontFamily', 'Verdana, Geneva, sans-serif');
      console.log(JSON.stringify({{ size:s.style('font-size'), family:s.style('font-family') }}));
    """, tmp_path)
    assert result["size"] == "27px", f"Label size ignored under {preset}"
    assert result["family"] == "Verdana, Geneva, sans-serif", f"Font ignored under {preset}"


def test_presets_keep_their_own_metrics_without_overrides(harness, tmp_path):
    """Installing the fallback mappers must not resize anything on its own."""
    result = run_js(harness, ELEMENTS + """
      var out = {};
      ['ontoink','chowlk','graffoo','vowl'].forEach(function (p) {
        var cy = cytoscape({ headless:true, styleEnabled:true,
                             elements:elements, style:buildStyle(p) });
        var n = cy.$('#c');
        out[p] = { w:Math.round(n.width()), h:Math.round(n.height()),
                   font:n.style('font-size'), pad:n.style('padding') };
      });
      console.log(JSON.stringify(out));
    """, tmp_path)
    # VOWL pins its class circle at 78px; that must be untouched by the patch.
    assert result["vowl"]["w"] == 78, f"VOWL class circle resized: {result['vowl']}"
    assert result["ontoink"]["pad"] == "14px", f"Ontoink padding drifted: {result['ontoink']}"
    assert result["chowlk"]["pad"] == "10px", f"Chowlk padding drifted: {result['chowlk']}"
    assert result["graffoo"]["pad"] == "10px", f"Graffoo padding drifted: {result['graffoo']}"


def test_inferred_node_opacity_is_stable_across_a_switch(harness, tmp_path):
    """The base sheet said 0.7 while the overlay appended to presets said 0.75."""
    result = run_js(harness, """
      var elements = { nodes: [
        { data: { id:'x', label:'Inferred', type:'Class', color:'#3b82f6', inferred:true } }
      ], edges: [] };
      var cy = cytoscape({ headless:true, styleEnabled:true,
                           elements:elements, style:buildStyle('ontoink') });
      var before = cy.$('#x').style('opacity');
      cy.style(buildStyle('chowlk'));
      cy.style(buildStyle('ontoink'));
      console.log(JSON.stringify({ before:before, after:cy.$('#x').style('opacity') }));
    """, tmp_path)
    assert result["after"] == result["before"], (
        f"inferred nodes changed opacity across a style switch: {result}"
    )
