"""
app/core/config.py
──────────────────
Centralised settings loaded from .env via Pydantic.
Access anywhere with: from app.core.config import settings
"""

import secrets
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    BACKUP_ENCRYPTION_PASSWORD: str = "CyberTrail@Backup#2026"
    # Server
    APP_ENV: str = "development"
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000

    # JWT — MUST be set in .env in production
    # Generate a strong key with: openssl rand -hex 32
    JWT_SECRET_KEY: str = secrets.token_hex(32)   # random fallback for dev only
    JWT_ACCESS_EXPIRE_MINUTES:  int = 60           # 1 hour
    JWT_REFRESH_EXPIRE_MINUTES: int = 60 * 24      # 24 hours

    # Neo4j
    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "cybertrail123"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    CACHE_TTL_SECONDS: int = 3600

    # External APIs
    ETHERSCAN_API_KEY: str = ""
    BLOCKCYPHER_API_KEY: str = ""
    TRONGRID_API_KEY: str = ""
    MCA_BASE_URL: str = "https://www.mca.gov.in/mcafoportal"

    # Graph traversal limits
    MAX_HOP_DEPTH: int = 5
    MAX_NODES_PER_TRACE: int = 200

    model_config = {"env_file": ".env", "case_sensitive": True}


@lru_cache()
def get_settings() -> Settings:
    """Returns a cached singleton of the settings object."""
    return Settings()


settings = get_settings()