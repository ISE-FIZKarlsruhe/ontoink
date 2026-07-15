#!/usr/bin/env python3
"""Build a single self-contained OntoInk bundle for embedding into any HTML page
under a strict CSP (script-src 'self') — no CDN, no inline handlers.

Concatenates the vendored third-party libs + the ontoink runtime into one JS
file and the third-party + ontoink CSS into one CSS file, written to ``dist/``:

    dist/ontoink.embed.js     (cytoscape + dagre + cytoscape-dagre +
                               cytoscape-svg + codemirror + turtle mode +
                               ontoink-dsl.js + ontoink.js)
    dist/ontoink.embed.css    (codemirror.min.css + ontoink.css)

A consumer drops these two files next to their page and calls
``ontoink.embed(el, {ttl, shape, layout})``. Because ontoink.js now wires its
handlers via data-oi-on* attributes (see the CSP-safe shim), the whole thing
runs with no 'unsafe-inline' and no external requests.

Usage:  python scripts/build_embed_bundle.py
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "ontoink" / "resources"
VENDOR = RES / "vendor"
DIST = ROOT / "dist"

# Load order matters: cytoscape before its extensions; dagre before
# cytoscape-dagre; codemirror before its turtle mode; the ontoink DSL before
# ontoink.js (it sets window.ontoinkDsl, read by the live editor); ontoink.js
# last so it can see every global.
JS_PARTS = [
    VENDOR / "cytoscape.min.js",
    VENDOR / "dagre.min.js",
    VENDOR / "cytoscape-dagre.js",
    VENDOR / "cytoscape-svg.min.js",
    VENDOR / "codemirror.min.js",
    VENDOR / "codemirror-turtle.min.js",
    RES / "ontoink-dsl.js",
    RES / "ontoink.js",
]

CSS_PARTS = [
    VENDOR / "codemirror.min.css",
    RES / "ontoink.css",
]


def _concat(parts: list[Path], sep: str) -> str:
    chunks = []
    for p in parts:
        if not p.exists():
            raise SystemExit(f"missing bundle input: {p}")
        chunks.append(f"/* ===== {p.name} ===== */\n{p.read_text(encoding='utf-8')}")
    return sep.join(chunks)


def main() -> None:
    DIST.mkdir(exist_ok=True)
    # ";\n" between JS parts guards against a minified file lacking a trailing
    # semicolon running into the next file's leading token.
    js = _concat(JS_PARTS, "\n;\n")
    css = _concat(CSS_PARTS, "\n")
    (DIST / "ontoink.embed.js").write_text(js, encoding="utf-8")
    (DIST / "ontoink.embed.css").write_text(css, encoding="utf-8")
    print(f"wrote {DIST / 'ontoink.embed.js'}  ({len(js):,} bytes)")
    print(f"wrote {DIST / 'ontoink.embed.css'} ({len(css):,} bytes)")


if __name__ == "__main__":
    main()
