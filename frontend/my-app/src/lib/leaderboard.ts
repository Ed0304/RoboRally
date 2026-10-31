/**
 * Shared leaderboard ranking rules for completed Story Mode runs.
 * Pure functions: the same comparators back personal bests today and
 * any future server-side board, so rankings stay identical everywhere.
 */

export type LeaderboardCategory = "battery" | "moves" | "planner";

export interface RunMetrics {
  moves: number;
  remaining: number;
  execMs: number;
  /**
   * Actual battery spent divided by the optimal benchmark cost for the
   * same level (1.0 = matched the optimum). Reads marginally below 1.0
   * when execution deducts no entry cost for the final winning step.
   */
  costRatio: number;
  /** Actual moves divided by the fewest-move benchmark (1.0 = tied). */
  moveRatio: number;
  completedAt: string;
}

/**
 * Planner Challenger score: costRatio + moveRatio.
 *
 * Both inputs are measured ratios against deterministic benchmarks on
 * the same maze, so the score is transparent and comparable across
 * runs of one level: 2.0 means the run matched both the cheapest
 * route and the shortest route. Lower is better. Scores must never be
 * compared across different levels.
 */
export function plannerScore(run: RunMetrics): number {
  return run.costRatio + run.moveRatio;
}

function tieBreak(
  a: RunMetrics,
  b: RunMetrics,
  steps: Array<(run: RunMetrics) => number>
): number {
  for (const key of steps) {
    const diff = key(a) - key(b);
    if (diff !== 0) return diff;
  }

  // Final deterministic tie-break: earlier completion first.
  if (a.completedAt < b.completedAt) return -1;
  if (a.completedAt > b.completedAt) return 1;
  return 0;
}

/**
 * Negative when `a` ranks above `b`.
 * - battery: most remaining, then fewest moves, then fastest.
 * - moves: fewest moves, then most remaining, then fastest.
 * - planner: lowest score, then lowest cost ratio, then fewest
 *   moves, then fastest.
 */
export function compareRuns(
  a: RunMetrics,
  b: RunMetrics,
  category: LeaderboardCategory
): number {
  if (category === "battery") {
    return tieBreak(a, b, [
      (run) => -run.remaining,
      (run) => run.moves,
      (run) => run.execMs,
    ]);
  }

  if (category === "moves") {
    return tieBreak(a, b, [
      (run) => run.moves,
      (run) => -run.remaining,
      (run) => run.execMs,
    ]);
  }

  return tieBreak(a, b, [
    (run) => plannerScore(run),
    (run) => run.costRatio,
    (run) => run.moves,
    (run) => run.execMs,
  ]);
}

/** Ranked copy of `runs` for one category; the input is not mutated. */
export function rankRuns<T extends RunMetrics>(
  runs: T[],
  category: LeaderboardCategory
): T[] {
  return [...runs].sort((a, b) => compareRuns(a, b, category));
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Bounded pagination slice; page is 1-based and clamped. */
export function paginate<T>(
  ranked: T[],
  page: number,
  pageSize: number
): Page<T> {
  const safeSize = Math.max(1, Math.floor(pageSize) || 1);
  const totalPages = Math.max(1, Math.ceil(ranked.length / safeSize));
  const safePage = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  const start = (safePage - 1) * safeSize;

  return {
    items: ranked.slice(start, start + safeSize),
    page: safePage,
    pageSize: safeSize,
    total: ranked.length,
    totalPages,
  };
}
