"""
tests/test_api.py
──────────────────
Integration tests for the FastAPI endpoints.
Uses httpx.AsyncClient with TestClient — no real Neo4j/Redis needed.
All external dependencies are mocked.
"""

import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.models.graph import InvestigationGraph, GraphNode, GraphEdge, NodeType, EdgeType, RiskLevel
import uuid


# ── Shared mock graph ────────────────────────────────────

def _mock_graph(module: str = "crypto") -> InvestigationGraph:
    """Returns a minimal InvestigationGraph for mocking tracer responses."""
    return InvestigationGraph(
        session_id=str(uuid.uuid4()),
        seed_identifier="test_seed",
        module=module,
        nodes=[
            GraphNode(id="test_seed", label="Test Seed", node_type=NodeType.WALLET_BTC, flagged=True, risk_level=RiskLevel.HIGH),
            GraphNode(id="connected_1", label="Connected 1", node_type=NodeType.WALLET_BTC, flagged=False),
        ],
        edges=[
            GraphEdge(source="test_seed", target="connected_1", edge_type=EdgeType.CRYPTO_TX, label="₹1 L", amount=100000),
        ],
    )


# ── Health check ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_health_check():
    """GET /health should return 200 with status ok."""
    with patch("app.core.database.db_manager.connect", new_callable=AsyncMock), \
         patch("app.core.cache.cache_manager.connect", new_callable=AsyncMock), \
         patch("app.core.database.db_manager.disconnect", new_callable=AsyncMock), \
         patch("app.core.cache.cache_manager.disconnect", new_callable=AsyncMock):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/health")
            assert r.status_code == 200
            assert r.json()["status"] == "ok"


# ── Crypto endpoints ─────────────────────────────────────

@pytest.mark.asyncio
async def test_crypto_trace_returns_graph():
    """POST /api/v1/crypto/trace should return an InvestigationGraph."""
    mock_graph = _mock_graph("crypto")
    with patch("app.api.routes.crypto._tracer.trace", new_callable=AsyncMock, return_value=mock_graph), \
         patch("app.core.database.db_manager.connect", new_callable=AsyncMock), \
         patch("app.core.cache.cache_manager.connect", new_callable=AsyncMock), \
         patch("app.core.database.db_manager.disconnect", new_callable=AsyncMock), \
         patch("app.core.cache.cache_manager.disconnect", new_callable=AsyncMock):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post("/api/v1/crypto/trace", json={
                "identifier": "bc1qxy2kgdygjrsqtzq2n0yrf2498gq8yh8d24",
                "depth": 2,
                "chain": "btc",
            })
            assert r.status_code == 200
            data = r.json()
            assert "nodes" in data
            assert "edges" in data
            assert data["module"] == "crypto"
            assert data["total_nodes"] == 2
            assert data["flagged_count"] == 1


@pytest.mark.asyncio
async def test_crypto_trace_validates_depth():
    """Depth > 5 should return 422 validation error."""
    with patch("app.core.database.db_manager.connect", new_callable=AsyncMock), \
         patch("app.core.cache.cache_manager.connect", new_callable=AsyncMock), \
         patch("app.core.database.db_manager.disconnect", new_callable=AsyncMock), \
         patch("app.core.cache.cache_manager.disconnect", new_callable=AsyncMock):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post("/api/v1/crypto/trace", json={
                "identifier": "bc1qtest",
                "depth": 10,  # exceeds max of 5
            })
            assert r.status_code == 422


# ── UPI endpoints ────────────────────────────────────────

@pytest.mark.asyncio
async def test_upi_trace_returns_graph():
    """POST /api/v1/upi/trace should return an InvestigationGraph."""
    mock_graph = _mock_graph("upi")
    with patch("app.api.routes.upi._tracer.trace", new_callable=AsyncMock, return_value=mock_graph), \
         patch("app.core.database.db_manager.connect", new_callable=AsyncMock), \
         patch("app.core.cache.cache_manager.connect", new_callable=AsyncMock), \
         patch("app.core.database.db_manager.disconnect", new_callable=AsyncMock), \
         patch("app.core.cache.cache_manager.disconnect", new_callable=AsyncMock):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post("/api/v1/upi/trace", json={
                "identifier": "fraud@paytm",
                "depth": 2,
            })
            assert r.status_code == 200
            assert r.json()["module"] == "upi"


@pytest.mark.asyncio
async def test_upi_csv_rejects_non_csv():
    """CSV ingest should reject non-CSV files with 400."""
    with patch("app.core.database.db_manager.connect", new_callable=AsyncMock), \
         patch("app.core.cache.cache_manager.connect", new_callable=AsyncMock), \
         patch("app.core.database.db_manager.disconnect", new_callable=AsyncMock), \
         patch("app.core.cache.cache_manager.disconnect", new_callable=AsyncMock):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.post(
                "/api/v1/upi/ingest-csv",
                files={"file": ("data.txt", b"not a csv", "text/plain")},
            )
            assert r.status_code == 400


# ── Graph search endpoint ────────────────────────────────

@pytest.mark.asyncio
async def test_graph_search_requires_query():
    """GET /api/v1/graph/search without ?q= should return 422."""
    with patch("app.core.database.db_manager.connect", new_callable=AsyncMock), \
         patch("app.core.cache.cache_manager.connect", new_callable=AsyncMock), \
         patch("app.core.database.db_manager.disconnect", new_callable=AsyncMock), \
         patch("app.core.cache.cache_manager.disconnect", new_callable=AsyncMock):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get("/api/v1/graph/search")
            assert r.status_code == 422
