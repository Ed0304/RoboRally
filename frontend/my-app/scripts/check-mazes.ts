
import { levels } from "../data/levels";
import { buildMaze } from "@/lib/maze";
import { validateMaze } from "@/lib/mazevalidation";
import { planRoute } from "@/lib/pathfinding";

let allSolvable = true;

for (const level of levels) {
  const maze = buildMaze(level);
  const hasDoorMechanic = maze.tiles.some(
    (tile) => tile.type === "door" || tile.type === "trigger"
  );

  // Doors need trigger-state search: validateMaze treats doors as permanently
  // blocked, so door levels (e.g. L6's sealed exit chamber) use the real
  // door-aware planner under ordinary engine movement rules instead.
  const result = hasDoorMechanic
    ? (() => {
        const route = planRoute(maze, maze.start, maze.exit, {
          avoidLasers: false,
          dynamicDoors: true,
        });
        return {
          solvable: route.reached,
          visitedCount: -1,
          path: route.path,
        };
      })()
    : validateMaze(maze);

  console.log(
    `Level ${level.id}: ${level.name} — ${
      result.solvable ? "SOLVABLE" : "UNSOLVABLE"
    }`
  );

  if (result.visitedCount >= 0) {
    console.log(`  Tiles explored: ${result.visitedCount}`);
  }
  console.log(`  Shortest path: ${result.path.length > 0
    ? `${result.path.length - 1} moves`
    : "No path found"}`);

  if (!result.solvable) {
    allSolvable = false;
    console.error(`  ERROR: Level ${level.id} needs fixing!`);
  }
}

if (!allSolvable) {
  throw new Error("One or more mazes are unsolvable.");
}

console.log("All levels passed maze validation!");
