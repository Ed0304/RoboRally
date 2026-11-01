"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  deleteCommunityLevel,
  fetchEditableCommunityLevel,
  publishCommunityLevel,
  unpublishCommunityLevel,
  updateCommunityLevel,
  type CommunityLevel,
} from "@/lib/community-api";
import {
  COMMUNITY_CATEGORIES,
  COMMUNITY_MAX_DIM,
  COMMUNITY_MIN_DIM,
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

export default function CommunityEditPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 justify-center bg-background px-4 py-10 text-foreground sm:px-6">
          <p className="text-sm text-muted">Loading your level…</p>
        </main>
      }
    >
      <CommunityEditContent />
    </Suspense>
  );
}

function CommunityEditContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [level, setLevel] = useState<CommunityLevel | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [width, setWidth] = useState(COMMUNITY_MIN_DIM);
  const [height, setHeight] = useState(COMMUNITY_MIN_DIM);
  const [layout, setLayout] = useState<string[]>([]);
  const [tool, setTool] = useState<Tool>("#");
  const [categories, setCategories] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const painting = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    setLevel(null);

    fetchEditableCommunityLevel(id)
      .then((data) => {
        if (cancelled) return;
        setLevel(data);
        setName(data.name);
        setDescription(data.description);
        setWidth(data.width);
        setHeight(data.height);
        setLayout(data.layout);
        setCategories(data.categories);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Unable to load level."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const errors = useMemo(
    () =>
      layout.length === 0
        ? ["Level layout is still loading."]
        : validateCommunityDraft({
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

  function toggleCategory(categoryId: string) {
    setCategories((prev) =>
      prev.includes(categoryId)
        ? prev.filter((entry) => entry !== categoryId)
        : [...prev, categoryId]
    );
  }

  async function save() {
    if (!level || errors.length > 0 || saving) return;
    setSaving(true);
    setError("");
    setSaved("");
    try {
      const updated = await updateCommunityLevel(level.public_id, {
        name: name.trim(),
        description: description.trim(),
        width,
        height,
        layout,
        categories,
      });
      setLevel(updated);
      setSaved(
        updated.version !== level.version
          ? `Saved as version ${updated.version}. Past attempts stay pinned to their original layout.`
          : "Saved. Metadata-only changes keep the same version."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function setPublished(published: boolean) {
    if (!level || actionBusy) return;
    setActionBusy(true);
    setError("");
    setSaved("");
    try {
      const updated = published
        ? await publishCommunityLevel(level.public_id)
        : await unpublishCommunityLevel(level.public_id);
      setLevel(updated);
      setSaved(
        published
          ? "Published. Players can now find and play this level."
          : "Unpublished. Only you can open and test it until you republish."
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not change status."
      );
    } finally {
      setActionBusy(false);
    }
  }

  async function remove() {
    if (!level || actionBusy) return;
    setActionBusy(true);
    setError("");
    try {
      await deleteCommunityLevel(level.public_id);
      router.push("/community");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
      setConfirmDelete(false);
      setActionBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="flex flex-1 justify-center bg-background px-4 py-10 text-foreground sm:px-6">
        <p className="text-sm text-muted">Loading your level…</p>
      </main>
    );
  }

  if (loadError || !level) {
    return (
      <main className="flex flex-1 justify-center bg-background px-4 py-10 text-foreground sm:px-6">
        <div className="w-full max-w-xl rounded-2xl border border-danger/50 bg-surface p-6">
          <p className="font-bold text-danger">Can&apos;t edit this level</p>
          <p className="mt-1 text-sm text-muted">
            {loadError ||
              "This level is unavailable. Only its creator can edit it."}
          </p>
          <Link
            href="/community"
            className="mt-4 inline-flex items-center justify-center rounded-lg border border-border px-5 py-2.5 text-sm font-semibold transition hover:border-accent/60"
          >
            ← Back to community
          </Link>
        </div>
      </main>
    );
  }

  const published = level.status === "published";

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
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-black sm:text-4xl">Edit Level</h1>
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wider ${
                published
                  ? "border-success/50 text-success"
                  : "border-warning/50 text-warning"
              }`}
            >
              {published ? "Published" : level.status}
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
              v{level.version}
            </span>
          </div>
          <p className="mt-3 max-w-3xl leading-7 text-muted">
            Layout changes create a new version; past attempts and
            leaderboard rows stay pinned to the layout they played.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/community/play/${level.public_id}`}
              className="inline-flex items-center justify-center rounded-lg bg-accent px-6 py-3 text-sm font-bold text-accent-foreground transition hover:bg-accent-hover"
            >
              Test play →
            </Link>
            <button
              type="button"
              onClick={() => setPublished(!published)}
              disabled={actionBusy}
              className="inline-flex items-center justify-center rounded-lg border border-border px-6 py-3 text-sm font-semibold transition hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {actionBusy
                ? "Working…"
                : published
                  ? "Unpublish"
                  : "Publish"}
            </button>
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={actionBusy}
                className="inline-flex items-center justify-center rounded-lg border border-border px-6 py-3 text-sm font-semibold text-muted transition hover:border-danger/60 hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
              >
                Delete
              </button>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-lg border border-danger/40 px-3 py-2 text-sm">
                Delete this level?
                <button
                  type="button"
                  onClick={remove}
                  disabled={actionBusy}
                  className="rounded-md bg-danger px-3 py-1.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {actionBusy ? "Deleting…" : "Yes, delete"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  disabled={actionBusy}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold transition hover:border-accent/60 disabled:opacity-50"
                >
                  Keep
                </button>
              </span>
            )}
          </div>
        </header>

        {!user && (
          <p className="rounded-2xl border border-accent/50 bg-surface p-4 text-sm text-muted">
            You are not signed in. Editing needs the creator&apos;s
            account.{" "}
            <Link
              href="/login"
              className="font-semibold text-accent underline"
            >
              Sign in
            </Link>
            .
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
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground outline-none placeholder:text-muted/60 focus:border-accent"
              />
            </label>
            <label className="block text-sm text-muted">
              Description
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={500}
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

        {saved && (
          <p
            role="status"
            className="rounded-2xl border border-success/50 bg-surface p-4 text-sm text-success"
          >
            {saved}
          </p>
        )}

        <button
          type="button"
          onClick={save}
          disabled={errors.length > 0 || saving || !user}
          className="w-full rounded-lg bg-accent px-6 py-3 font-bold text-accent-foreground transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </main>
  );
}
