"""
cybertrail/app/main.py
─────────────────────
FastAPI application entry point.
- Registers all route modules
- Connects to Neo4j and Redis on startup
- Adds CORS, rate limiting, and error handlers
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from loguru import logger

from app.core.config import settings
from app.core.database import db_manager
from app.core.cache import cache_manager
from app.services.auth_service import auth_service
from app.api.routes import crypto, upi, shell, social, multi, graph, blacklist, complaints, auth, cases, audit, backup

# ── Rate limiter (100 requests/minute per IP) ────────────
limiter = Limiter(key_func=get_remote_address, default_limits=["100/minute"])

# ── Lifespan (replaces deprecated @app.on_event) ────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting CyberTrail API...")
    await db_manager.connect()
    await cache_manager.connect()
    await auth_service.ensure_admin_exists()   # create default admin if none exists
    logger.info("CyberTrail ready.")
    yield
    # Shutdown
    await db_manager.disconnect()
    await cache_manager.disconnect()
    logger.info("CyberTrail shut down.")

# ── FastAPI app instance ─────────────────────────────────
app = FastAPI(
    title="CyberTrail - Financial Crime Investigation API",
    description="Graph intelligence platform for tracing financial crime networks.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── CORS (allow React frontend) ──────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Register all route modules ───────────────────────────
app.include_router(crypto.router,     prefix="/api/v1/crypto",     tags=["Crypto Tracer"])
app.include_router(upi.router,        prefix="/api/v1/upi",        tags=["UPI / Bank Fraud"])
app.include_router(shell.router,      prefix="/api/v1/shell",      tags=["Shell Company"])
app.include_router(social.router,     prefix="/api/v1/social",     tags=["Social Graph"])
app.include_router(multi.router,      prefix="/api/v1/multi",      tags=["Multi-layer Graph"])
app.include_router(graph.router,      prefix="/api/v1/graph",      tags=["Graph Management"])
app.include_router(blacklist.router,  prefix="/api/v1/blacklist",  tags=["Blacklist / Watchlist"])
app.include_router(complaints.router, prefix="/api/v1/complaints", tags=["Complaint Management"])
app.include_router(auth.router,       prefix="/api/v1/auth",       tags=["Authentication"])
app.include_router(cases.router,      prefix="/api/v1/cases",      tags=["Case Management"])
app.include_router(audit.router,      prefix="/api/v1/audit",      tags=["Audit Trail"])
app.include_router(backup.router,     prefix="/api/v1/backup",     tags=["Backup & Recovery"])

# ── System endpoints ─────────────────────────────────────

@app.get("/health", tags=["System"])
async def health_check():
    """Liveness probe - returns 200 if the API is running."""
    return {"status": "ok", "version": "1.0.0"}


@app.get("/api/v1/status", tags=["System"])
async def system_status():
    """
    Full system status - checks Neo4j and Redis connectivity.
    Called every 30 seconds by the UI sidebar to show online/offline.
    """
    neo4j_ok = False
    redis_ok  = False

    try:
        async with db_manager.session() as s:
            await s.run("RETURN 1")
        neo4j_ok = True
    except Exception:
        pass

    try:
        await cache_manager._redis.ping()
        redis_ok = True
    except Exception:
        pass

    return {
        "api":     "ok",
        "neo4j":   "ok" if neo4j_ok else "unreachable",
        "redis":   "ok" if redis_ok  else "unreachable",
        "version": "1.0.0",
        "modules": ["crypto", "upi", "shell", "social", "multi"],
    }