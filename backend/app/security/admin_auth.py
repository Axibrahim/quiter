"""
Admin authorization. Deliberately separate from session_auth.py's
login_required — this decorator assumes g.current_user is already set,
so it must always be stacked UNDER @login_required (login_required listed
first, admin_required second), e.g.:

    @admin_bp.route(...)
    @login_required
    @admin_required
    def view(): ...
"""
import functools
from flask import g, jsonify


def admin_required(view):
    @functools.wraps(view)
    def wrapped(*args, **kwargs):
        user = getattr(g, "current_user", None)
        if user is None or not user.is_admin:
            return jsonify({"error": "admin_required"}), 403
        return view(*args, **kwargs)
    return wrapped