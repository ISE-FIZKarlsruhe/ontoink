"""Tests for the FastAPI HTTP layer (ontoink.api).

These exercise the same code path the Docker container's ``api`` / ``all`` mode
runs. Skipped entirely if FastAPI isn't installed (it's an optional extra).
"""

from __future__ import annotations

import json
import os
import tempfile

import pytest


fastapi = pytest.importorskip("fastapi")
TestClient = pytest.importorskip("fastapi.testclient").TestClient


@pytest.fixture(scope="module")
def client():
    from ontoink.api import app
    return TestClient(app)


SAMPLE = {
    "ttl": (
        "@prefix ex: <http://example.org/> .\n"
        "@prefix owl: <http://www.w3.org/2002/07/owl#> .\n"
        "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n"
        "ex: a owl:Ontology .\n"
        "ex:Animal a owl:Class .\n"
        "ex:Dog a owl:Class ; rdfs:subClassOf ex:Animal .\n"
        "ex:rex a ex:Dog .\n"
    ),
}


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert "reasoner" in body
    assert "version" in body


def test_health_emits_coop_coep_headers(client):
    r = client.get("/health")
    assert r.headers.get("Cross-Origin-Opener-Policy") == "same-origin"
    assert r.headers.get("Cross-Origin-Embedder-Policy") == "credentialless"


def test_reason_with_invalid_ttl_returns_400(client):
    r = client.post("/reason", json={"ttl": "this is not turtle <<>><<>>"})
    assert r.status_code == 400


def test_reason_with_valid_ttl(client):
    r = client.post("/reason", json=SAMPLE)
    assert r.status_code == 200
    body = r.json()
    # Contract: always returns inferred[] (possibly empty), count, reasoner, elapsed_ms
    assert "inferred" in body
    assert isinstance(body["inferred"], list)
    assert body["count"] == len(body["inferred"])
    assert "reasoner" in body
    assert "elapsed_ms" in body and isinstance(body["elapsed_ms"], int)


def test_reason_reasoner_override_is_echoed(client):
    payload = dict(SAMPLE)
    payload["reasoner"] = "owlrl"
    r = client.post("/reason", json=payload)
    assert r.status_code == 200
    body = r.json()
    # The /reason endpoint reports which reasoner was used
    assert body["reasoner"] == "owlrl"


def test_reason_persists_output_when_dir_set(client, tmp_path, monkeypatch):
    monkeypatch.setenv("ONTOINK_OUTPUT_DIR", str(tmp_path))
    r = client.post("/reason", json=SAMPLE)
    assert r.status_code == 200
    body = r.json()
    # A run id is returned only when persistence ran
    assert "saved_to" in body, body
    run_dir = tmp_path / body["saved_to"]
    assert (run_dir / "input.ttl").exists()
    assert (run_dir / "inferences.json").exists()
    assert (run_dir / "inferences.nt").exists()
    # The saved JSON contains the same payload shape as the response
    saved = json.loads((run_dir / "inferences.json").read_text(encoding="utf-8"))
    assert saved["count"] == body["count"]


def test_validate_requires_shacl(client):
    r = client.post("/validate", json={"ttl": "ex: a <http://example.org/Test> ."})
    assert r.status_code == 400


def test_validate_reports_the_inference_mode_it_used(client):
    shapes = (
        "@prefix sh: <http://www.w3.org/ns/shacl#> .\n"
        "@prefix ex: <http://example.org/> .\n"
        "ex:S a sh:NodeShape ; sh:targetClass ex:Dog ;\n"
        "  sh:property [ sh:path ex:name ; sh:minCount 1 ] .\n"
    )
    r = client.post("/validate", json={**SAMPLE, "shacl": shapes})
    assert r.status_code == 200
    body = r.json()
    # Build-time, server and browser validation must agree by default; the mode
    # is echoed so a disagreement is diagnosable instead of mysterious.
    assert body["inference"] == "none"
    assert "conforms" in body and "violations" in body


# ── shape recommendation ──────────────────────────────────────────────────

RECOMMEND_TTL = (
    "@prefix ex: <http://example.org/> .\n"
    "@prefix owl: <http://www.w3.org/2002/07/owl#> .\n"
    "ex:Person a owl:Class .\n"
    'ex:alice a ex:Person ; ex:name "Alice" .\n'
    'ex:bob a ex:Person ; ex:name "Bob" .\n'
)


def test_recommend_shapes_returns_a_payload(client):
    r = client.post("/recommend-shapes", json={"ttl": RECOMMEND_TTL})
    assert r.status_code == 200
    body = r.json()
    assert body["shapes"], "expected a proposal for ex:Person"
    assert body["shapes"][0]["targetClass"] == "http://example.org/Person"
    assert any(c["kind"] == "minCount" for c in body["constraints"])
    # Evidence travels with the suggestion — that is the point of the endpoint.
    assert all("confidence" in c and "evidence" in c for c in body["constraints"])


def test_recommend_shapes_skips_classes_already_covered(client):
    shapes = (
        "@prefix sh: <http://www.w3.org/ns/shacl#> .\n"
        "@prefix ex: <http://example.org/> .\n"
        "ex:PersonShape a sh:NodeShape ; sh:targetClass ex:Person .\n"
    )
    r = client.post("/recommend-shapes", json={"ttl": RECOMMEND_TTL, "shacl": shapes})
    assert r.status_code == 200
    body = r.json()
    assert body["shapes"] == []
    assert "http://example.org/Person" in body["alreadyCovered"]


def test_recommend_shapes_rejects_an_unknown_method(client):
    r = client.post("/recommend-shapes", json={"ttl": RECOMMEND_TTL, "method": "magic"})
    assert r.status_code == 400
    assert "unknown method" in r.json()["detail"]


def test_recommend_shapes_rejects_invalid_ttl(client):
    r = client.post("/recommend-shapes", json={"ttl": "not turtle <<>>"})
    assert r.status_code == 400


def test_recommend_methods_lets_a_client_build_its_own_picker(client):
    """A client should ask what this server can run, not hard-code a list."""
    r = client.get("/recommend-methods")
    assert r.status_code == 200
    methods = {m["name"]: m for m in r.json()["methods"]}
    assert set(methods) == {"auto", "baseline", "astrea", "shexer"}

    # Availability is resolved server-side: sheXer is an optional dependency,
    # so offering it blindly means a request that fails at run time.
    assert isinstance(methods["shexer"]["available"], bool)

    # Every method but the `auto` composition names the paper it implements.
    for name, spec in methods.items():
        if name == "auto":
            assert spec["reference"] is None
            continue
        assert spec["reference"]["citation"] and spec["reference"]["doi"]

    threshold = [p for p in methods["baseline"]["params"]
                 if p["name"] == "min_count_threshold"][0]
    assert (threshold["type"], threshold["default"]) == ("float", 0.9)
    assert (threshold["min"], threshold["max"]) == (0.0, 1.0)


def test_recommend_shapes_honours_hyperparameters(client):
    """The knob has to reach the method, not just be accepted by the schema."""
    ttl = (
        "@prefix ex: <http://example.org/> .\n"
        "@prefix owl: <http://www.w3.org/2002/07/owl#> .\n"
        "ex:Person a owl:Class .\n"
        'ex:a a ex:Person ; ex:name "A" ; ex:nick "aa" .\n'
        'ex:b a ex:Person ; ex:name "B" ; ex:nick "bb" .\n'
        'ex:c a ex:Person ; ex:name "C" .\n'
        'ex:d a ex:Person ; ex:name "D" .\n'
    )

    def min_count_paths(params):
        r = client.post("/recommend-shapes",
                        json={"ttl": ttl, "method": "baseline", "params": params})
        assert r.status_code == 200
        return {c["path"] for c in r.json()["constraints"] if c["kind"] == "minCount"}

    # `nick` is on 2 of 4 instances: required at 0.5, not at the 0.9 default.
    assert "http://example.org/nick" not in min_count_paths(None)
    assert "http://example.org/nick" in min_count_paths({"min_count_threshold": 0.5})


def test_recommend_shapes_ignores_a_misspelled_parameter(client):
    """A typo must degrade to the default, not 500 on an unexpected keyword."""
    r = client.post("/recommend-shapes", json={
        "ttl": RECOMMEND_TTL, "method": "baseline",
        "params": {"min_cout_threshold": 0.1},
    })
    assert r.status_code == 200
    assert r.json()["params"] == {}
