# RoboRally: The Factory Rescue

**An AI-agent-powered 3D maze game built for the Meta Global AI Developer Hackathon.**

Guide a robot through a factory maze by giving natural-language missions to an AI agent. The agent plans a sequence of moves with Meta's Muse Spark model, the game engine validates every move against walls, lasers, doors, and patrolling enemies, and the robot executes valid plans step by step in a 3D factory environment. There are no manual controls: the AI agent is the sole driver of the robot.

## The agentic loop

1. **Mission** - the player types a goal ("Reach the exit without touching lasers").
2. **Plan** - Muse Spark returns structured moves in bounded segments (<=12 per call).
3. **Validate** - the backend simulates each move against the authoritative level layout.
4. **Execute** - approved moves play out through the real game engine, one step at a time.
5. **Observe and replan** - execution stops honestly on death, victory, or state changes; the player requests a fresh plan from the new state.

The game engine is authoritative: victory requires the robot to actually reach the exit tile. The AI never declares success and can never bypass collision, hazards, doors, or enemy detection.

## Tech stack

- Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS, Three.js via React Three Fiber + Drei.
- Backend: FastAPI (Python) with Pydantic validation.
- Database: MongoDB Atlas (`roborally`: `users`, `levels` collections).
- AI: Muse Spark 1.3 through the Meta Model API (`https://api.meta.ai/v1`, OpenAI-SDK compatible) with constrained JSON structured output.

## Project structure

```text
backend/
  main.py                 # FastAPI app (routers, CORS)
  ai_engine/              # Meta client, planner, rules mirror, agent API
  game_logic/levels.py    # GET /api/levels/{id}
  authentication/         # Session-cookie register/login/logout/me
  users/                  # Profile, completed_levels, prompt_history API
  community/              # Player-made levels, attempts, rankings
  leaderboard/            # Story run submissions and rankings
  tests/                  # pytest suite (no live services required)
  requirements.txt
frontend/my-app/
  src/app/                # Routes: landing, auth, start, game/level/[id],
                          # profile, learn/*, community/*
  src/lib/                # Game engine (maze, movement, enemies, validation)
  components/maze/        # 3D scene, robot, mission panel, executor
  data/levels.ts          # Level definitions (seed source)
  scripts/                # 17 check-*.ts guards (see Checks), seed-levels
```

## Setup

Prerequisites: Python 3.10+, Node.js 20+, plus:

- A MongoDB database: a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster (create a cluster -> add a database user -> allow your IP under Network Access -> copy the connection string), or a local MongoDB (`mongodb://localhost:27017`).
- A Meta Model API key from the [Meta developer dashboard](https://dev.meta.ai/products/meta-model-api) (one-click key creation; hackathon participants receive API credits).

The backend and frontend run as two processes: start the backend first, keep that terminal running, and open a second terminal for the frontend.

Backend (from `backend/`):

```powershell
cd backend
python -m venv .venv   # every fresh clone must create this; it is not committed
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env   # then fill in real values (see below)
.\.venv\Scripts\python.exe main.py   # serves http://localhost:8000
```

macOS/Linux equivalent:

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env   # then fill in real values (see below)
.venv/bin/python main.py   # serves http://localhost:8000
```

Required backend variables (`backend/.env`, never committed; the backend reads this file automatically, restart it after editing):

- `MONGODB_URI` - Atlas connection string (paste your password over `<password>`), or `mongodb://localhost:27017` for local MongoDB
- `MONGODB_DATABASE=roborally`
- `SESSION_SECRET` - any long random string, e.g. `python -c "import secrets; print(secrets.token_urlsafe(32))"`
- `SESSION_COOKIE_SECURE=false` - must be `false` for local `http://localhost` (browsers reject `Secure` cookies over plain HTTP, so logins silently break if this is `true`); `true` in production
- `MODEL_API_KEY` - Meta Model API key (legacy `META_API_KEY` still accepted)

Frontend (second terminal, from `frontend/my-app`):

```powershell
cd frontend/my-app
Copy-Item .env.example .env   # then fill in MONGODB_URI (see below)
npm install
npm run dev   # http://localhost:3000, expects the backend on :8000
```

Frontend variables (`frontend/my-app/.env`, never committed):

- Leave `NEXT_PUBLIC_API_URL` empty for local dev (same-origin via the `/api` proxy; absolute backend origin only without the proxy - rebuild after any change)
- `MONGODB_URI` - the same connection string as the backend, plus `MONGODB_DB=roborally`. Used only by the seed script below, never by the browser.

Seed the six levels once (from `frontend/my-app`, after `npm install` and setting `MONGODB_URI` above; dev-only script, writes directly to MongoDB):

```powershell
npx tsx scripts/seed-levels.ts   # idempotent upsert; prints "Seeded 6 levels."
```

Verify: open <http://localhost:3000>, register an account, and open Tutorial -> Level 1. `GET http://localhost:8000/api/agent/health` should report `meta_configured: true` once `MODEL_API_KEY` is set.

### Troubleshooting

- No `.venv` / `pip` errors -> every fresh clone must run `python -m venv .venv` first; the virtualenv is gitignored, not committed.
- `Missing required backend configuration: ...` -> that variable is empty in `backend/.env`.
- Login succeeds but you are logged out on refresh -> `SESSION_COOKIE_SECURE` must be `false` on local HTTP.
- `ServerSelectionTimeout` or seed-script connection errors -> wrong password in `MONGODB_URI`, or your IP is not allowlisted in Atlas Network Access.
- Seed fails with `Cannot find module` -> run `npm install` in `frontend/my-app` first, and run the seed from that directory.
- Port already in use (`:8000` / `:3000`) -> stop the other process; the backend must stay running while you use the frontend.
- `meta_configured: false` -> `MODEL_API_KEY` is missing in `backend/.env`; restart the backend after editing it.

## Checks

```powershell
# backend (from backend/)
.\.venv\Scripts\python.exe -m pytest tests -q
# frontend (from frontend/my-app/)
npx tsc --noEmit
npx tsx scripts/check-mazes.ts
npx tsx scripts/check-execution.ts
npx tsx scripts/check-progression.ts
npx tsx scripts/check-controls.ts
npx tsx scripts/check-account-isolation.ts
npx tsx scripts/check-algorithms.ts
npx tsx scripts/check-autoexec.ts
npx tsx scripts/check-battery.ts
npx tsx scripts/check-community.ts
npx tsx scripts/check-deploy.ts
npx tsx scripts/check-guidance.ts
npx tsx scripts/check-learn.ts
npx tsx scripts/check-pathfinding.ts
npx tsx scripts/check-replay.ts
npx tsx scripts/check-story-levels.ts
npx tsx scripts/check-story-results.ts
npx tsx scripts/check-tutorials.ts
npm run build
```

The pytest suite and all `tsx` checks run without live credentials or network access.

## Deploy

Architecture: browsers talk only to the Next.js server, which proxies
`/api/*` to the backend (see `rewrites` in
`frontend/my-app/next.config.ts`). Same-origin requests keep the
`SameSite=Lax` session cookie working with no browser CORS preflights;
`FRONTEND_ORIGINS` on the backend covers direct API use and stays
explicit (never `*` with credentials).

Backend (`uvicorn main:app --host 0.0.0.0 --port $PORT --proxy-headers`,
behind your host's proxy; enable proxy headers only from that proxy):

- `MONGODB_URI` (server) - Atlas connection string
- `MONGODB_DATABASE` (server, default `roborally`)
- `SESSION_SECRET` (server) - long random string, e.g. `python -c
  "import secrets; print(secrets.token_urlsafe(32))"`
- `SESSION_COOKIE_SECURE=true` (server)
- `MODEL_API_KEY` (server) - Meta Model API key
- `FRONTEND_ORIGINS` (server) - exact prod frontend origin(s),
  comma-separated; the localhost default is dev-only

Frontend (build time vs runtime):

- `NEXT_PUBLIC_API_URL` (public, build-time) - leave unset/empty for the
  same-origin proxy; absolute backend origin only without the proxy.
  Rebuild after any change: values bake into the client bundle.
- `BACKEND_INTERNAL_URL` (server-side, build-time) - backend origin for the
  `/api` rewrite (default `http://localhost:8000`). Rebuild to change it.
- `MONGODB_URI` / `MONGODB_DB` (server-side) - seed script only, never
  served to browsers.

Order: configure env -> `npm run build` -> start backend -> start frontend
(`npm run start`) -> seed levels once -> verify below.

Seed (manual; needs database credentials, never commit them):

```powershell
$env:MONGODB_URI = "<atlas-uri>"
$env:MONGODB_DB = "roborally"
npx tsx scripts/seed-levels.ts   # from frontend/my-app; idempotent upsert
```

Verify: open `GET /api/levels/1` (through the frontend origin) and
confirm level 1 JSON; log in, request a plan, refresh (session
persists), log out; check `GET /api/agent/health` reports
`meta_configured: true`.

## Demo in 3 minutes

1. Register, open Tutorial -> Level 1, and show the live factory: patrolling enemies, lasers, and the exit goal.
2. Type "Reach the exit." and request a plan: show the approved steps, model ID, and any rejections.
3. Watch the robot auto-execute the validated moves; show Stop, then a blocked/replan moment on a harder level.
4. Open the profile page: completed levels and prompt history persisted to your account.

## Hackathon alignment

Built for the Meta Global AI Developer Hackathon across both themes: **Push the Frontier** (an agent that plans and controls a machine in a simulated physical system) and **Build for Your World** (natural-language robot control instead of hand-programmed movement). It uses Muse Spark through the Meta Model API with structured output, and was built with Muse Code assistance.

---

*Built for the Meta Global AI Developer Hackathon. Created by Edbert Taidy (All Rights Reserved)*
