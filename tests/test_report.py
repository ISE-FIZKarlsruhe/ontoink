"""Tests for the build-level quality report, badges and CI gate."""

from __future__ import annotations

import json
import xml.etree.ElementTree as ET

from ontoink import report


def _fence(smells=None, validation=None, consistency="consistent", drift=None):
    data = {
        "smells": smells or [],
        "validation": validation,
        "consistency": {"status": consistency},
        "metrics": {"classCount": 4, "shaclCoveredClasses": 1},
    }
    if drift is not None:
        data["shape_drift"] = drift
    return report.summarize_fence("g0", {"source": "a.ttl", "shape": "s.ttl"}, data)


def test_score_matches_the_ontosniff_page_formula():
    """100 - 20/error - 10/warning - 3/info, floored at zero."""
    smells = [{"severity": "error"}, {"severity": "warning"}, {"severity": "info"}]
    assert report.score_smells(smells)["score"] == 100 - 20 - 10 - 3


def test_score_never_goes_negative():
    assert report.score_smells([{"severity": "error"}] * 20)["score"] == 0


def test_clean_ontology_scores_100():
    assert report.score_smells([])["score"] == 100


def test_unknown_severity_counts_as_info():
    scored = report.score_smells([{"severity": "catastrophic"}])
    assert scored["info"] == 1 and scored["score"] == 97


def test_missing_shapes_are_reported_as_not_run():
    row = _fence(validation=None)
    assert row["validation"]["status"] == "not-run"


def test_conformance_and_violation_counts_are_carried():
    row = _fence(validation={"conforms": False, "violations": [1, 2, 3], "inference": "none"})
    assert row["validation"]["status"] == "violations"
    assert row["validation"]["violations"] == 3


def test_summary_reports_the_worst_score_not_the_average():
    rows = [
        _fence(smells=[{"severity": "info"}]),                        # 97
        _fence(smells=[{"severity": "error"}, {"severity": "info"}]),  # 77
    ]
    summary = report.build_summary(rows)
    # A gate should trip on the worst page, not be rescued by good ones.
    assert summary["minScore"] == 77
    assert summary["meanScore"] == 87


def test_summary_conformance_is_unknown_when_nothing_was_validated():
    """No shapes anywhere must not read as "everything conforms"."""
    summary = report.build_summary([_fence(validation=None)])
    assert summary["conforms"] is None


def test_summary_conforms_only_when_every_validated_graph_does():
    ok = {"conforms": True, "violations": [], "inference": "none"}
    bad = {"conforms": False, "violations": [1], "inference": "none"}
    assert report.build_summary([_fence(validation=ok)])["conforms"] is True
    assert report.build_summary([_fence(validation=ok), _fence(validation=bad)])["conforms"] is False


def test_summary_counts_drift_findings():
    drift = {"missing": [1, 2], "stale": [3], "uncovered_classes": []}
    assert report.build_summary([_fence(drift=drift)])["shapeDrift"] == 3


# ── badges ────────────────────────────────────────────────────────────────

def test_badges_are_wellformed_standalone_svg():
    summary = report.build_summary([_fence(smells=[{"severity": "warning"}])])
    for name, svg in report.badges_for(summary).items():
        root = ET.fromstring(svg)           # must parse as XML
        assert root.tag.endswith("svg")
        assert "http" not in svg or "w3.org" in svg, "badges must not call out to a badge service"


def test_badge_text_is_escaped():
    svg = report.render_badge("a<b", 'c&"d', "#000")
    ET.fromstring(svg)
    assert "&lt;" in svg and "&amp;" in svg


def test_badge_colour_tracks_the_score():
    green = report.badges_for({"minScore": 95})["ontosniff.svg"]
    red = report.badges_for({"minScore": 10})["ontosniff.svg"]
    assert green != red


def test_shacl_badge_distinguishes_not_validated_from_conforming():
    unknown = report.badges_for({"conforms": None})["shacl.svg"]
    passing = report.badges_for({"conforms": True})["shacl.svg"]
    assert "not validated" in unknown
    assert "conforms" in passing


# ── artefacts + gate ──────────────────────────────────────────────────────

def test_write_report_emits_json_and_badges(tmp_path):
    rows = [_fence(smells=[{"severity": "info"}])]
    summary = report.build_summary(rows)
    report.write_report(str(tmp_path), rows, summary)

    payload = json.loads((tmp_path / "ontoink-report.json").read_text(encoding="utf-8"))
    assert payload["summary"]["minScore"] == 97
    assert payload["graphs"][0]["source"] == "a.ttl"
    assert "ontoink" in payload
    assert (tmp_path / "badges" / "ontosniff.svg").is_file()


def test_extra_sections_reach_the_written_file(tmp_path):
    """Competency-question detail is passed in, not attached to the return value.

    Setting it on the returned dict would be too late — the file is already on
    disk by then, so the detail would silently never be published.
    """
    rows = [_fence()]
    cq = [{"fence_id": "cq-0", "total": 2, "passed": 1, "failed": 1, "questions": []}]
    report.write_report(str(tmp_path), rows, report.build_summary(rows),
                        extra={"competencyQuestions": cq})

    payload = json.loads((tmp_path / "ontoink-report.json").read_text(encoding="utf-8"))
    assert payload["competencyQuestions"][0]["failed"] == 1


def test_quality_gate_passes_when_thresholds_are_met():
    summary = {"minScore": 90, "violations": 0, "inconsistent": 0, "shapeDrift": 0}
    assert report.check_thresholds(summary, {"min_score": 80, "max_violations": 0}) == []


def test_quality_gate_reports_each_breach():
    summary = {"minScore": 40, "violations": 5, "inconsistent": 1, "shapeDrift": 9}
    problems = report.check_thresholds(summary, {
        "min_score": 80, "max_violations": 0,
        "require_consistent": True, "max_shape_drift": 2,
    })
    assert len(problems) == 4
    assert any("40" in p for p in problems)


def test_empty_gate_config_never_fails():
    assert report.check_thresholds({"minScore": 0, "violations": 99}, {}) == []
