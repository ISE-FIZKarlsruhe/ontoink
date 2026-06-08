#!/usr/bin/env node
// Minimal CLI wrapper around rdf-reasoner-konclude.
//
// Replaces the upstream `owl-reason` binary, which is referenced in the npm
// package's bin field but is missing from the 0.1.0 published tarball.
//
// Usage: owl-reason --input ont.ttl [--output out.nt] [--mode classify|consistency]

import { readFileSync, writeFileSync } from "node:fs";
import { exit, argv, stdin, stdout } from "node:process";
import { Parser, Writer, Store, DataFactory } from "n3";
import { RdfReasoner, INFERRED_GRAPH_IRI } from "rdf-reasoner-konclude";

function usage() {
  process.stderr.write(
    `Usage: owl-reason --input <file> [--output <file>] [--mode classify|consistency]\n\n` +
      `Options:\n` +
      `  -i, --input <file>   RDF/Turtle input (default: stdin as TTL)\n` +
      `  -o, --output <file>  N-Triples output (default: stdout)\n` +
      `  -m, --mode <name>    classify (default) | consistency\n` +
      `  -h, --help           Show this help\n`,
  );
}

const args = argv.slice(2);
let input = null,
  output = null,
  mode = "classify";

// Value-expecting flags fail loudly when given as the final token, instead of
// silently binding `undefined` (which would e.g. make --input fall through to
// reading stdin and hang).
function valueFor(flag, i) {
  if (i >= args.length) {
    process.stderr.write(`Missing value for ${flag}\n`);
    usage();
    exit(2);
  }
  return args[i];
}

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "-h" || a === "--help") {
    usage();
    exit(0);
  } else if (a === "-i" || a === "--input") input = valueFor(a, ++i);
  else if (a === "-o" || a === "--output") output = valueFor(a, ++i);
  else if (a === "-m" || a === "--mode") mode = valueFor(a, ++i);
  // Output is always N-Triples; accept and ignore --format for callers that pass it.
  else if (a === "-f" || a === "--format") valueFor(a, ++i);
  else {
    process.stderr.write(`Unknown argument: ${a}\n`);
    usage();
    exit(2);
  }
}

async function readStdin() {
  return await new Promise((resolve) => {
    let data = "";
    stdin.setEncoding("utf8");
    stdin.on("data", (chunk) => (data += chunk));
    stdin.on("end", () => resolve(data));
  });
}

const ttl = input ? readFileSync(input, "utf8") : await readStdin();

const store = new Store();
const parser = new Parser({ format: "Turtle" });
await new Promise((resolve, reject) => {
  parser.parse(ttl, (err, quad) => {
    if (err) return reject(err);
    if (quad) store.addQuad(quad);
    else resolve();
  });
});

const reasoner = new RdfReasoner();
await reasoner.ready;

if (mode === "consistency") {
  const consistent = await reasoner.isConsistent(store);
  process.stderr.write(`consistent=${consistent}\n`);
  exit(consistent ? 0 : 1);
}

await reasoner.reason(store);

const inferred = store.getQuads(null, null, null, INFERRED_GRAPH_IRI);
// Konclude puts inferences in a named graph (urn:konclude:inferred). Re-emit
// them as plain triples in the default graph, otherwise n3's N-Triples writer
// serialises the 4th graph term — producing N-Quads that N-Triples parsers
// (e.g. rdflib format="nt") reject with "Invalid line".
const triples = inferred.map((q) => DataFactory.quad(q.subject, q.predicate, q.object));
const writer = new Writer({ format: "N-Triples" });
const nt = await new Promise((resolve, reject) => {
  writer.addQuads(triples);
  writer.end((err, result) => (err ? reject(err) : resolve(result)));
});

if (output) writeFileSync(output, nt);
else stdout.write(nt);

// The reasoner spawns a worker_threads worker that doesn't auto-terminate.
// Explicitly exit so the process doesn't hang after reasoning completes.
if (typeof reasoner.terminate === "function") {
  try { await reasoner.terminate(); } catch { /* best effort */ }
}
exit(0);
