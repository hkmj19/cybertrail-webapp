"""
app/api/routes/graph.py
────────────────────────
Graph Management endpoints.

These endpoints work directly on the Neo4j investigation database -
not on live external APIs. Use these to:
  - Search for any entity across all saved investigations
  - Export a saved graph as JSON or GEXF (for Gephi/Maltego)
  - Delete/clear investigation sessions
  - Get database statistics
  - Run raw Cypher queries (admin only)
"""
from fastapi import Depends, APIRouter, HTTPException, Request, Query
from loguru import logger
from app.core.database import db_manager
from app.core.cache import cache_manager
from app.core.auth import get_current_user, require_officer
from app.models.auth import UserInDB

router = APIRouter()


@router.get("/search")
async def search_entities(
    request: Request,
    q: str = Query(..., description="Search term - partial match on any identifier"),
    limit: int = Query(default=20, le=100),
):
    """
    Full-text search across all saved entities in the investigation database.
    Searches wallets, UPI IDs, phone numbers, company names, and person names.

    Returns: list of matching nodes with their type, risk level, and metadata.
    """
    try:
        async with db_manager.session() as s:
            # Search across all node types using CONTAINS match
            result = await s.run("""
                CALL {
                    MATCH (n:Wallet) WHERE n.address CONTAINS $q
                    RETURN n.address AS id, 'wallet' AS type, n.flagged AS flagged, 'Wallet' AS label
                    UNION
                    MATCH (n:UpiAccount) WHERE n.upi_id CONTAINS $q
                    RETURN n.upi_id AS id, 'upi_account' AS type, n.flagged AS flagged, 'UPI Account' AS label
                    UNION
                    MATCH (n:Phone) WHERE n.number CONTAINS $q
                    RETURN n.number AS id, 'phone' AS type, n.flagged AS flagged, 'Phone' AS label
                    UNION
                    MATCH (n:Company) WHERE toLower(n.name) CONTAINS toLower($q)
                    RETURN n.cin AS id, 'company' AS type, n.flagged AS flagged, n.name AS label
                    UNION
                    MATCH (n:BankAccount) WHERE n.account_number CONTAINS $q
                    RETURN n.account_number AS id, 'bank_account' AS type, n.flagged AS flagged, 'Bank Account' AS label
                }
                RETURN id, type, flagged, label
                LIMIT $limit
            """, q=q, limit=limit)

            records = []
            async for record in result:
                records.append(dict(record))
            return {"results": records, "count": len(records)}
    except Exception as e:
        logger.error(f"Search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/entity/{identifier}")
async def get_entity_detail(request: Request, identifier: str):
    """
    Returns full details of a saved entity including all its connections.
    Works for any identifier type (auto-detected).

    Useful for: clicking a node in the UI to see full investigation history.
    """
    try:
        async with db_manager.session() as s:
            result = await s.run("""
                MATCH (n)
                WHERE n.address = $id OR n.upi_id = $id OR n.number = $id
                   OR n.cin = $id OR n.account_number = $id
                OPTIONAL MATCH (n)-[r]-(neighbour)
                RETURN
                    n AS node,
                    labels(n) AS node_labels,
                    collect({
                        rel_type: type(r),
                        neighbour_id: COALESCE(
                            neighbour.address, neighbour.upi_id,
                            neighbour.number, neighbour.cin
                        ),
                        neighbour_label: labels(neighbour)[0]
                    }) AS connections
                LIMIT 1
            """, id=identifier)

            record = await result.single()
            if not record:
                raise HTTPException(status_code=404, detail="Entity not found in database.")

            node_data = dict(record["node"])
            return {
                "identifier": identifier,
                "labels": record["node_labels"],
                "properties": node_data,
                "connections": record["connections"],
                "connection_count": len(record["connections"]),
            }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/export/{session_id}")
async def export_graph(
    request: Request,
    session_id: str,
    format: str = Query(default="json", regex="^(json|gexf|csv)$"),
):
    """
    Exports a saved investigation graph in multiple formats.

    - **json**: standard node-link JSON (works with D3.js, Cytoscape.js)
    - **gexf**: Gephi XML format (for desktop graph analysis)
    - **csv**: two CSVs - nodes.csv and edges.csv (for Excel/Pandas)

    Note: session_id is returned by any /trace endpoint.
    """
    cached = await cache_manager.get(f"graph_export:{session_id}")
    if not cached:
        raise HTTPException(
            status_code=404,
            detail="Session not found. Run a trace first and use its session_id."
        )

    if format == "json":
        return cached
    elif format == "gexf":
        gexf = _convert_to_gexf(cached)
        from fastapi.responses import Response
        return Response(content=gexf, media_type="application/xml",
                        headers={"Content-Disposition": f"attachment; filename={session_id}.gexf"})
    elif format == "csv":
        nodes_csv, edges_csv = _convert_to_csv(cached)
        return {"nodes_csv": nodes_csv, "edges_csv": edges_csv}


@router.get("/stats")
async def database_stats(request: Request):
    """
    Returns overall investigation database statistics.
    Useful for the dashboard overview.
    """
    try:
        async with db_manager.session() as s:
            result = await s.run("""
                RETURN
                    COUNT { MATCH (w:Wallet) RETURN w } AS total_wallets,
                    COUNT { MATCH (w:Wallet {flagged:true}) RETURN w } AS flagged_wallets,
                    COUNT { MATCH (u:UpiAccount) RETURN u } AS total_upi,
                    COUNT { MATCH (u:UpiAccount {flagged:true}) RETURN u } AS flagged_upi,
                    COUNT { MATCH (c:Company) RETURN c } AS total_companies,
                    COUNT { MATCH (p:Phone) RETURN p } AS total_phones,
                    COUNT { MATCH ()-[r]->() RETURN r } AS total_relationships
            """)
            record = await result.single()
            return dict(record) if record else {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/entity/{identifier}")
async def delete_entity(request: Request, identifier: str, current_user: UserInDB = Depends(require_officer)):
    """
    Removes an entity and all its relationships from the investigation database.
    Use with caution - this is irreversible.
    """
    try:
        async with db_manager.session() as s:
            result = await s.run("""
                MATCH (n)
                WHERE n.address = $id OR n.upi_id = $id
                   OR n.number = $id OR n.cin = $id
                WITH n
                DETACH DELETE n
                RETURN count(n) AS deleted
            """, id=identifier)
            record = await result.single()
            deleted = record["deleted"] if record else 0
            await cache_manager.invalidate_pattern(f"*{identifier}*")
            return {"deleted": deleted, "identifier": identifier}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Export helpers ───────────────────────────────────────

def _convert_to_gexf(graph_data: dict) -> str:
    """
    Converts a graph dict to GEXF XML format (Gephi compatible).
    GEXF supports node attributes, edge weights, and metadata.
    """
    nodes_xml = ""
    for node in graph_data.get("nodes", []):
        nodes_xml += f'<node id="{node["id"]}" label="{node.get("label", node["id"])}">\n'
        nodes_xml += f'  <attvalues><attvalue for="type" value="{node.get("node_type", "")}"/>'
        nodes_xml += f'<attvalue for="flagged" value="{node.get("flagged", False)}"/></attvalues>\n'
        nodes_xml += '</node>\n'

    edges_xml = ""
    for i, edge in enumerate(graph_data.get("edges", [])):
        edges_xml += f'<edge id="e{i}" source="{edge["source"]}" target="{edge["target"]}" '
        edges_xml += f'label="{edge.get("label", "")}" weight="{edge.get("amount", 1)}"/>\n'

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<gexf xmlns="http://gexf.net/1.3" version="1.3">
  <meta><creator>CyberTrail</creator></meta>
  <graph defaultedgetype="directed">
    <attributes class="node">
      <attribute id="type" title="type" type="string"/>
      <attribute id="flagged" title="flagged" type="boolean"/>
    </attributes>
    <nodes>{nodes_xml}</nodes>
    <edges>{edges_xml}</edges>
  </graph>
</gexf>"""


def _convert_to_csv(graph_data: dict) -> tuple[str, str]:
    """
    Converts graph to two CSV strings: one for nodes, one for edges.
    Suitable for importing into Excel, Pandas, or other tools.
    """
    nodes = graph_data.get("nodes", [])
    edges = graph_data.get("edges", [])

    nodes_csv = "id,label,node_type,flagged,risk_level\n"
    for n in nodes:
        nodes_csv += f'"{n["id"]}","{n.get("label","")}","{n.get("node_type","")}",{n.get("flagged",False)},"{n.get("risk_level","unknown")}"\n'

    edges_csv = "source,target,edge_type,label,amount,currency\n"
    for e in edges:
        edges_csv += f'"{e["source"]}","{e["target"]}","{e.get("edge_type","")}","{e.get("label","")}",{e.get("amount") or ""},"{e.get("currency","")}"\n'

    return nodes_csv, edges_csv


@router.get("/imported-data")
async def get_imported_data(
    module: str = "all",
    limit: int = 30,
    current_user = Depends(get_current_user)
):
    """
    Returns recently imported data nodes for each module.
    module: upi | social | shell | all
    """
    from app.core.database import db_manager

    async with db_manager.session() as s:
        result = {}

        if module in ("social", "all"):
            r = await s.run("""
                MATCH (a:Phone)-[r]->(b)
                WHERE type(r) IN ['CALLED','REGISTERED','ASSOCIATED']
                WITH a, r, b,
                     COALESCE(b.number, b.upi_id, b.account_number) AS to_val,
                     labels(b)[0] AS to_label
                WHERE to_val IS NOT NULL
                RETURN a.number AS from_ph,
                       to_val AS to_id,
                       to_label AS to_type,
                       type(r) AS rel,
                       r.frequency AS freq,
                       toString(r.date) AS date,
                       r.source AS source
                ORDER BY r.date DESC
                LIMIT $limit
            """, limit=limit)
            rows = []
            async for rec in r:
                rows.append({
                    "from":         rec["from_ph"],
                    "to":           rec["to_id"],
                    "to_type":      rec["to_type"] or "Phone",
                    "relationship": rec["rel"],
                    "frequency":    rec["freq"],
                    "date":         str(rec["date"] or ""),
                    "source":       rec["source"] or "complaint_data"
                })
            result["social"] = rows

        if module in ("shell", "all"):
            r = await s.run("""
                MATCH (d:Director)-[r:DIRECTS]->(c:Company)
                RETURN d.din AS din, d.name AS director_name,
                       c.cin AS cin, c.name AS company_name,
                       c.status AS status, c.flagged AS flagged,
                       r.designation AS designation, r.doa AS doa
                ORDER BY c.cin
                LIMIT $limit
            """, limit=limit)
            rows = []
            async for rec in r:
                rows.append({
                    "din": rec["din"], "director_name": rec["director_name"],
                    "cin": rec["cin"], "company_name": rec["company_name"],
                    "status": rec["status"], "flagged": rec["flagged"],
                    "designation": rec["designation"], "doa": str(rec["doa"] or "")
                })
            result["shell"] = rows

        if module in ("upi", "all"):
            r = await s.run("""
                MATCH (a)-[r:UPI_TX]->(b)
                WHERE r.source IN ['bank_statement','manual_entry']
                RETURN COALESCE(a.upi_id, a.number, a.address) AS from_id,
                       COALESCE(b.upi_id, b.number, b.address) AS to_id,
                       r.amount AS amount, r.date AS date,
                       r.bank_reference AS ref, r.note AS note,
                       r.direction AS direction
                ORDER BY r.date DESC
                LIMIT $limit
            """, limit=limit)
            rows = []
            async for rec in r:
                rows.append({
                    "from": rec["from_id"], "to": rec["to_id"],
                    "amount": rec["amount"], "date": str(rec["date"] or ""),
                    "reference": rec["ref"], "note": rec["note"],
                    "date": str(rec["date"] or ""),
                    "direction": rec["direction"]
                })
            result["bank_transfers"] = rows

        return result