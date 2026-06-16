"""
app/api/routes/upi.py
─────────────────────
REST API endpoints for the UPI / Bank Fraud module.

Endpoints:
  POST /api/v1/upi/trace           — Trace a UPI ID / phone / bank account
  POST /api/v1/upi/ingest-csv      — Upload a complaint CSV to seed the database
  GET  /api/v1/upi/stats           — Complaint statistics summary
"""

from app.services.audit_service import audit_service
from app.core.auth import get_current_user, require_officer
from app.core.database import db_manager
from app.models.auth import UserInDB
from fastapi import Depends,  APIRouter, HTTPException, Request, UploadFile, File
from slowapi import Limiter
from slowapi.util import get_remote_address
from loguru import logger

from app.models.graph import UPITraceRequest, InvestigationGraph
from app.modules.upi.tracer import UPITracer

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)
_tracer = UPITracer()


@router.post("/trace", response_model=InvestigationGraph)
@limiter.limit("30/minute")
async def trace_upi(request: Request, body: UPITraceRequest, current_user: UserInDB = Depends(get_current_user)):
    """
    Traces a UPI ID, mobile number, or bank account number.
    Returns a graph of mule accounts and money flow chains.

    - **identifier**: UPI ID (user@bank), phone (10 digits), or bank account number
    - **depth**: expansion depth (max 5)
    - **identifier_type**: override auto-detection (upi/phone/bank_account)
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
                description=f"Trace [upi]: {body.identifier} | depth={getattr(body,'depth',2)} | nodes={getattr(result,'total_nodes',0)} | flagged={getattr(result,'flagged_count',0)}",
            )
        except Exception:
            pass
        return result
    except Exception as e:
        logger.error(f"UPI trace error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ingest-csv")
@limiter.limit("10/minute")
async def ingest_complaint_csv(request: Request, file: UploadFile = File(...), current_user: UserInDB = Depends(require_officer)):
    """
    Ingests a complaint CSV file into the investigation database.

    Expected columns (flexible mapping):
      complaint_id, complainant_phone, fraud_upi_id, fraud_phone,
      fraud_bank_account, amount_inr, transaction_date

    Use this to load FIR data, NCRP exports, or bank complaint logs.
    Repeated ingestion is safe — MERGE prevents duplicates.
    """
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files accepted.")
    try:
        contents = await file.read()
        result = await _tracer.ingest_complaint_csv(contents)
        return {"status": "success", **result}
    except Exception as e:
        logger.error(f"CSV ingest error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def upi_stats():
    """Returns complaint database statistics (total UPI IDs, phones, flagged accounts)."""
    from app.core.database import db_manager
    try:
        async with db_manager.session() as s:
            result = await s.run("""
                RETURN
                  COUNT { MATCH (u:UpiAccount) RETURN u } AS total_upi,
                  COUNT { MATCH (u:UpiAccount {flagged: true}) RETURN u } AS flagged_upi,
                  COUNT { MATCH (p:Phone) RETURN p } AS total_phones,
                  COUNT { MATCH (b:BankAccount) RETURN b } AS total_bank_accounts
            """)
            record = await result.single()
            return dict(record) if record else {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ingest-bank-transfers")
@limiter.limit("5/minute")
async def ingest_bank_transfers(
    request: Request,
    file: UploadFile = File(...),
    current_user: UserInDB = Depends(require_officer),
):
    """
    Ingest bank transfer CSV from Section 91 CrPC bank response.
    This creates fraud→mule edges in the graph (money flow AFTER the fraud account).

    Expected CSV columns:
      from_upi, to_upi, amount_inr, transfer_date, bank_reference, from_bank, to_bank
    """
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files accepted.")
    try:
        import io, csv as csvlib
        from app.core.database import db_manager
        from app.services.audit_service import audit_service

        contents = (await file.read()).decode("utf-8")
        # Normalize headers before creating reader
        lines = contents.strip().split("\n")
        if lines:
            lines[0] = ",".join(c.strip().lower().replace(" ", "_") for c in lines[0].split(","))
        reader = csvlib.DictReader(io.StringIO("\n".join(lines)))

        imported = 0
        async with db_manager.session() as s:
            for row in reader:
                from_upi = str(row.get("from_upi", "") or "").strip()
                to_upi   = str(row.get("to_upi", "") or "").strip()
                amount   = float(row.get("amount_inr", 0) or 0)
                date     = str(row.get("transfer_date", "")).strip()
                ref      = str(row.get("bank_reference", "")).strip()

                if not from_upi or not to_upi or from_upi == "nan" or to_upi == "nan":
                    continue

                # Create both UPI account nodes and a BANK_TRANSFER edge
                await s.run("""
                    MERGE (f:UpiAccount {upi_id: $from_upi})
                    SET f.label = $from_upi, f.node_type = 'upi_account'
                    MERGE (t:UpiAccount {upi_id: $to_upi})
                    SET t.label = $to_upi, t.node_type = 'upi_account'
                    MERGE (f)-[r:UPI_TX {bank_reference: $ref}]->(t)
                    SET r.amount    = $amount,
                        r.date      = $date,
                        r.direction = 'transfer',
                        r.source    = 'bank_statement'
                """, from_upi=from_upi, to_upi=to_upi,
                     amount=amount, date=date, ref=ref or f"{from_upi}_{to_upi}_{date}")
                imported += 1

        await audit_service.log(
            action="create", entity_type="bank_transfer",
            entity_id=file.filename,
            officer_username=current_user.username,
            officer_badge=current_user.badge_id,
            officer_role=current_user.role.value,
            ip_address=request.client.host if request.client else "unknown",
            description=f"Bank transfer CSV ingested: {file.filename} — {imported} transfers",
        )
        return {"status": "success", "imported": imported}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/link-accounts")
async def link_accounts(
    request: Request,
    body: dict,
    current_user: UserInDB = Depends(require_officer),
):
    """
    Manually link two UPI/bank accounts with a transfer edge.
    Used by officers after receiving Section 91 CrPC bank response.
    Body: { from_id, to_id, amount_inr, transfer_date, reference, note }
    """
    from app.core.database import db_manager
    from app.services.audit_service import audit_service

    from_id  = str(body.get("from_id", "")).strip()
    to_id    = str(body.get("to_id", "")).strip()
    amount   = float(body.get("amount_inr", 0) or 0)
    date     = str(body.get("transfer_date", "")).strip()
    ref      = str(body.get("reference", "")).strip() or f"manual_{from_id}_{to_id}"
    note     = str(body.get("note", "")).strip()

    if not from_id or not to_id:
        raise HTTPException(status_code=400, detail="from_id and to_id are required")
    if from_id == to_id:
        raise HTTPException(status_code=400, detail="from and to cannot be the same account")

    try:
        async with db_manager.session() as s:
            # Detect node types from ID format — order matters
            def node_type(id_str):
                if "@" in id_str:
                    return ("UpiAccount", "upi_id", "upi_account")
                if id_str.isdigit() and len(id_str) == 10:
                    return ("Phone", "number", "phone")
                if id_str.isdigit():
                    # Pure digits but not 10 chars — DIN (8 digits) or bank account number
                    return ("BankAccount", "account_number", "bank_account")
                # Crypto wallet prefixes — only when it's NOT pure digits or alphanumeric bank acct
                if id_str.startswith("bc1") or id_str.startswith("0x") or id_str.startswith("T9") or id_str.startswith("TB"):
                    return ("Wallet", "address", "wallet_btc")
                # Default: treat alphanumeric strings as bank accounts (e.g. 1234567890HDFC)
                return ("BankAccount", "account_number", "bank_account")

            f_label, f_prop, f_type = node_type(from_id)
            t_label, t_prop, t_type = node_type(to_id)

            await s.run(f"""
                MERGE (f:{f_label} {{{f_prop}: $from_id}})
                SET f.label = $from_id, f.node_type = $f_type
                MERGE (t:{t_label} {{{t_prop}: $to_id}})
                SET t.label = $to_id, t.node_type = $t_type
                MERGE (f)-[r:UPI_TX {{bank_reference: $ref}}]->(t)
                SET r.amount    = $amount,
                    r.date      = $date,
                    r.direction = 'transfer',
                    r.source    = 'manual_entry',
                    r.note      = $note,
                    r.added_by  = $officer
            """, from_id=from_id, to_id=to_id, f_type=f_type, t_type=t_type,
                 amount=amount, date=date, ref=ref, note=note,
                 officer=current_user.username)

        await audit_service.log(
            action="create", entity_type="account_link",
            entity_id=f"{from_id} → {to_id}",
            officer_username=current_user.username,
            officer_badge=current_user.badge_id,
            officer_role=current_user.role.value,
            ip_address=request.client.host if request.client else "unknown",
            description=f"Manual link: {from_id} → {to_id} ₹{amount} on {date} | Ref: {ref} | {note}",
        )
        return {"status": "linked", "from": from_id, "to": to_id, "amount": amount}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@router.put("/bank-transfer")
@limiter.limit("30/minute")
async def update_bank_transfer(
    request: Request,
    body: dict,
    current_user: UserInDB = Depends(require_officer),
):
    """Update amount, date, or note on a bank transfer edge."""
    from_id   = str(body.get("from_id",   "")).strip()
    to_id     = str(body.get("to_id",     "")).strip()
    reference = str(body.get("reference", "")).strip()
    if not from_id or not to_id:
        raise HTTPException(status_code=400, detail="from_id and to_id required")
    amount   = float(body.get("amount_inr", 0) or 0)
    date     = str(body.get("transfer_date", "")).strip()
    note     = str(body.get("note", "")).strip()
    try:
        async with db_manager.session() as s:
            # Match on from/to regardless of node type — update the UPI_TX edge
            await s.run("""
                MATCH (a)-[r:UPI_TX]->(b)
                WHERE COALESCE(a.upi_id, a.number, a.account_number, a.address) = $from_id
                  AND COALESCE(b.upi_id, b.number, b.account_number, b.address) = $to_id
                  AND ($ref = '' OR r.bank_reference = $ref)
                SET r.amount = $amount, r.date = $date, r.note = $note
            """, from_id=from_id, to_id=to_id, ref=reference,
                 amount=amount, date=date, note=note)
        return {"status": "updated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/bank-transfer")
async def delete_bank_transfer(
    request: Request,
    from_id: str,
    to_id: str,
    ref: str = "",
    current_user: UserInDB = Depends(require_officer),
):
    """Delete a specific bank transfer edge."""
    from app.core.database import db_manager
    try:
        async with db_manager.session() as s:
            if ref:
                result = await s.run("""
                    MATCH ()-[r:UPI_TX {bank_reference: $ref}]->()
                    WHERE r.source IN ['bank_statement','manual_entry','transfer']
                       OR r.direction IN ['transfer','manual_entry']
                    DELETE r
                    RETURN count(r) AS deleted
                """, ref=ref)
            else:
                result = await s.run("""
                    MATCH (a {upi_id: $from_id})-[r:UPI_TX]->(b {upi_id: $to_id})
                    WHERE r.source IN ['bank_statement','manual_entry']
                       OR r.direction = 'transfer'
                    DELETE r
                    RETURN count(r) AS deleted
                """, from_id=from_id, to_id=to_id)
            rec = await result.single()
        await audit_service.log(
            action="delete", entity_type="bank_transfer",
            entity_id=f"{from_id}→{to_id}",
            officer_username=current_user.username,
            officer_badge=current_user.badge_id,
            officer_role=current_user.role.value,
            ip_address=request.client.host if request.client else "unknown",
            description=f"Deleted bank transfer: {from_id} → {to_id} ref={ref}",
        )
        return {"deleted": rec["deleted"] if rec else 0}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/bank-transfers/all")
async def delete_all_bank_transfers(
    request: Request,
    current_user: UserInDB = Depends(require_officer),
):
    """Delete ALL imported bank transfer and manual link edges."""
    from app.core.database import db_manager
    try:
        async with db_manager.session() as s:
            result = await s.run("""
                MATCH ()-[r:UPI_TX]->()
                WHERE r.source IN ['bank_statement','manual_entry']
                   OR r.direction IN ['transfer']
                DELETE r
                RETURN count(r) AS deleted
            """)
            rec = await result.single()
        await audit_service.log(
            action="delete", entity_type="bank_transfer",
            entity_id="ALL_TRANSFERS",
            officer_username=current_user.username,
            officer_badge=current_user.badge_id,
            officer_role=current_user.role.value,
            ip_address=request.client.host if request.client else "unknown",
            description="Deleted ALL imported bank transfer records",
        )
        return {"deleted": rec["deleted"] if rec else 0}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))