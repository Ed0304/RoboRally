
"use client";

import Link from "next/link";
import { ChallengeCard, LessonSection, useLabMaze } from "../../../components/learn/LearnPanels";
import CompareSection from "../../../components/learn/CompareSection";
import AlgorithmCompareSection from "../../../components/learn/AlgorithmCompareSection";

export default function LearnPage() {
  const { state, retry } = useLabMaze();

  if (state.status === "loading") {
    return (
      <main className="flex flex-1 items-center justify-center bg-background px-4 py-12 text-foreground">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-border border-t-accent" />
          <p className="text-sm text-muted">Loading the lab maze...</p>
        </div>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="flex flex-1 items-center justify-center bg-background px-4 py-12 text-foreground">
        <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center">
          <h1 className="text-xl font-black">Lab unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            {state.message} The lab always uses the same Level 1 as
            the main game, so it cannot start without it.
          </p>
          <button
            type="button"
            onClick={retry}
            className="mt-5 rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-accent-foreground transition hover:bg-accent-hover"
          >
            Retry connection
          </button>
        </div>
      </main>
    );
  }

  const { lab } = state;

  return (
    <main className="flex flex-1 justify-center bg-background px-4 py-10 text-foreground sm:px-6">
      <div className="w-full max-w-5xl space-y-8">
        <header>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-accent">
            RoboRally // Pathfinding Lab
          </p>
          <h1 className="mt-3 text-3xl font-black sm:text-4xl">
            Learn BFS, Then Beat It (or Not)
          </h1>
          <p className="mt-3 max-w-3xl leading-7 text-muted">
            Watch breadth-first search explore a real RoboRally maze,
            test your understanding with a prediction, compare three
            classical algorithms against each other, then compare
            classical search against the Meta AI agent on the exact
            same maze.
          </p>
        </header>

        <LessonSection lab={lab} />
        <ChallengeCard trace={lab.trace} />
        <AlgorithmCompareSection lab={lab} />
        <CompareSection lab={lab} />

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/start"
            className="inline-flex items-center justify-center rounded-lg bg-accent px-6 py-3 font-bold text-accent-foreground transition hover:bg-accent-hover"
          >
            Play the Missions →
          </Link>
          <Link
            href="/howtoplay"
            className="inline-flex items-center justify-center rounded-lg border border-border bg-surface px-6 py-3 font-semibold transition hover:border-accent/50"
          >
            How to Play
          </Link>
        </div>
      </div>
    </main>
  );
}
