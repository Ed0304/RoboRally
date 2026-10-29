
import { levels } from "@/lib/levels";
import { buildMaze } from "@/lib/maze";
import { validateMaze } from "@/lib/mazevalidation";

let allSolvable = true;

for (const level of levels) {
  const maze = buildMaze(level);
  const result = validateMaze(maze);

  console.log(
    `Level ${level.id}: ${level.name} — ${
      result.solvable ? "SOLVABLE" : "UNSOLVABLE"
    }`
  );

  console.log(`  Tiles explored: ${result.visitedCount}`);
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
