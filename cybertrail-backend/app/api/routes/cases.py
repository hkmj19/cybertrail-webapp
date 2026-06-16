"""
app/api/routes/cases.py
────────────────────────
Case management endpoints.
FIXES: Audit logging, duplicate FIR detection, case reassignment UI.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.core.auth import get_current_user, require_officer
from app.services.case_service import case_service
from app.services.audit_service import audit_service
from app.core.database import db_manager
from app.models.auth import (
    CaseCreate, CaseUpdate, CaseResponse, CaseSummary,
    CaseNote, CaseNoteResponse, CaseTraceRecord,
    UserInDB, UserRole
)

router = APIRouter()


# ── Stats ─────────────────────────────────────────────────
@router.get("/stats", tags=["Cases"])
async def case_stats(current_user: UserInDB = Depends(get_current_user)):
    """Dashboard stats: open/active/closed counts, total fraud amount."""
    return await case_service.get_case_stats(current_user.username, current_user.role.value)


# ── List cases ────────────────────────────────────────────
@router.get("/", response_model=list[CaseSummary], tags=["Cases"])
async def list_cases(
    status:   Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    skip:     int = Query(0, ge=0),
    limit:    int = Query(50, ge=1, le=200),
    current_user: UserInDB = Depends(get_current_user)
):
    """List cases. Admin/Supervisor see all. Officer/Analyst see only their own."""
    return await case_service.get_cases(
        username=current_user.username,
        role=current_user.role.value,
        status=status, priority=priority,
        skip=skip, limit=limit
    )


# ── Create case ───────────────────────────────────────────
@router.post("/", response_model=CaseResponse, status_code=201, tags=["Cases"])
async def create_case(
    request: Request,
    data: CaseCreate,
    current_user: UserInDB = Depends(require_officer)
):
    """Create a new investigation case. Checks for duplicate FIR numbers."""

    # ── Duplicate FIR number check ────────────────────
    if data.fir_number:
        async with db_manager.session() as s:
            result = await s.run(
                "MATCH (c:Case {fir_number: $fir}) RETURN c.case_number AS cn, c.title AS title LIMIT 1",
                fir=data.fir_number
            )
            existing = await result.single()
            if existing:
                raise HTTPException(
                    status_code=409,
                    detail=f"FIR number '{data.fir_number}' already exists in case {existing['cn']}: \"{existing['title']}\". Use a different FIR number or open the existing case."
                )

    case = await case_service.create_case(data, created_by=current_user.username)

    # ── Audit log ──────────────────────────────────────
    await audit_service.log(
        action="create", entity_type="case",
        entity_id=case.case_number,
        officer_username=current_user.username,
        officer_badge=current_user.badge_id,
        officer_role=current_user.role.value,
        ip_address=request.client.host if request.client else "unknown",
        description=f"Case created: {case.case_number} - {data.title} | FIR: {data.fir_number or 'none'} | Priority: {data.priority.value}",
        after={"case_number": case.case_number, "title": data.title,
               "fir_number": data.fir_number, "priority": data.priority.value,
               "fraud_amount": str(data.fraud_amount)}
    )
    return case


# ── Get case ──────────────────────────────────────────────
@router.get("/{case_id}", response_model=CaseResponse, tags=["Cases"])
async def get_case(
    case_id: str,
    current_user: UserInDB = Depends(get_current_user)
):
    """Get full case details including notes and traces."""
    case = await case_service.get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    if current_user.role == UserRole.OFFICER:
        if case.created_by != current_user.username and case.assigned_to != current_user.username:
            raise HTTPException(status_code=403, detail="Access denied")

    return case


# ── Update case ───────────────────────────────────────────
@router.put("/{case_id}", response_model=CaseResponse, tags=["Cases"])
async def update_case(
    request: Request,
    case_id: str,
    data: CaseUpdate,
    current_user: UserInDB = Depends(require_officer)
):
    """Update case details, status, priority, or assignment."""
    case = await case_service.get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    if current_user.role == UserRole.OFFICER:
        if case.created_by != current_user.username:
            raise HTTPException(status_code=403, detail="Can only update your own cases")

    # ── Status transition rules ────────────────────────
    if data.status:
        new_status = data.status.value
        old_status = case.status.value

        # ARCHIVED is permanent - no one can change it
        if old_status == "archived":
            raise HTTPException(
                status_code=400,
                detail="Archived cases cannot be modified. This case is permanently closed."
            )

        # Only Supervisor/Admin can reopen a closed case
        if old_status == "closed" and new_status in ("open", "active", "pending"):
            if current_user.role == UserRole.OFFICER:
                raise HTTPException(
                    status_code=403,
                    detail="Only a Supervisor or Admin can reopen a closed case."
                )

        # Only Supervisor/Admin can archive
        if new_status == "archived":
            if current_user.role == UserRole.OFFICER:
                raise HTTPException(
                    status_code=403,
                    detail="Only a Supervisor or Admin can archive a case."
                )

        # Closing requires evidence
        if new_status == "closed":
            if case.trace_count == 0:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot close a case without any saved traces. Run an investigation and save it to the case first."
                )
            if case.note_count == 0:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot close a case without any investigation notes. Add at least one observation or action note."
                )

    # ── Duplicate FIR check on update ─────────────────
    if data.fir_number and data.fir_number != case.fir_number:
        async with db_manager.session() as s:
            result = await s.run(
                "MATCH (c:Case {fir_number: $fir}) WHERE c.id <> $id RETURN c.case_number AS cn LIMIT 1",
                fir=data.fir_number, id=case_id
            )
            existing = await result.single()
            if existing:
                raise HTTPException(
                    status_code=409,
                    detail=f"FIR number '{data.fir_number}' already exists in case {existing['cn']}."
                )

    # ── Reassignment: only supervisor/admin can reassign ──
    if data.assigned_to and data.assigned_to != case.assigned_to:
        if current_user.role == UserRole.OFFICER:
            raise HTTPException(status_code=403, detail="Only supervisors can reassign cases")

    updated = await case_service.update_case(case_id, data, updated_by=current_user.username)

    # ── Audit log ──────────────────────────────────────
    changes = {k: v for k, v in data.model_dump().items() if v is not None}
    description = f"Case updated: {case.case_number}"
    if data.status:       description += f" | Status → {data.status.value}"
    if data.assigned_to:  description += f" | Assigned → {data.assigned_to}"
    if data.priority:     description += f" | Priority → {data.priority.value}"

    await audit_service.log(
        action="update", entity_type="case",
        entity_id=case.case_number,
        officer_username=current_user.username,
        officer_badge=current_user.badge_id,
        officer_role=current_user.role.value,
        ip_address=request.client.host if request.client else "unknown",
        description=description,
        before={"status": case.status.value, "assigned_to": case.assigned_to,
                "priority": case.priority.value},
        after={k: str(v) for k, v in changes.items()}
    )
    return updated


# ── Delete case ───────────────────────────────────────────
@router.delete("/{case_id}", tags=["Cases"])
async def delete_case(
    request: Request,
    case_id: str,
    current_user: UserInDB = Depends(get_current_user)
):
    """Delete a case. Admin can delete any; Officer only their own."""
    case = await case_service.get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    if current_user.role not in (UserRole.ADMIN, UserRole.SUPERVISOR):
        if case.created_by != current_user.username:
            raise HTTPException(status_code=403, detail="Can only delete your own cases")

    await case_service.delete_case(case_id)

    # ── Audit log ──────────────────────────────────────
    await audit_service.log(
        action="delete", entity_type="case",
        entity_id=case.case_number,
        officer_username=current_user.username,
        officer_badge=current_user.badge_id,
        officer_role=current_user.role.value,
        ip_address=request.client.host if request.client else "unknown",
        description=f"Case DELETED: {case.case_number} - {case.title} | FIR: {case.fir_number}",
        before={"case_number": case.case_number, "title": case.title,
                "status": case.status.value, "fraud_amount": str(case.fraud_amount)}
    )
    return {"message": "Case deleted"}


# ── Notes ─────────────────────────────────────────────────
@router.post("/{case_id}/notes", response_model=CaseNoteResponse, tags=["Cases"])
async def add_note(
    request: Request,
    case_id: str,
    note: CaseNote,
    current_user: UserInDB = Depends(require_officer)
):
    """Add an investigation note to a case."""
    case = await case_service.get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    if case.status.value in ("closed", "archived"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot add notes to a {case.status.value} case. Reopen the case first (Supervisor/Admin only)."
        )

    result = await case_service.add_note(case_id, note, created_by=current_user.username)

    # ── Audit log ──────────────────────────────────────
    await audit_service.log(
        action="create", entity_type="case_note",
        entity_id=case.case_number,
        officer_username=current_user.username,
        officer_badge=current_user.badge_id,
        officer_role=current_user.role.value,
        ip_address=request.client.host if request.client else "unknown",
        description=f"Note added to {case.case_number} [{note.note_type}]: {note.content[:100]}",
    )
    return result


# ── Attach trace ──────────────────────────────────────────
@router.post("/{case_id}/traces", response_model=CaseTraceRecord, tags=["Cases"])
async def attach_trace(
    request: Request,
    case_id: str,
    body: dict,
    current_user: UserInDB = Depends(require_officer)
):
    """Save a trace result to a case."""
    case = await case_service.get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    if case.status.value in ("closed", "archived"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot add traces to a {case.status.value} case. Reopen the case first (Supervisor/Admin only)."
        )

    result = await case_service.attach_trace(
        case_id=case_id,
        identifier=body.get("identifier", ""),
        module=body.get("module", ""),
        depth=body.get("depth", 1),
        graph_data=body.get("graph_data", {}),
        traced_by=current_user.username,
    )

    # ── Audit log ──────────────────────────────────────
    gd = body.get("graph_data", {})
    await audit_service.log(
        action="create", entity_type="trace",
        entity_id=case.case_number,
        officer_username=current_user.username,
        officer_badge=current_user.badge_id,
        officer_role=current_user.role.value,
        ip_address=request.client.host if request.client else "unknown",
        description=f"Trace saved to {case.case_number}: {body.get('module','?')} - {body.get('identifier','?')} | {gd.get('total_nodes',0)} nodes | {gd.get('flagged_count',0)} flagged",
    )
    return result


# ── Assign case (Supervisor+) ─────────────────────────────
@router.put("/{case_id}/assign", tags=["Cases"])
async def assign_case(
    request: Request,
    case_id: str,
    body: dict,
    current_user: UserInDB = Depends(get_current_user)
):
    """
    Reassign a case to a different officer.
    Supervisor+ only. Body: { assigned_to: "username" }
    """
    if current_user.role not in (UserRole.ADMIN, UserRole.SUPERVISOR):
        raise HTTPException(status_code=403, detail="Only supervisors can reassign cases")

    case = await case_service.get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    new_assignee = body.get("assigned_to", "").strip()
    if not new_assignee:
        raise HTTPException(status_code=400, detail="assigned_to is required")

    # Verify the target user exists and is active
    from app.services.auth_service import auth_service
    target_user = await auth_service.get_user_by_username(new_assignee)
    if not target_user:
        raise HTTPException(status_code=404, detail=f"User '{new_assignee}' not found")

    from app.models.auth import CaseUpdate
    await case_service.update_case(case_id, CaseUpdate(assigned_to=new_assignee),
                                   updated_by=current_user.username)

    # ── Audit log ──────────────────────────────────────
    await audit_service.log(
        action="update", entity_type="case",
        entity_id=case.case_number,
        officer_username=current_user.username,
        officer_badge=current_user.badge_id,
        officer_role=current_user.role.value,
        ip_address=request.client.host if request.client else "unknown",
        description=f"Case {case.case_number} reassigned: {case.assigned_to} → {new_assignee}",
        before={"assigned_to": case.assigned_to},
        after={"assigned_to": new_assignee}
    )
    return {"message": f"Case {case.case_number} assigned to {new_assignee}",
            "assigned_to": new_assignee}