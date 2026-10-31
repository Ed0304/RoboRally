"use client";

import Link from "next/link";
import { useMemo } from "react";
import { buildMaze } from "@/lib/maze";
import { costsForMaze } from "@/lib/battery";
import { DIJKSTRA_LAB } from "@/lib/labMazes";
import CostLab from "../../../../components/learn/CostLab";
import { RouteChoiceChallenge } from "../../../../components/learn/LearnPanels";

export default function LearnDijkstraPage() {
  const maze = useMemo(() => buildMaze(DIJKSTRA_LAB), []);
  const costs = useMemo(() => costsForMaze(maze), [maze]);

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
            Lesson 2 // Dijkstra&apos;s Algorithm
          </p>
          <h1 className="mt-3 text-3xl font-black sm:text-4xl">
            Shortest Isn&apos;t Cheapest
          </h1>
          <div className="mt-3 max-w-3xl space-y-3 text-sm leading-6 text-muted">
            <p>
              Now some tiles carry price tags: rough ground costs 3%
              battery and draining ground costs 5%, while plain floor
              costs 1%. A 5-move shortcut through taxed tiles can cost
              more than a 9-move stroll on cheap floor — so counting
              moves no longer finds the best route.
            </p>
            <p>
              Dijkstra&apos;s algorithm fixes this by always expanding
              the unfinished cell with the cheapest known total cost
              (kept in a priority queue instead of a plain queue).
              When the exit is expanded, its total is final: any other
              route would have to pass through a cell that already
              costs at least as much.
            </p>
            <p>
              Step through the search below and watch it prefer the
              cheap corridor over the tempting shortcut — the same
              trade-off Tutorial Level 2 teaches in the game.
            </p>
          </div>
        </header>

        <section
          aria-labelledby="dijkstra-lesson"
          className="rounded-2xl border border-border bg-surface p-6 sm:p-8"
        >
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-accent">
            Guided lesson
          </p>
          <h2 id="dijkstra-lesson" className="mt-2 text-2xl font-black">
            How Dijkstra explores {DIJKSTRA_LAB.name}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
            Blue cells are <strong>explored</strong>, the bright cell
            is being expanded, and the green overlay is the final{" "}
            <strong>cheapest route</strong>. Numbers on tiles are
            entry costs in battery percent.
          </p>
          <div className="mt-6">
            <CostLab maze={maze} strategy="dijkstra" costs={costs} />
          </div>
        </section>

        <RouteChoiceChallenge maze={maze} costs={costs} />

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/learn/astar"
            className="inline-flex items-center justify-center rounded-lg bg-accent px-6 py-3 font-bold text-accent-foreground transition hover:bg-accent-hover"
          >
            Next: A* →
          </Link>
          <Link
            href="/learn/bfs"
            className="inline-flex items-center justify-center rounded-lg border border-border bg-surface px-6 py-3 font-semibold transition hover:border-accent/50"
          >
            ← BFS
          </Link>
        </div>
      </div>
    </main>
  );
}
