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

    def on_files(self, files, config):
        """Copy the self-hosted third-party libs (Cytoscape, dagre, CodeMirror…)
        into the built site so pages load them from the same origin instead of a
        CDN — required for offline use and for any host with a strict CSP
        (script-src 'self'). Served at ``<site>/vendor/``."""
        from mkdocs.structure.files import File

        res = Path(__file__).parent / "resources"
        vendor = res / "vendor"
        if vendor.is_dir():
            for p in sorted(vendor.iterdir()):
                if p.is_file():
                    files.append(
                        File(
                            f"vendor/{p.name}",
                            str(res),
                            config["site_dir"],
                            config.get("use_directory_urls", True),
                        )
                    )
        return files

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

        # Relative path from this page to the site root, so both the vendored
        # libs (<site>/vendor/, copied by on_files) and dynamic ESM imports
        # (assets/shacl/shacl.mjs) resolve at the site root (Docker `all`,
        # localhost/) and under a sub-path (GitHub Pages, /ontoink/…). mkdocs
        # computes the same "../"-per-level prefix for its own assets.
        page_url = getattr(page, "url", "") or ""
        root = "../" * page_url.count("/")
        asset_base = root + "assets/"
        vendor_base = root + "vendor/"

        # Self-hosted third-party libs (no CDN) — offline + strict-CSP friendly.
        cdn_tags = "\n".join([
            f'<script src="{vendor_base}cytoscape.min.js"></script>',
            f'<script src="{vendor_base}dagre.min.js"></script>',
            f'<script src="{vendor_base}cytoscape-dagre.js"></script>',
            f'<script src="{vendor_base}cytoscape-svg.min.js"></script>',
            f'<link rel="stylesheet" href="{vendor_base}codemirror.min.css">',
            f'<script src="{vendor_base}codemirror.min.js"></script>',
            f'<script src="{vendor_base}codemirror-turtle.min.js"></script>',
        ])
        base_tag = f"<script>window.ONTOINK_ASSET_BASE={json.dumps(asset_base)};</script>\n"

        # DSL parser goes BEFORE ontoink.js so `window.ontoinkDsl` is set
        # by the time the live-editor mount code runs.
        dsl_tag = f"<script>\n{dsl_content}\n</script>\n" if dsl_content else ""
        inline_assets = f"<style>\n{css_content}\n</style>\n{dsl_tag}<script>\n{js_content}\n</script>\n"

        output = output.replace("</body>", cdn_tags + "\n" + base_tag + inline_assets + "</body>")
        return output
