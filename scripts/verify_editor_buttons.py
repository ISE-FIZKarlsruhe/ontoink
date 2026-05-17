"""Render every per-pattern markdown page through the fence handler and
confirm the Edit & Validate button is present in the output. If it's
missing somewhere, this prints the offending page."""
import sys
from pathlib import Path
import re

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.stdout.reconfigure(encoding="utf-8")

from ontoink.fence import render_ontoink, reset_counter  # noqa: E402

FENCE_RE = re.compile(r"```ontoink\s*\n(.*?)\n```", re.DOTALL)
DOCS = Path("demo/docs")


def main() -> None:
    pages = sorted((DOCS / "anti-patterns").glob("*.md"))
    if not pages:
        sys.exit("no anti-pattern .md pages found")
    render_ontoink.docs_dir = str(DOCS)
    missing = []
    for md in pages:
        text = md.read_text(encoding="utf-8")
        for m in FENCE_RE.finditer(text):
            reset_counter()
            src = m.group(1).strip()
            out = render_ontoink(src, "ontoink", "", {}, None)
            has_btn = "Edit &amp; Validate" in out
            has_panel = "ov-editor-panel" in out
            err = "ov-error" in out
            tag = f"{md.name:42s}"
            print(f"{tag} button={has_btn}  panel={has_panel}  error={err}")
            if not has_btn:
                missing.append(md.name)
    print()
    if missing:
        print(f"FAIL: {len(missing)} pages missing Edit & Validate button:")
        for n in missing:
            print(f"  - {n}")
        sys.exit(1)
    print(f"OK: all {len(pages)} anti-pattern pages emit Edit & Validate")


if __name__ == "__main__":
    main()
