# Quiter — Identity-Based Habit Transformation Platform

Production architecture for Quiter: structured 7/15/30-day identity plans,
anonymous accountability squads, and a live WebGL "Glass Flower" reward
system, on a Flask + PostgreSQL backend and a pure Vanilla JS frontend.

## Directory structure

```
quiter/
├── backend/
│   ├── app/
│   │   ├── __init__.py            # app factory — wires DB, security, blueprints
│   │   ├── models/
│   │   │   └── models.py          # full SQLAlchemy schema (Users, Plans, Squads, ...)
│   │   ├── routes/
│   │   │   ├── auth.py            # register / login / logout, lockout logic
│   │   │   ├── plans.py           # plan catalog, adopt, daily check-in
│   │   │   └── squads.py          # leaderboard, nudges, Relapse Shield
│   │   ├── security/
│   │   │   ├── passwords.py       # Argon2id + HMAC pepper
│   │   │   ├── headers.py         # Flask-Talisman CSP / HSTS config
│   │   │   ├── limiter.py         # Flask-Limiter rate-limit config
│   │   │   └── session_auth.py    # HTTP-only cookie session + CSRF header check
│   │   └── utils/
│   │       └── validation.py      # shared input validators
│   ├── requirements.txt
│   ├── .env.example
│   └── run.py                     # local entrypoint (use gunicorn in prod)
│
└── frontend/
    ├── index.html
    └── assets/
        ├── css/
        │   ├── tokens.css         # design tokens + glassmorphism primitives
        │   └── layout.css         # page layout, bento dashboard, squad ring
        ├── js/
        │   ├── main.js            # boot: Lenis, GSAP, WebGL lifecycle, fetch calls
        │   ├── modules/
        │   │   └── api-client.js  # fetch() wrapper (CSRF header, error normalization)
        │   └── three/
        │       └── flower-scene.js # WebGL Glass Flower scene + bloom reward system
        └── media/
            └── (place glass-flower.mp4 + poster here — see PLACE_VIDEO_HERE.txt)
```

## Getting the backend running

```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
# fill in FLASK_SECRET_KEY, PASSWORD_PEPPER, DATABASE_URL, REDIS_URL

# create the schema
python3 -c "from app import create_app; from app.models.models import db; \
  app = create_app('development'); \
  app.app_context().push(); db.create_all()"

python3 run.py     # dev server on :5000
```

For production, run behind gunicorn + nginx (TLS-terminated), with
`REDIS_URL` pointed at a real Redis instance — see the warning in
`security/limiter.py` about why this matters the moment you run more than
one worker process.

## Serving the frontend

The frontend is static — serve `frontend/` with nginx (or any static host)
and reverse-proxy `/api/v1/*` to the Flask app so both share an origin
(required for the HTTP-only session cookie to work without extra CORS
configuration).

```nginx
location /api/v1/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header X-Forwarded-For $remote_addr;
}
location / {
    root /var/www/quiter/frontend;
    try_files $uri $uri/ /index.html;
}
```

## Security summary (what's actually enforced, and where)

| Control | Where | Detail |
|---|---|---|
| SQL injection | `models/models.py`, every route | 100% SQLAlchemy ORM query API — no string-built SQL anywhere in the codebase |
| Password storage | `security/passwords.py` | Argon2id, tuned to ~200ms/hash, plus an HMAC pepper kept out of the DB |
| Session hijacking / XSS token theft | `security/session_auth.py`, `security/headers.py` | HTTP-only, Secure, SameSite=Lax cookie — never exposed to JS, unlike localStorage JWTs |
| CSRF | `security/session_auth.py` + `assets/js/modules/api-client.js` | SameSite=Lax + custom `X-Quiter-Client` header that cross-site requests cannot forge |
| Brute force / credential stuffing | `security/limiter.py`, `routes/auth.py` | 5 req/min IP-based limit on `/auth/*` **and** a 5-strike, 15-minute per-account lockout |
| IDOR (accessing another user's data) | `routes/plans.py`, `routes/squads.py` | Every query filters by `id` **and** `user_id`/membership together, never `id` alone |
| XSS / injected scripts | `security/headers.py` | Strict CSP — explicit CDN allowlist, `script-src` never includes `'unsafe-inline'` |
| Clickjacking | `security/headers.py` | `frame-ancestors 'none'` |
| Enumeration via sequential IDs | `models/models.py` | UUIDv4 primary keys everywhere, not auto-increment ints |
| WebGL memory leaks | `assets/js/three/flower-scene.js` | Every geometry/material/texture tracked and `.dispose()`d in `destroy()`, called on `pagehide` |

## Design direction

Dark glassmorphism (iOS-style frosted panels) staged in front of the Glass
Flower WebGL centerpiece — every surface is translucent + blurred rather
than flat-filled, so the interface reads as cut from the same material as
the flower itself. Full token rationale is documented inline at the top of
`assets/css/tokens.css`.
