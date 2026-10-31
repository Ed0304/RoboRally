
import { levels } from "../data/levels";
import { buildMaze, type MazeDefinition } from "@/lib/maze";
import { validateMaze } from "@/lib/mazevalidation";
import { canMoveTo } from "@/lib/gamelogic";
import {
  planRoute,
  previewOptionsFor,
  type RouteCell,
} from "@/lib/pathfinding";

let failures = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  PASS: ${name}`);
  } else {
    failures++;
    console.error(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function levelLayout(id: number): MazeDefinition {
  const level = levels.find((entry) => entry.id === id);
  if (!level) throw new Error(`Level ${id} missing from data/levels.ts`);
  return buildMaze(level);
}

function tileType(maze: MazeDefinition, cell: RouteCell): string {
  const tile = maze.tiles.find(
    (entry) => entry.x === cell.x && entry.z === cell.z
  );
  return tile?.type ?? "void";
}

/**
 * Walk a previewed route exactly like the engine: each step must pass
 * canMoveTo with the current door state, and stepping on a trigger
 * opens doors for subsequent steps.
 */
function walkRoute(
  maze: MazeDefinition,
  path: RouteCell[]
): { legal: boolean; detail: string } {
  if (path.length === 0) return { legal: false, detail: "empty path" };

  let doorOpen = false;

  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1];
    const next = path[i];
    const adjacent =
      Math.abs(next.x - prev.x) + Math.abs(next.z - prev.z) === 1;

    if (!adjacent) {
      return { legal: false, detail: `non-adjacent step ${i}` };
    }

    if (!canMoveTo(next.x, next.z, maze, doorOpen)) {
      return {
        legal: false,
        detail: `illegal step ${i} into (${next.x},${next.z}) doorOpen=${doorOpen}`,
      };
    }

    if (tileType(maze, next) === "trigger") doorOpen = true;
  }

  return { legal: true, detail: "" };
}

// --- Level 1: plain BFS must match the validator oracle ---
console.log("Level 1 (The Basics): BFS shortest path");
{
  const maze = levelLayout(1);
  const options = previewOptionsFor(maze);
  check("plain walls-only search", !options.avoidLasers && !options.dynamicDoors);

  const route = planRoute(maze, maze.start, maze.exit, options);
  const oracle = validateMaze(maze);

  check("route reaches the exit", route.reached, route.reason);
  check(
    "matches validator shortest length",
    route.path.length === oracle.path.length,
    `preview=${route.path.length} validator=${oracle.path.length}`
  );

  const walk = walkRoute(maze, route.path);
  check("every step is engine-legal", walk.legal, walk.detail);

  const again = planRoute(maze, maze.start, maze.exit, options);
  check(
    "deterministic across runs",
    JSON.stringify(again.path) === JSON.stringify(route.path)
  );
}

// --- Level 2: laser avoidance ---
console.log("Level 2 (Hazards): safe route avoids lasers");
{
  const maze = levelLayout(2);
  const options = previewOptionsFor(maze);
  check("laser avoidance enabled", options.avoidLasers);

  const route = planRoute(maze, maze.start, maze.exit, options);
  check("safe route exists", route.reached, route.reason);

  const laserSteps = route.path.filter(
    (cell) => tileType(maze, cell) === "laser"
  );
  check("no laser tiles on route", laserSteps.length === 0);

  const walk = walkRoute(maze, route.path);
  check("every step is engine-legal", walk.legal, walk.detail);
}

// --- Level 2 shape: no-safe-route case reports honestly ---
console.log("Laser-sealed maze: explicit no-safe-route message");
{
  const sealed = buildMaze({
    id: 0,
    name: "laser-sealed",
    description: "",
    layout: ["#####", "#SLE#", "#####"],
  });

  const route = planRoute(sealed, sealed.start, sealed.exit, {
    avoidLasers: true,
    dynamicDoors: false,
  });

  check("reports unreachable", !route.reached);
  check("empty path on failure", route.path.length === 0);
  check(
    "message names the laser cause",
    route.reason.toLowerCase().includes("laser"),
    route.reason
  );
}

// --- Level 3: door-state search stays engine-legal ---
// Note: L3's exit is reachable without the door (the door is a
// shortcut), so mechanic coverage uses the crafted maze below.
console.log("Level 3 (Something Unexpected): door-aware search");
{
  const maze = levelLayout(3);
  const options = previewOptionsFor(maze);
  check("door-state search enabled", options.dynamicDoors);

  const route = planRoute(maze, maze.start, maze.exit, options);
  check("route reaches the exit", route.reached, route.reason);

  const walk = walkRoute(maze, route.path);
  check("every step is engine-legal", walk.legal, walk.detail);

  const again = planRoute(maze, maze.start, maze.exit, options);
  check(
    "deterministic across runs",
    JSON.stringify(again.path) === JSON.stringify(route.path)
  );
}

// --- Crafted maze: the door is mandatory, trigger must come first ---
console.log("Door-gated maze: trigger before door");
{
  const gated = buildMaze({
    id: 0,
    name: "door-gated",
    description: "",
    layout: ["#########", "#S..!.DE#", "#########"],
  });

  const route = planRoute(gated, gated.start, gated.exit, {
    avoidLasers: false,
    dynamicDoors: true,
  });
  check("route reaches the exit", route.reached, route.reason);

  const walk = walkRoute(gated, route.path);
  check("every step is engine-legal", walk.legal, walk.detail);

  const triggerIndex = route.path.findIndex(
    (cell) => tileType(gated, cell) === "trigger"
  );
  const doorIndex = route.path.findIndex(
    (cell) => tileType(gated, cell) === "door"
  );
  check(
    "trigger precedes the door on the route",
    triggerIndex !== -1 && doorIndex !== -1 && triggerIndex < doorIndex,
    `trigger=${triggerIndex} door=${doorIndex}`
  );

  // A search that cannot open doors must not pass through one.
  const naive = planRoute(gated, gated.start, gated.exit, {
    avoidLasers: false,
    dynamicDoors: false,
  });
  check("closed-door search cannot reach the exit", !naive.reached);
}

if (failures > 0) {
  throw new Error(`${failures} pathfinding check(s) failed.`);
}

console.log("All pathfinding checks passed!");
