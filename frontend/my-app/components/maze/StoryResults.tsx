"use client";

import type { LevelBenchmarks } from "@/lib/benchmarks";
import {
  plannerScore,
  type LeaderboardCategory,
  type RunMetrics,
} from "@/lib/leaderboard";
import {
  LEADERBOARD_CATEGORIES,
  type NewBestFlags,
  type PersonalBests,
  type StoryRun,
} from "@/lib/bests";

export interface StoryResultData {
  run: StoryRun;
  benchmarks: LevelBenchmarks;
  /** Personal bests before this run, for side-by-side comparison. */
  previous: PersonalBests;
  isNewBest: NewBestFlags;
}

const CATEGORY_LABEL: Record<LeaderboardCategory, string> = {
  battery: "Battery Champion",
  moves: "Speedrunner",
  planner: "Planner Challenger",
};

function formatSecs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function metricFor(run: RunMetrics, category: LeaderboardCategory): string {
  if (category === "battery") return `${run.remaining}% remaining`;
  if (category === "moves")
    return `${run.moves} ${run.moves === 1 ? "move" : "moves"}`;
  return `score ${plannerScore(run).toFixed(2)}`;
}

export default function StoryResults({
  levelName,
  result,
}: {
  levelName: string;
  result: StoryResultData;
}) {
  const { run, benchmarks, previous, isNewBest } = result;
  const spent = 100 - run.remaining;
  const levelKey = String(run.levelId);

  return (
    <div className="mt-3 rounded-md border border-[#F2A93B]/40 bg-[#22262D] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#F2A93B]">
        Story Results — {levelName}
      </p>
      <p className="mt-1 text-sm font-bold text-[#65D982]">
        Completed in {run.moves} {run.moves === 1 ? "move" : "moves"} ·{" "}
        {run.remaining}% battery left
      </p>
      <p className="mt-1 text-xs text-[#ADB2BD]">
        Execution {formatSecs(run.execMs)} · Muse Spark planning{" "}
        {formatSecs(run.planMs)} across {run.planCount}{" "}
        {run.planCount === 1 ? "request" : "requests"}
      </p>

      <div className="mt-2 border-t border-[#3B414B] pt-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9299A6]">
          Algorithm benchmarks (same maze, rules, and costs)
        </p>
        <ul className="mt-1 space-y-1 text-xs text-[#ADB2BD]">
          {benchmarks.entries.map((entry) => (
            <li key={entry.strategy} className="flex flex-wrap gap-x-2">
              <span className="font-semibold capitalize text-[#E7E8EA]">
                {entry.strategy === "astar" ? "A*" : entry.strategy}
              </span>
              {entry.reached ? (
                <span>
                  {entry.moves} moves · {entry.cost}% cost ·{" "}
                  {entry.remaining}% left · {entry.expanded} expanded ·{" "}
                  {entry.ms.toFixed(1)} ms
                </span>
              ) : (
                <span className="text-[#FFB020]">
                  no route ({entry.reason || "unreachable"})
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-[#9299A6]">
          Your run spent {spent}% battery (×{run.costRatio.toFixed(2)} of
          the cheapest route) and used {run.moves} moves (×
          {run.moveRatio.toFixed(2)} of the fewest). BFS minimizes moves;
          Dijkstra and A* minimize battery cost. Local timings are noisy —
          tiny differences are not meaningful wins.
        </p>
      </div>

      <div className="mt-2 border-t border-[#3B414B] pt-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9299A6]">
          Your personal bests
        </p>
        <ul className="mt-1 space-y-1 text-xs text-[#ADB2BD]">
          {LEADERBOARD_CATEGORIES.map((category) => {
            const prev = previous[levelKey]?.[category] ?? null;
            return (
              <li key={category} className="flex flex-wrap gap-x-2">
                <span className="font-semibold text-[#E7E8EA]">
                  {CATEGORY_LABEL[category]}:
                </span>
                <span>{metricFor(run, category)}</span>
                {prev === null ? (
                  <span className="text-cyan-200">
                    — first recorded run, this sets your baseline.
                  </span>
                ) : (
                  <span>
                    (best {metricFor(prev, category)}
                    {isNewBest[category] && (
                      <span className="font-bold text-[#65D982]">
                        {" "}
                        — new best!
                      </span>
                    )}
                    )
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
