"""
Quiter — Application Factory

Uses the app-factory pattern (create_app) so the application can be
instantiated with different configurations for development, production,
and testing.
"""

import os
import logging

from flask import Flask, jsonify

from app.models.models import db
from app.security.headers import init_security_headers
from app.security.limiter import limiter
from app.routes.auth import auth_bp
from app.routes.plans import plans_bp
from app.routes.squads import squads_bp


def create_app(config_name: str = "production") -> Flask:
    app = Flask(__name__)

    # ------------------------------------------------------------------
    # Core configuration
    # ------------------------------------------------------------------

    app.config["SECRET_KEY"] = os.environ["FLASK_SECRET_KEY"]

    app.config["SQLALCHEMY_DATABASE_URI"] = os.environ["DATABASE_URL"]

    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
        "pool_pre_ping": True,
        "pool_recycle": 280,
    }

    app.config["PERMANENT_SESSION_LIFETIME"] = 60 * 60 * 24 * 14

    # ------------------------------------------------------------------
    # Testing configuration
    # ------------------------------------------------------------------

    if config_name == "testing":
        app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get(
            "TEST_DATABASE_URL",
            "postgresql://localhost/quiter_test",
        )

        app.config["TESTING"] = True

    # ------------------------------------------------------------------
    # Production security checks
    # ------------------------------------------------------------------
    

    if config_name == "production" and app.config["SECRET_KEY"] in (
        None,
        "",
        "dev",
    ):
        raise RuntimeError(
            "FLASK_SECRET_KEY must be a strong, unique value in production."
        )

    if config_name == "production" and "memory://" in os.environ.get("REDIS_URL", "memory://"):
        logging.getLogger("quiter.security").warning(
            "Flask-Limiter is using in-memory storage in production. "
            "Set REDIS_URL so rate limits are shared across all workers."
        )


    # ------------------------------------------------------------------
    # Extensions
    # ------------------------------------------------------------------

    db.init_app(app)

    # Use local in-memory rate-limit storage during development/testing.
    # Production should use Redis so limits are shared between workers.
    if config_name in ("development", "testing"):
        app.config["RATELIMIT_STORAGE_URI"] = "memory://"

    limiter.init_app(app)

    init_security_headers(app, force_https=(config_name == "production"))

    # ------------------------------------------------------------------
    # Blueprints
    # ------------------------------------------------------------------

    app.register_blueprint(auth_bp)
    app.register_blueprint(plans_bp)
    app.register_blueprint(squads_bp)

    # ------------------------------------------------------------------
    # Health check
    # ------------------------------------------------------------------

    def health_response():
        return jsonify({
            "status": "ok",
            "service": "quiter-api",
        }), 200

    # Current endpoint
    app.add_url_rule(
        "/api/health",
        endpoint="health",
        view_func=health_response,
        methods=["GET"],
    )

    # Backwards-compatible versioned endpoint
    app.add_url_rule(
        "/api/v1/health",
        endpoint="health_v1",
        view_func=health_response,
        methods=["GET"],
    )

    # ------------------------------------------------------------------
    # Global error handlers
    # ------------------------------------------------------------------

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({
            "error": "not_found"
        }), 404

    @app.errorhandler(429)
    def rate_limited(e):
        return jsonify({
            "error": "rate_limited",
            "detail": str(e.description),
        }), 429

    @app.errorhandler(500)
    def server_error(e):
        app.logger.exception("Unhandled server error")

        return jsonify({
            "error": "internal_error"
        }), 500

    return app