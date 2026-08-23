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

from flask import Blueprint, request, jsonify, current_app
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

    # --- Input validation
    if not validate_email_format(email):
        current_app.logger.warning(f"Registration failed: invalid email format ({email})")
        return jsonify({"error": "invalid_email"}), 400
    if not validate_password_strength(password):
        current_app.logger.warning(f"Registration failed: weak password for ({email})")
        return jsonify({"error": "weak_password",
                         "detail": "Min 10 chars, include a number and a letter."}), 400
    if not (2 <= len(display_name) <= 40):
        current_app.logger.warning(f"Registration failed: invalid display name ({display_name})")
        return jsonify({"error": "invalid_display_name"}), 400

    user = User(
        email=email,
        password_hash=hash_password(password),
        display_name=display_name,
    )
    db.session.add(user)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        current_app.logger.warning(f"Registration conflict: email already exists ({email})")
        return jsonify({"error": "email_already_registered"}), 409

    login_user(user)
    current_app.logger.info(f"User registered successfully: ID {user.id} ({user.email})")
    return jsonify({"id": user.id, "display_name": user.display_name}), 201


@auth_bp.route("/login", methods=["POST"])
@limiter.limit(AUTH_RATE_LIMIT)
def login():
    payload = request.get_json(silent=True) or {}
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""

    user = User.query.filter_by(email=email).first()

    generic_failure = (jsonify({"error": "invalid_credentials"}), 401)

    if user is None:
        # Dummy verification to prevent timing attacks
        verify_password(password, "$argon2id$v=19$m=65536,t=3,p=2$" + "0" * 22 + "$" + "0" * 43)
        current_app.logger.warning(f"Login failed: non-existent email ({email})")
        return generic_failure

    if user.locked_until and user.locked_until > datetime.utcnow():
        retry_seconds = int((user.locked_until - datetime.utcnow()).total_seconds())
        current_app.logger.warning(f"Login attempt blocked: account locked ({email}) for {retry_seconds}s")
        return jsonify({"error": "account_locked",
                         "retry_after_seconds": retry_seconds}), 423

    if not verify_password(password, user.password_hash):
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= LOCKOUT_THRESHOLD:
            user.locked_until = datetime.utcnow() + LOCKOUT_DURATION
            current_app.logger.warning(f"Account locked: {email} exceeded {LOCKOUT_THRESHOLD} failed attempts")
        else:
            current_app.logger.warning(f"Login failed: invalid password for {email} (Attempt {user.failed_login_attempts}/{LOCKOUT_THRESHOLD})")
        
        db.session.commit()
        return generic_failure

    # Successful login — reset lockout counters
    user.failed_login_attempts = 0
    user.locked_until = None
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
        current_app.logger.info(f"Password hash upgraded for user ID {user.id}")
        
    db.session.commit()

    login_user(user)
    current_app.logger.info(f"User logged in successfully: ID {user.id} ({user.email})")
    return jsonify({"id": user.id, "display_name": user.display_name}), 200


@auth_bp.route("/logout", methods=["POST"])
@login_required
def logout():
    logout_user()
    current_app.logger.info("User logged out successfully")
    return jsonify({"ok": True}), 200