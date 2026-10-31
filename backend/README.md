# RoboRally backend

FastAPI service for authentication, level data, AI mission planning, and user progress. MongoDB (`roborally` database) persists `users` and `levels`.

## Run

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env   # fill in real values, see below
.\.venv\Scripts\python.exe main.py
```

## Environment (`backend/.env`, never committed)

- `MONGODB_URI`, `MONGODB_DATABASE`
- `SESSION_SECRET`, `SESSION_COOKIE_SECURE`
- `MODEL_API_KEY` — Meta Model API key (`META_API_KEY` accepted as a legacy alias)

## API overview

- `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`
- `GET /api/levels/{id}` — level layout from MongoDB
- `POST /api/agent/plan` — mission → validated action plan (Muse Spark)
- `GET /api/agent/health` — planner readiness (no model call)
- `GET /api/users/me`, `POST /api/users/me/completed-levels`, `POST /api/users/me/prompt-history`

## Tests

```powershell
.\.venv\Scripts\python.exe -m pytest tests -q
```

The suite stubs the model client and database; no live services required.
