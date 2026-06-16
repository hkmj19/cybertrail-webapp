"""
app/core/logger.py
───────────────────
Structured logging configuration using Loguru.

Sets up:
  - Console logging (coloured, human-readable in development)
  - File logging (JSON format for production log aggregation)
  - Request-scoped trace IDs (so you can follow one API request through all logs)
  - Sensitive data masking (wallet addresses, phone numbers partially redacted)

Usage:
    from app.core.logger import logger, mask_sensitive
    logger.info(f"Tracing wallet {mask_sensitive(address)}")
    logger.bind(request_id="abc123").debug("Starting trace")
"""

import sys
import re
from loguru import logger as _loguru_logger
from app.core.config import settings


def setup_logging():
    """
    Configures Loguru for the application.
    Call once at startup - already called in main.py.
    """
    # Remove Loguru's default handler
    _loguru_logger.remove()

    # ── Console handler ──────────────────────────────────
    # Human-readable in dev, simpler in prod
    if settings.APP_ENV == "development":
        _loguru_logger.add(
            sys.stderr,
            level="DEBUG",
            format=(
                "<green>{time:HH:mm:ss}</green> | "
                "<level>{level: <8}</level> | "
                "<cyan>{name}</cyan>:<cyan>{line}</cyan> - "
                "<level>{message}</level>"
            ),
            colorize=True,
            backtrace=True,   # full traceback on exceptions
            diagnose=True,    # variable values in tracebacks
        )
    else:
        # Production: JSON lines for log aggregation (Loki, ELK, etc.)
        _loguru_logger.add(
            sys.stderr,
            level="INFO",
            format="{time:YYYY-MM-DD HH:mm:ss} | {level} | {name}:{line} | {message}",
            serialize=True,   # outputs JSON
            colorize=False,
        )

    # ── File handler (rotating) ──────────────────────────
    _loguru_logger.add(
        "logs/cybertrail_{time:YYYY-MM-DD}.log",
        level="INFO",
        rotation="00:00",     # new file each midnight
        retention="30 days",  # keep 30 days of logs
        compression="gz",     # compress old logs
        serialize=True,       # JSON format for easy parsing
        enqueue=True,         # async-safe: writes happen in background thread
    )

    # ── Error-only file ──────────────────────────────────
    _loguru_logger.add(
        "logs/errors.log",
        level="ERROR",
        rotation="100 MB",
        retention="90 days",
        compression="gz",
        serialize=True,
        enqueue=True,
    )

    _loguru_logger.info("Logging configured.")
    return _loguru_logger


# ── Sensitive data masking ────────────────────────────────

def mask_sensitive(value: str, show_chars: int = 6) -> str:
    """
    Partially redacts sensitive identifiers for safe logging.
    Never log full wallet addresses, phone numbers, or UPI IDs in plaintext.

    Examples:
        mask_sensitive("bc1qxy2kgdygjrsqtzq2n0yrf")  → "bc1qxy…yrf"
        mask_sensitive("9876543210")                  → "987654…210"
        mask_sensitive("fraud@paytm")                 → "fra***@paytm"
    """
    if not value or len(value) <= show_chars:
        return value

    if "@" in value:
        # UPI/email: mask the local part
        local, domain = value.split("@", 1)
        if len(local) <= 3:
            return f"{local}@{domain}"
        return f"{local[:3]}{'*' * (len(local) - 3)}@{domain}"

    # Default: show first N/2 and last 3 chars
    half = show_chars // 2
    return f"{value[:half]}…{value[-3:]}"


def mask_phone(phone: str) -> str:
    """Masks a phone number: 9876543210 → 98765*****"""
    if not phone or len(phone) < 5:
        return phone
    return phone[:5] + "*" * (len(phone) - 5)


def mask_account(account: str) -> str:
    """Masks bank account: 1234567890 → ******7890"""
    if not account or len(account) < 4:
        return account
    return "*" * (len(account) - 4) + account[-4:]


# ── FastAPI request logging middleware ────────────────────

async def log_request_middleware(request, call_next):
    """
    FastAPI middleware that logs every request with timing.
    Add to app in main.py:
        app.middleware("http")(log_request_middleware)
    """
    import time
    import uuid

    request_id = str(uuid.uuid4())[:8]
    start = time.perf_counter()

    with _loguru_logger.contextualize(request_id=request_id):
        _loguru_logger.info(f"→ {request.method} {request.url.path}")
        try:
            response = await call_next(request)
            elapsed = round((time.perf_counter() - start) * 1000, 1)
            _loguru_logger.info(
                f"← {request.method} {request.url.path} "
                f"[{response.status_code}] {elapsed}ms"
            )
            response.headers["X-Request-ID"] = request_id
            return response
        except Exception as e:
            elapsed = round((time.perf_counter() - start) * 1000, 1)
            _loguru_logger.error(f"✗ {request.method} {request.url.path} FAILED after {elapsed}ms: {e}")
            raise


# Export the configured logger
logger = setup_logging()
