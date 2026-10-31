import assert from "node:assert/strict";
import { levels } from "../data/levels";
import { buildMaze, type MazeDefinition } from "@/lib/maze";
import { canMoveTo } from "@/lib/gamelogic";
import { costsForMaze, moveCost } from "@/lib/battery";
import {
  planRoute,
  previewOptionsFor,
  type RouteCell,
  type SearchStrategy,
} from "@/lib/pathfinding";
import { lessonForLevel } from "@/lib/tutorials";

function levelMaze(id: number): MazeDefinition {
  const level = levels.find((entry) => entry.id === id);
  if (!level) throw new Error(`Level ${id} missing from data/levels.ts`);
  return buildMaze(level);
}

function route(
  maze: MazeDefinition,
  strategy: SearchStrategy,
  weighted: boolean
) {
  const costs = weighted ? costsForMaze(maze) : undefined;
  return planRoute(maze, maze.start, maze.exit, {
    ...previewOptionsFor(maze),
    strategy,
    costs,
  });
}

/** Every previewed step must be engine-legal, like real execution. */
function engineLegal(maze: MazeDefinition, path: RouteCell[]): boolean {
  if (path.length === 0) return false;
  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1];
    const next = path[i];
    if (Math.abs(next.x - prev.x) + Math.abs(next.z - prev.z) !== 1) {
      return false;
    }
    if (!canMoveTo(next.x, next.z, maze, false)) return false;
  }
  return true;
}

async function main(): Promise<void> {
  // --- One algorithm lesson per Tutorial level ---
  assert.equal(lessonForLevel(1)?.algorithm, "bfs");
  assert.equal(lessonForLevel(2)?.algorithm, "dijkstra");
  assert.equal(lessonForLevel(3)?.algorithm, "astar");
  assert.equal(lessonForLevel(4), null);
  assert.equal(lessonForLevel(0), null);

  // --- Encouraging tone, never failure-framed ---
  const banned = ["fail", "wrong", "inferior", "stupid", "loser"];
  const keywords: Record<number, string> = {
    1: "bfs",
    2: "dijkstra",
    3: "a*",
  };
  for (const id of [1, 2, 3]) {
    const lesson = lessonForLevel(id);
    assert.ok(lesson);
    assert.ok(lesson.title.includes(`Level ${id}`));
    const copy = `${lesson.title} ${lesson.body.join(" ")}`.toLowerCase();
    assert.ok(
      copy.includes(keywords[id]),
      `L${id} lesson names its algorithm`
    );
    for (const word of banned) {
      assert.ok(!copy.includes(word), `L${id} copy avoids "${word}"`);
    }
  }

  // --- L1: unweighted BFS baseline, fewest moves ---
  {
    const maze = levelMaze(1);
    const bfs = route(maze, "bfs", false);
    assert.equal(bfs.reached, true, bfs.reason);
    assert.ok(engineLegal(maze, bfs.path));
    const types = new Set(maze.tiles.map((tile) => tile.type));
    for (const type of types) {
      assert.ok(
        ["wall", "floor", "exit"].includes(type),
        `L1 has only walls/floor/exit (found ${type})`
      );
    }
    const weighted = route(maze, "bfs", true);
    assert.equal(weighted.cost, weighted.moves);
  }

  // --- L2: shorter-but-expensive vs longer-but-cheap fork ---
  {
    const maze = levelMaze(2);
    const bfs = route(maze, "bfs", true);
    const dijkstra = route(maze, "dijkstra", true);
    const astar = route(maze, "astar", true);
    assert.equal(bfs.reached, true, bfs.reason);
    assert.equal(dijkstra.reached, true, dijkstra.reason);
    assert.equal(astar.reached, true, astar.reason);
    assert.ok(engineLegal(maze, bfs.path));
    assert.ok(engineLegal(maze, dijkstra.path));
    assert.ok(engineLegal(maze, astar.path));

    // Pinned trade-off: BFS takes the short taxed passage, Dijkstra/A*
    // take the long cheap corridor.
    assert.deepEqual([bfs.moves, bfs.cost], [14, 24]);
    assert.deepEqual([dijkstra.moves, dijkstra.cost], [18, 18]);
    assert.deepEqual([astar.moves, astar.cost], [18, 18]);
    assert.ok(bfs.moves < dijkstra.moves);
    assert.ok(bfs.cost > dijkstra.cost);
    assert.equal(astar.cost, dijkstra.cost);
    assert.notDeepEqual(
      bfs.path.map((cell) => `${cell.x},${cell.z}`),
      dijkstra.path.map((cell) => `${cell.x},${cell.z}`)
    );

    // Taxed tiles use the canonical mapping: rough 3, drain 5.
    const costs = costsForMaze(maze);
    const rough = maze.tiles.filter((tile) => tile.type === "rough");
    const drain = maze.tiles.filter((tile) => tile.type === "drain");
    assert.ok(rough.length > 0 && drain.length > 0);
    for (const tile of rough) {
      assert.equal(moveCost(costs, tile.x, tile.z), 3);
    }
    for (const tile of drain) {
      assert.equal(moveCost(costs, tile.x, tile.z), 5);
    }
  }

  // --- L3: A* finds the optimum while exploring less than BFS ---
  {
    const maze = levelMaze(3);
    const bfs = route(maze, "bfs", true);
    const dijkstra = route(maze, "dijkstra", true);
    const astar = route(maze, "astar", true);
    assert.equal(bfs.reached, true, bfs.reason);
    assert.equal(dijkstra.reached, true, dijkstra.reason);
    assert.equal(astar.reached, true, astar.reason);
    assert.equal(astar.cost, dijkstra.cost);
    assert.ok(
      astar.expanded < bfs.expanded,
      `A* explores less (${astar.expanded} < ${bfs.expanded})`
    );
  }

  // --- Planning never mutates the maze or game state ---
  {
    const maze = levelMaze(2);
    const before = JSON.stringify(maze);
    route(maze, "astar", true);
    assert.equal(JSON.stringify(maze), before);
  }

  console.log("All tutorial checks passed!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
