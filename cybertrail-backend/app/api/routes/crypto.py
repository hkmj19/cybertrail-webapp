"""
app/api/routes/crypto.py
────────────────────────
REST API endpoints for the Crypto Tracer module.

Endpoints:
  POST /api/v1/crypto/trace        — Trace a wallet address
  GET  /api/v1/crypto/wallet/{addr} — Get single wallet info
  POST /api/v1/crypto/batch        — Trace multiple wallets at once
"""

from app.services.audit_service import audit_service
from app.core.auth import get_current_user
from app.models.auth import UserInDB
from fastapi import Depends,  APIRouter, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from loguru import logger

from app.models.graph import CryptoTraceRequest, InvestigationGraph
from app.modules.crypto.tracer import CryptoTracer

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)
_tracer = CryptoTracer()


@router.post("/trace", response_model=InvestigationGraph)
@limiter.limit("30/minute")
async def trace_wallet(request: Request, body: CryptoTraceRequest, current_user: UserInDB = Depends(get_current_user)):
    """
    Traces a Bitcoin, Ethereum, or TRON wallet address.
    Returns a graph of all connected wallets and transactions.

    - **identifier**: wallet address (auto-detects BTC/ETH/TRON)
    - **depth**: how many hops to expand (1=direct, 2=two levels, max 5)
    - **chain**: override chain detection (btc/eth/tron/auto)
    - **min_value_usd**: ignore transactions below this USD threshold
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
                description=f"Trace [crypto]: {body.identifier} | depth={getattr(body,'depth',2)} | nodes={getattr(result,'total_nodes',0)} | flagged={getattr(result,'flagged_count',0)}",
            )
        except Exception:
            pass
        return result
    except Exception as e:
        logger.error(f"Crypto trace error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/wallet/{address}")
@limiter.limit("60/minute")
async def get_wallet_info(request: Request, address: str, chain: str = "auto"):
    """
    Returns metadata for a single wallet address without full graph expansion.
    Useful for quick lookups during investigation.
    """
    try:
        tracer = CryptoTracer()
        node = await tracer._fetch_wallet_info(address, chain if chain != "auto" else tracer._detect_chain(address))
        return node
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))