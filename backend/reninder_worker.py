"""
Quiter reminder worker.

Run this as a separate Railway service:

    cd backend && python reminder_worker.py

The worker is intentionally separate from Flask so email scheduling does not
depend on web-request traffic.
"""

import logging
import os
import time
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy.exc import IntegrityError

from app import create_app
from app.models.models import (
    db,
    ReminderDelivery,
    User,
    UserPlan,
)
from app.security.email import send_goal_reminder_email


logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

logger = logging.getLogger("quiter.reminders")

POLL_SECONDS = max(
    15,
    int(os.environ.get("REMINDER_POLL_SECONDS", "60")),
)


def _time_to_minutes(value: str) -> int:
    return int(value[:2]) * 60 + int(value[3:])


def _is_due(reminder_time: str, local_now: datetime) -> bool:
    return _time_to_minutes(reminder_time) == (
        local_now.hour * 60 + local_now.minute
    )


def _claim_delivery(
    user_plan_id: str,
    reminder_date: date,
    reminder_time: str,
) -> bool:
    """
    Claim a reminder atomically.

    If another worker already claimed this exact reminder, PostgreSQL rejects
    the unique constraint and this worker skips it.
    """
    delivery = ReminderDelivery(
        user_plan_id=user_plan_id,
        reminder_date=reminder_date,
        reminder_time=reminder_time,
    )

    try:
        db.session.add(delivery)
        db.session.commit()
        return True
    except IntegrityError:
        db.session.rollback()
        return False


def _remove_failed_claim(delivery_date, user_plan_id, reminder_time):
    delivery = ReminderDelivery.query.filter_by(
        user_plan_id=user_plan_id,
        reminder_date=delivery_date,
        reminder_time=reminder_time,
    ).first()

    if delivery:
        db.session.delete(delivery)
        db.session.commit()


def process_due_reminders():
    now_utc = datetime.now(timezone.utc)

    plans = (
        UserPlan.query
        .join(User, User.id == UserPlan.user_id)
        .filter(
            UserPlan.is_completed.is_(False),
            UserPlan.is_abandoned.is_(False),
            UserPlan.reminders_enabled.is_(True),
            User.is_active.is_(True),
        )
        .all()
    )

    sent_count = 0

    for plan in plans:
        if not plan.user or not plan.user.email:
            continue

        try:
            local_now = now_utc.astimezone(
                ZoneInfo(plan.reminder_timezone or "UTC")
            )
        except Exception:
            logger.warning(
                "Invalid timezone for plan %s; using UTC",
                plan.id,
            )
            local_now = now_utc

        local_date = local_now.date()

        for reminder_time in plan.reminder_times or []:
            if not isinstance(reminder_time, str):
                continue

            if not _is_due(reminder_time, local_now):
                continue

            if not _claim_delivery(
                plan.id,
                local_date,
                reminder_time,
            ):
                continue

            day_number = max(
                1,
                min(
                    (local_date - plan.start_date).days + 1,
                    plan.template.length_days,
                ),
            )

            goal_text = plan.goal_text or plan.template.title

            sent = send_goal_reminder_email(
                email=plan.user.email,
                display_name=plan.user.display_name,
                goal_text=goal_text,
                day_number=day_number,
                total_days=plan.template.length_days,
                support_style=plan.support_style or "gentle",
            )

            if sent:
                sent_count += 1
                logger.info(
                    "Sent reminder for plan %s at %s",
                    plan.id,
                    reminder_time,
                )
            else:
                # Allow another attempt later if Resend is temporarily down.
                _remove_failed_claim(
                    local_date,
                    plan.id,
                    reminder_time,
                )

    db.session.remove()
    return sent_count


def main():
    app = create_app("production")

    with app.app_context():
        logger.info(
            "Quiter reminder worker started; polling every %ss",
            POLL_SECONDS,
        )

        while True:
            try:
                process_due_reminders()
            except Exception:
                db.session.rollback()
                db.session.remove()
                logger.exception("Reminder cycle failed")

            time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()