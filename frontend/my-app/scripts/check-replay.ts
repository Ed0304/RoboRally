
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { levels } from "../data/levels";
import { costsForMaze } from "@/lib/battery";
import { benchmarkLevel } from "@/lib/benchmarks";
import { buildMaze } from "@/lib/maze";
import type { RouteCell } from "@/lib/pathfinding";
import {
  EXPLORED_STEP_MS,
  REPLAY_STEP_MS,
  STRATEGY_LABEL,
  replayCells,
  replayRoutes,
} from "@/lib/replay";

// Post-win what-if replay: route math plus source guards. Browser-only
// behavior (marker animation smoothness) still needs manual verification.

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mazeScene = readFileSync(
  join(root, "components/maze/MazeScene.tsx"),
  "utf8"
);
const mazeTiles = readFileSync(
  join(root, "components/maze/MazeTiles.tsx"),
  "utf8"
);
const replayPanel = readFileSync(
  join(root, "components/maze/ReplayPanel.tsx"),
  "utf8"
);
const replayLib = readFileSync(
  join(root, "src/lib/replay.ts"),
  "utf8"
);

function cells(path: Array<[number, number]>): RouteCell[] {
  return path.map(([x, z]) => ({ x, z }));
}

// --- Trail reveal: head-inclusive, clamped ---
assert.deepEqual(
  [...replayCells(cells([[1, 1], [2, 1], [3, 1]]), 0)],
  ["1,1"]
);
assert.deepEqual(
  [...replayCells(cells([[1, 1], [2, 1], [3, 1]]), 1)],
  ["1,1", "2,1"]
);
assert.deepEqual(
  [...replayCells(cells([[1, 1], [2, 1]]), 99)],
  ["1,1", "2,1"]
);
assert.deepEqual([...replayCells(cells([[1, 1]]), -1)], []);
assert.deepEqual([...replayCells([], 0)], []);

// Expansion order reveals through the same helper: prefix grows,
// duplicates collapse, overrun clamps.
assert.deepEqual(
  [...replayCells(cells([[1, 1], [2, 1], [1, 1]]), 99)].sort(),
  ["1,1", "2,1"]
);

assert.ok(REPLAY_STEP_MS > 0, "replay step interval is positive");
assert.ok(EXPLORED_STEP_MS > 0, "explored reveal interval is positive");
assert.ok(
  EXPLORED_STEP_MS < REPLAY_STEP_MS,
  "exploration flows faster than the route marker"
);
assert.deepEqual(STRATEGY_LABEL, {
  bfs: "BFS",
  dijkstra: "Dijkstra",
  astar: "A*",
});

// --- Replay routes match Story benchmarks on every level ---
assert.equal(levels.length, 6, "all six levels covered");
for (const level of levels) {
  const maze = buildMaze(level);
  const costs = costsForMaze(maze);
  const replayed = replayRoutes(maze, costs);
  const { entries } = benchmarkLevel(level);

  assert.deepEqual(
    replayed.map((entry) => entry.strategy),
    ["bfs", "dijkstra", "astar"],
    `L${level.id} covers all three strategies`
  );

  for (const comparison of replayed) {
    const bench = entries.find(
      (entry) => entry.strategy === comparison.strategy
    );
    assert.ok(bench, `L${level.id} ${comparison.strategy} benchmarked`);
    assert.equal(
      comparison.result.reached,
      bench.reached,
      `L${level.id} ${comparison.strategy} reachability matches`
    );
    assert.equal(
      comparison.result.moves,
      bench.moves,
      `L${level.id} ${comparison.strategy} moves match`
    );
    assert.equal(
      comparison.result.cost,
      bench.cost,
      `L${level.id} ${comparison.strategy} cost matches`
    );
  }

  // Deterministic: same inputs, same animated path.
  const again = replayRoutes(maze, costs);
  assert.deepEqual(
    replayed.map((entry) =>
      entry.result.path.map((cell) => `${cell.x},${cell.z}`)
    ),
    again.map((entry) =>
      entry.result.path.map((cell) => `${cell.x},${cell.z}`)
    ),
    `L${level.id} replay paths are deterministic`
  );
}

// --- Panel renders on every win, just above the map: no mode gate ---
assert.match(
  mazeScene,
  /\{won && replayOptions && \(/,
  "replay panel shows for Tutorial and Story wins alike"
);
assert.ok(
  mazeScene.indexOf("<ReplayPanel") >
    mazeScene.indexOf("<TutorialLesson") &&
    mazeScene.indexOf("<ReplayPanel") <
      mazeScene.indexOf("relative h-[520px]"),
  "replay panel sits between the mission panel and the maze canvas"
);
assert.match(
  mazeScene,
  /won \? replayRoutes/,
  "routes computed only after a win"
);
assert.match(mazeScene, /startReplay/);
assert.match(mazeScene, /stopReplay/);
assert.match(mazeScene, /REPLAY_STEP_MS/);
assert.match(mazeScene, /replayCells/);
assert.match(
  mazeScene,
  /prefers-reduced-motion/,
  "reduced-motion players get the full route instantly"
);
assert.match(mazeScene, /setReplay\(null\)/, "restart/stop clears replay");
assert.match(mazeTiles, /replayHead/);
assert.match(mazeTiles, /replayExplored/);
assert.match(
  mazeTiles,
  /#3D5A73/,
  "explored backdrop reuses the learn-lab explored blue"
);

// Explored markers must render above weighted-terrain plates: the
// backdrop is wider than the plate, so a buried marker reads as a
// hollow blue outline instead of a filled square.
const terrainPlate = mazeTiles.match(
  /function TerrainPlate\([\s\S]*?position=\{\[tile\.x, ([\d.]+), tile\.z\]\}[\s\S]*?boxGeometry args=\{\[([\d.]+), ([\d.]+), ([\d.]+)\]\}/
);
assert.ok(terrainPlate, "terrain plate geometry found in MazeTiles");
const explored = mazeTiles.match(
  /\{\/\* Explored backdrop[\s\S]*?position=\{\[tile\.x, ([\d.]+), tile\.z\]\}[\s\S]*?boxGeometry args=\{\[([\d.]+), ([\d.]+), ([\d.]+)\]\}/
);
assert.ok(explored, "explored backdrop geometry found in MazeTiles");
const terrainTop =
  Number(terrainPlate[1]) + Number(terrainPlate[3]) / 2;
const exploredBottom = Number(explored[1]) - Number(explored[3]) / 2;
assert.ok(
  exploredBottom > terrainTop,
  `explored markers sit above terrain plates (bottom ${exploredBottom} > top ${terrainTop})`
);
assert.match(
  mazeScene,
  /order: found\.result\.order/,
  "replay keeps the expansion order for the reveal"
);
assert.match(
  mazeScene,
  /replayCells\(replay\.order, replay\.exploredHead\)/,
  "explored overlay grows through the expansion order"
);
assert.match(
  mazeScene,
  /phase === "exploring"/,
  "exploration animates before the route"
);
assert.match(
  mazeScene,
  /EXPLORED_STEP_MS/,
  "explored reveal runs on its own interval"
);
assert.match(
  mazeScene,
  /replayExplored=\{replayExploredSet\}/,
  "explored set reaches the maze tiles"
);
assert.match(
  replayPanel,
  /Expanding…/,
  "panel names the expansion phase while it plays"
);
assert.match(
  replayPanel,
  /Replay map legend/,
  "panel legends the expanded/route/head colors"
);

// --- Replay is visualization only: no game-state writes ---
for (const banned of [
  "attemptMove",
  "setRobotState",
  "setBattery",
  "deductBattery",
  "completeLevel",
  "pushCompletion",
  "recordStoryRun",
  "submitStoryRun",
  "setStatus",
]) {
  assert.doesNotMatch(
    replayPanel,
    new RegExp(banned),
    `ReplayPanel never ${banned}`
  );
  assert.doesNotMatch(
    replayLib,
    new RegExp(banned),
    `replay lib never ${banned}`
  );
}

// --- Panel honesty: labels, gating, and the untouched-state note ---
assert.match(replayPanel, /What-if route replay/);
assert.match(replayPanel, /Animate/);
assert.match(replayPanel, /Stop replay/);
assert.match(
  replayPanel,
  /\{result\.expanded\} expanded/,
  "each row shows its expanded-state count"
);
assert.match(
  replayPanel,
  /same optimum/,
  "Dijkstra/A* agreement is explained, not left ambiguous"
);
assert.match(
  replayPanel,
  /disabled=\{!result\.reached/,
  "unreachable strategies cannot animate"
);
assert.match(
  replayPanel,
  /Visualization only/,
  "panel states the robot and battery are untouched"
);

console.log("Replay checks passed!");
