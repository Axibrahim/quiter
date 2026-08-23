"""
Session-based authentication via Flask's signed, HTTP-only cookie session —
deliberately NOT a JWT stored in localStorage/sessionStorage.

Why cookie session over JWT-in-localStorage: localStorage is readable by any
JS running on the page, so a single XSS hole anywhere (a compromised CDN
dependency, a stray innerHTML) means instant, silent session theft. An
HTTP-only cookie is invisible to JavaScript entirely — the CSP + Talisman
headers in headers.py plus this cookie flag combination is the standard
OWASP-recommended defense-in-depth pairing.

CSRF is mitigated by SameSite=Lax (set in headers.py) plus a custom header
check below, since SameSite alone doesn't cover older browsers or
same-site-subdomain edge cases.
"""
import functools
from flask import session, request, jsonify, g

from app.models.models import db, User


def login_user(user: User) -> None:
    """Establish the session. Flask signs this cookie with SECRET_KEY, so
    tampering with the cookie invalidates the signature — the session id
    itself is never trusted without that signature check, which Flask
    performs automatically on every request."""
    session.clear()               # prevent session fixation across logins
    session["user_id"] = user.id
    session.permanent = True      # respects PERMANENT_SESSION_LIFETIME in app.py


def logout_user() -> None:
    session.clear()


def login_required(view):
    """Route decorator: rejects unauthenticated requests before the view
    body runs, and rejects state-changing requests missing our custom
    anti-CSRF header."""
    @functools.wraps(view)
    def wrapped(*args, **kwargs):
        user_id = session.get("user_id")
        if not user_id:
            return jsonify({"error": "authentication_required"}), 401

        # Belt-and-suspenders CSRF check: browsers will not let a
        # cross-site form or fetch() call set an arbitrary custom header,
        # so requiring this header on every mutating request blocks classic
        # CSRF even in browsers that ignore SameSite.
        if request.method in ("POST", "PUT", "PATCH", "DELETE"):
            if request.headers.get("X-Quiter-Client") != "web":
                return jsonify({"error": "csrf_check_failed"}), 403

        user = db.session.get(User, user_id)   # ORM lookup — parameterized, injection-safe
        if user is None or not user.is_active:
            session.clear()
            return jsonify({"error": "account_unavailable"}), 401

        g.current_user = user   # stash for the route body to use
        return view(*args, **kwargs)

    return wrapped
