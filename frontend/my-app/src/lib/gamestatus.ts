
import type { MazeDefinition } from "@/lib/maze";
import type { RobotState } from "@/lib/gamelogic";

export function hasWon(
  state: RobotState,
  maze: MazeDefinition
): boolean {
  const tile = maze.tiles.find(
    (tile) => tile.x === state.x && tile.z === state.z
  );

  return tile?.type === "exit";
}
