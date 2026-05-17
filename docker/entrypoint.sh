#!/usr/bin/env bash
set -euo pipefail

# If the user passed a command (e.g. `docker run ... owl-reason --help`),
# run it directly and ignore ONTOINK_MODE. This lets the image double as
# a CLI container for owl-reason, python, mkdocs, etc.
if [ "$#" -gt 0 ]; then
  exec "$@"
fi

MODE="${ONTOINK_MODE:-serve}"
PORT="${ONTOINK_PORT:-8000}"
DOCS_DIR="${ONTOINK_DOCS_DIR:-/app/demo}"

echo "ontoink: mode=${MODE} reasoner=${ONTOINK_REASONER:-auto} port=${PORT}"

case "${MODE}" in
  build)
    cd "${DOCS_DIR}"
    exec mkdocs build --strict
    ;;
  api)
    exec uvicorn ontoink.api:app --host 0.0.0.0 --port "${PORT}"
    ;;
  all)
    # Combined mode: build the docs once, then serve them as static files
    # from the same FastAPI app that exposes /reason, /validate, /health.
    # This gives the playground a same-origin /reason endpoint so the
    # "Server" reasoner dropdown works without a reverse proxy.
    SITE_DIR="${ONTOINK_SITE_DIR:-${DOCS_DIR}/site}"
    # Override the GitHub-Pages-style site_url (which puts every link under
    # /ontoink/…) with the local origin so the docs work at http://host:PORT/.
    # mkdocs has no --site-url CLI flag, so we sed the value in-place inside
    # the container's ephemeral copy of mkdocs.yml. The path portion of
    # site_url is what mkdocs prepends to every internal link; keeping the
    # URL ending in `/` gives root-relative links.
    SITE_URL="${ONTOINK_SITE_URL:-http://localhost:${PORT}/}"
    # Build if missing OR if the index file isn't present (stale/empty dir)
    if [ ! -f "${SITE_DIR}/index.html" ]; then
      echo "ontoink: building docs into ${SITE_DIR} (site_url=${SITE_URL})"
      (
        cd "${DOCS_DIR}"
        # Use | as the sed delimiter because the URL contains slashes.
        # Match the whole `site_url:` line (with optional trailing comments)
        # so we don't double-write or accidentally match other keys.
        sed -i.bak -E "s|^site_url:.*|site_url: ${SITE_URL}|" mkdocs.yml
        mkdocs build --site-dir "${SITE_DIR}"
      )
    fi
    # Place the vendored WASM reasoner bundle next to the docs so the playground
    # can load it from the same origin (Workers cannot be cross-origin).
    if [ -d /opt/reasoner-vendor ]; then
      mkdir -p "${SITE_DIR}/assets/reasoner"
      cp -f /opt/reasoner-vendor/* "${SITE_DIR}/assets/reasoner/"
      echo "ontoink: vendored reasoner bundle into ${SITE_DIR}/assets/reasoner/"
    fi
    export ONTOINK_DOCS_SITE="${SITE_DIR}"
    echo "ontoink: serving docs from ${SITE_DIR}"
    exec uvicorn ontoink.api:app --host 0.0.0.0 --port "${PORT}"
    ;;
  serve)
    # MkDocs serves from demo/docs directly. Drop the vendored bundle into the
    # docs source so dev mode also has same-origin reasoning available.
    if [ -d /opt/reasoner-vendor ]; then
      mkdir -p "${DOCS_DIR}/docs/assets/reasoner"
      cp -f /opt/reasoner-vendor/* "${DOCS_DIR}/docs/assets/reasoner/" 2>/dev/null || true
    fi
    cd "${DOCS_DIR}"
    exec mkdocs serve --dev-addr "0.0.0.0:${PORT}"
    ;;
  *)
    echo "Unknown ONTOINK_MODE: ${MODE}" >&2
    echo "Valid modes: serve | build | api | all" >&2
    exit 2
    ;;
esac
