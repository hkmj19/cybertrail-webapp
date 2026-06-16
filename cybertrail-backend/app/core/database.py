"""
app/core/database.py
────────────────────
Neo4j connection manager.

WHY NEO4J?
  Financial crime graphs are deeply relational - tracing "who sent money to
  whom through which intermediaries" is a graph problem. Neo4j lets us run
  native graph queries (shortest path, cycle detection, community detection)
  that would be painfully slow in SQL.

USAGE:
  from app.core.database import db_manager

  async with db_manager.session() as session:
      result = await session.run("MATCH (n) RETURN count(n)")
"""

from neo4j import AsyncGraphDatabase, AsyncDriver, AsyncSession
from contextlib import asynccontextmanager
from loguru import logger
from app.core.config import settings


class DatabaseManager:
    """Manages the Neo4j async driver lifecycle."""

    def __init__(self):
        self._driver: AsyncDriver | None = None

    async def connect(self):
        """
        Opens the Neo4j connection pool.
        Called once at application startup.
        """
        self._driver = AsyncGraphDatabase.driver(
            settings.NEO4J_URI,
            auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
            max_connection_pool_size=50,
        )
        # Verify connectivity
        await self._driver.verify_connectivity()
        logger.info(f"Connected to Neo4j at {settings.NEO4J_URI}")
        await self._create_constraints()

    async def disconnect(self):
        """Closes all Neo4j connections. Called at shutdown."""
        if self._driver:
            await self._driver.close()
            logger.info("Neo4j connection closed.")

    @asynccontextmanager
    async def session(self) -> AsyncSession:
        """
        Async context manager for a Neo4j session.
        Use this for every database operation.

        Example:
            async with db_manager.session() as s:
                await s.run("CREATE (n:Wallet {address: $addr})", addr="bc1q...")
        """
        if not self._driver:
            raise RuntimeError("Database not connected. Call connect() first.")
        async with self._driver.session() as session:
            yield session

    async def _create_constraints(self):
        """
        Creates uniqueness constraints and indexes in Neo4j on first run.
        These make node lookups fast and prevent duplicate entries.
        """
        constraints = [
            # Each wallet address is unique
            "CREATE CONSTRAINT wallet_address IF NOT EXISTS FOR (w:Wallet) REQUIRE w.address IS UNIQUE",
            # Each UPI ID is unique
            "CREATE CONSTRAINT upi_id IF NOT EXISTS FOR (u:UpiAccount) REQUIRE u.upi_id IS UNIQUE",
            # Each bank account is unique
            "CREATE CONSTRAINT bank_account IF NOT EXISTS FOR (b:BankAccount) REQUIRE b.account_number IS UNIQUE",
            # Each company CIN is unique (MCA registration number)
            "CREATE CONSTRAINT company_cin IF NOT EXISTS FOR (c:Company) REQUIRE c.cin IS UNIQUE",
            # Each phone number is unique
            "CREATE CONSTRAINT phone_number IF NOT EXISTS FOR (p:Phone) REQUIRE p.number IS UNIQUE",
            # Full-text search index on all identifiers
            "CREATE TEXT INDEX entity_search IF NOT EXISTS FOR (n:Entity) ON (n.identifier)",
        ]
        async with self.session() as s:
            for cypher in constraints:
                try:
                    await s.run(cypher)
                except Exception as e:
                    logger.warning(f"Constraint already exists or failed: {e}")
        logger.info("Neo4j constraints and indexes verified.")


# Singleton - imported everywhere
db_manager = DatabaseManager()
