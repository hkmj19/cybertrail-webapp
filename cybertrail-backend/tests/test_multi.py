"""
tests/test_multi.py
────────────────────
Tests for the Multi-layer Graph Combiner.

Tests cover:
  - Layer merging (node deduplication across layers)
  - Cross-layer link detection
  - Unified risk scoring
  - Risk level comparison helper
"""

import pytest
from app.modules.multi.combiner import MultiLayerCombiner
from app.models.graph import (
    GraphNode, GraphEdge, InvestigationGraph,
    NodeType, EdgeType, RiskLevel
)
import uuid


@pytest.fixture
def combiner():
    return MultiLayerCombiner()


def make_graph(module: str, nodes: list[GraphNode], edges: list[GraphEdge]) -> InvestigationGraph:
    """Helper to create a minimal InvestigationGraph for testing."""
    return InvestigationGraph(
        session_id=str(uuid.uuid4()),
        seed_identifier="test",
        module=module,
        nodes=nodes,
        edges=edges,
    )


# ── Layer merging ────────────────────────────────────────

class TestLayerMerging:
    def test_unique_nodes_added(self, combiner):
        """Nodes from different layers with different IDs should all appear."""
        all_nodes = {}
        all_edges = []
        graph = make_graph("crypto", [
            GraphNode(id="wallet_A", label="A", node_type=NodeType.WALLET_BTC),
            GraphNode(id="wallet_B", label="B", node_type=NodeType.WALLET_BTC),
        ], [])
        combiner._merge_layer(graph, "crypto", all_nodes, all_edges)
        assert len(all_nodes) == 2
        assert "wallet_A" in all_nodes
        assert "wallet_B" in all_nodes

    def test_duplicate_node_ids_merged_not_duplicated(self, combiner):
        """Same node ID appearing in two layers should be merged, not duplicated."""
        all_nodes = {}
        all_edges = []

        graph1 = make_graph("crypto", [
            GraphNode(id="shared_phone", label="Phone", node_type=NodeType.PHONE, flagged=False),
        ], [])
        graph2 = make_graph("upi", [
            GraphNode(id="shared_phone", label="Phone", node_type=NodeType.PHONE, flagged=True),
        ], [])

        combiner._merge_layer(graph1, "crypto", all_nodes, all_edges)
        combiner._merge_layer(graph2, "upi", all_nodes, all_edges)

        # Should have exactly 1 node, not 2
        assert len(all_nodes) == 1
        # Should be flagged (UPI layer flagged it)
        assert all_nodes["shared_phone"].flagged is True
        # Should carry both layer labels
        assert "crypto" in all_nodes["shared_phone"].metadata.get("layers", [])
        assert "upi" in all_nodes["shared_phone"].metadata.get("layers", [])

    def test_layer_tag_added_to_node_metadata(self, combiner):
        """Each merged node should have a 'layers' list in metadata."""
        all_nodes = {}
        graph = make_graph("shell", [
            GraphNode(id="company_X", label="X", node_type=NodeType.COMPANY),
        ], [])
        combiner._merge_layer(graph, "shell", all_nodes, [])
        assert "layers" in all_nodes["company_X"].metadata
        assert all_nodes["company_X"].metadata["layers"] == ["shell"]

    def test_edges_tagged_with_layer(self, combiner):
        """Edges should carry a 'layer' key in their metadata."""
        all_nodes = {}
        all_edges = []
        graph = make_graph("upi", [], [
            GraphEdge(source="A", target="B", edge_type=EdgeType.UPI_TX, label="₹5 L"),
        ])
        combiner._merge_layer(graph, "upi", all_nodes, all_edges)
        assert all_edges[0].metadata.get("layer") == "upi"


# ── Cross-layer link detection ───────────────────────────

class TestCrossLayerLinks:
    def test_cross_layer_edge_created_for_shared_node(self, combiner):
        """A node in both crypto and social layers should generate a cross-layer edge."""
        all_nodes = {
            "shared_id": GraphNode(
                id="shared_id", label="Shared",
                node_type=NodeType.PHONE,
                metadata={"layers": ["crypto", "social"]}
            )
        }
        layer_results = {}  # not needed for this test
        cross_edges = combiner._find_cross_layer_links(all_nodes, layer_results)
        assert len(cross_edges) == 1
        assert cross_edges[0].metadata.get("cross_layer") is True
        assert "shared_id" in cross_edges[0].metadata.get("node_id", "")

    def test_no_cross_edges_for_single_layer_nodes(self, combiner):
        """Nodes that only appear in one layer should produce no cross-layer edges."""
        all_nodes = {
            "only_crypto": GraphNode(
                id="only_crypto", label="Solo",
                node_type=NodeType.WALLET_BTC,
                metadata={"layers": ["crypto"]}
            )
        }
        cross_edges = combiner._find_cross_layer_links(all_nodes, {})
        assert len(cross_edges) == 0


# ── Unified risk scoring ─────────────────────────────────

class TestUnifiedRiskScoring:
    def test_three_layer_node_gets_high_risk(self, combiner):
        """A node flagged in 3+ layers should be elevated to HIGH and flagged."""
        nodes = {
            "multi_hub": GraphNode(
                id="multi_hub", label="Hub",
                node_type=NodeType.PHONE,
                flagged=False,
                risk_level=RiskLevel.LOW,
                metadata={"layers": ["crypto", "upi", "social"]}
            )
        }
        combiner._apply_unified_risk(nodes, [])
        assert nodes["multi_hub"].flagged is True
        assert nodes["multi_hub"].risk_level == RiskLevel.HIGH
        assert nodes["multi_hub"].metadata.get("multi_layer_hub") is True

    def test_two_layer_flagged_node_stays_high(self, combiner):
        """A node flagged in exactly 2 layers should become HIGH."""
        nodes = {
            "dual_layer": GraphNode(
                id="dual_layer", label="Dual",
                node_type=NodeType.PHONE,
                flagged=True,
                risk_level=RiskLevel.MEDIUM,
                metadata={"layers": ["upi", "social"]}
            )
        }
        combiner._apply_unified_risk(nodes, [])
        assert nodes["dual_layer"].risk_level == RiskLevel.HIGH

    def test_single_layer_node_unchanged(self, combiner):
        """Nodes from only one layer should not be auto-elevated."""
        nodes = {
            "single": GraphNode(
                id="single", label="Single",
                node_type=NodeType.WALLET_BTC,
                flagged=False,
                risk_level=RiskLevel.UNKNOWN,
                metadata={"layers": ["crypto"]}
            )
        }
        combiner._apply_unified_risk(nodes, [])
        assert nodes["single"].flagged is False
        assert nodes["single"].risk_level == RiskLevel.UNKNOWN


# ── Risk level comparison ────────────────────────────────

class TestRiskLevelComparison:
    def test_risk_ordering(self, combiner):
        """HIGH > MEDIUM > LOW > CLEAN > UNKNOWN in numeric value."""
        assert combiner._risk_value(RiskLevel.HIGH)    > combiner._risk_value(RiskLevel.MEDIUM)
        assert combiner._risk_value(RiskLevel.MEDIUM)  > combiner._risk_value(RiskLevel.LOW)
        assert combiner._risk_value(RiskLevel.LOW)     > combiner._risk_value(RiskLevel.CLEAN)
        assert combiner._risk_value(RiskLevel.CLEAN)   > combiner._risk_value(RiskLevel.UNKNOWN)
