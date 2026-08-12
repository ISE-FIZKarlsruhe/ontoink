"""SHACL validation wrapper using pySHACL for build-time validation."""

from pathlib import Path
from typing import List, Optional

from rdflib import Graph

# Single source of truth for the pySHACL ``inference`` setting.
#
# ontoink validates the same data+shapes in three places: at build time (this
# module), at runtime in the API server (``api.py`` /validate), and in the
# browser (rdf-validate-shacl, inlined by the Edit & Validate panel). The
# browser engine has no inference support at all, so "none" is the only
# setting all three can actually agree on — otherwise the same file could
# conform on the page and fail in CI with nothing on screen explaining why.
# Callers that *want* entailment-aware validation opt in explicitly (fence key
# ``validation_inference:``, or ``inference`` on the API request body) and
# accept that the browser panel cannot reproduce it.
DEFAULT_INFERENCE = "none"


def validate_graph(
    data_path: str, shape_path: str, inference: Optional[str] = None
) -> dict:
    """
    Validate RDF data against SHACL shapes using pySHACL.

    Args:
        data_path: path to the data graph (Turtle).
        shape_path: path to the SHACL shapes graph (Turtle).
        inference: pySHACL inference mode; defaults to ``DEFAULT_INFERENCE``.

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
                    "sourceShape": str | None,
                    "constraintComponent": str | None,
                }
            ],
            "report": str,     # full text report
            "inference": str,  # which mode produced this report
        }
    """
    data_graph = Graph()
    data_graph.parse(data_path, format="turtle")

    shapes_graph = Graph()
    shapes_graph.parse(shape_path, format="turtle")

    return validate_graphs(data_graph, shapes_graph, inference=inference)


def validate_text(
    data_ttl: str, shape_ttl: str, inference: Optional[str] = None
) -> dict:
    """Same contract as :func:`validate_graph`, for in-memory Turtle strings.

    Used by the API server so runtime and build-time validation run the exact
    same code path (and therefore the same inference setting).
    """
    data_graph = Graph()
    data_graph.parse(data=data_ttl, format="turtle")

    shapes_graph = Graph()
    shapes_graph.parse(data=shape_ttl, format="turtle")

    return validate_graphs(data_graph, shapes_graph, inference=inference)


def validate_graphs(
    data_graph: Graph, shapes_graph: Graph, inference: Optional[str] = None
) -> dict:
    """Validate two already-parsed graphs. The shared core of the two helpers."""
    mode = inference or DEFAULT_INFERENCE
    try:
        from pyshacl import validate
    except ImportError:
        return {
            "conforms": None,
            "violations": [],
            "report": "pySHACL not installed. Install with: pip install pyshacl",
            "inference": mode,
        }

    conforms, results_graph, results_text = validate(
        data_graph,
        shacl_graph=shapes_graph,
        inference=mode,
        abort_on_first=False,
    )

    return {
        "conforms": conforms,
        "violations": _extract_violations(results_graph),
        "report": results_text,
        "inference": mode,
    }


def _extract_violations(results_graph: Graph) -> List[dict]:
    """Extract structured violation info from SHACL validation results graph.

    ``sourceShape`` and ``constraintComponent`` are what let a consumer group
    violations by the constraint that produced them rather than by the instance
    that tripped over it — the grouping the shape-fix miner and the build report
    both need ("47 focus nodes all failed *this one* sh:maxCount").
    """
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
        source_shape = results_graph.value(result, SH_NS.sourceShape)
        component = results_graph.value(result, SH_NS.sourceConstraintComponent)

        violations.append({
            "focusNode": str(focus) if focus else None,
            "path": str(path) if path else None,
            "message": str(message) if message else None,
            "severity": str(severity) if severity else None,
            "value": str(value) if value else None,
            "sourceShape": str(source_shape) if source_shape else None,
            "constraintComponent": str(component) if component else None,
        })

    return violations
