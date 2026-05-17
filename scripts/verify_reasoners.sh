#!/usr/bin/env bash
#
# verify_reasoners.sh — sanity-check every OWL reasoner in the production image
# BEFORE you deploy. Starts the container in `all` mode, hits each backend
# with a known-good OWL ontology, checks the response, and tears down.
#
# Usage:
#   bash scripts/verify_reasoners.sh                      # uses ontoink:local
#   IMAGE=ghcr.io/ise-fizkarlsruhe/ontoink:0.6.0 bash scripts/verify_reasoners.sh
#
# Exit code 0 if every backend is reachable; non-zero if any backend errors.
# (Empty inferences are not treated as failure — see TESTING.md §5 for why.)

set -uo pipefail

IMAGE="${IMAGE:-ontoink:local}"
NAME="ontoink-verify"
PORT="${PORT:-8000}"
TIMEOUT="${TIMEOUT:-30}"

# Pretty colors when stdout is a TTY
if [ -t 1 ]; then RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; DIM=$'\033[2m'; OFF=$'\033[0m'
else RED=""; GRN=""; YEL=""; DIM=""; OFF=""; fi

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

echo "${DIM}Image: ${IMAGE} on port ${PORT}${OFF}"

# Start container
docker rm -f "$NAME" >/dev/null 2>&1 || true
echo "→ Starting container…"
docker run -d --rm --name "$NAME" -p "${PORT}:8000" \
  -e ONTOINK_MODE=api ${IMAGE} >/dev/null

# Wait for /health
echo -n "→ Waiting for /health "
for i in $(seq 1 "${TIMEOUT}"); do
  if curl -sf "http://localhost:${PORT}/health" >/dev/null 2>&1; then echo " ${GRN}ready${OFF}"; break; fi
  echo -n "."; sleep 1
  if [ "$i" -eq "${TIMEOUT}" ]; then echo " ${RED}timeout${OFF}"; docker logs "$NAME" | tail -20; exit 2; fi
done

# Sample ontology: subClassOf chain + a typed instance.
# Note: Konclude native needs OWL/XML — for it we expect a clean "ran but empty" response,
# which still counts as a passing reachability check.
TTL='@prefix ex: <http://example.org/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
ex: a owl:Ontology .
ex:Animal a owl:Class .
ex:Dog a owl:Class ; rdfs:subClassOf ex:Animal .
ex:rex a ex:Dog .'

build_payload() {
  # $1 = reasoner name; produce valid JSON via Python so newlines are escaped properly
  TTL="${TTL}" REASONER="$1" python3 -c "
import json, os
print(json.dumps({'ttl': os.environ['TTL'], 'reasoner': os.environ['REASONER']}))
"
}

pass=0
fail=0
for reasoner in owlready2 konclude konclude-wasm owlrl; do
  body=$(build_payload "${reasoner}")
  echo
  echo "→ Backend: ${YEL}${reasoner}${OFF}"
  resp=$(curl -s -w "\n%{http_code}" -X POST "http://localhost:${PORT}/reason" \
         -H "Content-Type: application/json" -d "${body}")
  code=$(echo "${resp}" | tail -n1)
  json=$(echo "${resp}" | sed '$d')

  if [ "${code}" != "200" ]; then
    echo "   ${RED}✗ HTTP ${code}${OFF}"
    echo "   ${json}" | head -c 200; echo
    fail=$((fail+1)); continue
  fi

  count=$(echo "${json}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('count', 0))" 2>/dev/null || echo "?")
  used=$(echo "${json}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('reasoner', '?'))" 2>/dev/null || echo "?")
  ms=$(echo "${json}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('elapsed_ms', '?'))" 2>/dev/null || echo "?")

  echo "   ${GRN}✓${OFF} HTTP 200  count=${count}  reasoner=${used}  elapsed=${ms} ms"
  pass=$((pass+1))
done

echo
echo "${DIM}────────────────────────────────────────${OFF}"
if [ "${fail}" -eq 0 ]; then
  echo "${GRN}All ${pass} reasoner backends are reachable.${OFF}"
  exit 0
else
  echo "${RED}${fail} backend(s) failed, ${pass} passed.${OFF}"
  echo "${DIM}Last 30 lines of container logs:${OFF}"
  docker logs "$NAME" | tail -30
  exit 1
fi
