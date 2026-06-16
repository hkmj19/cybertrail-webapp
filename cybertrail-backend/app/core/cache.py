"""
app/core/cache.py
─────────────────
Redis caching layer.

WHY CACHE?
  Blockchain APIs (Etherscan, BlockCypher) have rate limits and slow response
  times. Caching means: if investigator A traces wallet X and investigator B
  traces the same wallet an hour later, we serve from cache instead of hitting
  the external API again.

USAGE:
  from app.core.cache import cache_manager

  data = await cache_manager.get("wallet:bc1q...")
  await cache_manager.set("wallet:bc1q...", json_data, ttl=3600)
"""

import json
import redis.asyncio as aioredis
from loguru import logger
from app.core.config import settings


class CacheManager:
    """Manages Redis connection and get/set/delete operations."""

    def __init__(self):
        self._redis: aioredis.Redis | None = None

    async def connect(self):
        """Opens Redis connection pool. Called at app startup."""
        self._redis = await aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            max_connections=20,
        )
        await self._redis.ping()
        logger.info(f"Connected to Redis at {settings.REDIS_URL}")

    async def disconnect(self):
        """Closes Redis connection. Called at app shutdown."""
        if self._redis:
            await self._redis.close()
            logger.info("Redis connection closed.")

    async def get(self, key: str) -> dict | list | None:
        """
        Retrieve a cached value by key.
        Returns None if not found or expired.
        """
        if not self._redis:
            return None
        raw = await self._redis.get(key)
        if raw:
            return json.loads(raw)
        return None

    async def set(self, key: str, value: dict | list, ttl: int | None = None) -> None:
        """
        Store a value in cache with optional TTL in seconds.
        Uses settings.CACHE_TTL_SECONDS as default.
        """
        if not self._redis:
            return
        ttl = ttl or settings.CACHE_TTL_SECONDS
        await self._redis.setex(key, ttl, json.dumps(value))

    async def delete(self, key: str) -> None:
        """Remove a specific key from cache (e.g. after fresh trace)."""
        if self._redis:
            await self._redis.delete(key)

    async def invalidate_pattern(self, pattern: str) -> int:
        """
        Delete all cache keys matching a pattern.
        Example: invalidate_pattern("wallet:bc1q*") clears all wallet caches.
        Returns count of deleted keys.
        """
        if not self._redis:
            return 0
        keys = await self._redis.keys(pattern)
        if keys:
            return await self._redis.delete(*keys)
        return 0

    def make_key(self, *parts: str) -> str:
        """
        Build a consistent cache key from parts.
        Example: make_key("wallet", "btc", "bc1q...") → "wallet:btc:bc1q..."
        """
        return ":".join(parts)


# Singleton — imported everywhere
cache_manager = CacheManager()
