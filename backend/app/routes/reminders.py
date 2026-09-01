"""
Internal cron-triggered endpoint that sends daily reminder emails.

Not part of the public API — protected by a shared secret header, meant to
be called by an external scheduler (Railway Cron Job, GitHub Actions
scheduled workflow, etc.) roughly once per hour. Flask itself has no
built-in scheduler, so something outside the app process has to trigger
this on a timer.

LIMITATION: reminder_time is matched against the current UTC hour, with no
per-user timezone stored yet. Good enough for a v1; if you want reminders
to actually land at "9am for the user", add a timezone column to UserPlan
and adjust the hour comparison accordingly.
"""
import os
from datetime import datetime

from flask import Blueprint, request, jsonify

from app.models.models import db, UserPlan

reminders_bp = Blueprint("reminders", __name__, url_prefix="/api/v1/internal/reminders")


@reminders_bp.route("/run", methods=["POST"])
def run_reminders():
    secret = request.headers.get("X-Internal-Secret", "")
    expected = os.environ.get("INTERNAL_CRON_SECRET", "")
    if not expected or secret != expected:
        return jsonify({"error": "unauthorized"}), 401

    from app.security.email import send_reminder_email

    now_utc = datetime.utcnow()
    current_hour = now_utc.hour
    today = now_utc.date()
    is_weekend = now_utc.weekday() >= 5  # 5=Saturday, 6=Sunday

    candidates = UserPlan.query.filter(
        UserPlan.reminder_enabled.is_(True),
        UserPlan.is_completed.is_(False),
        UserPlan.is_abandoned.is_(False),
    ).all()

    sent = 0
    for up in candidates:
        if up.reminder_time is None or up.reminder_time.hour != current_hour:
            continue
        if up.reminder_days == "weekdays" and is_weekend:
            continue
        if up.last_reminded_date == today:
            continue

        send_reminder_email(
            email=up.user.email,
            display_name=up.user.display_name,
            goal_title=up.template.title,
            identity_statement=up.template.identity_statement,
            personal_note=up.personal_note,
        )
        up.last_reminded_date = today
        sent += 1

    db.session.commit()
    return jsonify({"sent": sent}), 200