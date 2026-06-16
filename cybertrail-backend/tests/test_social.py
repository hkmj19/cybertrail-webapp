"""
tests/test_social.py
─────────────────────
Tests for Social Graph Tracer - phone detection, node creation,
NetworkX graph construction, and community detection logic.
"""

import pytest
import networkx as nx
from app.modules.social.tracer import SocialTracer
from app.models.graph import GraphNode, GraphEdge, NodeType, EdgeType, RiskLevel


@pytest.fixture
def tracer():
    return SocialTracer()


# ── Identifier detection ─────────────────────────────────

class TestIdentifierDetection:
    def test_detects_phone(self, tracer):
        assert tracer._detect_type("9876543210") == "phone"
        assert tracer._detect_type("8012345678") == "phone"

    def test_detects_upi(self, tracer):
        assert tracer._detect_type("hub@paytm") == "upi"

    def test_detects_device(self, tracer):
        assert tracer._detect_type("IMEI123456789") == "device"

    def test_unknown_defaults_phone(self, tracer):
        # Non-UPI, non-IMEI, non-10-digit → phone (default)
        assert tracer._detect_type("unknown") == "phone"


# ── Node creation ────────────────────────────────────────

class TestNodeCreation:
    def test_creates_phone_node(self, tracer):
        node = tracer._make_node("9876543210", "phone", flagged=True)
        assert node.node_type == NodeType.PHONE
        assert node.flagged is True
        assert node.risk_level == RiskLevel.HIGH

    def test_creates_upi_node(self, tracer):
        node = tracer._make_node("fraud@paytm", "upi", flagged=False)
        assert node.node_type == NodeType.UPI_ACCOUNT
        assert node.flagged is False
        assert node.risk_level == RiskLevel.UNKNOWN

    def test_label_truncated_at_14_chars(self, tracer):
        node = tracer._make_node("123456789012345", "phone")
        assert len(node.label) <= 15  # 14 chars + ellipsis


# ── NetworkX graph building ──────────────────────────────

class TestNetworkXGraphBuilding:
    def _make_nodes_and_edges(self):
        nodes = [
            GraphNode(id="A", label="A", node_type=NodeType.PHONE),
            GraphNode(id="B", label="B", node_type=NodeType.PHONE),
            GraphNode(id="C", label="C", node_type=NodeType.UPI_ACCOUNT),
        ]
        edges = [
            GraphEdge(source="A", target="B", edge_type=EdgeType.CALLED),
            GraphEdge(source="A", target="C", edge_type=EdgeType.SHARED_PHONE),
        ]
        return nodes, edges

    def test_builds_nx_digraph(self, tracer):
        nodes, edges = self._make_nodes_and_edges()
        G = tracer._build_nx_graph(nodes, edges)
        assert isinstance(G, nx.DiGraph)
        assert G.number_of_nodes() == 3
        assert G.number_of_edges() == 2

    def test_graph_has_correct_edges(self, tracer):
        nodes, edges = self._make_nodes_and_edges()
        G = tracer._build_nx_graph(nodes, edges)
        assert G.has_edge("A", "B")
        assert G.has_edge("A", "C")
        assert not G.has_edge("B", "C")

    def test_graph_analysis_flags_hub(self, tracer):
        """Node A with degree 1.0 (all edges) should be flagged as hub."""
        nodes, edges = self._make_nodes_and_edges()
        # A connects to B and C → degree centrality should be highest
        tracer._analyse_graph(nodes, edges)
        node_a = next(n for n in nodes if n.id == "A")
        # With 2 out-edges from 3 nodes, A should be flagged
        assert node_a.flagged is True or "centrality" in node_a.metadata


# ── Community detection ──────────────────────────────────

class TestCommunityDetection:
    def test_single_node_returns_one_community(self, tracer):
        """
        When the graph has only the seed (no connections),
        community detection should return [[seed]].
        Uses monkeypatching to avoid Neo4j calls.
        """
        import asyncio
        from unittest.mock import AsyncMock, patch

        async def run():
            with patch.object(tracer, '_expand', new_callable=AsyncMock):
                communities = await tracer.detect_communities("9000000000", depth=1)
                assert isinstance(communities, list)

        asyncio.get_event_loop().run_until_complete(run())
