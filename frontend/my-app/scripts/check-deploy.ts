import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Deployment wiring: same-origin /api proxy, relative API base, and no
// hard-coded localhost backends in production-facing code. Browser and
// live-server behavior still needs the manual deployment checklist.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) =>
  readFileSync(join(root, path), "utf8");

const nextConfig = read("next.config.ts");
const api = read("src/lib/api.ts");
const gamePage = read("src/app/game/level/[id]/page.tsx");
const backendMain = readFileSync(
  join(root, "..", "..", "backend", "main.py"),
  "utf8"
);
const backendEnvExample = readFileSync(
  join(root, "..", "..", "backend", ".env.example"),
  "utf8"
);

// --- Same-origin proxy: /api/* forwards to the backend ---
assert.match(
  nextConfig,
  /source: "\/api\/:path\*"/,
  "rewrite captures /api/* without colliding with app routes"
);
assert.match(
  nextConfig,
  /BACKEND_INTERNAL_URL/,
  "rewrite target comes from a server-side variable"
);
assert.doesNotMatch(
  nextConfig,
  /NEXT_PUBLIC_/,
  "proxy target is never baked into client JavaScript"
);

// --- One relative API base shared by every caller ---
assert.match(
  api,
  /export const API_URL =\s+process\.env\.NEXT_PUBLIC_API_URL \?\? "";/,
  "API calls default to same-origin relative URLs"
);
assert.match(
  gamePage,
  /import \{ API_URL \} from "@\/lib\/api";/,
  "game page reuses the shared API base"
);
assert.doesNotMatch(
  gamePage,
  /const API_URL/,
  "game page keeps no divergent API base"
);
for (const [name, source] of [
  ["api.ts", api],
  ["game page", gamePage],
] as const) {
  assert.doesNotMatch(
    source,
    /localhost:8000/,
    `${name} carries no hard-coded localhost backend`
  );
}

// --- Backend CORS stays explicit and credential-safe ---
assert.match(
  backendMain,
  /FRONTEND_ORIGINS/,
  "CORS origins come from the environment"
);
assert.doesNotMatch(
  backendMain,
  /allow_origins=\["\*"\]/,
  "credentialed CORS never allows every origin"
);
assert.match(
  backendEnvExample,
  /FRONTEND_ORIGINS=/,
  ".env.example documents the CORS variable"
);

console.log("Deploy wiring checks passed!");
