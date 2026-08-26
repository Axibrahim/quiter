"""
One-time seed script — creates the three catalog PlanTemplates shown on
the landing page (Becoming Smoke-Free, Becoming Sober, Becoming an
Athlete) plus their PlanDay rows, so the public /templates browse
endpoint and "Choose this plan" buttons have real rows to adopt.

Run once after db.create_all():

    python3 -c "from dotenv import load_dotenv; load_dotenv(); from seed_templates import run; run()"

Safe to re-run — skips any template whose slug already exists rather than
creating duplicates.
"""
from app import create_app
from app.models.models import db, PlanTemplate, PlanDay

TEMPLATES = [
    {
        "slug": "smoke-free",
        "title": "Becoming Smoke-Free",
        "identity_statement": "I am someone whose lungs are their own again.",
        "direction": "break",
        "category": "smoking",
        "length_days": 30,
        "description": "A 30-day plan to break the cigarette habit down into small, winnable daily moments.",
        "day_template": "Delay your next urge to smoke by {n} minutes today.",
        "cue": "Smoke-free people ride the urge out — they don't negotiate with it.",
    },
    {
        "slug": "sober",
        "title": "Becoming Sober",
        "identity_statement": "I am someone who doesn't need it to feel okay.",
        "direction": "break",
        "category": "alcohol",
        "length_days": 30,
        "description": "A 30-day plan rebuilding your relationship with a hard day, without a drink.",
        "day_template": "Name one moment today you'd normally reach for a drink — and don't.",
        "cue": "Not white-knuckling — rebuilding, one honest day at a time.",
    },
    {
        "slug": "athlete",
        "title": "Becoming an Athlete",
        "identity_statement": "I am someone who moves every day, no matter what.",
        "direction": "build",
        "category": "fitness",
        "length_days": 15,
        "description": "A 15-day plan to make movement a non-negotiable part of your identity.",
        "day_template": "Move your body for at least {n} minutes today — walk, stretch, lift, anything counts.",
        "cue": "Athletes don't wait to feel like it. They just move.",
    },
]


def run():
    app = create_app("development")
    with app.app_context():
        for spec in TEMPLATES:
            existing = PlanTemplate.query.filter_by(slug=spec["slug"]).first()
            if existing:
                print(f"skip (already exists): {spec['slug']}")
                continue

            template = PlanTemplate(
                slug=spec["slug"],
                title=spec["title"],
                identity_statement=spec["identity_statement"],
                direction=spec["direction"],
                category=spec["category"],
                length_days=spec["length_days"],
                description=spec["description"],
                is_active=True,
            )
            db.session.add(template)
            db.session.flush()  # assigns template.id before we reference it below

            for day_number in range(1, spec["length_days"] + 1):
                minutes = min(5 + day_number, 30)  # gently ramps difficulty, caps at 30
                db.session.add(PlanDay(
                    template_id=template.id,
                    day_number=day_number,
                    micro_goal=spec["day_template"].format(n=minutes),
                    identity_cue=spec["cue"],
                    reward_tier=1 if day_number % 7 else 2,  # small extra bloom every 7th day
                ))

            db.session.commit()
            print(f"created: {spec['slug']} ({spec['length_days']} days)")


if __name__ == "__main__":
    run()
