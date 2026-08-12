"""Build-level quality report: aggregation, scoring and SVG badges.

Every ontoink fence already computes the numbers a repository would want to
gate on — SHACL conformance, the OntoSniff smell list, ontology consistency,
coverage metrics. Until now they only ever reached the rendered page, so a
regression could merge without anything failing. This module turns them into
two repo-level artefacts written by ``OntoinkPlugin.on_post_build``:

* ``<site>/ontoink-report.json`` — machine-readable, one entry per fence plus a
  build-level summary. What CI reads.
* ``<site>/badges/*.svg`` — self-contained shields-style badges for READMEs. No
  request to shields.io: badge services are an external dependency that breaks
  offline builds and leaks repository names, and ontoink already refuses CDNs
  for its JavaScript for the same reason.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

# Severity weights for the 0-100 quality score.
#
# Ported verbatim from the OntoSniff page (demo/docs/ontosniff.md), which had
# the only implementation of this formula. Keeping the number identical matters:
# a build badge that disagreed with the score the same ontology shows in the
# browser would make both untrustworthy.
_SEVERITY_WEIGHTS = {"error": 20, "warning": 10, "info": 3}


def score_smells(smells: Optional[List[dict]]) -> Dict[str, Any]:
    """Summarise a smell list into counts plus the 0-100 quality score."""
    smells = smells or []
    counts = {"error": 0, "warning": 0, "info": 0}
    for s in smells:
        sev = str(s.get("severity", "info")).lower()
        counts[sev if sev in counts else "info"] += 1

    penalty = sum(_SEVERITY_WEIGHTS[sev] * n for sev, n in counts.items())
    return {
        "total": len(smells),
        "errors": counts["error"],
        "warnings": counts["warning"],
        "info": counts["info"],
        "score": max(0, 100 - penalty),
    }


def summarize_fence(graph_id: str, config: dict, data: dict) -> dict:
    """Build one report row from a fence's config and its parsed payload."""
    validation = data.get("validation") or {}
    consistency = data.get("consistency") or {}
    metrics = data.get("metrics") or {}
    drift = data.get("shape_drift") or {}
    recommendations = data.get("shape_recommendations") or {}

    row = {
        "graph_id": graph_id,
        "source": config.get("source"),
        "shape": config.get("shape"),
        "smells": score_smells(data.get("smells")),
        "consistency": consistency.get("status", "unknown"),
        "metrics": {
            k: metrics.get(k)
            for k in (
                "classCount", "individualCount", "objectPropertyCount",
                "dataPropertyCount", "subclassAxioms",
                "shaclCoveredClasses", "propsWithoutDomain", "propsWithoutRange",
            )
            if metrics.get(k) is not None
        },
    }

    if data.get("validation") is None:
        # Distinguish "no shapes given" from "validation blew up" — the fence
        # logs a warning in the latter case, and the report should agree.
        row["validation"] = {"status": "not-run", "violations": 0}
    else:
        row["validation"] = {
            "status": (
                "conforms" if validation.get("conforms") is True
                else "violations" if validation.get("conforms") is False
                else "unavailable"
            ),
            "violations": len(validation.get("violations") or []),
            "inference": validation.get("inference"),
        }

    if drift:
        row["shape_drift"] = {
            "missing": len(drift.get("missing") or []),
            "stale": len(drift.get("stale") or []),
            "uncovered": len(drift.get("uncovered_classes") or []),
        }
    if recommendations:
        row["shape_recommendations"] = {
            "shapes": len(recommendations.get("shapes") or []),
            "constraints": len(recommendations.get("constraints") or []),
            "method": recommendations.get("method"),
        }
    return row


def build_summary(rows: List[dict]) -> dict:
    """Aggregate per-fence rows into the build-level summary CI gates on."""
    graded = [r for r in rows if r.get("smells")]
    scores = [r["smells"]["score"] for r in graded]
    violations = sum(r.get("validation", {}).get("violations", 0) for r in rows)
    validated = [r for r in rows if r.get("validation", {}).get("status") in ("conforms", "violations")]
    drift_total = sum(
        r.get("shape_drift", {}).get("missing", 0) + r.get("shape_drift", {}).get("stale", 0)
        for r in rows
    )

    if validated:
        conforms = all(r["validation"]["status"] == "conforms" for r in validated)
    else:
        # No fence declared shapes — "conforms" is unanswered, not True.
        conforms = None

    return {
        "graphs": len(rows),
        "minScore": min(scores) if scores else None,
        "meanScore": round(sum(scores) / len(scores)) if scores else None,
        "violations": violations,
        "conforms": conforms,
        "inconsistent": sum(1 for r in rows if r.get("consistency") == "inconsistent"),
        "smells": {
            "errors": sum(r["smells"]["errors"] for r in graded),
            "warnings": sum(r["smells"]["warnings"] for r in graded),
            "info": sum(r["smells"]["info"] for r in graded),
        },
        "shapeDrift": drift_total,
    }


# ── Badges ────────────────────────────────────────────────────────────────
#
# Hand-rolled flat-style SVG. Widths are estimated from character count rather
# than measured — without a font metrics table the estimate is what keeps the
# label from overflowing its coloured box, and 6.2px/char at 11px DejaVu Sans is
# close enough that the padding absorbs the error.

_GREEN = "#3fa845"
_YELLOW = "#dfb317"
_ORANGE = "#fe7d37"
_RED = "#c1362f"
_GREY = "#9f9f9f"
_LABEL_BG = "#555"


def _text_width(text: str) -> int:
    return int(len(text) * 6.2) + 10


def render_badge(label: str, message: str, color: str) -> str:
    """Return a self-contained flat-style badge SVG."""
    lw, mw = _text_width(label), _text_width(message)
    total = lw + mw

    def esc(t: str) -> str:
        return (t.replace("&", "&amp;").replace("<", "&lt;")
                 .replace(">", "&gt;").replace('"', "&quot;"))

    label_e, message_e = esc(label), esc(message)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{total}" height="20" '
        f'role="img" aria-label="{label_e}: {message_e}">'
        f'<title>{label_e}: {message_e}</title>'
        f'<linearGradient id="s" x2="0" y2="100%">'
        f'<stop offset="0" stop-color="#bbb" stop-opacity=".1"/>'
        f'<stop offset="1" stop-opacity=".1"/></linearGradient>'
        f'<clipPath id="r"><rect width="{total}" height="20" rx="3" fill="#fff"/></clipPath>'
        f'<g clip-path="url(#r)">'
        f'<rect width="{lw}" height="20" fill="{_LABEL_BG}"/>'
        f'<rect x="{lw}" width="{mw}" height="20" fill="{color}"/>'
        f'<rect width="{total}" height="20" fill="url(#s)"/></g>'
        f'<g fill="#fff" text-anchor="middle" '
        f'font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">'
        f'<text x="{lw / 2:.0f}" y="15" fill="#010101" fill-opacity=".3">{label_e}</text>'
        f'<text x="{lw / 2:.0f}" y="14">{label_e}</text>'
        f'<text x="{lw + mw / 2:.0f}" y="15" fill="#010101" fill-opacity=".3">{message_e}</text>'
        f'<text x="{lw + mw / 2:.0f}" y="14">{message_e}</text>'
        f'</g></svg>'
    )


def _score_color(score: Optional[int]) -> str:
    if score is None:
        return _GREY
    if score >= 90:
        return _GREEN
    if score >= 75:
        return _YELLOW
    if score >= 50:
        return _ORANGE
    return _RED


def badges_for(summary: dict) -> Dict[str, str]:
    """Render the badge set for a build summary, keyed by file name."""
    out: Dict[str, str] = {}

    score = summary.get("minScore")
    out["ontosniff.svg"] = render_badge(
        "OntoSniff",
        f"{score}/100" if score is not None else "n/a",
        _score_color(score),
    )

    violations = summary.get("violations", 0)
    conforms = summary.get("conforms")
    if conforms is None:
        out["shacl.svg"] = render_badge("SHACL", "not validated", _GREY)
    elif conforms:
        out["shacl.svg"] = render_badge("SHACL", "conforms", _GREEN)
    else:
        plural = "violation" if violations == 1 else "violations"
        out["shacl.svg"] = render_badge("SHACL", f"{violations} {plural}", _RED)

    inconsistent = summary.get("inconsistent", 0)
    out["consistency.svg"] = render_badge(
        "consistency",
        "consistent" if not inconsistent else f"{inconsistent} inconsistent",
        _GREEN if not inconsistent else _RED,
    )

    if summary.get("shapeDrift"):
        n = summary["shapeDrift"]
        out["shape-drift.svg"] = render_badge(
            "shape drift", f"{n} finding{'' if n == 1 else 's'}", _ORANGE
        )
    return out


def write_report(
    site_dir: str, rows: List[dict], summary: dict, extra: Optional[dict] = None
) -> dict:
    """Write ontoink-report.json + badges/ into the built site.

    ``extra`` is merged into the payload before it is written — that is how the
    competency-question detail gets in. (Setting it on the returned dict would
    be too late: the file is already on disk.)
    """
    site = Path(site_dir)
    site.mkdir(parents=True, exist_ok=True)

    from . import __version__

    payload = {
        "ontoink": __version__,
        "summary": summary,
        "graphs": rows,
    }
    if extra:
        payload.update(extra)
    (site / "ontoink-report.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    badge_dir = site / "badges"
    badge_dir.mkdir(parents=True, exist_ok=True)
    for name, svg in badges_for(summary).items():
        (badge_dir / name).write_text(svg, encoding="utf-8")

    return payload


def check_thresholds(summary: dict, thresholds: dict) -> List[str]:
    """Return human-readable failures for a ``quality_gate:`` config block.

    Empty list means the gate passed. The caller decides whether a failure is a
    warning or a build error.
    """
    problems: List[str] = []
    if not thresholds:
        return problems

    min_score = thresholds.get("min_score")
    if min_score is not None and summary.get("minScore") is not None:
        if summary["minScore"] < min_score:
            problems.append(
                f"OntoSniff score {summary['minScore']} is below the configured "
                f"minimum of {min_score}"
            )

    max_violations = thresholds.get("max_violations")
    if max_violations is not None and summary.get("violations", 0) > max_violations:
        problems.append(
            f"{summary['violations']} SHACL violations exceed the configured "
            f"maximum of {max_violations}"
        )

    if thresholds.get("require_consistent") and summary.get("inconsistent"):
        problems.append(
            f"{summary['inconsistent']} graph(s) are logically inconsistent"
        )

    max_drift = thresholds.get("max_shape_drift")
    if max_drift is not None and summary.get("shapeDrift", 0) > max_drift:
        problems.append(
            f"{summary['shapeDrift']} shape-drift findings exceed the configured "
            f"maximum of {max_drift}"
        )
    return problems
