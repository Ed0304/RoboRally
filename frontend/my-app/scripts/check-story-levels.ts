
import { createHash } from "node:crypto";
import { levels } from "../data/levels";
import { buildMaze, type MazeDefinition } from "@/lib/maze";
import { canMoveTo } from "@/lib/gamelogic";
import { planRoute, type RouteCell } from "@/lib/pathfinding";

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

// Illustrative Phase B rough-tile coordinates (proposal-only, cost 3).
const ROUGH: Record<number, string[]> = {
  4: ["3,1", "4,1", "5,1", "6,1", "7,1", "8,1"],
  5: ["7,5", "8,5", "9,5", "9,6", "9,7"],
  6: ["13,4", "13,5", "13,6", "13,7", "13,8"],
};

// Expected (moves, cost) under the illustrative model: ordinary tile 1,
// rough tile 3, lasers blocked, doors dynamic.
const EXPECTED_ROUTES: Record<
  number,
  { bfsMoves: number; bfsCost: number; dijkstraMoves: number; dijkstraCost: number }
> = {
  4: { bfsMoves: 19, bfsCost: 31, dijkstraMoves: 25, dijkstraCost: 25 },
  5: { bfsMoves: 22, bfsCost: 32, dijkstraMoves: 24, dijkstraCost: 24 },
  6: { bfsMoves: 41, bfsCost: 51, dijkstraMoves: 41, dijkstraCost: 41 },
};

// Snapshot of Tutorial levels 1-3 to detect accidental changes.
const TUTORIAL_SNAPSHOT =
  "bdc4f1e3cf2090adf58cee5a042c71dcc2203cd5c62be41e02e3c52c91b23a3f";

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

/** Minimal Dijkstra over (x, z, doorOpen) for the illustrative cost model. */
function dijkstra(m: MazeDefinition, rough: Set<string>) {
  const key = (x: number, z: number, d: boolean) => `${x},${z},${d}`;
  const dirs = [
    { x: 0, z: -1 },
    { x: 1, z: 0 },
    { x: 0, z: 1 },
    { x: -1, z: 0 },
  ];
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
      const nc =
        (dist.get(cur) ?? Infinity) + (rough.has(`${nx},${nz}`) ? 3 : 1);
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
const ALLOWED = new Set(["#", ".", "S", "E", "L", "D", "!"]);

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

  const maze = buildMaze(level);
  const safe = planRoute(maze, maze.start, maze.exit, {
    avoidLasers: true,
    dynamicDoors: true,
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

  if (id === 6) {
    const shut = planRoute(maze, maze.start, maze.exit, {
      avoidLasers: true,
      dynamicDoors: false,
    });
    check("door is mandatory (sealed when shut)", !shut.reached);
    check(
      "safe route uses trigger and door",
      safe.path.some((c) => tileType(maze, c.x, c.z) === "trigger") &&
        safe.path.some((c) => tileType(maze, c.x, c.z) === "door")
    );
  }

  // Illustrative battery comparison (proposal model, not implemented).
  const rough = new Set(ROUGH[id]);
  const roughValid = ROUGH[id].every((r) => {
    const [x, z] = r.split(",").map(Number);
    const t = tileType(maze, x, z);
    return (
      x >= 0 && z >= 0 && x < width && z < maze.depth &&
      t !== "void" && t !== "wall" && t !== "laser"
    );
  });
  check("rough coordinates traversable", roughValid);

  const expected = EXPECTED_ROUTES[id];
  const bfsCost = safe.path
    .slice(1)
    .reduce(
      (sum, c) => sum + (rough.has(`${c.x},${c.z}`) ? 3 : 1),
      0
    );
  check(
    "BFS moves/cost match",
    safe.path.length - 1 === expected.bfsMoves && bfsCost === expected.bfsCost,
    `moves=${safe.path.length - 1} cost=${bfsCost}`
  );
  const dj = dijkstra(maze, rough);
  check(
    "Dijkstra moves/cost match",
    dj.reached &&
      dj.path.length - 1 === expected.dijkstraMoves &&
      dj.cost === expected.dijkstraCost,
    `moves=${dj.path.length - 1} cost=${dj.cost}`
  );
  check("Dijkstra cheaper than BFS", dj.cost < bfsCost);
}

if (failures > 0) {
  throw new Error(`${failures} story-level check(s) failed.`);
}

console.log("All story-level checks passed!");
