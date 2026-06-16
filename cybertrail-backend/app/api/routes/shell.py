"""
app/api/routes/shell.py — Shell Company endpoints
"""
from app.services.audit_service import audit_service
from app.core.auth import get_current_user, require_officer
from app.core.database import db_manager
from app.models.auth import UserInDB
from fastapi import Depends, APIRouter, HTTPException, Request, UploadFile, File
from slowapi import Limiter
from slowapi.util import get_remote_address
from loguru import logger
from app.models.graph import ShellTraceRequest, InvestigationGraph
from app.modules.shell.tracer import ShellTracer

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)
_tracer = ShellTracer()


@router.post("/trace", response_model=InvestigationGraph)
@limiter.limit("20/minute")
async def trace_shell(request: Request, body: ShellTraceRequest, current_user: UserInDB = Depends(get_current_user)):
    """
    Traces beneficial ownership and director networks.

    - **identifier**: Company CIN (L21091KA2019PTC…), director DIN (8 digits), or company name
    - **identifier_type**: cin / director_din / company_name / auto
    - **depth**: how many director-company hops to explore
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
                description=f"Trace [shell]: {body.identifier} | depth={getattr(body,'depth',2)} | nodes={getattr(result,'total_nodes',0)} | flagged={getattr(result,'flagged_count',0)}",
            )
        except Exception:
            pass
        return result
    except Exception as e:
        logger.error(f"Shell trace error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/company/{cin}")
async def get_company(request: Request, cin: str):
    """Returns MCA21 master data for a single company CIN."""
    try:
        data = await _tracer._fetch_company(cin)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ingest-company-data")
@limiter.limit("5/minute")
async def ingest_company_data(
    request: Request,
    file: UploadFile = File(...),
    current_user: UserInDB = Depends(require_officer),
):
    """
    Ingest company-director data CSV to seed the shell company graph.
    Creates Company and Director nodes with DIRECTS edges.

    Expected CSV columns:
      cin, company_name, director_din, director_name, designation,
      date_of_appointment, company_status
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
                cin     = str(row.get("cin", "")).strip()
                cname   = str(row.get("company_name", "")).strip()
                din     = str(row.get("director_din", "")).strip()
                dname   = str(row.get("director_name", "")).strip()
                desig   = str(row.get("designation", "Director")).strip()
                doa     = str(row.get("date_of_appointment", "")).strip()
                status  = str(row.get("company_status", "Active")).strip()

                if not cin or not din or cin == "nan" or din == "nan":
                    continue

                # Shell indicators
                is_struck = any(x in status.lower() for x in ("struck", "dissolved", "liquidat", "inactive"))
                await s.run("""
                    MERGE (c:Company {cin: $cin})
                    SET c.name         = $cname,
                        c.label        = $cname,
                        c.status       = $status,
                        c.node_type    = 'company',
                        c.flagged      = $is_struck
                    MERGE (d:Director {din: $din})
                    SET d.name         = $dname,
                        d.label        = $dname,
                        d.node_type    = 'person'
                    MERGE (d)-[r:DIRECTS]->(c)
                    SET r.designation  = $desig,
                        r.doa          = $doa,
                        r.source       = 'csv_import'
                """, cin=cin, cname=cname or cin, din=din, dname=dname or din,
                     desig=desig, doa=doa, status=status, is_struck=is_struck)
                imported += 1

        await audit_service.log(
            action="create", entity_type="company_data",
            entity_id=file.filename,
            officer_username=current_user.username,
            officer_badge=current_user.badge_id,
            officer_role=current_user.role.value,
            ip_address=request.client.host if request.client else "unknown",
            description=f"Company data import: {file.filename} — {imported} director records",
        )
        return {"status": "success", "imported": imported}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@router.put("/director-record")
@limiter.limit("30/minute")
async def update_director_record(
    request: Request,
    body: dict,
    current_user: UserInDB = Depends(require_officer),
):
    """Update designation, status, or date_of_appointment for a director-company record."""
    din         = str(body.get("din", "")).strip()
    cin         = str(body.get("cin", "")).strip()
    if not din or not cin:
        raise HTTPException(status_code=400, detail="din and cin required")
    director_name = str(body.get("director_name", "")).strip()
    company_name  = str(body.get("company_name",  "")).strip()
    designation   = str(body.get("designation",   "Director")).strip()
    company_status= str(body.get("company_status","Active")).strip()
    doa           = str(body.get("date_of_appointment", "")).strip()
    try:
        async with db_manager.session() as s:
            await s.run("""
                MATCH (d:Director {din: $din})-[r:DIRECTS]->(c:Company {cin: $cin})
                SET r.designation = $designation,
                    r.doa         = $doa,
                    d.name        = $dname,
                    c.name        = $cname,
                    c.status      = $status
            """, din=din, cin=cin, designation=designation, doa=doa,
                 dname=director_name or din, cname=company_name or cin, status=company_status)
        return {"status": "updated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/director-record")
async def delete_director_record(
    request: Request,
    din: str,
    cin: str,
    current_user: UserInDB = Depends(require_officer),
):
    """Delete a specific director-company relationship."""
    from app.core.database import db_manager
    try:
        async with db_manager.session() as s:
            result = await s.run("""
                MATCH (d:Director {din: $din})-[r:DIRECTS]->(c:Company {cin: $cin})
                DELETE r
                RETURN count(r) AS deleted
            """, din=din, cin=cin)
            rec = await result.single()
        await audit_service.log(
            action="delete", entity_type="company_data",
            entity_id=f"{din}→{cin}",
            officer_username=current_user.username,
            officer_badge=current_user.badge_id,
            officer_role=current_user.role.value,
            ip_address=request.client.host if request.client else "unknown",
            description=f"Deleted director record: DIN {din} → CIN {cin}",
        )
        return {"deleted": rec["deleted"] if rec else 0}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/company-data/all")
async def delete_all_company_data(
    request: Request,
    current_user: UserInDB = Depends(require_officer),
):
    """Delete ALL imported company-director DIRECTS relationships."""
    from app.core.database import db_manager
    try:
        async with db_manager.session() as s:
            result = await s.run("""
                MATCH ()-[r:DIRECTS]->()
                DELETE r
                RETURN count(r) AS deleted
            """)
            rec = await result.single()
        await audit_service.log(
            action="delete", entity_type="company_data",
            entity_id="ALL_COMPANY",
            officer_username=current_user.username,
            officer_badge=current_user.badge_id,
            officer_role=current_user.role.value,
            ip_address=request.client.host if request.client else "unknown",
            description="Deleted ALL imported company-director records",
        )
        return {"deleted": rec["deleted"] if rec else 0}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))