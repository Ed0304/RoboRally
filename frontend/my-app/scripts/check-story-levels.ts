
import { createHash } from "node:crypto";
import { levels } from "../data/levels";
import { buildMaze, type MazeDefinition } from "@/lib/maze";
import { canMoveTo } from "@/lib/gamelogic";
import { planRoute, type RouteCell } from "@/lib/pathfinding";
import { costsForMaze, type CostModel } from "@/lib/battery";

// Canonical Phase B metadata for Story levels 4-6.
const EXPECTED_META: Record<
  number,
  { name: string; difficulty: string; goal: string; width: number; height: number }
> = {
  4: {
    name: "Ember Corridor",
    difficulty: "Medium",
    goal: "Get to the finish line",
    width: 13,
    height: 11,
  },
  5: {
    name: "Security Breach",
    difficulty: "Hard",
    goal: "Get to the finish line",
    width: 15,
    height: 11,
  },
  6: {
    name: "The Factory Rescue",
    difficulty: "Hard",
    goal: "Get to the finish line",
    width: 15,
    height: 13,
  },
};

// Designed weighted-terrain counts per Story level.
const EXPECTED_TERRAIN: Record<number, { rough: number; drain: number }> = {
  4: { rough: 6, drain: 2 },
  5: { rough: 5, drain: 2 },
  6: { rough: 5, drain: 2 },
};

// Expected (moves, cost) under real terrain costs: floor 1, rough 3, drain 5.
const EXPECTED_ROUTES: Record<
  number,
  { bfsMoves: number; bfsCost: number; dijkstraMoves: number; dijkstraCost: number }
> = {
  4: { bfsMoves: 19, bfsCost: 31, dijkstraMoves: 25, dijkstraCost: 25 },
  5: { bfsMoves: 22, bfsCost: 32, dijkstraMoves: 24, dijkstraCost: 24 },
  6: { bfsMoves: 37, bfsCost: 47, dijkstraMoves: 41, dijkstraCost: 43 },
};

// Snapshot of Tutorial levels 1-3 to detect accidental changes.
// Intentionally updated for the L2 Dijkstra fork + lesson descriptions.
const TUTORIAL_SNAPSHOT =
  "e1c8be60f34a850f8ebb9ef247b644c7f114f4ac5c926a579b35e838d4d89497";

let failures = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  PASS: ${name}`);
  } else {
    failures++;
    console.error(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function tileType(m: MazeDefinition, x: number, z: number): string {
  return m.tiles.find((t) => t.x === x && t.z === z)?.type ?? "void";
}

/**
 * Independent Dijkstra oracle over (x, z, doorOpen) with a CostModel.
 * Cross-validates the library planner; lasers blocked, doors dynamic.
 */
function dijkstra(m: MazeDefinition, costs: CostModel) {
  const key = (x: number, z: number, d: boolean) => `${x},${z},${d}`;
  const dirs = [
    { x: 0, z: -1 },
    { x: 1, z: 0 },
    { x: 0, z: 1 },
    { x: -1, z: 0 },
  ];
  const stepCost = (x: number, z: number) =>
    costs.overrides.get(`${x},${z}`) ?? costs.defaultCost;
  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  const start = key(m.start.x, m.start.z, false);
  dist.set(start, 0);
  const pq: string[] = [start];
  const pop = () => {
    let bi = 0;
    for (let i = 1; i < pq.length; i++) {
      if ((dist.get(pq[i]) ?? Infinity) < (dist.get(pq[bi]) ?? Infinity)) bi = i;
    }
    return pq.splice(bi, 1)[0];
  };
  while (pq.length > 0) {
    const cur = pop();
    const [cx, cz, cd] = cur.split(",");
    const x = Number(cx);
    const z = Number(cz);
    const d = cd === "true";
    if (x === m.exit.x && z === m.exit.z) {
      const path: RouteCell[] = [];
      let k: string | undefined = cur;
      while (k !== undefined) {
        const [px, pz] = k.split(",").map(Number);
        path.push({ x: px, z: pz });
        k = prev.get(k);
      }
      path.reverse();
      return { reached: true, cost: dist.get(cur) ?? Infinity, path };
    }
    for (const dir of dirs) {
      const nx = x + dir.x;
      const nz = z + dir.z;
      const t = tileType(m, nx, nz);
      if (t === "void" || t === "wall" || t === "laser") continue;
      if (t === "door" && !d) continue;
      const nd = d || t === "trigger";
      const nc = (dist.get(cur) ?? Infinity) + stepCost(nx, nz);
      const nk = key(nx, nz, nd);
      if (nc < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, nc);
        prev.set(nk, cur);
        pq.push(nk);
      }
    }
  }
  return { reached: false, cost: Infinity, path: [] as RouteCell[] };
}

// --- Tutorials 1-3 unchanged ---
console.log("Tutorials 1-3 snapshot");
{
  const tutorials = levels
    .filter((l) => l.type === "Tutorial")
    .sort((a, b) => a.id - b.id);
  check("three tutorial levels", tutorials.length === 3);
  check(
    "tutorial ids 1-3",
    JSON.stringify(tutorials.map((l) => l.id)) === "[1,2,3]"
  );
  const digest = createHash("sha256")
    .update(JSON.stringify(tutorials))
    .digest("hex");
  check("tutorial snapshot unchanged", digest === TUTORIAL_SNAPSHOT, digest);
}

// --- Story levels 4-6 ---
const ALLOWED = new Set(["#", ".", "S", "E", "L", "D", "!", "3", "5"]);

for (const id of [4, 5, 6]) {
  console.log(`Story level ${id}`);
  const level = levels.find((l) => l.id === id);
  check("level exists in canonical data", level !== undefined);
  if (!level) continue;

  const meta = EXPECTED_META[id];
  check("type is Story", level.type === "Story", level.type);
  check("name matches", level.name === meta.name, level.name);
  check(
    "difficulty matches",
    level.difficulty === meta.difficulty,
    level.difficulty
  );
  check("exit-only goal", level.goal === meta.goal, level.goal);

  const width = level.layout[0]?.length ?? 0;
  check(
    "dimensions match",
    width === meta.width && level.layout.length === meta.height,
    `${width}x${level.layout.length}`
  );
  check(
    "uniform row width",
    level.layout.every((row) => row.length === width)
  );

  const flat = level.layout.join("");
  const bad = [...flat].find((ch) => !ALLOWED.has(ch));
  check("supported symbols only", bad === undefined, bad);
  const count = (s: string) => [...flat].filter((ch) => ch === s).length;
  check("exactly one start/exit", count("S") === 1 && count("E") === 1);
  check("no enemy/collectible markers", count("R") === 0 && count("C") === 0);
  check("no door/trigger tiles", count("D") === 0 && count("!") === 0);

  const maze = buildMaze(level);
  const costs = costsForMaze(maze);

  const terrain = EXPECTED_TERRAIN[id];
  const roughTiles = maze.tiles.filter((t) => t.type === "rough").length;
  const drainTiles = maze.tiles.filter((t) => t.type === "drain").length;
  check(
    "weighted terrain counts match design",
    roughTiles === terrain.rough && drainTiles === terrain.drain,
    `rough=${roughTiles} drain=${drainTiles}`
  );

  const safe = planRoute(maze, maze.start, maze.exit, {
    avoidLasers: true,
    dynamicDoors: false,
    strategy: "bfs",
    costs,
  });
  check("laser-free route exists", safe.reached);
  const laserSteps = safe.path.filter(
    (c) => tileType(maze, c.x, c.z) === "laser"
  ).length;
  check("safe route avoids lasers", laserSteps === 0);

  let door = false;
  let legal = true;
  for (let i = 1; i < safe.path.length; i++) {
    const s = safe.path[i];
    if (!canMoveTo(s.x, s.z, maze, door)) {
      legal = false;
      break;
    }
    if (tileType(maze, s.x, s.z) === "trigger") door = true;
  }
  check("every safe step engine-legal", legal && safe.reached);

  // Real-terrain battery comparison.
  const expected = EXPECTED_ROUTES[id];
  check(
    "BFS moves/cost match",
    safe.moves === expected.bfsMoves && safe.cost === expected.bfsCost,
    `moves=${safe.moves} cost=${safe.cost}`
  );
  const dj = dijkstra(maze, costs);
  check(
    "Dijkstra moves/cost match",
    dj.reached &&
      dj.path.length - 1 === expected.dijkstraMoves &&
      dj.cost === expected.dijkstraCost,
    `moves=${dj.path.length - 1} cost=${dj.cost}`
  );
  check("Dijkstra cheaper than BFS", dj.cost < safe.cost);

  const lib = planRoute(maze, maze.start, maze.exit, {
    avoidLasers: true,
    dynamicDoors: false,
    strategy: "dijkstra",
    costs,
  });
  check(
    "library Dijkstra agrees with oracle",
    lib.reached && lib.cost === dj.cost && lib.moves === dj.path.length - 1,
    `moves=${lib.moves} cost=${lib.cost}`
  );
}

if (failures > 0) {
  throw new Error(`${failures} story-level check(s) failed.`);
}

console.log("All story-level checks passed!");
