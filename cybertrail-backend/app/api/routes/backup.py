"""
app/api/routes/backup.py
─────────────────────────
Disaster Recovery & Backup Module
══════════════════════════════════
Supports full and incremental backup of all CyberTrail data:
  - Complaints (UPI fraud + bank transfers + CDR + company data)
  - Cases (with notes, traces, graph data)
  - Blacklist entries
  - Audit trail
  - User accounts (no passwords)

Backup format: JSON (human-readable, re-importable)
Schedule: Manual trigger via API or can be cron'd externally

Restore: Upload the backup JSON to restore all data
"""

import json
import gzip
import base64
import os
from datetime import datetime, timezone
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from fastapi.responses import Response
from loguru import logger

from app.core.auth import require_admin, require_supervisor, get_current_user
from app.core.config import settings
from app.core.database import db_manager
from app.services.audit_service import audit_service
from app.models.auth import UserInDB

router = APIRouter()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


SALT = b"CyberTrailBackup"   # fixed salt - password is already strong

def _make_fernet(password: str) -> Fernet:
    """Derive a Fernet key from the backup password using PBKDF2."""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=SALT,
        iterations=480000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(password.encode()))
    return Fernet(key)


def _encrypt(data: bytes, password: str) -> bytes:
    """AES-256 encrypt bytes using the backup password."""
    return _make_fernet(password).encrypt(data)


def _decrypt(data: bytes, password: str) -> bytes:
    """Decrypt AES-256 encrypted bytes. Raises InvalidToken if wrong password."""
    return _make_fernet(password).decrypt(data)


# ── FULL BACKUP ──────────────────────────────────────────

@router.get("/export")
async def export_backup(
    request: Request,
    compress: bool = True,
    current_user: UserInDB = Depends(require_supervisor),
):
    """
    Export a full backup of all CyberTrail data as JSON.
    Returns a downloadable .json or .json.gz file.
    Includes: complaints, cases, blacklist, CDR, company data,
              bank transfers, audit trail, users (no passwords).
    Admin/Supervisor only.
    """
    logger.info(f"Full backup initiated by {current_user.username}")

    backup = {
        "meta": {
            "version": "1.0",
            "created_at": _now(),
            "created_by": current_user.username,
            "platform": "CyberTrail",
            "description": "Full data backup - all modules",
        },
        "data": {}
    }

    async with db_manager.session() as s:

        # ── Complaints ────────────────────────────────
        r = await s.run("""
            MATCH (c:Complaint)
            RETURN c { .* } AS complaint
            ORDER BY c.created_at
        """)
        backup["data"]["complaints"] = [dict(rec["complaint"]) async for rec in r]

        # ── UPI Accounts (flagged) ────────────────────
        r = await s.run("""
            MATCH (u:UpiAccount)
            RETURN u { .* } AS node
        """)
        backup["data"]["upi_accounts"] = [dict(rec["node"]) async for rec in r]

        # ── Phone nodes ───────────────────────────────
        r = await s.run("""
            MATCH (p:Phone)
            RETURN p { .* } AS node
        """)
        backup["data"]["phones"] = [dict(rec["node"]) async for rec in r]

        # ── Bank accounts ─────────────────────────────
        r = await s.run("""
            MATCH (b:BankAccount)
            RETURN b { .* } AS node
        """)
        backup["data"]["bank_accounts"] = [dict(rec["node"]) async for rec in r]

        # ── UPI_TX edges (complaints + bank transfers) ─
        r = await s.run("""
            MATCH (a)-[r:UPI_TX]->(b)
            RETURN
                COALESCE(a.upi_id, a.number, a.account_number, a.address) AS from_id,
                COALESCE(b.upi_id, b.number, b.account_number, b.address) AS to_id,
                r { .* } AS rel
        """)
        backup["data"]["upi_transactions"] = [
            {"from": rec["from_id"], "to": rec["to_id"], **dict(rec["rel"])}
            async for rec in r
        ]

        # ── Call records (CDR) ────────────────────────
        r = await s.run("""
            MATCH (a:Phone)-[r:CALLED|REGISTERED|ASSOCIATED]->(b:Phone)
            RETURN a.number AS from_ph, b.number AS to_ph,
                   type(r) AS relationship, r { .* } AS rel
        """)
        backup["data"]["call_records"] = [
            {"from": rec["from_ph"], "to": rec["to_ph"],
             "relationship": rec["relationship"], **dict(rec["rel"])}
            async for rec in r
        ]

        # ── Company + Director data ───────────────────
        r = await s.run("""
            MATCH (c:Company)
            RETURN c { .* } AS company
        """)
        backup["data"]["companies"] = [dict(rec["company"]) async for rec in r]

        r = await s.run("""
            MATCH (d:Director)-[r:DIRECTS]->(c:Company)
            RETURN d { .* } AS director, c.cin AS cin, r { .* } AS rel
        """)
        backup["data"]["director_records"] = [
            {**dict(rec["director"]), "cin": rec["cin"], **dict(rec["rel"])}
            async for rec in r
        ]

        # ── Cases ─────────────────────────────────────
        r = await s.run("""
            MATCH (c:Case)
            OPTIONAL MATCH (c)-[:HAS_NOTE]->(n:CaseNote)
            OPTIONAL MATCH (c)-[:HAS_TRACE]->(t:TraceRecord)
            WITH c, n, t ORDER BY c.created_at
            RETURN c { .* } AS case_data,
                   collect(DISTINCT n { .* }) AS notes,
                   collect(DISTINCT t {
                       .id, .identifier, .module, .depth,
                       .node_count, .edge_count, .flagged,
                       .traced_at, .traced_by
                   }) AS traces
        """)
        cases = []
        async for rec in r:
            case = dict(rec["case_data"])
            case["notes"]  = [dict(n) for n in rec["notes"]  if n]
            case["traces"] = [dict(t) for t in rec["traces"] if t]
            cases.append(case)
        backup["data"]["cases"] = cases

        # ── Blacklist ─────────────────────────────────
        r = await s.run("""
            MATCH (b:Blacklist)
            RETURN b { .* } AS entry
            ORDER BY b.added_at
        """)
        backup["data"]["blacklist"] = [dict(rec["entry"]) async for rec in r]

        # ── Audit trail (last 10000 entries) ──────────
        r = await s.run("""
            MATCH (a:AuditLog)
            RETURN a { .* } AS log
            ORDER BY a.timestamp DESC
            LIMIT 10000
        """)
        backup["data"]["audit_trail"] = [dict(rec["log"]) async for rec in r]

        # ── Users (no passwords/tokens) ───────────────
        r = await s.run("""
            MATCH (u:User)
            RETURN u { .id, .username, .full_name, .badge_id, .role,
                       .department, .designation, .email, .is_active,
                       .created_at } AS user
            ORDER BY u.created_at
        """)
        backup["data"]["users"] = [dict(rec["user"]) async for rec in r]

    # ── Summary ───────────────────────────────────────
    backup["meta"]["summary"] = {
        k: len(v) for k, v in backup["data"].items()
    }

    # ── Serialize ─────────────────────────────────────
    json_bytes = json.dumps(backup, indent=2, default=str).encode("utf-8")
    timestamp  = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename   = f"cybertrail_backup_{timestamp}"

    await audit_service.log(
        action="export", entity_type="backup",
        entity_id=filename,
        officer_username=current_user.username,
        officer_badge=current_user.badge_id,
        officer_role=current_user.role.value,
        ip_address=request.client.host if request.client else "unknown",
        description=f"Full backup exported: {backup['meta']['summary']}",
    )

    # ── Compress then encrypt ─────────────────────────
    compressed = gzip.compress(json_bytes, compresslevel=6)
    password   = settings.BACKUP_ENCRYPTION_PASSWORD
    encrypted  = _encrypt(compressed, password)

    await audit_service.log(
        action="export", entity_type="backup",
        entity_id=filename,
        officer_username=current_user.username,
        officer_badge=current_user.badge_id,
        officer_role=current_user.role.value,
        ip_address=request.client.host if request.client else "unknown",
        description=f"Full backup exported (AES-256 encrypted): {backup['meta']['summary']}",
    )

    return Response(
        content=encrypted,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}.ct.enc"'},
    )


# ── INCREMENTAL BACKUP ───────────────────────────────────

@router.get("/export/incremental")
async def export_incremental(
    request: Request,
    since_hours: int = 24,
    current_user: UserInDB = Depends(require_supervisor),
):
    """
    Export only data changed/added in the last N hours.
    Default: last 24 hours. Use for daily automated backups.
    """
    from datetime import timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=since_hours)).isoformat()

    backup = {
        "meta": {
            "version": "1.0",
            "type": "incremental",
            "since_hours": since_hours,
            "cutoff": cutoff,
            "created_at": _now(),
            "created_by": current_user.username,
            "platform": "CyberTrail",
        },
        "data": {}
    }

    async with db_manager.session() as s:
        # Only nodes created/updated after cutoff
        r = await s.run("""
            MATCH (c:Complaint)
            WHERE c.created_at >= $cutoff OR c.updated_at >= $cutoff
            RETURN c { .* } AS complaint
        """, cutoff=cutoff)
        backup["data"]["complaints"] = [dict(rec["complaint"]) async for rec in r]

        r = await s.run("""
            MATCH (c:Case)
            WHERE c.created_at >= $cutoff OR c.updated_at >= $cutoff
            OPTIONAL MATCH (c)-[:HAS_NOTE]->(n:CaseNote)
            OPTIONAL MATCH (c)-[:HAS_TRACE]->(t:TraceRecord)
            RETURN c { .* } AS case_data,
                   collect(DISTINCT n { .* }) AS notes,
                   collect(DISTINCT t {
                       .id, .identifier, .module, .depth,
                       .node_count, .edge_count, .flagged,
                       .traced_at, .traced_by
                   }) AS traces
        """, cutoff=cutoff)
        cases = []
        async for rec in r:
            case = dict(rec["case_data"])
            case["notes"]  = [dict(n) for n in rec["notes"]  if n]
            case["traces"] = [dict(t) for t in rec["traces"] if t]
            cases.append(case)
        backup["data"]["cases"] = cases

        r = await s.run("""
            MATCH (a:AuditLog)
            WHERE a.timestamp >= $cutoff
            RETURN a { .* } AS log
            ORDER BY a.timestamp DESC
        """, cutoff=cutoff)
        backup["data"]["audit_trail"] = [dict(rec["log"]) async for rec in r]

        r = await s.run("""
            MATCH (b:Blacklist)
            WHERE b.added_at >= $cutoff
            RETURN b { .* } AS entry
        """, cutoff=cutoff)
        backup["data"]["blacklist"] = [dict(rec["entry"]) async for rec in r]

    backup["meta"]["summary"] = {k: len(v) for k, v in backup["data"].items()}

    json_bytes = json.dumps(backup, indent=2, default=str).encode("utf-8")
    compressed = gzip.compress(json_bytes, compresslevel=6)
    password   = settings.BACKUP_ENCRYPTION_PASSWORD
    encrypted  = _encrypt(compressed, password)
    timestamp  = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename   = f"cybertrail_incremental_{timestamp}"

    await audit_service.log(
        action="export", entity_type="backup",
        entity_id=filename,
        officer_username=current_user.username,
        officer_badge=current_user.badge_id,
        officer_role=current_user.role.value,
        ip_address=request.client.host if request.client else "unknown",
        description=f"Incremental backup (AES-256 encrypted, {since_hours}h): {backup['meta']['summary']}",
    )

    return Response(
        content=encrypted,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}.ct.enc"'},
    )


# ── BACKUP STATUS ─────────────────────────────────────────

@router.get("/status")
async def backup_status(
    request: Request,
    current_user: UserInDB = Depends(require_supervisor),
):
    """
    Returns current database statistics and last backup info.
    """
    async with db_manager.session() as s:
        r = await s.run("""
            RETURN
                COUNT { MATCH (c:Complaint)     RETURN c } AS complaints,
                COUNT { MATCH (c:Case)          RETURN c } AS cases,
                COUNT { MATCH (b:Blacklist)RETURN b } AS blacklist,
                COUNT { MATCH (a:AuditLog)      RETURN a } AS audit_logs,
                COUNT { MATCH (u:User)          RETURN u } AS users,
                COUNT { MATCH (p:Phone)         RETURN p } AS phones,
                COUNT { MATCH (u:UpiAccount)    RETURN u } AS upi_accounts,
                COUNT { MATCH (c:Company)       RETURN c } AS companies,
                COUNT { MATCH (d:Director)      RETURN d } AS directors,
                COUNT { MATCH ()-[r:UPI_TX]->() RETURN r } AS transactions,
                COUNT { MATCH ()-[r:CALLED|REGISTERED|ASSOCIATED]->() RETURN r } AS call_records,
                COUNT { MATCH ()-[r:DIRECTS]->() RETURN r } AS director_records
        """)
        rec = await r.single()
        stats = dict(rec) if rec else {}

    # Last backup from audit trail
    async with db_manager.session() as s:
        r = await s.run("""
            MATCH (a:AuditLog {action: 'export', entity_type: 'backup'})
            RETURN a.timestamp AS ts, a.officer_username AS by,
                   a.description AS desc
            ORDER BY a.timestamp DESC LIMIT 1
        """)
        last = await r.single()

    return {
        "database_stats": stats,
        "last_backup": {
            "timestamp": last["ts"] if last else None,
            "by": last["by"] if last else None,
            "description": last["desc"] if last else "No backup yet",
        } if last else None,
        "recommendations": _get_recommendations(stats),
    }


def _get_recommendations(stats: dict) -> list[str]:
    recs = []
    if stats.get("audit_logs", 0) > 5000:
        recs.append("Audit log has 5000+ entries - consider full backup and archiving old logs")
    if stats.get("cases", 0) > 0:
        recs.append("Run daily incremental backups to protect case data")
    if stats.get("complaints", 0) > 100:
        recs.append("Large complaint database - full backup recommended before any bulk operations")
    if not recs:
        recs.append("System healthy - schedule daily incremental backups via cron")
    return recs


# ── RESTORE ───────────────────────────────────────────────

@router.post("/restore")
async def restore_backup(
    request: Request,
    file: UploadFile = File(...),
    dry_run: bool = True,
    encryption_password: str = "",
    current_user: UserInDB = Depends(require_admin),
):
    """
    Restore from a backup .ct.enc (encrypted), .json.gz or .json file.
    Admin only.

    encryption_password: optional - if provided, used to decrypt .ct.enc files.
                         Falls back to BACKUP_ENCRYPTION_PASSWORD from .env.
    dry_run=true: validates without writing.
    dry_run=false: restores via MERGE (updates existing, adds missing, nothing deleted).
    """
    content = await file.read()
    body = {"encryption_password": encryption_password}

    # Detect format by content, not just filename extension
    # Fernet tokens always start with 'gAAAAA' (base64 encoded version byte + timestamp)
    is_fernet = content[:6] == b'gAAAAA'
    is_gzip   = content[:2] == b'\x1f\x8b'

    try:
        if is_fernet or file.filename.endswith(".ct.enc"):
            # AES-256 Fernet encrypted - decrypt first, then decompress
            restore_password = str(body.get("encryption_password", "")).strip() if body else ""
            password = restore_password or settings.BACKUP_ENCRYPTION_PASSWORD
            try:
                content = _decrypt(content, password)
            except InvalidToken:
                if restore_password and restore_password != settings.BACKUP_ENCRYPTION_PASSWORD:
                    raise HTTPException(
                        status_code=400,
                        detail="Decryption failed - the password you entered is incorrect."
                    )
                raise HTTPException(
                    status_code=400,
                    detail="Decryption failed - the backup was encrypted with a different password. Check BACKUP_ENCRYPTION_PASSWORD in your .env file."
                )
            content = gzip.decompress(content)
        elif is_gzip or file.filename.endswith(".gz"):
            content = gzip.decompress(content)
        backup = json.loads(content.decode("utf-8"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid backup file: {e}")

    meta = backup.get("meta", {})
    data = backup.get("data", {})

    if meta.get("platform") != "CyberTrail":
        raise HTTPException(status_code=400, detail="Not a CyberTrail backup file")

    summary = {k: len(v) for k, v in data.items()}

    if dry_run:
        return {
            "status": "dry_run",
            "backup_created_at": meta.get("created_at"),
            "backup_created_by": meta.get("created_by"),
            "backup_type": meta.get("type", "full"),
            "records_to_restore": summary,
            "message": "Validation passed. Set dry_run=false to actually restore.",
        }

    # ── Actual restore ────────────────────────────────
    restored = {}
    async with db_manager.session() as s:

        # UPI Accounts
        count = 0
        for u in data.get("upi_accounts", []):
            uid = u.get("upi_id")
            if not uid: continue
            props = {k: v for k, v in u.items() if k != "upi_id" and v is not None}
            set_clause = ", ".join(f"n.{k} = ${k}" for k in props)
            q = f"MERGE (n:UpiAccount {{upi_id: $uid}}) SET n.upi_id = $uid"
            if set_clause: q += f", {set_clause}"
            await s.run(q, uid=uid, **props)
            count += 1
        restored["upi_accounts"] = count

        # Phones
        count = 0
        for p in data.get("phones", []):
            num = p.get("number")
            if not num: continue
            props = {k: v for k, v in p.items() if k != "number" and v is not None}
            set_clause = ", ".join(f"n.{k} = ${k}" for k in props)
            q = "MERGE (n:Phone {number: $num}) SET n.number = $num"
            if set_clause: q += f", {set_clause}"
            await s.run(q, num=num, **props)
            count += 1
        restored["phones"] = count

        # Bank accounts
        count = 0
        for b in data.get("bank_accounts", []):
            acct = b.get("account_number")
            if not acct: continue
            props = {k: v for k, v in b.items() if k != "account_number" and v is not None}
            set_clause = ", ".join(f"n.{k} = ${k}" for k in props)
            q = "MERGE (n:BankAccount {account_number: $acct}) SET n.account_number = $acct"
            if set_clause: q += f", {set_clause}"
            await s.run(q, acct=acct, **props)
            count += 1
        restored["bank_accounts"] = count

        # Wallets
        count = 0
        for w in data.get("wallets", []):
            addr = w.get("address")
            if not addr: continue
            props = {k: v for k, v in w.items() if k != "address" and v is not None}
            set_clause = ", ".join(f"n.{k} = ${k}" for k in props)
            q = "MERGE (n:Wallet {address: $addr}) SET n.address = $addr"
            if set_clause: q += f", {set_clause}"
            await s.run(q, addr=addr, **props)
            count += 1
        restored["wallets"] = count

        # UPI Transactions (edges between accounts)
        count = 0
        for tx in data.get("upi_transactions", []):
            from_id = tx.get("from")
            to_id   = tx.get("to")
            ref     = tx.get("bank_reference") or tx.get("complaint_id") or f"restore_{from_id}_{to_id}"
            amount  = tx.get("amount", 0) or 0
            date    = tx.get("date", "")
            direction = tx.get("direction", "debit")
            source  = tx.get("source", "restore")
            if not from_id or not to_id: continue
            # Determine node type for from/to
            def node_label(id_str):
                if "@" in str(id_str): return ("UpiAccount", "upi_id")
                if str(id_str).isdigit() and len(str(id_str)) == 10: return ("Phone", "number")
                return ("BankAccount", "account_number")
            fl, fp = node_label(from_id)
            tl, tp = node_label(to_id)
            await s.run(f"""
                MERGE (f:{fl} {{{fp}: $from_id}})
                MERGE (t:{tl} {{{tp}: $to_id}})
                MERGE (f)-[r:UPI_TX {{bank_reference: $ref}}]->(t)
                SET r.amount = $amount, r.date = $date,
                    r.direction = $direction, r.source = $source
            """, from_id=from_id, to_id=to_id, ref=ref,
                 amount=amount, date=date, direction=direction, source=source)
            count += 1
        restored["upi_transactions"] = count

        # Companies
        count = 0
        for c in data.get("companies", []):
            cin = c.get("cin")
            if not cin: continue
            props = {k: v for k, v in c.items() if k != "cin" and v is not None}
            set_clause = ", ".join(f"n.{k} = ${k}" for k in props)
            q = "MERGE (n:Company {cin: $cin}) SET n.cin = $cin"
            if set_clause: q += f", {set_clause}"
            await s.run(q, cin=cin, **props)
            count += 1
        restored["companies"] = count

        # Complaints
        count = 0
        for c in data.get("complaints", []):
            cid = c.get("complaint_id") or c.get("id")
            if not cid: continue
            props = {k: v for k, v in c.items() if v is not None}
            set_clause = ", ".join(f"n.{k} = ${k}" for k in props if k != "complaint_id")
            if set_clause:
                await s.run(f"MERGE (n:Complaint {{complaint_id: $complaint_id}}) SET {set_clause}",
                            complaint_id=cid, **{k: v for k, v in props.items() if k != "complaint_id"})
                count += 1
        restored["complaints"] = count

        # Cases
        count = 0
        for case in data.get("cases", []):
            cid = case.get("id")
            if not cid: continue
            case_props = {k: v for k, v in case.items() if k not in ("id","notes","traces") and v is not None}
            set_clause = ", ".join(f"c.{k} = ${k}" for k in case_props)
            if set_clause:
                await s.run(f"MERGE (c:Case {{id: $id}}) SET {set_clause}", id=cid, **case_props)
            for note in (case.get("notes") or []):
                nid = note.get("id")
                if nid:
                    await s.run("""
                        MATCH (c:Case {id: $cid})
                        MERGE (n:CaseNote {id: $nid})
                        SET n += $props
                        MERGE (c)-[:HAS_NOTE]->(n)
                    """, cid=cid, nid=nid, props={k:v for k,v in note.items() if k!="id" and v is not None})
            count += 1
        restored["cases"] = count

        # Blacklist
        count = 0
        for b in data.get("blacklist", []):
            bid = b.get("identifier")
            if not bid: continue
            props = {k: v for k, v in b.items() if k != "identifier" and v is not None}
            set_clause = ", ".join(f"n.{k} = ${k}" for k in props)
            if set_clause:
                await s.run(f"MERGE (n:Blacklist {{identifier: $id}}) SET {set_clause}", id=bid, **props)
                count += 1
        restored["blacklist"] = count

        # Call records
        count = 0
        for r_data in data.get("call_records", []):
            from_ph = r_data.get("from")
            to_ph   = r_data.get("to")
            rel     = r_data.get("relationship", "CALLED").upper()
            if not from_ph or not to_ph: continue
            if rel not in ("CALLED", "REGISTERED", "ASSOCIATED"): rel = "CALLED"
            freq = r_data.get("frequency", 1)
            date = r_data.get("date", "")
            await s.run(f"""
                MERGE (a:Phone {{number: $from_ph}})
                MERGE (b:Phone {{number: $to_ph}})
                MERGE (a)-[r:{rel}]->(b)
                SET r.frequency = $freq, r.date = $date, r.source = 'restore'
            """, from_ph=from_ph, to_ph=to_ph, freq=freq, date=date)
            count += 1
        restored["call_records"] = count

        # Director records
        count = 0
        for d in data.get("director_records", []):
            din = d.get("din")
            cin = d.get("cin")
            if not din or not cin: continue
            await s.run("""
                MERGE (d:Director {din: $din})
                SET d.name = $name, d.label = $name, d.node_type = 'person'
                MERGE (c:Company {cin: $cin})
                MERGE (d)-[r:DIRECTS]->(c)
                SET r.designation = $desig, r.doa = $doa, r.source = 'restore'
            """, din=din, cin=cin,
                 name=d.get("name", din),
                 desig=d.get("designation", "Director"),
                 doa=d.get("doa", ""))
            count += 1
        restored["director_records"] = count

    await audit_service.log(
        action="restore", entity_type="backup",
        entity_id=file.filename,
        officer_username=current_user.username,
        officer_badge=current_user.badge_id,
        officer_role=current_user.role.value,
        ip_address=request.client.host if request.client else "unknown",
        description=f"Backup restored from {file.filename}: {restored}",
    )

    return {
        "status": "restored",
        "backup_created_at": meta.get("created_at"),
        "backup_created_by": meta.get("created_by"),
        "records_restored": restored,
        "message": "Restore complete. All data merged (existing records updated, new records added).",
    }


# ── ENCRYPTION PASSWORD MANAGEMENT ───────────────────────

@router.get("/encryption-key")
async def get_encryption_key(
    request: Request,
    current_user: UserInDB = Depends(require_admin),
):
    """Returns the current backup encryption password (admin only)."""
    password = settings.BACKUP_ENCRYPTION_PASSWORD
    masked = password[:3] + "*" * (len(password) - 6) + password[-3:] if len(password) > 6 else "***"
    return {
        "masked": masked,
        "length": len(password),
        "source": "BACKUP_ENCRYPTION_PASSWORD in .env",
        "hint": "To change: update BACKUP_ENCRYPTION_PASSWORD in your .env file and restart the server.",
    }


@router.post("/verify-encryption-key")
async def verify_encryption_key(
    request: Request,
    body: dict,
    current_user: UserInDB = Depends(require_supervisor),
):
    """
    Verifies a password can decrypt a test payload using the current env key.
    Used by UI to confirm the password before restore.
    """
    password = str(body.get("password", "")).strip()
    if not password:
        raise HTTPException(status_code=400, detail="Password required")

    env_password = settings.BACKUP_ENCRYPTION_PASSWORD
    if password == env_password:
        return {"valid": True, "message": "Password matches the environment key"}

    # Try to encrypt/decrypt with provided password as a test
    try:
        test = _encrypt(b"cybertrail_test", password)
        _decrypt(test, password)
        return {
            "valid": False,
            "message": "Password is valid but does NOT match the current environment key. Backups made with the env key cannot be decrypted with this password."
        }
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid password format")


# ── FACTORY RESET ─────────────────────────────────────────

@router.post("/factory-reset")
async def factory_reset(
    request: Request,
    body: dict,
    current_user: UserInDB = Depends(require_admin),
):
    """
    DANGER: Wipes ALL investigation data from Neo4j.
    Restricted to the 'admin' account only (not any admin - specifically username='admin').
    Requires password confirmation.

    Preserves: User accounts (so you can still log in after reset).
    Deletes: Everything else - complaints, cases, blacklist,
             CDR, companies, directors, bank transfers, audit logs,
             graph nodes (wallets, UPI, phones, banks).
    """
    from app.services.auth_service import auth_service, verify_password

    # ── Only the system admin account ─────────────────────
    if current_user.username != "admin":
        raise HTTPException(
            status_code=403,
            detail="Factory reset is restricted to the system admin account only."
        )

    # ── Password confirmation ──────────────────────────────
    password = str(body.get("password", "")).strip()
    if not password:
        raise HTTPException(status_code=400, detail="Password is required to confirm factory reset.")

    user = await auth_service.get_user_by_username("admin")
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=403,
            detail="Incorrect password. Factory reset cancelled."
        )

    # ── Confirmation phrase ────────────────────────────────
    confirm_phrase = str(body.get("confirm_phrase", "")).strip()
    if confirm_phrase != "DELETE ALL DATA":
        raise HTTPException(
            status_code=400,
            detail='You must type exactly "DELETE ALL DATA" to confirm.'
        )

    # ── Log BEFORE deleting (audit log will be deleted too) ─
    await audit_service.log(
        action="factory_reset", entity_type="system",
        entity_id="ALL",
        officer_username=current_user.username,
        officer_badge=current_user.badge_id,
        officer_role=current_user.role.value,
        ip_address=request.client.host if request.client else "unknown",
        description="FACTORY RESET initiated - all investigation data will be deleted",
    )

    logger.critical(f"FACTORY RESET initiated by {current_user.username} from {request.client.host if request.client else 'unknown'}")

    deleted = {}

    async with db_manager.session() as s:

        # Complaints
        r = await s.run("MATCH (n:Complaint) DETACH DELETE n RETURN count(n) AS c")
        rec = await r.single(); deleted["complaints"] = rec["c"] if rec else 0

        # Cases + notes + traces
        r = await s.run("MATCH (n:Case) DETACH DELETE n RETURN count(n) AS c")
        rec = await r.single(); deleted["cases"] = rec["c"] if rec else 0
        await s.run("MATCH (n:CaseNote) DETACH DELETE n")
        await s.run("MATCH (n:TraceRecord) DETACH DELETE n")

        # Blacklist
        r = await s.run("MATCH (n:Blacklist) DETACH DELETE n RETURN count(n) AS c")
        rec = await r.single(); deleted["blacklist"] = rec["c"] if rec else 0

        # Graph nodes - UPI, phones, wallets, banks, companies, directors
        r = await s.run("MATCH (n:UpiAccount) DETACH DELETE n RETURN count(n) AS c")
        rec = await r.single(); deleted["upi_accounts"] = rec["c"] if rec else 0

        r = await s.run("MATCH (n:Phone) DETACH DELETE n RETURN count(n) AS c")
        rec = await r.single(); deleted["phones"] = rec["c"] if rec else 0

        r = await s.run("MATCH (n:BankAccount) DETACH DELETE n RETURN count(n) AS c")
        rec = await r.single(); deleted["bank_accounts"] = rec["c"] if rec else 0

        r = await s.run("MATCH (n:Wallet) DETACH DELETE n RETURN count(n) AS c")
        rec = await r.single(); deleted["wallets"] = rec["c"] if rec else 0

        r = await s.run("MATCH (n:Company) DETACH DELETE n RETURN count(n) AS c")
        rec = await r.single(); deleted["companies"] = rec["c"] if rec else 0

        r = await s.run("MATCH (n:Director) DETACH DELETE n RETURN count(n) AS c")
        rec = await r.single(); deleted["directors"] = rec["c"] if rec else 0

        # Audit logs - PRESERVED intentionally
        # The audit trail is never deleted - it is the permanent record of all activity
        # even after a factory reset. This is required for legal and accountability purposes.
        r = await s.run("MATCH (n:AuditLog) RETURN count(n) AS c")
        rec = await r.single(); deleted["audit_logs_preserved"] = rec["c"] if rec else 0

    logger.critical(f"FACTORY RESET complete: {deleted}")

    return {
        "status": "reset_complete",
        "deleted": deleted,
        "preserved": ["user_accounts"],
        "message": "All investigation data has been deleted. User accounts preserved. You can start fresh.",
    }