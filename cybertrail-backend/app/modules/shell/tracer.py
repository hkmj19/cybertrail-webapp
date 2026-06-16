"""
app/modules/shell/tracer.py
───────────────────────────
Shell Company Graph Module
═══════════════════════════
Traces beneficial ownership and director networks using MCA21 India public data.

FLOW:
  1. Accept a seed: CIN (company ID), company name, or director DIN
  2. Fetch company details from MCA21 public registry
  3. Extract all directors → trace their other directorships
  4. Trace subsidiary/parent relationships
  5. Calculate beneficial ownership chains
  6. Flag companies with shell indicators (no revenue, many directors, recent incorporation)

MCA21 DATA (public):
  - Company master data (CIN, name, state, status, incorporation date)
  - Director information (DIN, name, date of appointment/cessation)
  - Charge/mortgage information
  - Annual return filing status

SHELL INDICATORS:
  - No annual return filed for 2+ years
  - Paid-up capital < ₹1 lakh with 5+ directors
  - Incorporated within 6 months of becoming director elsewhere
  - Registered address matches 10+ other companies (address reuse)
  - Struck-off status but still transacting
"""

import uuid
import httpx
import re
from datetime import datetime, date
from loguru import logger

from app.core.config import settings
from app.core.cache import cache_manager
from app.core.database import db_manager
from app.models.graph import (
    GraphNode, GraphEdge, InvestigationGraph,
    NodeType, EdgeType, RiskLevel, ShellTraceRequest
)


class ShellTracer:
    """
    Traces shell company networks and beneficial ownership chains.

    Usage:
        tracer = ShellTracer()
        graph = await tracer.trace(request)
    """

    def __init__(self):
        self.http = httpx.AsyncClient(timeout=20.0)

    # ── Public entry point ───────────────────────────────

    async def trace(self, request: ShellTraceRequest) -> InvestigationGraph:
        """
        Main trace. Accepts a CIN, company name, or director DIN.
        Builds a beneficial ownership graph.
        """
        identifier = request.identifier
        id_type = request.identifier_type
        if id_type == "auto":
            id_type = self._detect_type(identifier)

        logger.info(f"Shell trace: {identifier} (type={id_type}), depth={request.depth}")

        nodes: dict[str, GraphNode] = {}
        edges: list[GraphEdge] = []

        if id_type == "cin":
            await self._expand_from_company(identifier, request.depth, nodes, edges, set())
        elif id_type == "director_din":
            await self._expand_from_director(identifier, request.depth, nodes, edges, set())
        elif id_type == "company_name":
            cin = await self._search_company_by_name(identifier)
            if cin:
                await self._expand_from_company(cin, request.depth, nodes, edges, set())

        if not nodes:
            nodes[identifier] = self._make_company_node(identifier, {})

        return InvestigationGraph(
            session_id=str(uuid.uuid4()),
            seed_identifier=identifier,
            module="shell",
            nodes=list(nodes.values()),
            edges=edges,
            hops_explored=request.depth,
        )

    # ── Company expansion ────────────────────────────────

    async def _expand_from_company(
        self, cin: str, depth: int,
        nodes: dict, edges: list, visited: set
    ):
        """
        Fetches company data from MCA21, adds it as a node,
        then recursively expands to its directors and subsidiaries.
        """
        if cin in visited or depth <= 0:
            return
        visited.add(cin)

        data = await self._fetch_company(cin)
        company_node = self._make_company_node(cin, data)
        nodes[cin] = company_node

        # Expand directors
        for director in data.get("directors", []):
            din  = director.get("din", "")
            name = director.get("name", "Unknown")
            if not din:
                continue

            person_node = GraphNode(
                id=din,
                label=name,
                node_type=NodeType.PERSON,
                flagged=False,
                metadata={"din": din, "date_of_appointment": director.get("doa", "")},
            )
            nodes[din] = person_node

            edges.append(GraphEdge(
                source=din,
                target=cin,
                edge_type=EdgeType.DIRECTOR_OF,
                label=f"Director since {director.get('doa', '?')}",
                metadata={"cessation_date": director.get("doc", "")},
            ))

            # Trace this director's other companies (key for shell detection)
            await self._expand_from_director(din, depth - 1, nodes, edges, visited)

        # Expand subsidiaries/parent companies
        for sub in data.get("subsidiaries", []):
            sub_cin = sub.get("cin", "")
            if sub_cin and sub_cin not in visited:
                nodes_before = len(nodes)
                await self._expand_from_company(sub_cin, depth - 1, nodes, edges, visited)
                if sub_cin in nodes:
                    edges.append(GraphEdge(
                        source=cin,
                        target=sub_cin,
                        edge_type=EdgeType.SUBSIDIARY,
                        label=f"{sub.get('ownership_pct', '?')}% owned",
                        metadata={"ownership_pct": sub.get("ownership_pct")},
                    ))

    async def _expand_from_director(
        self, din: str, depth: int,
        nodes: dict, edges: list, visited: set
    ):
        """
        Given a director DIN, finds all companies where this person is a director.
        This reveals shared-director shells - a key red flag.
        """
        if f"dir_{din}" in visited or depth <= 0:
            return
        visited.add(f"dir_{din}")

        companies = await self._fetch_director_companies(din)
        for company in companies:
            cin = company.get("cin", "")
            if not cin or cin in visited:
                continue
            await self._expand_from_company(cin, depth - 1, nodes, edges, visited)
            if cin in nodes and din in nodes:
                # Edge already added in _expand_from_company; skip duplicate
                pass

    # ── MCA21 API calls ──────────────────────────────────

    async def _fetch_company(self, cin: str) -> dict:
        """
        Fetches company data. Priority:
          1. Neo4j (imported via CSV or manual entry)
          2. MCA21 API (if configured)
          3. Mock data (fallback for demo)
        """
        # ── 1. Query Neo4j first ──────────────────────────
        try:
            from app.core.database import db_manager
            async with db_manager.session() as s:
                r = await s.run("""
                    MATCH (c:Company {cin: $cin})
                    OPTIONAL MATCH (d:Director)-[r:DIRECTS]->(c)
                    OPTIONAL MATCH (d)-[:DIRECTS]->(other:Company)
                    WITH c, d, r, count(DISTINCT other) AS company_count
                    RETURN c.name AS name, c.status AS status, c.flagged AS flagged,
                           collect({din: d.din, name: d.name, designation: r.designation,
                                    doa: r.doa, company_count: company_count}) AS directors
                """, cin=cin)
                rec = await r.single()
                if rec and rec["name"]:
                    directors = [
                        {"din": d["din"], "name": d["name"] or d["din"],
                         "designation": d["designation"] or "Director", "doa": d["doa"] or "",
                         "company_count": d["company_count"] or 1}
                        for d in (rec["directors"] or []) if d.get("din")
                    ]
                    max_shared = max((d.get("company_count", 1) for d in directors), default=1)
                    status = rec["status"] or "Active"
                    return {
                        "cin": cin,
                        "name": rec["name"],
                        "status": status,
                        "flagged": rec["flagged"] or False,
                        "directors": directors,
                        "subsidiaries": [],
                        "shared_director_count": max_shared,
                        "source": "neo4j",
                    }
        except Exception as e:
            logger.warning(f"Neo4j company lookup failed for {cin}: {e}")

        # ── 2. Try MCA21 API ──────────────────────────────
        cache_key = cache_manager.make_key("mca_company", cin)
        cached = await cache_manager.get(cache_key)
        if cached:
            return cached
        try:
            r = await self.http.get(
                f"{settings.MCA_BASE_URL}/viewCompanyMasterData.do",
                params={"companyID": cin},
                headers={"User-Agent": "CyberTrail/1.0 (law enforcement research)"},
            )
            if r.status_code == 200:
                data = self._parse_mca_company_html(r.text, cin)
            else:
                data = self._mock_company_data(cin)
        except Exception as e:
            logger.warning(f"MCA21 fetch failed for {cin}: {e}")
            data = self._mock_company_data(cin)

        await cache_manager.set(cache_key, data, ttl=86400)
        return data

    async def _fetch_director_companies(self, din: str) -> list[dict]:
        """
        Finds all companies for a director DIN. Priority:
          1. Neo4j (imported data)
          2. MCA21 API
        """
        # ── 1. Query Neo4j first ──────────────────────────
        try:
            from app.core.database import db_manager
            async with db_manager.session() as s:
                r = await s.run("""
                    MATCH (d:Director {din: $din})-[r:DIRECTS]->(c:Company)
                    RETURN c.cin AS cin, c.name AS company_name,
                           r.designation AS designation, r.doa AS doa,
                           c.status AS status
                """, din=din)
                rows = []
                async for rec in r:
                    rows.append({
                        "cin": rec["cin"],
                        "company_name": rec["company_name"] or rec["cin"],
                        "designation": rec["designation"] or "Director",
                        "doa": rec["doa"] or "",
                        "status": rec["status"] or "Active",
                    })
                if rows:
                    return rows
        except Exception as e:
            logger.warning(f"Neo4j director lookup failed for {din}: {e}")

        # ── 2. Try MCA21 API ──────────────────────────────
        cache_key = cache_manager.make_key("mca_director", din)
        cached = await cache_manager.get(cache_key)
        if cached:
            return cached
        try:
            r = await self.http.get(
                f"{settings.MCA_BASE_URL}/viewSignatoryData.do",
                params={"din": din},
            )
            data = self._parse_mca_director_html(r.text) if r.status_code == 200 else []
        except Exception as e:
            logger.warning(f"MCA21 director fetch failed for DIN {din}: {e}")
            data = []
        await cache_manager.set(cache_key, data, ttl=86400)
        return data

    async def _search_company_by_name(self, name: str) -> str | None:
        """
        Searches for a company by name. Checks Neo4j first, then MCA21.
        """
        # ── 1. Neo4j first ────────────────────────────────
        try:
            from app.core.database import db_manager
            async with db_manager.session() as s:
                r = await s.run("""
                    MATCH (c:Company)
                    WHERE toLower(c.name) CONTAINS toLower($name)
                    RETURN c.cin AS cin LIMIT 1
                """, name=name)
                rec = await r.single()
                if rec and rec["cin"]:
                    return rec["cin"]
        except Exception as e:
            logger.warning(f"Neo4j name search failed: {e}")

        # ── 2. MCA21 API ──────────────────────────────────
        cache_key = cache_manager.make_key("mca_search", name.lower())
        cached = await cache_manager.get(cache_key)
        if cached:
            return cached.get("cin")
        try:
            r = await self.http.get(
                f"{settings.MCA_BASE_URL}/mds/searchllp",
                params={"companyName": name, "searchType": "Company"},
            )
            if r.status_code == 200:
                companies = r.json()
                if companies:
                    cin = companies[0].get("CIN", "")
                    await cache_manager.set(cache_key, {"cin": cin})
                    return cin
        except Exception as e:
            logger.warning(f"MCA21 name search failed for '{name}': {e}")
        return None

    # ── Shell scoring ────────────────────────────────────

    def _score_shell_risk(self, data: dict) -> RiskLevel:
        """
        Assigns a shell company risk level.
        Checks for: struck-off status, no filings, high director count,
        recent incorporation, low capital with many directors.
        """
        score = 0
        status = (data.get("status") or "").lower()
        # All variants of struck-off / dissolved
        if any(x in status for x in ("struck", "strike", "dissolved", "liquidat", "inactive")):
            score += 4   # immediate HIGH
        if not data.get("last_annual_return"):
            score += 2
        director_count = len(data.get("directors", []))
        if director_count >= 5:
            score += 1
        if director_count == 0:
            score += 2
        # Director appears in many companies - shell indicator
        if data.get("shared_director_count", 0) >= 3:
            score += 2
        paid_up = data.get("paid_up_capital_inr", 0)
        if paid_up and paid_up < 100000 and director_count >= 3:
            score += 2
        inc_date = data.get("incorporation_date", "")
        if inc_date:
            try:
                inc = datetime.strptime(inc_date, "%d/%m/%Y").date()
                if (date.today() - inc).days < 365:
                    score += 1
            except Exception:
                pass

        if score >= 4:
            return RiskLevel.HIGH
        if score >= 3:
            return RiskLevel.MEDIUM
        if score >= 1:
            return RiskLevel.LOW
        return RiskLevel.CLEAN

    # ── Helpers ──────────────────────────────────────────

    def _make_company_node(self, cin: str, data: dict) -> GraphNode:
        """Creates a GraphNode for a company from MCA21/Neo4j data."""
        risk = self._score_shell_risk(data)
        name = data.get("name", cin) or cin   # never truncate - full name
        return GraphNode(
            id=cin,
            label=name,
            node_type=NodeType.COMPANY,
            flagged=risk in (RiskLevel.HIGH, RiskLevel.MEDIUM),
            risk_level=risk,
            metadata={
                "cin": cin,
                "state": data.get("state", ""),
                "status": data.get("status", ""),
                "incorporation_date": data.get("incorporation_date", ""),
                "paid_up_capital": data.get("paid_up_capital_inr", 0),
                "director_count": len(data.get("directors", [])),
            },
        )

    def _detect_type(self, identifier: str) -> str:
        """Auto-detects CIN / DIN / company name from format."""
        # CIN format: L/U + 5 digits + 2 letters + 4 digits + 3 letters + 6 digits
        if re.match(r'^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$', identifier):
            return "cin"
        # DIN is 8 digits
        if re.match(r'^\d{8}$', identifier):
            return "director_din"
        return "company_name"

    def _parse_mca_company_html(self, html: str, cin: str) -> dict:
        """
        Parses MCA21 HTML response to extract company master data.
        In production: use BeautifulSoup or lxml for robust parsing.
        """
        # Placeholder - actual parsing depends on MCA21 HTML structure
        return self._mock_company_data(cin)

    def _parse_mca_director_html(self, html: str) -> list[dict]:
        """Parses MCA21 director HTML response."""
        return []

    def _mock_company_data(self, cin: str) -> dict:
        """
        Returns sample data for demo/testing when MCA21 is unavailable.
        Replace with real MCA21 parsing in production.
        """
        return {
            "name": f"Company {cin[-6:]} Pvt Ltd",
            "cin": cin,
            "state": "Maharashtra",
            "status": "Active",
            "incorporation_date": "01/04/2019",
            "paid_up_capital_inr": 100000,
            "last_annual_return": "2022-03-31",
            "directors": [
                {"din": "00000001", "name": "Director A", "doa": "01/04/2019"},
                {"din": "00000002", "name": "Director B", "doa": "01/04/2019"},
            ],
            "subsidiaries": [],
        }

