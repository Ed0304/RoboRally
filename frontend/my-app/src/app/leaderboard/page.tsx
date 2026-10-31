"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { levels } from "../../../data/levels";
import { useAuth } from "@/context/AuthContext";
import type { LeaderboardCategory } from "@/lib/leaderboard";
import {
  fetchLeaderboard,
  type LeaderboardPageData,
} from "@/lib/leaderboard-api";

const STORY_LEVELS = levels
  .filter((level) => level.type === "Story")
  .sort((a, b) => a.id - b.id);

const CATEGORIES: Array<{
  id: LeaderboardCategory;
  label: string;
  hint: string;
}> = [
  {
    id: "battery",
    label: "Most battery left",
    hint: "Ranked by remaining battery, ties by fewest moves",
  },
  {
    id: "moves",
    label: "Fewest steps",
    hint: "Ranked by move count, ties by remaining battery",
  },
  {
    id: "planner",
    label: "Planner score",
    hint: "Cost ratio + move ratio vs benchmarks; lower wins",
  },
];

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [levelIndex, setLevelIndex] = useState(0);
  const [category, setCategory] = useState<LeaderboardCategory>("battery");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LeaderboardPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  const level = STORY_LEVELS[levelIndex] ?? STORY_LEVELS[0];

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");

    fetchLeaderboard(level.id, category, page)
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error ? err.message : "Unable to load rankings."
          );
          setData(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [level.id, category, page, retry]);

  function stepLevel(delta: number) {
    setLevelIndex(
      (index) =>
        (index + delta + STORY_LEVELS.length) % STORY_LEVELS.length
    );
    setPage(1);
  }

  function pickCategory(next: LeaderboardCategory) {
    setCategory(next);
    setPage(1);
  }

  const activeHint =
    CATEGORIES.find((entry) => entry.id === category)?.hint ?? "";

  return (
    <main className="flex flex-1 justify-center bg-background px-4 py-10 text-foreground sm:px-6">
      <div className="w-full max-w-5xl space-y-6">
        <header>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-accent">
            RoboRally // Hall of Fame
          </p>
          <h1 className="mt-3 text-3xl font-black sm:text-4xl">
            Story Mode Leaderboards
          </h1>
          <p className="mt-3 max-w-3xl leading-7 text-muted">
            Completed Story runs only — each player&apos;s best run per
            level. Rankings are gated on verified level completions.
          </p>
        </header>

        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
          <button
            type="button"
            onClick={() => stepLevel(-1)}
            aria-label="Previous Story level"
            className="rounded-lg border border-border px-4 py-2 text-lg font-bold transition hover:border-accent/60 hover:text-accent"
          >
            ‹
          </button>
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
              Level {level.id}
            </p>
            <p className="text-lg font-bold">{level.name}</p>
          </div>
          <button
            type="button"
            onClick={() => stepLevel(1)}
            aria-label="Next Story level"
            className="rounded-lg border border-border px-4 py-2 text-lg font-bold transition hover:border-accent/60 hover:text-accent"
          >
            ›
          </button>
        </div>

        <div
          role="tablist"
          aria-label="Ranking category"
          className="flex flex-wrap gap-2"
        >
          {CATEGORIES.map((entry) => {
            const active = entry.id === category;
            return (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => pickCategory(entry.id)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  active
                    ? "bg-accent text-accent-foreground"
                    : "border border-border text-muted hover:border-accent/60 hover:text-foreground"
                }`}
              >
                {entry.label}
              </button>
            );
          })}
        </div>
        <p className="text-sm text-muted">{activeHint}</p>

        {loading && (
          <p className="text-sm text-muted">Loading rankings...</p>
        )}

        {!loading && error && (
          <div
            role="alert"
            className="rounded-xl border border-danger/40 bg-danger/5 p-4 text-sm"
          >
            <p className="font-semibold">Couldn&apos;t load rankings</p>
            <p className="mt-1 text-muted">{error}</p>
            <button
              type="button"
              onClick={() => setRetry((value) => value + 1)}
              className="mt-3 rounded-lg border border-border px-4 py-2 text-sm font-semibold transition hover:border-accent/60"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && data && data.entries.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-6 text-center">
            <p className="font-bold">No runs yet for this level.</p>
            <p className="mt-1 text-sm text-muted">
              Complete the mission to claim the first spot.
            </p>
            <Link
              href="/start/story"
              className="mt-4 inline-block rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-accent-foreground transition hover:bg-accent-hover"
            >
              Play Story Mode
            </Link>
          </div>
        )}

        {!loading && !error && data && data.entries.length > 0 && (
          <>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-card text-xs uppercase tracking-wider text-muted">
                    <th className="px-4 py-3 font-semibold">Rank</th>
                    <th className="px-4 py-3 font-semibold">Player</th>
                    <th className="px-4 py-3 font-semibold">Battery</th>
                    <th className="px-4 py-3 font-semibold">Steps</th>
                    <th className="px-4 py-3 font-semibold">Planner</th>
                    <th className="px-4 py-3 font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((entry) => {
                    const own =
                      user !== null &&
                      user.username === entry.username;
                    return (
                      <tr
                        key={`${entry.rank}-${entry.username}`}
                        className={`border-b border-border last:border-0 ${
                          own ? "bg-accent/10" : ""
                        }`}
                      >
                        <td className="px-4 py-3 font-mono font-bold">
                          {entry.rank}
                        </td>
                        <td className="px-4 py-3 font-semibold">
                          {entry.username}
                          {own && (
                            <span className="ml-2 rounded bg-accent/20 px-2 py-0.5 text-xs font-bold text-accent">
                              you
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono">
                          {entry.remaining}%
                        </td>
                        <td className="px-4 py-3 font-mono">
                          {entry.moves}
                        </td>
                        <td className="px-4 py-3 font-mono">
                          {entry.score.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {formatDate(entry.completed_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between text-sm">
              <p className="text-muted">
                {data.total_players}{" "}
                {data.total_players === 1 ? "player" : "players"} · page{" "}
                {data.page} of {data.total_pages}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((value) => value - 1)}
                  disabled={data.page <= 1}
                  aria-label="Previous page"
                  className="rounded-lg border border-border px-4 py-2 font-bold transition hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => setPage((value) => value + 1)}
                  disabled={data.page >= data.total_pages}
                  aria-label="Next page"
                  className="rounded-lg border border-border px-4 py-2 font-bold transition hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ›
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
