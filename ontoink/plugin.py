"""MkDocs plugin that registers the ontoink custom fence and injects assets."""

import json
import logging
from pathlib import Path

from mkdocs.config import config_options
from mkdocs.plugins import BasePlugin

log = logging.getLogger("mkdocs.plugins.ontoink")


class OntoinkPlugin(BasePlugin):

    config_scheme = (
        # Emit <site>/ontoink-report.json + <site>/badges/*.svg after the build.
        ("report", config_options.Type(bool, default=True)),
        # Fail the build when the aggregate quality numbers cross a threshold.
        # Keys: min_score, max_violations, require_consistent, max_shape_drift.
        # Warnings go through the mkdocs logger, so `--strict` alone is enough
        # to gate CI; `strict_quality: true` fails the build unconditionally.
        ("quality_gate", config_options.Type(dict, default={})),
        ("strict_quality", config_options.Type(bool, default=False)),
    )

    def on_config(self, config):
        """Register the ontoink custom fence with pymdownx.superfences."""
        from .cq import render_ontoink_cq, reset_cq_state
        from .fence import render_ontoink, reset_counter

        reset_counter()
        reset_cq_state()
        render_ontoink.docs_dir = config["docs_dir"]
        render_ontoink_cq.docs_dir = config["docs_dir"]

        fences = [
            {"name": "ontoink", "class": "ontoink", "format": render_ontoink},
            # A second fence rather than a key on the first: CQs are
            # prose+query pairs that belong next to a diagram, not inside it,
            # and authors often want them on a page with no graph.
            {"name": "ontoink-cq", "class": "ontoink-cq", "format": render_ontoink_cq},
        ]

        mdx_configs = config.setdefault("mdx_configs", {})
        sf_key = "pymdownx.superfences"
        if sf_key in mdx_configs:
            mdx_configs[sf_key].setdefault("custom_fences", []).extend(fences)
        else:
            mdx_configs[sf_key] = {"custom_fences": list(fences)}

        return config

    def on_post_build(self, config):
        """Aggregate every fence's quality numbers into repo-level artefacts:
        ``ontoink-report.json`` plus README-embeddable badges, and optionally a
        build failure via ``quality_gate``.
        """
        if not self.config.get("report", True):
            return

        from .cq import get_cq_rows
        from .fence import get_report_rows
        from .report import build_summary, check_thresholds, write_report

        rows = get_report_rows()
        cq_rows = get_cq_rows()
        if not rows and not cq_rows:
            return

        summary = build_summary(rows)
        if cq_rows:
            failed = sum(r["failed"] for r in cq_rows)
            summary["competencyQuestions"] = {
                "total": sum(r["total"] for r in cq_rows),
                "passed": sum(r["passed"] for r in cq_rows),
                "failed": failed,
            }

        try:
            write_report(
                config["site_dir"], rows, summary,
                extra={"competencyQuestions": cq_rows} if cq_rows else None,
            )
        except OSError as exc:
            log.warning("ontoink: could not write the build report: %s", exc)
            return

        problems = check_thresholds(summary, self.config.get("quality_gate") or {})
        if cq_rows and summary.get("competencyQuestions", {}).get("failed"):
            problems.append(
                f"{summary['competencyQuestions']['failed']} competency question(s) failed"
            )

        for problem in problems:
            log.warning("ontoink quality gate: %s", problem)
        if problems and self.config.get("strict_quality"):
            from mkdocs.exceptions import Abort

            raise Abort(
                "ontoink quality gate failed: " + "; ".join(problems)
            )

    def on_files(self, files, config):
        """Copy the self-hosted third-party libs (Cytoscape, dagre, CodeMirror…)
        into the built site so pages load them from the same origin instead of a
        CDN — required for offline use and for any host with a strict CSP
        (script-src 'self'). Served at ``<site>/vendor/``.

        Also copies `coi-serviceworker.js` to the site ROOT so every ontoink
        page automatically gets cross-origin isolation on static hosts
        (GitHub Pages, S3, Caddy without header config, etc.) — this is what
        unblocks the browser Konclude WASM reasoner; without it the "Browser:
        Konclude WASM" dropdown option greys out on any static deploy that
        doesn't set COOP/COEP headers, and pages fall through to the runtime
        server reasoner (which only exists in ontoink's `api`/`all` Docker
        modes). Placing the file at the site root gives the service worker a
        scope that covers every page; nesting it under `assets/` would
        silently limit scope to `assets/*` and leave the pages uncovered.
        """
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
        if (res / "coi-serviceworker.js").is_file():
            files.append(
                File(
                    "coi-serviceworker.js",
                    str(res),
                    config["site_dir"],
                    config.get("use_directory_urls", True),
                )
            )

        # Vendored rdf-reasoner-konclude WASM bundle. Ontoink's browser
        # reasoner (ontoink.js: loadBrowserReasoner) imports
        # `<root>/assets/reasoner/bundle.mjs` same-origin so the Web Worker
        # inside can spawn (browsers refuse cross-origin module workers even
        # with COEP credentialless); falling back to esm.sh at runtime fails
        # with "Worker error — the WASM worker died during init" on every
        # static host. Four files must land together in the same directory
        # because bundle.mjs contains
        # `new Worker(new URL("./worker.js", import.meta.url))`.
        reasoner_dir = res / "assets" / "reasoner"
        if reasoner_dir.is_dir():
            for p in sorted(reasoner_dir.iterdir()):
                if p.is_file():
                    files.append(
                        File(
                            f"assets/reasoner/{p.name}",
                            str(res),
                            config["site_dir"],
                            config.get("use_directory_urls", True),
                        )
                    )
        return files

    def on_post_page(self, output, page, config):
        """Inject CDN scripts and plugin JS/CSS into pages that use ontoink."""
        # Also triggers on the live editor page (DSL parser inlined below) and
        # on competency-question cards, which use ontoink's CSS and the
        # data-oi-onclick shim for "Show on graph" and may appear on a page
        # with no diagram at all.
        if (
            "data-ontoink-graph" not in output
            and "ontoink.playground" not in output
            and "ontoink.liveEditor" not in output
            and "ov-cq-block" not in output
        ):
            return output

        resources_dir = Path(__file__).parent / "resources"
        js_content = (resources_dir / "ontoink.js").read_text(encoding="utf-8")
        css_content = (resources_dir / "ontoink.css").read_text(encoding="utf-8")
        # DSL parser module, only inlined when live-editor is on the page.
        dsl_path = resources_dir / "ontoink-dsl.js"
        dsl_content = dsl_path.read_text(encoding="utf-8") if dsl_path.exists() else ""

        # Escapes `</script>` sequences inside the JS content. The HTML parser
        # doesn't know about JS comments or string literals — any bare
        # `</script>` (even inside a `// comment`) terminates the outer
        # <script> tag, truncating the IIFE mid-code and leaving
        # `window.ontoink` undefined. `<\/script>` is a valid JS string that
        # produces the exact bytes `</script>` at runtime, so behavior at
        # runtime is unchanged.
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

        # The COOP/COEP service worker must load before anything else so
        # cross-origin isolation is (best-effort) established before the WASM
        # Konclude reasoner or any SharedArrayBuffer code runs. The file is
        # copied to the site root by `on_files` above so its scope covers
        # every page. Skipped silently if `coi-serviceworker.js` was already
        # added via extra_javascript (the browser would register the same URL
        # twice — dedup handles it — but omitting the duplicate keeps the
        # emitted HTML minimal).
        sw_tag = ""
        if "coi-serviceworker.js" not in output:
            sw_tag = f'<script src="{root}coi-serviceworker.js"></script>\n'

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
        cdn_tags = sw_tag + cdn_tags
        # ONTOINK_VERSION lets anyone check which build a page is running
        # from the console.
        from . import __version__

        base_tag = (
            f"<script>window.ONTOINK_ASSET_BASE={json.dumps(asset_base)};"
            f"window.ONTOINK_VERSION={json.dumps(__version__)};</script>\n"
        )

        # DSL parser goes BEFORE ontoink.js so `window.ontoinkDsl` is set
        # by the time the live-editor mount code runs.
        dsl_tag = f"<script>\n{dsl_content}\n</script>\n" if dsl_content else ""
        inline_assets = f"<style>\n{css_content}\n</style>\n{dsl_tag}<script>\n{js_content}\n</script>\n"

        output = output.replace("</body>", cdn_tags + "\n" + base_tag + inline_assets + "</body>")
        return output
