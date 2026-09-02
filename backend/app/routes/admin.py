"""
Admin routes — /api/v1/admin/*

Every route requires BOTH a valid session (login_required) AND the
is_admin flag (admin_required) — a regular logged-in user gets a clean
403, never access to these endpoints.
"""
from flask import Blueprint, request, jsonify

from app.models.models import db, PlanTemplate
from app.security.session_auth import login_required
from app.security.admin_auth import admin_required
from app.utils.validation import validate_uuid_param
from app.utils.supabase_storage import upload_plan_photo, SupabaseStorageError

admin_bp = Blueprint("admin", __name__, url_prefix="/api/v1/admin")

VALID_DIRECTIONS = {"break", "build"}


def _serialize_template(t):
    return {
        "id": t.id,
        "slug": t.slug,
        "title": t.title,
        "identity_statement": t.identity_statement,
        "direction": t.direction.value,
        "category": t.category,
        "length_days": t.length_days,
        "description": t.description,
        "photo_url": t.photo_url,
        "price_cents": t.price_cents,
        "trial_days": t.trial_days,
        "tagline": t.tagline,
        "cta_text": t.cta_text,
        "age_rating": t.age_rating,
        "is_included": t.is_included,
        "is_active": t.is_active,
    }


def _read_template_payload(payload, partial=False):
    fields = {}

    if "title" in payload or not partial:
        title = (payload.get("title") or "").strip()
        if not 3 <= len(title) <= 120:
            return None, "invalid_title"
        fields["title"] = title

    if "slug" in payload or not partial:
        slug = (payload.get("slug") or "").strip().lower()
        if not slug or len(slug) > 80 or not all(c.isalnum() or c == "-" for c in slug):
            return None, "invalid_slug"
        fields["slug"] = slug

    if "identity_statement" in payload or not partial:
        identity = (payload.get("identity_statement") or "").strip()
        if not 3 <= len(identity) <= 160:
            return None, "invalid_identity_statement"
        fields["identity_statement"] = identity

    if "direction" in payload or not partial:
        direction = payload.get("direction")
        if direction not in VALID_DIRECTIONS:
            return None, "invalid_direction"
        fields["direction"] = direction

    if "category" in payload or not partial:
        category = (payload.get("category") or "").strip()
        if not 1 <= len(category) <= 60:
            return None, "invalid_category"
        fields["category"] = category

    if "length_days" in payload or not partial:
        length_days = payload.get("length_days")
        if not isinstance(length_days, int) or isinstance(length_days, bool) or not 3 <= length_days <= 365:
            return None, "invalid_length_days"
        fields["length_days"] = length_days

    if "description" in payload:
        description = payload.get("description")
        if description is not None and not isinstance(description, str):
            return None, "invalid_description"
        fields["description"] = (description or "").strip()[:2000] or None

    if "photo_url" in payload:
        photo_url = payload.get("photo_url")
        if photo_url is not None:
            if not isinstance(photo_url, str) or len(photo_url) > 500:
                return None, "invalid_photo_url"
            photo_url = photo_url.strip() or None
        fields["photo_url"] = photo_url

    if "price_cents" in payload:
        price_cents = payload.get("price_cents")
        if price_cents is not None:
            if not isinstance(price_cents, int) or isinstance(price_cents, bool) or price_cents < 0:
                return None, "invalid_price_cents"
        fields["price_cents"] = price_cents

    if "trial_days" in payload:
        trial_days = payload.get("trial_days")
        if trial_days is not None:
            if not isinstance(trial_days, int) or isinstance(trial_days, bool) or not 0 <= trial_days <= 90:
                return None, "invalid_trial_days"
        fields["trial_days"] = trial_days

    if "tagline" in payload:
        tagline = payload.get("tagline")
        if tagline is not None:
            if not isinstance(tagline, str) or len(tagline) > 120:
                return None, "invalid_tagline"
            tagline = tagline.strip() or None
        fields["tagline"] = tagline

    if "cta_text" in payload:
        cta_text = payload.get("cta_text")
        if cta_text is not None:
            if not isinstance(cta_text, str) or len(cta_text) > 40:
                return None, "invalid_cta_text"
            cta_text = cta_text.strip() or None
        fields["cta_text"] = cta_text

    if "age_rating" in payload:
        age_rating = payload.get("age_rating")
        if age_rating is not None:
            if not isinstance(age_rating, str) or len(age_rating) > 10:
                return None, "invalid_age_rating"
            age_rating = age_rating.strip() or None
        fields["age_rating"] = age_rating

    if "is_included" in payload:
        is_included = payload.get("is_included")
        if not isinstance(is_included, bool):
            return None, "invalid_is_included"
        fields["is_included"] = is_included

    if "is_active" in payload:
        is_active = payload.get("is_active")
        if not isinstance(is_active, bool):
            return None, "invalid_is_active"
        fields["is_active"] = is_active

    return fields, None


@admin_bp.route("/templates", methods=["GET"])
@login_required
@admin_required
def list_all_templates():
    """Unlike the public /plans/templates route, this returns every
    template regardless of is_active, so admins can see drafts too."""
    templates = PlanTemplate.query.order_by(PlanTemplate.created_at.desc()).all()
    return jsonify([_serialize_template(t) for t in templates]), 200


@admin_bp.route("/templates", methods=["POST"])
@login_required
@admin_required
def create_template():
    payload = request.get_json(silent=True) or {}
    fields, error = _read_template_payload(payload, partial=False)
    if error:
        return jsonify({"error": error}), 400

    if PlanTemplate.query.filter_by(slug=fields["slug"]).first():
        return jsonify({"error": "slug_already_exists"}), 409

    template = PlanTemplate(**fields)
    db.session.add(template)
    db.session.commit()
    return jsonify(_serialize_template(template)), 201


@admin_bp.route("/templates/<template_id>", methods=["PATCH"])
@login_required
@admin_required
def update_template(template_id):
    if not validate_uuid_param(template_id):
        return jsonify({"error": "invalid_id"}), 400

    template = db.session.get(PlanTemplate, template_id)
    if template is None:
        return jsonify({"error": "template_not_found"}), 404

    payload = request.get_json(silent=True) or {}
    fields, error = _read_template_payload(payload, partial=True)
    if error:
        return jsonify({"error": error}), 400

    if "slug" in fields and fields["slug"] != template.slug:
        if PlanTemplate.query.filter_by(slug=fields["slug"]).first():
            return jsonify({"error": "slug_already_exists"}), 409

    for key, value in fields.items():
        setattr(template, key, value)

    db.session.commit()
    return jsonify(_serialize_template(template)), 200


@admin_bp.route("/templates/<template_id>", methods=["DELETE"])
@login_required
@admin_required
def delete_template(template_id):
    """Soft-delete: flips is_active off rather than removing the row,
    since UserPlan rows may still reference this template's history."""
    if not validate_uuid_param(template_id):
        return jsonify({"error": "invalid_id"}), 400

    template = db.session.get(PlanTemplate, template_id)
    if template is None:
        return jsonify({"error": "template_not_found"}), 404

    template.is_active = False
    db.session.commit()
    return jsonify({"ok": True}), 200


@admin_bp.route("/upload-photo", methods=["POST"])
@login_required
@admin_required
def upload_photo():
    file = request.files.get("photo")
    if file is None:
        return jsonify({"error": "no_file"}), 400

    try:
        url = upload_plan_photo(file.read(), file.mimetype)
    except SupabaseStorageError as e:
        return jsonify({"error": str(e)}), 400

    return jsonify({"photo_url": url}), 200