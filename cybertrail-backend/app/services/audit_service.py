"""
app/services/audit_service.py
──────────────────────────────
Immutable audit logging service.
Call audit_service.log() from any route that modifies data.

Design:
- AuditLog nodes in Neo4j — append only, never deleted
- Stores: who, what, when, where (IP), before/after values
- Even admin cannot delete audit logs (no delete endpoint exists)
"""
import uuid
import json
from datetime import datetime, timezone
from typing import Optional
from loguru import logger as log
from app.core.database import db_manager


class AuditService:

    async def log(
        self,
        action:         str,           # create / update / delete / login / flag
        entity_type:    str,           # complaint / case / user / blacklist / trace
        entity_id:      str,           # the ID of the thing that changed
        officer_username: str,
        officer_badge:  str,
        officer_role:   str,
        ip_address:     str = "unknown",
        description:    str = "",
        before:         Optional[dict] = None,   # what it looked like before
        after:          Optional[dict] = None,   # what it looks like after
    ):
        """
        Write an immutable audit entry to Neo4j.
        This is fire-and-forget — errors are logged but never raised.
        """
        try:
            audit_id  = str(uuid.uuid4())
            timestamp = datetime.now(timezone.utc).isoformat()

            # Build a human-readable diff of what changed
            changes = {}
            if before and after:
                for k in set(list(before.keys()) + list(after.keys())):
                    old_v = before.get(k)
                    new_v = after.get(k)
                    if old_v != new_v:
                        changes[k] = {"from": old_v, "to": new_v}
            elif after:
                changes = {"created": after}
            elif before:
                changes = {"deleted": before}

            async with db_manager.session() as s:
                await s.run("""
                    CREATE (a:AuditLog {
                        id:               $id,
                        timestamp:        $timestamp,
                        action:           $action,
                        entity_type:      $entity_type,
                        entity_id:        $entity_id,
                        officer_username: $username,
                        officer_badge:    $badge,
                        officer_role:     $role,
                        ip_address:       $ip,
                        description:      $description,
                        changes:          $changes
                    })
                """,
                id=audit_id, timestamp=timestamp,
                action=action, entity_type=entity_type, entity_id=entity_id,
                username=officer_username, badge=officer_badge, role=officer_role,
                ip=ip_address, description=description,
                changes=json.dumps(changes))

            log.info(f"AUDIT: {officer_username} ({officer_badge}) {action} {entity_type} {entity_id}")

        except Exception as e:
            # Never fail the main request because of audit logging
            log.error(f"Audit log failed: {e}")


audit_service = AuditService()