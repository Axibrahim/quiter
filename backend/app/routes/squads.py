"""
Squad routes — /api/v1/squads/*

Anonymous accountability groups. API responses NEVER include email or any
PII beyond display_name + avatar_seed — this is enforced by hand-building
each response dict (an explicit allowlist of fields) rather than serializing
the User model directly, so adding a sensitive column to User later can't
accidentally leak it here.
"""
import secrets
import string

from flask import Blueprint, request, jsonify, g

from app.models.models import db, Squad, SquadMember, Nudge, NudgeType
from app.security.session_auth import login_required
from app.utils.validation import validate_uuid_param

squads_bp = Blueprint("squads", __name__, url_prefix="/api/v1/squads")


def _generate_invite_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(8))  # CSPRNG, not random.choice


@squads_bp.route("/<squad_id>/leaderboard", methods=["GET"])
@login_required
def leaderboard(squad_id):
    if not validate_uuid_param(squad_id):
        return jsonify({"error": "invalid_id"}), 400

    # Membership check FIRST — a user must belong to the squad to see its
    # leaderboard at all. This prevents scraping every squad in the system
    # by iterating UUIDs.
    membership = SquadMember.query.filter_by(squad_id=squad_id, user_id=g.current_user.id).first()
    if membership is None:
        return jsonify({"error": "not_a_member"}), 403

    members = (SquadMember.query
               .filter_by(squad_id=squad_id)
               .order_by(SquadMember.consistency_score.desc())
               .limit(20)
               .all())

    return jsonify([{
        "display_name": m.user.display_name,
        "avatar_seed": m.user.avatar_seed,
        "consistency_score": m.consistency_score,
        "role": m.role.value,
        # NOTE: no user_id, no email — anonymity by construction, not policy.
    } for m in members]), 200


@squads_bp.route("/<squad_id>/nudge", methods=["POST"])
@login_required
def send_nudge(squad_id):
    """1-click support signal. recipient_id omitted => broadcast to the
    whole squad's realtime channel (see routes/realtime.py)."""
    if not validate_uuid_param(squad_id):
        return jsonify({"error": "invalid_id"}), 400

    payload = request.get_json(silent=True) or {}
    nudge_type = payload.get("type")
    if nudge_type not in [t.value for t in NudgeType]:
        return jsonify({"error": "invalid_nudge_type"}), 400

    membership = SquadMember.query.filter_by(squad_id=squad_id, user_id=g.current_user.id).first()
    if membership is None:
        return jsonify({"error": "not_a_member"}), 403

    recipient_id = payload.get("recipient_id")
    if recipient_id is not None:
        if not validate_uuid_param(recipient_id):
            return jsonify({"error": "invalid_recipient"}), 400
        recipient_is_member = SquadMember.query.filter_by(squad_id=squad_id, user_id=recipient_id).first()
        if recipient_is_member is None:
            return jsonify({"error": "recipient_not_in_squad"}), 400

    nudge = Nudge(
        squad_id=squad_id,
        sender_id=g.current_user.id,
        recipient_id=recipient_id,
        type=nudge_type,
    )
    db.session.add(nudge)
    db.session.commit()

    # In production this also publishes to the realtime channel (Redis
    # pub/sub -> WebSocket) so squad members see the nudge/Relapse Shield
    # alert appear live without polling. See routes/realtime.py stub below.

    return jsonify({"id": nudge.id, "type": nudge.type.value, "sent_at": nudge.created_at.isoformat()}), 201
