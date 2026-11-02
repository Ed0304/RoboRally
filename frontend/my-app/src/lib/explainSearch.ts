
import type { BfsStep } from "./bfs";
import type {
  SearchStrategy,
  SearchTraceEvent,
} from "./pathfinding";

/**
 * Beginner-language identity + pop rule per strategy. Each rule states the
 * exact rule the implementation's pop uses (FIFO levels for BFS,
 * minimum known cost for Dijkstra, minimum g + h for A*).
 */
export const STRATEGY_INTRO: Record<
  SearchStrategy,
  { name: string; rule: string }
> = {
  bfs: {
    name: "Breadth-first search",
    rule: "Explores level by level, visiting every neighboring cell before moving farther away — so the first route it finds uses the fewest moves.",
  },
  dijkstra: {
    name: "Dijkstra's algorithm",
    rule: "Always expands the waiting cell with the lowest known cost so far — ties go to the cell discovered first — so the first route it finds is the cheapest.",
  },
  astar: {
    name: "A* search",
    rule: "Prioritizes waiting cells by estimated total cost f(n) = g(n) + h(n): the cost already paid plus a straight-line guess at what remains.",
  },
};

export interface StepStat {
  label: string;
  value: string;
}

export interface StepNarration {
  headline: string;
  detail: string;
  stats: StepStat[];
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Adapt a BFS-lesson step to the shared trace event shape. BFS never
 * re-prioritizes, so `updated` is always empty; distance in moves plays
 * the role of g(n).
 */
export function bfsStepToEvent(step: BfsStep): SearchTraceEvent {
  return {
    node: { ...step.current },
    g: step.depth,
    h: 0,
    f: step.depth,
    frontierSize: step.frontier.length,
    added: step.added.map((cell) => ({ ...cell })),
    updated: [],
    skippedBlocked: step.skippedBlocked,
    skippedSeen: step.skippedSeen,
    goal: step.goal,
  };
}

function goalNarration(strategy: SearchStrategy): StepNarration {
  const detail =
    strategy === "bfs"
      ? "This cell is the exit. Because BFS explores level by level, the route back to the start from here uses the fewest moves."
      : strategy === "dijkstra"
        ? "This cell is the exit. Because Dijkstra always expands the cheapest waiting cell first, the route back to the start from here costs the least battery."
        : "This cell is the exit. The f(n) = g(n) + h(n) guidance paid off: the route back to the start from here costs the least battery.";

  return { headline: "Exit reached!", detail, stats: [] };
}

/**
 * Narrate one real expansion in plain English. Every number comes from
 * the recorded event; nothing is invented or re-simulated.
 */
export function describeStep(
  strategy: SearchStrategy,
  event: SearchTraceEvent
): StepNarration {
  if (event.goal) return goalNarration(strategy);

  const moves = plural(event.g, "move", "moves");
  const headline =
    strategy === "bfs"
      ? `Exploring a cell ${moves} from the start`
      : strategy === "dijkstra"
        ? `Expanding the cheapest waiting cell (cost ${event.g})`
        : `Expanding the most promising cell (f = ${event.f})`;

  const stats: StepStat[] =
    strategy === "astar"
      ? [
          { label: "g(n) · paid", value: `${event.g}` },
          { label: "h(n) · guessed left", value: `${event.h}` },
          { label: "f(n) · total", value: `${event.f}` },
        ]
      : strategy === "dijkstra"
        ? [{ label: "Cost so far", value: `${event.g}% battery` }]
        : [{ label: "Distance from start", value: moves }];

  const parts: string[] = [];

  if (event.added.length > 0) {
    parts.push(
      `discovers ${plural(event.added.length, "new cell", "new cells")} for the waiting line`
    );
  }
  if (event.updated.length > 0) {
    parts.push(
      `finds a cheaper way to ${plural(event.updated.length, "waiting cell", "waiting cells")} and moves ${event.updated.length === 1 ? "it" : "them"} up the line`
    );
  }
  if (event.skippedSeen > 0) {
    parts.push(
      `skips ${plural(event.skippedSeen, "neighbor", "neighbors")} already seen`
    );
  }
  if (event.skippedBlocked > 0) {
    parts.push(
      `ignores ${plural(event.skippedBlocked, "blocked neighbor", "blocked neighbors")}`
    );
  }

  const outcome =
    parts.length > 0
      ? `It ${parts.join(", ")}.`
      : "It checks the neighbors and finds nothing new.";

  const waiting =
    event.frontierSize > 0
      ? ` ${plural(event.frontierSize, "cell waits", "cells wait")} in line for the next pick.`
      : " The waiting line is now empty.";

  return { headline, detail: `${outcome}${waiting}`, stats };
}

export interface SummaryInput {
  reached: boolean;
  moves: number;
  expanded: number;
  /** Battery cost of the route; omitted where costs don't apply. */
  cost?: number;
  /** Human-readable outcome; used when no route was found. */
  reason?: string;
}

/**
 * Final summary in plain English, from the real outcome numbers.
 */
export function describeSummary(
  strategy: SearchStrategy,
  summary: SummaryInput
): string {
  if (!summary.reached) {
    const explored = `No route found after exploring ${plural(summary.expanded, "cell", "cells")}.`;
    return summary.reason ? `${explored} ${summary.reason}` : explored;
  }

  const moves = plural(summary.moves, "move", "moves");
  const explored = plural(summary.expanded, "cell", "cells");

  if (strategy === "bfs" || summary.cost === undefined) {
    return `Shortest route: ${moves} after exploring ${explored}.`;
  }

  return `Cheapest route: ${moves} costing ≈${summary.cost}% battery, found after exploring ${explored}.`;
}
