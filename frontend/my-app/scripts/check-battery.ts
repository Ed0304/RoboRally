
import { levels } from "../data/levels";
import { buildMaze, type MazeDefinition } from "@/lib/maze";
import { canMoveTo } from "@/lib/gamelogic";
import {
  costField,
  planRoute,
  type RouteCell,
} from "@/lib/pathfinding";
import {
  BATTERY_MAX,
  DEFAULT_COSTS,
  canAfford,
  costsForMaze,
  deductBattery,
  moveCost,
  prefixCosts,
  routeCost,
  toastForMove,
  type CostModel,
} from "@/lib/battery";

let failures = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  PASS: ${name}`);
  } else {
    failures++;
    console.error(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function levelMaze(id: number): MazeDefinition {
  const level = levels.find((entry) => entry.id === id);
  if (!level) throw new Error(`Level ${id} missing from data/levels.ts`);
  return buildMaze(level);
}

function tileType(m: MazeDefinition, x: number, z: number): string {
  return m.tiles.find((t) => t.x === x && t.z === z)?.type ?? "void";
}

// --- 1. Cost field basics on Level 1 (uniform costs) ---
console.log("costField basics (Level 1)");
{
  const maze = levelMaze(1);
  const field = costField(maze, maze.start, {
    avoidLasers: true,
    dynamicDoors: false,
  });

  check("start tile costs 0", field.get("1,1") === 0);
  check(
    "adjacent floor costs 1",
    field.get("2,1") === 1,
    `2,1=${field.get("2,1")}`
  );

  const exit = planRoute(maze, maze.start, maze.exit, {
    avoidLasers: true,
    dynamicDoors: false,
    strategy: "bfs",
  });
  check(
    "exit entry equals BFS shortest moves",
    field.get(`${maze.exit.x},${maze.exit.z}`) === exit.moves
  );

  let wallsLeaked = false;
  let lasersLeaked = false;
  for (const key of field.keys()) {
    const [x, z] = key.split(",").map(Number);
    const t = tileType(maze, x, z);
    if (t === "wall") wallsLeaked = true;
    if (t === "laser") lasersLeaked = true;
  }
  check("walls never labeled", !wallsLeaked);
  check("lasers never labeled", !lasersLeaked);
}

// --- 2. Variable costs honored (crafted fork) ---
console.log("costField variable costs");
{
  const maze = buildMaze({
    id: 0,
    name: "cost-fork",
    description: "",
    layout: [
      "########",
      "#S....E#",
      "#.####.#",
      "#......#",
      "########",
    ],
  });
  const costs: CostModel = {
    defaultCost: 1,
    overrides: new Map([
      ["2,1", 5],
      ["3,1", 5],
      ["4,1", 5],
      ["5,1", 5],
    ]),
  };
  const field = costField(maze, maze.start, {
    avoidLasers: false,
    dynamicDoors: false,
    costs,
  });

  check("exit reached via cheap corridor", field.get("6,1") === 9);
  check(
    "expensive tile carries its override",
    field.get("2,1") === 5,
    `2,1=${field.get("2,1")}`
  );
}

// --- 3. Doors and triggers ---
console.log("costField doors and triggers");
{
  const gated = buildMaze({
    id: 0,
    name: "door-gated",
    description: "",
    layout: ["#########", "#S..!.DE#", "#########"],
  });

  const dynamic = costField(gated, gated.start, {
    avoidLasers: false,
    dynamicDoors: true,
  });
  check("exit reachable through trigger+door", dynamic.get("7,1") === 6);
  check("door tile needs trigger first", dynamic.get("6,1") === 5);

  const shut = costField(gated, gated.start, {
    avoidLasers: false,
    dynamicDoors: false,
  });
  check("exit omitted when doors stay shut", !shut.has("7,1"));
  check("door tile omitted when shut", !shut.has("6,1"));
  check("pre-door tiles still labeled", shut.get("2,1") === 1);

  const open = costField(gated, gated.start, {
    avoidLasers: false,
    dynamicDoors: true,
    initialDoorOpen: true,
  });
  check(
    "pre-opened door shortens nothing here but stays valid",
    open.get("7,1") === 6
  );
}

// --- 4. Toast data ---
console.log("per-move toast data");
{
  check(
    "standard move toast",
    toastForMove(1, 99) === "−1% Battery · 99% remaining"
  );
  check(
    "unusual cost toast",
    toastForMove(5, 90) === "−5% Battery · 90% remaining"
  );
  check("zero cost yields no toast", toastForMove(0, 100) === null);
}

// --- 5. Blocked moves spend nothing; battery never negative ---
console.log("blocked-move and negativity guards");
{
  const maze = levelMaze(1);
  check("wall step illegal", !canMoveTo(0, 1, maze, false));
  check("empty battery affords nothing", !canAfford(0, 1));
  check(
    "exact-change affordable",
    canAfford(1, 1) && deductBattery(1, 1) === 0
  );

  // Gate simulation: only deduct when affordable, exactly like execution.
  let battery = 2;
  for (const cost of [1, 1, 1]) {
    if (!canAfford(battery, cost)) break;
    battery = deductBattery(battery, cost);
  }
  check("gate stops at zero, never negative", battery === 0);
}

// --- 6. Preview/execution consistency + purity ---
console.log("preview consistency and purity");
{
  const maze = levelMaze(4);
  const before = JSON.stringify(maze);
  const costsBefore = JSON.stringify({
    defaultCost: DEFAULT_COSTS.defaultCost,
    overrides: [...DEFAULT_COSTS.overrides],
  });

  const route = planRoute(maze, maze.start, maze.exit, {
    avoidLasers: true,
    dynamicDoors: false,
    strategy: "bfs",
  });
  const prefixes = prefixCosts(route.path, DEFAULT_COSTS);
  check(
    "prefix count matches moves",
    prefixes.length === route.moves,
    `${prefixes.length} vs ${route.moves}`
  );
  check(
    "prefixes accumulate entry costs",
    prefixes.every(
      (value, i) =>
        value ===
        routeCost(route.path.slice(0, i + 2), DEFAULT_COSTS)
    )
  );
  check(
    "final prefix equals route cost",
    prefixes[prefixes.length - 1] === route.cost
  );

  const field = costField(maze, maze.start, {
    avoidLasers: true,
    dynamicDoors: false,
  });
  field.set("1,1", 999);
  const again = costField(maze, maze.start, {
    avoidLasers: true,
    dynamicDoors: false,
  });
  check("field results independent", again.get("1,1") === 0);

  check("planning never mutates maze", JSON.stringify(maze) === before);
  check(
    "planning never mutates cost model",
    JSON.stringify({
      defaultCost: DEFAULT_COSTS.defaultCost,
      overrides: [...DEFAULT_COSTS.overrides],
    }) === costsBefore
  );
}

// --- 7. Maze-derived cost model ---
console.log("costsForMaze terrain mapping");
{
  const maze = levelMaze(4);
  const costs = costsForMaze(maze);
  check("default cost stays 1", costs.defaultCost === 1);
  check(
    "rough tile costs 3",
    moveCost(costs, 3, 1) === 3,
    `3,1=${moveCost(costs, 3, 1)}`
  );
  check(
    "drain tile costs 5",
    moveCost(costs, 9, 3) === 5,
    `9,3=${moveCost(costs, 9, 3)}`
  );
  check("plain floor costs 1", moveCost(costs, 2, 1) === 1);
  check(
    "override count matches terrain tiles",
    costs.overrides.size === 8,
    `size=${costs.overrides.size}`
  );
}

// --- 8. Restart baseline ---
console.log("restart baseline");
{
  check("battery resets to 100%", BATTERY_MAX === 100);
}

if (failures > 0) {
  throw new Error(`${failures} battery check(s) failed.`);
}

console.log("All battery checks passed!");
