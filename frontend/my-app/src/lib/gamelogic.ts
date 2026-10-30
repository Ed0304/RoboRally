
import type { MazeDefinition } from "./maze";
import {
  isRobotDetected,
  hasEnemyLineOfSight,
  type EnemyPosition,
} from "./enemyAI";

export interface RobotState {
  x: number;
  z: number;
  direction: "north" | "south" | "east" | "west";
}

export type GameStatus = "playing" | "dead" | "won";

export function canMoveTo(
  x: number,
  z: number,
  maze: MazeDefinition
): boolean {
  const tile = maze.tiles.find(
    (tile) => tile.x === x && tile.z === z
  );

  return tile !== undefined && !tile.blocksMovement;
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

export function checkGameStatus(
  robot: RobotState,
  maze: MazeDefinition,
  enemies?: EnemyPosition[]
): GameStatus {
  // Lasers cause instant death.
  const touchingLaser = maze.tiles.some(
    (tile) =>
      tile.x === robot.x &&
      tile.z === robot.z &&
      tile.type === "laser"
  );

  if (touchingLaser) return "dead";

  // Use live patrol positions when supplied.
  // Otherwise, check the original enemy markers.
  const activeEnemies: EnemyPosition[] =
    enemies ??
    maze.tiles
      .filter((tile) => tile.type === "enemy")
      .map((tile, index) => ({
        id: `static-enemy-${index}`,
        x: tile.x,
        z: tile.z,
        routeIndex: 0,
        direction: 1,
        facing: "south",
      }));

  if (isRobotDetected(robot, activeEnemies, maze)) {
    return "dead";
  }

  // Reaching the exit wins, provided the robot survived the checks above.
  if (robot.x === maze.exit.x && robot.z === maze.exit.z) {
    return "won";
  }

  return "playing";
}
