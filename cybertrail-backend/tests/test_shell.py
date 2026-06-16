"""
tests/test_shell.py
────────────────────
Tests for Shell Company Tracer - CIN detection and risk scoring.
"""
import pytest
from app.modules.shell.tracer import ShellTracer
from app.models.graph import RiskLevel, NodeType


@pytest.fixture
def tracer():
    return ShellTracer()


class TestCINDetection:
    def test_valid_cin(self, tracer):
        assert tracer._detect_type("L21091KA2019PTC123456") == "cin"
        assert tracer._detect_type("U65999MH2010PTC123456") == "cin"

    def test_din_detection(self, tracer):
        assert tracer._detect_type("12345678") == "director_din"

    def test_name_fallback(self, tracer):
        assert tracer._detect_type("Alpha Ventures Pvt Ltd") == "company_name"


class TestShellRiskScoring:
    def test_struck_off_is_high_risk(self, tracer):
        data = {"status": "Strike Off", "directors": [], "paid_up_capital_inr": 0}
        assert tracer._score_shell_risk(data) == RiskLevel.HIGH

    def test_no_filing_is_medium(self, tracer):
        data = {
            "status": "Active",
            "last_annual_return": None,
            "directors": [{"din": "1"}],
            "paid_up_capital_inr": 500000,
            "incorporation_date": "01/01/2015",
        }
        level = tracer._score_shell_risk(data)
        assert level in (RiskLevel.MEDIUM, RiskLevel.HIGH)

    def test_clean_company(self, tracer):
        data = {
            "status": "Active",
            "last_annual_return": "2023-03-31",
            "directors": [{"din": "1"}, {"din": "2"}],
            "paid_up_capital_inr": 10000000,
            "incorporation_date": "01/01/2010",
        }
        assert tracer._score_shell_risk(data) == RiskLevel.CLEAN

    def test_node_created_for_shell(self, tracer):
        data = tracer._mock_company_data("L21091KA2019PTC123456")
        node = tracer._make_company_node("L21091KA2019PTC123456", data)
        assert node.node_type == NodeType.COMPANY
        assert node.id == "L21091KA2019PTC123456"
