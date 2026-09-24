"""Optional HTTP API for ontoink.

Provides /reason and /validate endpoints over RDF/Turtle input. Used by the
production Docker image when ``ONTOINK_MODE=api``. Lazy-imported so the rest
of ontoink does not require FastAPI.
"""

from __future__ import annotations

import ipaddress
import os
import socket
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional

try:
    from fastapi import FastAPI, HTTPException
    from fastapi.responses import JSONResponse
    from fastapi.staticfiles import StaticFiles
    from pydantic import BaseModel
except ImportError as exc:
    raise ImportError(
        "FastAPI is required for ontoink.api. Install with `pip install ontoink[api]` "
        "or use the production Docker image."
    ) from exc

from rdflib import Graph

from . import __version__
from .ttl_parser import _run_reasoning, _extract_namespaces


app = FastAPI(title="ontoink", version=__version__, description="OWL reasoning & SHACL validation")


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


class RecommendRequest(BaseModel):
    ttl: str
    # Existing shapes, so the recommender can skip classes already covered.
    shacl: Optional[str] = None
    method: str = "auto"          # auto | baseline | astrea | shexer
    min_confidence: float = 0.0
    only_uncovered: bool = True
    max_shapes: int = 50
    # Hyperparameters for the chosen method; for `auto`, keyed by sub-method.
    # Declared knobs, defaults and ranges are in the /recommend-methods
    # response. Unknown keys are ignored rather than rejected.
    params: Optional[Dict[str, Any]] = None


class TtlRequest(BaseModel):
    ttl: str
    shacl: Optional[str] = None
    # Optional per-request override of ONTOINK_REASONER. Valid values:
    # auto | owlready2 | konclude | konclude-wasm | owlrl | none
    reasoner: Optional[str] = None
    # Optional pySHACL inference mode for /validate. Defaults to
    # shacl_validator.DEFAULT_INFERENCE so server, build-time and browser
    # validation agree; "rdfs"/"owlrl" opt into entailment-aware validation
    # that the browser panel cannot reproduce.
    inference: Optional[str] = None


@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "reasoner": os.environ.get("ONTOINK_REASONER", "auto"),
        "version": __version__,
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
    # Per-request reasoner override is passed as an argument, never through
    # os.environ: the environment is process-global, so two concurrent requests
    # choosing different backends would otherwise race (one could observe the
    # other's setting, or its restore, mid-run).
    started = time.time()
    inferred = _run_reasoning(g, namespaces, reasoner=req.reasoner)
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

    from .shacl_validator import validate_text

    try:
        # One shared code path with build-time validation, so the same
        # data+shapes cannot conform here and fail in CI (or vice versa).
        result = validate_text(req.ttl, req.shacl, inference=req.inference)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid TTL: {exc}") from exc

    if result["conforms"] is None:
        raise HTTPException(status_code=500, detail="pyshacl not installed")
    return result


@app.post("/recommend-shapes")
def recommend_shapes(req: RecommendRequest) -> Dict[str, Any]:
    """Induce SHACL shapes for a graph.

    The same engine the fence, the SHACL editor page (via its JS port) and the
    graph context menu use — this endpoint exposes it to server-mode clients.
    """
    from .recommend import METHODS, recommend_payload

    if req.method not in ("auto",) + tuple(METHODS):
        raise HTTPException(
            status_code=400,
            detail=f"unknown method {req.method!r}; expected auto, "
                   + ", ".join(sorted(METHODS)),
        )

    data_graph = Graph()
    try:
        data_graph.parse(data=req.ttl, format="turtle")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid TTL: {exc}") from exc

    shape_graph = None
    if req.shacl:
        shape_graph = Graph()
        try:
            shape_graph.parse(data=req.shacl, format="turtle")
        except Exception as exc:
            raise HTTPException(
                status_code=400, detail=f"Invalid SHACL: {exc}") from exc

    return recommend_payload(
        data_graph,
        method=req.method,
        min_confidence=req.min_confidence,
        shape_graph=shape_graph,
        only_uncovered=req.only_uncovered,
        max_shapes=req.max_shapes,
        params=req.params,
    )


@app.get("/recommend-methods")
def recommend_methods() -> Dict[str, Any]:
    """The induction methods this server can run, with their knobs and sources.

    Availability is resolved here rather than assumed: sheXer is an optional
    dependency, so a client should ask instead of offering a method that will
    fail.
    """
    from .recommend import method_catalogue

    return {"methods": method_catalogue()}


# ── Ontology dereference proxy ────────────────────────────────────────────
#
# Generic alternative to the client-side _KNOWN_ONTOLOGY_URLS registry in
# ontoink.js. Browsers cannot follow the CORS-less 30x redirects that canonical
# ontology IRIs use (purl.obolibrary.org, nfdi.fiz-karlsruhe.de, …), so the
# playground hard-codes per-namespace mirror URLs that rot and need version
# bumps. The server has no CORS constraint: it can dereference *any* IRI with
# content negotiation and relay the RDF back with permissive CORS. The
# playground prefers this endpoint whenever a same-origin server is reachable
# and falls back to the registry only on serverless (GitHub Pages) deploys.

_DEREF_ACCEPT = (
    "text/turtle, application/rdf+xml;q=0.9, application/ld+json;q=0.8, "
    "application/n-triples;q=0.5, */*;q=0.1"
)
_DEREF_MAX_BYTES = 25 * 1024 * 1024
_DEREF_MAX_REDIRECTS = 6
_DEREF_TIMEOUT = 20


class _DerefError(Exception):
    def __init__(self, message: str, status: int = 502) -> None:
        super().__init__(message)
        self.status = status


def _deref_host_is_safe(url: str) -> bool:
    """SSRF guard: reject non-public hosts (loopback, private, link-local, …).

    Every redirect hop is re-checked, so a public URL cannot bounce to an
    internal address (e.g. cloud metadata at 169.254.169.254).
    """
    parts = urllib.parse.urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        return False
    try:
        port = parts.port or (443 if parts.scheme == "https" else 80)
        infos = socket.getaddrinfo(parts.hostname, port)
    except (socket.gaierror, ValueError):
        return False
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if (ip.is_private or ip.is_loopback or ip.is_link_local
                or ip.is_reserved or ip.is_multicast or ip.is_unspecified):
            return False
    return True


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Disable urllib's automatic redirect following so we can validate hops."""

    def redirect_request(self, *args, **kwargs):  # type: ignore[override]
        return None


def _deref_fetch(iri: str):
    """Fetch `iri` with conneg, following redirects manually with per-hop checks.

    Returns (body_text, content_type, final_url).
    """
    current = iri
    opener = urllib.request.build_opener(_NoRedirect)
    for _ in range(_DEREF_MAX_REDIRECTS + 1):
        if not _deref_host_is_safe(current):
            raise _DerefError(f"refused to fetch non-public URL: {current}", status=400)
        req = urllib.request.Request(current, headers={
            "Accept": _DEREF_ACCEPT,
            "User-Agent": f"ontoink-deref/{__version__} (+https://github.com/ISE-FIZKarlsruhe/ontoink)",
        })
        try:
            resp = opener.open(req, timeout=_DEREF_TIMEOUT)
        except urllib.error.HTTPError as exc:
            loc = exc.headers.get("Location") if exc.headers else None
            if exc.code in (301, 302, 303, 307, 308) and loc:
                current = urllib.parse.urljoin(current, loc)
                continue
            raise _DerefError(f"upstream returned HTTP {exc.code}", status=502) from exc
        except (urllib.error.URLError, TimeoutError, ValueError) as exc:
            raise _DerefError(f"fetch failed: {exc}", status=502) from exc
        with resp:
            raw = resp.read(_DEREF_MAX_BYTES + 1)
            if len(raw) > _DEREF_MAX_BYTES:
                raise _DerefError("ontology exceeds size limit", status=413)
            ctype = resp.headers.get("Content-Type", "") or ""
            final_url = resp.geturl() or current
        return raw.decode("utf-8", errors="replace"), ctype, final_url
    raise _DerefError("too many redirects", status=502)


def _detect_rdf_format(ctype: str, body: str) -> str:
    """Mirror the client's format sniffing (Content-Type first, then body)."""
    c = (ctype or "").lower()
    head = body.lstrip()[:1]
    if "rdf+xml" in c or "/xml" in c or (head == "<" and "rdf:RDF" in body):
        return "rdfxml"
    if "json" in c or head in ("{", "["):
        return "jsonld"
    return "turtle"


@app.get("/deref")
def deref(iri: str):
    """Dereference an ontology IRI server-side and relay the RDF.

    Returns ``{body, format, url, contentType}`` so the playground can reuse its
    existing client-side parsers (parseRdfResponse). Read-only GET; SSRF-guarded.
    """
    try:
        body, ctype, final_url = _deref_fetch(iri)
    except _DerefError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc

    return JSONResponse(
        {"body": body, "format": _detect_rdf_format(ctype, body),
         "url": final_url, "contentType": ctype},
        headers={"Access-Control-Allow-Origin": "*"},
    )


# Optionally serve a pre-built MkDocs site at the root path.
# When ONTOINK_DOCS_SITE is set to a directory, the API mounts those files at /.
# This lets a single container expose the playground + the /reason endpoint
# on the same origin (so the playground's "Server" reasoner dropdown works).
_docs_site = os.environ.get("ONTOINK_DOCS_SITE")
if _docs_site and os.path.isdir(_docs_site):
    app.mount("/", StaticFiles(directory=_docs_site, html=True), name="docs")
