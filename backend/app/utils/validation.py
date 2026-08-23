"""
Centralized input validation. Keeping these as pure functions (no DB access)
means every route calls the SAME validator, so a fix here fixes every route
at once instead of drifting into inconsistent per-route regexes.
"""
import re

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def validate_email_format(email: str) -> bool:
    return bool(email) and len(email) <= 255 and bool(_EMAIL_RE.match(email))


def validate_password_strength(password: str) -> bool:
    if len(password) < 10 or len(password) > 128:
        return False
    has_letter = any(c.isalpha() for c in password)
    has_digit = any(c.isdigit() for c in password)
    return has_letter and has_digit


def validate_uuid_param(value: str) -> bool:
    """Defense in depth for path params that should be UUIDs — even though
    the ORM query itself is injection-safe regardless, rejecting obviously
    malformed IDs early avoids wasting a DB round trip and keeps error
    responses uniform (400, not a 500 from a failed cast)."""
    import uuid
    try:
        uuid.UUID(str(value))
        return True
    except (ValueError, AttributeError, TypeError):
        return False
