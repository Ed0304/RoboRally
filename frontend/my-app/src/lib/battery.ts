
import type { MazeDefinition } from "./maze";
import { canMoveTo } from "./gamelogic";
import type { RouteCell } from "./pathfinding";

/**
 * Centralized movement-cost model. Ordinary movement costs 1% battery per
 * tile. Higher costs exist only where a gameplay representation defines them;
 * the current game defines no special terrain, so DEFAULT_COSTS charges 1
 * everywhere. Tests may supply overrides to exercise weighted planning.
 */
export const BATTERY_MAX = 100;
export const STANDARD_MOVE_COST = 1;
export const MIN_MOVE_COST = 1;

export interface CostModel {
  defaultCost: number;
  /** "x,z" -> entry cost for special tiles. Empty in the live game. */
  overrides: ReadonlyMap<string, number>;
}

export const DEFAULT_COSTS: CostModel = {
  defaultCost: STANDARD_MOVE_COST,
  overrides: new Map(),
};

/** Battery cost of entering tile (x, z). */
export function moveCost(costs: CostModel, x: number, z: number): number {
  return costs.overrides.get(`${x},${z}`) ?? costs.defaultCost;
}

/** Entry cost by tile type: floor 1, rough (3) 3, drain (5) 5. */
export function tileEntryCost(type: string): number {
  if (type === "rough") return 3;
  if (type === "drain") return 5;
  return STANDARD_MOVE_COST;
}

/**
 * Cost model derived from a maze's weighted tiles. Single source mapping
 * terrain to battery cost; used identically by previews, estimates, and
 * execution deductions.
 */
export function costsForMaze(maze: MazeDefinition): CostModel {
  const overrides = new Map<string, number>();

  for (const tile of maze.tiles) {
    if (tile.type === "rough" || tile.type === "drain") {
      overrides.set(`${tile.x},${tile.z}`, tileEntryCost(tile.type));
    }
  }

  return { defaultCost: STANDARD_MOVE_COST, overrides };
}

/** Total battery cost of a route. The start tile costs 0. */
export function routeCost(path: RouteCell[], costs: CostModel): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += moveCost(costs, path[i].x, path[i].z);
  }
  return total;
}

export type MoveDirection = "north" | "south" | "east" | "west";

const OFFSETS: Record<MoveDirection, { x: number; z: number }> = {
  north: { x: 0, z: -1 },
  south: { x: 0, z: 1 },
  east: { x: 1, z: 0 },
  west: { x: -1, z: 0 },
};

/** Cell the robot would enter when moving in a direction. */
export function stepDestination(
  x: number,
  z: number,
  direction: MoveDirection
): RouteCell {
  const offset = OFFSETS[direction];
  return { x: x + offset.x, z: z + offset.z };
}

/**
 * Estimated battery cost of executing a direction list from a start cell,
 * assuming the maze does not change. Blocked steps cost nothing (a blocked
 * move does not move the robot) and end the estimate, matching execution,
 * which stops at the first blocked step.
 */
export function estimatePlanCost(
  directions: MoveDirection[],
  start: RouteCell,
  maze: MazeDefinition,
  doorOpen: boolean,
  costs: CostModel
): { cost: number; steps: number } {
  let cost = 0;
  let steps = 0;
  let x = start.x;
  let z = start.z;
  let door = doorOpen;

  for (const direction of directions) {
    const offset = OFFSETS[direction];
    const nx = x + offset.x;
    const nz = z + offset.z;

    if (!canMoveTo(nx, nz, maze, door)) break;

    cost += moveCost(costs, nx, nz);
    steps++;
    x = nx;
    z = nz;

    const tile = maze.tiles.find((t) => t.x === nx && t.z === nz);
    if (tile?.type === "trigger") door = true;
  }

  return { cost, steps };
}

/** True when the remaining battery covers a cost. */
export function canAfford(battery: number, cost: number): boolean {
  return battery >= cost;
}

/** Battery remaining after paying a cost. Callers must check affordability. */
export function deductBattery(battery: number, cost: number): number {
  return battery - cost;
}

/**
 * Cumulative entry cost after each step of a path (excludes the start tile,
 * which costs 0). Entry i is the cost of reaching path[i + 1].
 */
export function prefixCosts(path: RouteCell[], costs: CostModel): number[] {
  const out: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += moveCost(costs, path[i].x, path[i].z);
    out.push(total);
  }
  return out;
}

/**
 * Per-move consumption toast text, e.g. "−1% Battery · 99% remaining".
 * Returns null when nothing was consumed (zero-cost step): no toast, since
 * there is no consumption to report. Uses U+2212 minus for readability.
 */
export function toastForMove(cost: number, remaining: number): string | null {
  if (cost <= 0) return null;
  return `−${cost}% Battery · ${remaining}% remaining`;
}
