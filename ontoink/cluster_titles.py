"""LLM-backed titling for super-nodes produced by :mod:`ontoink.cluster`.

New in v0.7.0. Given a list of ``clusters`` and their ``side_store`` (as
returned by :func:`ontoink.cluster.detect_clusters`), replace the raw
``cluster_N`` placeholder title with a short, human-readable phrase that
summarises what the community is about.

Two backends are supported:

* ``anthropic`` — Claude (requires ``ontoink[topic]`` and ``ANTHROPIC_API_KEY``)
* ``openai`` — GPT (requires ``ontoink[topic]`` and ``OPENAI_API_KEY``)

Neither dependency is required at import time. Missing library / missing key
falls back to a deterministic synthetic title derived from the members'
local names — the pipeline never fails just because LLM titling was
requested but couldn't run.
"""

from __future__ import annotations

import os
import re
import warnings
from typing import Dict, Iterable, List, Optional

# Reuse the local-name helper so titles look the same as the labels the
# graph itself renders.
from .ttl_parser import local_name


# ---------------------------------------------------------------------------
# Prompt scaffolding
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = (
    "You are titling groups of related ontology terms. "
    "Return a 2-5 word noun phrase that summarises what the group is about. "
    "No punctuation, no quotes, no leading article."
)

_MAX_MEMBERS_PER_PROMPT = 40


def _synthetic_title(member_labels: List[str]) -> str:
    """Fallback title from the member local-names (top-2 joined with 'and')."""
    if not member_labels:
        return "Untitled cluster"
    unique: List[str] = []
    seen = set()
    for label in member_labels:
        if label and label not in seen:
            unique.append(label)
            seen.add(label)
        if len(unique) >= 2:
            break
    if len(unique) == 1:
        return unique[0]
    return f"{unique[0]} and {unique[1]}"


def _member_labels_for(cluster: dict, side_store: Dict[str, dict]) -> List[str]:
    """Return a display-name list for a cluster's members, longest to shortest."""
    cid = cluster.get("id")
    entry = side_store.get(cid, {}) if isinstance(side_store, dict) else {}
    nodes = entry.get("nodes", []) if isinstance(entry, dict) else []

    labels: List[str] = []
    for n in nodes:
        data = n.get("data", {}) if isinstance(n, dict) else {}
        label = data.get("label") or ""
        if not label:
            iri = data.get("iri") or data.get("id") or ""
            label = local_name(iri) if iri else ""
        if label:
            labels.append(str(label))

    if not labels:
        # Fallback to the member_ids list on the cluster dict itself.
        for iri in cluster.get("member_ids") or []:
            name = local_name(str(iri))
            if name:
                labels.append(name)
    return labels


def _build_prompt(cluster_id: str, member_labels: Iterable[str]) -> str:
    trimmed = list(member_labels)[:_MAX_MEMBERS_PER_PROMPT]
    body = ", ".join(trimmed)
    return (
        f"Group {cluster_id} contains these ontology terms:\n{body}\n\n"
        "Return a 2-5 word title for this group."
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def title_clusters(
    clusters: List[dict],
    side_store: Dict[str, dict],
    provider: Optional[str] = None,
    model: Optional[str] = None,
    api_key: Optional[str] = None,
) -> List[dict]:
    """Rewrite each ``clusters[i]['title']`` with an LLM-generated phrase.

    Parameters
    ----------
    clusters : list[dict]
        As returned by :func:`ontoink.cluster.detect_clusters`.
    side_store : dict
        Per-cluster interior graph, keyed by cluster id.
    provider : str | None
        ``'anthropic'`` or ``'openai'``. When ``None`` (or the value is
        unrecognised), no LLM is called — every cluster gets a synthetic
        title from its members.
    model : str | None
        Provider-specific model id. Sensible defaults are used when unset.
    api_key : str | None
        API key. When unset, falls back to ``ANTHROPIC_API_KEY`` /
        ``OPENAI_API_KEY`` environment variables. Missing key falls back
        to synthetic titles with a single warning.

    Returns
    -------
    list[dict]
        The same ``clusters`` list, mutated in place (returned for
        chaining convenience).

    Notes
    -----
    - Empty / missing input → returned unchanged; never raises.
    - Any per-cluster LLM error is caught, warned, and that cluster falls
      back to a synthetic title.
    - Titles are trimmed to 80 characters and stripped of trailing
      punctuation to keep them chip-friendly.
    """
    if not clusters:
        return clusters or []

    provider = (provider or "").strip().lower() or None
    caller = None
    if provider == "anthropic":
        caller = _make_anthropic_caller(model, api_key)
    elif provider == "openai":
        caller = _make_openai_caller(model, api_key)
    elif provider is not None:
        warnings.warn(
            f"unknown LLM provider {provider!r}; using synthetic titles",
            RuntimeWarning,
        )

    for cluster in clusters:
        labels = _member_labels_for(cluster, side_store)
        fallback = _synthetic_title(labels)

        if caller is None:
            title = fallback
        else:
            try:
                prompt = _build_prompt(cluster.get("id", "cluster"), labels)
                title = caller(prompt) or fallback
            except Exception as exc:  # noqa: BLE001 — best-effort
                warnings.warn(
                    f"cluster titling failed for {cluster.get('id')!r}: {exc}",
                    RuntimeWarning,
                )
                title = fallback

        cluster["title"] = _clean_title(title)

    return clusters


def _clean_title(text: str) -> str:
    text = (text or "").strip()
    text = re.sub(r"^[\"'`]+|[\"'`]+$", "", text)
    text = re.sub(r"[.!?,;:]+$", "", text)
    if len(text) > 80:
        text = text[:80].rstrip()
    return text or "Untitled cluster"


# ---------------------------------------------------------------------------
# Provider wrappers — import lazily so ``ontoink[topic]`` is truly optional
# ---------------------------------------------------------------------------

def _make_anthropic_caller(model: Optional[str], api_key: Optional[str]):
    try:
        import anthropic  # type: ignore
    except ImportError:
        warnings.warn(
            "anthropic library not installed; install `ontoink[topic]` "
            "to enable LLM titling. Using synthetic titles instead.",
            RuntimeWarning,
        )
        return None

    key = api_key or os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        warnings.warn(
            "ANTHROPIC_API_KEY not set; using synthetic titles",
            RuntimeWarning,
        )
        return None

    client = anthropic.Anthropic(api_key=key)
    default_model = model or "claude-3-5-haiku-latest"

    def _call(prompt: str) -> str:
        msg = client.messages.create(
            model=default_model,
            max_tokens=64,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )
        blocks = getattr(msg, "content", None) or []
        text_parts = []
        for block in blocks:
            text = getattr(block, "text", None)
            if text:
                text_parts.append(text)
        return "".join(text_parts).strip()

    return _call


def _make_openai_caller(model: Optional[str], api_key: Optional[str]):
    try:
        import openai  # type: ignore
    except ImportError:
        warnings.warn(
            "openai library not installed; install `ontoink[topic]` "
            "to enable LLM titling. Using synthetic titles instead.",
            RuntimeWarning,
        )
        return None

    key = api_key or os.environ.get("OPENAI_API_KEY")
    if not key:
        warnings.warn(
            "OPENAI_API_KEY not set; using synthetic titles",
            RuntimeWarning,
        )
        return None

    client = openai.OpenAI(api_key=key)
    default_model = model or "gpt-4o-mini"

    def _call(prompt: str) -> str:
        resp = client.chat.completions.create(
            model=default_model,
            max_tokens=64,
            temperature=0.2,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
        )
        choices = getattr(resp, "choices", None) or []
        if not choices:
            return ""
        message = getattr(choices[0], "message", None)
        return (getattr(message, "content", "") or "").strip()

    return _call
