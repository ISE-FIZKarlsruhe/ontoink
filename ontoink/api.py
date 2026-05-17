"""Optional HTTP API for ontoink.

Provides /reason and /validate endpoints over RDF/Turtle input. Used by the
production Docker image when ``ONTOINK_MODE=api``. Lazy-imported so the rest
of ontoink does not require FastAPI.
"""

from __future__ import annotations

import os
from typing import Any, Dict, Optional

try:
    from fastapi import FastAPI, HTTPException
    from fastapi.staticfiles import StaticFiles
    from pydantic import BaseModel
except ImportError as exc:
    raise ImportError(
        "FastAPI is required for ontoink.api. Install with `pip install ontoink[api]` "
        "or use the production Docker image."
    ) from exc

from rdflib import Graph

from .ttl_parser import _run_reasoning, _extract_namespaces


app = FastAPI(title="ontoink", version="0.6.0", description="OWL reasoning & SHACL validation")


# Cross-origin isolation headers — enable SharedArrayBuffer (required by the
# browser WASM Konclude reasoner when the playground is served from this host).
#
# COEP=credentialless (rather than require-corp) lets us load Google Fonts and
# other cross-origin assets that don't set Cross-Origin-Resource-Policy headers.
# It still grants `crossOriginIsolated`, which is the only thing the WASM
# reasoner needs. Supported in Chrome 96+, Edge 96+, Firefox 119+. Safari users
# can fall back to the Server reasoner option (the dropdown handles this).
@app.middleware("http")
async def add_coop_coep(request, call_next):
    response = await call_next(request)
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Cross-Origin-Embedder-Policy"] = "credentialless"
    response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"
    return response


class TtlRequest(BaseModel):
    ttl: str
    shacl: Optional[str] = None
    # Optional per-request override of ONTOINK_REASONER. Valid values:
    # auto | owlready2 | konclude | konclude-wasm | owlrl | none
    reasoner: Optional[str] = None


@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "reasoner": os.environ.get("ONTOINK_REASONER", "auto"),
        "version": "0.6.0",
    }


@app.post("/reason")
def reason(req: TtlRequest) -> Dict[str, Any]:
    import time, json, uuid
    g = Graph()
    try:
        g.parse(data=req.ttl, format="turtle")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid TTL: {exc}") from exc

    namespaces = _extract_namespaces(g, req.ttl)
    # If the caller specified a reasoner, scope it to this request only
    prev = os.environ.get("ONTOINK_REASONER")
    started = time.time()
    try:
        if req.reasoner:
            os.environ["ONTOINK_REASONER"] = req.reasoner
        inferred = _run_reasoning(g, namespaces)
    finally:
        if req.reasoner:
            if prev is None:
                os.environ.pop("ONTOINK_REASONER", None)
            else:
                os.environ["ONTOINK_REASONER"] = prev
    elapsed_ms = int((time.time() - started) * 1000)
    chosen = req.reasoner or os.environ.get("ONTOINK_REASONER", "auto")
    result = {"inferred": inferred, "count": len(inferred), "reasoner": chosen, "elapsed_ms": elapsed_ms}

    # Persist input + result + log to the mounted output dir, if configured.
    out_dir = os.environ.get("ONTOINK_OUTPUT_DIR")
    if out_dir and os.path.isdir(out_dir):
        run_id = time.strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:8]
        run_path = os.path.join(out_dir, run_id)
        os.makedirs(run_path, exist_ok=True)
        try:
            with open(os.path.join(run_path, "input.ttl"), "w", encoding="utf-8") as f:
                f.write(req.ttl)
            if req.shacl:
                with open(os.path.join(run_path, "shapes.ttl"), "w", encoding="utf-8") as f:
                    f.write(req.shacl)
            with open(os.path.join(run_path, "inferences.json"), "w", encoding="utf-8") as f:
                json.dump(result, f, indent=2)
            # Also emit N-Triples for easy reuse
            with open(os.path.join(run_path, "inferences.nt"), "w", encoding="utf-8") as f:
                for t in inferred:
                    s = f"<{t['s']}>" if t['s'].startswith("http") else f"_:{t['s']}"
                    p = f"<{t['p']}>"
                    o = (
                        f'"{t["o"]}"' if t.get("isLiteral") else
                        (f"<{t['o']}>" if t['o'].startswith("http") else f"_:{t['o']}")
                    )
                    f.write(f"{s} {p} {o} .\n")
            result["saved_to"] = run_id
        except OSError:
            pass  # Persistence is best-effort

    return result


@app.post("/validate")
def validate(req: TtlRequest) -> Dict[str, Any]:
    if not req.shacl:
        raise HTTPException(status_code=400, detail="SHACL shapes required")

    try:
        import pyshacl
    except ImportError as exc:
        raise HTTPException(status_code=500, detail="pyshacl not installed") from exc

    data_g = Graph()
    shacl_g = Graph()
    try:
        data_g.parse(data=req.ttl, format="turtle")
        shacl_g.parse(data=req.shacl, format="turtle")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid TTL: {exc}") from exc

    conforms, report_g, report_text = pyshacl.validate(
        data_g, shacl_graph=shacl_g, inference="rdfs", abort_on_first=False,
    )
    return {"conforms": conforms, "report": report_text}


# Optionally serve a pre-built MkDocs site at the root path.
# When ONTOINK_DOCS_SITE is set to a directory, the API mounts those files at /.
# This lets a single container expose the playground + the /reason endpoint
# on the same origin (so the playground's "Server" reasoner dropdown works).
_docs_site = os.environ.get("ONTOINK_DOCS_SITE")
if _docs_site and os.path.isdir(_docs_site):
    app.mount("/", StaticFiles(directory=_docs_site, html=True), name="docs")
