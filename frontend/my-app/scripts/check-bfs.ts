
import assert from "node:assert/strict";
import { levels } from "../data/levels";
import { buildMaze } from "@/lib/maze";
import { validateMaze } from "@/lib/mazevalidation";
import {
  gradePrediction,
  shortestPathLength,
  traceBfs,
} from "@/lib/bfs";

const lab = levels.find((level) => level.id === 1);
assert.ok(lab, "Level 1 must exist for the lab");

// Lesson invariants: Level 1 must stay a walls-only static maze, or
// the BFS lesson's stated assumptions stop matching the game. Update
// the lesson before shipping any level change that breaks these.
{
  const allowed = new Set(["#", ".", "S", "E"]);

  for (const [z, row] of lab.layout.entries()) {
    for (const [x, symbol] of [...row].entries()) {
      assert.ok(
        allowed.has(symbol),
        `Level 1 lesson invariant broken: symbol "${symbol}" at ` +
          `(${x}, ${z}). The BFS lesson assumes only #, ., S, E.`
      );
    }
  }

  const flat = lab.layout.join("");
  const starts = [...flat].filter((s) => s === "S").length;
  const exits = [...flat].filter((s) => s === "E").length;
  assert.equal(
    starts,
    1,
    "Level 1 lesson invariant broken: expected exactly one start (S)."
  );
  assert.equal(
    exits,
    1,
    "Level 1 lesson invariant broken: expected exactly one exit (E)."
  );
}

const maze = buildMaze(lab);
const trace = traceBfs(maze);

// Correctness: shortest path from S to E.
assert.equal(trace.reachedExit, true);
assert.ok(trace.path.length > 1);
assert.deepEqual(trace.path[0], maze.start);
assert.deepEqual(trace.path[trace.path.length - 1], maze.exit);
for (let i = 1; i < trace.path.length; i++) {
  const dx = Math.abs(trace.path[i].x - trace.path[i - 1].x);
  const dz = Math.abs(trace.path[i].z - trace.path[i - 1].z);
  assert.equal(dx + dz, 1, "path steps must be adjacent");
}

// Independent oracle: the existing validator must agree.
{
  const expected = validateMaze(maze);
  assert.equal(
    expected.solvable,
    true,
    "Level 1 lesson invariant broken: the lab maze must stay solvable."
  );
  assert.equal(trace.path.length, expected.path.length);
  assert.equal(trace.visitedCount, expected.visitedCount);
}

// Deterministic ordering: North, East, South, West from (1, 1).
// North (1, 0) and West (0, 1) are walls, so East then South.
assert.deepEqual(trace.order[0], { x: 1, z: 1 });
assert.deepEqual(trace.order[1], { x: 2, z: 1 });
assert.deepEqual(trace.order[2], { x: 1, z: 2 });
assert.deepEqual(traceBfs(maze).order, trace.order);

// Frontier snapshots expand in FIFO wave order.
assert.ok(trace.steps.length > 0);
assert.deepEqual(trace.steps[0].current, { x: 1, z: 1 });
assert.equal(
  trace.steps[trace.steps.length - 1].current.x,
  maze.exit.x
);

// Unreachable goal: walled-in start.
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

// Challenge grading.
assert.equal(shortestPathLength(trace), trace.path.length - 1);
assert.equal(
  gradePrediction(trace.path.length - 1, trace.path.length - 1),
  true
);
assert.equal(gradePrediction(3, trace.path.length - 1), trace.path.length - 1 === 3);

console.log("BFS checks passed!");
