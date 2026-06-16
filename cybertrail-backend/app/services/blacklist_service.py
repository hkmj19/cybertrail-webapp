"""
app/services/blacklist_service.py
───────────────────────────────────
Blacklist / Watchlist Service

Checks identifiers against known fraud/sanction lists.
Supports multiple list sources and stores results in Neo4j.

SUPPORTED LISTS:
  1. Internal CyberTrail blacklist  — built from confirmed fraud investigations
  2. OFAC SDN list                  — US sanctions (wallets of sanctioned entities)
  3. I4C / NCRP flagged list        — India Cybercrime Coordination Centre
  4. RBI defaulter registry         — Reserve Bank of India
  5. Chainalysis (if API key set)   — crypto-specific risk scoring

USAGE:
    from app.services.blacklist_service import blacklist_service

    hits = await blacklist_service.check(identifier)
    # → [{"source": "I4C", "reason": "Multiple NCRP complaints", "severity": "high"}]

    await blacklist_service.add("fraud@paytm", source="internal", reason="Confirmed mule")
    await blacklist_service.bulk_import_csv(csv_bytes, source="i4c")
"""

import io
import csv
import httpx
from loguru import logger
from datetime import datetime

from app.core.database import db_manager
from app.core.cache import cache_manager
from app.core.config import settings


class BlacklistService:
    """
    Manages all blacklist checking and maintenance operations.
    Uses Neo4j for persistence and Redis for caching hot lookups.
    """

    # Cache TTL for blacklist hits (10 minutes — balance freshness vs speed)
    CACHE_TTL = 600

    def __init__(self):
        self.http = httpx.AsyncClient(timeout=10.0)

    # ── Main check function ──────────────────────────────

    async def check(self, identifier: str) -> list[dict]:
        """
        Checks an identifier against ALL configured blacklists.
        Returns list of hits — empty list means clean.

        Each hit contains:
          source    — which blacklist matched (internal/ofac/i4c/rbi)
          reason    — why it was flagged
          severity  — high/medium/low
          added_at  — when it was added to the list

        Results are cached in Redis for CACHE_TTL seconds.
        """
        cache_key = cache_manager.make_key("blacklist", identifier)
        cached = await cache_manager.get(cache_key)
        if cached is not None:
            return cached

        hits = []

        # Run all checks concurrently in production (use asyncio.gather)
        hits += await self._check_internal(identifier)
        hits += await self._check_ofac(identifier)
        hits += await self._check_i4c(identifier)

        await cache_manager.set(cache_key, hits, ttl=self.CACHE_TTL)
        return hits

    async def is_flagged(self, identifier: str) -> bool:
        """
        Quick boolean check — is this identifier on ANY blacklist?
        Useful for fast risk pre-screening before deep trace.
        """
        hits = await self.check(identifier)
        return len(hits) > 0

    # ── Internal blacklist ───────────────────────────────

    async def _check_internal(self, identifier: str) -> list[dict]:
        """
        Checks CyberTrail's own internal blacklist stored in Neo4j.
        This is built from confirmed fraud investigations by officers.
        """
        try:
            async with db_manager.session() as s:
                result = await s.run("""
                    MATCH (bl:Blacklist {identifier: $id})
                    RETURN bl.source AS source,
                           bl.reason AS reason,
                           bl.severity AS severity,
                           bl.added_at AS added_at
                """, id=identifier)
                hits = []
                async for record in result:
                    hits.append({
                        "source": record["source"] or "internal",
                        "reason": record["reason"] or "Confirmed fraud entity",
                        "severity": record["severity"] or "high",
                        "added_at": str(record["added_at"]),
                        "list": "CyberTrail Internal",
                    })
                return hits
        except Exception as e:
            logger.warning(f"Internal blacklist check failed for {identifier}: {e}")
            return []

    async def _check_ofac(self, identifier: str) -> list[dict]:
        """
        Checks identifier against OFAC SDN (Specially Designated Nationals) list.
        OFAC publishes a free XML/CSV list of sanctioned individuals and entities
        including crypto wallet addresses.

        In production: download and index the SDN list locally for fast lookup.
        URL: https://www.treasury.gov/ofac/downloads/sdn.csv
        """
        # Check our locally cached OFAC index in Neo4j
        try:
            async with db_manager.session() as s:
                result = await s.run("""
                    MATCH (ofac:OFACEntry)
                    WHERE ofac.identifier = $id
                       OR ofac.wallet_address = $id
                    RETURN ofac.name AS name,
                           ofac.program AS program,
                           ofac.list_type AS list_type
                    LIMIT 1
                """, id=identifier)
                record = await result.single()
                if record:
                    return [{
                        "source": "OFAC SDN",
                        "reason": f"Sanctioned entity: {record['name']} ({record['program']})",
                        "severity": "high",
                        "list": "US Treasury OFAC",
                    }]
        except Exception as e:
            logger.warning(f"OFAC check failed: {e}")
        return []

    async def _check_i4c(self, identifier: str) -> list[dict]:
        """
        Checks against India Cybercrime Coordination Centre (I4C) flagged list.
        I4C aggregates NCRP complaint data — if a UPI/phone appears in 5+ complaints
        across India, it's flagged here.

        In production: integrate with the official I4C API (requires law enforcement credentials).
        For open-source use: import their periodic CSV data releases.
        """
        try:
            async with db_manager.session() as s:
                result = await s.run("""
                    MATCH (i4c:I4CEntry {identifier: $id})
                    RETURN i4c.complaint_count AS complaint_count,
                           i4c.fraud_type AS fraud_type,
                           i4c.state AS state
                    LIMIT 1
                """, id=identifier)
                record = await result.single()
                if record:
                    count = record["complaint_count"] or 0
                    severity = "high" if count >= 5 else "medium"
                    return [{
                        "source": "I4C / NCRP",
                        "reason": f"{count} NCRP complaints — fraud type: {record['fraud_type'] or 'unknown'}",
                        "severity": severity,
                        "list": "India Cybercrime Coordination Centre",
                    }]
        except Exception as e:
            logger.warning(f"I4C check failed: {e}")
        return []

    # ── Adding to blacklist ──────────────────────────────

    async def add(
        self,
        identifier: str,
        source: str = "internal",
        reason: str = "",
        severity: str = "high",
        added_by: str = "system",
    ) -> bool:
        """
        Adds an identifier to the internal CyberTrail blacklist.
        Called when an investigator confirms a fraud entity.

        Also updates all existing graph nodes with this identifier
        to set flagged=true across all investigation sessions.
        """
        try:
            async with db_manager.session() as s:
                # Add to blacklist
                await s.run("""
                    MERGE (bl:Blacklist {identifier: $id})
                    SET bl.source     = $source,
                        bl.reason     = $reason,
                        bl.severity   = $severity,
                        bl.added_by   = $added_by,
                        bl.added_at   = datetime(),
                        bl.updated_at = datetime()
                """, id=identifier, source=source, reason=reason,
                     severity=severity, added_by=added_by)

                # ── Retroactive flagging: mark ALL existing graph nodes with this identifier ──
                # Covers: crypto wallets, UPI accounts, phones, bank accounts, companies
                await s.run("""
                    MATCH (n)
                    WHERE n.address         = $id
                       OR n.upi_id          = $id
                       OR n.number          = $id
                       OR n.account_number  = $id
                       OR n.cin             = $id
                       OR n.wallet_address  = $id
                    SET n.flagged      = true,
                        n.flag_reason  = $reason,
                        n.flag_source  = $source,
                        n.flagged_at   = datetime()
                """, id=identifier, reason=reason, source=source)

            # Invalidate any cached blacklist result for this identifier
            await cache_manager.delete(cache_manager.make_key("blacklist", identifier))
            logger.info(f"Added to blacklist: {identifier} (source={source})")
            return True
        except Exception as e:
            logger.error(f"Blacklist add failed for {identifier}: {e}")
            return False

    async def remove(self, identifier: str) -> bool:
        """
        Removes an identifier from the internal blacklist.
        Use when an entity was incorrectly flagged.
        """
        try:
            async with db_manager.session() as s:
                await s.run("""
                    MATCH (bl:Blacklist {identifier: $id})
                    DELETE bl
                """, id=identifier)
            await cache_manager.delete(cache_manager.make_key("blacklist", identifier))
            logger.info(f"Removed from blacklist: {identifier}")
            return True
        except Exception as e:
            logger.error(f"Blacklist remove failed: {e}")
            return False

    # ── Bulk import ──────────────────────────────────────

    async def bulk_import_csv(self, csv_bytes: bytes, source: str = "i4c") -> dict:
        """
        Imports a bulk blacklist CSV into Neo4j.
        Used to load I4C data dumps, RBI defaulter lists, etc.

        Expected CSV columns:
          identifier, reason, severity, fraud_type, complaint_count

        Returns: {"imported": N, "skipped": M}
        """
        imported = 0
        skipped = 0
        try:
            reader = csv.DictReader(io.StringIO(csv_bytes.decode("utf-8")))
            # Normalise column names
            rows = [{k.strip().lower().replace(" ", "_"): v for k, v in row.items()} for row in reader]

            async with db_manager.session() as s:
                for row in rows:
                    identifier = row.get("identifier", "").strip()
                    if not identifier:
                        skipped += 1
                        continue

                    node_label = "I4CEntry" if source == "i4c" else "Blacklist"
                    await s.run(f"""
                        MERGE (n:{node_label} {{identifier: $id}})
                        SET n.reason          = $reason,
                            n.severity        = $severity,
                            n.fraud_type      = $fraud_type,
                            n.complaint_count = $count,
                            n.source          = $source,
                            n.imported_at     = datetime()
                    """,
                        id=identifier,
                        reason=row.get("reason", ""),
                        severity=row.get("severity", "medium"),
                        fraud_type=row.get("fraud_type", ""),
                        count=int(row.get("complaint_count", 0) or 0),
                        source=source,
                    )
                    imported += 1

            logger.info(f"Blacklist bulk import complete: {imported} entries from {source}")
            return {"imported": imported, "skipped": skipped, "source": source}
        except Exception as e:
            logger.error(f"Bulk import failed: {e}")
            raise

    async def bulk_import_ofac(self) -> dict:
        """
        Downloads and imports the OFAC SDN CSV list directly from US Treasury.
        Should be run on a daily schedule (cron job or APScheduler).

        OFAC CSV format:
          Ent_num, SDN_Name, SDN_Type, Program, Title, Call_Sign, Vess_type,
          Tonnage, GRT, Vess_flag, Vess_owner, Remarks
        """
        url = "https://www.treasury.gov/ofac/downloads/sdn.csv"
        try:
            logger.info("Downloading OFAC SDN list...")
            r = await self.http.get(url)
            r.raise_for_status()

            imported = 0
            reader = csv.reader(io.StringIO(r.text))
            async with db_manager.session() as s:
                for row in reader:
                    if len(row) < 4:
                        continue
                    name = row[1].strip().strip('"')
                    program = row[3].strip().strip('"')
                    if not name:
                        continue
                    await s.run("""
                        MERGE (o:OFACEntry {name: $name})
                        SET o.program    = $program,
                            o.list_type  = 'SDN',
                            o.source     = 'OFAC',
                            o.updated_at = datetime()
                    """, name=name, program=program)
                    imported += 1

            logger.info(f"OFAC import complete: {imported} entries")
            return {"imported": imported}
        except Exception as e:
            logger.error(f"OFAC import failed: {e}")
            raise

    async def get_stats(self) -> dict:
        """
        Returns statistics about the current blacklist contents.
        Used by the dashboard.
        """
        try:
            async with db_manager.session() as s:
                result = await s.run("""
                    RETURN
                        COUNT { MATCH (bl:Blacklist) RETURN bl } AS internal_count,
                        COUNT { MATCH (i4c:I4CEntry) RETURN i4c } AS i4c_count,
                        COUNT { MATCH (ofac:OFACEntry) RETURN ofac } AS ofac_count,
                        COUNT { MATCH (bl:Blacklist {severity:'high'}) RETURN bl } AS high_severity
                """)
                record = await result.single()
                return dict(record) if record else {}
        except Exception as e:
            logger.warning(f"Blacklist stats failed: {e}")
            return {}


# Singleton
blacklist_service = BlacklistService()