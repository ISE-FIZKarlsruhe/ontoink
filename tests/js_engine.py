"""Lift the shape-induction engine out of ontoink.js so Node can run it.

`ontoink.js` is one IIFE that assumes a browser and a DOM, so it cannot be
required wholesale from a test. Two suites need the induction engine out of it:
`test_recommend_parity.py` compares it against the Python inducer, and
`test_shacl_editor_page.py` runs the SHACL Editor page's own glue code on top of
it.

Both used to carry their own copy of the extraction list. Adding `_METHOD_SPECS`
to the engine broke the second suite with `_METHOD_SPECS is not defined` —
five failures with nothing wrong in the code under test, only in a list that
had been updated in one place and not the other. One list, here, so that cannot
happen again.
"""

from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path

ONTOINK_JS = Path(__file__).resolve().parents[1] / "ontoink" / "resources" / "ontoink.js"

#: Constants the engine closes over, which live at IIFE scope rather than in any
#: single function.
ENGINE_CONSTANTS = "\n".join([
    'var _RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";',
    'var _RDFS = "http://www.w3.org/2000/01/rdf-schema#";',
    'var _OWL = "http://www.w3.org/2002/07/owl#";',
    'var _XSD = "http://www.w3.org/2001/XMLSchema#";',
    'var _SH_IRI = "http://www.w3.org/ns/shacl#IRI";',
    'var _META_NS = [_OWL, _RDF_TYPE.substring(0, _RDF_TYPE.lastIndexOf("#") + 1),'
    ' _RDFS, "http://www.w3.org/ns/shacl#"];',
    'var _NUMERIC_KINDS = {minCount:1,maxCount:1,minLength:1,maxLength:1,'
    'minInclusive:1,maxInclusive:1};',
    'var _IRI_KINDS = {datatype:1,"class":1,nodeKind:1};',
])

#: Object literals declared with `var`, which `_extract_function` cannot reach.
ENGINE_OBJECTS = ["_METHOD_SPECS"]

ENGINE_FUNCTIONS = [
    "parseTtlMinimal", "tokenize", "_shortIri", "_indexTriples", "_isMeta",
    "_isDatatypeIri", "_isLiteralTerm", "_literalDatatype",
    "_instantiatedClasses", "_declaredClasses", "_profileClass",
    "_constraint", "_constraintKey", "_mergeConstraints", "_addConstraint",
    "_induceBaseline", "_induceAstrea", "_shapeIri", "_formatValue",
    "_emitShape", "_coveredClassesFromTriples", "_labelFor",
    "_coerceParams", "methodCatalogue", "recommendShapes",
]


def _extract_braced(source: str, header: str, name: str) -> str:
    start = source.index(header)
    depth = 0
    for i in range(source.index("{", start), len(source)):
        if source[i] == "{":
            depth += 1
        elif source[i] == "}":
            depth -= 1
            if depth == 0:
                return source[start:i + 1]
    raise AssertionError(f"unbalanced braces while extracting {name}")


def extract_function(source: str, name: str) -> str:
    return _extract_braced(source, f"function {name}(", name)


def extract_var_object(source: str, name: str) -> str:
    """Pull out a `var NAME = { … };` object literal.

    Needed for `_METHOD_SPECS`, which is data rather than a function but is the
    thing most likely to drift from its Python counterpart — a citation
    corrected on one side only is a wrong attribution shown to a reader.
    """
    return _extract_braced(source, f"var {name} = {{", name) + ";"


def build_engine() -> str:
    """The subset of ontoink.js needed to run `recommendShapes` headlessly."""
    source = ONTOINK_JS.read_text(encoding="utf-8")
    return "\n".join(
        [ENGINE_CONSTANTS]
        + [extract_var_object(source, n) for n in ENGINE_OBJECTS]
        + [extract_function(source, n) for n in ENGINE_FUNCTIONS]
    )


def build_panel_renderer() -> str:
    """The engine plus the Shapes panel's method picker.

    The picker is markup-only — it reads the catalogue and emits `data-oi-on*`
    attributes — so it runs without a DOM and can be asserted on directly.
    """
    source = ONTOINK_JS.read_text(encoding="utf-8")
    return "\n".join([
        build_engine(),
        extract_function(source, "esc"),
        extract_function(source, "_oiStr"),
        extract_function(source, "_renderMethodPicker"),
    ])


def run_node(script: str, *args: str) -> subprocess.CompletedProcess:
    """Run a JS snippet under Node, as UTF-8 at both ends.

    Both directions matter on Windows. `node -e <script>` passes the source
    through the console codepage and `text=True` decodes the reply with the ANSI
    codepage — so the moment the engine grew citations containing "Fernández"
    and "García", the script arrived mangled and the reply failed to decode at
    all (the reader thread died, `proc.stdout` came back None, and every test in
    the file failed with an unrelated-looking JSON error). A UTF-8 file and an
    explicit decode keep both ends independent of the machine's codepage.
    """
    fd, path = tempfile.mkstemp(suffix=".js")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(script)
        proc = subprocess.run(["node", path, *args], capture_output=True)
    finally:
        os.unlink(path)
    return subprocess.CompletedProcess(
        proc.args, proc.returncode,
        proc.stdout.decode("utf-8", "replace"),
        proc.stderr.decode("utf-8", "replace"),
    )
