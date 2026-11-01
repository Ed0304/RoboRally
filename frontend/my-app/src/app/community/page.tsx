"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  fetchCommunityLevels,
  fetchMyCommunityLevels,
  type CommunityCard,
  type CommunitySort,
} from "@/lib/community-api";
import { COMMUNITY_CATEGORIES } from "@/lib/community-validate";

const SORTS: Array<{ id: CommunitySort; label: string }> = [
  { id: "newest", label: "Newest" },
  { id: "attempts", label: "Most attempted" },
  { id: "completion", label: "Highest completion" },
];

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "unknown date"
    : date.toLocaleDateString();
}

function LevelCard({
  level,
  showEdit,
}: {
  level: CommunityCard;
  showEdit: boolean;
}) {
  return (
    <article className="flex flex-col rounded-2xl border border-border bg-surface p-6">
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em]">
        <span className="text-accent">v{level.version}</span>
        <span className="text-muted">/</span>
        <span className="text-muted">
          {level.width}×{level.height}
        </span>
        {level.status !== "published" && (
          <span className="rounded-full border border-warning/50 px-2 py-0.5 text-warning">
            {level.status}
          </span>
        )}
        {level.has_lasers && (
          <span className="rounded-full border border-danger/50 px-2 py-0.5 text-danger">
            Lasers
          </span>
        )}
        {level.has_weighted && (
          <span className="rounded-full border border-accent/50 px-2 py-0.5 text-accent">
            Weighted
          </span>
        )}
      </div>

      <h2 className="mt-2 text-xl font-black">{level.name}</h2>
      <p className="mt-1 text-sm leading-6 text-muted">
        {level.description || "No description."}
      </p>
      <p className="mt-2 text-xs text-muted">
        by {level.creator_username} · {formatDate(level.created_at)}
      </p>

      <p className="mt-3 text-sm text-muted">
        {level.attempts} {level.attempts === 1 ? "attempt" : "attempts"} ·{" "}
        {level.completions}{" "}
        {level.completions === 1 ? "completion" : "completions"}
      </p>
      {level.best && (
        <p className="mt-1 text-sm font-semibold text-success">
          Best: {level.best.moves} moves · {level.best.cost}% by{" "}
          {level.best.username}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Link
          href={`/community/play/${level.public_id}`}
          className="inline-flex flex-1 items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground transition hover:bg-accent-hover"
        >
          {level.status === "published" ? "Play" : "Test play"}
        </Link>
        <Link
          href={`/community/${level.public_id}/leaderboard`}
          className="inline-flex flex-1 items-center justify-center rounded-lg border border-border px-4 py-2.5 text-sm font-semibold transition hover:border-accent/50"
        >
          Leaderboard
        </Link>
        {showEdit && (
          <Link
            href={`/community/edit/${level.public_id}`}
            className="inline-flex flex-1 items-center justify-center rounded-lg border border-border px-4 py-2.5 text-sm font-semibold transition hover:border-accent/50"
          >
            Edit
          </Link>
        )}
      </div>
    </article>
  );
}

export default function CommunityPage() {
  const { user } = useAuth();
  const [sort, setSort] = useState<CommunitySort>("newest");
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{
    levels: CommunityCard[];
    total_pages: number;
    total_levels: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (mine) {
        const own = await fetchMyCommunityLevels();
        const needle = query.trim().toLowerCase();
        const filtered = own.filter(
          (level) =>
            (!needle || level.name.toLowerCase().includes(needle)) &&
            (!category || level.categories.includes(category))
        );
        const pageSize = 10;
        const totalPages = Math.max(
          1,
          Math.ceil(filtered.length / pageSize)
        );
        const safePage = Math.min(page, totalPages);
        setData({
          levels: filtered.slice(
            (safePage - 1) * pageSize,
            safePage * pageSize
          ),
          total_pages: totalPages,
          total_levels: filtered.length,
        });
      } else {
        const result = await fetchCommunityLevels(
          sort,
          page,
          category || undefined,
          query || undefined
        );
        setData(result);
      }
    } catch (err) {
      setData(null);
      setError(
        err instanceof Error ? err.message : "Unable to load levels."
      );
    } finally {
      setLoading(false);
    }
  }, [sort, page, category, query, mine]);

  useEffect(() => {
    load();
  }, [load]);

  function changeSort(next: CommunitySort) {
    setSort(next);
    setPage(1);
  }

  function changeCategory(next: string) {
    setCategory(next);
    setPage(1);
  }

  function applySearch(next: string) {
    setQuery(next.trim());
    setPage(1);
  }

  function toggleMine(next: boolean) {
    setMine(next);
    setPage(1);
  }

  return (
    <main className="flex flex-1 justify-center bg-background px-4 py-10 text-foreground sm:px-6">
      <div className="w-full max-w-5xl space-y-8">
        <header>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-accent">
            RoboRally // Community
          </p>
          <h1 className="mt-3 text-3xl font-black sm:text-4xl">
            Community Levels
          </h1>
          <p className="mt-3 max-w-3xl leading-7 text-muted">
            Play mazes built by other operators, or publish your own.
            Every leaderboard result is verified by replaying the
            submitted moves on the server.
          </p>
          <Link
            href="/community/create"
            className="mt-4 inline-flex items-center justify-center rounded-lg bg-accent px-6 py-3 font-bold text-accent-foreground transition hover:bg-accent-hover"
          >
            Create a level
          </Link>
        </header>

        <div className="flex flex-wrap gap-3">
          {user && (
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-muted transition hover:border-accent/60">
              <input
                type="checkbox"
                checked={mine}
                onChange={(event) => toggleMine(event.target.checked)}
              />
              My levels
            </label>
          )}
          <label className="flex items-center gap-2 text-sm text-muted">
            Sort
            <select
              value={sort}
              onChange={(event) =>
                changeSort(event.target.value as CommunitySort)
              }
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
            >
              {SORTS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            Challenge
            <select
              value={category}
              onChange={(event) => changeCategory(event.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
            >
              <option value="">All challenges</option>
              {COMMUNITY_CATEGORIES.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <form
            role="search"
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              applySearch(draft);
            }}
          >
            <label htmlFor="community-search" className="sr-only">
              Search levels by name
            </label>
            <input
              id="community-search"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={60}
              placeholder="Search by name…"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted/60 focus:border-accent"
            />
            <button
              type="submit"
              className="rounded-lg border border-border px-4 py-2 text-sm font-semibold transition hover:border-accent/60"
            >
              Search
            </button>
            {query && (
              <button
                type="button"
                onClick={() => {
                  setDraft("");
                  applySearch("");
                }}
                className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-muted transition hover:border-accent/60"
              >
                Clear
              </button>
            )}
          </form>
        </div>

        {query && !loading && !error && (
          <p className="text-sm text-muted">
            {data?.total_levels ?? 0}{" "}
            {(data?.total_levels ?? 0) === 1 ? "match" : "matches"} for
            &ldquo;{query}&rdquo;.
          </p>
        )}

        {loading && (
          <p className="text-sm text-muted">Loading community levels…</p>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-2xl border border-danger/50 bg-surface p-6"
          >
            <p className="font-bold text-danger">
              Couldn&apos;t load community levels
            </p>
            <p className="mt-1 text-sm text-muted">{error}</p>
            <button
              type="button"
              onClick={load}
              className="mt-4 rounded-lg border border-border px-5 py-2.5 text-sm font-semibold transition hover:border-accent/60"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && data && data.levels.length === 0 && (
          <div className="rounded-2xl border border-border bg-surface p-6">
            <p className="font-bold">
              {mine
                ? "No levels of yours yet"
                : query
                  ? "No matching levels"
                  : "No levels yet"}
            </p>
            <p className="mt-1 text-sm text-muted">
              {mine
                ? "Publish your first maze to see it here."
                : query
                  ? `Nothing published matches “${query}”.`
                  : category
                    ? "Nothing published in this challenge yet."
                    : "Be the first to publish a maze."}
            </p>
          </div>
        )}

        {!loading && !error && data && data.levels.length > 0 && (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              {data.levels.map((level) => (
                <LevelCard
                  key={level.public_id}
                  level={level}
                  showEdit={
                    !!user && user.username === level.creator_username
                  }
                />
              ))}
            </div>
            <div className="flex items-center justify-between text-sm text-muted">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-lg border border-border px-4 py-2 font-semibold transition hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
              >
                ← Prev
              </button>
              <p>
                Page {page} of {data.total_pages} · {data.total_levels}{" "}
                levels
              </p>
              <button
                type="button"
                onClick={() =>
                  setPage((p) => Math.min(data.total_pages, p + 1))
                }
                disabled={page >= data.total_pages}
                className="rounded-lg border border-border px-4 py-2 font-semibold transition hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next →
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
