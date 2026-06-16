"""
app/services/risk_service.py
─────────────────────────────
Centralised Risk Scoring Engine

Aggregates signals from all 4 modules to produce a unified
risk score for any entity in the investigation graph.

SCORING SIGNALS:
  Crypto:
    - Appears in known fraud wallet blacklists (OFAC, Chainalysis)
    - Funds routed through mixers / tumblers
    - High-velocity small transactions (structuring)
    - Direct connection to dark market wallets

  UPI / Bank:
    - Referenced in 1+ NCRP complaints
    - Mule account pattern (receive → pass through immediately)
    - Account age < 30 days at time of first suspicious tx
    - Multiple UPI IDs registered to same phone

  Shell Company:
    - No annual returns filed
    - Struck-off status
    - Director on 10+ other companies simultaneously
    - Incorporation address shared by many companies

  Social:
    - High betweenness centrality (broker/hub node)
    - Phone registered to 3+ UPI IDs
    - Appears in multiple complaint records

RISK LEVELS:
  HIGH   — confirmed fraud indicators, immediate action recommended
  MEDIUM — strong suspicious signals, warrant further investigation
  LOW    — weak signals, monitor only
  CLEAN  — no signals found
"""

from loguru import logger
from app.models.graph import GraphNode, RiskLevel
from app.core.database import db_manager


class RiskService:
    """Computes and persists risk scores for graph entities."""

    # Weights for each signal (tuned for Indian financial crime patterns)
    WEIGHTS = {
        "ncrp_complaint":         30,   # direct NCRP complaint reference
        "mule_passthrough":       25,   # receive → forward ≥ 80% within 24h
        "mixer_interaction":      20,   # crypto mixer usage
        "multi_upi_phone":        15,   # 3+ UPIs on one phone
        "no_annual_return":       15,   # company not filing
        "struck_off":             20,   # company struck off but active
        "director_overload":      10,   # director on 10+ companies
        "new_account_fraud":      20,   # account <30 days old at fraud time
        "complaint_hub":          25,   # appears in 5+ complaints
        "high_centrality":        15,   # social graph hub
        "cross_layer_flagged":    20,   # flagged in 2+ modules
    }

    async def score_node(self, node: GraphNode, signals: list[str]) -> tuple[RiskLevel, int]:
        """
        Computes a risk score for a node given a list of active signal keys.

        Args:
            node:    The GraphNode to score
            signals: List of signal keys from WEIGHTS that apply to this node

        Returns:
            (RiskLevel, raw_score) tuple
        """
        score = sum(self.WEIGHTS.get(sig, 0) for sig in signals)

        if score >= 50:
            level = RiskLevel.HIGH
        elif score >= 25:
            level = RiskLevel.MEDIUM
        elif score >= 10:
            level = RiskLevel.LOW
        else:
            level = RiskLevel.CLEAN

        # Persist score back to Neo4j
        await self._save_score(node.id, score, level, signals)
        return level, score

    async def check_blacklists(self, identifier: str) -> list[str]:
        """
        Checks identifier against known blacklists stored in Neo4j.
        Returns list of matching blacklist sources.

        In production: integrate with:
          - OFAC SDN list (US sanctions — wallets)
          - Chainalysis KYT (crypto risk API)
          - I4C / NCRP internal blacklist
          - RBI defaulter list
        """
        matches = []
        try:
            async with db_manager.session() as s:
                result = await s.run("""
                    MATCH (bl:Blacklist)
                    WHERE bl.identifier = $id
                    RETURN bl.source AS source, bl.reason AS reason
                """, id=identifier)
                async for record in result:
                    matches.append(record["source"])
        except Exception as e:
            logger.warning(f"Blacklist check failed: {e}")
        return matches

    async def add_to_blacklist(self, identifier: str, source: str, reason: str) -> bool:
        """
        Adds an identifier to the internal blacklist in Neo4j.
        Called when an investigator confirms a fraud entity.
        """
        try:
            async with db_manager.session() as s:
                await s.run("""
                    MERGE (bl:Blacklist {identifier: $id})
                    SET bl.source = $source,
                        bl.reason = $reason,
                        bl.added_at = datetime()
                """, id=identifier, source=source, reason=reason)
            return True
        except Exception as e:
            logger.error(f"Blacklist add failed: {e}")
            return False

    async def bulk_score_graph(self, nodes: list[GraphNode]) -> dict[str, RiskLevel]:
        """
        Scores all nodes in a graph in one pass.
        Returns: {node_id: RiskLevel} mapping.

        More efficient than calling score_node() individually.
        """
        results = {}
        for node in nodes:
            signals = []
            if node.flagged:
                signals.append("ncrp_complaint")
            if len(node.metadata.get("layers", [])) >= 2:
                signals.append("cross_layer_flagged")
            if node.metadata.get("complaint_count", 0) >= 5:
                signals.append("complaint_hub")
            if node.metadata.get("centrality", 0) > 0.3:
                signals.append("high_centrality")
            if node.metadata.get("director_count", 0) >= 10:
                signals.append("director_overload")

            level, _ = await self.score_node(node, signals)
            results[node.id] = level
        return results

    async def _save_score(self, identifier: str, score: int, level: RiskLevel, signals: list[str]):
        """Persists the computed risk score back into Neo4j for the entity."""
        try:
            async with db_manager.session() as s:
                await s.run("""
                    MATCH (n)
                    WHERE n.address = $id OR n.upi_id = $id
                       OR n.number = $id OR n.cin = $id
                    SET n.risk_score  = $score,
                        n.risk_level  = $level,
                        n.risk_signals = $signals,
                        n.scored_at   = datetime()
                """, id=identifier, score=score,
                     level=level.value, signals=signals)
        except Exception as e:
            logger.warning(f"Risk score save failed for {identifier}: {e}")


# Singleton
risk_service = RiskService()
