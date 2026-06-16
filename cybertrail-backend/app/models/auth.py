"""
app/models/auth.py
──────────────────
User, Role, and Case Pydantic models for authentication and case management.
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional, Literal
from datetime import datetime
from enum import Enum


# ── Roles ────────────────────────────────────────────────
class UserRole(str, Enum):
    ADMIN      = "admin"       # Full access - create users, view all cases
    SUPERVISOR = "supervisor"  # View all cases, assign, close
    OFFICER    = "officer"     # Create/view own cases, run traces
    ANALYST    = "analyst"     # Read-only - view graphs and reports


# ── Case Status ──────────────────────────────────────────
class CaseStatus(str, Enum):
    OPEN       = "open"
    ACTIVE     = "active"
    PENDING    = "pending"      # Waiting for more info
    CLOSED     = "closed"
    ARCHIVED   = "archived"


# ── Case Priority ────────────────────────────────────────
class CasePriority(str, Enum):
    CRITICAL = "critical"
    HIGH     = "high"
    MEDIUM   = "medium"
    LOW      = "low"


# ══ USER MODELS ══════════════════════════════════════════

class UserCreate(BaseModel):
    username:    str = Field(..., min_length=3, max_length=50)
    password:    str = Field(..., min_length=8)
    full_name:   str = Field(..., min_length=2, max_length=100)
    badge_id:    str = Field(..., description="Police/officer badge ID")
    department:  str = Field(default="Cybercrime")
    designation: str = Field(default="Sub-Inspector")
    role:        UserRole = UserRole.OFFICER
    email:       Optional[str] = None

    @field_validator('username')
    @classmethod
    def username_alphanumeric(cls, v):
        if not v.replace('_', '').replace('.', '').isalnum():
            raise ValueError('Username must be alphanumeric (underscores allowed)')
        return v.lower()


class UserUpdate(BaseModel):
    full_name:   Optional[str] = None
    badge_id:    Optional[str] = None   # Admin can update badge ID
    department:  Optional[str] = None
    designation: Optional[str] = None
    role:        Optional[UserRole] = None
    is_active:   Optional[bool] = None
    email:       Optional[str] = None


class UserResponse(BaseModel):
    id:          str
    username:    str
    full_name:   str
    badge_id:    str
    department:  str
    designation: str
    role:        UserRole
    is_active:   bool
    email:       Optional[str]
    created_at:  datetime
    last_login:  Optional[datetime]
    case_count:  int = 0


class UserInDB(BaseModel):
    id:              str
    username:        str
    full_name:       str
    badge_id:        str
    department:      str
    designation:     str
    role:            UserRole
    is_active:       bool = True
    email:           Optional[str] = None
    hashed_password: str
    created_at:      datetime
    last_login:      Optional[datetime] = None
    created_by:      Optional[str] = None
    token_version:   int = 0          # incremented on role downgrade / disable


# ══ AUTH MODELS ═══════════════════════════════════════════

class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token:  str
    refresh_token: str
    token_type:    str = "bearer"
    expires_in:    int = 3600
    user:          UserResponse


class TokenData(BaseModel):
    username:      Optional[str] = None
    user_id:       Optional[str] = None
    role:          Optional[str] = None
    token_version: int = 0


# ══ CASE MODELS ═══════════════════════════════════════════

class CaseCreate(BaseModel):
    title:        str = Field(..., min_length=5, max_length=200)
    description:  str = Field(default="")
    priority:     CasePriority = CasePriority.MEDIUM
    fir_number:   Optional[str] = None          # FIR number if registered
    district:     Optional[str] = None
    complainant:  Optional[str] = None
    fraud_amount: Optional[float] = None        # Amount in INR
    tags:         list[str] = Field(default_factory=list)


class CaseUpdate(BaseModel):
    title:        Optional[str] = None
    description:  Optional[str] = None
    status:       Optional[CaseStatus] = None
    priority:     Optional[CasePriority] = None
    fir_number:   Optional[str] = None
    district:     Optional[str] = None
    complainant:  Optional[str] = None
    fraud_amount: Optional[float] = None
    tags:         Optional[list[str]] = None
    assigned_to:  Optional[str] = None          # username of officer


class CaseNote(BaseModel):
    content:    str = Field(..., min_length=1)
    note_type:  Literal["observation", "action", "evidence", "update"] = "observation"


class CaseNoteResponse(BaseModel):
    id:         str
    content:    str
    note_type:  str
    created_by: str
    created_at: datetime


class CaseTraceRecord(BaseModel):
    """Saved trace attached to a case."""
    id:          str
    identifier:  str
    module:      str
    depth:       int
    node_count:  int
    edge_count:  int
    flagged:     int
    traced_by:   str
    traced_at:   datetime
    graph_data:  Optional[dict] = None


class CaseResponse(BaseModel):
    id:           str
    case_number:  str            # Auto-generated: CT-2024-001
    title:        str
    description:  str
    status:       CaseStatus
    priority:     CasePriority
    fir_number:   Optional[str]
    district:     Optional[str]
    complainant:  Optional[str]
    fraud_amount: Optional[float]
    tags:         list[str]
    created_by:   str
    assigned_to:  Optional[str]
    created_at:   datetime
    updated_at:   datetime
    closed_at:    Optional[datetime]
    notes:        list[CaseNoteResponse] = []
    traces:       list[CaseTraceRecord] = []
    note_count:   int = 0
    trace_count:  int = 0


class CaseSummary(BaseModel):
    """Lightweight case listing - no notes/traces."""
    id:           str
    case_number:  str
    title:        str
    status:       CaseStatus
    priority:     CasePriority
    fir_number:   Optional[str]
    district:     Optional[str]
    fraud_amount: Optional[float]
    created_by:   str
    assigned_to:  Optional[str]
    created_at:   datetime
    updated_at:   datetime
    note_count:   int = 0
    trace_count:  int = 0