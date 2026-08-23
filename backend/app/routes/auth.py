"""
Authentication routes — /api/v1/auth/*

Every route here is wrapped with the strict 5/min limiter (see
security/limiter.py). Login additionally implements a soft account lockout:
after 5 consecutive failures, the account is locked for 15 minutes. This is
layered ON TOP of the IP-based rate limit because the rate limit alone only
throttles a single attacking IP — an attacker with many IPs (a botnet) could
still hammer one specific account. The lockout closes that gap per-account.
"""
from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify
from sqlalchemy.exc import IntegrityError

from app.models.models import db, User
from app.security.passwords import hash_password, verify_password, needs_rehash
from app.security.limiter import limiter, AUTH_RATE_LIMIT
from app.security.session_auth import login_user, logout_user, login_required
from app.utils.validation import validate_email_format, validate_password_strength

auth_bp = Blueprint("auth", __name__, url_prefix="/api/v1/auth")

LOCKOUT_THRESHOLD = 5
LOCKOUT_DURATION = timedelta(minutes=15)


@auth_bp.route("/register", methods=["POST"])
@limiter.limit(AUTH_RATE_LIMIT)
def register():
    payload = request.get_json(silent=True) or {}
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    display_name = (payload.get("display_name") or "").strip()

    # --- Input validation happens BEFORE anything touches the database.
    # Rejecting malformed input here means the ORM layer below only ever
    # sees well-formed values, which is an extra belt on top of the ORM's
    # own parameterization.
    if not validate_email_format(email):
        return jsonify({"error": "invalid_email"}), 400
    if not validate_password_strength(password):
        return jsonify({"error": "weak_password",
                         "detail": "Min 10 chars, include a number and a letter."}), 400
    if not (2 <= len(display_name) <= 40):
        return jsonify({"error": "invalid_display_name"}), 400

    user = User(
        email=email,
        password_hash=hash_password(password),
        display_name=display_name,
    )
    db.session.add(user)
    try:
        # This commit is the ONLY place a duplicate-email race can surface —
        # the unique constraint on users.email (enforced at the DB level,
        # not just app level) is what actually prevents the race, not this
        # try/except, which just turns the DB's rejection into a clean 409.
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "email_already_registered"}), 409

    login_user(user)
    return jsonify({"id": user.id, "display_name": user.display_name}), 201


@auth_bp.route("/login", methods=["POST"])
@limiter.limit(AUTH_RATE_LIMIT)
def login():
    payload = request.get_json(silent=True) or {}
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""

    # ORM filter_by — the email string is bound as a parameter by SQLAlchemy,
    # never concatenated into SQL text. This is injection-safe by construction.
    user = User.query.filter_by(email=email).first()

    # Deliberately identical response shape/timing-ish path whether the user
    # doesn't exist OR the password is wrong, so the API never discloses
    # "that email isn't registered" (which would let an attacker enumerate
    # valid accounts).
    generic_failure = (jsonify({"error": "invalid_credentials"}), 401)

    if user is None:
        # Still run a hash operation on a dummy value so response timing
        # doesn't leak "user not found" vs "wrong password" via latency.
        verify_password(password, "$argon2id$v=19$m=65536,t=3,p=2$" + "0" * 22 + "$" + "0" * 43)
        return generic_failure

    if user.locked_until and user.locked_until > datetime.utcnow():
        return jsonify({"error": "account_locked",
                         "retry_after_seconds": int((user.locked_until - datetime.utcnow()).total_seconds())}), 423

    if not verify_password(password, user.password_hash):
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= LOCKOUT_THRESHOLD:
            user.locked_until = datetime.utcnow() + LOCKOUT_DURATION
        db.session.commit()
        return generic_failure

    # Successful login — reset lockout counters and opportunistically
    # upgrade the hash if Argon2 params have been tightened since this
    # user's password was last set.
    user.failed_login_attempts = 0
    user.locked_until = None
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    db.session.commit()

    login_user(user)
    return jsonify({"id": user.id, "display_name": user.display_name}), 200


@auth_bp.route("/logout", methods=["POST"])
@login_required
def logout():
    logout_user()
    return jsonify({"ok": True}), 200
