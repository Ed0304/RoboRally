
"use client";

import { useEffect, useMemo, useState } from "react";
import { buildMaze, type MazeDefinition } from "@/lib/maze";
import type { LevelData } from "@/lib/levels";
import type { ApiLevel } from "@/lib/apilevels";
import {
  cellKey,
  gradePrediction,
  shortestPathLength,
  traceBfs,
  type BfsTrace,
} from "@/lib/bfs";
import MazeGrid from "./MazeGrid";

export const LAB_LEVEL_ID = 1;
const AUTOPLAY_MS = 150;

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface LabMaze {
  level: LevelData;
  maze: MazeDefinition;
  trace: BfsTrace;
}

export type LabMazeState =
  | { status: "loading" }
  | { status: "ready"; lab: LabMaze }
  | { status: "error"; message: string };

/**
 * Load the lab maze from the same API-served Level 1 the main game
 * and backend planner use. No static fallback: silently substituting
 * a different maze would hide exactly the mismatch this guards.
 */
export function useLabMaze() {
  const [state, setState] = useState<LabMazeState>({
    status: "loading",
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function fetchLabMaze() {
      setState({ status: "loading" });

      try {
        const response = await fetch(
          `${API_URL}/api/levels/${LAB_LEVEL_ID}`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error(
            `Level ${LAB_LEVEL_ID} unavailable (${response.status}).`
          );
        }

        const data = (await response.json()) as ApiLevel;

        if (
          data.id !== LAB_LEVEL_ID ||
          typeof data.name !== "string" ||
          typeof data.description !== "string" ||
          !Array.isArray(data.layout) ||
          !data.layout.every((row) => typeof row === "string")
        ) {
          throw new Error("The server returned invalid level data.");
        }

        const level: LevelData = {
          id: data.id,
          name: data.name,
          description: data.description,
          layout: data.layout,
        };
        const maze = buildMaze(level);

        if (active) {
          setState({
            status: "ready",
            lab: { level, maze, trace: traceBfs(maze) },
          });
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;

        if (active) {
          setState({
            status: "error",
            message:
              err instanceof Error
                ? err.message
                : "Unable to load the lab maze.",
          });
        }
      }
    }

    fetchLabMaze();

    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt]);

  return {
    state,
    retry: () => setAttempt((count) => count + 1),
  };
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
