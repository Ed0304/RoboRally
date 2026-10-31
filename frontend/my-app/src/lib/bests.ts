import { levels } from "../../data/levels";
import {
  compareRuns,
  type LeaderboardCategory,
  type RunMetrics,
} from "./leaderboard";

export interface StoryRun extends RunMetrics {
  levelId: number;
  /** Total Muse Spark planning time across this run, in ms. */
  planMs: number;
  /** Number of planning requests in this run. */
  planCount: number;
}

export type CategoryBest = Record<
  LeaderboardCategory,
  StoryRun | null
>;

/** Personal bests keyed by Story level id. Tutorial runs are never stored. */
export type PersonalBests = Record<string, CategoryBest | undefined>;

export interface NewBestFlags {
  battery: boolean;
  moves: boolean;
  planner: boolean;
}

const BESTS_STORAGE_KEY = "roborally_bests_v1";
const GUEST_SCOPE = "guest";

const STORY_IDS = new Set(
  levels.filter((level) => level.type === "Story").map((level) => level.id)
);

export const LEADERBOARD_CATEGORIES: LeaderboardCategory[] = [
  "battery",
  "moves",
  "planner",
];

/**
 * Account-scoped storage key, mirroring progress.ts: authenticated
 * users are namespaced by their verified account ID, signed-out play
 * uses the guest scope, so bests can never leak across accounts.
 */
export function bestsKey(userId: string | null): string {
  return `${BESTS_STORAGE_KEY}:${userId ?? GUEST_SCOPE}`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sanitizeRun(value: unknown): StoryRun | null {
  if (typeof value !== "object" || value === null) return null;

  const record = value as Record<string, unknown>;

  if (
    typeof record.levelId !== "number" ||
    !STORY_IDS.has(record.levelId)
  ) {
    return null;
  }

  const numbers: Array<[string, number | null]> = [
    ["moves", null],
    ["remaining", null],
    ["execMs", null],
    ["costRatio", null],
    ["moveRatio", null],
    ["planMs", null],
    ["planCount", null],
  ];

  for (const [key] of numbers) {
    const entry = record[key];
    if (!isFiniteNumber(entry) || entry < 0) return null;
  }

  if (typeof record.completedAt !== "string" || !record.completedAt) {
    return null;
  }

  return {
    levelId: record.levelId,
    moves: record.moves as number,
    remaining: record.remaining as number,
    execMs: record.execMs as number,
    costRatio: record.costRatio as number,
    moveRatio: record.moveRatio as number,
    completedAt: record.completedAt,
    planMs: record.planMs as number,
    planCount: record.planCount as number,
  };
}

function emptyBest(): CategoryBest {
  return { battery: null, moves: null, planner: null };
}

export function loadBests(userId: string | null): PersonalBests {
  if (typeof window === "undefined") return {};

  try {
    const stored = window.localStorage.getItem(bestsKey(userId));
    if (!stored) return {};

    const parsed: unknown = JSON.parse(stored);
    if (typeof parsed !== "object" || parsed === null) return {};

    const bests: PersonalBests = {};
    const record = parsed as Record<string, unknown>;

    for (const [levelId, entry] of Object.entries(record)) {
      if (!STORY_IDS.has(Number(levelId))) continue;
      if (typeof entry !== "object" || entry === null) continue;

      const slots = entry as Record<string, unknown>;
      const best = emptyBest();
      let kept = false;

      for (const category of LEADERBOARD_CATEGORIES) {
        const run = sanitizeRun(slots[category]);
        if (run !== null && run.levelId === Number(levelId)) {
          best[category] = run;
          kept = true;
        }
      }

      if (kept) bests[levelId] = best;
    }

    return bests;
  } catch {
    return {};
  }
}

function saveBests(bests: PersonalBests, userId: string | null): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(bestsKey(userId), JSON.stringify(bests));
  } catch {
    // Storage full or unavailable: the run still counts for this session.
  }
}

/**
 * Record one completed Story run into the matching account's personal
 * bests. Non-Story level ids are ignored. A run replaces a best only
 * when it ranks strictly better, so duplicate submissions of the same
 * run are idempotent. Returns the updated bests plus per-category
 * new-best flags for the results panel.
 */
export function recordStoryRun(
  userId: string | null,
  run: StoryRun
): { bests: PersonalBests; isNewBest: NewBestFlags } {
  const bests = loadBests(userId);
  const isNewBest: NewBestFlags = {
    battery: false,
    moves: false,
    planner: false,
  };

  if (!STORY_IDS.has(run.levelId)) return { bests, isNewBest };

  const key = String(run.levelId);
  const best = bests[key] ?? emptyBest();

  for (const category of LEADERBOARD_CATEGORIES) {
    const current = best[category];

    if (current === null || compareRuns(run, current, category) < 0) {
      best[category] = run;
      isNewBest[category] = true;
    }
  }

  bests[key] = best;
  saveBests(bests, userId);

  return { bests, isNewBest };
}
