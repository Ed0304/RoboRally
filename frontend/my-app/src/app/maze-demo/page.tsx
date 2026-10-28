
"use client";

import MazeScene from "../../../components/maze/MazeScene";

export default function MazeDemoPage() {
  return (
    <main className="min-h-screen bg-[#171A1D] px-4 py-8 text-[#F5F2E9] sm:px-8">
      <div className="mx-auto max-w-6xl">
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.25em] text-[#FF8A24]">
          RoboRally / Prototype 01
        </p>

        <h1 className="text-3xl font-bold sm:text-4xl">
          Factory Maze
        </h1>

        <p className="mb-6 mt-3 text-[#C5CBD0]">
          Explore the factory floor. The orange tile marks your exit.
        </p>

        <MazeScene />

        <p className="mt-4 text-sm text-[#AAB3BA]">
          Tip: drag to rotate the view and scroll to zoom.
        </p>
      </div>
    </main>
  );
}
