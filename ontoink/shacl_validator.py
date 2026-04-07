"""SHACL validation wrapper using pySHACL for build-time validation."""

from pathlib import Path
from typing import List, Optional

from rdflib import Graph


def validate_graph(data_path: str, shape_path: str) -> dict:
    """
    Validate RDF data against SHACL shapes using pySHACL.

    Returns:
        {
            "conforms": bool,
            "violations": [
                {
                    "focusNode": str,
                    "path": str,
                    "message": str,
                    "severity": str,
                    "value": str | None,
                }
            ],
            "report": str,  # full text report
        }
    """
    try:
        from pyshacl import validate
    except ImportError:
        return {
            "conforms": None,
            "violations": [],
            "report": "pySHACL not installed. Install with: pip install pyshacl",
        }

    data_graph = Graph()
    data_graph.parse(data_path, format="turtle")

    shapes_graph = Graph()
    shapes_graph.parse(shape_path, format="turtle")

    conforms, results_graph, results_text = validate(
        data_graph,
        shacl_graph=shapes_graph,
        inference="none",
        abort_on_first=False,
    )

    violations = _extract_violations(results_graph)

    return {
        "conforms": conforms,
        "violations": violations,
        "report": results_text,
    }


def _extract_violations(results_graph: Graph) -> List[dict]:
    """Extract structured violation info from SHACL validation results graph."""
    from rdflib.namespace import SH

    violations = []
    SH_NS = SH

    for result in results_graph.subjects(
        predicate=None, object=SH_NS.ValidationResult
    ):
        focus = results_graph.value(result, SH_NS.focusNode)
        path = results_graph.value(result, SH_NS.resultPath)
        message = results_graph.value(result, SH_NS.resultMessage)
        severity = results_graph.value(result, SH_NS.resultSeverity)
        value = results_graph.value(result, SH_NS.value)

        violations.append({
            "focusNode": str(focus) if focus else None,
            "path": str(path) if path else None,
            "message": str(message) if message else None,
            "severity": str(severity) if severity else None,
            "value": str(value) if value else None,
        })

    return violations
