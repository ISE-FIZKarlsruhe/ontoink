"""Community detection and super-node collapse for large ontology graphs.

New in v0.7.0. Reads the Cytoscape.js payload produced by
:func:`ontoink.ttl_parser.parse_ttl_to_cytoscape` and folds each detected
community into a single super-node, keeping the interior sub-graph in a
side-store the client can restore on expand.

Requires ``python-igraph`` (and optionally ``leidenalg`` for the Leiden
algorithm). Falls back gracefully — a missing extras install disables
clustering with a warning instead of raising.
"""

from __future__ import annotations

import warnings
from typing import Dict, List, Tuple


def _load_igraph():
    """Return (igraph, leidenalg) — either module may be ``None`` if missing."""
    try:
        import igraph  # type: ignore
    except ImportError:
        igraph = None
    try:
        import leidenalg  # type: ignore
    except ImportError:
        leidenalg = None
    return igraph, leidenalg


def _partition_membership(g, algorithm: str, igraph_mod, leidenalg_mod):
    """Run community detection and return a membership list (one int per vertex)."""
    algo = (algorithm or "leiden").lower()
    if algo == "leiden":
        if leidenalg_mod is None:
            warnings.warn(
                "leidenalg not installed; falling back to Louvain community detection",
                RuntimeWarning,
            )
            algo = "louvain"
        else:
            part = leidenalg_mod.find_partition(g, leidenalg_mod.ModularityVertexPartition)
            return list(part.membership)
    if algo == "louvain":
        part = g.community_multilevel()
        return list(part.membership)
    if algo == "fastgreedy":
        dendro = g.community_fastgreedy()
        part = dendro.as_clustering()
        return list(part.membership)
    if algo == "walktrap":
        dendro = g.community_walktrap()
        part = dendro.as_clustering()
        return list(part.membership)
    raise ValueError(f"unknown clustering algorithm: {algorithm!r}")


def detect_clusters(
    cytoscape_data: dict,
    algorithm: str = "leiden",
    min_size: int = 5,
    max_supernodes: int = 50,
) -> Tuple[List[dict], List[dict], List[dict], Dict[str, dict], Dict[str, float]]:
    """Detect communities in a Cytoscape payload and collapse each into a super-node.

    Parameters
    ----------
    cytoscape_data : dict
        Output of :func:`parse_ttl_to_cytoscape` — must contain ``nodes`` and
        ``edges`` lists, each with ``{data: {id, ...}}`` entries. May carry
        ``node_badges``; if present, badges of interior nodes migrate into
        the corresponding side-store entry.
    algorithm : str
        One of ``'leiden'`` (default), ``'louvain'``, ``'fastgreedy'``, or
        ``'walktrap'``. ``leiden`` falls back to ``louvain`` if
        ``leidenalg`` is missing.
    min_size : int
        Communities with fewer than ``min_size`` members are NOT collapsed;
        their nodes stay in the top-level graph.
    max_supernodes : int
        After collapse, keep only the ``max_supernodes`` largest communities.
        Overflow communities are un-collapsed (their nodes reappear in the
        top level).

    Returns
    -------
    (top_level_nodes, top_level_edges, clusters, side_store, centrality)
        See module docstring for shape details.

    Notes
    -----
    - If ``igraph`` is unimportable, emits a warning and returns
      ``(nodes, edges, [], {}, {})`` unchanged so the caller can keep going.
    - Super-node id format: ``cluster_<N>``.
    - Super-edge weight = count of crossing edges.
    """
    nodes = cytoscape_data.get("nodes", []) or []
    edges = cytoscape_data.get("edges", []) or []
    node_badges = cytoscape_data.get("node_badges", {}) or {}

    igraph_mod, leidenalg_mod = _load_igraph()
    if igraph_mod is None:
        warnings.warn(
            "python-igraph not installed; big-ontology clustering disabled",
            RuntimeWarning,
        )
        return nodes, edges, [], {}, {}

    if not nodes:
        return nodes, edges, [], {}, {}

    # Build vertex list from node ids (preserve order for reproducibility).
    node_ids: List[str] = []
    seen_ids = set()
    for n in nodes:
        nid = n.get("data", {}).get("id")
        if nid is None or nid in seen_ids:
            continue
        node_ids.append(nid)
        seen_ids.add(nid)

    id_to_idx = {nid: i for i, nid in enumerate(node_ids)}

    # Build igraph edge list (drop dangling references).
    ig_edges: List[Tuple[int, int]] = []
    for e in edges:
        d = e.get("data", {})
        s = d.get("source")
        t = d.get("target")
        if s in id_to_idx and t in id_to_idx:
            ig_edges.append((id_to_idx[s], id_to_idx[t]))

    g = igraph_mod.Graph(n=len(node_ids), edges=ig_edges, directed=False)

    if g.vcount() == 0:
        return nodes, edges, [], {}, {}

    try:
        membership = _partition_membership(g, algorithm, igraph_mod, leidenalg_mod)
    except Exception as exc:  # noqa: BLE001
        warnings.warn(f"community detection failed ({exc}); clustering disabled", RuntimeWarning)
        return nodes, edges, [], {}, {}

    # Group node ids by community id, then rank by size.
    community_members: Dict[int, List[str]] = {}
    for idx, cid in enumerate(membership):
        community_members.setdefault(cid, []).append(node_ids[idx])

    # Order communities largest-first, apply size + supernode caps.
    ordered = sorted(community_members.items(), key=lambda kv: -len(kv[1]))
    collapsed_communities: List[Tuple[str, List[str]]] = []
    kept = 0
    for _cid, members in ordered:
        if len(members) < min_size:
            continue
        if kept >= max_supernodes:
            break
        cluster_id = f"cluster_{kept}"
        collapsed_communities.append((cluster_id, members))
        kept += 1

    # Nodes that ended up inside a super-node (dropped from top level).
    interior_ids: set = set()
    id_to_supernode: Dict[str, str] = {}
    for cid, members in collapsed_communities:
        for m in members:
            interior_ids.add(m)
            id_to_supernode[m] = cid

    # ----------------------------------------------------------------
    # Build top-level nodes (surviving originals + one per super-node)
    # ----------------------------------------------------------------
    nodes_by_id = {n.get("data", {}).get("id"): n for n in nodes}
    top_level_nodes: List[dict] = [n for n in nodes if n.get("data", {}).get("id") not in interior_ids]

    clusters: List[dict] = []
    side_store: Dict[str, dict] = {}

    # Precompute member-side edges for each cluster.
    per_cluster_edges: Dict[str, List[dict]] = {cid: [] for cid, _m in collapsed_communities}
    # v0.7.3-fix (round-3 finding #5): stash the pristine raw boundary
    # edges per cluster so the browser can rebuild real member↔outer
    # connections after expand+collapse. Without this the JS-side
    # `_rebuildClusterBoundary` has nothing to work with when the
    # user re-collapses a cluster whose members were expanded.
    per_cluster_boundary_edges: Dict[str, List[dict]] = {cid: [] for cid, _m in collapsed_communities}
    cross_edges: Dict[Tuple[str, str], int] = {}
    top_level_edges: List[dict] = []

    for e in edges:
        d = e.get("data", {})
        s = d.get("source")
        t = d.get("target")
        s_super = id_to_supernode.get(s)
        t_super = id_to_supernode.get(t)
        if s_super and t_super:
            if s_super == t_super:
                per_cluster_edges[s_super].append(e)
            else:
                key = (s_super, t_super)
                cross_edges[key] = cross_edges.get(key, 0) + 1
                # cross-cluster: touches both s_super's and t_super's boundaries
                per_cluster_boundary_edges[s_super].append(e)
                per_cluster_boundary_edges[t_super].append(e)
        elif s_super and not t_super:
            key = (s_super, t)
            cross_edges[key] = cross_edges.get(key, 0) + 1
            per_cluster_boundary_edges[s_super].append(e)
        elif t_super and not s_super:
            key = (s, t_super)
            cross_edges[key] = cross_edges.get(key, 0) + 1
            per_cluster_boundary_edges[t_super].append(e)
        else:
            # Both endpoints in the top-level → preserve original edge.
            top_level_edges.append(e)

    # ----------------------------------------------------------------
    # Build super-nodes + side-store
    # ----------------------------------------------------------------
    for cluster_id, members in collapsed_communities:
        member_set = set(members)
        # Interior sub-graph node payloads (preserve original dict identity —
        # client re-emits verbatim on expand).
        interior_nodes = [nodes_by_id[m] for m in members if m in nodes_by_id]
        interior_edges = per_cluster_edges.get(cluster_id, [])
        interior_badges = {
            iri: node_badges[iri]
            for iri in node_badges
            if iri in member_set
        }

        # Centroid = highest-degree member within the community subgraph.
        degree_within: Dict[str, int] = {m: 0 for m in members}
        for e in interior_edges:
            d = e.get("data", {})
            if d.get("source") in degree_within:
                degree_within[d["source"]] += 1
            if d.get("target") in degree_within:
                degree_within[d["target"]] += 1
        centroid = max(degree_within, key=lambda k: degree_within[k]) if degree_within else members[0]

        clusters.append({
            "id": cluster_id,
            "member_ids": list(members),
            "title": cluster_id,        # LLM titler overwrites this later
            "size": len(members),
            "centroid": centroid,
        })
        side_store[cluster_id] = {
            "nodes": interior_nodes,
            "edges": interior_edges,
            # v0.7.3-fix (round-3 finding #5): pristine raw boundary edges
            # (member↔outer, and member↔other-cluster's member) so the
            # browser-side rebuild has enough data to reconnect cross-cluster
            # relationships on expand+collapse cycles.
            "boundary_edges": per_cluster_boundary_edges.get(cluster_id, []),
            "node_badges": interior_badges,
        }

        # Emit super-node into the top-level list.
        top_level_nodes.append({
            "data": {
                "id": cluster_id,
                "label": cluster_id,   # LLM titler overwrites this later
                "type": "SuperNode",
                "isSuperNode": True,
                "memberCount": len(members),
                "color": "#94a3b8",
                "shape": "hexagon",
                "iri": "",
                "source": "",
                "namespace": "",
            }
        })

    # ----------------------------------------------------------------
    # Emit synthetic super-edges for cross-cluster / cluster-to-node.
    # ----------------------------------------------------------------
    for (src, tgt), weight in cross_edges.items():
        top_level_edges.append({
            "data": {
                "id": f"super_e_{len(top_level_edges)}",
                "source": src,
                "target": tgt,
                "label": f"×{weight}" if weight > 1 else "",
                "iri": "",
                "edgeType": "object-property",
                "isSuperEdge": True,
                "weight": weight,
                "lineStyle": "solid",
                "lineColor": "#94a3b8",
                "arrowShape": "triangle",
                "edgeWidth": min(1.0 + weight * 0.5, 6.0),
            }
        })

    # ----------------------------------------------------------------
    # Centrality on the collapsed graph — degree, keyed by node id.
    # Consumed by the LOD L0 top-K filter.
    # ----------------------------------------------------------------
    centrality: Dict[str, float] = {}
    for n in top_level_nodes:
        nid = n.get("data", {}).get("id")
        if nid is not None:
            centrality[nid] = 0.0
    for e in top_level_edges:
        d = e.get("data", {})
        s, t = d.get("source"), d.get("target")
        if s in centrality:
            centrality[s] += 1.0
        if t in centrality:
            centrality[t] += 1.0

    return top_level_nodes, top_level_edges, clusters, side_store, centrality
