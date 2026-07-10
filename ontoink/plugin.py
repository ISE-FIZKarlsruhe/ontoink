"""MkDocs plugin that registers the ontoink custom fence and injects assets."""

import json
from pathlib import Path

from mkdocs.plugins import BasePlugin


class OntoinkPlugin(BasePlugin):

    def on_config(self, config):
        """Register the ontoink custom fence with pymdownx.superfences."""
        from .fence import render_ontoink, reset_counter

        reset_counter()
        render_ontoink.docs_dir = config["docs_dir"]

        fence_entry = {
            "name": "ontoink",
            "class": "ontoink",
            "format": render_ontoink,
        }

        mdx_configs = config.setdefault("mdx_configs", {})
        sf_key = "pymdownx.superfences"
        if sf_key in mdx_configs:
            mdx_configs[sf_key].setdefault("custom_fences", []).append(fence_entry)
        else:
            mdx_configs[sf_key] = {"custom_fences": [fence_entry]}

        return config

    def on_post_page(self, output, page, config):
        """Inject CDN scripts and plugin JS/CSS into pages that use ontoink."""
        # v0.7.4 — Also trigger on the live editor page. The DSL parser
        # lives in a sibling script (`ontoink-dsl.js`) inlined below.
        if (
            "data-ontoink-graph" not in output
            and "ontoink.playground" not in output
            and "ontoink.liveEditor" not in output
        ):
            return output

        resources_dir = Path(__file__).parent / "resources"
        js_content = (resources_dir / "ontoink.js").read_text(encoding="utf-8")
        css_content = (resources_dir / "ontoink.css").read_text(encoding="utf-8")
        # v0.7.4 — DSL parser module, only inlined when live-editor is on the page.
        dsl_path = resources_dir / "ontoink-dsl.js"
        dsl_content = dsl_path.read_text(encoding="utf-8") if dsl_path.exists() else ""

        # v0.7.4-fix — Belt-and-braces escape for `</script>` sequences inside
        # the JS content. The HTML parser doesn't know about JS comments or
        # string literals — any bare `</script>` (even inside a `// comment`)
        # terminates the outer <script> tag, truncating the IIFE mid-code
        # and leaving `window.ontoink` undefined. This bug shipped in
        # v0.7.4 initial (a comment mentioning "<script>DOMContentLoaded →
        # mount</script>"): every page rendered blank until it was found.
        # Escape defensively here so a future edit can't reintroduce the
        # trap. `<\/script>` is a valid JS string that produces the exact
        # bytes `</script>` at runtime, so the JS behavior is unchanged.
        def _safe_inline(js: str) -> str:
            return js.replace("</script>", "<\\/script>").replace("</SCRIPT>", "<\\/SCRIPT>")

        js_content = _safe_inline(js_content)
        dsl_content = _safe_inline(dsl_content)

        cdn_tags = "\n".join([
            # Cytoscape.js core + dagre layout
            '<script src="https://cdn.jsdelivr.net/npm/cytoscape@3.30.4/dist/cytoscape.min.js"></script>',
            '<script src="https://cdn.jsdelivr.net/npm/dagre@0.8.5/dist/dagre.min.js"></script>',
            '<script src="https://cdn.jsdelivr.net/npm/cytoscape-dagre@2.5.0/cytoscape-dagre.js"></script>',
            # Cytoscape SVG export
            '<script src="https://cdn.jsdelivr.net/npm/cytoscape-svg@0.4.0/cytoscape-svg.min.js"></script>',
            # CodeMirror for TTL editing
            '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/codemirror@5.65.18/lib/codemirror.min.css">',
            '<script src="https://cdn.jsdelivr.net/npm/codemirror@5.65.18/lib/codemirror.min.js"></script>',
            '<script src="https://cdn.jsdelivr.net/npm/codemirror@5.65.18/mode/turtle/turtle.min.js"></script>',
        ])

        # Relative path from this page to the site root's assets/ dir, so
        # dynamic ESM imports (e.g. the SHACL validator at assets/shacl/shacl.mjs)
        # resolve correctly both at the site root (Docker `all`, localhost/) and
        # under a sub-path (GitHub Pages, /ontoink/…). mkdocs computes the same
        # "../"-per-level prefix for its own assets; we mirror it from page.url.
        page_url = getattr(page, "url", "") or ""
        asset_base = "../" * page_url.count("/") + "assets/"
        base_tag = f"<script>window.ONTOINK_ASSET_BASE={json.dumps(asset_base)};</script>\n"

        # DSL parser goes BEFORE ontoink.js so `window.ontoinkDsl` is set
        # by the time the live-editor mount code runs.
        dsl_tag = f"<script>\n{dsl_content}\n</script>\n" if dsl_content else ""
        inline_assets = f"<style>\n{css_content}\n</style>\n{dsl_tag}<script>\n{js_content}\n</script>\n"

        output = output.replace("</body>", cdn_tags + "\n" + base_tag + inline_assets + "</body>")
        return output
