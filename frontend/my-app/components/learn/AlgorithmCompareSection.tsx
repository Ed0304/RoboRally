
"use client";

import { useMemo } from "react";
import { cellKey } from "@/lib/bfs";
import type { CostModel } from "@/lib/battery";
import type { MazeDefinition } from "@/lib/maze";
import {
  compareStrategies,
  previewOptionsFor,
  type SearchStrategy,
  type StrategyComparison,
} from "@/lib/pathfinding";
import MazeGrid from "./MazeGrid";

const TITLES: Record<SearchStrategy, string> = {
  bfs: "BFS — fewest moves",
  dijkstra: "Dijkstra — cheapest cost",
  astar: "A* — cheapest cost, guided",
};

/** One-line node-prioritization rule, matching the planner's pop rule. */
const STRATEGY_RULE: Record<SearchStrategy, string> = {
  bfs: "Expands cells in arrival order, wave by wave.",
  dijkstra:
    "Expands the unfinished cell with the lowest cost so far, g(n).",
  astar:
    "Expands the lowest cost so far plus estimated remaining, f(n) = g(n) + h(n).",
};

function StrategyPanel({
  maze,
  comparison,
}: {
  maze: MazeDefinition;
  comparison: StrategyComparison;
}) {
  const { strategy, result, ms } = comparison;

  const explored = useMemo(
    () => new Set(result.order.map(cellKey)),
    [result.order]
  );
  const path = useMemo(
    () => new Set(result.path.map(cellKey)),
    [result.path]
  );

  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <h3 className="font-bold">{TITLES[strategy]}</h3>
      <p className="mt-1 text-xs leading-5 text-muted">
        {STRATEGY_RULE[strategy]}
      </p>
      <div className="mt-3">
        <MazeGrid
          maze={maze}
          explored={explored}
          path={result.reached ? path : undefined}
          label={`${TITLES[strategy]} search coverage${result.reached ? " and route" : " (no route)"}`}
        />
      </div>
      <dl className="mt-3 space-y-1 text-sm text-muted">
        <div className="flex justify-between gap-2">
          <dt>Route</dt>
          <dd
            className={`font-bold ${result.reached ? "text-success" : "text-danger"}`}
          >
            {result.reached ? "Found" : "Unavailable"}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Moves</dt>
          <dd className="font-mono font-bold text-foreground">
            {result.reached ? result.moves : "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Est. battery</dt>
          <dd className="font-mono font-bold text-foreground">
            {result.reached ? `≈${result.cost}%` : "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>States expanded</dt>
          <dd className="font-mono font-bold text-foreground">
            {result.expanded}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Planning time</dt>
          <dd className="font-mono font-bold text-foreground">
            {ms.toFixed(2)} ms
          </dd>
        </div>
      </dl>
      {!result.reached && (
        <p className="mt-2 text-xs leading-5 text-muted">{result.reason}</p>
      )}
    </div>
  );
}

export default function AlgorithmCompareSection({
  maze,
  costs,
  mazeName,
}: {
  maze: MazeDefinition;
  costs: CostModel;
  mazeName: string;
}) {
  const comparisons = useMemo(
    () =>
      compareStrategies(maze, maze.start, maze.exit, {
        ...previewOptionsFor(maze),
        costs,
      }),
    [maze, costs]
  );

  const [bfs, dijkstra, astar] = comparisons;
  const allReached = comparisons.every((c) => c.result.reached);
  // Dijkstra and A* are both optimal, so they often agree on cost;
  // compare the actual cell sequences before claiming one route.
  const sameOptimum =
    dijkstra.result.reached &&
    astar.result.reached &&
    dijkstra.result.moves === astar.result.moves &&
    dijkstra.result.cost === astar.result.cost;
  const sameCells =
    sameOptimum &&
    dijkstra.result.path.map(cellKey).join(" ") ===
      astar.result.path.map(cellKey).join(" ");
  const effortDiffers =
    sameOptimum &&
    dijkstra.result.expanded !== astar.result.expanded;
  const sameMoves =
    allReached &&
    bfs.result.moves === dijkstra.result.moves &&
    bfs.result.moves === astar.result.moves;
  const sameCost =
    allReached &&
    bfs.result.cost === dijkstra.result.cost &&
    bfs.result.cost === astar.result.cost;
  const leastExpanded = [...comparisons].sort(
    (a, b) => a.result.expanded - b.result.expanded
  )[0];

  return (
    <section
      aria-labelledby="algorithm-comparison"
      className="rounded-2xl border border-border bg-surface p-6 sm:p-8"
    >
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-accent">
        Algorithm comparison
      </p>
      <h2 id="algorithm-comparison" className="mt-2 text-2xl font-black">
        BFS vs Dijkstra vs A*
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
        All three strategies plan on the identical practice maze (
        {mazeName}
        ), start, exit, four-direction movement, and tile costs. These
        are deterministic previews computed in your browser: not AI
        plans, not executed, and costing no battery.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {comparisons.map((comparison) => (
          <StrategyPanel
            key={comparison.strategy}
            maze={maze}
            comparison={comparison}
          />
        ))}
      </div>

      <div className="mt-6 space-y-3 text-sm leading-6 text-muted">
        {allReached && sameMoves && sameCost ? (
          <p>
            All three found {bfs.result.moves}-move routes at ≈
            {bfs.result.cost}% battery. That agreement is expected, not a
            tie to break: with every move costing the same, fewest moves
            and cheapest cost are the same optimum, so BFS, Dijkstra, and
            A* all reach it. They differ in search effort instead — BFS
            expanded {bfs.result.expanded} states, Dijkstra{" "}
            {dijkstra.result.expanded}, and A* {astar.result.expanded}.
            {leastExpanded.strategy !== "bfs" &&
              ` ${TITLES[leastExpanded.strategy].split(" — ")[0]} explored the fewest states here.`}{" "}
            No algorithm is universally best: Dijkstra and A* only pay
            off over BFS once moves have different costs.
          </p>
        ) : (
          <p>
            The strategies disagree on this maze: BFS reports{" "}
            {bfs.result.reached
              ? `${bfs.result.moves} moves at ≈${bfs.result.cost}%`
              : "no route"}
            , Dijkstra reports{" "}
            {dijkstra.result.reached
              ? `${dijkstra.result.moves} moves at ≈${dijkstra.result.cost}%`
              : "no route"}
            , and A* reports{" "}
            {astar.result.reached
              ? `${astar.result.moves} moves at ≈${astar.result.cost}%`
              : "no route"}
            . BFS minimizes move count while Dijkstra and A* minimize
            battery cost, so they can legitimately choose different
            routes.
          </p>
        )}
        {sameOptimum && sameCells && effortDiffers && (
          <p>
            Dijkstra and A* traced the identical{" "}
            {dijkstra.result.moves}-move route at ≈
            {dijkstra.result.cost}% — the same optimum, found two
            ways. Dijkstra expanded {dijkstra.result.expanded}{" "}
            states by reaching outward in cost order with no sense of
            direction, while A* expanded {astar.result.expanded}{" "}
            states by aiming each expansion at the exit with its
            Manhattan hint. Same green route, different blue search:
            the coverage is the lesson here, not the path.
          </p>
        )}
        {sameOptimum && sameCells && !effortDiffers && (
          <p>
            Dijkstra and A* traced the identical route and expanded
            the same {dijkstra.result.expanded} states — on this maze
            even the search matched. The heuristic only saves effort
            where it can rule cells out; it never changes the optimum.
          </p>
        )}
        {sameOptimum && !sameCells && (
          <p>
            Dijkstra and A* reached the same optimum (
            {dijkstra.result.moves} moves at ≈{dijkstra.result.cost}
            %) through different cells — tied frontiers can break
            either way. Dijkstra expanded {dijkstra.result.expanded}{" "}
            states, A* {astar.result.expanded}. Equal cost with
            different routes is still agreement on the optimum.
          </p>
        )}
        <p className="text-xs leading-5">
          Metric definitions: moves = steps on the found route; est.
          battery = entry-cost sum at floor 1%, rough 3%, drain 5%
          (start tile free); states expanded = search states removed
          from the frontier for processing, counted inside the planner;
          planning time = measured wall clock, where differences under
          a millisecond are noise rather than a performance win.
        </p>
      </div>
    </section>
  );
}
