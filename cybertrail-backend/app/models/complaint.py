"""
app/models/complaint.py
────────────────────────
Pydantic models for complaint/FIR data ingested from CSV or API.

These represent the raw complaint data before it's converted
into graph nodes and edges. Used by the UPI tracer's CSV ingestor
and any future complaint management API endpoints.
"""

from pydantic import BaseModel, Field, validator, field_validator
from typing import Optional
from datetime import datetime, date, timezone
from enum import Enum


class ComplaintSource(str, Enum):
    NCRP      = "ncrp"          # National Cyber Crime Reporting Portal
    FIR       = "fir"           # First Information Report (police)
    BANK      = "bank"          # Bank internal complaint
    RBI       = "rbi"           # RBI Ombudsman
    MANUAL    = "manual"        # Manually entered by investigator


class ComplaintStatus(str, Enum):
    OPEN        = "open"
    UNDER_PROBE = "under_probe"
    CLOSED      = "closed"
    FALSE_ALARM = "false_alarm"


class Complaint(BaseModel):
    """
    A single financial fraud complaint.
    Parsed from CSV, FIR data, or entered manually.
    """
    complaint_id: str = Field(..., description="Unique complaint reference number")
    source: ComplaintSource = ComplaintSource.MANUAL
    status: ComplaintStatus = ComplaintStatus.OPEN

    # Complainant details
    complainant_phone: Optional[str] = None
    complainant_name: Optional[str] = None
    complainant_state: Optional[str] = None

    # Fraud identifiers (the entities to trace)
    fraud_upi_id: Optional[str] = None
    fraud_phone: Optional[str] = None
    fraud_bank_account: Optional[str] = None
    fraud_wallet_address: Optional[str] = None   # if crypto fraud

    # Transaction details
    amount_inr: float = Field(default=0.0, ge=0)
    transaction_date: Optional[date] = None
    fir_number: Optional[str] = None  # Moved here from below for clarity

    @field_validator('fir_number', mode='before')
    @classmethod
    def validate_fir_number(cls, v):
        """Accept any FIR format but strip whitespace."""
        if v is None or v == '':
            return None
        return str(v).strip()

    @field_validator('transaction_date', mode='before')
    @classmethod
    def validate_transaction_date(cls, v):
        """Accept date string (YYYY-MM-DD) or datetime, reject future dates."""
        if v is None or v == '':
            return None
        from datetime import datetime, date as date_type
        try:
            if isinstance(v, date_type):
                d = v
            elif isinstance(v, str):
                d = datetime.strptime(v[:10], '%Y-%m-%d').date()
            else:
                return None
            if d > date_type.today():
                raise ValueError('Transaction date cannot be in the future')
            return d
        except ValueError as e:
            raise ValueError(f'Invalid transaction_date: {e}')
    transaction_reference: Optional[str] = None  # UTR number for UPI

    # Narrative
    description: Optional[str] = None
    fraud_type: Optional[str] = None  # "online_shopping", "romance_scam", "investment_fraud" etc.

    # Investigation metadata
    assigned_to: Optional[str] = None       # officer name/badge
    district: Optional[str] = None
    police_station: Optional[str] = None
    # Note: fir_number is defined above with validator - removed duplicate here
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @validator("fraud_phone", "complainant_phone", pre=True)
    def clean_phone(cls, v):
        """Strip country code, spaces, and dashes from phone numbers."""
        if v is None:
            return v
        cleaned = str(v).strip().replace(" ", "").replace("-", "")
        if cleaned.startswith("+91"):
            cleaned = cleaned[3:]
        if cleaned.startswith("91") and len(cleaned) == 12:
            cleaned = cleaned[2:]
        return cleaned if cleaned != "nan" else None

    @validator("fraud_upi_id", pre=True)
    def clean_upi(cls, v):
        """Lowercase and strip UPI IDs."""
        if v is None or str(v) == "nan":
            return None
        return str(v).strip().lower()

    @validator("amount_inr", pre=True)
    def clean_amount(cls, v):
        """Handle missing or invalid amounts gracefully."""
        try:
            return float(str(v).replace(",", "").strip())
        except (ValueError, TypeError):
            return 0.0


class ComplaintBatch(BaseModel):
    """
    A batch of complaints ingested together (e.g., from a single CSV upload).
    """
    batch_id: str
    source: ComplaintSource
    total: int
    complaints: list[Complaint]
    ingested_at: datetime = Field(default_factory=datetime.utcnow)
    ingested_by: Optional[str] = None   # officer who uploaded


class ComplaintSummary(BaseModel):
    """
    Aggregated statistics for a set of complaints -
    used by the dashboard and stats endpoints.
    """
    total_complaints: int = 0
    total_amount_inr: float = 0.0
    unique_fraud_upis: int = 0
    unique_fraud_phones: int = 0
    unique_complainants: int = 0
    open_complaints: int = 0
    states_affected: list[str] = Field(default_factory=list)
    top_fraud_types: list[dict] = Field(default_factory=list)
    date_range_start: Optional[datetime] = None
    date_range_end: Optional[datetime] = None