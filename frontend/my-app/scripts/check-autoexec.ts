
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXEC_STEP_DELAY_MS,
  IDLE_EXECUTION,
  PAUSE_POLL_MS,
  coachForBlocked,
  coachForDepleted,
  coachForMove,
  coachForOutcome,
} from "@/lib/execution";

// Static + unit guards for automatic execution and tutorial coaching.
// Browser-only behavior (animation smoothness, pause timing, unmount
// cancellation) still needs manual verification; everything below is
// what can be proven without a browser.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mazeScene = readFileSync(
  join(root, "components/maze/MazeScene.tsx"),
  "utf8"
);
const missionPanel = readFileSync(
  join(root, "components/maze/MissionPanel.tsx"),
  "utf8"
);
const robot = readFileSync(
  join(root, "components/maze/Robot.tsx"),
  "utf8"
);
const levelPage = readFileSync(
  join(root, "src/app/game/level/[id]/page.tsx"),
  "utf8"
);

// --- Execution state: pause flag, step pacing unchanged ---
assert.equal(IDLE_EXECUTION.running, false);
assert.equal(IDLE_EXECUTION.paused, false);
assert.equal(EXEC_STEP_DELAY_MS, 450);
assert.ok(PAUSE_POLL_MS > 0, "pause poll interval is positive");

// --- Coach lines: exact text from observed step data only ---
assert.equal(
  coachForMove("east", 1, 99, "floor"),
  "Moved east · −1% battery · 99% left."
);
assert.equal(
  coachForMove("south", 3, 97, "rough"),
  "Moved south onto rough terrain · −3% battery · 97% left."
);
assert.equal(
  coachForMove("west", 5, 90, "drain"),
  "Moved west onto drain terrain · −5% battery · 90% left."
);
assert.equal(
  coachForMove("north", 1, 42, "exit"),
  "Moved north · −1% battery · 42% left."
);
assert.equal(
  coachForMove("north", 2, 40, "mystery"),
  "Moved north · −2% battery · 40% left."
);
assert.match(coachForBlocked(), /blocked/);
assert.match(coachForBlocked(), /stayed put/);
assert.match(coachForDepleted(), /Battery too low/);
assert.match(coachForOutcome("won"), /Mission complete/);
assert.match(coachForOutcome("won"), /exit/);
assert.match(coachForOutcome("dead"), /destroyed/);
assert.doesNotMatch(
  coachForOutcome("dead"),
  /laser/,
  "death line claims no unverified cause"
);

// --- Auto-start wiring: plan success calls the executor directly ---
assert.match(
  missionPanel,
  /if \(response\.actions\.length > 0\) \{\s*onExecute\(response\.actions\);?\s*\}/,
  "validated non-empty plans auto-start"
);
assert.doesNotMatch(
  missionPanel,
  /review it before executing/,
  "stale confirm-before-execute wording removed"
);
assert.doesNotMatch(
  missionPanel,
  /Execute Plan/,
  "no manual re-execute button: plans auto-start once, stale re-runs impossible"
);
assert.doesNotMatch(
  missionPanel,
  /canStartExecution/,
  "no manual execute gate remains"
);

// --- Pause / resume controls exist and are wired ---
assert.match(missionPanel, /Pause execution/);
assert.match(missionPanel, /Resume execution/);
assert.match(missionPanel, /onPause/);
assert.match(missionPanel, /onResume/);
assert.match(mazeScene, /execPausedRef/);
assert.match(mazeScene, /pauseExecution/);
assert.match(mazeScene, /resumeExecution/);
assert.match(
  mazeScene,
  /while \(execPausedRef\.current && !execCancelRef\.current\)/,
  "stepper holds at step boundaries while paused"
);

// --- No overlapping steppers: busy-wait instead of silent drop ---
assert.match(
  mazeScene,
  /An execution is still stopping/,
  "busy execution surfaces a message instead of dropping the plan"
);

// --- Preview UI fully removed from gameplay ---
for (const banned of [
  "Preview Route",
  "Clear Preview",
  "showRoutePreview",
  "clearRoutePreview",
  "setPreview",
  "Planning algorithm",
  "showPreview",
  "preview?.cells",
  "batteryLabels",
]) {
  assert.doesNotMatch(
    mazeScene,
    new RegExp(banned.replace(/[?.]/g, "\\$&")),
    `MazeScene has no ${banned}`
  );
}
assert.doesNotMatch(
  levelPage,
  /showPreview/,
  "level page uses the renamed tutorialMode prop"
);
assert.match(levelPage, /tutorialMode=\{level\.type === "Tutorial"\}/);

// --- Tutorial coaching replaces the preview line ---
assert.match(mazeScene, /tutorialMode && coach/);
assert.match(mazeScene, /coachForMove/);
assert.match(mazeScene, /coachForBlocked/);
assert.match(mazeScene, /coachForOutcome/);
assert.match(mazeScene, /coachForDepleted/);
assert.match(mazeScene, /setCoach\(null\)/, "restart clears the coach line");

// --- Robot movement stays smoothed (damped), never teleported ---
assert.match(robot, /damp/, "robot position eases toward each tile");

// --- Unmount/restart cancellation flags still present ---
assert.match(
  mazeScene,
  /execCancelRef\.current = true/,
  "cancel flag set on stop/restart/unmount paths"
);

console.log("Auto-execution checks passed!");
