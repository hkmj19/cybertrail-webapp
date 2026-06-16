"""
app/api/routes/complaints.py
─────────────────────────────
REST API endpoints for complaint management.

Endpoints:
  POST /api/v1/complaints/           — Create a single complaint
  GET  /api/v1/complaints/{id}       — Get complaint by ID
  GET  /api/v1/complaints/           — List complaints (filterable)
  PUT  /api/v1/complaints/{id}       — Update complaint status
  GET  /api/v1/complaints/summary    — Aggregated statistics
  POST /api/v1/complaints/bulk       — Bulk create from CSV upload
"""

from fastapi import APIRouter, HTTPException, Request, Query, UploadFile, File
from slowapi import Limiter
from slowapi.util import get_remote_address
from loguru import logger
from typing import Optional

from app.models.complaint import Complaint, ComplaintStatus, ComplaintSource
from app.core.database import db_manager
from app.core.auth import require_admin, get_current_user, require_officer
from app.models.auth import UserInDB
from app.services.audit_service import audit_service
from fastapi import Depends
import uuid

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


@router.post("/", status_code=201)
@limiter.limit("60/minute")
async def create_complaint(request: Request, complaint: Complaint, current_user: UserInDB = Depends(require_officer)):
    """
    Creates a new complaint record in the investigation database.
    The complaint's fraud identifiers (UPI, phone, wallet) are
    automatically linked to any existing graph nodes.
    """
    try:
        # Assign ID if not provided
        if not complaint.complaint_id or complaint.complaint_id == "string":
            complaint.complaint_id = f"CT-{str(uuid.uuid4())[:8].upper()}"

        async with db_manager.session() as s:
            await s.run("""
                CREATE (c:Complaint {
                    complaint_id:        $cid,
                    source:              $source,
                    status:              $status,
                    complainant_phone:   $comp_phone,
                    complainant_name:    $comp_name,
                    fraud_upi_id:        $fraud_upi,
                    fraud_phone:         $fraud_phone,
                    fraud_bank_account:  $fraud_bank,
                    fraud_wallet:        $fraud_wallet,
                    amount_inr:          $amount,
                    transaction_date:    $tx_date,
                    description:         $desc,
                    fraud_type:          $fraud_type,
                    district:            $district,
                    fir_number:          $fir,
                    created_at:          datetime()
                })
            """,
                cid=complaint.complaint_id,
                source=complaint.source.value,
                status=complaint.status.value,
                comp_phone=complaint.complainant_phone or "",
                comp_name=complaint.complainant_name or "",
                fraud_upi=complaint.fraud_upi_id or "",
                fraud_phone=complaint.fraud_phone or "",
                fraud_bank=complaint.fraud_bank_account or "",
                fraud_wallet=complaint.fraud_wallet_address or "",
                amount=complaint.amount_inr,
                tx_date=str(complaint.transaction_date or ""),
                desc=complaint.description or "",
                fraud_type=complaint.fraud_type or "",
                district=complaint.district or "",
                fir=complaint.fir_number or "",
            )

            # Link fraud UPI node and flag it if exists
            if complaint.fraud_upi_id:
                await s.run("""
                    MERGE (u:UpiAccount {upi_id: $upi})
                    SET u.flagged = true,
                        u.complaint_count = COALESCE(u.complaint_count, 0) + 1,
                        u.label = $upi,
                        u.node_type = 'upi_account'
                    WITH u
                    MATCH (c:Complaint {complaint_id: $cid})
                    MERGE (c)-[:REFERENCES_UPI]->(u)
                """, upi=complaint.fraud_upi_id, cid=complaint.complaint_id)

                # ── Create victim phone → fraud UPI edge (for graph tracing) ──
                if complaint.complainant_phone:
                    await s.run("""
                        MERGE (p:Phone {number: $phone})
                        SET p.label = $phone, p.node_type = 'phone'
                        MERGE (u:UpiAccount {upi_id: $upi})
                        MERGE (p)-[r:UPI_TX {complaint_id: $cid}]->(u)
                        SET r.amount = $amount,
                            r.date   = $date,
                            r.direction = 'debit'
                    """,
                    phone=complaint.complainant_phone,
                    upi=complaint.fraud_upi_id,
                    cid=complaint.complaint_id,
                    amount=float(complaint.amount_inr or 0),
                    date=str(complaint.transaction_date or ""))

                # ── Link fraud phone to fraud UPI ──
                if complaint.fraud_phone:
                    await s.run("""
                        MERGE (ph:Phone {number: $phone})
                        SET ph.flagged = true, ph.label = $phone, ph.node_type = 'phone'
                        MERGE (u:UpiAccount {upi_id: $upi})
                        MERGE (ph)-[:REGISTERED]->(u)
                    """, phone=complaint.fraud_phone, upi=complaint.fraud_upi_id)

        logger.info(f"Complaint created: {complaint.complaint_id}")

        # Audit log
        officer = await _get_officer_info(request)
        await audit_service.log(
            action="create", entity_type="complaint",
            entity_id=complaint.complaint_id,
            officer_username=officer["username"],
            officer_badge=officer["badge"],
            officer_role=officer["role"],
            ip_address=request.client.host if request.client else "unknown",
            description=f"Complaint created: fraud_upi={complaint.fraud_upi_id}, amount=Rs{complaint.amount_inr}, victim={complaint.complainant_name}",
            after={"fraud_upi_id": complaint.fraud_upi_id, "amount_inr": str(complaint.amount_inr),
                   "complainant_name": complaint.complainant_name, "district": complaint.district}
        )
        return {"status": "created", "complaint_id": complaint.complaint_id}

    except Exception as e:
        logger.error(f"Complaint create error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def _get_officer_info(request: Request) -> dict:
    """Extract officer info from JWT token in request."""
    try:
        from app.services.auth_service import decode_token
        auth_header = request.headers.get("Authorization", "")
        token = auth_header.replace("Bearer ", "")
        data = decode_token(token)
        if data and data.username:
            from app.services.auth_service import auth_service as _auth_svc
            user = await _auth_svc.get_user_by_username(data.username)
            if user:
                return {"username": user.username, "badge": user.badge_id, "role": user.role.value}
    except Exception:
        pass
    return {"username": "unknown", "badge": "unknown", "role": "unknown"}


@router.get("/summary")
async def complaint_summary(request: Request):
    """
    Returns aggregated complaint statistics for the dashboard.
    Includes total complaints, total amount, top fraud types, etc.
    """
    try:
        async with db_manager.session() as s:
            result = await s.run("""
                MATCH (c:Complaint)
                RETURN
                    count(c) AS total_complaints,
                    sum(c.amount_inr) AS total_amount_inr,
                    count(CASE WHEN c.status = 'open' THEN 1 END) AS open_complaints,
                    count(CASE WHEN c.status = 'closed' THEN 1 END) AS closed_complaints,
                    collect(DISTINCT c.fraud_type) AS fraud_types
            """)
            record = await result.single()
            if not record:
                return {"total_complaints": 0}

            summary = dict(record)
            # Round amount for clean display
            if summary.get("total_amount_inr"):
                summary["total_amount_inr"] = round(summary["total_amount_inr"], 2)
            return summary
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{complaint_id}")
async def get_complaint(request: Request, complaint_id: str):
    """Returns a single complaint by its ID."""
    try:
        async with db_manager.session() as s:
            result = await s.run("""
                MATCH (c:Complaint {complaint_id: $id})
                RETURN c
            """, id=complaint_id)
            record = await result.single()
            if not record:
                raise HTTPException(status_code=404, detail="Complaint not found.")
            return dict(record["c"])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@router.delete("/all")
@limiter.limit("3/hour")
async def delete_all_complaints(
    request: Request,
    current_user: UserInDB = Depends(require_admin),
):
    """Delete ALL complaints. Admin only. Audit logged."""
    try:
        async with db_manager.session() as s:
            r = await s.run("MATCH (c:Complaint) WITH count(c) AS total, collect(c) AS nodes FOREACH (n IN nodes | DETACH DELETE n) RETURN total")
            rec = await r.single()
            deleted = rec["total"] if rec else 0

        await audit_service.log(
            action="delete", entity_type="complaint",
            entity_id="ALL",
            officer_username=current_user.username,
            officer_badge=current_user.badge_id,
            officer_role=current_user.role.value,
            ip_address=request.client.host if request.client else "unknown",
            description=f"DELETED ALL complaints ({deleted}) by {current_user.username}",
        )
        return {"status": "deleted", "deleted": deleted}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/")
async def list_complaints(
    request: Request,
    status: Optional[str] = None,
    fraud_type: Optional[str] = None,
    district: Optional[str] = None,
    limit: int = Query(default=50, le=200),
    skip: int = Query(default=0, ge=0),
):
    """
    Lists complaints with optional filtering.
    Supports filtering by status, fraud_type, and district.
    """
    try:
        async with db_manager.session() as s:
            filters = []
            params = {"limit": limit, "skip": skip}
            if status:
                filters.append("c.status = $status")
                params["status"] = status
            if fraud_type:
                filters.append("c.fraud_type = $fraud_type")
                params["fraud_type"] = fraud_type
            if district:
                filters.append("c.district = $district")
                params["district"] = district

            where = f"WHERE {' AND '.join(filters)}" if filters else ""
            result = await s.run(f"""
                MATCH (c:Complaint)
                {where}
                RETURN c
                ORDER BY c.created_at DESC
                SKIP $skip LIMIT $limit
            """, **params)

            records = []
            async for record in result:
                records.append(dict(record["c"]))
            return {"complaints": records, "count": len(records)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{complaint_id}/status")
async def update_complaint_status(
    request: Request,
    complaint_id: str,
    status: ComplaintStatus,
    notes: str = "",
):
    """
    Updates the status of a complaint (open → under_probe → closed).
    Optional notes field for investigation updates.
    """
    try:
        async with db_manager.session() as s:
            await s.run("""
                MATCH (c:Complaint {complaint_id: $id})
                SET c.status = $status,
                    c.status_notes = $notes,
                    c.updated_at = datetime()
            """, id=complaint_id, status=status.value, notes=notes)
        return {"status": "updated", "complaint_id": complaint_id, "new_status": status.value}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{complaint_id}")
async def update_complaint(
    request: Request,
    complaint_id: str,
    body: dict,
    current_user: UserInDB = Depends(require_officer),
):
    """
    Full update of a complaint record.
    Accepts any subset of complaint fields.
    """
    allowed = {
        'complainant_name', 'complainant_phone', 'fraud_upi_id',
        'fraud_phone', 'fraud_bank_account', 'amount_inr',
        'description', 'district', 'status', 'fir_number',
        'transaction_date', 'fraud_type',
    }
    updates = {k: v for k, v in body.items() if k in allowed and v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    set_clause = ", ".join(f"c.{k} = ${k}" for k in updates)
    try:
        async with db_manager.session() as s:
            await s.run(
                f"MATCH (c:Complaint {{complaint_id: $id}}) SET {set_clause}, c.updated_at = datetime()",
                id=complaint_id, **updates
            )
        # Audit log
        officer = await _get_officer_info(request)
        await audit_service.log(
            action="update", entity_type="complaint",
            entity_id=complaint_id,
            officer_username=officer["username"],
            officer_badge=officer["badge"],
            officer_role=officer["role"],
            ip_address=request.client.host if request.client else "unknown",
            description=f"Complaint updated: {list(updates.keys())}",
            after=updates
        )
        return {"status": "updated", "complaint_id": complaint_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{complaint_id}")
async def delete_complaint(request: Request, complaint_id: str, current_user: UserInDB = Depends(require_officer)):
    """Delete a complaint record."""
    try:
        async with db_manager.session() as s:
            await s.run(
                "MATCH (c:Complaint {complaint_id: $id}) DETACH DELETE c",
                id=complaint_id
            )
        # Audit log
        officer = await _get_officer_info(request)
        await audit_service.log(
            action="delete", entity_type="complaint",
            entity_id=complaint_id,
            officer_username=officer["username"],
            officer_badge=officer["badge"],
            officer_role=officer["role"],
            ip_address=request.client.host if request.client else "unknown",
            description=f"Complaint DELETED: {complaint_id}",
        )
        return {"status": "deleted", "complaint_id": complaint_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))