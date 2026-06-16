"""
app/services/case_service.py
─────────────────────────────
Case management CRUD via Neo4j.
Each Case node links to User (created_by), Notes, and TraceRecords.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from loguru import logger
from app.core.database import db_manager
from app.models.auth import (
    CaseCreate, CaseUpdate, CaseResponse, CaseSummary,
    CaseNote, CaseNoteResponse, CaseTraceRecord,
    CaseStatus, CasePriority
)



def _parse_dt(val) -> datetime:
    """Parse datetime string from Neo4j. Always returns UTC-aware datetime."""
    from datetime import timezone as _tz
    if not val:
        return datetime.now(_tz.utc)
    s = str(val).strip()
    # Normalize to UTC-aware
    if s.endswith('Z'):
        s = s[:-1] + '+00:00'
    elif '+' not in s and not s.endswith(')'):
        # No timezone info — stored before fix, treat as UTC
        s = s + '+00:00'
    try:
        return datetime.fromisoformat(s)
    except Exception:
        return datetime.now(_tz.utc)

class CaseService:

    # ── Counter for case numbers ──────────────────────────
    async def _next_case_number(self) -> str:
        year = datetime.utcnow().year
        async with db_manager.session() as s:
            result = await s.run("""
                MATCH (c:Case) WHERE c.case_number STARTS WITH $prefix
                RETURN count(c) AS cnt
            """, prefix=f"CT-{year}-")
            rec = await result.single()
            n = (rec["cnt"] if rec else 0) + 1
        return f"CT-{year}-{n:04d}"

    # ── Create ────────────────────────────────────────────
    async def create_case(self, data: CaseCreate, created_by: str) -> CaseResponse:
        case_id     = str(uuid.uuid4())
        case_number = await self._next_case_number()
        now         = datetime.now(timezone.utc).isoformat()

        async with db_manager.session() as s:
            await s.run("""
                MATCH (u:User {username: $username})
                CREATE (c:Case {
                    id:           $id,
                    case_number:  $case_number,
                    title:        $title,
                    description:  $description,
                    status:       $status,
                    priority:     $priority,
                    fir_number:   $fir_number,
                    district:     $district,
                    complainant:  $complainant,
                    fraud_amount: $fraud_amount,
                    tags:         $tags,
                    created_by:   $username,
                    assigned_to:  $username,
                    created_at:   $now,
                    updated_at:   $now,
                    closed_at:    null
                })
                CREATE (u)-[:CREATED]->(c)
            """,
            id=case_id, case_number=case_number,
            title=data.title, description=data.description,
            status=CaseStatus.OPEN.value, priority=data.priority.value,
            fir_number=data.fir_number or "", district=data.district or "",
            complainant=data.complainant or "",
            fraud_amount=data.fraud_amount or 0.0,
            tags=data.tags, username=created_by, now=now
            )

        logger.info(f"Case created: {case_number} by {created_by}")
        return await self.get_case(case_id)

    # ── Read ──────────────────────────────────────────────
    async def get_case(self, case_id: str) -> Optional[CaseResponse]:
        async with db_manager.session() as s:
            result = await s.run("""
                MATCH (c:Case {id: $id})
                OPTIONAL MATCH (c)-[:HAS_NOTE]->(n:CaseNote)
                OPTIONAL MATCH (c)-[:HAS_TRACE]->(t:TraceRecord)
                RETURN c,
                    collect(DISTINCT n) AS notes,
                    collect(DISTINCT t) AS traces
            """, id=case_id)
            rec = await result.single()
            if not rec:
                return None
            return self._build_response(rec["c"], rec["notes"], rec["traces"])

    async def get_cases(
        self, username: str, role: str,
        status: Optional[str] = None,
        priority: Optional[str] = None,
        skip: int = 0, limit: int = 50
    ) -> list[CaseSummary]:
        # Admin/supervisor sees all cases; officer sees own + assigned; analyst sees only assigned
        if role in ("admin", "supervisor"):
            where = "WHERE 1=1"
        elif role == "analyst":
            where = "WHERE c.assigned_to = $username"
        else:
            where = "WHERE c.created_by = $username OR c.assigned_to = $username"

        if status:
            where += f" AND c.status = '{status}'"
        if priority:
            where += f" AND c.priority = '{priority}'"

        async with db_manager.session() as s:
            result = await s.run(f"""
                MATCH (c:Case)
                {where}
                OPTIONAL MATCH (c)-[:HAS_NOTE]->(n:CaseNote)
                OPTIONAL MATCH (c)-[:HAS_TRACE]->(t:TraceRecord)
                RETURN c, count(DISTINCT n) AS note_count, count(DISTINCT t) AS trace_count
                ORDER BY
                    CASE c.priority
                        WHEN 'critical' THEN 1
                        WHEN 'high'     THEN 2
                        WHEN 'medium'   THEN 3
                        ELSE 4
                    END,
                    c.updated_at DESC
                SKIP $skip LIMIT $limit
            """, username=username, skip=skip, limit=limit)

            cases = []
            async for rec in result:
                c = dict(rec["c"])
                cases.append(CaseSummary(
                    id=c["id"], case_number=c["case_number"],
                    title=c["title"], status=CaseStatus(c["status"]),
                    priority=CasePriority(c["priority"]),
                    fir_number=c.get("fir_number") or None,
                    district=c.get("district") or None,
                    fraud_amount=c.get("fraud_amount") or None,
                    created_by=c["created_by"],
                    assigned_to=c.get("assigned_to") or None,
                    created_at=_parse_dt(c["created_at"].replace('Z','+00:00') if c.get("created_at") else datetime.utcnow().isoformat()),
                    updated_at=_parse_dt(c["updated_at"].replace('Z','+00:00') if c.get("updated_at") else datetime.utcnow().isoformat()),
                    note_count=rec["note_count"],
                    trace_count=rec["trace_count"],
                ))
            return cases

    async def get_case_stats(self, username: str, role: str) -> dict:
        if role in ("admin", "supervisor"):
            match = "MATCH (c:Case)"
        elif role == "analyst":
            match = "MATCH (c:Case) WHERE c.assigned_to = $username"
        else:
            match = "MATCH (c:Case) WHERE c.created_by = $username OR c.assigned_to = $username"

        async with db_manager.session() as s:
            result = await s.run(f"""
                {match}
                RETURN
                    count(c) AS total,
                    sum(CASE WHEN c.status = 'open'   THEN 1 ELSE 0 END) AS open_cases,
                    sum(CASE WHEN c.status = 'active' THEN 1 ELSE 0 END) AS active_cases,
                    sum(CASE WHEN c.status = 'closed' THEN 1 ELSE 0 END) AS closed_cases,
                    sum(CASE WHEN c.priority = 'critical' THEN 1 ELSE 0 END) AS critical,
                    sum(COALESCE(c.fraud_amount, 0)) AS total_fraud_amount
            """, username=username)
            rec = await result.single()
            return dict(rec) if rec else {}

    # ── Update ────────────────────────────────────────────
    async def update_case(self, case_id: str, data: CaseUpdate, updated_by: str) -> Optional[CaseResponse]:
        updates = {k: v for k, v in data.model_dump().items() if v is not None}
        if not updates:
            return await self.get_case(case_id)

        # Convert enums
        if "status" in updates:
            updates["status"] = updates["status"].value
            if updates["status"] == "closed":
                updates["closed_at"] = datetime.now(timezone.utc).isoformat()
        if "priority" in updates:
            updates["priority"] = updates["priority"].value

        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        set_clause = ", ".join(f"c.{k} = ${k}" for k in updates)

        async with db_manager.session() as s:
            await s.run(
                f"MATCH (c:Case {{id: $id}}) SET {set_clause}",
                id=case_id, **updates
            )
        return await self.get_case(case_id)

    async def delete_case(self, case_id: str) -> bool:
        async with db_manager.session() as s:
            result = await s.run("""
                MATCH (c:Case {id: $id})
                OPTIONAL MATCH (c)-[:HAS_NOTE]->(n)
                OPTIONAL MATCH (c)-[:HAS_TRACE]->(t)
                DETACH DELETE c, n, t
                RETURN count(c) AS deleted
            """, id=case_id)
            rec = await result.single()
            return rec and rec["deleted"] > 0

    # ── Notes ─────────────────────────────────────────────
    async def add_note(self, case_id: str, note: CaseNote, created_by: str) -> CaseNoteResponse:
        note_id = str(uuid.uuid4())
        now     = datetime.now(timezone.utc).isoformat()

        async with db_manager.session() as s:
            await s.run("""
                MATCH (c:Case {id: $case_id})
                CREATE (n:CaseNote {
                    id:         $id,
                    content:    $content,
                    note_type:  $note_type,
                    created_by: $created_by,
                    created_at: $now
                })
                CREATE (c)-[:HAS_NOTE]->(n)
                SET c.updated_at = $now
            """, case_id=case_id, id=note_id,
            content=note.content, note_type=note.note_type,
            created_by=created_by, now=now)

        return CaseNoteResponse(
            id=note_id, content=note.content,
            note_type=note.note_type, created_by=created_by,
            created_at=_parse_dt(now)
        )

    # ── Traces ────────────────────────────────────────────
    async def attach_trace(
        self, case_id: str, identifier: str, module: str,
        depth: int, graph_data: dict, traced_by: str
    ) -> CaseTraceRecord:
        trace_id = str(uuid.uuid4())
        now      = datetime.now(timezone.utc).isoformat()

        import json
        async with db_manager.session() as s:
            await s.run("""
                MATCH (c:Case {id: $case_id})
                CREATE (t:TraceRecord {
                    id:          $id,
                    identifier:  $identifier,
                    module:      $module,
                    depth:       $depth,
                    node_count:  $node_count,
                    edge_count:  $edge_count,
                    flagged:     $flagged,
                    traced_by:   $traced_by,
                    traced_at:   $now,
                    graph_json:  $graph_json
                })
                CREATE (c)-[:HAS_TRACE]->(t)
                SET c.updated_at = $now
            """, case_id=case_id, id=trace_id,
            identifier=identifier, module=module, depth=depth,
            node_count=graph_data.get("total_nodes", 0),
            edge_count=graph_data.get("total_edges", 0),
            flagged=graph_data.get("flagged_count", 0),
            traced_by=traced_by, now=now,
            graph_json=json.dumps(graph_data))

        return CaseTraceRecord(
            id=trace_id, identifier=identifier, module=module, depth=depth,
            node_count=graph_data.get("total_nodes", 0),
            edge_count=graph_data.get("total_edges", 0),
            flagged=graph_data.get("flagged_count", 0),
            traced_by=traced_by,
            traced_at=_parse_dt(now),
        )

    # ── Helpers ───────────────────────────────────────────
    def _build_response(self, case_node, note_nodes, trace_nodes) -> CaseResponse:
        import json
        c = dict(case_node)
        notes = []
        for n in note_nodes:
            if n:
                nd = dict(n)
                notes.append(CaseNoteResponse(
                    id=nd["id"], content=nd["content"],
                    note_type=nd.get("note_type", "observation"),
                    created_by=nd["created_by"],
                    created_at=_parse_dt(nd["created_at"])
                ))

        traces = []
        for t in trace_nodes:
            if t:
                td = dict(t)
                traces.append(CaseTraceRecord(
                    id=td["id"], identifier=td["identifier"],
                    module=td["module"], depth=td.get("depth", 1),
                    node_count=td.get("node_count", 0),
                    edge_count=td.get("edge_count", 0),
                    flagged=td.get("flagged", 0),
                    traced_by=td["traced_by"],
                    traced_at=_parse_dt(td["traced_at"]),
                    graph_data=json.loads(td["graph_json"]) if td.get("graph_json") else None
                ))

        return CaseResponse(
            id=c["id"], case_number=c["case_number"],
            title=c["title"], description=c.get("description", ""),
            status=CaseStatus(c["status"]),
            priority=CasePriority(c["priority"]),
            fir_number=c.get("fir_number") or None,
            district=c.get("district") or None,
            complainant=c.get("complainant") or None,
            fraud_amount=c.get("fraud_amount") or None,
            tags=list(c.get("tags", [])),
            created_by=c["created_by"],
            assigned_to=c.get("assigned_to") or None,
            created_at=_parse_dt(c["created_at"]),
            updated_at=_parse_dt(c["updated_at"]),
            closed_at=_parse_dt(c["closed_at"]) if c.get("closed_at") else None,
            notes=sorted(notes, key=lambda x: x.created_at),
            traces=sorted(traces, key=lambda x: x.traced_at, reverse=True),
            note_count=len(notes),
            trace_count=len(traces),
        )


case_service = CaseService()