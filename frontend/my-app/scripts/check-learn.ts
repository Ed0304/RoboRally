import assert from "node:assert/strict";
import { levels } from "../data/levels";
import { buildMaze } from "@/lib/maze";
import { validateMaze } from "@/lib/mazevalidation";
import { costsForMaze } from "@/lib/battery";
import {
  planRoute,
  previewOptionsFor,
  type SearchStrategy,
} from "@/lib/pathfinding";
import {
  gradePrediction,
  shortestPathLength,
  traceBfs,
} from "@/lib/bfs";
import { BFS_LAB, LAB_MAZES } from "@/lib/labMazes";

function route(
  id: 101 | 102 | 103,
  strategy: SearchStrategy
) {
  const def = LAB_MAZES.find((entry) => entry.id === id);
  assert.ok(def);
  const maze = buildMaze(def);
  return planRoute(maze, maze.start, maze.exit, {
    ...previewOptionsFor(maze),
    strategy,
    costs: costsForMaze(maze),
  });
}

// --- Lab mazes stay separate from the six game levels ---
{
  const gameIds = new Set(levels.map((level) => level.id));
  const gameLayouts = new Set(
    levels.map((level) => JSON.stringify(level.layout))
  );

  assert.equal(LAB_MAZES.length, 3);

  for (const lab of LAB_MAZES) {
    assert.ok(
      !gameIds.has(lab.id),
      `Lab id ${lab.id} collides with a game level.`
    );
    assert.ok(
      !gameLayouts.has(JSON.stringify(lab.layout)),
      `Lab "${lab.name}" duplicates a game level layout.`
    );
  }
}

// --- Structural invariants per lab maze ---
{
  const allowed: Record<number, Set<string>> = {
    101: new Set(["#", ".", "S", "E"]),
    102: new Set(["#", ".", "S", "E", "3", "5"]),
    103: new Set(["#", ".", "S", "E"]),
  };

  for (const lab of LAB_MAZES) {
    const width = lab.layout[0]?.length ?? 0;
    assert.ok(width > 0, `${lab.name}: empty layout`);

    for (const [z, row] of lab.layout.entries()) {
      assert.equal(
        row.length,
        width,
        `${lab.name}: row ${z} width ${row.length} != ${width}`
      );
      for (const symbol of row) {
        assert.ok(
          allowed[lab.id].has(symbol),
          `${lab.name}: unexpected symbol "${symbol}".`
        );
      }
    }

    const flat = lab.layout.join("");
    assert.equal(
      [...flat].filter((s) => s === "S").length,
      1,
      `${lab.name}: expected exactly one start.`
    );
    assert.equal(
      [...flat].filter((s) => s === "E").length,
      1,
      `${lab.name}: expected exactly one exit.`
    );

    const oracle = validateMaze(buildMaze(lab));
    assert.equal(
      oracle.solvable,
      true,
      `${lab.name}: the lab maze must stay solvable.`
    );
  }
}

// --- BFS lab: waves on unweighted terrain ---
{
  const maze = buildMaze(BFS_LAB);
  const trace = traceBfs(maze);

  assert.equal(trace.reachedExit, true);
  assert.equal(shortestPathLength(trace), 7);
  assert.equal(trace.visitedCount, 13);

  // Deterministic N-E-S-W order from (1, 1): north is a wall,
  // so east, then south, then the next wave.
  assert.deepEqual(trace.order[0], { x: 1, z: 1 });
  assert.deepEqual(trace.order[1], { x: 2, z: 1 });
  assert.deepEqual(trace.order[2], { x: 1, z: 2 });
  assert.deepEqual(trace.order[3], { x: 3, z: 1 });
  assert.deepEqual(traceBfs(maze).order, trace.order);

  const oracle = validateMaze(maze);
  assert.equal(trace.path.length, oracle.path.length);
  assert.equal(trace.visitedCount, oracle.visitedCount);

  assert.equal(gradePrediction(7, 7), true);
  assert.equal(gradePrediction(5, 7), false);
}

// --- Unreachable goal: walled-in start ---
{
  const sealed = buildMaze({
    id: 999,
    name: "Sealed",
    description: "test",
    layout: ["#####", "##S##", "#####", "##E##", "#####"],
  });
  const result = traceBfs(sealed);
  assert.equal(result.reachedExit, false);
  assert.deepEqual(result.path, []);
  assert.equal(shortestPathLength(result), -1);
}

// --- Dijkstra lab: short-expensive vs long-cheap fork ---
{
  const bfs = route(102, "bfs");
  const dijkstra = route(102, "dijkstra");
  const astar = route(102, "astar");

  assert.equal(bfs.reached, true);
  assert.deepEqual([bfs.moves, bfs.cost], [5, 13]);
  assert.deepEqual([dijkstra.moves, dijkstra.cost], [9, 9]);
  assert.deepEqual([astar.moves, astar.cost], [9, 9]);
  assert.ok(bfs.moves < dijkstra.moves);
  assert.ok(bfs.cost > dijkstra.cost);
}

// --- A* lab: same optimum, far less wandering ---
{
  const bfs = route(103, "bfs");
  const dijkstra = route(103, "dijkstra");
  const astar = route(103, "astar");

  for (const result of [bfs, dijkstra, astar]) {
    assert.equal(result.reached, true);
    assert.equal(result.moves, 7);
  }

  assert.deepEqual(
    [bfs.expanded, dijkstra.expanded, astar.expanded],
    [14, 14, 8]
  );
  assert.equal(astar.cost, dijkstra.cost);
  assert.ok(astar.expanded < bfs.expanded);
}

console.log("Learn lab checks passed!");
