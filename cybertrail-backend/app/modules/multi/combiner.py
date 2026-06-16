"""
app/modules/multi/combiner.py
──────────────────────────────
Multi-layer Graph Module
═════════════════════════
Combines all investigation modules into one unified graph.

WHY MULTI-LAYER?
  Real financial crime spans multiple domains simultaneously:
    - A suspect controls a crypto wallet (crypto layer)
    - Which funds a shell company (shell layer)
    - Whose UPI is linked to a mule chain (UPI layer)
    - All reachable by a single phone number (social layer)

  Multi-layer graph merges these by finding shared identifiers
  across layers and drawing CROSS_LAYER edges between them.
  This reveals the full criminal network in one view.

FLOW:
  1. Run all 4 module tracers with the same seed / depth
  2. Collect all nodes from each module
  3. Find cross-layer matches (e.g., same phone in UPI + social layers)
  4. Add CROSS_LAYER edges between matched nodes
  5. Run unified risk scoring across the merged graph
  6. Return a single InvestigationGraph with layer metadata on each node
"""

import uuid
from loguru import logger
from typing import Optional

from app.models.graph import (
    GraphNode, GraphEdge, InvestigationGraph,
    NodeType, EdgeType, RiskLevel,
    CryptoTraceRequest, UPITraceRequest, ShellTraceRequest, SocialTraceRequest
)
from app.modules.crypto.tracer import CryptoTracer
from app.modules.upi.tracer import UPITracer
from app.modules.shell.tracer import ShellTracer
from app.modules.social.tracer import SocialTracer


class MultiLayerCombiner:
    """
    Orchestrates all 4 investigation modules and merges their results.

    Usage:
        combiner = MultiLayerCombiner()
        graph = await combiner.combine(request)
    """

    def __init__(self):
        self.crypto_tracer = CryptoTracer()
        self.upi_tracer    = UPITracer()
        self.shell_tracer  = ShellTracer()
        self.social_tracer = SocialTracer()

    # ── Public entry point ───────────────────────────────

    async def combine(
        self,
        identifier: str,
        depth: int = 2,
        force_refresh: bool = False,
        modules: list[str] | None = None,
    ) -> InvestigationGraph:
        """
        Runs selected modules on the same identifier and merges results.

        Args:
            identifier:    The seed (wallet, UPI, phone, CIN — auto-detected per module)
            depth:         Hop depth for each module
            force_refresh: Bypass cache
            modules:       Which modules to run. None = all 4.

        Returns:
            Merged InvestigationGraph with cross-layer edges added.
        """
        modules = modules or ["crypto", "upi", "shell", "social"]
        logger.info(f"Multi-layer trace: {identifier}, modules={modules}, depth={depth}")

        all_nodes: dict[str, GraphNode] = {}
        all_edges: list[GraphEdge] = []
        layer_results: dict[str, InvestigationGraph] = {}

        # ── Run each module concurrently ─────────────────
        # In production use asyncio.gather for true parallelism
        if "crypto" in modules:
            try:
                result = await self.crypto_tracer.trace(
                    CryptoTraceRequest(identifier=identifier, depth=depth, force_refresh=force_refresh)
                )
                layer_results["crypto"] = result
                self._merge_layer(result, "crypto", all_nodes, all_edges)
            except Exception as e:
                logger.warning(f"Crypto layer failed: {e}")

        if "upi" in modules:
            try:
                result = await self.upi_tracer.trace(
                    UPITraceRequest(identifier=identifier, depth=depth, force_refresh=force_refresh)
                )
                layer_results["upi"] = result
                self._merge_layer(result, "upi", all_nodes, all_edges)
            except Exception as e:
                logger.warning(f"UPI layer failed: {e}")

        if "shell" in modules:
            try:
                result = await self.shell_tracer.trace(
                    ShellTraceRequest(identifier=identifier, depth=depth, force_refresh=force_refresh)
                )
                layer_results["shell"] = result
                self._merge_layer(result, "shell", all_nodes, all_edges)
            except Exception as e:
                logger.warning(f"Shell layer failed: {e}")

        if "social" in modules:
            try:
                result = await self.social_tracer.trace(
                    SocialTraceRequest(identifier=identifier, depth=depth, force_refresh=force_refresh)
                )
                layer_results["social"] = result
                self._merge_layer(result, "social", all_nodes, all_edges)
            except Exception as e:
                logger.warning(f"Social layer failed: {e}")

        # ── Add cross-layer edges ─────────────────────────
        cross_edges = self._find_cross_layer_links(all_nodes, layer_results)
        all_edges.extend(cross_edges)

        # ── Unified risk scoring ──────────────────────────
        self._apply_unified_risk(all_nodes, all_edges)

        total_inr = sum(
            g.total_value_inr or 0 for g in layer_results.values()
            if g.total_value_inr
        )

        return InvestigationGraph(
            session_id=str(uuid.uuid4()),
            seed_identifier=identifier,
            module="multi",
            nodes=list(all_nodes.values()),
            edges=all_edges,
            hops_explored=depth,
            total_value_inr=total_inr or None,
        )

    # ── Merging ──────────────────────────────────────────

    def _merge_layer(
        self,
        result: InvestigationGraph,
        layer: str,
        all_nodes: dict[str, GraphNode],
        all_edges: list[GraphEdge],
    ):
        """
        Merges a single module's graph into the combined graph.
        Annotates each node with which layer it came from.
        If a node ID already exists from another layer,
        merges metadata rather than overwriting.
        """
        for node in result.nodes:
            if node.id in all_nodes:
                # Node seen in another layer — merge metadata
                existing = all_nodes[node.id]
                existing.metadata["layers"] = list(
                    set(existing.metadata.get("layers", []) + [layer])
                )
                # Upgrade risk if this layer found it higher
                if node.flagged:
                    existing.flagged = True
                if self._risk_value(node.risk_level) > self._risk_value(existing.risk_level):
                    existing.risk_level = node.risk_level
            else:
                node.metadata["layers"] = [layer]
                all_nodes[node.id] = node

        for edge in result.edges:
            # ── Only add edges where BOTH nodes exist in the merged graph ──
            # Edges referencing nodes from other layers that weren't merged
            # will cause Cytoscape to render nothing (phantom edge references).
            if edge.source in all_nodes and edge.target in all_nodes:
                edge.metadata["layer"] = layer
                all_edges.append(edge)
            # else: silently drop — the node will appear but without this edge

    def _find_cross_layer_links(
        self,
        all_nodes: dict[str, GraphNode],
        layer_results: dict[str, InvestigationGraph],
    ) -> list[GraphEdge]:
        """
        Previously created phantom edges with prefixed IDs like crypto:fraud@paytm
        which do not match any real node IDs — causing Cytoscape to render nothing.
        Now returns empty list. Multi-layer info is shown via node metadata (layers tag).
        """
        multi_count = sum(
            1 for n in all_nodes.values()
            if len(n.metadata.get("layers", [])) > 1
        )
        logger.info(f"Found {multi_count} cross-layer nodes (merged into single nodes).")
        return []

    # ── Unified risk scoring ─────────────────────────────

    def _apply_unified_risk(self, nodes: dict[str, GraphNode], edges: list[GraphEdge]):
        """
        Re-scores all nodes using cross-layer evidence.
        A node flagged in 2+ layers is elevated to HIGH risk.
        A node with many cross-layer edges is considered a hub (HIGH risk).
        """
        # Count how many layers each node appears in
        for nid, node in nodes.items():
            layer_count = len(node.metadata.get("layers", []))
            if layer_count >= 3:
                node.flagged = True
                node.risk_level = RiskLevel.HIGH
                node.metadata["multi_layer_hub"] = True
            elif layer_count == 2 and node.flagged:
                node.risk_level = RiskLevel.HIGH

    # ── Helpers ──────────────────────────────────────────

    def _risk_value(self, risk: RiskLevel) -> int:
        """Converts risk level to int for comparison."""
        return {"high": 4, "medium": 3, "low": 2, "clean": 1, "unknown": 0}.get(risk.value, 0)