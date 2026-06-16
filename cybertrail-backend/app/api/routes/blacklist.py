"""
app/api/routes/blacklist.py
────────────────────────────
REST API endpoints for blacklist / watchlist management.

FIXES APPLIED:
  - sync-ofac now requires officer+ authentication
  - add/remove blacklist now logs to audit trail
  - retroactive flagging confirmed working (handled in blacklist_service)
"""

from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Depends, Query
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address
from loguru import logger

from app.core.auth import get_current_user, require_officer, require_supervisor, require_admin
from app.models.auth import UserInDB
from app.services.blacklist_service import blacklist_service
from app.core.database import db_manager
from app.services.audit_service import audit_service

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


class AddBlacklistRequest(BaseModel):
    identifier: str = Field(..., description="UPI ID, phone, wallet address, or company CIN")
    source:    str = Field(default="internal")
    reason:    str = Field(default="")
    severity:  str = Field(default="high", pattern="^(high|medium|low)$")


@router.get("/check/{identifier}")
@limiter.limit("60/minute")
async def check_blacklist(request: Request, identifier: str):
    """Check identifier against all blacklists (internal, OFAC, I4C). No auth required — read-only."""
    try:
        hits = await blacklist_service.check(identifier)
        return {
            "identifier": identifier,
            "flagged":    len(hits) > 0,
            "hits":       hits,
            "hit_count":  len(hits),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/add")
@limiter.limit("30/minute")
async def add_to_blacklist(
    request: Request,
    body: AddBlacklistRequest,
    current_user: UserInDB = Depends(require_officer),
):
    """Add an entity to the internal CyberTrail blacklist. Officer+ only. Logged in audit trail."""
    try:
        success = await blacklist_service.add(
            identifier=body.identifier,
            source=body.source,
            reason=body.reason,
            severity=body.severity,
            added_by=current_user.username,   # use actual logged-in officer
        )
        if not success:
            raise HTTPException(status_code=500, detail="Failed to add to blacklist.")

        # ── Audit log ──────────────────────────────────────
        await audit_service.log(
            action="create",
            entity_type="blacklist",
            entity_id=body.identifier,
            officer_username=current_user.username,
            officer_badge=current_user.badge_id,
            officer_role=current_user.role.value,
            ip_address=request.client.host if request.client else "unknown",
            description=f"Added to blacklist: {body.identifier} | Reason: {body.reason} | Severity: {body.severity}",
            after={"identifier": body.identifier, "source": body.source,
                   "reason": body.reason, "severity": body.severity}
        )
        return {"status": "added", "identifier": body.identifier}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{identifier}")
@limiter.limit("10/minute")
async def remove_from_blacklist(
    request: Request,
    identifier: str,
    current_user: UserInDB = Depends(require_officer),
):
    """Remove from internal blacklist. Officer+ only. Logged in audit trail."""
    try:
        success = await blacklist_service.remove(identifier)

        # ── Audit log ──────────────────────────────────────
        await audit_service.log(
            action="delete",
            entity_type="blacklist",
            entity_id=identifier,
            officer_username=current_user.username,
            officer_badge=current_user.badge_id,
            officer_role=current_user.role.value,
            ip_address=request.client.host if request.client else "unknown",
            description=f"Removed from blacklist: {identifier} by {current_user.username}",
            before={"identifier": identifier}
        )
        return {"status": "removed" if success else "not_found", "identifier": identifier}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/import-csv")
@limiter.limit("5/minute")
async def import_blacklist_csv(
    request: Request,
    file: UploadFile = File(...),
    source: str = Query(default="i4c"),
    current_user: UserInDB = Depends(require_officer),
):
    """Bulk-import a blacklist CSV. Officer+ only."""
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files accepted.")
    try:
        contents = await file.read()
        result = await blacklist_service.bulk_import_csv(contents, source=source)

        # Audit log bulk import
        await audit_service.log(
            action="create",
            entity_type="blacklist",
            entity_id=f"bulk-import:{file.filename}",
            officer_username=current_user.username,
            officer_badge=current_user.badge_id,
            officer_role=current_user.role.value,
            ip_address=request.client.host if request.client else "unknown",
            description=f"Bulk blacklist CSV import: {file.filename} source={source} imported={result.get('imported',0)}",
        )
        return {"status": "success", **result}
    except Exception as e:
        logger.error(f"Blacklist CSV import error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sync-ofac")
@limiter.limit("2/hour")
async def sync_ofac(
    request: Request,
    current_user: UserInDB = Depends(require_supervisor),  # FIX: was unauthenticated
):
    """
    Download and import the latest OFAC SDN sanctions list.
    Requires Supervisor+ role. Slow operation — run on schedule.
    """
    try:
        result = await blacklist_service.bulk_import_ofac()

        # Audit log OFAC sync
        await audit_service.log(
            action="create",
            entity_type="blacklist",
            entity_id="ofac-sync",
            officer_username=current_user.username,
            officer_badge=current_user.badge_id,
            officer_role=current_user.role.value,
            ip_address=request.client.host if request.client else "unknown",
            description=f"OFAC SDN list synced by {current_user.username}: {result.get('imported', 0)} entries",
        )
        return {"status": "synced", **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))




@router.delete("/all")
@limiter.limit("3/hour")
async def delete_all_blacklist(
    request: Request,
    current_user: UserInDB = Depends(require_admin),
):
    """
    Delete ALL internal blacklist entries.
    Admin only. Logged in audit trail.
    Does NOT delete I4C or OFAC entries — only internal ones.
    """
    try:
        async with db_manager.session() as s:
            # Count first
            count_r = await s.run("""
                MATCH (bl:Blacklist)
                WHERE bl.source = 'internal' OR bl.source IS NULL
                RETURN count(bl) AS total
            """)
            count_rec = await count_r.single()
            deleted = count_rec["total"] if count_rec else 0

            # Then delete
            await s.run("""
                MATCH (bl:Blacklist)
                WHERE bl.source = 'internal' OR bl.source IS NULL
                DELETE bl
            """)

        await audit_service.log(
            action="delete", entity_type="blacklist",
            entity_id="ALL_INTERNAL",
            officer_username=current_user.username,
            officer_badge=current_user.badge_id,
            officer_role=current_user.role.value,
            ip_address=request.client.host if request.client else "unknown",
            description=f"DELETED ALL internal blacklist entries ({deleted} entries) by {current_user.username}",
        )
        return {"status": "deleted", "deleted": deleted}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/list")
@limiter.limit("30/minute")
async def list_blacklist(
    request: Request,
    source: str = Query(default="all"),
    severity: str = Query(default="all"),
    limit: int = Query(default=100),
    skip: int = Query(default=0),
):
    """List all blacklisted entries with optional filters. No auth required — read-only."""
    try:
        async with db_manager.session() as s:
            where_clauses = []
            params = {"limit": limit, "skip": skip}
            if source != "all":
                where_clauses.append("bl.source = $source")
                params["source"] = source
            if severity != "all":
                where_clauses.append("bl.severity = $severity")
                params["severity"] = severity
            where = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""
            r = await s.run(f"""
                MATCH (bl:Blacklist)
                {where}
                RETURN bl.identifier AS identifier,
                       bl.source     AS source,
                       bl.reason     AS reason,
                       bl.severity   AS severity,
                       bl.added_by   AS added_by,
                       bl.added_at   AS added_at,
                       bl.updated_at AS updated_at
                ORDER BY bl.added_at DESC
                SKIP $skip LIMIT $limit
            """, **params)
            entries = []
            async for rec in r:
                entries.append({
                    "identifier": rec["identifier"],
                    "source":     rec["source"] or "internal",
                    "reason":     rec["reason"] or "",
                    "severity":   rec["severity"] or "high",
                    "added_by":   rec["added_by"] or "system",
                    "added_at":   str(rec["added_at"]) if rec["added_at"] else "",
                    "updated_at": str(rec["updated_at"]) if rec["updated_at"] else "",
                })
            # total count
            count_r = await s.run(f"MATCH (bl:Blacklist) {where} RETURN count(bl) AS total", **{k:v for k,v in params.items() if k not in ('limit','skip')})
            count_rec = await count_r.single()
            total = count_rec["total"] if count_rec else 0
        return {"entries": entries, "total": total, "limit": limit, "skip": skip}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{identifier}")
@limiter.limit("20/minute")
async def update_blacklist_entry(
    request: Request,
    identifier: str,
    body: dict,
    current_user: UserInDB = Depends(require_officer),
):
    """Update severity or reason for a blacklist entry. Officer+ only."""
    try:
        reason   = str(body.get("reason",   "")).strip()
        severity = str(body.get("severity", "high")).strip()
        if severity not in ("high", "medium", "low"):
            severity = "high"
        async with db_manager.session() as s:
            await s.run("""
                MATCH (bl:Blacklist {identifier: $id})
                SET bl.reason     = $reason,
                    bl.severity   = $severity,
                    bl.updated_at = datetime()
            """, id=identifier, reason=reason, severity=severity)
        await audit_service.log(
            action="update", entity_type="blacklist",
            entity_id=identifier,
            officer_username=current_user.username,
            officer_badge=current_user.badge_id,
            officer_role=current_user.role.value,
            ip_address=request.client.host if request.client else "unknown",
            description=f"Blacklist entry updated: {identifier} severity={severity}",
            after={"reason": reason, "severity": severity}
        )
        return {"status": "updated", "identifier": identifier}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/stats")
async def blacklist_stats(request: Request):
    """Returns counts for each blacklist source. Public read — no auth required."""
    try:
        return await blacklist_service.get_stats()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))