"""The Shapes panel's method picker and hyperparameter menu.

`_renderMethodPicker` is the control the reader actually uses to choose an
induction method and tune it. It is markup-only — it reads the method catalogue
and emits `data-oi-on*` attributes — so it runs under Node without a DOM.

What is worth asserting here is not that it renders, but that it renders
*honestly*: the method it claims to be showing, the paper behind that method,
the knobs that method actually reads, and nothing it cannot run.

Requires Node.js; skipped otherwise.
"""

from __future__ import annotations

import json
import shutil

import pytest

from .js_engine import build_panel_renderer, run_node

pytestmark = pytest.mark.skipif(
    shutil.which("node") is None, reason="Node.js is not installed"
)


@pytest.fixture(scope="module")
def renderer() -> str:
    return build_panel_renderer()


def render(renderer: str, rec) -> str:
    proc = run_node(
        renderer + "\nconsole.log(_renderMethodPicker('g0', JSON.parse(process.argv[2])));",
        json.dumps(rec),
    )
    assert proc.returncode == 0, proc.stderr
    return proc.stdout


def test_it_renders_without_a_build_time_payload(renderer):
    """A fence that never enabled `recommend_shapes:` still gets a working picker."""
    html = render(renderer, None)
    for name in ("auto", "baseline", "astrea", "shexer"):
        assert f'value="{name}"' in html
    assert 'value="auto" selected' in html


def test_the_selected_option_is_the_method_that_actually_ran(renderer):
    html = render(renderer, {"method": "baseline", "params": {}})
    assert 'value="baseline" selected' in html
    assert 'value="auto" selected' not in html


def test_the_citation_travels_with_the_method(renderer):
    """A method a reader cannot attribute is a suggestion they cannot defend."""
    baseline = render(renderer, {"method": "baseline"})
    assert "Mihindukulasooriya" in baseline
    assert "https://doi.org/10.1145/3167132.3167341" in baseline

    shexer = render(renderer, {"method": "shexer"})
    assert "Fernández-Álvarez" in shexer
    assert "https://doi.org/10.1016/j.knosys.2021.107975" in shexer


def test_a_method_this_engine_cannot_run_is_disabled_not_hidden(renderer):
    """Hiding it would leave a reader wondering; offering it would fail on click."""
    html = render(renderer, None)
    assert 'value="shexer" disabled' in html
    assert "needs the server" in html


def test_a_fallback_notice_is_surfaced(renderer):
    html = render(renderer, {"method": "auto", "notice": "shexer is not installed"})
    assert "shexer is not installed" in html
    assert "ov-rec-notice" in html


def test_only_the_knobs_the_method_reads_are_offered(renderer):
    baseline = render(renderer, {"method": "baseline", "params": {}})
    assert "min_count_threshold" in baseline
    # max_samples changes nothing in this method, so it must not be a control.
    assert "max_samples" not in baseline

    # astrea is deterministic from the axioms — no menu at all.
    astrea = render(renderer, {"method": "astrea", "params": {}})
    assert "ov-rec-params" not in astrea


def test_current_parameter_values_are_reflected_not_reset(renderer):
    """Re-rendering after a change must show the value the reader set."""
    html = render(renderer, {"method": "baseline",
                             "params": {"min_count_threshold": 0.55}})
    assert 'value="0.55"' in html
    assert 'min="0"' in html and 'max="1"' in html


def test_boolean_knobs_render_as_checkboxes_reflecting_their_value(renderer):
    off = render(renderer, {"method": "shexer", "params": {
        "detect_minimal_iri": False, "infer_numeric_types": False}})
    on = render(renderer, {"method": "shexer", "params": {
        "detect_minimal_iri": True, "infer_numeric_types": True}})

    assert 'type="checkbox"' in off and "this.checked" in off
    # `checked` is a boolean attribute: present or absent, never "false". The
    # two renders must therefore differ in exactly that.
    assert off.count('type="checkbox" checked') == 0
    assert on.count('type="checkbox" checked') == 2


def test_auto_borrows_the_knobs_of_what_it_composes(renderer):
    """`auto` declares none of its own, but baseline's threshold decides its output.

    Showing an empty menu would imply there is nothing to tune, which is false.
    The borrowed knobs carry a fourth argument naming the sub-method they belong
    to, matching the nested params shape the Python side takes.
    """
    html = render(renderer, {"method": "auto", "params": {}})
    assert "min_count_threshold" in html
    assert "'baseline'" in html
    assert "Baseline: Required coverage" in html


def test_nested_auto_parameters_are_read_from_their_own_key(renderer):
    html = render(renderer, {"method": "auto",
                             "params": {"baseline": {"min_count_threshold": 0.4}}})
    assert 'value="0.4"' in html


def test_every_control_is_dispatchable_by_the_csp_shim(renderer):
    """The shim parses a strict grammar; a shape it rejects is a dead control."""
    import re

    from .js_engine import ONTOINK_JS

    source = ONTOINK_JS.read_text(encoding="utf-8")
    api_start = source.index("var api = {")
    api_block = source[api_start:source.index("\n  };", api_start)]

    for rec in (None, {"method": "baseline"}, {"method": "shexer"},
                {"method": "auto", "params": {}}):
        html = render(renderer, rec)
        for handler in re.findall(r"ontoink\.([A-Za-z_$][\w$]*)\(", html):
            assert f"{handler}: " in api_block, (
                f"{handler} is emitted by the picker but not exported"
            )
