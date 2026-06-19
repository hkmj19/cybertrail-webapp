"""
app/api/routes/multi.py - Multi-layer Graph endpoints
"""
from app.services.audit_service import audit_service
from app.core.auth import get_current_user
from app.models.auth import UserInDB
from fastapi import Depends, APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address
from loguru import logger
from app.models.graph import InvestigationGraph
from app.modules.multi.combiner import MultiLayerCombiner
from app.services.risk_service import risk_service

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)
_combiner = MultiLayerCombiner()


class MultiTraceRequest(BaseModel):
    identifier: str = Field(..., description="Any identifier - auto-detected per module")
    depth: int = Field(default=2, ge=1, le=5)
    force_refresh: bool = False
    modules: list[str] = Field(
        default=["crypto", "upi", "shell", "social"],
        description="Which modules to run. Subset allowed."
    )


@router.post("/trace", response_model=InvestigationGraph)
@limiter.limit("10/minute")
async def multi_trace(request: Request, body: MultiTraceRequest, current_user: UserInDB = Depends(get_current_user)):
    """Runs all selected modules on one identifier and merges results."""
    try:
        result = await _combiner.combine(
            identifier=body.identifier,
            depth=body.depth,
            force_refresh=body.force_refresh,
            modules=body.modules,
        )
        scores = await risk_service.bulk_score_graph(result.nodes)
        for node in result.nodes:
            if node.id in scores:
                node.risk_level = scores[node.id]

        # ── Audit: log trace run ──────────────────────
        try:
            await audit_service.log(
                action="trace", entity_type="investigation",
                entity_id=body.identifier,
                officer_username=current_user.username,
                officer_badge=current_user.badge_id,
                officer_role=current_user.role.value,
                ip_address=request.client.host if request.client else "unknown",
                description=f"Trace [multi]: {body.identifier} | modules={body.modules} | depth={body.depth} | nodes={getattr(result,'total_nodes',0)} | flagged={getattr(result,'flagged_count',0)}",
            )
        except Exception:
            pass  # never block trace on audit failure

        return result

    except Exception as e:
        logger.error(f"Multi-layer trace error: {e}")
        raise HTTPException(status_code=500, detail=str(e))