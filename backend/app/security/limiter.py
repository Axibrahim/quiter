"""
Flask-Limiter configuration.

Two-tier strategy:
  1. A tight per-route limit on anything under /api/v1/auth/* (5/min) —
     this is the credential-stuffing / brute-force surface, so it gets the
     strictest budget in the whole app.
  2. A looser, blanket default (60/min) applied globally to /api/v1/* so a
     single compromised or buggy client can't hammer the DB, independent of
     which specific route it's calling.

Storage backend: in single-instance dev this defaults to in-memory, but
production MUST point REDIS_URL at a shared Redis instance — otherwise each
gunicorn worker process keeps its own independent counter and the "5/min"
limit effectively becomes "5/min * worker_count", silently weakening the
control. This is called out loudly in app.py at startup.
"""
import os
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["60 per minute"],     # blanket default for every /api/v1/* route
    storage_uri=os.environ.get("REDIS_URL", "memory://"),
    strategy="fixed-window",              # simplest to reason about for audit; swap to
                                            # "moving-window" if burst-at-boundary abuse is observed
    headers_enabled=True,                 # emits X-RateLimit-* headers so the frontend can
                                            # back off gracefully instead of hammering a 429 loop
)

# Explicit auth-route budget — imported and applied via decorator in
# routes/auth.py: @limiter.limit(AUTH_RATE_LIMIT)
AUTH_RATE_LIMIT = "5 per minute"

# Slightly looser budget for the check-in endpoint since a real user might
# legitimately fire a few requests in a row while the UI retries a flaky
# connection, but still far below anything an abuse script would want.
HABIT_LOG_RATE_LIMIT = "20 per minute"
