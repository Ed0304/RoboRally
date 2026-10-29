
import type { MazeDefinition } from "./maze";

export interface RobotState {
  x: number;
  z: number;
  direction: "north" | "south" | "east" | "west";
}

export function canMoveTo(
  x: number,
  z: number,
  maze: MazeDefinition
): boolean {
  const tile = maze.tiles.find(
    (tile) => tile.x === x && tile.z === z
  );

  return tile !== undefined && tile.type !== "wall";
}

export function moveRobot(
  state: RobotState,
  direction: RobotState["direction"],
  maze: MazeDefinition
): RobotState {
  const offsets = {
    north: { x: 0, z: -1 },
    south: { x: 0, z: 1 },
    east: { x: 1, z: 0 },
    west: { x: -1, z: 0 },
  };

  const offset = offsets[direction];
  const nextX = state.x + offset.x;
  const nextZ = state.z + offset.z;

  if (!canMoveTo(nextX, nextZ, maze)) {
    return { ...state, direction };
  }

  return {
    x: nextX,
    z: nextZ,
    direction,
  };
}
