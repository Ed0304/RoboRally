import { maze } from "@/lib/maze";
import type { RobotState } from "@/lib/gamelogic";

export function hasWon(state: RobotState): boolean {
  const tile = maze.find(
    (tile) => tile.x === state.x && tile.z === state.z
  );

  return tile?.type === "exit";
}