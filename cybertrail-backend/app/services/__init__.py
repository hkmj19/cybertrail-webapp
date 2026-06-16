# app/services/__init__.py — exports service singletons
from app.services.graph_service import graph_service
from app.services.risk_service import risk_service
from app.services.blacklist_service import blacklist_service
__all__ = ["graph_service", "risk_service", "blacklist_service"]
