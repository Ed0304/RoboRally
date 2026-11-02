import type { CostModel } from "./battery";
import type { MazeDefinition } from "./maze";
import {
  compareStrategies,
  previewOptionsFor,
  type RouteCell,
  type SearchStrategy,
  type StrategyComparison,
} from "./pathfinding";

/** Delay between replay steps: the ghost marker advances per tick. */
export const REPLAY_STEP_MS = 350;

/**
 * Delay between explored-cell reveals: each expansion stays up long
 * enough to read why the algorithm picked it. Deliberately slower
 * than the route-marker walk below.
 */
export const EXPLORED_STEP_MS = 2000;

export const STRATEGY_LABEL: Record<SearchStrategy, string> = {
  bfs: "BFS",
  dijkstra: "Dijkstra",
  astar: "A*",
};

/**
 * What-if routes for the post-win replay, computed with the IDENTICAL
 * maze, start, goal, laser policy, and cost model as benchmarkLevel, so
 * replayed moves/costs always match the Story Results numbers.
 * Pure: never touches game state, battery, or the robot.
 */
export function replayRoutes(
  maze: MazeDefinition,
  costs: CostModel
): StrategyComparison[] {
  return compareStrategies(maze, maze.start, maze.exit, {
    ...previewOptionsFor(maze),
    costs,
    trace: true,
  });
}

/**
 * Cells revealed up to a head index (inclusive), as "x,z" keys for the
 * MazeTiles highlight sets. Head is clamped. Used for both the route
 * trail (over the path) and the explored overlay (over the expansion
 * order): exploration first, route second.
 */
export function replayCells(
  path: RouteCell[],
  head: number
): ReadonlySet<string> {
  const cells = new Set<string>();
  if (path.length === 0 || head < 0) return cells;
  const last = Math.min(head, path.length - 1);
  for (let i = 0; i <= last; i++) {
    cells.add(`${path[i].x},${path[i].z}`);
  }
  return cells;
}
