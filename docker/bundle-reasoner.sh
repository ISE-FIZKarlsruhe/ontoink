#!/usr/bin/env bash
# Build a same-origin ESM bundle of rdf-reasoner-konclude + n3 for the browser.
# Output: /opt/reasoner-vendor/{bundle.mjs, konclude.wasm, konclude.mjs}
set -eux

npm install -g esbuild@^0.24.0
mkdir -p /tmp/bundle
cd /tmp/bundle

npm init -y >/dev/null
npm install --no-audit --no-fund rdf-reasoner-konclude@^0.1.0 n3@^1.22.0

cat > entry.mjs << 'EOF'
export * from "rdf-reasoner-konclude";
export { Store, Parser, Writer, DataFactory } from "n3";
EOF

esbuild entry.mjs \
  --bundle --format=esm --target=es2022 --platform=browser \
  --external:./konclude.wasm \
  --outfile=bundle.mjs

mkdir -p /opt/reasoner-vendor
cp bundle.mjs              /opt/reasoner-vendor/
cp node_modules/rdf-reasoner-konclude/dist/konclude.wasm /opt/reasoner-vendor/

# worker.js is referenced by the bundle as `new Worker(new URL("./worker.js", import.meta.url))`
# — we must serve it from the same directory or the Worker constructor 404s.
#
# v0.7.3 patch: swallow the Emscripten Asyncify "unwind" exit sentinel inside
# the classify RPC. Konclude calls exit() after finishing; upstream's worker
# forwarded the resulting "unwind" throw as an RPC error, so the main thread's
# reason() rejected BEFORE its getInferredNTriples harvest step — the browser
# reasoner always failed with "aborted with 'unwind'" despite the inferences
# existing in worker memory. Keep this in sync with the pre-patched copy in
# ontoink/resources/assets/reasoner/worker.js.
python3 - node_modules/rdf-reasoner-konclude/dist/worker.js /opt/reasoner-vendor/worker.js << 'PYEOF'
import sys
src, dst = sys.argv[1], sys.argv[2]
text = open(src, encoding="utf-8").read()
old = """            case "classify": {
                result = reasoner.classify();
                break;
            }"""
new = """            case "classify": {
                try {
                    result = reasoner.classify();
                }
                catch (err) {
                    const m = err instanceof Error ? (err.message || err.name) : String(err);
                    if (!/unwind/i.test(m)) throw err;
                    result = true;
                }
                break;
            }"""
if old not in text:
    sys.exit("bundle-reasoner.sh: classify block not found in worker.js — upstream changed, update the patch")
open(dst, "w", encoding="utf-8").write(text.replace(old, new))
PYEOF

# konclude.mjs (Emscripten output) starts with a Node-only `import { createRequire } from 'module'`.
# Browsers can't resolve the `module` bare specifier — the file fails to parse.
# The require() it sets up is only used inside `if (ENVIRONMENT_IS_NODE)` branches,
# so we can safely replace the top imports with a browser-safe stub.
src=node_modules/rdf-reasoner-konclude/dist/konclude.mjs
dst=/opt/reasoner-vendor/konclude.mjs
{
  echo '// Patched for browser: replaced Node-only `import { createRequire } from "module"`.'
  echo '// The require() that was set up here is only invoked inside `if (ENVIRONMENT_IS_NODE)`'
  echo '// branches further down. In the browser ENVIRONMENT_IS_NODE is false, so this stub'
  echo '// is never called. Anyone running this in Node should use the unpatched dist file.'
  echo 'const require = () => { throw new Error("require() is not available in the browser build"); };'
  # Skip the original two lines: `import { createRequire }` and `const require = createRequire(...)`
  tail -n +4 "$src"
} > "$dst"

ls -la /opt/reasoner-vendor

# Leave /tmp/bundle before deleting it (otherwise npm cache clean can't start
# because its cwd has been removed: uv_cwd ENOENT).
cd /
rm -rf /tmp/bundle
npm cache clean --force
