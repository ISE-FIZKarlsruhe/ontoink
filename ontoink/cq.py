"""Competency questions as an executable fence.

A competency question is the requirement an ontology is built to satisfy
("which processes produced this sample?"). They are normally written in prose
in a paper or a wiki, drift away from the ontology, and are never checked. This
fence pairs each question with the SPARQL that answers it and an expectation,
runs them at build time, and renders red/green cards next to the diagram.

    ```ontoink-cq
    source: ontology/mwo.ttl
    reasoning: true
    questions:
      - question: Every sample has a material.
        ask: |
          ASK { ?s a ex:Sample . FILTER NOT EXISTS { ?s ex:material ?m } }
        expect: false
      - question: Which processes exist?
        query: |
          SELECT ?p WHERE { ?p a ex:Process }
        min_rows: 3
    ```

Failures are reported through the ``mkdocs.plugins.ontoink`` logger, so
``mkdocs build --strict`` turns them into a build failure — the CI gate. They do
*not* raise from the fence handler: pymdownx catches formatter exceptions and
silently falls back to rendering the block as plain text, so an exception here
would lose the diagnostics instead of failing the build.
"""

from __future__ import annotations

import html
import logging
import traceback
from pathlib import Path
from typing import Any, Dict, List

import yaml
from rdflib import Graph

log = logging.getLogger("mkdocs.plugins.ontoink")

_cq_counter = 0
_cq_rows: List[dict] = []


def reset_cq_state():
    global _cq_counter
    _cq_counter = 0
    _cq_rows.clear()


def get_cq_rows() -> List[dict]:
    """Per-fence competency-question results collected during this build."""
    return list(_cq_rows)


def _esc(text: Any) -> str:
    return html.escape(str(text if text is not None else ""), quote=True)


def _evaluate(graph: Graph, spec: dict) -> dict:
    """Run one question and decide whether it passed."""
    question = str(spec.get("question") or spec.get("q") or "Untitled question")
    query = spec.get("ask") or spec.get("query") or spec.get("sparql")
    result: Dict[str, Any] = {
        "question": question,
        "query": str(query or "").strip(),
        "note": str(spec.get("note") or ""),
    }

    if not query:
        result.update(passed=False, detail="No `ask:` or `query:` given for this question.")
        return result

    try:
        answer = graph.query(str(query))
    except Exception as exc:
        result.update(passed=False, detail=f"Query failed — {type(exc).__name__}: {exc}")
        return result

    if answer.type == "ASK":
        actual = bool(answer.askAnswer)
        expected = spec.get("expect", True)
        result.update(
            kind="ask",
            actual=actual,
            expected=bool(expected),
            passed=actual is bool(expected),
            detail=f"ASK returned {str(actual).lower()}, expected {str(bool(expected)).lower()}",
        )
        return result

    rows = list(answer)
    variables = [str(v) for v in (answer.vars or [])]
    result.update(kind="select", rowCount=len(rows), variables=variables)
    result["rows"] = [
        {str(var): (str(row[var]) if row[var] is not None else "") for var in (answer.vars or [])}
        for row in rows[:20]
    ]
    result["iris"] = sorted({
        str(value) for row in rows for value in row
        if value is not None and str(value).startswith("http")
    })[:200]

    min_rows = spec.get("min_rows")
    max_rows = spec.get("max_rows")
    exact = spec.get("expect_rows")

    problems = []
    if exact is not None and len(rows) != int(exact):
        problems.append(f"expected exactly {exact} row(s)")
    if min_rows is not None and len(rows) < int(min_rows):
        problems.append(f"expected at least {min_rows} row(s)")
    if max_rows is not None and len(rows) > int(max_rows):
        problems.append(f"expected at most {max_rows} row(s)")
    if exact is None and min_rows is None and max_rows is None and not rows:
        # With no explicit expectation, "the question can be answered at all"
        # is the only sensible default — an empty result means it cannot.
        problems.append("expected at least one row")

    result["passed"] = not problems
    result["detail"] = (
        f"{len(rows)} row(s) returned" if not problems
        else f"{len(rows)} row(s) returned; " + ", ".join(problems)
    )
    return result


def _render_card(result: dict, graph_target: str) -> str:
    state = "pass" if result["passed"] else "fail"
    mark = "&#10003;" if result["passed"] else "&#10007;"

    body = [
        f'<div class="ov-cq-card ov-cq-{state}">',
        f'  <div class="ov-cq-head">',
        f'    <span class="ov-cq-mark" aria-hidden="true">{mark}</span>',
        f'    <span class="ov-cq-q">{_esc(result["question"])}</span>',
        f'    <span class="ov-cq-detail">{_esc(result["detail"])}</span>',
        f'  </div>',
    ]
    if result.get("note"):
        body.append(f'  <p class="ov-cq-note">{_esc(result["note"])}</p>')

    if result.get("query"):
        body.append(
            '  <details class="ov-cq-details"><summary>Query</summary>'
            f'<pre class="ov-cq-query"><code>{_esc(result["query"])}</code></pre></details>'
        )

    rows = result.get("rows") or []
    if rows:
        variables = result.get("variables") or list(rows[0])
        head = "".join(f"<th>{_esc(v)}</th>" for v in variables)
        cells = "".join(
            "<tr>" + "".join(f"<td>{_esc(row.get(v, ''))}</td>" for v in variables) + "</tr>"
            for row in rows
        )
        more = ""
        if result.get("rowCount", 0) > len(rows):
            more = f'<p class="ov-cq-note">Showing {len(rows)} of {result["rowCount"]} rows.</p>'
        body.append(
            '  <details class="ov-cq-details"><summary>Results</summary>'
            f'<div class="ov-cq-tablewrap"><table class="ov-cq-table">'
            f'<thead><tr>{head}</tr></thead><tbody>{cells}</tbody></table></div>{more}</details>'
        )

    if result.get("iris"):
        # Highlight the bound terms on a diagram. Without an explicit `graph:`
        # the target is resolved from the clicked button at click time, because
        # container ids come from a build-wide counter and a page cannot know
        # its own diagram's id.
        payload = ",".join(f"&quot;{_esc(iri)}&quot;" for iri in result["iris"][:60])
        call = (
            f"ontoink.selectIris('{_esc(graph_target)}',[{payload}])"
            if graph_target
            else f"ontoink.selectIrisNearby(this,[{payload}])"
        )
        body.append(
            f'  <button class="ov-btn ov-cq-show" data-oi-onclick="{call}">'
            f'Show on graph</button>'
        )

    body.append("</div>")
    return "\n".join(body)


def render_ontoink_cq(source, language, class_name, options, md, **kwargs):
    """Custom fence handler for ```ontoink-cq blocks."""
    global _cq_counter
    fence_id = f"ontoink-cq-{_cq_counter}"
    _cq_counter += 1

    try:
        config = yaml.safe_load(source) or {}
        docs_dir = getattr(render_ontoink_cq, "docs_dir", ".")
        data_path = Path(docs_dir) / config["source"]

        graph = Graph()
        graph.parse(str(data_path), format="turtle")

        # Entailment-aware questions: merge inferred triples before querying, so
        # a CQ can assert what the ontology *entails* and not merely what it
        # states. Off by default because reasoning is the expensive part of a
        # build and most questions do not need it.
        if config.get("reasoning"):
            from .ttl_parser import _extract_namespaces, _run_reasoning

            namespaces = _extract_namespaces(graph, data_path.read_text(encoding="utf-8"))
            for triple in _run_reasoning(graph, namespaces, reasoner=config.get("reasoner")):
                try:
                    from rdflib import Literal, URIRef

                    subject = URIRef(triple["s"])
                    predicate = URIRef(triple["p"])
                    obj = Literal(triple["o"]) if triple.get("isLiteral") else URIRef(triple["o"])
                    graph.add((subject, predicate, obj))
                except Exception:
                    continue

        questions = config.get("questions") or []
        results = [_evaluate(graph, q) for q in questions if isinstance(q, dict)]
        passed = sum(1 for r in results if r["passed"])
        failed = len(results) - passed

        source_name = str(config.get("source"))
        _cq_rows.append({
            "fence_id": fence_id,
            "source": source_name,
            "total": len(results),
            "passed": passed,
            "failed": failed,
            "questions": [
                {"question": r["question"], "passed": r["passed"], "detail": r["detail"]}
                for r in results
            ],
        })

        for result in results:
            if not result["passed"]:
                # ASCII only: this goes to whatever console the build runs on,
                # and a cp1252 terminal raises UnicodeEncodeError on an em dash.
                log.warning(
                    "ontoink: competency question failed in %s - %s (%s)",
                    source_name, result["question"], result["detail"],
                )

        graph_target = str(config.get("graph") or "")
        cards = "\n".join(_render_card(r, graph_target) for r in results)
        state = "pass" if not failed else "fail"
        title = _esc(config.get("title") or "Competency questions")

        return (
            f'<div id="{fence_id}" class="ov-cq-block ov-cq-block-{state}">\n'
            f'  <div class="ov-cq-summary">\n'
            f'    <span class="ov-cq-title">{title}</span>\n'
            f'    <span class="ov-cq-counts">{passed} passed'
            f'{f", {failed} failed" if failed else ""} · {source_name}</span>\n'
            f'  </div>\n'
            f'{cards}\n'
            f'</div>\n'
        )

    except Exception as exc:
        tb = traceback.format_exc()
        log.warning("ontoink: competency-question fence failed — %s: %s", type(exc).__name__, exc)
        return (
            f'<div class="ov-error"><strong>Error rendering ontoink-cq:</strong><br>'
            f'<code>{_esc(exc)}</code>'
            f'<pre style="font-size:11px;overflow:auto;max-height:200px;">{_esc(tb)}</pre></div>'
        )
