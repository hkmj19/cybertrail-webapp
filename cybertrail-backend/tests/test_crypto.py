"""
tests/test_crypto.py
──────────────────────
Unit tests for the Crypto Tracer module.

Tests cover:
  - Chain auto-detection (BTC / ETH / TRON)
  - Graph node creation
  - Transaction normalisation
  - Known exchange detection
  - Mocked API responses (no real API calls in tests)
"""

import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, patch, MagicMock

from app.modules.crypto.tracer import CryptoTracer
from app.models.graph import CryptoTraceRequest, NodeType


@pytest.fixture
def tracer():
    return CryptoTracer()


# ── Chain detection ──────────────────────────────────────

class TestChainDetection:
    def test_detects_btc_bech32(self, tracer):
        """bc1q... addresses are Bitcoin (native SegWit)."""
        assert tracer._detect_chain("bc1qxy2kgdygjrsqtzq2n0yrf2498gq8yh8d24") == "btc"

    def test_detects_btc_legacy(self, tracer):
        """1... addresses are Bitcoin (legacy P2PKH)."""
        assert tracer._detect_chain("1A1zP1eP5QGefi2DMPTfTL5SLmv7Divf") == "btc"

    def test_detects_btc_p2sh(self, tracer):
        """3... addresses are Bitcoin (P2SH / multisig)."""
        assert tracer._detect_chain("3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy") == "btc"

    def test_detects_eth(self, tracer):
        """0x... 40-char hex addresses are Ethereum."""
        assert tracer._detect_chain("0xde0b295669a9fd93d5f28d9ec85e40f4cb697bae") == "eth"

    def test_detects_tron(self, tracer):
        """T... 34-char addresses are TRON."""
        assert tracer._detect_chain("TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE") == "tron"

    def test_unknown_defaults_to_btc(self, tracer):
        """Unrecognised format defaults to BTC."""
        assert tracer._detect_chain("UNKNOWN_FORMAT_XYZ") == "btc"


# ── Exchange detection ───────────────────────────────────

class TestExchangeDetection:
    def test_known_binance_address_flagged(self, tracer):
        """Binance hot wallet prefix should be flagged."""
        assert tracer._is_known_exchange("bc1qm2kvlal5dq12mksgdqm_rest") is True

    def test_unknown_address_not_flagged(self, tracer):
        """Random wallet should not be flagged as exchange."""
        assert tracer._is_known_exchange("bc1qrandomaddress123") is False


# ── Node creation ────────────────────────────────────────

@pytest.mark.asyncio
class TestWalletInfo:
    async def test_creates_btc_node(self, tracer):
        """_fetch_wallet_info should return a Wallet node with correct type."""
        with patch.object(tracer, '_btc_address_info', return_value={"balance_btc": 0.5}), \
             patch('app.core.cache.cache_manager.get', new_callable=AsyncMock, return_value=None), \
             patch('app.core.cache.cache_manager.set', new_callable=AsyncMock):
            node = await tracer._fetch_wallet_info("bc1qtest123", "btc")
            assert node.node_type == NodeType.WALLET_BTC
            assert "bc1qtest" in node.id

    async def test_creates_eth_node(self, tracer):
        """ETH wallet should return WALLET_ETH type."""
        with patch.object(tracer, '_eth_address_info', return_value={"balance_eth": 1.2}), \
             patch('app.core.cache.cache_manager.get', new_callable=AsyncMock, return_value=None), \
             patch('app.core.cache.cache_manager.set', new_callable=AsyncMock):
            node = await tracer._fetch_wallet_info("0xtest", "eth")
            assert node.node_type == NodeType.WALLET_ETH


# ── Value aggregation ────────────────────────────────────

class TestValueSumming:
    def test_sums_edge_amounts(self, tracer):
        """_sum_edge_values should total all edge amounts correctly."""
        from app.models.graph import GraphEdge, EdgeType
        edges = [
            GraphEdge(source="A", target="B", edge_type=EdgeType.CRYPTO_TX, amount=1000000),
            GraphEdge(source="B", target="C", edge_type=EdgeType.CRYPTO_TX, amount=500000),
            GraphEdge(source="A", target="C", edge_type=EdgeType.CRYPTO_TX, amount=None),
        ]
        total = tracer._sum_edge_values(edges)
        assert total == 1500000

    def test_handles_no_edges(self, tracer):
        """Empty edge list should return 0."""
        assert tracer._sum_edge_values([]) == 0
