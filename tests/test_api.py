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
