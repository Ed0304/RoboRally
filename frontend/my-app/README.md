# RoboRally frontend

Next.js + React Three Fiber 3D game client. See the repository root README for the full product overview.

## Run

```powershell
npm install
npm run dev   # http://localhost:3000 (expects the backend on :8000)
```

Set `NEXT_PUBLIC_API_URL` in `frontend/my-app/.env` if the backend runs elsewhere. `MONGODB_URI`/`MONGODB_DB` in that file are used only by `scripts/seed-levels.ts`, never by the browser.

## Checks

```powershell
npx tsc --noEmit
npx tsx scripts/check-mazes.ts
npx tsx scripts/check-execution.ts
npx tsx scripts/check-progression.ts
npx tsx scripts/check-controls.ts
npx tsx scripts/check-account-isolation.ts
npx next build --webpack
```
