"use client";

import { useEffect, useMemo, useState } from "react";
import type { MazeDefinition } from "@/lib/maze";
import type { CostModel } from "@/lib/battery";
import {
  planRoute,
  previewOptionsFor,
  type SearchStrategy,
} from "@/lib/pathfinding";
import { cellKey } from "@/lib/bfs";
import MazeGrid from "./MazeGrid";

const AUTOPLAY_MS = 150;

const TITLES: Record<SearchStrategy, string> = {
  bfs: "BFS",
  dijkstra: "Dijkstra",
  astar: "A*",
};

/**
 * Generic step-through visualizer over a planRoute expansion order.
 * Explored cells are states the planner expanded, in pop order; the
 * green overlay is the final route. Never touches game state.
 */
export default function CostLab({
  maze,
  strategy,
  costs,
}: {
  maze: MazeDefinition;
  strategy: SearchStrategy;
  costs: CostModel;
}) {
  const result = useMemo(
    () =>
      planRoute(maze, maze.start, maze.exit, {
        ...previewOptionsFor(maze),
        strategy,
        costs,
      }),
    [maze, strategy, costs]
  );

  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showPath, setShowPath] = useState(false);

  const totalSteps = result.order.length;

  useEffect(() => {
    if (!playing) return undefined;

    if (step >= totalSteps) {
      setPlaying(false);
      return undefined;
    }

    const timer = window.setInterval(() => {
      setStep((current) => Math.min(current + 1, totalSteps));
    }, AUTOPLAY_MS);

    return () => window.clearInterval(timer);
  }, [playing, step, totalSteps]);

  const explored = useMemo(
    () => new Set(result.order.slice(0, step).map(cellKey)),
    [result.order, step]
  );
  const current = step > 0 ? (result.order[step - 1] ?? null) : null;
  const path =
    showPath && result.reached
      ? new Set(result.path.map(cellKey))
      : undefined;

  const hasWeighted = useMemo(
    () =>
      maze.tiles.some(
        (tile) => tile.type === "rough" || tile.type === "drain"
      ),
    [maze]
  );

  function reset() {
    setPlaying(false);
    setStep(0);
    setShowPath(false);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <MazeGrid
        maze={maze}
        explored={explored}
        path={path}
        current={current}
        label={`${TITLES[strategy]} exploration at step ${step} of ${totalSteps}`}
      />

      <div className="flex flex-col gap-4">
        <p role="status" className="text-sm text-muted">
          Step {step} of {totalSteps} · {explored.size} explored
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || playing}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold transition hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(s + 1, totalSteps))}
            disabled={step >= totalSteps || playing}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold transition hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Step →
          </button>
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            disabled={step >= totalSteps && !playing}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-accent-foreground transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {playing ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold transition hover:border-accent/60"
          >
            Reset
          </button>
        </div>

        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={showPath}
            onChange={(event) => setShowPath(event.target.checked)}
            className="h-4 w-4 accent-[#F2A93B]"
          />
          Show final route overlay
        </label>

        {result.reached ? (
          <p className="text-sm leading-6 text-muted">
            {TITLES[strategy]} finds a {result.moves}-move route costing{" "}
            {result.cost}% battery after expanding {result.expanded}{" "}
            states.
          </p>
        ) : (
          <p className="text-sm leading-6 text-muted">
            No route: {result.reason}
          </p>
        )}

        {hasWeighted && (
          <p className="text-xs leading-5 text-muted">
            Tile costs match the game: plain floor 1%, rough (3) 3%,
            drain (5) 5%. The start tile is free.
          </p>
        )}
      </div>
    </div>
  );
}
