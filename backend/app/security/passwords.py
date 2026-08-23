"""
Password hashing — Argon2id.

Why Argon2id over bcrypt: Argon2id (the "id" variant, not Argon2i/Argon2d
alone) is the PHC-winning, OWASP-recommended default for new systems in
2024+. It's resistant to both GPU cracking (memory-hard) and side-channel
timing attacks (the "id" hybrid mode). Bcrypt is still acceptable, but
Argon2id has a higher, tunable memory cost which is the more relevant
defense as GPU/ASIC cracking rigs get cheaper.

We also apply a server-side "pepper" (a secret NOT stored in the database,
only in the environment) on top of Argon2id's own per-hash random salt.
Rationale: Argon2's salt defeats rainbow tables and defeats cross-account
comparison, but it's stored alongside the hash in the same database row —
so a raw SQL-injection or DB-dump breach exposes salt+hash together. The
pepper lives only in env config, so a DB-only breach (without env/secret
access) is not enough to brute-force offline.
"""
import os
import hmac
import hashlib

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHashError

# Tuned for ~150-250ms per hash on typical production hardware — deliberately
# slow enough to make brute forcing expensive, fast enough not to bottleneck
# login UX. Tune with `argon2-cffi`'s benchmarking tool per your actual host.
_ph = PasswordHasher(
    time_cost=3,        # number of iterations
    memory_cost=65536,  # 64 MB per hash — the "memory-hard" defense
    parallelism=2,
    hash_len=32,
    salt_len=16,
)


def _pepper(password: str) -> str:
    """HMAC the password with a server-side secret before Argon2 sees it.

    Using HMAC-SHA256 here (not simple concatenation) avoids length-extension
    style footguns and normalizes input length before it hits Argon2.
    """
    pepper_secret = os.environ["PASSWORD_PEPPER"]  # fails loudly if unset — never silently skip peppering
    return hmac.new(
        pepper_secret.encode("utf-8"),
        password.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def hash_password(plaintext_password: str) -> str:
    """Return an Argon2id hash string safe to store in User.password_hash."""
    return _ph.hash(_pepper(plaintext_password))


def verify_password(plaintext_password: str, stored_hash: str) -> bool:
    """Constant-time-safe verification. Returns False on any mismatch or
    malformed hash instead of raising, so calling routes can treat every
    failure path identically (see routes/auth.py) and avoid leaking which
    failure mode occurred via response timing/content."""
    try:
        return _ph.verify(stored_hash, _pepper(plaintext_password))
    except (VerifyMismatchError, InvalidHashError):
        return False


def needs_rehash(stored_hash: str) -> bool:
    """Call after a successful login; if True, re-hash with current params
    and update the row. Lets you raise memory_cost/time_cost over time
    without forcing a mass password reset."""
    return _ph.check_needs_rehash(stored_hash)
