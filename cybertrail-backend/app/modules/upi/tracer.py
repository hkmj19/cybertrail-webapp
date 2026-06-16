"""
app/modules/upi/tracer.py
─────────────────────────
UPI / Bank Fraud Tracer Module
════════════════════════════════
Maps UPI IDs, mobile numbers, and mule account chains from complaint data.

FLOW:
  1. Accept a seed identifier (UPI ID / phone / bank account)
  2. Look up all transactions linked to the seed in our complaint database
  3. Identify connected accounts (who sent/received money from seed)
  4. Score each account with a mule risk rating
  5. Expand graph to detect layering chains (mule → mule → mule)
  6. Save to Neo4j for cross-module correlation

DATA SOURCES:
  - Uploaded complaint CSVs (from FIR data, I4C/NCRP data exports)
  - Internal complaint database (Neo4j)
  - NPCI UPI API (if law enforcement API access available)

MULE DETECTION HEURISTICS:
  - Account created < 30 days before first suspicious tx
  - Receives large credit, immediately debits 90%+
  - Linked to 3+ complaint IDs
  - Phone registered multiple UPI IDs
"""

import uuid
import pandas as pd
import io
from datetime import datetime
from loguru import logger
from typing import Optional

from app.core.cache import cache_manager
from app.core.database import db_manager
from app.models.graph import (
    GraphNode, GraphEdge, InvestigationGraph,
    NodeType, EdgeType, RiskLevel, UPITraceRequest
)


class UPITracer:
    """
    Traces UPI fraud chains and mule account networks.

    Usage:
        tracer = UPITracer()
        graph = await tracer.trace(request)
        # Also: await tracer.ingest_complaint_csv(csv_bytes)
    """

    # ── Public entry point ───────────────────────────────

    async def trace(self, request: UPITraceRequest) -> InvestigationGraph:
        """
        Main trace function.
        Queries Neo4j for all accounts connected to the seed identifier.
        """
        identifier = request.identifier
        id_type = request.identifier_type
        if id_type == "auto":
            id_type = self._detect_type(identifier)

        logger.info(f"UPI trace: {identifier} (type={id_type}), depth={request.depth}")

        nodes: dict[str, GraphNode] = {}
        edges: list[GraphEdge] = []

        # Build graph from Neo4j complaint data
        await self._expand_from_db(identifier, id_type, request.depth, nodes, edges, set())

        # If no data yet (empty graph), return seed node only
        if not nodes:
            seed = self._make_node(identifier, id_type)
            nodes[seed.id] = seed

        return InvestigationGraph(
            session_id=str(uuid.uuid4()),
            seed_identifier=identifier,
            module="upi",
            nodes=list(nodes.values()),
            edges=edges,
            hops_explored=request.depth,
            total_value_inr=self._sum_values(edges),
        )

    async def ingest_complaint_csv(self, csv_bytes: bytes) -> dict:
        """
        Ingests a complaint CSV file (FIR data / NCRP export) into Neo4j.

        Expected CSV columns (flexible - we map what we find):
          complaint_id, complainant_phone, fraud_upi_id, fraud_phone,
          fraud_bank_account, amount_inr, transaction_date, description

        Returns: {"ingested": N, "nodes_created": M, "edges_created": K}
        """
        try:
            df = pd.read_csv(io.BytesIO(csv_bytes))
            df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]

            ingested = 0
            nodes_created = 0
            edges_created = 0

            async with db_manager.session() as s:
                for _, row in df.iterrows():
                    complaint_id = str(row.get("complaint_id", uuid.uuid4()))
                    amount = float(row.get("amount_inr", 0) or 0)
                    tx_date = str(row.get("transaction_date", ""))

                    fraud_upi   = str(row.get("fraud_upi_id", "")).strip()
                    fraud_phone = str(row.get("fraud_phone", "")).strip()
                    fraud_bank  = str(row.get("fraud_bank_account", "")).strip()
                    comp_phone  = str(row.get("complainant_phone", "")).strip()
                    comp_name   = str(row.get("complainant_name", "")).strip()
                    district    = str(row.get("district", "")).strip()
                    description = str(row.get("description", "")).strip()
                    fir_number  = str(row.get("fir_number", "")).strip()

                    # ── Create Complaint node (visible in complaints table) ──
                    await s.run("""
                        MERGE (c:Complaint {complaint_id: $cid})
                        SET c.complainant_name   = $comp_name,
                            c.complainant_phone  = $comp_phone,
                            c.fraud_upi_id       = $fraud_upi,
                            c.fraud_phone        = $fraud_phone,
                            c.fraud_bank_account = $fraud_bank,
                            c.amount_inr         = $amount,
                            c.transaction_date   = $tx_date,
                            c.fir_number         = $fir_number,
                            c.district           = $district,
                            c.description        = $description,
                            c.status             = COALESCE(c.status, 'open'),
                            c.source             = 'csv_import',
                            c.created_at         = COALESCE(c.created_at, datetime())
                    """, cid=complaint_id, comp_name=comp_name, comp_phone=comp_phone,
                         fraud_upi=fraud_upi if fraud_upi != "nan" else "",
                         fraud_phone=fraud_phone if fraud_phone != "nan" else "",
                         fraud_bank=fraud_bank if fraud_bank != "nan" else "",
                         amount=amount, tx_date=tx_date,
                         fir_number=fir_number, district=district, description=description)

                    # ── Create fraud UPI node ──
                    if fraud_upi and fraud_upi != "nan":
                        await s.run("""
                            MERGE (u:UpiAccount {upi_id: $id})
                            SET u.flagged = true,
                                u.complaint_count = COALESCE(u.complaint_count, 0) + 1,
                                u.label = $id,
                                u.node_type = 'upi_account'
                        """, id=fraud_upi)
                        nodes_created += 1

                        # Create edge: complainant_phone → fraud_upi
                        if comp_phone and comp_phone != "nan":
                            await s.run("""
                                MERGE (p:Phone {number: $phone})
                                SET p.label = $phone, p.node_type = 'phone'
                                WITH p
                                MERGE (u:UpiAccount {upi_id: $upi})
                                MERGE (p)-[r:UPI_TX {complaint_id: $cid}]->(u)
                                SET r.amount = $amount, r.date = $date, r.direction = 'debit'
                            """, phone=comp_phone, upi=fraud_upi, cid=complaint_id,
                                 amount=amount, date=tx_date)
                            edges_created += 1

                    # Link fraud phone to fraud UPI
                    if fraud_phone and fraud_phone != "nan" and fraud_upi and fraud_upi != "nan":
                        await s.run("""
                            MERGE (ph:Phone {number: $phone})
                            SET ph.flagged = true, ph.node_type = 'phone'
                            WITH ph
                            MERGE (u:UpiAccount {upi_id: $upi})
                            MERGE (ph)-[:REGISTERED]->(u)
                        """, phone=fraud_phone, upi=fraud_upi)
                        edges_created += 1

                    # Link fraud bank account
                    if fraud_bank and fraud_bank != "nan":
                        await s.run("""
                            MERGE (b:BankAccount {account_number: $acct})
                            SET b.flagged = true, b.node_type = 'bank_account'
                            WITH b
                            MATCH (u:UpiAccount {upi_id: $upi})
                            MERGE (u)-[:LINKED_BANK]->(b)
                        """, acct=fraud_bank, upi=fraud_upi if fraud_upi != "nan" else "unknown")
                        nodes_created += 1

                    ingested += 1

            logger.info(f"CSV ingested: {ingested} rows, {nodes_created} nodes, {edges_created} edges")
            return {"ingested": ingested, "nodes_created": nodes_created, "edges_created": edges_created}

        except Exception as e:
            logger.error(f"CSV ingest failed: {e}")
            raise

    # ── Graph expansion from Neo4j ───────────────────────

    async def _expand_from_db(
        self, identifier: str, id_type: str, depth: int,
        nodes: dict, edges: list, visited: set
    ):
        """
        Expands the fraud graph by querying Neo4j for connections to `identifier`.
        Recursively explores `depth` hops from the seed.
        """
        if identifier in visited or depth <= 0:
            return
        visited.add(identifier)

        connected = await self._query_connections(identifier, id_type)

        # Check if this identifier is actually flagged in Neo4j
        is_flagged = await self._check_flagged(identifier, id_type)

        # Add seed node - only flagged if it has actual complaints in DB
        seed = self._make_node(identifier, id_type, flagged=is_flagged)
        nodes[identifier] = seed

        seed_is_flagged = is_flagged

        for conn in connected:
            cid    = conn["id"]
            ctype  = conn["type"]
            amount = float(conn.get("amount") or 0)
            # 'outgoing' = identifier → cid, 'incoming' = cid → identifier
            direction = conn.get("direction", "outgoing")
            conn_flagged = bool(conn.get("flagged") or False)

            if cid not in nodes:
                # Color logic:
                # - Already flagged in DB (fraud account with complaints) → red
                # - Receives money FROM a flagged seed → mule account → amber
                # - Sends money TO identifier (victim) → keep natural type color
                is_mule = (direction == "outgoing" and seed_is_flagged and not conn_flagged)
                nodes[cid] = self._make_node(cid, ctype, flagged=conn_flagged, is_mule=is_mule)

            if direction == "incoming":
                src, tgt = cid, identifier
            else:
                src, tgt = identifier, cid

            edges.append(GraphEdge(
                source=src,
                target=tgt,
                edge_type=EdgeType.UPI_TX,
                label=self._fmt_amount(amount),
                amount=amount,
                currency="INR",
                metadata={
                    "complaint_count": conn.get("complaint_count", 0),
                    "direction": "inflow" if direction == "incoming" else "outflow" if amount else "linked",
                    "seed": identifier,
                },
            ))

            # Recurse into connected node
            await self._expand_from_db(cid, ctype, depth - 1, nodes, edges, visited)

    async def _check_flagged(self, identifier: str, id_type: str) -> bool:
        """
        Checks Neo4j to see if this identifier is actually flagged
        (i.e. has real complaints against it).
        Returns False for unknown/new identifiers.
        """
        try:
            async with db_manager.session() as s:
                if id_type == "upi":
                    result = await s.run(
                        "MATCH (u:UpiAccount {upi_id: $id}) RETURN u.flagged AS flagged, u.complaint_count AS cnt",
                        id=identifier
                    )
                elif id_type == "phone":
                    result = await s.run(
                        "MATCH (p:Phone {number: $id}) RETURN p.flagged AS flagged, p.complaint_count AS cnt",
                        id=identifier
                    )
                elif id_type == "bank_account":
                    result = await s.run(
                        "MATCH (b:BankAccount {account_number: $id}) RETURN b.flagged AS flagged, 0 AS cnt",
                        id=identifier
                    )
                else:
                    return False
                rec = await result.single()
                if not rec:
                    return False  # not in DB at all - clean unknown
                return bool(rec.get("flagged") or (rec.get("cnt") or 0) > 0)
        except Exception:
            return False

    async def _query_connections(self, identifier: str, id_type: str) -> list[dict]:
        """
        Queries Neo4j for all entities directly connected to this identifier.
        Returns a list of {id, type, amount, flagged, complaint_count, direction}.
        Uses collect(r) + reduce() to properly aggregate amounts across
        multiple relationship types between the same node pair.
        """
        results = []
        try:
            async with db_manager.session() as s:
                if id_type == "upi":
                    query = """
                        MATCH (u:UpiAccount {upi_id: $id})-[r]-(connected)
                        WITH u, connected, collect(r) AS rels
                        WITH
                            COALESCE(connected.upi_id, connected.number, connected.account_number) AS id,
                            labels(connected)[0] AS type,
                            connected.flagged AS flagged,
                            connected.complaint_count AS complaint_count,
                            reduce(s=0.0, rel IN rels | s + COALESCE(rel.amount, 0.0)) AS amount,
                            CASE
                                WHEN any(rel IN rels WHERE rel.direction = 'debit') THEN 'incoming'
                                WHEN any(rel IN rels WHERE rel.direction = 'transfer' AND startNode(rel) = u) THEN 'outgoing'
                                WHEN any(rel IN rels WHERE startNode(rel) = u) THEN 'outgoing'
                                ELSE 'incoming'
                            END AS direction
                        WHERE id IS NOT NULL
                        RETURN id, type, amount, flagged, complaint_count, direction
                        LIMIT 50
                    """
                elif id_type == "phone":
                    query = """
                        MATCH (p:Phone {number: $id})-[r]-(connected)
                        WITH p, connected, collect(r) AS rels
                        WITH
                            COALESCE(connected.upi_id, connected.number, connected.account_number) AS id,
                            labels(connected)[0] AS type,
                            connected.flagged AS flagged,
                            connected.complaint_count AS complaint_count,
                            reduce(s=0.0, rel IN rels | s + COALESCE(rel.amount, 0.0)) AS amount,
                            CASE
                                WHEN any(rel IN rels WHERE rel.direction = 'debit') THEN 'outgoing'
                                WHEN any(rel IN rels WHERE startNode(rel) = p) THEN 'outgoing'
                                ELSE 'incoming'
                            END AS direction
                        WHERE id IS NOT NULL
                        RETURN id, type, amount, flagged, complaint_count, direction
                        LIMIT 50
                    """
                elif id_type == "bank_account":
                    query = """
                        MATCH (b:BankAccount {account_number: $id})-[r]-(connected)
                        WITH b, connected, collect(r) AS rels
                        WITH
                            COALESCE(connected.upi_id, connected.number, connected.account_number) AS id,
                            labels(connected)[0] AS type,
                            connected.flagged AS flagged,
                            connected.complaint_count AS complaint_count,
                            reduce(s=0.0, rel IN rels | s + COALESCE(rel.amount, 0.0)) AS amount,
                            CASE
                                WHEN any(rel IN rels WHERE startNode(rel) = b) THEN 'outgoing'
                                ELSE 'incoming'
                            END AS direction
                        WHERE id IS NOT NULL
                        RETURN id, type, amount, flagged, complaint_count, direction
                        LIMIT 50
                    """
                else:
                    return []

                res = await s.run(query, id=identifier)
                async for record in res:
                    if record["id"]:
                        results.append(dict(record))
        except Exception as e:
            logger.warning(f"Neo4j query failed for {identifier}: {e}")
        return results

    # ── Risk scoring ─────────────────────────────────────

    def _score_mule_risk(self, complaint_count: int, pass_through_ratio: float) -> RiskLevel:
        """
        Assigns a mule risk level based on:
          - How many complaints reference this account
          - What fraction of incoming funds are immediately passed on
        """
        if complaint_count >= 3 or pass_through_ratio >= 0.9:
            return RiskLevel.HIGH
        if complaint_count >= 1 or pass_through_ratio >= 0.5:
            return RiskLevel.MEDIUM
        return RiskLevel.LOW

    # ── Helpers ──────────────────────────────────────────

    def _detect_type(self, identifier: str) -> str:
        """
        Auto-detects identifier type from format.
          xxx@yyy    → upi
          10 digits  → phone
          else       → bank_account
        """
        if "@" in identifier:
            return "upi"
        if identifier.isdigit() and len(identifier) == 10:
            return "phone"
        return "bank_account"

    def _fmt_amount(self, amount: float) -> str:
        """Format rupee amount as a readable edge label."""
        if not amount:
            return "linked"
        if amount >= 10_000_000:
            return f"₹{amount/10_000_000:.2f} Cr"
        if amount >= 100_000:
            return f"₹{amount/100_000:.1f} L"
        if amount >= 1_000:
            return f"₹{amount:,.0f}"
        return f"₹{amount:.0f}"

    def _make_node(self, identifier: str, id_type: str, flagged: bool = False, is_mule: bool = False) -> GraphNode:
        """Creates a GraphNode from an identifier string and type."""
        type_map = {
            "upi":          NodeType.UPI_ACCOUNT,
            "phone":        NodeType.PHONE,
            "bank_account": NodeType.BANK_ACCOUNT,
            "UpiAccount":   NodeType.UPI_ACCOUNT,
            "Phone":        NodeType.PHONE,
            "BankAccount":  NodeType.BANK_ACCOUNT,
        }
        ntype = type_map.get(id_type, NodeType.UNKNOWN)
        meta  = {"is_mule": True} if (is_mule and not flagged) else {}
        return GraphNode(
            id=identifier,
            label=identifier if len(identifier) < 16 else identifier[:14] + "…",
            node_type=ntype,
            flagged=flagged,
            risk_level=RiskLevel.HIGH if flagged else RiskLevel.UNKNOWN,
            metadata=meta,
        )

    def _sum_values(self, edges: list[GraphEdge]) -> float:
        return sum(e.amount or 0 for e in edges)