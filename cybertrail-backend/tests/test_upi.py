"""
tests/test_upi.py
──────────────────
Unit tests for the UPI / Bank Fraud Tracer.

Tests cover:
  - Identifier type auto-detection
  - CSV ingestion parsing
  - Node creation from different identifier types
  - Mule risk scoring heuristics
"""

import pytest
from app.modules.upi.tracer import UPITracer
from app.models.graph import NodeType, RiskLevel


@pytest.fixture
def tracer():
    return UPITracer()


# ── Identifier detection ─────────────────────────────────

class TestIdentifierDetection:
    def test_detects_upi(self, tracer):
        """Identifiers with @ are UPI IDs."""
        assert tracer._detect_type("fraud@paytm") == "upi"
        assert tracer._detect_type("user@ybl") == "upi"
        assert tracer._detect_type("9876543210@oksbi") == "upi"

    def test_detects_phone(self, tracer):
        """10-digit numeric strings are phone numbers."""
        assert tracer._detect_type("9876543210") == "phone"
        assert tracer._detect_type("8012345678") == "phone"

    def test_detects_bank_account(self, tracer):
        """Non-UPI, non-phone strings default to bank account."""
        assert tracer._detect_type("1234567890123456") == "bank_account"
        assert tracer._detect_type("HDFC0001234") == "bank_account"


# ── Node creation ────────────────────────────────────────

class TestNodeCreation:
    def test_upi_node_type(self, tracer):
        node = tracer._make_node("fraud@paytm", "upi", flagged=True)
        assert node.node_type == NodeType.UPI_ACCOUNT
        assert node.flagged is True
        assert node.risk_level == RiskLevel.HIGH

    def test_phone_node_type(self, tracer):
        node = tracer._make_node("9876543210", "phone", flagged=False)
        assert node.node_type == NodeType.PHONE
        assert node.flagged is False
        assert node.risk_level == RiskLevel.UNKNOWN

    def test_label_truncated(self, tracer):
        """Labels longer than 16 chars should be truncated with ellipsis."""
        node = tracer._make_node("1234567890123456789", "bank_account")
        assert "…" in node.label or len(node.label) <= 16


# ── Mule risk scoring ────────────────────────────────────

class TestMuleRiskScoring:
    def test_high_complaint_count(self, tracer):
        """3+ complaints → HIGH risk."""
        level = tracer._score_mule_risk(complaint_count=3, pass_through_ratio=0.0)
        assert level == RiskLevel.HIGH

    def test_high_passthrough_ratio(self, tracer):
        """Pass-through ratio ≥ 0.9 → HIGH risk (instant layering)."""
        level = tracer._score_mule_risk(complaint_count=0, pass_through_ratio=0.95)
        assert level == RiskLevel.HIGH

    def test_medium_risk(self, tracer):
        """1 complaint or 50% passthrough → MEDIUM."""
        level = tracer._score_mule_risk(complaint_count=1, pass_through_ratio=0.0)
        assert level == RiskLevel.MEDIUM

    def test_low_risk(self, tracer):
        """No complaints, low passthrough → LOW."""
        level = tracer._score_mule_risk(complaint_count=0, pass_through_ratio=0.0)
        assert level == RiskLevel.LOW


# ── CSV parsing ──────────────────────────────────────────

class TestCSVParsing:
    def test_valid_csv_parsed(self):
        """A valid complaint CSV should be accepted without errors."""
        import io
        import pandas as pd
        csv_content = b"""complaint_id,complainant_phone,fraud_upi_id,fraud_phone,amount_inr,transaction_date
C001,9000000001,fraud@paytm,9000000002,50000,2024-01-15
C002,9000000003,scam@ybl,9000000004,120000,2024-01-16"""
        df = pd.read_csv(io.BytesIO(csv_content))
        df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
        assert len(df) == 2
        assert "fraud_upi_id" in df.columns
        assert df["amount_inr"].sum() == 170000

    def test_column_normalisation(self):
        """Column names with spaces and caps should be normalised."""
        import io
        import pandas as pd
        csv_content = b"Complaint ID,Complainant Phone,Fraud UPI ID\nC001,9999999999,bad@upi"
        df = pd.read_csv(io.BytesIO(csv_content))
        df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
        assert "complaint_id" in df.columns
        assert "fraud_upi_id" in df.columns
