# app/core/__init__.py — exports core infrastructure singletons
from app.core.config import settings
from app.core.database import db_manager
from app.core.cache import cache_manager
__all__ = ["settings", "db_manager", "cache_manager"]
