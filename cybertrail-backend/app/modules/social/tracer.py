"""
app/modules/social/tracer.py
────────────────────────────
Social / Communication Graph Module
═════════════════════════════════════
Maps phone networks, shared identifiers across accounts, and
communication links between suspects.

FLOW:
  1. Accept a seed phone number, UPI ID, or email
  2. Find all accounts/identities sharing this identifier
  3. Expand to their linked identifiers (same phone → multiple UPIs)
  4. Detect clusters of related individuals (gang/network detection)
  5. Flag phones appearing in multiple complaint records
  6. Cross-reference with crypto and UPI graphs (multi-layer linkage)

DATA SOURCES:
  - Internal complaint DB (phone numbers from FIR data)
  - Telecom CDR data (if law enforcement API access granted)
  - UPI registration data (cross-linked from UPI module)
  - Shared device fingerprints (IMEI from complaint data)

NETWORK ANALYSIS:
  - Betweenness centrality → finds "hub" phones that broker transactions
  - Community detection → clusters connected suspects
  - Shortest path → finds linkage between two suspects
"""

import uuid
import networkx as nx
from loguru import logger

from app.core.database import db_manager
from app.models.graph import (
    GraphNode, GraphEdge, InvestigationGraph,
    NodeType, EdgeType, RiskLevel, SocialTraceRequest
)


class SocialTracer:
    """
    Traces social/communication networks between suspects.

    Usage:
        tracer = SocialTracer()
        graph = await tracer.trace(request)
        # Also: await tracer.find_shortest_path(phone_a, phone_b)
        # Also: await tracer.detect_communities(seed_phone)
    """

    # ── Public entry point ───────────────────────────────

    async def trace(self, request: SocialTraceRequest) -> InvestigationGraph:
        """
        Main trace. Builds communication/identity network from seed.
        """
        identifier = request.identifier
        id_type = request.identifier_type
        if id_type == "auto":
            id_type = self._detect_type(identifier)

        logger.info(f"Social trace: {identifier} (type={id_type}), depth={request.depth}")

        nodes: dict[str, GraphNode] = {}
        edges: list[GraphEdge] = []

        await self._expand(identifier, id_type, request.depth, nodes, edges, set())

        if not nodes:
            nodes[identifier] = self._make_node(identifier, id_type)

        # Run network analysis on what we found
        analysis = self._analyse_graph(list(nodes.values()), edges)

        return InvestigationGraph(
            session_id=str(uuid.uuid4()),
            seed_identifier=identifier,
            module="social",
            nodes=list(nodes.values()),
            edges=edges,
            hops_explored=request.depth,
            total_value_inr=None,
        )

    async def find_shortest_path(self, identifier_a: str, identifier_b: str) -> list[str]:
        """
        Finds the shortest connection path between two identifiers in Neo4j.
        Useful for: "Is suspect A linked to suspect B, and how?"

        Returns: list of node IDs forming the path, empty if no path exists.
        """
        try:
            async with db_manager.session() as s:
                result = await s.run("""
                    MATCH path = shortestPath(
                        (a {identifier: $a})-[*..10]-(b {identifier: $b})
                    )
                    RETURN [node in nodes(path) | COALESCE(
                        node.number, node.upi_id, node.address, node.cin
                    )] AS path_ids
                    LIMIT 1
                """, a=identifier_a, b=identifier_b)
                record = await result.single()
                if record:
                    return record["path_ids"]
        except Exception as e:
            logger.warning(f"Shortest path failed: {e}")
        return []

    async def detect_communities(self, seed: str, depth: int = 3) -> list[list[str]]:
        """
        Detects communities (clusters of related suspects) around a seed.
        Uses Louvain community detection via NetworkX.

        Returns: list of communities, each community is a list of node IDs.
        """
        nodes: dict[str, GraphNode] = {}
        edges: list[GraphEdge] = []
        await self._expand(seed, "auto", depth, nodes, edges, set())

        G = self._build_nx_graph(list(nodes.values()), edges)
        if G.number_of_nodes() < 2:
            return [[seed]]

        # Louvain requires undirected graph
        undirected = G.to_undirected()
        try:
            communities = nx.community.louvain_communities(undirected, seed=42)
            return [list(c) for c in communities]
        except Exception as e:
            logger.warning(f"Community detection failed: {e}")
            return [[n] for n in G.nodes()]

    # ── Graph expansion ──────────────────────────────────

    async def _expand(
        self, identifier: str, id_type: str, depth: int,
        nodes: dict, edges: list, visited: set
    ):
        """
        Expands the social graph from `identifier` by querying Neo4j.
        Finds all identities sharing any attribute with the seed.
        """
        if identifier in visited or depth <= 0:
            return
        visited.add(identifier)

        seed_node = self._make_node(identifier, id_type, flagged=False)
        nodes[identifier] = seed_node

        # Query all connections from Neo4j
        connections = await self._query_social_connections(identifier, id_type)

        for conn in connections:
            cid       = conn["id"]
            ctype     = conn["type"]
            rel       = conn["relationship"]
            direction = conn.get("direction", "outgoing")

            if cid not in nodes:
                nodes[cid] = self._make_node(cid, ctype, flagged=bool(conn.get("flagged") or False))

            edge_type_map = {
                "CALLED": EdgeType.CALLED,
                "REGISTERED": EdgeType.REGISTERED,
                "ASSOCIATED": EdgeType.ASSOCIATED,
                "SHARED_PHONE": EdgeType.SHARED_PHONE,
                "SHARED_UPI": EdgeType.SHARED_UPI,
                "UPI_TX": EdgeType.UPI_TX,
            }
            src = identifier if direction == "outgoing" else cid
            tgt = cid        if direction == "outgoing" else identifier
            edges.append(GraphEdge(
                source=src,
                target=tgt,
                edge_type=edge_type_map.get(rel, EdgeType.SHARED_PHONE),
                label=rel.lower().replace("_", " "),
                metadata={"frequency": conn.get("frequency", 1)},
            ))

            await self._expand(cid, ctype, depth - 1, nodes, edges, visited)

    async def _query_social_connections(self, identifier: str, id_type: str) -> list[dict]:
        """
        Queries Neo4j for all social connections of an identifier.
        Looks across: Phone, UpiAccount, BankAccount, Device nodes.
        """
        results = []
        try:
            async with db_manager.session() as s:
                query = """
                    MATCH (p:Phone {number: $id})-[r]-(connected)
                    RETURN
                        COALESCE(connected.number, connected.upi_id, connected.imei) AS id,
                        labels(connected)[0] AS type,
                        type(r) AS relationship,
                        connected.flagged AS flagged,
                        r.frequency AS frequency,
                        CASE WHEN startNode(r) = p THEN 'outgoing' ELSE 'incoming' END AS direction
                    LIMIT 30
                """
                if id_type == "upi":
                    query = query.replace("Phone", "UpiAccount").replace("number", "upi_id").replace(" = p ", " = p ")

                res = await s.run(query, id=identifier)
                async for record in res:
                    if record["id"]:
                        results.append(dict(record))
        except Exception as e:
            logger.warning(f"Social query failed for {identifier}: {e}")
        return results

    # ── NetworkX analysis ────────────────────────────────

    def _build_nx_graph(self, nodes: list[GraphNode], edges: list[GraphEdge]) -> nx.DiGraph:
        """
        Converts our graph model to a NetworkX DiGraph for analysis.
        NetworkX provides centrality, clustering, path algorithms.
        """
        G = nx.DiGraph()
        for node in nodes:
            G.add_node(node.id, **node.metadata)
        for edge in edges:
            G.add_edge(edge.source, edge.target, relationship=edge.edge_type.value)
        return G

    def _analyse_graph(self, nodes: list[GraphNode], edges: list[GraphEdge]) -> dict:
        """
        Runs network analysis and annotates high-centrality nodes as flagged.
        Returns analysis summary dict.

        Metrics computed:
          - Degree centrality: nodes with many connections (hubs)
          - Betweenness centrality: nodes that bridge different clusters (brokers)
        """
        if len(nodes) < 2:
            return {}

        G = self._build_nx_graph(nodes, edges)
        try:
            degree_centrality = nx.degree_centrality(G)
            betweenness = nx.betweenness_centrality(G)

            # Flag top-3 hub nodes
            top_hubs = sorted(degree_centrality, key=degree_centrality.get, reverse=True)[:3]
            node_map = {n.id: n for n in nodes}
            for hub_id in top_hubs:
                if hub_id in node_map and degree_centrality[hub_id] > 0.3:
                    node_map[hub_id].flagged = True
                    node_map[hub_id].risk_level = RiskLevel.HIGH
                    node_map[hub_id].metadata["centrality"] = round(degree_centrality[hub_id], 3)

            return {
                "top_hubs": top_hubs,
                "total_components": nx.number_weakly_connected_components(G),
                "density": round(nx.density(G), 4),
            }
        except Exception as e:
            logger.warning(f"Graph analysis failed: {e}")
            return {}

    # ── Helpers ──────────────────────────────────────────

    def _detect_type(self, identifier: str) -> str:
        if "@" in identifier:
            return "upi"
        if identifier.isdigit() and len(identifier) == 10:
            return "phone"
        if identifier.upper().startswith("IMEI"):
            return "device"
        return "phone"

    def _make_node(self, identifier: str, id_type: str, flagged: bool = False) -> GraphNode:
        type_map = {
            "phone": NodeType.PHONE,
            "Phone": NodeType.PHONE,
            "upi": NodeType.UPI_ACCOUNT,
            "UpiAccount": NodeType.UPI_ACCOUNT,
            "device": NodeType.UNKNOWN,
        }
        return GraphNode(
            id=identifier,
            label=identifier if len(identifier) < 14 else identifier[:12] + "…",
            node_type=type_map.get(id_type, NodeType.PHONE),
            flagged=flagged,
            risk_level=RiskLevel.HIGH if flagged else RiskLevel.UNKNOWN,
        )

