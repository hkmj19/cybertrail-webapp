"""
app/services/graph_service.py
──────────────────────────────
Higher-level graph operations built on top of Neo4j.

These are reusable functions that multiple modules call:
  - Saving any InvestigationGraph to Neo4j
  - Loading a saved graph by session ID
  - Running subgraph queries (neighbours, paths, clusters)
  - Computing graph metrics (centrality, density)

Modules import this service instead of writing raw Cypher themselves.
"""

import json
from loguru import logger
from app.core.database import db_manager
from app.core.cache import cache_manager
from app.models.graph import InvestigationGraph, GraphNode, GraphEdge


class GraphService:
    """Central service for persisting and querying investigation graphs."""

    async def save_graph(self, graph: InvestigationGraph) -> str:
        """
        Persists a full InvestigationGraph to Neo4j AND caches it in Redis.
        Returns the session_id for later retrieval.

        Called by every module tracer after building its result graph.
        """
        # Cache full graph JSON for fast export/retrieval
        graph_dict = graph.model_dump(mode="json")
        await cache_manager.set(
            f"graph_export:{graph.session_id}",
            graph_dict,
            ttl=86400,  # keep for 24 hours
        )

        # Persist to Neo4j (individual nodes + edges)
        async with db_manager.session() as s:
            # Save each node with its module label
            for node in graph.nodes:
                label = self._node_label(node)
                id_field = self._node_id_field(node)
                await s.run(f"""
                    MERGE (n:{label} {{{id_field}: $id}})
                    SET n.label       = $label,
                        n.node_type   = $node_type,
                        n.flagged     = $flagged,
                        n.risk_level  = $risk_level,
                        n.module      = $module,
                        n.session_id  = $session_id,
                        n.updated_at  = datetime()
                """,
                    id=node.id, label=node.label,
                    node_type=node.node_type.value,
                    flagged=node.flagged,
                    risk_level=node.risk_level.value,
                    module=graph.module,
                    session_id=graph.session_id,
                )

            # Save each edge
            for edge in graph.edges:
                rel_type = edge.edge_type.value.upper().replace(" ", "_")
                await s.run(f"""
                    MATCH (s) WHERE s.address = $src
                        OR s.upi_id = $src OR s.number = $src
                        OR s.cin = $src OR s.din = $src
                    MATCH (t) WHERE t.address = $tgt
                        OR t.upi_id = $tgt OR t.number = $tgt
                        OR t.cin = $tgt OR t.din = $tgt
                    MERGE (s)-[r:{rel_type} {{session_id: $sid}}]->(t)
                    SET r.label    = $label,
                        r.amount   = $amount,
                        r.currency = $currency,
                        r.layer    = $layer
                """,
                    src=edge.source, tgt=edge.target,
                    sid=graph.session_id,
                    label=edge.label,
                    amount=edge.amount,
                    currency=edge.currency or "",
                    layer=edge.metadata.get("layer", graph.module),
                )

        logger.info(f"Graph saved: session={graph.session_id}, nodes={graph.total_nodes}, edges={graph.total_edges}")
        return graph.session_id

    async def load_graph(self, session_id: str) -> dict | None:
        """
        Loads a previously saved graph from Redis cache.
        Falls back to Neo4j query if cache expired.
        Returns raw dict (not InvestigationGraph) for flexibility.
        """
        # Try Redis first (fast path)
        cached = await cache_manager.get(f"graph_export:{session_id}")
        if cached:
            return cached

        # Fallback: reconstruct from Neo4j
        try:
            async with db_manager.session() as s:
                result = await s.run("""
                    MATCH (n {session_id: $sid})
                    OPTIONAL MATCH (n)-[r {session_id: $sid}]->(m)
                    RETURN collect(DISTINCT {
                        id: COALESCE(n.address, n.upi_id, n.number, n.cin),
                        label: n.label,
                        node_type: n.node_type,
                        flagged: n.flagged
                    }) AS nodes,
                    collect(DISTINCT {
                        source: COALESCE(n.address, n.upi_id, n.number),
                        target: COALESCE(m.address, m.upi_id, m.number),
                        label: r.label,
                        amount: r.amount
                    }) AS edges
                """, sid=session_id)
                record = await result.single()
                if record:
                    return {"nodes": record["nodes"], "edges": record["edges"]}
        except Exception as e:
            logger.error(f"Graph load from Neo4j failed: {e}")
        return None

    async def get_neighbours(self, identifier: str, hops: int = 1) -> list[dict]:
        """
        Returns immediate neighbours of a node up to `hops` away.
        Used for "expand this node" interactions in the UI.
        """
        try:
            async with db_manager.session() as s:
                result = await s.run("""
                    MATCH (seed)-[*1..$hops]-(neighbour)
                    WHERE seed.address = $id OR seed.upi_id = $id
                       OR seed.number = $id OR seed.cin = $id
                    RETURN DISTINCT
                        COALESCE(neighbour.address, neighbour.upi_id,
                                 neighbour.number, neighbour.cin) AS id,
                        labels(neighbour)[0] AS type,
                        neighbour.flagged AS flagged,
                        neighbour.label AS label
                    LIMIT 50
                """, id=identifier, hops=hops)
                records = []
                async for record in result:
                    if record["id"]:
                        records.append(dict(record))
                return records
        except Exception as e:
            logger.warning(f"Neighbour query failed: {e}")
            return []

    async def flag_entity(self, identifier: str, reason: str = "") -> bool:
        """
        Manually flags an entity as suspicious across all saved graphs.
        Called when an investigator marks a node as confirmed fraud.
        """
        try:
            async with db_manager.session() as s:
                await s.run("""
                    MATCH (n)
                    WHERE n.address = $id OR n.upi_id = $id
                       OR n.number = $id OR n.cin = $id
                    SET n.flagged = true,
                        n.flag_reason = $reason,
                        n.flagged_at = datetime()
                """, id=identifier, reason=reason)
            await cache_manager.invalidate_pattern(f"*{identifier}*")
            return True
        except Exception as e:
            logger.error(f"Flag entity failed: {e}")
            return False

    # ── Node type helpers ────────────────────────────────

    def _node_label(self, node: GraphNode) -> str:
        """Maps NodeType enum to Neo4j label string."""
        label_map = {
            "wallet_btc":   "Wallet",
            "wallet_eth":   "Wallet",
            "wallet_tron":  "Wallet",
            "upi_account":  "UpiAccount",
            "bank_account": "BankAccount",
            "phone":        "Phone",
            "company":      "Company",
            "person":       "Person",
            "exchange":     "Exchange",
        }
        return label_map.get(node.node_type.value, "Entity")

    def _node_id_field(self, node: GraphNode) -> str:
        """Returns the primary identifier field name for a node type."""
        field_map = {
            "wallet_btc":   "address",
            "wallet_eth":   "address",
            "wallet_tron":  "address",
            "upi_account":  "upi_id",
            "bank_account": "account_number",
            "phone":        "number",
            "company":      "cin",
            "person":       "din",
        }
        return field_map.get(node.node_type.value, "identifier")


# Singleton
graph_service = GraphService()
