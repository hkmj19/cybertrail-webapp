"""
app/modules/crypto/tracer.py
────────────────────────────
Crypto Tracer Module
═════════════════════
Traces Bitcoin, Ethereum, and USDT/TRON wallet transactions using
public blockchain APIs (no private keys required — read-only).

FLOW:
  1. Detect blockchain from address format (BTC / ETH / TRON)
  2. Fetch all transactions for the seed wallet (cached 1hr)
  3. For each transaction, create a graph edge + counterparty node
  4. Optionally recurse depth hops to expand the graph
  5. Flag wallets appearing in known exchange hot-wallet lists
  6. Save everything to Neo4j for future cross-module correlation

EXTERNAL APIs:
  - Bitcoin  → BlockCypher API (blockcypher.com/v1/btc)
  - Ethereum → Etherscan API  (api.etherscan.io/api)
  - TRON     → TronGrid API   (api.trongrid.io)
"""

import re
import uuid
import httpx
from datetime import datetime
from loguru import logger

from app.core.config import settings
from app.core.cache import cache_manager
from app.core.database import db_manager
from app.models.graph import (
    GraphNode, GraphEdge, InvestigationGraph,
    NodeType, EdgeType, RiskLevel, CryptoTraceRequest
)

# ── Known exchange hot wallet prefixes (for flagging) ────
KNOWN_EXCHANGES = {
    "bc1qm2kvlal5dq12mksgdqm": "Binance",
    "34xp4vrocgjym3xr7ycvpfhe": "Binance Cold",
    "0xde0b295669a9fd93d5f28d9ec85e40f4cb697bae": "Ethereum Foundation",
    "0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be": "Binance ETH",
}

# USD → INR conversion rate (in production: fetch from forex API)
USD_TO_INR = 83.5


class CryptoTracer:
    """
    Traces cryptocurrency wallet transaction graphs.

    Usage:
        tracer = CryptoTracer()
        graph = await tracer.trace(request)
    """

    def __init__(self):
        self.http = httpx.AsyncClient(timeout=15.0)

    # ── Public entry point ───────────────────────────────

    async def trace(self, request: CryptoTraceRequest) -> InvestigationGraph:
        """
        Main trace function. Detects chain and builds graph.
        Returns a complete InvestigationGraph with nodes + edges.
        """
        chain = request.chain
        if chain == "auto":
            chain = self._detect_chain(request.identifier)

        logger.info(f"Crypto trace: {request.identifier} on {chain}, depth={request.depth}")

        nodes: dict[str, GraphNode] = {}
        edges: list[GraphEdge] = []

        # Start with the seed wallet
        seed_node = await self._fetch_wallet_info(request.identifier, chain)
        nodes[seed_node.id] = seed_node

        # Expand the graph up to `depth` hops
        await self._expand(
            address=request.identifier,
            chain=chain,
            depth=request.depth,
            nodes=nodes,
            edges=edges,
            min_value_usd=request.min_value_usd,
            force_refresh=request.force_refresh,
        )

        # Persist to Neo4j
        await self._save_to_neo4j(list(nodes.values()), edges)

        return InvestigationGraph(
            session_id=str(uuid.uuid4()),
            seed_identifier=request.identifier,
            module="crypto",
            nodes=list(nodes.values()),
            edges=edges,
            hops_explored=request.depth,
            total_value_inr=self._sum_edge_values(edges),
        )

    # ── Chain detection ─────────────────────────────────

    def _detect_chain(self, address: str) -> str:
        """
        Detects blockchain from address format.
          bc1q... / 1... / 3...  → Bitcoin
          0x...                  → Ethereum
          T...                   → TRON
        """
        if re.match(r'^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$', address):
            return "btc"
        if re.match(r'^0x[a-fA-F0-9]{40}$', address):
            return "eth"
        if re.match(r'^T[A-Za-z1-9]{33}$', address):
            return "tron"
        return "btc"  # default fallback

    # ── Graph expansion (BFS by depth) ──────────────────

    async def _expand(
        self, address: str, chain: str, depth: int,
        nodes: dict, edges: list, min_value_usd: float,
        force_refresh: bool, visited: set | None = None
    ):
        """
        Recursively expands the graph from `address` up to `depth` hops.
        Uses BFS — fetches all direct neighbours, then recurses.
        Stops when depth = 0 or MAX_NODES_PER_TRACE reached.
        """
        if visited is None:
            visited = set()
        if address in visited or depth <= 0:
            return
        if len(nodes) >= settings.MAX_NODES_PER_TRACE:
            logger.debug("Max nodes reached, stopping expansion.")  # debug not warning
            return

        visited.add(address)

        # Fetch transactions for this address (cached)
        txs = await self._fetch_transactions(address, chain, force_refresh)

        for tx in txs:
            value_usd = tx.get("value_usd", 0)
            if value_usd < min_value_usd:
                continue  # skip dust transactions

            counterparty = tx.get("counterparty_address", "")
            if not counterparty or counterparty == address:
                continue

            # Add counterparty node if not seen
            if counterparty not in nodes:
                cp_node = await self._fetch_wallet_info(counterparty, chain)
                nodes[counterparty] = cp_node

            # Create edge — smart label based on currency and amount
            currency = tx.get("currency", chain.upper())
            if currency == "USDT":
                # Show actual USDT amount
                if value_usd >= 1000:
                    label = f"${value_usd:,.0f} USDT"
                elif value_usd >= 1:
                    label = f"${value_usd:.2f} USDT"
                else:
                    label = f"${value_usd:.4f} USDT"
            elif currency in ("ETH",):
                label = f"{value_usd/3000:.4f} ETH"
            elif value_usd * USD_TO_INR >= 100000:
                # Show in Lakhs for large INR amounts
                label = f"₹{value_usd * USD_TO_INR / 100000:.1f} L"
            else:
                label = f"₹{value_usd * USD_TO_INR:,.0f}"

            edge = GraphEdge(
                source=tx["sender"],
                target=tx["receiver"],
                edge_type=EdgeType.CRYPTO_TX,
                label=label,
                amount=value_usd * USD_TO_INR,
                currency=currency,
                timestamp=tx.get("timestamp"),
                tx_hash=tx.get("hash"),
                metadata={"block": tx.get("block_height"), "fee": tx.get("fee_usd")},
            )
            edges.append(edge)

            # Recurse into counterparty
            await self._expand(
                counterparty, chain, depth - 1,
                nodes, edges, min_value_usd, force_refresh, visited
            )

    # ── API calls (with caching) ─────────────────────────

    async def _fetch_wallet_info(self, address: str, chain: str) -> GraphNode:
        """
        Fetches wallet balance and metadata.
        Returns a GraphNode representing the wallet.
        """
        cache_key = cache_manager.make_key("wallet_info", chain, address)
        cached = await cache_manager.get(cache_key)
        if cached:
            return GraphNode(**cached)

        node = GraphNode(
            id=address,
            label=address[:12] + "…" + address[-4:],
            node_type=NodeType.WALLET_BTC if chain == "btc"
                      else NodeType.WALLET_ETH if chain == "eth"
                      else NodeType.WALLET_TRON,
            risk_level=RiskLevel.UNKNOWN,
            flagged=self._is_known_exchange(address),
            metadata={"chain": chain, "address": address},
        )

        # Fetch chain-specific data
        if chain == "btc":
            data = await self._btc_address_info(address)
        elif chain == "eth":
            data = await self._eth_address_info(address)
        else:
            data = await self._tron_address_info(address)

        if data:
            node.metadata.update(data)

        await cache_manager.set(cache_key, node.model_dump(mode="json"))
        return node

    async def _fetch_transactions(
        self, address: str, chain: str, force_refresh: bool = False
    ) -> list[dict]:
        """
        Fetches transaction list for an address.
        Returns list of normalised transaction dicts.
        Each dict has: sender, receiver, counterparty_address, value_usd, hash, timestamp
        """
        cache_key = cache_manager.make_key("wallet_txs", chain, address)
        if not force_refresh:
            cached = await cache_manager.get(cache_key)
            if cached:
                return cached

        if chain == "btc":
            txs = await self._btc_transactions(address)
        elif chain == "eth":
            txs = await self._eth_transactions(address)
        else:
            txs = await self._tron_transactions(address)

        await cache_manager.set(cache_key, txs)
        return txs

    # ── Bitcoin via BlockCypher ──────────────────────────

    async def _btc_address_info(self, address: str) -> dict:
        """Fetches BTC wallet balance from BlockCypher. Skips gracefully if no API key."""
        if not settings.BLOCKCYPHER_API_KEY or settings.BLOCKCYPHER_API_KEY == "YOUR_BLOCKCYPHER_KEY":
            logger.debug("BlockCypher API key not set — skipping BTC address info fetch.")
            return {}
        try:
            url = f"https://api.blockcypher.com/v1/btc/main/addrs/{address}/balance"
            params = {"token": settings.BLOCKCYPHER_API_KEY}
            r = await self.http.get(url, params=params)
            r.raise_for_status()
            data = r.json()
            return {
                "balance_btc": data.get("balance", 0) / 1e8,
                "tx_count": data.get("n_tx", 0),
                "total_received_btc": data.get("total_received", 0) / 1e8,
            }
        except Exception as e:
            logger.warning(f"BTC info fetch failed for {address}: {e}")
            return {}

    async def _btc_transactions(self, address: str) -> list[dict]:
        """Fetches BTC transactions from BlockCypher. Skips gracefully if no API key."""
        if not settings.BLOCKCYPHER_API_KEY or settings.BLOCKCYPHER_API_KEY == "YOUR_BLOCKCYPHER_KEY":
            logger.debug("BlockCypher API key not set — skipping BTC transaction fetch.")
            return []
        try:
            url = f"https://api.blockcypher.com/v1/btc/main/addrs/{address}/full"
            params = {"limit": 50, "token": settings.BLOCKCYPHER_API_KEY}
            r = await self.http.get(url, params=params)
            r.raise_for_status()
            raw_txs = r.json().get("txs", [])

            normalised = []
            for tx in raw_txs:
                # Determine inputs (senders) and outputs (receivers)
                inputs  = [i.get("addresses", [None])[0] for i in tx.get("inputs", [])]
                outputs = [o for o in tx.get("outputs", [])]
                value_satoshi = sum(o.get("value", 0) for o in outputs if address not in o.get("addresses", []))
                value_btc = value_satoshi / 1e8
                value_usd = value_btc * 60000  # approx; use live price in prod

                for out in outputs:
                    recv_addrs = out.get("addresses", [])
                    for recv in recv_addrs:
                        if recv == address:
                            continue
                        sender = inputs[0] if inputs else address
                        normalised.append({
                            "hash": tx.get("hash", ""),
                            "sender": sender,
                            "receiver": recv,
                            "counterparty_address": recv if sender == address else sender,
                            "value_usd": value_usd,
                            "currency": "BTC",
                            "timestamp": tx.get("confirmed"),
                            "block_height": tx.get("block_height"),
                        })
            return normalised
        except Exception as e:
            logger.warning(f"BTC tx fetch failed for {address}: {e}")
            return []

    # ── Ethereum via Etherscan ───────────────────────────

    async def _eth_address_info(self, address: str) -> dict:
        """Fetches ETH wallet balance from Etherscan. Skips gracefully if no API key."""
        if not settings.ETHERSCAN_API_KEY or settings.ETHERSCAN_API_KEY == "YOUR_ETHERSCAN_API_KEY":
            logger.debug("Etherscan API key not set — skipping ETH address info fetch.")
            return {}
        try:
            r = await self.http.get("https://api.etherscan.io/v2/api", params={
                "chainid": 1, "module": "account", "action": "balance",
                "address": address, "tag": "latest",
                "apikey": settings.ETHERSCAN_API_KEY,
            })
            r.raise_for_status()
            wei = int(r.json().get("result", 0))
            return {"balance_eth": wei / 1e18}
        except Exception as e:
            logger.warning(f"ETH info fetch failed for {address}: {e}")
            return {}

    async def _eth_transactions(self, address: str) -> list[dict]:
        """Fetches ETH transactions from Etherscan with full debug logging."""
        if not settings.ETHERSCAN_API_KEY or settings.ETHERSCAN_API_KEY == "YOUR_ETHERSCAN_API_KEY":
            logger.warning("Etherscan API key not set - skipping ETH transaction fetch.")
            return []
        txs = []
        for action in ("txlist", "tokentx"):
            try:
                r = await self.http.get("https://api.etherscan.io/v2/api", params={
                    "chainid": 1, "module": "account", "action": action,
                    "address": address, "startblock": 0, "endblock": 99999999,
                    "sort": "desc", "offset": 50, "page": 1,
                    "apikey": settings.ETHERSCAN_API_KEY,
                })
                r.raise_for_status()
                data = r.json()
                status  = data.get("status")
                message = data.get("message")
                result  = data.get("result", [])
                logger.info(f"Etherscan [{action}] {address[:12]}: status={status} msg={message} count={len(result) if isinstance(result, list) else 'N/A'}")
                if status == "0" or not isinstance(result, list):
                    logger.warning(f"Etherscan [{action}] no results: {message}")
                    continue
                for tx in result:
                    value_eth = int(tx.get("value", 0)) / 1e18
                    sender    = str(tx.get("from", "")).lower()
                    receiver  = str(tx.get("to",   "")).lower()
                    if not receiver:   # skip contract creation
                        continue
                    counterparty = receiver if sender == address.lower() else sender
                    if not counterparty:
                        continue
                    txs.append({
                        "hash":                 tx.get("hash", ""),
                        "sender":               sender,
                        "receiver":             receiver,
                        "counterparty_address": counterparty,
                        "value_usd":            value_eth * 3000,
                        "currency":             tx.get("tokenSymbol", "ETH"),
                        "timestamp":            str(tx.get("timeStamp", "")),
                        "block_height":         int(tx.get("blockNumber", 0) or 0),
                    })
            except Exception as e:
                logger.warning(f"Etherscan [{action}] exception for {address[:12]}: {e}")
        logger.info(f"ETH total txs for {address[:12]}: {len(txs)}")
        return txs


    # ── TRON via TronGrid ────────────────────────────────

    async def _tron_address_info(self, address: str) -> dict:
        """Fetches TRON wallet info from TronGrid. Skips gracefully if no API key."""
        if not settings.TRONGRID_API_KEY or settings.TRONGRID_API_KEY == "YOUR_TRONGRID_API_KEY":
            logger.debug("TronGrid API key not set — skipping TRON address info fetch.")
            return {}
        try:
            r = await self.http.get(
                f"https://api.trongrid.io/v1/accounts/{address}",
                headers={"TRON-PRO-API-KEY": settings.TRONGRID_API_KEY},
            )
            r.raise_for_status()
            data_list = r.json().get("data", [])
            if not data_list:
                return {}   # new/empty wallet — no balance info, not an error
            data = data_list[0]
            return {
                "balance_trx": data.get("balance", 0) / 1e6,
                "bandwidth":   data.get("free_net_usage", 0),
            }
        except Exception as e:
            logger.warning(f"TRON info fetch failed for {address}: {e}")
            return {}

    async def _tron_transactions(self, address: str) -> list[dict]:
        """Fetches USDT/TRC20 transactions from TronGrid. Skips gracefully if no API key."""
        if not settings.TRONGRID_API_KEY or settings.TRONGRID_API_KEY == "YOUR_TRONGRID_API_KEY":
            logger.debug("TronGrid API key not set — skipping TRON transaction fetch.")
            return []
        try:
            r = await self.http.get(
                f"https://api.trongrid.io/v1/accounts/{address}/transactions/trc20",
                params={"limit": 50, "contract_address": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"},  # USDT contract
                headers={"TRON-PRO-API-KEY": settings.TRONGRID_API_KEY},
            )
            r.raise_for_status()
            txs = []
            for tx in r.json().get("data", []):
                value = int(tx.get("value", 0)) / 1e6  # USDT has 6 decimals
                txs.append({
                    "hash": tx.get("transaction_id", ""),
                    "sender": tx.get("from", ""),
                    "receiver": tx.get("to", ""),
                    "counterparty_address": tx.get("to") if tx.get("from") == address else tx.get("from"),
                    "value_usd": value,
                    "currency": "USDT",
                    "timestamp": datetime.fromtimestamp(tx.get("block_timestamp", 0) / 1000).isoformat(),
                })
            return txs
        except Exception as e:
            logger.warning(f"TRON tx fetch failed for {address}: {e}")
            return []

    # ── Helpers ──────────────────────────────────────────

    def _is_known_exchange(self, address: str) -> bool:
        """Checks if address belongs to a known exchange (Binance, Coinbase, etc.)."""
        addr_lower = address.lower()
        return any(addr_lower.startswith(k) for k in KNOWN_EXCHANGES)

    def _sum_edge_values(self, edges: list[GraphEdge]) -> float:
        """Sums all edge amounts for total traced value."""
        return sum(e.amount or 0 for e in edges)

    # ── Neo4j persistence ────────────────────────────────

    async def _save_to_neo4j(self, nodes: list[GraphNode], edges: list[GraphEdge]):
        """
        Persists nodes and edges to Neo4j.
        Uses MERGE to avoid duplicates — safe to call multiple times.
        """
        async with db_manager.session() as s:
            for node in nodes:
                await s.run("""
                    MERGE (w:Wallet {address: $id})
                    SET w.label = $label,
                        w.chain = $chain,
                        w.flagged = $flagged,
                        w.node_type = $node_type,
                        w.updated_at = datetime()
                """, id=node.id, label=node.label,
                     chain=node.metadata.get("chain", ""),
                     flagged=node.flagged, node_type=node.node_type.value)

            for edge in edges:
                await s.run("""
                    MATCH (s:Wallet {address: $source})
                    MATCH (t:Wallet {address: $target})
                    MERGE (s)-[r:CRYPTO_TX {tx_hash: $tx_hash}]->(t)
                    SET r.amount = $amount,
                        r.currency = $currency,
                        r.timestamp = $timestamp
                """, source=edge.source, target=edge.target,
                     tx_hash=edge.tx_hash or "",
                     amount=edge.amount, currency=edge.currency,
                     timestamp=str(edge.timestamp))