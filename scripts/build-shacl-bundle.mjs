#!/usr/bin/env node
/*
 * Build a same-origin ESM bundle of the rdf-validate-shacl SHACL engine for the
 * browser. Output: demo/docs/assets/shacl/shacl.mjs
 *
 * DEVELOPER-run, cross-platform (Windows/macOS/Linux). NOT run by CI or Docker.
 * The produced bundle is committed to the repo (under demo/docs/assets/shacl/)
 * so mkdocs serves it verbatim on GitHub Pages and in the Docker serve/all
 * modes. Re-run and commit the result when bumping the SHACL dependencies.
 *
 *   Usage:  node scripts/build-shacl-bundle.mjs
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'demo', 'docs', 'assets', 'shacl');
const OUT_FILE = join(OUT_DIR, 'shacl.mjs');

// Thin browser entry: parse Turtle into an rdf-ext dataset and validate with
// rdf-validate-shacl (full SHACL Core + SHACL-SPARQL). Returns a plain object
// that ontoink.js maps onto its existing validation-report UI.
const ENTRY = `
import SHACLValidator from 'rdf-validate-shacl'
import Environment from '@rdfjs/environment'
import DataFactory from '@rdfjs/data-model/Factory.js'
import DatasetFactory from '@rdfjs/dataset/Factory.js'
import NamespaceFactory from '@rdfjs/namespace/Factory.js'
import ClownfaceFactory from 'clownface/Factory.js'
import { Parser } from 'n3'

// Minimal RDF/JS environment: term factory + dataset + namespace + clownface.
const rdf = new Environment([DataFactory, DatasetFactory, NamespaceFactory, ClownfaceFactory])

function toDataset(ttl) {
  const ds = rdf.dataset()
  // Parse with N3's own DataFactory (its terms are RDF/JS-compliant). We do NOT
  // pass { factory: rdf } — N3 calls the @rdfjs/data-model factory methods
  // unbound (losing 'this' -> blankNodeCounter error). Term equality is
  // structural, so N3 terms compare correctly against rdf-created terms.
  new Parser().parse(ttl || '').forEach((q) => ds.add(q))
  return ds
}

function pathString(p) {
  if (!p) return null
  if (p.value) return p.value
  try { return JSON.stringify(p) } catch (e) { return String(p) }
}

export function validate(dataTtl, shapesTtl) {
  const validator = new SHACLValidator(toDataset(shapesTtl), { factory: rdf })
  const report = validator.validate(toDataset(dataTtl))
  return {
    conforms: report.conforms,
    results: report.results.map((r) => ({
      focusNode: r.focusNode ? r.focusNode.value : null,
      path: pathString(r.path),
      message: (r.message || []).map((m) => m.value).join(' ') || null,
      severity: r.severity ? r.severity.value : null,
      component: r.sourceConstraintComponent ? r.sourceConstraintComponent.value : null,
      value: r.value && r.value.value !== undefined ? r.value.value : null,
    })),
  }
}

export { Parser }
`;

const work = mkdtempSync(join(tmpdir(), 'shacl-build-'));
try {
  console.log('› installing deps in', work);
  execSync('npm init -y', { cwd: work, stdio: 'ignore' });
  // Compose a MINIMAL @rdfjs/environment with just the factories
  // rdf-validate-shacl needs (data-model + dataset + clownface + namespace).
  // The full @zazuko/env / rdf-ext drag in stream-based RDF serializers
  // (node 'stream'/'util') that don't bundle for the browser; we don't parse
  // via them (N3 does the parsing), so we leave them out entirely.
  execSync(
    'npm install --no-audit --no-fund --no-save rdf-validate-shacl@^0.5 ' +
      '@rdfjs/environment@^1 @rdfjs/data-model@^2 @rdfjs/dataset@^2 ' +
      '@rdfjs/namespace@^2 clownface@^2 n3@^1.22 esbuild@^0.24',
    { cwd: work, stdio: 'inherit' },
  );

  writeFileSync(join(work, 'entry.mjs'), ENTRY);
  mkdirSync(OUT_DIR, { recursive: true });

  // Use the esbuild JS API (no shell quoting issues with the banner's `||`).
  const esbuildMod = await import(pathToFileURL(join(work, 'node_modules', 'esbuild', 'lib', 'main.js')).href);
  const esbuild = esbuildMod.default || esbuildMod;

  await esbuild.build({
    entryPoints: [join(work, 'entry.mjs')],
    bundle: true,
    format: 'esm',
    target: 'es2020',
    platform: 'browser',
    minify: true,
    // Some rdfjs deps reference the bare `window` global at load. The playground
    // runs in the main thread (window exists); this makes the bundle portable to
    // Node/Web-Workers too (no-op in a normal browser).
    banner: { js: 'globalThis.window=globalThis.window||globalThis;' },
    outfile: OUT_FILE,
  });

  // Stop esbuild's background service so it releases its binary (otherwise the
  // cleanup below hits EPERM on Windows where esbuild.exe stays locked).
  if (typeof esbuild.stop === 'function') await esbuild.stop();

  console.log('✓ built', OUT_FILE, '— commit it.');
} finally {
  try {
    rmSync(work, { recursive: true, force: true });
  } catch (e) {
    // Best-effort: the OS reclaims the temp dir later. A locked esbuild.exe on
    // Windows must not fail an otherwise-successful build.
    console.warn('(note) could not remove temp dir', work, '-', e.code || e.message);
  }
}
