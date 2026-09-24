"""Regression tests for the no-eval CSP shim's argument grammar.

Every interactive control in a rendered diagram is a `data-oi-on*` attribute
that `_oiRun` parses and dispatches against the exported api object. The parser
is deliberately strict — no eval, no property chains — which means a call shape
it does not understand is not an error but a *silently dead button*. That
failure mode is invisible to the Python suite and to `node --check`, so it is
worth testing directly.

The trigger: v0.7.7 shipped three buttons passing an array of IRIs
(`ontoink.selectIris('g0', ['a','b'])`). The grammar had no array branch, and
the argument splitter did not track brackets, so a multi-element array was split
at its own commas and the callee received three mangled strings.

These run the real shim source under Node. Skipped when Node is unavailable.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

RESOURCES = Path(__file__).resolve().parents[1] / "ontoink" / "resources"
ONTOINK_JS = RESOURCES / "ontoink.js"

pytestmark = pytest.mark.skipif(
    shutil.which("node") is None, reason="Node.js is not installed"
)


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


@pytest.fixture(scope="module")
def shim_source() -> str:
    source = ONTOINK_JS.read_text(encoding="utf-8")
    esc = (
        'function esc(x){return x?x.replace(/&/g,"&amp;").replace(/</g,"&lt;")'
        '.replace(/>/g,"&gt;").replace(/"/g,"&quot;"):""}'
    )
    return "\n".join([
        esc,
        _extract_function(source, "_oiSplitTop"),
        _extract_function(source, "_oiArg"),
        _extract_function(source, "_oiStr"),
    ])


def parse_call(shim_source: str, statement: str):
    """Run `statement` through the real parser, returning the argument list."""
    script = shim_source + """
      var stmt = JSON.parse(process.argv[1]);
      // Attributes reach the parser already HTML-decoded by the browser.
      stmt = stmt.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
      var m = stmt.match(/^ontoink\\.([A-Za-z_$][\\w$]*)\\(([\\s\\S]*)\\)$/);
      if (!m) { console.log(JSON.stringify(null)); process.exit(0); }
      var args = m[2].trim()
        ? _oiSplitTop(m[2], ",").map(function (a) { return _oiArg(a, null, null); })
        : [];
      console.log(JSON.stringify(args));
    """
    out = subprocess.run(
        ["node", "-e", script, json.dumps(statement)],
        capture_output=True, text=True, check=True,
    )
    return json.loads(out.stdout)


def js_escape(shim_source: str, value: str) -> str:
    """Run a string through the shim's own attribute escaper."""
    script = shim_source + "console.log(_oiStr(JSON.parse(process.argv[1])));"
    out = subprocess.run(
        ["node", "-e", script, json.dumps(value)],
        capture_output=True, text=True, check=True,
    )
    return out.stdout.strip()


# ── the grammar that already worked ───────────────────────────────────────

def test_scalar_string_arguments(shim_source):
    assert parse_call(shim_source, "ontoink.copyShape('g0','http://ex.org/Person')") == [
        "g0", "http://ex.org/Person",
    ]


def test_numeric_arguments(shim_source):
    assert parse_call(shim_source, "ontoink.setGhostThreshold('g0',40)") == ["g0", 40]


def test_comma_inside_a_quoted_string_is_not_a_separator(shim_source):
    assert parse_call(shim_source, "ontoink.copyShape('g0','a,b')") == ["g0", "a,b"]


# ── arrays: the v0.7.7 regression ─────────────────────────────────────────

def test_single_element_array(shim_source):
    """Emitted by the OntoSniff smell chip and the panel's "Show class"."""
    assert parse_call(shim_source, "ontoink.selectIris('g0',['http://ex.org/Person'])") == [
        "g0", ["http://ex.org/Person"],
    ]


def test_multi_element_array_is_not_split_at_its_own_commas(shim_source):
    """Competency-question results pass up to 60 IRIs in one attribute."""
    statement = (
        "ontoink.selectIris('g0',[&quot;http://ex.org/A&quot;,"
        "&quot;http://ex.org/B&quot;,&quot;http://ex.org/C&quot;])"
    )
    assert parse_call(shim_source, statement) == [
        "g0", ["http://ex.org/A", "http://ex.org/B", "http://ex.org/C"],
    ]


def test_empty_array(shim_source):
    assert parse_call(shim_source, "ontoink.selectIris('g0',[])") == ["g0", []]


def test_array_elements_obey_the_same_grammar(shim_source):
    """No eval and no JSON.parse: an element is a string, number, bool or null."""
    assert parse_call(shim_source, "ontoink.selectIris('g0',[1,true,null])") == [
        "g0", [1, True, None],
    ]


# ── apostrophes ───────────────────────────────────────────────────────────

def test_apostrophe_in_a_value_survives_escaping(shim_source):
    """`esc()` leaves ' alone, which would close a single-quoted argument early.

    "Alzheimer's disease" is a real term in more than one biomedical ontology.
    """
    escaped = js_escape(shim_source, "http://ex.org/Alzheimer's")
    assert "&#39;" in escaped
    assert parse_call(shim_source, f"ontoink.copyShape('g0','{escaped}')") == [
        "g0", "http://ex.org/Alzheimer's",
    ]


# ── the shapes-panel method picker ────────────────────────────────────────

def test_this_dot_value_and_this_dot_checked_reach_the_handler(shim_source):
    """The knob inputs pass their own value; the shim must read it off the element."""
    script = shim_source + """
      var el = { value: "0.75", checked: true };
      function args(stmt) {
        var m = stmt.match(/^ontoink\\.([A-Za-z_$][\\w$]*)\\(([\\s\\S]*)\\)$/);
        return _oiSplitTop(m[2], ",").map(function (a) { return _oiArg(a, el, null); });
      }
      console.log(JSON.stringify({
        number: args("ontoink.setRecommendParam('g0','min_count_threshold',this.value)"),
        checkbox: args("ontoink.setRecommendParam('g0','detect_minimal_iri',this.checked)"),
        grouped: args("ontoink.setRecommendParam('g0','min_count_threshold',this.value,'baseline')")
      }));
    """
    out = subprocess.run(["node", "-e", script], capture_output=True, text=True, check=True)
    got = json.loads(out.stdout)
    assert got["number"] == ["g0", "min_count_threshold", "0.75"]
    assert got["checkbox"] == ["g0", "detect_minimal_iri", True]
    # `auto` composes two methods, so its knobs carry a fourth argument naming
    # which one they belong to — a call shape nothing else in the UI emits.
    assert got["grouped"] == ["g0", "min_count_threshold", "0.75", "baseline"]


# ── the contract the emitters rely on ─────────────────────────────────────

def test_every_handler_ontoink_js_emits_is_exported(shim_source):
    """The same dead-button contract as below, for handlers the JS emits itself.

    `fence.py` is not the only emitter: panels rendered in the browser build
    their own `data-oi-on*` attributes, and the method picker and hyperparameter
    menu are entirely of that kind. A handler missing from the api object leaves
    a control that renders, accepts clicks and does nothing.
    """
    import re

    source = ONTOINK_JS.read_text(encoding="utf-8")
    api_start = source.index("var api = {")
    api_block = source[api_start:source.index("\n  };", api_start)]

    # Scan a window after each `data-oi-on*=` rather than trying to match the
    # attribute as one quoted literal. These attributes are assembled by string
    # concatenation — `'...setRecommendMethod(\'' + id + "',this.value)"' — so
    # the handler name and its arguments routinely straddle several JS string
    # pieces, and a single-literal regex finds almost none of them.
    handlers = set()
    for m in re.finditer(r"data-oi-on\w+=", source):
        window = source[m.end():m.end() + 300]
        handlers.update(re.findall(r"ontoink\.([A-Za-z_$][\w$]*)\(", window))

    for expected in ("setRecommendMethod", "setRecommendParam",
                     "resetRecommendParams", "toggleRecommendations"):
        assert expected in handlers, f"{expected} is no longer emitted anywhere"
    assert len(handlers) > 20, f"the scan found only {len(handlers)} handlers"

    missing = [h for h in sorted(handlers) if f"{h}:" not in api_block]
    assert not missing, f"handlers emitted by ontoink.js but not exported: {missing}"


def test_every_handler_the_fence_emits_is_exported(shim_source):
    """A handler missing from the api object is a silently dead button."""
    import re

    from ontoink import fence

    source = ONTOINK_JS.read_text(encoding="utf-8")
    api_start = source.index("var api = {")
    api_block = source[api_start:source.index("\n  };", api_start)]

    fence_source = Path(fence.__file__).read_text(encoding="utf-8")
    handlers = set(re.findall(r"ontoink\.([A-Za-z_$][\w$]*)\(", fence_source))
    assert handlers, "no data-oi-* handlers found in fence.py"

    missing = [h for h in sorted(handlers) if f"{h}:" not in api_block]
    assert not missing, f"handlers emitted by fence.py but not exported: {missing}"
