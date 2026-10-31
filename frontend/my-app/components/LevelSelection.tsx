
"use client";

import Link from "next/link";
import type { Level } from ".../../../data/levels";

interface LevelSelectionProps {
  title: string;
  subtitle: string;
  levels: Level[];
  menuHref?: string;
  unlockedIds: number[];
  completedIds: number[];
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5.5a2.5 2.5 0 0 1 5 0V7" />
    </svg>
  );
}

export default function LevelSelection({
  title,
  subtitle,
  levels,
  menuHref = "/game",
  unlockedIds,
  completedIds,
}: LevelSelectionProps) {
  return (
    <main className="min-h-screen bg-[#171A1D] px-4 py-8 text-[#F5F2E9] sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Link
          href={menuHref}
          className="mb-8 inline-flex items-center gap-2 rounded-md border border-[#515A61] px-4 py-2 text-sm font-semibold text-[#F5F2E9] transition hover:border-[#FF8A24] hover:text-[#FF8A24] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF8A24]"
        >
          <span aria-hidden="true">←</span>
          Back to Game Menu
        </Link>

        <header className="mb-8 border-b border-[#515A61] pb-6">
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.25em] text-[#FF8A24]">
            RoboRally / Mission Select
          </p>
          <h1 className="font-orbitron text-3xl font-bold sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 max-w-2xl text-[#C5CBD0]">{subtitle}</p>
        </header>

        <section
          aria-label={`${title} levels`}
          className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {levels.map((level) => {
            const locked = !unlockedIds.includes(level.id);
            const completed = completedIds.includes(level.id);

            return (
              <article
                key={level.id}
                aria-disabled={locked}
                className={`flex flex-col rounded-xl border p-5 transition duration-200 ${
                  locked
                    ? "border-[#414A53] bg-[#22262D] opacity-60"
                    : "border-[#414A53] bg-[#292F35] hover:-translate-y-1 hover:border-[#FF8A24] hover:bg-[#363E46] hover:shadow-lg hover:shadow-black/20"
                }`}
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <span className="font-mono text-xs uppercase tracking-widest text-[#FF8A24]">
                    Mission {String(level.id).padStart(2, "0")}
                  </span>
                  {completed ? (
                    <span className="rounded-full border border-[#65D982]/40 bg-[#65D982]/10 px-3 py-1 text-xs font-semibold text-[#65D982]">
                      ✓ Completed
                    </span>
                  ) : locked ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#515A61] px-3 py-1 text-xs text-[#AAB3BA]">
                      <LockIcon />
                      Locked
                    </span>
                  ) : (
                    <span className="rounded-full border border-[#515A61] px-3 py-1 text-xs text-[#C5CBD0]">
                      {level.difficulty}
                    </span>
                  )}
                </div>

                <h2 className="text-xl font-bold">{level.name}</h2>
                <p className="mt-2 flex-1 leading-6 text-[#C5CBD0]">
                  {level.description}
                </p>

                <div className="mt-5 border-t border-[#515A61] pt-4">
                  <p className="mb-4 text-sm">
                    <span className="text-[#AAB3BA]">Objective: </span>
                    {level.goal}
                  </p>

                  {locked ? (
                    <button
                      type="button"
                      disabled
                      title="Complete the previous mission to unlock this level"
                      className="inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-md border border-[#515A61] bg-[#22262D] px-4 py-3 font-semibold text-[#626875]"
                    >
                      <LockIcon />
                      Locked
                    </button>
                  ) : (
                    <Link
                      href={`/game/level/${level.id}`}
                      className="inline-flex w-full items-center justify-center rounded-md bg-[#FF8A24] px-4 py-3 font-semibold text-[#171A1D] transition hover:bg-[#FFA64D] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF8A24]"
                    >
                      {completed ? "Replay Mission" : "Play Mission"}
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
