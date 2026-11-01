"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { createCommunityLevel } from "@/lib/community-api";
import {
  COMMUNITY_CATEGORIES,
  COMMUNITY_MAX_DIM,
  COMMUNITY_MIN_DIM,
  emptyLayout,
  validateCommunityDraft,
} from "@/lib/community-validate";

type Tool = "#" | "S" | "E" | "L" | "3" | "5" | ".";

const TOOLS: Array<{ id: Tool; label: string; swatch: string }> = [
  { id: "#", label: "Wall", swatch: "#68737D" },
  { id: "S", label: "Start", swatch: "#F2A93B" },
  { id: "E", label: "Finish", swatch: "#22C55E" },
  { id: "L", label: "Laser", swatch: "#FF5555" },
  { id: "3", label: "Rough 3%", swatch: "#B45309" },
  { id: "5", label: "Drain 5%", swatch: "#7C3AED" },
  { id: ".", label: "Erase", swatch: "#343A40" },
];

const TILE_LABEL: Record<string, string> = {
  "#": "Wall",
  S: "Start",
  E: "Finish",
  L: "Laser",
  "3": "Rough",
  "5": "Drain",
  ".": "Floor",
};

function tileColor(symbol: string): string {
  return (
    TOOLS.find((tool) => tool.id === symbol)?.swatch ?? "#343A40"
  );
}

function clampDim(value: number): number {
  if (!Number.isFinite(value)) return COMMUNITY_MIN_DIM;
  return Math.min(
    COMMUNITY_MAX_DIM,
    Math.max(COMMUNITY_MIN_DIM, Math.floor(value))
  );
}

export default function CommunityCreatePage() {
  const router = useRouter();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [width, setWidth] = useState(11);
  const [height, setHeight] = useState(9);
  const [layout, setLayout] = useState<string[]>(() =>
    emptyLayout(11, 9)
  );
  const [tool, setTool] = useState<Tool>("#");
  const [categories, setCategories] = useState<string[]>(["basics"]);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const painting = useRef(false);

  const errors = useMemo(
    () =>
      validateCommunityDraft({
        name,
        description,
        width,
        height,
        layout,
        categories,
      }),
    [name, description, width, height, layout, categories]
  );

  function resize(nextWidth: number, nextHeight: number) {
    const w = clampDim(nextWidth);
    const h = clampDim(nextHeight);
    setWidth(w);
    setHeight(h);
    setLayout((prev) =>
      Array.from({ length: h }, (_, z) =>
        Array.from({ length: w }, (_, x) => prev[z]?.[x] ?? ".").join("")
      )
    );
  }

  function paint(x: number, z: number) {
    setLayout((prev) => {
      if (prev[z]?.[x] === tool) return prev;
      // Start/finish are unique: placing one clears the old one.
      const cleared =
        tool === "S" || tool === "E"
          ? prev.map((row) => row.replaceAll(tool, "."))
          : prev;
      return cleared.map((row, rowIndex) =>
        rowIndex === z
          ? row.slice(0, x) + tool + row.slice(x + 1)
          : row
      );
    });
  }

  function toggleCategory(id: string) {
    setCategories((prev) =>
      prev.includes(id)
        ? prev.filter((entry) => entry !== id)
        : [...prev, id]
    );
  }

  async function publish() {
    if (!user) {
      setError("Sign in to publish your level.");
      return;
    }
    if (errors.length > 0 || publishing) return;
    setPublishing(true);
    setError("");
    try {
      const created = await createCommunityLevel({
        name: name.trim(),
        description: description.trim(),
        width,
        height,
        layout,
        categories,
      });
      router.push(`/community/play/${created.public_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed.");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <main
      className="flex flex-1 justify-center bg-background px-4 py-10 text-foreground sm:px-6"
      onPointerUp={() => {
        painting.current = false;
      }}
    >
      <div className="w-full max-w-5xl space-y-8">
        <header>
          <Link
            href="/community"
            className="text-sm font-semibold text-muted transition hover:text-accent"
          >
            ← Back to community
          </Link>
          <h1 className="mt-3 text-3xl font-black sm:text-4xl">
            Build a Level
          </h1>
          <p className="mt-3 max-w-3xl leading-7 text-muted">
            Paint walls, a start, a finish, and lasers on the grid.
            Levels must be solvable without touching a laser — the
            editor checks as you go.
          </p>
        </header>

        {!user && (
          <p className="rounded-2xl border border-accent/50 bg-surface p-4 text-sm text-muted">
            You can draft freely, but publishing needs an account.{" "}
            <Link
              href="/login"
              className="font-semibold text-accent underline"
            >
              Sign in
            </Link>{" "}
            when you are ready.
          </p>
        )}

        <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm text-muted">
              Level name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={60}
                placeholder="The Gauntlet"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none placeholder:text-muted/60 focus:border-accent"
              />
            </label>
            <label className="block text-sm text-muted">
              Description
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={500}
                placeholder="Thread the lasers, mind the battery."
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none placeholder:text-muted/60 focus:border-accent"
              />
            </label>
            <label className="block text-sm text-muted">
              Width ({COMMUNITY_MIN_DIM}–{COMMUNITY_MAX_DIM})
              <input
                type="number"
                value={width}
                min={COMMUNITY_MIN_DIM}
                max={COMMUNITY_MAX_DIM}
                onChange={(event) =>
                  resize(Number(event.target.value), height)
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-accent"
              />
            </label>
            <label className="block text-sm text-muted">
              Height ({COMMUNITY_MIN_DIM}–{COMMUNITY_MAX_DIM})
              <input
                type="number"
                value={height}
                min={COMMUNITY_MIN_DIM}
                max={COMMUNITY_MAX_DIM}
                onChange={(event) =>
                  resize(width, Number(event.target.value))
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-accent"
              />
            </label>
          </div>

          <fieldset className="mt-4">
            <legend className="text-sm text-muted">
              Challenge categories
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {COMMUNITY_CATEGORIES.map((entry) => (
                <label
                  key={entry.id}
                  className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                    categories.includes(entry.id)
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border text-muted hover:border-accent/60"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={categories.includes(entry.id)}
                    onChange={() => toggleCategory(entry.id)}
                    className="sr-only"
                  />
                  {entry.label}
                </label>
              ))}
            </div>
          </fieldset>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8">
          <div
            className="flex flex-wrap gap-2"
            role="radiogroup"
            aria-label="Editing tool"
          >
            {TOOLS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="radio"
                aria-checked={tool === entry.id}
                onClick={() => setTool(entry.id)}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                  tool === entry.id
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-muted hover:border-accent/60"
                }`}
              >
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ backgroundColor: entry.swatch }}
                />
                {entry.label}
              </button>
            ))}
          </div>

          <div
            className="mt-4 grid w-full max-w-2xl gap-0.5"
            style={{
              gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))`,
            }}
            role="grid"
            aria-label="Maze editor grid"
          >
            {layout.map((row, z) =>
              row.split("").map((symbol, x) => (
                <button
                  key={`${x}-${z}`}
                  type="button"
                  role="gridcell"
                  aria-label={`Tile ${x}, ${z}: ${TILE_LABEL[symbol] ?? symbol}`}
                  onPointerDown={() => {
                    painting.current = true;
                    paint(x, z);
                  }}
                  onPointerEnter={() => {
                    if (painting.current) paint(x, z);
                  }}
                  className="aspect-square w-full rounded-[3px] border border-black/30"
                  style={{ backgroundColor: tileColor(symbol) }}
                />
              ))
            )}
          </div>

          {errors.length > 0 ? (
            <ul className="mt-4 space-y-1 text-sm text-danger">
              {errors.map((message) => (
                <li key={message}>• {message}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm font-semibold text-success">
              Valid maze — a laser-free route exists.
            </p>
          )}
        </section>

        {error && (
          <p
            role="alert"
            className="rounded-2xl border border-danger/50 bg-surface p-4 text-sm text-danger"
          >
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={publish}
          disabled={errors.length > 0 || publishing || !user}
          className="w-full rounded-lg bg-accent px-6 py-3 font-bold text-accent-foreground transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {publishing ? "Publishing…" : "Publish level"}
        </button>
      </div>
    </main>
  );
}
