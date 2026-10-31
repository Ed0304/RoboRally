"use client";

import Link from "next/link";
import { useMemo } from "react";
import { BFS_LAB } from "@/lib/labMazes";
import {
  buildBfsLab,
  ChallengeCard,
  LessonSection,
} from "../../../../components/learn/LearnPanels";

export default function LearnBfsPage() {
  const lab = useMemo(() => buildBfsLab(BFS_LAB), []);

  return (
    <main className="flex flex-1 justify-center bg-background px-4 py-10 text-foreground sm:px-6">
      <div className="w-full max-w-5xl space-y-8">
        <header>
          <Link
            href="/learn"
            className="text-sm font-semibold text-muted transition hover:text-accent"
          >
            ← Back to the lab
          </Link>
          <p className="mt-4 text-xs font-bold uppercase tracking-[0.3em] text-accent">
            Lesson 1 // Breadth-First Search
          </p>
          <h1 className="mt-3 text-3xl font-black sm:text-4xl">
            Search in Waves
          </h1>
          <div className="mt-3 max-w-3xl space-y-3 text-sm leading-6 text-muted">
            <p>
              Imagine spilling water on the maze at the start cell.
              The puddle spreads one tile per moment — first every
              cell one step away, then two steps, and so on. BFS works
              the same way, using a first-in-first-out queue: cells
              are explored in the order they were discovered.
            </p>
            <p>
              Because every move costs the same here, the wave reaches
              closer cells before farther ones. So the first time BFS
              reaches the exit, no shorter route can possibly exist —
              any alternative would have arrived in an earlier wave.
            </p>
            <p>
              Watch the amber <strong>frontier</strong> (found, waiting
              to be explored) sweep outward below, then predict the
              shortest route length before revealing it.
            </p>
          </div>
        </header>

        <LessonSection lab={lab} />
        <ChallengeCard trace={lab.trace} />

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/learn/dijkstra"
            className="inline-flex items-center justify-center rounded-lg bg-accent px-6 py-3 font-bold text-accent-foreground transition hover:bg-accent-hover"
          >
            Next: Dijkstra →
          </Link>
          <Link
            href="/learn"
            className="inline-flex items-center justify-center rounded-lg border border-border bg-surface px-6 py-3 font-semibold transition hover:border-accent/50"
          >
            All lessons
          </Link>
        </div>
      </div>
    </main>
  );
}
