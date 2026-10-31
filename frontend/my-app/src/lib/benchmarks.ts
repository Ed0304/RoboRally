import { BATTERY_MAX, canAfford, costsForMaze } from "./battery";
import type { LevelData } from "./levels";
import { buildMaze } from "./maze";
import {
  compareStrategies,
  previewOptionsFor,
  type SearchStrategy,
  type StrategyComparison,
} from "./pathfinding";

export interface BenchmarkEntry {
  strategy: SearchStrategy;
  reached: boolean;
  moves: number;
  cost: number;
  expanded: number;
  /** Measured wall-clock planning time; sub-ms differences are noise. */
  ms: number;
  affordable: boolean;
  /**
   * Projected battery remaining from a full charge (100 - cost);
   * null when unreachable or unaffordable.
   */
  remaining: number | null;
  reason: string;
}

export interface LevelBenchmarks {
  levelId: number;
  entries: BenchmarkEntry[];
}

/**
 * Run BFS, Dijkstra, and A* on the canonical level maze with the same
 * start, goal, movement rules, laser policy, and battery-cost model the
 * game executes with. Pure: never touches game state or the robot.
 */
export function benchmarkLevel(level: LevelData): LevelBenchmarks {
  const maze = buildMaze(level);
  const costs = costsForMaze(maze);
  const comparisons = compareStrategies(maze, maze.start, maze.exit, {
    ...previewOptionsFor(maze),
    costs,
  });

  return {
    levelId: level.id,
    entries: comparisons.map(toEntry),
  };
}

function toEntry({
  strategy,
  result,
  ms,
}: StrategyComparison): BenchmarkEntry {
  const affordable =
    result.reached && canAfford(BATTERY_MAX, result.cost);

  return {
    strategy,
    reached: result.reached,
    moves: result.moves,
    cost: result.cost,
    expanded: result.expanded,
    ms,
    affordable,
    remaining: affordable ? BATTERY_MAX - result.cost : null,
    reason: result.reason,
  };
}

/** Optimal (minimum-cost) reachable benchmark, i.e. Dijkstra when solved. */
export function optimalCostEntry(
  benchmarks: LevelBenchmarks
): BenchmarkEntry | null {
  let best: BenchmarkEntry | null = null;

  for (const entry of benchmarks.entries) {
    if (!entry.reached) continue;
    if (best === null || entry.cost < best.cost) best = entry;
  }

  return best;
}

/** Fewest-move reachable benchmark, i.e. BFS when solved. */
export function fewestMoveEntry(
  benchmarks: LevelBenchmarks
): BenchmarkEntry | null {
  let best: BenchmarkEntry | null = null;

  for (const entry of benchmarks.entries) {
    if (!entry.reached) continue;
    if (best === null || entry.moves < best.moves) best = entry;
  }

  return best;
}
