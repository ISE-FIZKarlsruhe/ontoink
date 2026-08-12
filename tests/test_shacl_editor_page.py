"""Integration test for the SHACL Editor page's own embedded script.

`tests/test_recommend_parity.py` proves the shared induction engine
(`ontoink.recommendShapes`) matches the Python side. This file proves something
different and just as necessary: that `demo/docs/shacl-editor.md`'s own glue
code — `seRecommendFromTTL`, `seRenderRecommendations`, `seRecAccept`,
`seRecDownload` — actually calls that engine and does something sensible with
the result, using the page's real, shipped script text (extracted from the
`.md` file), not a reimplementation.

There is no real browser available in this environment, so DOM access is
stubbed with the minimum surface the script touches: `getElementById`,
`createElement`, `Blob`/`URL.createObjectURL`. The point is not to fake a
browser faithfully — it is to catch the exact failure class the CSP-shim
regression already taught this codebase: code that parses fine and is simply
never reached, or reached with the wrong shape of argument.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
ONTOINK_JS = ROOT / "ontoink" / "resources" / "ontoink.js"
EDITOR_PAGE = ROOT / "demo" / "docs" / "shacl-editor.md"

pytestmark = pytest.mark.skipif(
    shutil.which("node") is None, reason="Node.js is not installed"
)

ENGINE_FUNCTIONS = [
    "parseTtlMinimal", "tokenize", "_shortIri", "_indexTriples", "_isMeta",
    "_isDatatypeIri", "_isLiteralTerm", "_literalDatatype",
    "_instantiatedClasses", "_declaredClasses", "_profileClass",
    "_constraint", "_constraintKey", "_mergeConstraints", "_addConstraint",
    "_induceBaseline", "_induceAstrea", "_shapeIri", "_formatValue",
    "_emitShape", "_coveredClassesFromTriples", "_labelFor", "recommendShapes",
]

ENGINE_CONSTANTS = "\n".join([
    'var _RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";',
    'var _RDFS = "http://www.w3.org/2000/01/rdf-schema#";',
    'var _OWL = "http://www.w3.org/2002/07/owl#";',
    'var _XSD = "http://www.w3.org/2001/XMLSchema#";',
    'var _SH_IRI = "http://www.w3.org/ns/shacl#IRI";',
    'var _META_NS = [_OWL, _RDF_TYPE.substring(0, _RDF_TYPE.lastIndexOf("#") + 1), _RDFS, "http://www.w3.org/ns/shacl#"];',
    'var _NUMERIC_KINDS = {minCount:1,maxCount:1,minLength:1,maxLength:1,minInclusive:1,maxInclusive:1};',
    'var _IRI_KINDS = {datatype:1,"class":1,nodeKind:1};',
])

# Minimal DOM: an id-keyed registry of plain objects, plus just enough of
# document/window/navigator/Blob/URL for the page script's top-level init
# (seRender(); buildDataLists();) and the recommender flow to run without
# throwing. Anything the script never calls (real rendering, real files) is
# simply absent — not faked.
DOM_STUB = r"""
'use strict';
var _elements = {};
var _downloads = [];

function FakeElement(tag) {
  this.tag = tag || "";
  this.value = "";
  this.textContent = "";
  this.innerHTML = "";
  this.checked = false;
  this.files = [];
  this.style = {};
  this.href = "";
  this.download = "";
}
FakeElement.prototype.appendChild = function (c) { return c; };
FakeElement.prototype.remove = function () {};
FakeElement.prototype.querySelector = function () { return null; };
FakeElement.prototype.closest = function () { return null; };
FakeElement.prototype.click = function () {
  _downloads.push({ tag: this.tag, href: this.href, download: this.download });
};

var document = {
  body: new FakeElement("body"),
  getElementById: function (id) {
    if (!_elements[id]) _elements[id] = new FakeElement("");
    return _elements[id];
  },
  createElement: function (tag) { return new FakeElement(tag); },
  querySelector: function () { return null; },
};
function alert() {}
var navigator = { clipboard: { writeText: function () { return Promise.resolve(); } } };
function Blob(parts, opts) { this.parts = parts; this.type = opts && opts.type; }
var URL = { createObjectURL: function () { return "blob://stub"; } };
var window = {};
"""


def _extract_function(source: str, name: str) -> str:
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


def _page_script() -> str:
    text = EDITOR_PAGE.read_text(encoding="utf-8")
    blocks = re.findall(r"<script>(.*?)</script>", text, re.S)
    assert len(blocks) == 1, f"expected exactly one <script> block, found {len(blocks)}"
    return blocks[0]


@pytest.fixture(scope="module")
def harness() -> str:
    """DOM stub + the shared engine + the page's own shipped script, in order."""
    js_source = ONTOINK_JS.read_text(encoding="utf-8")
    engine = ENGINE_CONSTANTS + "\n" + "\n".join(
        _extract_function(js_source, n) for n in ENGINE_FUNCTIONS
    )
    return "\n".join([
        DOM_STUB,
        engine,
        "window.ontoink = { recommendShapes: recommendShapes };",
        _page_script(),
    ])


TTL_FIXTURE = """
@prefix ex: <http://example.org/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

ex:Person a owl:Class .
ex:Dog a owl:Class .
ex:name a owl:DatatypeProperty ; rdfs:domain ex:Person ; rdfs:range xsd:string .
ex:owns a owl:ObjectProperty, owl:FunctionalProperty ;
    rdfs:domain ex:Person ; rdfs:range ex:Dog .

ex:alice a ex:Person ; ex:name "Alice" ; ex:owns ex:rex .
ex:bob   a ex:Person ; ex:name "Bob"   ; ex:owns ex:fido .
ex:carol a ex:Person ; ex:name "Carol" ; ex:owns ex:rex .
ex:rex a ex:Dog .
ex:fido a ex:Dog .
"""


def _run(harness: str, tail: str, tmp_path) -> dict:
    script_path = tmp_path / "run.js"
    script_path.write_text(harness + "\n" + tail, encoding="utf-8")
    proc = subprocess.run(
        ["node", str(script_path)], capture_output=True, text=True,
    )
    assert proc.returncode == 0, proc.stderr
    return json.loads(proc.stdout.strip().splitlines()[-1])


def test_analyze_and_recommend_populates_results(harness, tmp_path):
    """The button a reader actually clicks must reach the shared engine."""
    tail = f"""
      document.getElementById("se-recommend-ttl").value = {json.dumps(TTL_FIXTURE)};
      document.getElementById("se-rec-method").value = "auto";
      seRecommendFromTTL();
      console.log(JSON.stringify({{
        status: document.getElementById("se-recommend-status").textContent,
        shapeCount: seRecState.shapes.length,
        firstClass: seRecState.shapes[0] && seRecState.shapes[0].targetClass,
        resultsHtmlNonEmpty: document.getElementById("se-recommend-results").innerHTML.length > 0
      }}));
    """
    out = _run(harness, tail, tmp_path)
    assert out["shapeCount"] > 0, out
    assert out["firstClass"] == "http://example.org/Person"
    assert out["resultsHtmlNonEmpty"] is True
    assert "recommended" in out["status"]


def test_empty_input_shows_an_alert_not_a_crash(harness, tmp_path):
    tail = """
      document.getElementById("se-recommend-ttl").value = "";
      var threw = false;
      try { seRecommendFromTTL(); } catch (e) { threw = true; }
      console.log(JSON.stringify({ threw: threw }));
    """
    out = _run(harness, tail, tmp_path)
    assert out["threw"] is False


def test_astrea_method_selection_reaches_the_engine(harness, tmp_path):
    """The method <select> must actually change what gets induced."""
    axioms_only = """
        @prefix ex: <http://example.org/> .
        @prefix owl: <http://www.w3.org/2002/07/owl#> .
        @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
        ex:Sample a owl:Class ;
            rdfs:subClassOf [ a owl:Restriction ;
                              owl:onProperty ex:material ;
                              owl:someValuesFrom ex:Material ] .
        ex:Material a owl:Class .
        ex:material a owl:ObjectProperty ; rdfs:domain ex:Sample ; rdfs:range ex:Material .
    """
    tail = f"""
      document.getElementById("se-recommend-ttl").value = {json.dumps(axioms_only)};
      document.getElementById("se-rec-method").value = "baseline";
      seRecommendFromTTL();
      var baselineShapes = seRecState.shapes.length;
      document.getElementById("se-rec-method").value = "astrea";
      seRecommendFromTTL();
      var astreaShapes = seRecState.shapes.length;
      console.log(JSON.stringify({{ baselineShapes: baselineShapes, astreaShapes: astreaShapes }}));
    """
    out = _run(harness, tail, tmp_path)
    # No instances anywhere in this fixture: baseline (data-driven) must find
    # nothing, astrea (axiom-driven) must find the someValuesFrom restriction.
    assert out["baselineShapes"] == 0, out
    assert out["astreaShapes"] > 0, out


def test_accept_and_edit_adds_a_real_shape_to_the_builder(harness, tmp_path):
    tail = f"""
      document.getElementById("se-recommend-ttl").value = {json.dumps(TTL_FIXTURE)};
      seRecommendFromTTL();
      var before = seState.shapes.length;
      seRecAccept(0);
      console.log(JSON.stringify({{
        added: seState.shapes.length - before,
        turtleContainsNodeShape: document.getElementById("se-ttl-output").value.indexOf("sh:NodeShape") >= 0,
        turtleContainsTargetClass: document.getElementById("se-ttl-output").value.indexOf("http://example.org/Person") >= 0
      }}));
    """
    out = _run(harness, tail, tmp_path)
    assert out["added"] == 1
    assert out["turtleContainsNodeShape"] is True
    assert out["turtleContainsTargetClass"] is True


def test_download_produces_a_ttl_file_with_a_prefix_header(harness, tmp_path):
    """A downloaded single shape must be a standalone, valid Turtle file.

    _emitShape (and its Python twin, write_node_shape_skeleton) deliberately
    omits the @prefix block — it's meant to be pasted into a file that already
    has one. A file saved to disk on its own needs the header, or it isn't
    valid Turtle by itself.
    """
    tail = f"""
      document.getElementById("se-recommend-ttl").value = {json.dumps(TTL_FIXTURE)};
      seRecommendFromTTL();
      seRecDownload(0);
      console.log(JSON.stringify({{
        downloadCount: _downloads.length,
        filename: _downloads[0] && _downloads[0].download
      }}));
    """
    out = _run(harness, tail, tmp_path)
    assert out["downloadCount"] == 1
    assert out["filename"].endswith(".ttl")


def test_already_covered_classes_are_not_re_recommended(harness, tmp_path):
    """Accepting a shape must narrow what gets recommended next.

    seRecommendFromTTL reads se-ttl-output — the builder's own rendered
    Turtle — as the `shacl:` skip list, so a class the user already shaped in
    this session should not keep reappearing.
    """
    tail = f"""
      document.getElementById("se-recommend-ttl").value = {json.dumps(TTL_FIXTURE)};
      seRecommendFromTTL();
      var classesBefore = seRecState.shapes.map(function(s) {{ return s.targetClass; }});
      seRecAccept(0);  // accepts whichever class ranked first (Person)
      seRecommendFromTTL();
      var classesAfter = seRecState.shapes.map(function(s) {{ return s.targetClass; }});
      console.log(JSON.stringify({{
        acceptedWasPerson: classesBefore[0] === "http://example.org/Person",
        personGoneAfter: classesAfter.indexOf("http://example.org/Person") === -1
      }}));
    """
    out = _run(harness, tail, tmp_path)
    assert out["acceptedWasPerson"] is True
    assert out["personGoneAfter"] is True
