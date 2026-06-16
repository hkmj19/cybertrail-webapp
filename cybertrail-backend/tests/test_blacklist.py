"""
tests/test_blacklist.py
────────────────────────
Tests for the Blacklist Service — CSV parsing, check logic, severity mapping.
"""

import pytest
from unittest.mock import AsyncMock, patch
from app.services.blacklist_service import BlacklistService


@pytest.fixture
def service():
    return BlacklistService()


class TestBlacklistCheck:
    @pytest.mark.asyncio
    async def test_returns_empty_for_clean_identifier(self, service):
        """An identifier not in any list should return empty hits."""
        with patch.object(service, '_check_internal', new_callable=AsyncMock, return_value=[]), \
             patch.object(service, '_check_ofac', new_callable=AsyncMock, return_value=[]), \
             patch.object(service, '_check_i4c', new_callable=AsyncMock, return_value=[]), \
             patch('app.core.cache.cache_manager.get', new_callable=AsyncMock, return_value=None), \
             patch('app.core.cache.cache_manager.set', new_callable=AsyncMock):
            hits = await service.check("clean_identifier@upi")
            assert hits == []

    @pytest.mark.asyncio
    async def test_returns_hits_for_flagged_identifier(self, service):
        """A flagged identifier should return at least one hit."""
        mock_hit = [{"source": "I4C", "reason": "5 NCRP complaints", "severity": "high"}]
        with patch.object(service, '_check_internal', new_callable=AsyncMock, return_value=[]), \
             patch.object(service, '_check_ofac', new_callable=AsyncMock, return_value=[]), \
             patch.object(service, '_check_i4c', new_callable=AsyncMock, return_value=mock_hit), \
             patch('app.core.cache.cache_manager.get', new_callable=AsyncMock, return_value=None), \
             patch('app.core.cache.cache_manager.set', new_callable=AsyncMock):
            hits = await service.check("fraud@paytm")
            assert len(hits) == 1
            assert hits[0]["source"] == "I4C"

    @pytest.mark.asyncio
    async def test_uses_cache_on_second_call(self, service):
        """Second check for same identifier should return from Redis cache."""
        cached_hits = [{"source": "internal", "reason": "Confirmed fraud", "severity": "high"}]
        with patch('app.core.cache.cache_manager.get', new_callable=AsyncMock, return_value=cached_hits):
            hits = await service.check("fraud@paytm")
            assert hits == cached_hits


class TestBulkCSVImport:
    @pytest.mark.asyncio
    async def test_valid_csv_imports_correctly(self, service):
        """A valid CSV with known columns should import all rows."""
        csv_bytes = b"""identifier,reason,severity,fraud_type,complaint_count
fraud@paytm,Multiple NCRP complaints,high,online_fraud,12
scam@ybl,Investment fraud,medium,investment,3
bad@oksbi,Romance scam,medium,romance,2"""

        mock_session = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)
        mock_session.run = AsyncMock()

        with patch('app.core.database.db_manager.session', return_value=mock_session):
            result = await service.bulk_import_csv(csv_bytes, source="i4c")
            assert result["imported"] == 3
            assert result["skipped"] == 0

    @pytest.mark.asyncio
    async def test_empty_identifier_rows_skipped(self, service):
        """Rows with empty identifier field should be counted as skipped."""
        csv_bytes = b"""identifier,reason,severity
,empty row,high
fraud@paytm,valid row,high"""

        mock_session = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)
        mock_session.run = AsyncMock()

        with patch('app.core.database.db_manager.session', return_value=mock_session):
            result = await service.bulk_import_csv(csv_bytes, source="internal")
            assert result["imported"] == 1
            assert result["skipped"] == 1


class TestIsBlacklisted:
    @pytest.mark.asyncio
    async def test_is_flagged_true_when_hits_exist(self, service):
        with patch.object(service, 'check', new_callable=AsyncMock,
                          return_value=[{"source": "internal"}]):
            assert await service.is_flagged("fraud@paytm") is True

    @pytest.mark.asyncio
    async def test_is_flagged_false_when_clean(self, service):
        with patch.object(service, 'check', new_callable=AsyncMock, return_value=[]):
            assert await service.is_flagged("clean@upi") is False
