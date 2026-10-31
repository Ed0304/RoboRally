
import { levels } from "../data/levels";
import { buildMaze, type MazeDefinition } from "@/lib/maze";
import { validateMaze } from "@/lib/mazevalidation";
import { canMoveTo } from "@/lib/gamelogic";
import {
  compareStrategies,
  planRoute,
  previewOptionsFor,
  type RouteCell,
  type SearchStrategy,
} from "@/lib/pathfinding";
import {
  BATTERY_MAX,
  DEFAULT_COSTS,
  canAfford,
  deductBattery,
  estimatePlanCost,
  moveCost,
  routeCost,
  type CostModel,
  type MoveDirection,
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

function tileType(m: MazeDefinition, c: RouteCell): string {
  return (
    m.tiles.find((t) => t.x === c.x && t.z === c.z)?.type ?? "void"
  );
}

function walkLegal(m: MazeDefinition, path: RouteCell[]): boolean {
  let door = false;
  for (let i = 1; i < path.length; i++) {
    if (!canMoveTo(path[i].x, path[i].z, m, door)) return false;
    if (tileType(m, path[i]) === "trigger") door = true;
  }
  return true;
}

const STRATEGIES: SearchStrategy[] = ["bfs", "dijkstra", "astar"];

// --- 1. BFS shortest moves on Level 1 ---
console.log("BFS shortest-move behavior (Level 1)");
{
  const maze = levelMaze(1);
  const route = planRoute(maze, maze.start, maze.exit, {
    ...previewOptionsFor(maze),
    strategy: "bfs",
  });
  const oracle = validateMaze(maze);
  check("reaches the exit", route.reached, route.reason);
  check(
    "matches validator shortest length",
    route.moves === oracle.path.length - 1,
    `moves=${route.moves}`
  );
  check(
    "uniform cost equals move count",
    route.cost === route.moves,
    `cost=${route.cost}`
  );
}

// --- 2. Dijkstra lowest-cost when cheapest is longer ---
console.log("Dijkstra cheapest-longer trade-off (crafted map)");
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

  const bfs = planRoute(maze, maze.start, maze.exit, {
    avoidLasers: false,
    dynamicDoors: false,
    strategy: "bfs",
    costs,
  });
  check("BFS takes the short corridor", bfs.moves === 5, `moves=${bfs.moves}`);
  check("BFS short route is expensive", bfs.cost === 21, `cost=${bfs.cost}`);

  const dijkstra = planRoute(maze, maze.start, maze.exit, {
    avoidLasers: false,
    dynamicDoors: false,
    strategy: "dijkstra",
    costs,
  });
  check(
    "Dijkstra takes the longer corridor",
    dijkstra.moves === 9,
    `moves=${dijkstra.moves}`
  );
  check(
    "Dijkstra pays the cheap cost",
    dijkstra.cost === 9,
    `cost=${dijkstra.cost}`
  );
  check("Dijkstra path is engine-legal", walkLegal(maze, dijkstra.path));

  const astar = planRoute(maze, maze.start, maze.exit, {
    avoidLasers: false,
    dynamicDoors: false,
    strategy: "astar",
    costs,
  });
  check(
    "A* agrees with Dijkstra cost",
    astar.reached && astar.cost === dijkstra.cost,
    `cost=${astar.cost}`
  );
  check("A* path is engine-legal", walkLegal(maze, astar.path));
}

// --- 3. A*/Dijkstra agreement on real levels (uniform costs) ---
console.log("A*/Dijkstra/BFS agreement on Levels 1, 4, 6");
for (const id of [1, 4, 6]) {
  const maze = levelMaze(id);
  const options = previewOptionsFor(maze);
  const results = STRATEGIES.map((strategy) =>
    planRoute(maze, maze.start, maze.exit, { ...options, strategy })
  );
  const [bfs, dijkstra, astar] = results;
  check(`L${id}: all strategies reach`, results.every((r) => r.reached));
  check(
    `L${id}: equal move counts`,
    bfs.moves === dijkstra.moves && bfs.moves === astar.moves,
    `${bfs.moves}/${dijkstra.moves}/${astar.moves}`
  );
  check(
    `L${id}: equal costs`,
    bfs.cost === dijkstra.cost && bfs.cost === astar.cost,
    `${bfs.cost}/${dijkstra.cost}/${astar.cost}`
  );
  check(
    `L${id}: all paths engine-legal`,
    results.every((r) => walkLegal(maze, r.path))
  );
}

// --- 4. Walls, lasers, doors hold for every strategy ---
console.log("Hazards and doors per strategy");
{
  const sealed = buildMaze({
    id: 0,
    name: "laser-sealed",
    description: "",
    layout: ["#####", "#SLE#", "#####"],
  });
  const gated = buildMaze({
    id: 0,
    name: "door-gated",
    description: "",
    layout: ["#########", "#S..!.DE#", "#########"],
  });

  for (const strategy of STRATEGIES) {
    const noSafe = planRoute(sealed, sealed.start, sealed.exit, {
      avoidLasers: true,
      dynamicDoors: false,
      strategy,
    });
    check(
      `${strategy}: laser-sealed reports no safe route`,
      !noSafe.reached && noSafe.reason.toLowerCase().includes("laser")
    );

    const gated_ = planRoute(gated, gated.start, gated.exit, {
      avoidLasers: false,
      dynamicDoors: true,
      strategy,
    });
    const triggerIndex = gated_.path.findIndex(
      (c) => tileType(gated, c) === "trigger"
    );
    const doorIndex = gated_.path.findIndex(
      (c) => tileType(gated, c) === "door"
    );
    check(
      `${strategy}: door-gated reaches via trigger first`,
      gated_.reached &&
        triggerIndex !== -1 &&
        triggerIndex < doorIndex &&
        walkLegal(gated, gated_.path)
    );
  }
}

// --- 5. Deterministic N,E,S,W ordering + repeatability ---
console.log("Determinism and neighbor order");
{
  const open = buildMaze({
    id: 0,
    name: "open",
    description: "",
    layout: ["#####", "#.E.#", "#...#", "#.S.#", "#####"],
  });
  for (const strategy of STRATEGIES) {
    const first = planRoute(open, open.start, open.exit, {
      avoidLasers: false,
      dynamicDoors: false,
      strategy,
    });
    const second = planRoute(open, open.start, open.exit, {
      avoidLasers: false,
      dynamicDoors: false,
      strategy,
    });
    check(
      `${strategy}: first step goes north`,
      first.path[1]?.x === 2 && first.path[1]?.z === 2,
      JSON.stringify(first.path[1])
    );
    check(
      `${strategy}: repeatable`,
      JSON.stringify(first) === JSON.stringify(second)
    );
  }

  const maze = levelMaze(4);
  const before = JSON.stringify(maze);
  for (const strategy of STRATEGIES) {
    planRoute(maze, maze.start, maze.exit, {
      ...previewOptionsFor(maze),
      strategy,
    });
  }
  check("planning never mutates the maze", JSON.stringify(maze) === before);
  check(
    "live game defines no special terrain costs",
    DEFAULT_COSTS.overrides.size === 0 && DEFAULT_COSTS.defaultCost === 1
  );
}

// --- 6. Battery math and rejection ---
console.log("Battery calculation and rejection");
{
  check("budget starts at 100%", BATTERY_MAX === 100);

  const path: RouteCell[] = [
    { x: 1, z: 1 },
    { x: 2, z: 1 },
    { x: 3, z: 1 },
  ];
  check("start tile costs 0", routeCost(path, DEFAULT_COSTS) === 2);
  check(
    "override cost applies on entry",
    routeCost(path, {
      defaultCost: 1,
      overrides: new Map([["3,1", 5]]),
    }) === 6
  );

  check("moveCost defaults to 1", moveCost(DEFAULT_COSTS, 9, 9) === 1);
  check("canAfford boundary", canAfford(3, 3) && !canAfford(2, 3));
  check("deductBattery subtracts", deductBattery(100, 19) === 81);

  const maze = levelMaze(1);
  const full = estimatePlanCost(
    ["east", "east", "east", "east"] as MoveDirection[],
    maze.start,
    maze,
    false,
    DEFAULT_COSTS
  );
  check(
    "estimate counts legal steps",
    full.cost === 4 && full.steps === 4,
    JSON.stringify(full)
  );

  const blocked = estimatePlanCost(
    ["west", "east", "east"] as MoveDirection[],
    maze.start,
    maze,
    false,
    DEFAULT_COSTS
  );
  check(
    "estimate stops at first blocked step without charging it",
    blocked.cost === 0 && blocked.steps === 0,
    JSON.stringify(blocked)
  );

  check(
    "insufficient battery rejects the plan",
    !canAfford(3, 5) && canAfford(100, 24)
  );
}

// --- 7. Three-way comparison: consistent inputs, measured metrics ---
console.log("compareStrategies fairness and metrics");
{
  const maze = levelMaze(1);
  const options = {
    ...previewOptionsFor(maze),
    costs: DEFAULT_COSTS,
  };
  const compared = compareStrategies(maze, maze.start, maze.exit, options);

  check(
    "covers BFS, Dijkstra, A* in order",
    JSON.stringify(compared.map((c) => c.strategy)) ===
      '["bfs","dijkstra","astar"]'
  );
  check(
    "planning time measured per strategy",
    compared.every(
      (c) => typeof c.ms === "number" && Number.isFinite(c.ms) && c.ms >= 0
    )
  );

  for (const entry of compared) {
    const { result } = entry;
    check(
      `${entry.strategy}: expanded equals order length`,
      result.expanded === result.order.length
    );
    if (result.reached) {
      const first = result.path[0];
      const last = result.path[result.path.length - 1];
      check(
        `${entry.strategy}: same start and exit`,
        first.x === maze.start.x &&
          first.z === maze.start.z &&
          last.x === maze.exit.x &&
          last.z === maze.exit.z
      );
      check(
        `${entry.strategy}: order starts at start, ends at exit`,
        result.order[0].x === maze.start.x &&
          result.order[0].z === maze.start.z &&
          result.order[result.order.length - 1].x === maze.exit.x &&
          result.order[result.order.length - 1].z === maze.exit.z
      );
    }
  }

  // Deterministic effort: identical inputs give identical expansion counts.
  const again = compareStrategies(maze, maze.start, maze.exit, options);
  check(
    "expansion counts repeatable",
    JSON.stringify(compared.map((c) => c.result.expanded)) ===
      JSON.stringify(again.map((c) => c.result.expanded))
  );

  // Pinned Level 1 effort (uniform costs): same optimum, different work.
  const effort: Record<string, number> = Object.fromEntries(
    compared.map((c) => [c.strategy, c.result.expanded])
  );
  check("L1 BFS expanded=52", effort.bfs === 52, `bfs=${effort.bfs}`);
  check(
    "L1 Dijkstra expanded=52",
    effort.dijkstra === 52,
    `dijkstra=${effort.dijkstra}`
  );
  check("L1 A* expanded=46", effort.astar === 46, `astar=${effort.astar}`);

  // Same laser policy and door rules for every strategy.
  const sealed = buildMaze({
    id: 0,
    name: "laser-sealed",
    description: "",
    layout: ["#####", "#SLE#", "#####"],
  });
  const sealedCompared = compareStrategies(sealed, sealed.start, sealed.exit, {
    avoidLasers: true,
    dynamicDoors: false,
  });
  check(
    "all strategies agree the sealed maze has no safe route",
    sealedCompared.every((c) => !c.result.reached)
  );
}

// --- 8. Meaningful difference on weighted terrain (crafted fork) ---
console.log("comparison diverges honestly on weighted costs");
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
  const compared = compareStrategies(maze, maze.start, maze.exit, {
    avoidLasers: false,
    dynamicDoors: false,
    costs,
  });
  const byStrategy = Object.fromEntries(
    compared.map((c) => [c.strategy, c.result])
  );
  check(
    "BFS minimizes moves, not cost",
    byStrategy.bfs.moves === 5 && byStrategy.bfs.cost === 21
  );
  check(
    "Dijkstra minimizes cost with more moves",
    byStrategy.dijkstra.moves === 9 && byStrategy.dijkstra.cost === 9
  );
  check(
    "A* matches Dijkstra optimal cost",
    byStrategy.astar.cost === byStrategy.dijkstra.cost
  );
  check(
    "fork effort pinned (10/11/11)",
    byStrategy.bfs.expanded === 10 &&
      byStrategy.dijkstra.expanded === 11 &&
      byStrategy.astar.expanded === 11,
    `bfs=${byStrategy.bfs.expanded} dij=${byStrategy.dijkstra.expanded} astar=${byStrategy.astar.expanded}`
  );
}

if (failures > 0) {
  throw new Error(`${failures} algorithm check(s) failed.`);
}

console.log("All algorithm checks passed!");
