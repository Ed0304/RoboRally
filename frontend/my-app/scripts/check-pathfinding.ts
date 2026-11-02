
import { levels } from "../data/levels";
import { buildMaze, type MazeDefinition } from "@/lib/maze";
import { validateMaze } from "@/lib/mazevalidation";
import { canMoveTo } from "@/lib/gamelogic";
import {
  planRoute,
  previewOptionsFor,
  type RouteCell,
} from "@/lib/pathfinding";
import { costsForMaze } from "@/lib/battery";

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

// --- Level 3: walls-only search with one rough tile ---
// L3 no longer has doors (blocked shortcut is a wall now); the old trigger
// cell is rough terrain, so BFS may pay extra while Dijkstra routes around it.
console.log("Level 3 (Something Unexpected): plain search, weighted tile");
{
  const maze = levelLayout(3);
  const options = previewOptionsFor(maze);
  check(
    "plain search (no lasers, no doors)",
    !options.avoidLasers && !options.dynamicDoors
  );
  check(
    "exactly one rough tile",
    maze.tiles.filter((t) => t.type === "rough").length === 1
  );

  const costs = costsForMaze(maze);
  const bfs = planRoute(maze, maze.start, maze.exit, {
    ...options,
    strategy: "bfs",
    costs,
  });
  check("BFS reaches in 14 moves", bfs.reached && bfs.moves === 14);
  check("BFS pays for the rough tile", bfs.cost === 16, `cost=${bfs.cost}`);

  const walk = walkRoute(maze, bfs.path);
  check("every step is engine-legal", walk.legal, walk.detail);

  const dijkstra = planRoute(maze, maze.start, maze.exit, {
    ...options,
    strategy: "dijkstra",
    costs,
  });
  check(
    "Dijkstra avoids the rough tile at equal moves",
    dijkstra.reached && dijkstra.moves === 14 && dijkstra.cost === 14,
    `moves=${dijkstra.moves} cost=${dijkstra.cost}`
  );

  const again = planRoute(maze, maze.start, maze.exit, {
    ...options,
    strategy: "bfs",
    costs,
  });
  check(
    "deterministic across runs",
    JSON.stringify(again.path) === JSON.stringify(bfs.path)
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

// --- Thinking traces: narration events mirror the search exactly ---
console.log("Trace integrity: narration data matches execution");
{
  const maze = levelLayout(1);
  const options = previewOptionsFor(maze);

  const untraced = planRoute(maze, maze.start, maze.exit, options);
  check("trace is opt-in (absent by default)", untraced.trace === undefined);

  const traced = planRoute(maze, maze.start, maze.exit, {
    ...options,
    trace: true,
  });
  check(
    "tracing changes no route",
    JSON.stringify(traced.path) === JSON.stringify(untraced.path)
  );
  check(
    "tracing changes no expansion order",
    JSON.stringify(traced.order) === JSON.stringify(untraced.order)
  );

  const events = traced.trace;
  check("trace present when requested", events !== undefined);

  if (events) {
    check(
      "one event per expansion",
      events.length === traced.order.length,
      `events=${events.length} order=${traced.order.length}`
    );
    check(
      "events align with the animated order",
      events.every(
        (event, index) =>
          event.node.x === traced.order[index].x &&
          event.node.z === traced.order[index].z
      )
    );
    check(
      "every neighbor classified exactly once per expansion",
      events.every(
        (event) =>
          event.goal ||
          event.added.length +
            event.updated.length +
            event.skippedBlocked +
            event.skippedSeen ===
            4
      )
    );
    check(
      "first expansion starts at cost 0",
      events.length > 0 && events[0].g === 0 && events[0].f === 0
    );
    const last = events[events.length - 1];
    check(
      "goal pop closes the trace",
      events.length > 0 && last.goal && last.g === traced.moves,
      `g=${events.length > 0 ? last.g : "?"} moves=${traced.moves}`
    );
  }
}

// --- Weighted pop rules: priority never moves backwards ---
console.log("Trace pop rules: Dijkstra/A* honor their priority");
{
  const maze = levelLayout(3);
  const costs = costsForMaze(maze);
  const options = { ...previewOptionsFor(maze), costs };

  for (const strategy of ["dijkstra", "astar"] as const) {
    const result = planRoute(maze, maze.start, maze.exit, {
      ...options,
      strategy,
      trace: true,
    });
    const events = result.trace ?? [];
    check(
      `${strategy} pops never go back in priority`,
      events.every(
        (event, index) => index === 0 || event.f >= events[index - 1].f
      )
    );
    check(
      `${strategy} goal cost equals the route cost`,
      events.length > 0 &&
        events[events.length - 1].goal &&
        events[events.length - 1].g === result.cost
    );
  }
}

if (failures > 0) {
  throw new Error(`${failures} pathfinding check(s) failed.`);
}

console.log("All pathfinding checks passed!");
