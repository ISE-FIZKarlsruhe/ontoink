"""MkDocs plugin that registers the ontoink custom fence and injects assets."""

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
        if "data-ontoink-graph" not in output and "ontoink.playground" not in output:
            return output

        resources_dir = Path(__file__).parent / "resources"
        js_content = (resources_dir / "ontoink.js").read_text(encoding="utf-8")
        css_content = (resources_dir / "ontoink.css").read_text(encoding="utf-8")

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

        inline_assets = f"<style>\n{css_content}\n</style>\n<script>\n{js_content}\n</script>\n"

        output = output.replace("</body>", cdn_tags + "\n" + inline_assets + "</body>")
        return output
