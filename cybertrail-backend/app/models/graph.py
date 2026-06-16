"""
app/models/graph.py
───────────────────
Shared Pydantic data models used across all investigation modules.

These define:
  - What a graph NODE looks like (wallet, UPI account, company, phone...)
  - What a graph EDGE looks like (transaction, ownership, shared identifier...)
  - What the full investigation GRAPH response looks like
  - Request models (what the API accepts as input)
"""

from pydantic import BaseModel, Field, model_validator, field_validator
from typing import Optional, Literal
from datetime import datetime
from enum import Enum


# ── Node type taxonomy ───────────────────────────────────

class NodeType(str, Enum):
    WALLET_BTC   = "wallet_btc"
    WALLET_ETH   = "wallet_eth"
    WALLET_TRON  = "wallet_tron"
    UPI_ACCOUNT  = "upi_account"
    BANK_ACCOUNT = "bank_account"
    PHONE        = "phone"
    COMPANY      = "company"
    PERSON       = "person"
    EXCHANGE     = "exchange"      # Binance, Coinbase hot wallets
    UNKNOWN      = "unknown"


class EdgeType(str, Enum):
    CRYPTO_TX    = "crypto_transaction"
    UPI_TX       = "upi_transaction"
    BANK_TX      = "bank_transaction"
    OWNS         = "owns"                  # person → company
    DIRECTOR_OF  = "director_of"           # person → company
    SUBSIDIARY   = "subsidiary"            # company → company
    SHARED_PHONE = "shared_phone"          # multiple accounts share a phone
    SHARED_UPI   = "shared_upi"
    CALLED       = "called"               # phone call link
    REGISTERED   = "registered"           # phone registered with account
    ASSOCIATED   = "associated"           # general association link


class RiskLevel(str, Enum):
    HIGH   = "high"
    MEDIUM = "medium"
    LOW    = "low"
    CLEAN  = "clean"
    UNKNOWN = "unknown"


# ── Node model ───────────────────────────────────────────

class GraphNode(BaseModel):
    """
    Represents a single entity in the investigation graph.
    Could be a wallet, bank account, company, person, or phone number.
    """
    id: str                              # unique identifier (address, UPI ID, CIN...)
    label: str                           # display name (truncated for UI)
    node_type: NodeType
    risk_level: RiskLevel = RiskLevel.UNKNOWN
    flagged: bool = False                # true if linked to known fraud

    @field_validator('flagged', mode='before')
    @classmethod
    def coerce_flagged(cls, v):
        # Neo4j returns None when property not set - treat as False
        if v is None:
            return False
        return bool(v)

    @field_validator('node_type', mode='before')
    @classmethod
    def coerce_node_type(cls, v):
        # Default to unknown if None or unrecognised value from Neo4j
        if not v:
            return NodeType.UNKNOWN
        return v

    @field_validator('risk_level', mode='before')
    @classmethod
    def coerce_risk_level(cls, v):
        # Default to unknown if None
        if not v:
            return RiskLevel.UNKNOWN
        return v
    metadata: dict = Field(default_factory=dict)  # module-specific extra data
    # e.g. for wallets: {"balance": "0.5 BTC", "tx_count": 142}
    # e.g. for companies: {"incorporation_date": "2020-01-01", "state": "MH"}
    first_seen: Optional[datetime] = None
    last_seen: Optional[datetime] = None


# ── Edge model ───────────────────────────────────────────

class GraphEdge(BaseModel):
    """
    Represents a relationship between two entities.
    Directional: source → target.
    """
    source: str                          # node id of sender/owner
    target: str                          # node id of receiver/subsidiary
    edge_type: EdgeType
    label: str = ""                      # display label, e.g. "₹1.2 Cr"
    amount: Optional[float] = None       # transaction amount in INR
    currency: Optional[str] = None       # BTC, ETH, INR, USDT...
    timestamp: Optional[datetime] = None
    tx_hash: Optional[str] = None       # blockchain tx hash for crypto edges
    metadata: dict = Field(default_factory=dict)


# ── Full graph response ──────────────────────────────────

class InvestigationGraph(BaseModel):
    """
    The complete graph returned by any trace endpoint.
    Contains all discovered nodes and their relationships.
    """
    session_id: str                      # unique ID for this investigation
    seed_identifier: str                 # what was searched (wallet, UPI ID...)
    module: str                          # which module produced this graph
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    total_nodes: int = 0
    total_edges: int = 0
    flagged_count: int = 0
    total_value_inr: Optional[float] = None   # total money traced
    hops_explored: int = 0
    generated_at: datetime = Field(default_factory=datetime.utcnow)

    @model_validator(mode="after")
    def compute_counts(self):
        self.total_nodes   = len(self.nodes)
        self.total_edges   = len(self.edges)
        self.flagged_count = sum(1 for n in self.nodes if n.flagged)
        return self


# ── Request models ───────────────────────────────────────

class TraceRequest(BaseModel):
    """Base request for any trace operation."""
    identifier: str = Field(..., description="Wallet address, UPI ID, phone number, company CIN, etc.")
    depth: int = Field(default=2, ge=1, le=5, description="How many hops to trace (1-5)")
    force_refresh: bool = Field(default=False, description="Bypass cache and fetch fresh data")


class CryptoTraceRequest(TraceRequest):
    """Request for crypto wallet tracing."""
    chain: Literal["btc", "eth", "tron", "auto"] = "auto"
    min_value_usd: float = Field(default=0, description="Filter edges below this USD value")


class UPITraceRequest(TraceRequest):
    """Request for UPI/bank fraud chain tracing."""
    identifier_type: Literal["upi", "phone", "bank_account", "auto"] = "auto"


class ShellTraceRequest(TraceRequest):
    """Request for shell company beneficial ownership tracing."""
    identifier_type: Literal["cin", "company_name", "director_din", "auto"] = "auto"


class SocialTraceRequest(TraceRequest):
    """Request for social/communication graph tracing."""
    identifier_type: Literal["phone", "upi", "email", "auto"] = "auto"