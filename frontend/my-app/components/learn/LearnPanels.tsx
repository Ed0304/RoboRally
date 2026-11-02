"use client";

import { useEffect, useMemo, useState } from "react";
import { buildMaze, type MazeDefinition } from "@/lib/maze";
import type { LevelData } from "@/lib/levels";
import type { CostModel } from "@/lib/battery";
import {
  cellKey,
  gradePrediction,
  shortestPathLength,
  traceBfs,
  type BfsTrace,
} from "@/lib/bfs";
import { bfsStepToEvent } from "@/lib/explainSearch";
import {
  planRoute,
  previewOptionsFor,
  type SearchStrategy,
} from "@/lib/pathfinding";
import MazeGrid from "./MazeGrid";
import ThinkingPanel from "./ThinkingPanel";

const AUTOPLAY_MS = 150;

export interface LabMaze {
  level: LevelData;
  maze: MazeDefinition;
  trace: BfsTrace;
}

/** Build a BFS lab synchronously from an original practice maze. */
export function buildBfsLab(level: LevelData): LabMaze {
  const maze = buildMaze(level);
  return { level, maze, trace: traceBfs(maze) };
}

function planFor(
  maze: MazeDefinition,
  strategy: SearchStrategy,
  costs: CostModel
) {
  return planRoute(maze, maze.start, maze.exit, {
    ...previewOptionsFor(maze),
    strategy,
    costs,
  });
}

export function LessonSection({ lab }: { lab: LabMaze }) {
  const { level, maze, trace } = lab;
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showPath, setShowPath] = useState(false);

  const totalSteps = trace.steps.length;

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

  const overlay = useMemo(() => {
    const explored = new Set<string>();
    let frontier = new Set<string>();
    let current = null;

    if (step === 0) {
      frontier = new Set([cellKey(maze.start)]);
    } else {
      for (let i = 0; i < step; i++) {
        explored.add(cellKey(trace.steps[i].current));
      }

      const last = trace.steps[step - 1];
      frontier = new Set(last.frontier.map(cellKey));
      current = last.current;
    }

    return { explored, frontier, current };
  }, [maze.start, step, trace.steps]);

  const path =
    showPath && trace.reachedExit
      ? new Set(trace.path.map(cellKey))
      : undefined;

  const thinkingEvent =
    step > 0 ? (trace.steps[step - 1] ?? null) : null;

  function reset() {
    setPlaying(false);
    setStep(0);
    setShowPath(false);
  }

  return (
    <section
      aria-labelledby="bfs-lesson"
      className="rounded-2xl border border-border bg-surface p-6 sm:p-8"
    >
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-accent">
        Guided lesson
      </p>
      <h2 id="bfs-lesson" className="mt-2 text-2xl font-black">
        How BFS explores {level.name}
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
        Breadth-first search explores the maze in waves. It keeps a
        first-in-first-out queue: every move costs the same, so the
        first time the exit leaves the queue, no shorter route can
        exist. Amber cells are the <strong>frontier</strong> (found but
        not yet expanded), blue cells are{" "}
        <strong>explored</strong>, and the green overlay is the final{" "}
        <strong>shortest path</strong>.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <MazeGrid
          maze={maze}
          explored={overlay.explored}
          frontier={overlay.frontier}
          path={path}
          current={overlay.current}
          label={`BFS exploration at step ${step} of ${totalSteps}`}
        />

        <div className="flex flex-col gap-4">
          <p role="status" className="text-sm text-muted">
            Step {step} of {totalSteps} · {overlay.explored.size}{" "}
            explored · {overlay.frontier.size} in frontier
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
              onClick={() =>
                setStep((s) => Math.min(s + 1, totalSteps))
              }
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
              onChange={(event) =>
                setShowPath(event.target.checked)
              }
              className="h-4 w-4 accent-[#F2A93B]"
            />
            Show shortest path overlay
          </label>

          <p className="text-sm leading-6 text-muted">
            Neighbor order is fixed (north, east, south, west), so
            every run explores identically. The search visits{" "}
            {trace.visitedCount} cells to prove a{" "}
            {shortestPathLength(trace)}-move route is shortest.
          </p>

          <ThinkingPanel
            strategy="bfs"
            event={thinkingEvent ? bfsStepToEvent(thinkingEvent) : null}
            step={step}
            total={totalSteps}
            summary={{
              reached: trace.reachedExit,
              moves: Math.max(trace.path.length - 1, 0),
              expanded: totalSteps,
            }}
          />
        </div>
      </div>
    </section>
  );
}

export function ChallengeCard({ trace }: { trace: BfsTrace }) {
  const answer = shortestPathLength(trace);
  const options = useMemo(
    () => [answer - 2, answer, answer + 2].sort((a, b) => a - b),
    [answer]
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);

  const correct =
    revealed && selected !== null && gradePrediction(selected, answer);

  function reset() {
    setSelected(null);
    setRevealed(false);
  }

  return (
    <section
      aria-labelledby="bfs-challenge"
      className="rounded-2xl border border-border bg-surface p-6 sm:p-8"
    >
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-accent">
        Learning challenge
      </p>
      <h2 id="bfs-challenge" className="mt-2 text-2xl font-black">
        Predict before you reveal
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
        Without counting the overlay: how many moves long is the
        shortest route from S to E? Commit to an answer first, then
        reveal the result.
      </p>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Path length options">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setSelected(option)}
            disabled={revealed}
            aria-pressed={selected === option}
            className={`rounded-lg border px-5 py-2.5 font-mono font-bold transition disabled:cursor-not-allowed ${
              selected === option
                ? "border-accent bg-accent/10 text-accent"
                : "border-border hover:border-accent/60"
            } ${revealed && option === answer ? "border-success text-success" : ""}`}
          >
            {option} moves
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setRevealed(true)}
          disabled={selected === null || revealed}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-accent-foreground transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          Reveal answer
        </button>
        {revealed && (
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-border px-5 py-2.5 text-sm font-semibold transition hover:border-accent/60"
          >
            Try again
          </button>
        )}
      </div>

      {revealed && (
        <div
          role="status"
          className="mt-4 rounded-xl border border-border bg-background p-4 text-sm leading-6"
        >
          <p className="font-bold">
            {correct
              ? "Correct. "
              : `Not quite — the answer is ${answer} moves. `}
          </p>
          <p className="mt-1 text-muted">
            BFS expands outward in distance waves, so the exit is
            first reached on wave {answer}. Any route must cross at
            least {answer} tiles, which is why no shorter path
            exists in this unweighted maze.
          </p>
        </div>
      )}
    </section>
  );
}

export function RouteChoiceChallenge({
  maze,
  costs,
}: {
  maze: MazeDefinition;
  costs: CostModel;
}) {
  const bfs = useMemo(() => planFor(maze, "bfs", costs), [maze, costs]);
  const dijkstra = useMemo(
    () => planFor(maze, "dijkstra", costs),
    [maze, costs]
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  if (!bfs.reached || !dijkstra.reached) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8">
        <p className="text-sm text-muted">
          This challenge needs a maze where both routes exist.
        </p>
      </section>
    );
  }

  const options = [
    {
      id: "short",
      label: `Short route: ${bfs.moves} moves, ${bfs.cost}% battery`,
    },
    {
      id: "cheap",
      label: `Long route: ${dijkstra.moves} moves, ${dijkstra.cost}% battery`,
    },
  ];
  const correct = revealed && selected === "cheap";

  function reset() {
    setSelected(null);
    setRevealed(false);
  }

  return (
    <section
      aria-labelledby="dijkstra-challenge"
      className="rounded-2xl border border-border bg-surface p-6 sm:p-8"
    >
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-accent">
        Learning challenge
      </p>
      <h2 id="dijkstra-challenge" className="mt-2 text-2xl font-black">
        Short or cheap — which wins?
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
        Dijkstra minimizes total battery cost, not move count. This
        maze has two corridors to the exit. Which route will Dijkstra
        choose? Commit first, then reveal.
      </p>

      <div
        className="mt-4 flex flex-wrap gap-2"
        role="group"
        aria-label="Route options"
      >
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setSelected(option.id)}
            disabled={revealed}
            aria-pressed={selected === option.id}
            className={`rounded-lg border px-5 py-2.5 font-mono text-sm font-bold transition disabled:cursor-not-allowed ${
              selected === option.id
                ? "border-accent bg-accent/10 text-accent"
                : "border-border hover:border-accent/60"
            } ${revealed && option.id === "cheap" ? "border-success text-success" : ""}`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setRevealed(true)}
          disabled={selected === null || revealed}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-accent-foreground transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          Reveal answer
        </button>
        {revealed && (
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-border px-5 py-2.5 text-sm font-semibold transition hover:border-accent/60"
          >
            Try again
          </button>
        )}
      </div>

      {revealed && (
        <div
          role="status"
          className="mt-4 rounded-xl border border-border bg-background p-4 text-sm leading-6"
        >
          <p className="font-bold">
            {correct
              ? "Correct. "
              : "Not quite — Dijkstra takes the long route. "}
          </p>
          <p className="mt-1 text-muted">
            The {bfs.moves}-move shortcut costs {bfs.cost}% battery
            because of its taxed tiles, while the {dijkstra.moves}
            -move corridor costs only {dijkstra.cost}%. Dijkstra
            always expands the cheapest unfinished cell first, so it
            settles on the cheapest total — even when that means
            walking further.
          </p>
        </div>
      )}
    </section>
  );
}

export function ExpandedChallenge({
  maze,
  costs,
}: {
  maze: MazeDefinition;
  costs: CostModel;
}) {
  const bfs = useMemo(() => planFor(maze, "bfs", costs), [maze, costs]);
  const astar = useMemo(
    () => planFor(maze, "astar", costs),
    [maze, costs]
  );
  const answer = astar.expanded;
  const options = useMemo(
    () => [answer - 2, answer, answer + 2].sort((a, b) => a - b),
    [answer]
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);

  const correct =
    revealed && selected !== null && selected === answer;

  function reset() {
    setSelected(null);
    setRevealed(false);
  }

  return (
    <section
      aria-labelledby="astar-challenge"
      className="rounded-2xl border border-border bg-surface p-6 sm:p-8"
    >
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-accent">
        Learning challenge
      </p>
      <h2 id="astar-challenge" className="mt-2 text-2xl font-black">
        How much searching can a hint save?
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
        BFS explores {bfs.expanded} states on this maze because it has
        no sense of direction. A* adds a Manhattan-distance hint
        pointing toward the exit. How many states will A* expand?
        Commit first, then reveal.
      </p>

      <div
        className="mt-4 flex flex-wrap gap-2"
        role="group"
        aria-label="State count options"
      >
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setSelected(option)}
            disabled={revealed}
            aria-pressed={selected === option}
            className={`rounded-lg border px-5 py-2.5 font-mono font-bold transition disabled:cursor-not-allowed ${
              selected === option
                ? "border-accent bg-accent/10 text-accent"
                : "border-border hover:border-accent/60"
            } ${revealed && option === answer ? "border-success text-success" : ""}`}
          >
            {option} states
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setRevealed(true)}
          disabled={selected === null || revealed}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-accent-foreground transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          Reveal answer
        </button>
        {revealed && (
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-border px-5 py-2.5 text-sm font-semibold transition hover:border-accent/60"
          >
            Try again
          </button>
        )}
      </div>

      {revealed && (
        <div
          role="status"
          className="mt-4 rounded-xl border border-border bg-background p-4 text-sm leading-6"
        >
          <p className="font-bold">
            {correct
              ? "Correct. "
              : `Not quite — the answer is ${answer} states. `}
          </p>
          <p className="mt-1 text-muted">
            The hint keeps A* walking toward the exit instead of
            draining down the dead-end corridor, so it expands{" "}
            {answer} states instead of {bfs.expanded} — while still
            finding the same optimal {astar.moves}-move route. Hints
            that never overestimate keep the answer optimal.
          </p>
        </div>
      )}
    </section>
  );
}
