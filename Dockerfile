# Ontoink production image.
#
# Modes (set via ONTOINK_MODE):
#   serve  → MkDocs server on $ONTOINK_PORT (default 8000)
#   build  → run `mkdocs build` once and exit
#   api    → FastAPI reasoning/validation endpoint
#
# Reasoner backend (set via ONTOINK_REASONER):
#   auto       → try owlready2, then konclude, then owlrl
#   owlready2  → HermiT via owlready2 (requires Java in image)
#   konclude   → OWL-DL via rdf-reasoner-konclude (npm, WASM)
#   owlrl      → pure-Python OWL-RL profile
#   none       → skip reasoning

FROM python:3.12-slim AS base

# Tooling: Node.js for rdf-reasoner-konclude (browser/Node WASM port),
# default-jre for owlready2/HermiT, unzip for native Konclude binary,
# libgomp1 for Konclude OpenMP runtime.
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl ca-certificates gnupg unzip default-jre-headless libgomp1 \
        libglib2.0-0 \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Konclude was linked against libpcre.so.3 (PCRE 8), removed from Debian 12.
# Install it from the Debian 11 (bullseye) archive — small, isolated runtime dep.
RUN curl -fsSL -o /tmp/libpcre3.deb \
        http://ftp.debian.org/debian/pool/main/p/pcre3/libpcre3_8.39-15_amd64.deb \
    && dpkg -i /tmp/libpcre3.deb \
    && rm /tmp/libpcre3.deb

# Install native Konclude (statically linked C++ tableau reasoner, v0.7.0-1138)
# This is the original/upstream Konclude — see https://github.com/konclude/Konclude
ARG KONCLUDE_VERSION=v0.7.0-1138
ARG KONCLUDE_URL=https://github.com/konclude/Konclude/releases/download/${KONCLUDE_VERSION}/Konclude-${KONCLUDE_VERSION}-Linux-x64-GCC-Static-Qt5.12.10.zip
RUN curl -fsSL -o /tmp/konclude.zip "${KONCLUDE_URL}" \
    && unzip -q /tmp/konclude.zip -d /opt \
    && mv /opt/Konclude-* /opt/konclude \
    && chmod +x /opt/konclude/Binaries/Konclude \
    && ln -sf /opt/konclude/Binaries/Konclude /usr/local/bin/konclude \
    && rm /tmp/konclude.zip

# Install rdf-reasoner-konclude as a global library. (The upstream 0.1.0
# tarball is missing dist/cli.js, so the package.json bin is broken — we
# ship our own thin CLI wrapper in docker/owl-reason.mjs and symlink it.)
RUN npm install -g rdf-reasoner-konclude@^0.1.0 n3 \
    && npm cache clean --force

# Place wrapper inside the package dir so ESM "n3" import resolves via the
# parent /usr/lib/node_modules. Symlink the bin onto PATH.
COPY docker/owl-reason.mjs /usr/lib/node_modules/rdf-reasoner-konclude/owl-reason.mjs
RUN chmod +x /usr/lib/node_modules/rdf-reasoner-konclude/owl-reason.mjs \
    && ln -sf /usr/lib/node_modules/rdf-reasoner-konclude/owl-reason.mjs /usr/local/bin/owl-reason

# ── Vendor the browser bundle for the playground's WASM Konclude reasoner ──
# Browsers refuse to instantiate Web Workers from cross-origin URLs (e.g. esm.sh)
# even with COEP credentialless, so the library must be served same-origin.
# We bundle rdf-reasoner-konclude + n3 into a single ESM file via esbuild and
# place konclude.wasm alongside it.
COPY docker/bundle-reasoner.sh /usr/local/bin/bundle-reasoner.sh
RUN chmod +x /usr/local/bin/bundle-reasoner.sh && /usr/local/bin/bundle-reasoner.sh

WORKDIR /app

# Python deps first (cache-friendly)
COPY pyproject.toml README.md ./
COPY ontoink ./ontoink
RUN pip install --no-cache-dir ".[reasoning]" \
                "fastapi>=0.110" "uvicorn[standard]>=0.27" \
                "mkdocs-material>=9.5"

# Docs source (only needed for serve/build modes)
COPY demo ./demo

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENV ONTOINK_MODE=serve \
    ONTOINK_PORT=8000 \
    ONTOINK_REASONER=auto \
    ONTOINK_DOCS_DIR=/app/demo \
    ONTOINK_OUTPUT_DIR=/output \
    PYTHONUNBUFFERED=1

# Volume for persisted reasoning runs (input.ttl, inferences.json, inferences.nt per run)
RUN mkdir -p /output
VOLUME ["/output"]

EXPOSE 8000

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
