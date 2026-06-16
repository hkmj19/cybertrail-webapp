"""
app/api/routes/social.py — Social Graph endpoints
"""
from app.services.audit_service import audit_service
from app.core.auth import get_current_user, require_officer
from app.core.database import db_manager
from app.models.auth import UserInDB
from fastapi import Depends, APIRouter, HTTPException, Request, UploadFile, File
from slowapi import Limiter
from slowapi.util import get_remote_address
from loguru import logger
from app.models.graph import SocialTraceRequest, InvestigationGraph
from app.modules.social.tracer import SocialTracer

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)
_tracer = SocialTracer()


@router.post("/trace", response_model=InvestigationGraph)
@limiter.limit("30/minute")
async def trace_social(request: Request, body: SocialTraceRequest, current_user: UserInDB = Depends(get_current_user)):
    """
    Maps phone/UPI communication networks around a seed identifier.
    Detects hubs, clusters, and shared-device links.

    - **identifier**: phone number (10 digit) or UPI ID
    - **depth**: expansion hops (max 5)
    """
    try:
        result = await _tracer.trace(body)
        try:
            await audit_service.log(
                action="trace", entity_type="investigation",
                entity_id=body.identifier,
                officer_username=current_user.username,
                officer_badge=current_user.badge_id,
                officer_role=current_user.role.value,
                ip_address=request.client.host if request.client else "unknown",
                description=f"Trace [social]: {body.identifier} | depth={getattr(body,'depth',2)} | nodes={getattr(result,'total_nodes',0)} | flagged={getattr(result,'flagged_count',0)}",
            )
        except Exception:
            pass
        return result
    except Exception as e:
        logger.error(f"Social trace error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/path")
async def shortest_path(request: Request, from_id: str, to_id: str):
    """
    Finds the shortest connection path between two identifiers.
    Useful for proving association between two suspects.

    Returns: ordered list of node IDs forming the shortest path.
    """
    try:
        path = await _tracer.find_shortest_path(from_id, to_id)
        return {"path": path, "hops": len(path) - 1 if path else 0}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/communities/{seed}")
async def detect_communities(request: Request, seed: str, depth: int = 3):
    """
    Detects criminal communities/clusters around a seed phone/UPI.
    Uses Louvain community detection algorithm.
    Returns: list of clusters, each cluster is a list of node IDs.
    """
    try:
        communities = await _tracer.detect_communities(seed, depth)
        return {"communities": communities, "count": len(communities)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ingest-call-records")
@limiter.limit("5/minute")
async def ingest_call_records(
    request: Request,
    file: UploadFile = File(...),
    current_user: UserInDB = Depends(require_officer),
):
    """
    Ingest call detail records (CDR) CSV to seed the social graph.
    Creates Phone nodes and CALLED edges between them.

    Expected CSV columns:
      phone_from, phone_to, relationship, frequency, date
      relationship: CALLED / REGISTERED / ASSOCIATED
    """
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files accepted.")
    try:
        import io, csv as csvlib
        from app.core.database import db_manager
        from app.services.audit_service import audit_service

        contents = (await file.read()).decode("utf-8")
        lines = contents.strip().split("\n")
        if lines:
            lines[0] = ",".join(c.strip().lower().replace(" ", "_") for c in lines[0].split(","))
        reader = csvlib.DictReader(io.StringIO("\n".join(lines)))

        imported = 0
        async with db_manager.session() as s:
            for row in reader:
                from_ph = str(row.get("phone_from", "")).strip()
                to_ph   = str(row.get("phone_to", "")).strip()
                rel     = str(row.get("relationship", "CALLED")).strip().upper()
                freq    = int(float(row.get("frequency", 1) or 1))
                date    = str(row.get("date", "")).strip()

                if not from_ph or not to_ph or from_ph == "nan" or to_ph == "nan":
                    continue
                if rel not in ("CALLED", "REGISTERED", "ASSOCIATED"):
                    rel = "CALLED"

                await s.run(f"""
                    MERGE (a:Phone {{number: $from_ph}})
                    SET a.label = $from_ph, a.node_type = 'phone'
                    MERGE (b:Phone {{number: $to_ph}})
                    SET b.label = $to_ph, b.node_type = 'phone'
                    MERGE (a)-[r:{rel}]->(b)
                    SET r.frequency = $freq, r.date = $date, r.source = 'cdr_import'
                """, from_ph=from_ph, to_ph=to_ph, freq=freq, date=date)
                imported += 1

        await audit_service.log(
            action="create", entity_type="social_data",
            entity_id=file.filename,
            officer_username=current_user.username,
            officer_badge=current_user.badge_id,
            officer_role=current_user.role.value,
            ip_address=request.client.host if request.client else "unknown",
            description=f"CDR import: {file.filename} — {imported} call records",
        )
        return {"status": "success", "imported": imported}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@router.put("/call-record")
@limiter.limit("30/minute")
async def update_call_record(
    request: Request,
    body: dict,
    current_user: UserInDB = Depends(require_officer),
):
    """Update frequency/date on a call record edge."""
    from_ph = str(body.get("phone_from", "")).strip()
    to_id   = str(body.get("phone_to",   "")).strip()   # could be phone OR upi
    rel     = str(body.get("relationship", "CALLED")).upper()
    freq    = body.get("frequency", 1)
    date    = str(body.get("date", "")).strip()

    if not from_ph or not to_id:
        raise HTTPException(status_code=400, detail="phone_from and phone_to required")
    if rel not in ("CALLED", "REGISTERED", "ASSOCIATED"):
        rel = "CALLED"

    try:
        async with db_manager.session() as s:
            # Match across all possible target node types
            result = await s.run(f"""
                MATCH (a:Phone {{number: $from_ph}})-[r:{rel}]-(b)
                WHERE COALESCE(b.number, b.upi_id, b.account_number) = $to_id
                SET r.frequency = $freq, r.date = $date
                RETURN count(r) AS updated
            """, from_ph=from_ph, to_id=to_id, freq=freq, date=date)
            rec = await result.single()
            updated = rec["updated"] if rec else 0

        if updated == 0:
            # Try undirected match as fallback
            async with db_manager.session() as s:
                await s.run(f"""
                    MATCH (a:Phone {{number: $from_ph}})-[r:{rel}]->(b)
                    SET r.frequency = $freq, r.date = $date
                """, from_ph=from_ph, to_id=to_id, freq=freq, date=date)

        return {"status": "updated"}
    except Exception as e:
        logger.error(f"update_call_record failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/call-record")
async def delete_call_record(
    request: Request,
    from_ph: str,
    to_ph: str,
    rel: str = "CALLED",
    current_user: UserInDB = Depends(require_officer),
):
    """Delete a specific call record edge between two phones."""
    from app.core.database import db_manager
    rel = rel.upper()
    if rel not in ("CALLED", "REGISTERED", "ASSOCIATED"):
        rel = "CALLED"
    try:
        async with db_manager.session() as s:
            result = await s.run(f"""
                MATCH (a:Phone {{number: $from_ph}})-[r:{rel}]->(b:Phone {{number: $to_ph}})
                DELETE r
                RETURN count(r) AS deleted
            """, from_ph=from_ph, to_ph=to_ph)
            rec = await result.single()
        await audit_service.log(
            action="delete", entity_type="social_data",
            entity_id=f"{from_ph}→{to_ph}",
            officer_username=current_user.username,
            officer_badge=current_user.badge_id,
            officer_role=current_user.role.value,
            ip_address=request.client.host if request.client else "unknown",
            description=f"Deleted call record: {from_ph} -{rel}-> {to_ph}",
        )
        return {"deleted": rec["deleted"] if rec else 0}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/call-records/all")
async def delete_all_call_records(
    request: Request,
    current_user: UserInDB = Depends(require_officer),
):
    """Delete ALL imported CDR call records (CALLED/REGISTERED/ASSOCIATED edges)."""
    from app.core.database import db_manager
    try:
        async with db_manager.session() as s:
            result = await s.run("""
                MATCH ()-[r:CALLED|REGISTERED|ASSOCIATED]->()
                WHERE r.source IN ['cdr_import','manual_entry']
                   OR r.frequency IS NOT NULL
                WITH r, count(r) AS cnt
                DELETE r
                RETURN count(r) AS deleted
            """)
            rec = await result.single()
        await audit_service.log(
            action="delete", entity_type="social_data",
            entity_id="ALL_CDR",
            officer_username=current_user.username,
            officer_badge=current_user.badge_id,
            officer_role=current_user.role.value,
            ip_address=request.client.host if request.client else "unknown",
            description="Deleted ALL imported CDR call records",
        )
        return {"deleted": rec["deleted"] if rec else 0}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))