
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The AI agent is the sole driver: no keyboard movement bindings may
// exist anywhere in gameplay code. Static guard over the sources.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mazeScene = readFileSync(
  join(root, "components/maze/MazeScene.tsx"),
  "utf8"
);
const gamelogic = readFileSync(
  join(root, "src/lib/gamelogic.ts"),
  "utf8"
);

for (const [name, source] of [
  ["MazeScene.tsx", mazeScene],
  ["gamelogic.ts", gamelogic],
] as const) {
  assert.doesNotMatch(source, /keydown/i, `${name}: no key listener`);
  assert.doesNotMatch(source, /MOVEMENT_KEYS/, `${name}: no key map`);
  assert.doesNotMatch(source, /arrowup|arrowdown/i, `${name}: no arrows`);
}

// The agent path itself must stay intact.
assert.match(mazeScene, /attemptMove/, "shared move path present");
assert.match(mazeScene, /executePlan/, "plan executor present");
assert.match(gamelogic, /moveRobot/, "movement rules present");
assert.match(gamelogic, /checkGameStatus/, "status checks present");

console.log("Control mapping checks passed!");
