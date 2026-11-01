"use client";

import Link from "next/link";
import { useMemo } from "react";
import { buildMaze } from "@/lib/maze";
import { costsForMaze } from "@/lib/battery";
import { COMPARE_LAB } from "@/lib/labMazes";
import AlgorithmCompareSection from "../../../components/learn/AlgorithmCompareSection";

const LESSONS = [
  {
    href: "/learn/bfs",
    step: "Lesson 1",
    title: "Breadth-First Search",
    hook: "Flood the maze in waves and prove the shortest route. Start here — no experience needed.",
  },
  {
    href: "/learn/dijkstra",
    step: "Lesson 2",
    title: "Dijkstra's Algorithm",
    hook: "Some tiles cost more battery. Learn why the shortest route is not always the cheapest.",
  },
  {
    href: "/learn/astar",
    step: "Lesson 3",
    title: "A* Search",
    hook: "Add a sense of direction: reach the same optimum while exploring far less.",
  },
];

export default function LearnPage() {
  const maze = useMemo(() => buildMaze(COMPARE_LAB), []);
  const costs = useMemo(() => costsForMaze(maze), [maze]);

  return (
    <main className="flex flex-1 justify-center bg-background px-4 py-10 text-foreground sm:px-6">
      <div className="w-full max-w-5xl space-y-8">
        <header>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-accent">
            RoboRally // Pathfinding Lab
          </p>
          <h1 className="mt-3 text-3xl font-black sm:text-4xl">
            Learn How Robots Find Their Way
          </h1>
          <p className="mt-3 max-w-3xl leading-7 text-muted">
            Three bite-size lessons on the search algorithms behind
            RoboRally. Each lesson pairs a short explanation with a
            hands-on visualization on its own original practice maze —
            separate from the game levels, so you can experiment
            freely. No algorithms background required.
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
            Playing along? Tutorial Level 1 teaches BFS, Level 2
            introduces Dijkstra on weighted terrain, and Level 3
            introduces A* search.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          {LESSONS.map((lesson) => (
            <Link
              key={lesson.href}
              href={lesson.href}
              className="group rounded-2xl border border-border bg-surface p-6 transition hover:border-accent/60"
            >
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-accent">
                {lesson.step}
              </p>
              <h2 className="mt-2 text-xl font-black">
                {lesson.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                {lesson.hook}
              </p>
              <p className="mt-4 text-sm font-bold text-accent">
                Start lesson{" "}
                <span
                  aria-hidden="true"
                  className="inline-block transition-transform group-hover:translate-x-1"
                >
                  →
                </span>
              </p>
            </Link>
          ))}
        </div>

        <AlgorithmCompareSection
          maze={maze}
          costs={costs}
          mazeName={COMPARE_LAB.name}
        />

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
