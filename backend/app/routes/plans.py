"""
Plan routes — /api/v1/plans/*

Handles the identity-based plan catalog (read-only templates) and a user's
live plan instances. Every write is scoped to g.current_user.id so a user
can never mutate another user's plan by guessing a UUID (IDOR protection —
the WHERE clause always includes user_id, enforced at the query layer, not
just "checked after the fact").
"""
from datetime import date

from flask import Blueprint, request, jsonify, g

from app.models.models import db, PlanTemplate, PlanDay, UserPlan, DailyLog, LogStatus, gen_uuid
from app.security.session_auth import login_required
from app.security.limiter import limiter, HABIT_LOG_RATE_LIMIT
from app.utils.validation import validate_uuid_param

plans_bp = Blueprint("plans", __name__, url_prefix="/api/v1/plans")


@plans_bp.route("/templates", methods=["GET"])
@login_required
def list_templates():
    """Browse the identity-plan catalog. Supports ?direction=break|build and
    ?length=7|15|30 filters — both validated against the Enum, so an
    arbitrary query string can never reach raw SQL."""
    direction = request.args.get("direction")
    length = request.args.get("length", type=int)

    query = PlanTemplate.query.filter_by(is_active=True)
    if direction in ("break", "build"):
        query = query.filter_by(direction=direction)
    if length in (7, 15, 30):
        query = query.filter_by(length_days=length)

    templates = query.order_by(PlanTemplate.title).all()
    return jsonify([{
        "id": t.id,
        "slug": t.slug,
        "title": t.title,
        "identity_statement": t.identity_statement,
        "direction": t.direction.value,
        "category": t.category,
        "length_days": t.length_days,
        "description": t.description,
    } for t in templates]), 200


@plans_bp.route("/adopt", methods=["POST"])
@login_required
def adopt_plan():
    """Start a plan. Refuses to double-enroll a user in the same template
    while an active instance already exists."""
    payload = request.get_json(silent=True) or {}
    template_id = payload.get("template_id")

    if not validate_uuid_param(template_id):
        return jsonify({"error": "invalid_template_id"}), 400

    template = db.session.get(PlanTemplate, template_id)
    if template is None or not template.is_active:
        return jsonify({"error": "template_not_found"}), 404

    existing = UserPlan.query.filter_by(
        user_id=g.current_user.id,
        template_id=template_id,
        is_completed=False,
        is_abandoned=False,
    ).first()
    if existing:
        return jsonify({"error": "plan_already_active", "user_plan_id": existing.id}), 409

    user_plan = UserPlan(user_id=g.current_user.id, template_id=template_id, start_date=date.today())
    db.session.add(user_plan)
    db.session.commit()
    return jsonify({"user_plan_id": user_plan.id, "start_date": user_plan.start_date.isoformat()}), 201


@plans_bp.route("/<user_plan_id>/today", methods=["GET"])
@login_required
def get_today(user_plan_id):
    if not validate_uuid_param(user_plan_id):
        return jsonify({"error": "invalid_id"}), 400

    user_plan = UserPlan.query.filter_by(id=user_plan_id, user_id=g.current_user.id).first()
    if user_plan is None:
        return jsonify({"error": "plan_not_found"}), 404

    day_number = (date.today() - user_plan.start_date).days + 1
    day_number = max(1, min(day_number, user_plan.template.length_days))

    plan_day = PlanDay.query.filter_by(template_id=user_plan.template_id, day_number=day_number).first()
    already_logged = DailyLog.query.filter_by(user_plan_id=user_plan.id, log_date=date.today()).first()

    return jsonify({
        "day_number": day_number,
        "total_days": user_plan.template.length_days,
        "micro_goal": plan_day.micro_goal if plan_day else None,
        "identity_cue": plan_day.identity_cue if plan_day else None,
        "reward_tier": plan_day.reward_tier if plan_day else 1,
        "current_streak": user_plan.current_streak,
        "already_logged_today": already_logged is not None,
    }), 200


@plans_bp.route("/<user_plan_id>/checkin", methods=["POST"])
@limiter.limit(HABIT_LOG_RATE_LIMIT)
@login_required
def checkin(user_plan_id):
    """The core loop: mark today complete/missed/relapsed, recompute streak,
    return the reward_tier so the frontend knows which Three.js bloom stage
    to fire. Runs inside a single DB transaction so a crash mid-request
    can never leave the streak counter and the log row out of sync."""
    if not validate_uuid_param(user_plan_id):
        return jsonify({"error": "invalid_id"}), 400

    payload = request.get_json(silent=True) or {}
    status_raw = payload.get("status")
    if status_raw not in [s.value for s in LogStatus]:
        return jsonify({"error": "invalid_status"}), 400

    user_plan = UserPlan.query.filter_by(id=user_plan_id, user_id=g.current_user.id).first()
    if user_plan is None:
        return jsonify({"error": "plan_not_found"}), 404
    if user_plan.is_completed or user_plan.is_abandoned:
        return jsonify({"error": "plan_not_active"}), 409

    today = date.today()
    existing_log = DailyLog.query.filter_by(user_plan_id=user_plan.id, log_date=today).first()
    if existing_log:
        return jsonify({"error": "already_logged_today"}), 409

    day_number = max(1, min((today - user_plan.start_date).days + 1, user_plan.template.length_days))
    plan_day = PlanDay.query.filter_by(template_id=user_plan.template_id, day_number=day_number).first()

    log = DailyLog(
        user_id=g.current_user.id,
        user_plan_id=user_plan.id,
        plan_day_id=plan_day.id,
        log_date=today,
        status=status_raw,
        note=(payload.get("note") or "")[:280] or None,
    )
    db.session.add(log)

    if status_raw == LogStatus.COMPLETED.value:
        user_plan.current_streak += 1
        user_plan.longest_streak = max(user_plan.longest_streak, user_plan.current_streak)
        if day_number >= user_plan.template.length_days:
            user_plan.is_completed = True
    else:
        user_plan.current_streak = 0

    db.session.commit()

    return jsonify({
        "status": status_raw,
        "current_streak": user_plan.current_streak,
        "longest_streak": user_plan.longest_streak,
        "is_completed": user_plan.is_completed,
        "reward_tier": plan_day.reward_tier if (plan_day and status_raw == LogStatus.COMPLETED.value) else 0,
    }), 200


@plans_bp.route("/custom", methods=["POST"])
@login_required
def create_custom_plan():
    """Lets a registered user build their own plan instead of picking from
    the catalog. Deliberately reuses the existing PlanTemplate/PlanDay
    schema rather than adding new tables or columns — it creates a
    template scoped to this moment (is_active=False so it never appears in
    the public /templates browse list), generates one PlanDay per day with
    a micro-goal derived from the user's own goal text, then immediately
    adopts it into a UserPlan, exactly like picking a catalog plan would.
    """
    payload = request.get_json(silent=True) or {}
    goal_text = (payload.get("goal_text") or "").strip()
    direction = payload.get("direction")
    length_days = payload.get("length_days")

    if not (3 <= len(goal_text) <= 160):
        return jsonify({"error": "invalid_goal_text"}), 400
    if direction not in ("break", "build"):
        return jsonify({"error": "invalid_direction"}), 400
    if length_days not in (7, 15, 30):
        return jsonify({"error": "invalid_length_days"}), 400

    template = PlanTemplate(
        slug=f"custom-{gen_uuid()[:8]}",
        title=goal_text[:120],
        identity_statement=f"I am someone who is {('breaking free from' if direction == 'break' else 'building')} {goal_text}.",
        direction=direction,
        category="custom",
        length_days=length_days,
        description="A custom plan built by the user.",
        is_active=False,
    )
    db.session.add(template)
    db.session.flush()

    for day_number in range(1, length_days + 1):
        db.session.add(PlanDay(
            template_id=template.id,
            day_number=day_number,
            micro_goal=f"Day {day_number}: take one small, concrete step toward — {goal_text}.",
            identity_cue=template.identity_statement,
            reward_tier=1,
        ))

    user_plan = UserPlan(user_id=g.current_user.id, template_id=template.id, start_date=date.today())
    db.session.add(user_plan)
    db.session.commit()

    return jsonify({
        "user_plan_id": user_plan.id,
        "template_id": template.id,
        "title": template.title,
        "length_days": length_days,
        "start_date": user_plan.start_date.isoformat(),
    }), 201