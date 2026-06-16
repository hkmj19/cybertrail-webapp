"""
app/api/routes/audit.py
────────────────────────
Immutable audit log for all data changes.
Every create/update/delete is logged with:
- who did it (officer username + badge ID)
- what they did (action type)
- what changed (before/after values)
- when (timestamp)
- from where (IP address)

Logs are append-only — nobody can delete audit entries, not even admin.
"""
from fastapi import APIRouter, Depends, Query
from typing import Optional
from app.core.auth import get_current_user, require_supervisor
from app.models.auth import UserInDB
from app.core.database import db_manager
from app.core.logger import logger
import uuid
from datetime import datetime

router = APIRouter()


@router.get("/", tags=["Audit"])
async def get_audit_logs(
    action:    Optional[str] = Query(None, description="Filter by action: create/update/delete"),
    entity:    Optional[str] = Query(None, description="Filter by entity type: complaint/case/user/blacklist"),
    username:  Optional[str] = Query(None, description="Filter by officer username"),
    skip:      int = Query(0, ge=0),
    limit:     int = Query(100, ge=1, le=500),
    current_user: UserInDB = Depends(require_supervisor),
):
    """
    View audit logs. Supervisor and Admin only.
    Shows all data changes with full before/after details.
    """
    where_clauses = []
    if action:   where_clauses.append(f"a.action = '{action}'")
    if entity:   where_clauses.append(f"a.entity_type = '{entity}'")
    if username: where_clauses.append(f"a.officer_username = '{username}'")

    where = "WHERE " + " AND ".join(where_clauses) if where_clauses else ""

    async with db_manager.session() as s:
        result = await s.run(f"""
            MATCH (a:AuditLog)
            {where}
            RETURN a
            ORDER BY a.timestamp DESC
            SKIP $skip LIMIT $limit
        """, skip=skip, limit=limit)

        logs = []
        async for rec in result:
            d = dict(rec["a"])
            logs.append({
                "id":              d.get("id"),
                "timestamp":       d.get("timestamp"),
                "action":          d.get("action"),
                "entity_type":     d.get("entity_type"),
                "entity_id":       d.get("entity_id"),
                "officer_username":d.get("officer_username"),
                "officer_badge":   d.get("officer_badge"),
                "officer_role":    d.get("officer_role"),
                "ip_address":      d.get("ip_address"),
                "changes":         d.get("changes", "{}"),
                "description":     d.get("description"),
            })
        return {"logs": logs, "count": len(logs)}


@router.get("/stats", tags=["Audit"])
async def audit_stats(current_user: UserInDB = Depends(require_supervisor)):
    """Summary stats — total actions per officer, suspicious activity counts."""
    async with db_manager.session() as s:
        result = await s.run("""
            MATCH (a:AuditLog)
            RETURN
                a.officer_username AS username,
                a.officer_badge    AS badge_id,
                a.officer_role     AS role,
                count(a) AS total_actions,
                sum(CASE WHEN a.action = 'delete' THEN 1 ELSE 0 END) AS deletes,
                sum(CASE WHEN a.action = 'update' THEN 1 ELSE 0 END) AS updates,
                sum(CASE WHEN a.action = 'create' THEN 1 ELSE 0 END) AS creates,
                max(a.timestamp) AS last_action
            ORDER BY total_actions DESC
        """)
        stats = []
        async for rec in result:
            stats.append(dict(rec))
        return {"officer_stats": stats}