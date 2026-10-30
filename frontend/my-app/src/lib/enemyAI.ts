
import type { MazeDefinition, MazeTile } from "./maze";

export interface PatrolRoute {
  id: string;
  points: Array<{ x: number; z: number }>;
}

export type EnemyFacing = "north" | "south" | "east" | "west";

export interface EnemyPosition {
  id: string;
  x: number;
  z: number;
  routeIndex: number;
  direction: 1 | -1;
  facing: EnemyFacing;
}

function getTile(
  x: number,
  z: number,
  maze: MazeDefinition
): MazeTile | undefined {
  return maze.tiles.find((tile) => tile.x === x && tile.z === z);
}

function isBlockedForEnemy(
  x: number,
  z: number,
  maze: MazeDefinition
): boolean {
  const tile = getTile(x, z, maze);

  if (!tile) return true;

  return (
    tile.type === "wall" ||
    tile.type === "laser" ||
    tile.type === "door"
  );
}

function getFacing(
  from: { x: number; z: number },
  to: { x: number; z: number }
): EnemyFacing {
  const dx = to.x - from.x;
  const dz = to.z - from.z;

  if (dx > 0) return "east";
  if (dx < 0) return "west";
  if (dz > 0) return "south";
  return "north";
}

export function createEnemies(
  routes: PatrolRoute[],
  maze: MazeDefinition,
  initialFacing: EnemyFacing = "south"
): EnemyPosition[] {
  const mapEnemies = maze.tiles.filter(
    (tile) => tile.type === "enemy"
  );

  return routes.flatMap((route, index) => {
    if (route.points.length === 0) return [];

    const original = mapEnemies[index];

    const matchingIndex = original
      ? route.points.findIndex(
          (point) =>
            point.x === original.x && point.z === original.z
        )
      : -1;

    const routeIndex = matchingIndex >= 0 ? matchingIndex : 0;
    const start = route.points[routeIndex];

    const nextIndex = (routeIndex + 1) % route.points.length;
    const nextPoint = route.points[nextIndex];

    const facing =
      route.points.length > 1
        ? getFacing(start, nextPoint)
        : initialFacing;

    return [{
      id: route.id,
      x: start.x,
      z: start.z,
      routeIndex,
      direction: 1,
      facing,
    }];
  });
}

export function validatePatrolRoutes(
  routes: PatrolRoute[],
  maze: MazeDefinition
): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();

  for (const route of routes) {
    if (ids.has(route.id)) {
      errors.push(`Duplicate enemy route ID: ${route.id}`);
    }
    ids.add(route.id);

    if (route.points.length < 2) {
      errors.push(`Route ${route.id} needs at least two points.`);
      continue;
    }

    for (let i = 0; i < route.points.length; i++) {
      const point = route.points[i];
      const next = route.points[(i + 1) % route.points.length];

      if (isBlockedForEnemy(point.x, point.z, maze)) {
        errors.push(
          `Route ${route.id} crosses a wall, laser, door, or missing tile at (${point.x}, ${point.z}).`
        );
      }

      // Check every edge, including the final-to-first connection.
      const distance =
        Math.abs(next.x - point.x) +
        Math.abs(next.z - point.z);

      if (distance !== 1) {
        errors.push(
          `Route ${route.id} has non-adjacent points at index ${i} and ${(i + 1) % route.points.length}.`
        );
      }
    }
  }

  return errors;
}

export function advanceEnemies(
  enemies: EnemyPosition[],
  routes: PatrolRoute[],
  maze: MazeDefinition
): EnemyPosition[] {
  return enemies.map((enemy) => {
    const route = routes.find((item) => item.id === enemy.id);

    if (!route || route.points.length < 2) {
      return enemy;
    }

    const nextIndex =
      (enemy.routeIndex + 1) % route.points.length;

    const nextPoint = route.points[nextIndex];

    if (isBlockedForEnemy(nextPoint.x, nextPoint.z, maze)) {
      return enemy;
    }

    // Avoid moving into a tile currently occupied by another bot.
    const occupied = enemies.some(
      (other) =>
        other.id !== enemy.id &&
        other.x === nextPoint.x &&
        other.z === nextPoint.z
    );

    if (occupied) {
      return enemy;
    }

    return {
      ...enemy,
      x: nextPoint.x,
      z: nextPoint.z,
      routeIndex: nextIndex,
      facing: getFacing(enemy, nextPoint),
    };
  });
}

// Grid-based line of sight.
// Walls block vision, including diagonal corner gaps.
export function hasEnemyLineOfSight(
  enemyX: number,
  enemyZ: number,
  robotX: number,
  robotZ: number,
  maze: MazeDefinition
): boolean {
  const dx = robotX - enemyX;
  const dz = robotZ - enemyZ;

  const nx = Math.abs(dx);
  const nz = Math.abs(dz);
  const signX = Math.sign(dx);
  const signZ = Math.sign(dz);

  let x = enemyX;
  let z = enemyZ;
  let ix = 0;
  let iz = 0;

  const blocksVision = (cx: number, cz: number) => {
    if (
      (cx === enemyX && cz === enemyZ) ||
      (cx === robotX && cz === robotZ)
    ) {
      return false;
    }

    const tile = getTile(cx, cz, maze);
    return !tile || tile.type === "wall";
  };

  while (ix < nx || iz < nz) {
    const decision = (1 + 2 * ix) * nz - (1 + 2 * iz) * nx;

    if (decision === 0) {
      if (
        blocksVision(x + signX, z) ||
        blocksVision(x, z + signZ)
      ) {
        return false;
      }

      x += signX;
      z += signZ;
      ix++;
      iz++;
    } else if (decision < 0) {
      x += signX;
      ix++;
    } else {
      z += signZ;
      iz++;
    }

    if (blocksVision(x, z)) return false;
  }

  return true;
}

export function isRobotDetected(
  robot: { x: number; z: number },
  enemies: EnemyPosition[],
  maze: MazeDefinition,
  range = 2
): boolean {
  return enemies.some((enemy) => {
    const distance =
      Math.abs(enemy.x - robot.x) +
      Math.abs(enemy.z - robot.z);

    return (
      distance <= range &&
      hasEnemyLineOfSight(
        enemy.x,
        enemy.z,
        robot.x,
        robot.z,
        maze
      )
    );
  });
}
