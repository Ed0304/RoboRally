"use client";

import Link from "next/link";
import { useMemo } from "react";
import { buildMaze } from "@/lib/maze";
import { costsForMaze } from "@/lib/battery";
import { ASTAR_LAB } from "@/lib/labMazes";
import CostLab from "../../../../components/learn/CostLab";
import { ExpandedChallenge } from "../../../../components/learn/LearnPanels";

export default function LearnAstarPage() {
  const maze = useMemo(() => buildMaze(ASTAR_LAB), []);
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
            Lesson 3 // A* Search
          </p>
          <h1 className="mt-3 text-3xl font-black sm:text-4xl">
            A Compass for the Search
          </h1>
          <div className="mt-3 max-w-3xl space-y-3 text-sm leading-6 text-muted">
            <p>
              Dijkstra explores purely by cost paid so far, with no
              sense of direction — so it wanders down the dead-end
              corridor below just because it is nearby. A* adds a
              compass: for each cell it estimates the remaining cost
              with the Manhattan distance to the exit (steps north,
              south, east, or west, ignoring walls).
            </p>
            <p>
              A* always expands the cell with the lowest{" "}
              <em>cost so far + estimated remaining</em>. Because the
              Manhattan estimate never overstates the true remaining
              cost, it is called admissible — and with an admissible
              hint, A* still finds the cheapest route while skipping
              the tempting dead end.
            </p>
            <p>
              Compare the blue coverage below against blind search:
              same optimum, far less wandering. Tutorial Level 3
              teaches this in the game.
            </p>
          </div>
        </header>

        <section
          aria-labelledby="astar-lesson"
          className="rounded-2xl border border-border bg-surface p-6 sm:p-8"
        >
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-accent">
            Guided lesson
          </p>
          <h2 id="astar-lesson" className="mt-2 text-2xl font-black">
            How A* explores {ASTAR_LAB.name}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
            Blue cells are <strong>explored</strong>, the bright cell
            is being expanded, and the green overlay is the final{" "}
            <strong>cheapest route</strong>. Notice how little blue
            leaks into the southern corridor.
          </p>
          <div className="mt-6">
            <CostLab maze={maze} strategy="astar" costs={costs} />
          </div>
        </section>

        <ExpandedChallenge maze={maze} costs={costs} />

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/start"
            className="inline-flex items-center justify-center rounded-lg bg-accent px-6 py-3 font-bold text-accent-foreground transition hover:bg-accent-hover"
          >
            Play the Missions →
          </Link>
          <Link
            href="/learn/dijkstra"
            className="inline-flex items-center justify-center rounded-lg border border-border bg-surface px-6 py-3 font-semibold transition hover:border-accent/50"
          >
            ← Dijkstra
          </Link>
        </div>
      </div>
    </main>
  );
}
