"""End-to-end tests that drive a real MkDocs build through the plugin.

Everything else in the suite tests a function in isolation. These run the actual
`mkdocs build` lifecycle — on_config → fence rendering → on_post_page asset
injection → on_post_build artefacts — because that is where the interesting
failures live: a panel that renders but whose button was never emitted, a
handler the CSP shim cannot dispatch, a report written before its data existed.
"""

from __future__ import annotations

import json
import textwrap
from pathlib import Path

import pytest

mkdocs_build = pytest.importorskip("mkdocs.commands.build")
mkdocs_config = pytest.importorskip("mkdocs.config")


ONTOLOGY = """\
@prefix ex: <http://example.org/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix dcterms: <http://purl.org/dc/terms/> .

ex: a owl:Ontology ;
    dcterms:title "Example" ;
    dcterms:creator "Ada Lovelace" ;
    dcterms:license <https://creativecommons.org/licenses/by/4.0/> ;
    owl:versionInfo "1.2.0" .

ex:Person a owl:Class .
ex:name a owl:DatatypeProperty ; rdfs:domain ex:Person ; rdfs:range xsd:string .

ex:alice a ex:Person ; ex:name "Alice" .
ex:bob a ex:Person ; ex:name "Bob" .
"""

SHAPES = """\
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ex: <http://example.org/> .

ex:PersonShape a sh:NodeShape ;
    sh:targetClass ex:Person ;
    sh:property [ sh:path ex:name ; sh:minCount 1 ] .
"""


def build_site(tmp_path: Path, page: str, plugin_options: dict = None,
               ontology: str = ONTOLOGY) -> Path:
    """Write a minimal site, build it with the plugin, return the site dir."""
    docs = tmp_path / "docs"
    docs.mkdir(parents=True, exist_ok=True)
    (docs / "onto.ttl").write_text(ontology, encoding="utf-8")
    (docs / "shapes.ttl").write_text(SHAPES, encoding="utf-8")
    (docs / "index.md").write_text(page, encoding="utf-8")

    options = json.dumps(plugin_options or {})
    config_text = textwrap.dedent(f"""\
        site_name: test
        docs_dir: docs
        site_dir: site
        plugins:
          - ontoink: {options}
        markdown_extensions:
          - pymdownx.superfences:
              preserve_tabs: true
        """)
    config_path = tmp_path / "mkdocs.yml"
    config_path.write_text(config_text, encoding="utf-8")

    config = mkdocs_config.load_config(str(config_path))
    mkdocs_build.build(config)
    return Path(config["site_dir"])


@pytest.fixture(autouse=True)
def _fast_reasoner(monkeypatch):
    """Keep the OWL reasoner out of these tests — they are about the pipeline."""
    monkeypatch.setenv("ONTOINK_REASONER", "none")


def index_html(site: Path) -> str:
    return (site / "index.html").read_text(encoding="utf-8")


def has_button(html: str, handler: str, graph_id: str = "ontoink-graph-0") -> bool:
    """Is *handler* wired to a toolbar button for this diagram?

    Qualified with the graph id on purpose: ontoink.js is inlined verbatim into
    every page, and it contains `_oiEmbedSkeleton`'s copy of the same markup as
    a string. A bare substring search therefore matches on every page whether or
    not the fence emitted the button.
    """
    return f"ontoink.{handler}('{graph_id}')" in html


# ── the rendered page ─────────────────────────────────────────────────────

def test_recommendations_reach_the_page_with_a_button_to_open_them(tmp_path):
    site = build_site(tmp_path, textwrap.dedent("""\
        # Test

        ```ontoink
        source: onto.ttl
        recommend_shapes: true
        ```
        """))
    html = index_html(site)

    # The panel, the toolbar button that opens it, and the api-object export the
    # CSP shim dispatches through must all be present — any one missing is a
    # feature that looks shipped and does nothing.
    assert "ov-recommend-panel" in html
    assert has_button(html, "toggleRecommendations")
    assert "toggleRecommendations: toggleRecommendations" in html


def test_recommendation_payload_is_embedded_in_the_page(tmp_path):
    site = build_site(tmp_path, textwrap.dedent("""\
        ```ontoink
        source: onto.ttl
        recommend_shapes: true
        ```
        """))
    payload = _graph_payload(index_html(site))
    rec = payload["shape_recommendations"]
    assert rec["shapes"], "expected at least one proposed shape"
    assert rec["shapes"][0]["turtle"].startswith("<")
    assert any(c["kind"] == "minCount" for c in rec["constraints"])


def test_no_shapes_button_when_the_feature_is_off(tmp_path):
    """A button whose panel would be empty should not be rendered at all."""
    site = build_site(tmp_path, "```ontoink\nsource: onto.ttl\n```\n")
    assert not has_button(index_html(site), "toggleRecommendations")


def test_citation_button_appears_only_with_ontology_metadata(tmp_path):
    with_header = build_site(tmp_path / "a", "```ontoink\nsource: onto.ttl\n```\n")
    assert has_button(index_html(with_header), "toggleCitation")

    without = build_site(
        tmp_path / "b", "```ontoink\nsource: onto.ttl\n```\n",
        ontology="@prefix ex: <http://example.org/> .\nex:a a ex:B .\n",
    )
    assert not has_button(index_html(without), "toggleCitation")


def test_assets_are_injected_once_per_page(tmp_path):
    site = build_site(tmp_path, "```ontoink\nsource: onto.ttl\n```\n")
    html = index_html(site)
    # Count the injected assignment, not the identifier: ontoink.js reads
    # window.ONTOINK_ASSET_BASE in two more places and is inlined verbatim.
    assert html.count("<script>window.ONTOINK_ASSET_BASE=") == 1
    assert "vendor/cytoscape.min.js" in html
    # The </script> escape guard that broke v0.7.4 must still hold: a bare
    # closing tag anywhere in the JS would truncate the IIFE and leave
    # window.ontoink undefined.
    assert "window.ontoink" in html
    assert "<\\/script>" in html


# ── competency questions ──────────────────────────────────────────────────

CQ_PAGE = textwrap.dedent("""\
    ```ontoink-cq
    source: onto.ttl
    questions:
      - question: Are there people?
        query: |
          SELECT ?p WHERE { ?p a <http://example.org/Person> }
        min_rows: 2
      - question: Are there robots?
        query: |
          SELECT ?r WHERE { ?r a <http://example.org/Robot> }
        min_rows: 1
    ```
    """)


def test_cq_fence_renders_on_a_page_with_no_diagram(tmp_path):
    """CQ cards need ontoink's CSS even when no graph triggers asset injection."""
    site = build_site(tmp_path, CQ_PAGE)
    html = index_html(site)
    assert "ov-cq-block" in html
    assert "ov-cq-pass" in html and "ov-cq-fail" in html
    assert "ov-cq-card" in html
    assert "<style>" in html, "ontoink.css was not injected"


def test_cq_results_reach_the_build_report(tmp_path):
    site = build_site(tmp_path, CQ_PAGE)
    report = json.loads((site / "ontoink-report.json").read_text(encoding="utf-8"))
    assert report["summary"]["competencyQuestions"] == {
        "total": 2, "passed": 1, "failed": 1,
    }
    # The per-question detail must be in the written file, not just the summary.
    questions = report["competencyQuestions"][0]["questions"]
    assert [q["passed"] for q in questions] == [True, False]


# ── build artefacts ───────────────────────────────────────────────────────

def test_report_and_badges_are_written(tmp_path):
    site = build_site(tmp_path, textwrap.dedent("""\
        ```ontoink
        source: onto.ttl
        shape: shapes.ttl
        ```
        """))
    report = json.loads((site / "ontoink-report.json").read_text(encoding="utf-8"))
    assert report["summary"]["graphs"] == 1
    assert report["graphs"][0]["validation"]["status"] == "conforms"

    for badge in ("ontosniff.svg", "shacl.svg", "consistency.svg"):
        assert (site / "badges" / badge).is_file()


def test_report_can_be_turned_off(tmp_path):
    site = build_site(tmp_path, "```ontoink\nsource: onto.ttl\n```\n",
                      plugin_options={"report": False})
    assert not (site / "ontoink-report.json").exists()


def test_drift_findings_are_recorded(tmp_path):
    site = build_site(tmp_path, textwrap.dedent("""\
        ```ontoink
        source: onto.ttl
        shape: shapes.ttl
        shape_drift: warn
        ```
        """))
    report = json.loads((site / "ontoink-report.json").read_text(encoding="utf-8"))
    drift = report["graphs"][0]["shape_drift"]
    # ex:name has maxCount 1 in the data but only minCount 1 in the shapes file.
    assert drift["missing"] > 0
    assert report["summary"]["shapeDrift"] > 0


# ── the CI gate ───────────────────────────────────────────────────────────

def test_strict_quality_fails_the_build(tmp_path):
    from mkdocs.exceptions import Abort

    with pytest.raises(Abort, match="quality gate"):
        build_site(tmp_path, "```ontoink\nsource: onto.ttl\n```\n", plugin_options={
            "strict_quality": True,
            "quality_gate": {"min_score": 100},
        })


def test_quality_gate_passes_when_thresholds_are_generous(tmp_path):
    site = build_site(tmp_path, "```ontoink\nsource: onto.ttl\n```\n", plugin_options={
        "strict_quality": True,
        "quality_gate": {"min_score": 0, "max_violations": 99},
    })
    assert (site / "ontoink-report.json").is_file()


def test_failing_competency_question_trips_the_gate(tmp_path):
    from mkdocs.exceptions import Abort

    with pytest.raises(Abort, match="competency question"):
        build_site(tmp_path, CQ_PAGE, plugin_options={"strict_quality": True})


# ── helpers ───────────────────────────────────────────────────────────────

def _graph_payload(html: str) -> dict:
    import base64
    import re

    match = re.search(r'data-ontoink-graph="([^"]+)"', html)
    assert match, "no ontoink payload in the built page"
    return json.loads(base64.b64decode(match.group(1)).decode("utf-8"))
