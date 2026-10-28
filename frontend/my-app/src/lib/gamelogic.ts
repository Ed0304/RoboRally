
import { maze, MAZE_WIDTH, MAZE_DEPTH } from "./maze";

export interface RobotState {
  x: number;
  z: number;
  direction: "north" | "south" | "east" | "west";
}

export const initialRobotState: RobotState = {
  x: 1,
  z: 1,
  direction: "south",
};

export function canMoveTo(x: number, z: number): boolean {
  if (
    x < 0 ||
    x >= MAZE_WIDTH ||
    z < 0 ||
    z >= MAZE_DEPTH
  ) {
    return false;
  }

  const tile = maze.find(
    (tile) => tile.x === x && tile.z === z
  );

  return tile !== undefined && tile.type !== "wall";
}

export function moveRobot(
  state: RobotState,
  direction: RobotState["direction"]
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

  // Always update the facing direction, even if blocked.
  if (!canMoveTo(nextX, nextZ)) {
    return { ...state, direction };
  }

  return {
    x: nextX,
    z: nextZ,
    direction,
  };
}
