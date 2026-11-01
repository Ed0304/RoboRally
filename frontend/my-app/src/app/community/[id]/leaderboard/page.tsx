"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  fetchCommunityLeaderboard,
  fetchCommunityLevel,
  fetchMyCommunityAttempts,
  type AttemptRecord,
  type CommunityLeaderboard,
  type CommunityLevel,
  type CommunityMetric,
} from "@/lib/community-api";

const METRICS: Array<{ id: CommunityMetric; label: string }> = [
  { id: "moves", label: "Fewest moves" },
  { id: "cost", label: "Lowest battery cost" },
  { id: "time", label: "Fastest execution" },
];

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

export default function CommunityLeaderboardPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[calc(100vh-88px)] items-center justify-center px-6 py-12 text-foreground">
          <p className="text-sm text-muted">Loading leaderboard…</p>
        </main>
      }
    >
      <CommunityLeaderboardContent />
    </Suspense>
  );
}

function CommunityLeaderboardContent() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [level, setLevel] = useState<CommunityLevel | null>(null);
  const [metric, setMetric] = useState<CommunityMetric>("moves");
  const [version, setVersion] = useState("all");
  const [page, setPage] = useState(1);
  const [board, setBoard] = useState<CommunityLeaderboard | null>(null);
  const [mine, setMine] = useState<AttemptRecord[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [info, data] = await Promise.all([
        fetchCommunityLevel(id),
        fetchCommunityLeaderboard(id, metric, version, page),
      ]);
      setLevel(info);
      setBoard(data);
    } catch (err) {
      setBoard(null);
      setError(
        err instanceof Error ? err.message : "Unable to load leaderboard."
      );
    } finally {
      setLoading(false);
    }
  }, [id, metric, version, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!user) {
      setMine(null);
      return;
    }
    fetchMyCommunityAttempts(id)
      .then(setMine)
      .catch(() => setMine([]));
  }, [id, user]);

  const versions = level
    ? ["all", ...Array.from({ length: level.version }, (_, i) => String(i + 1))]
    : ["all"];

  return (
    <main className="flex flex-1 justify-center bg-background px-4 py-10 text-foreground sm:px-6">
      <div className="w-full max-w-5xl space-y-8">
        <header>
          <Link
            href="/community"
            className="text-sm font-semibold text-muted transition hover:text-accent"
          >
            ← All community levels
          </Link>
          <h1 className="mt-3 text-3xl font-black sm:text-4xl">
            {level ? level.name : "Leaderboard"}
          </h1>
          {level && (
            <p className="mt-2 text-sm text-muted">
              by {level.creator_username} · v{level.version} ·{" "}
              {level.attempts}{" "}
              {level.attempts === 1 ? "attempt" : "attempts"} ·{" "}
              <Link
                href={`/community/play/${level.public_id}`}
                className="font-semibold text-accent underline"
              >
                Play this level
              </Link>
            </p>
          )}
        </header>

        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            Rank by
            <select
              value={metric}
              onChange={(event) => {
                setMetric(event.target.value as CommunityMetric);
                setPage(1);
              }}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
            >
              {METRICS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            Version
            <select
              value={version}
              onChange={(event) => {
                setVersion(event.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
            >
              {versions.map((entry) => (
                <option key={entry} value={entry}>
                  {entry === "all" ? "All versions" : `v${entry}`}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading && <p className="text-sm text-muted">Loading…</p>}

        {error && (
          <p
            role="alert"
            className="rounded-2xl border border-danger/50 bg-surface p-4 text-sm text-danger"
          >
            {error}
          </p>
        )}

        {!loading && !error && board && (
          <section className="overflow-hidden rounded-2xl border border-border bg-surface">
            {board.entries.length === 0 ? (
              <p className="p-6 text-sm text-muted">
                No verified completions yet. Be the first to finish this
                maze.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted">
                    <th className="px-4 py-3">Rank</th>
                    <th className="px-4 py-3">Player</th>
                    <th className="px-4 py-3">Planner</th>
                    <th className="px-4 py-3">Moves</th>
                    <th className="px-4 py-3">Cost</th>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {board.entries.map((entry) => (
                    <tr
                      key={`${entry.rank}-${entry.username}`}
                      className="border-b border-border/50 last:border-0"
                    >
                      <td className="px-4 py-3 font-black">
                        #{entry.rank}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        {entry.username}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {entry.algorithm}
                      </td>
                      <td className="px-4 py-3 font-mono">{entry.moves}</td>
                      <td className="px-4 py-3 font-mono">
                        {entry.cost}%
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {(entry.exec_ms / 1000).toFixed(1)}s
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {formatDate(entry.submitted_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-lg border border-border px-4 py-2 font-semibold transition hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
              >
                ← Prev
              </button>
              <p>
                Page {board.page} of {board.total_pages} ·{" "}
                {board.total_players}{" "}
                {board.total_players === 1 ? "player" : "players"}
              </p>
              <button
                type="button"
                onClick={() =>
                  setPage((p) => Math.min(board.total_pages, p + 1))
                }
                disabled={page >= board.total_pages}
                className="rounded-lg border border-border px-4 py-2 font-semibold transition hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next →
              </button>
            </div>
          </section>
        )}

        {user && mine !== null && (
          <section className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="text-xl font-black">My attempts</h2>
            {mine.length === 0 ? (
              <p className="mt-2 text-sm text-muted">
                No attempts on this level yet.
              </p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {mine.map((attempt) => (
                  <li
                    key={attempt.attempt_id}
                    className="rounded-lg border border-border bg-background p-3"
                  >
                    <p className="font-semibold">
                      {attempt.outcome === "completed" ? (
                        <span className="text-success">Completed</span>
                      ) : (
                        <span className="text-danger">Failed</span>
                      )}{" "}
                      <span className="font-normal text-muted">
                        · v{attempt.version} · {attempt.algorithm} ·{" "}
                        {attempt.moves} moves · {attempt.cost}% ·{" "}
                        {formatDate(attempt.submitted_at)}
                      </span>
                    </p>
                    {attempt.prompts.length > 0 && (
                      <ul className="mt-2 space-y-1 text-xs text-muted">
                        {attempt.prompts.map((record, index) => (
                          <li key={index}>
                            <span className="font-mono">
                              [{record.status}]
                            </span>{" "}
                            {record.prompt}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
