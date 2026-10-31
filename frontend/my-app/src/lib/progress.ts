
import { levels } from "../../data/levels";
import {
  fetchUserProfile,
  recordLevelCompletion,
} from "./user";

export interface LevelProgress {
  unlocked: number[];
  completed: number[];
}

const LEGACY_STORAGE_KEY = "roborally_progress_v1";
const GUEST_SCOPE = "guest";

/**
 * Account-scoped storage key. Authenticated users are namespaced by
 * their verified server-side account ID; signed-out play uses the
 * guest scope. Sharing one key across accounts leaked completions
 * between users on the same browser.
 */
export function progressKey(userId: string | null): string {
  return `${LEGACY_STORAGE_KEY}:${userId ?? GUEST_SCOPE}`;
}

const ORDERED_IDS = [...levels]
  .sort((a, b) => a.id - b.id)
  .map((level) => level.id);

const KNOWN_IDS = new Set(ORDERED_IDS);

export function getDefaultProgress(): LevelProgress {
  return {
    unlocked: ORDERED_IDS.length > 0 ? [ORDERED_IDS[0]] : [],
    completed: [],
  };
}

function sanitizeIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<number>();

  for (const entry of value) {
    if (
      typeof entry === "number" &&
      Number.isInteger(entry) &&
      KNOWN_IDS.has(entry) &&
      !seen.has(entry)
    ) {
      seen.add(entry);
    }
  }

  return [...seen];
}

export function loadProgress(
  userId: string | null
): LevelProgress {
  const fallback = getDefaultProgress();

  if (typeof window === "undefined") return fallback;

  // One-time legacy adoption, guest scope only: unscoped progress
  // written before account scoping must never be attributed to a
  // signed-in account, so authenticated loads ignore it entirely.
  if (userId === null) {
    migrateLegacyGuest();
  }

  try {
    const stored = window.localStorage.getItem(
      progressKey(userId)
    );

    if (!stored) return fallback;

    const parsed: unknown = JSON.parse(stored);

    if (typeof parsed !== "object" || parsed === null) {
      return fallback;
    }

    const record = parsed as Record<string, unknown>;
    const unlocked = sanitizeIds(record.unlocked);
    const completed = sanitizeIds(record.completed);

    // The first level is always unlocked, even with corrupt saves.
    for (const id of fallback.unlocked) {
      if (!unlocked.includes(id)) unlocked.push(id);
    }

    return { unlocked, completed };
  } catch {
    return fallback;
  }
}

function saveProgress(
  progress: LevelProgress,
  userId: string | null
): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      progressKey(userId),
      JSON.stringify(progress)
    );
  } catch {
    // Storage full or unavailable: the game still works for this session.
  }
}

/**
 * Move pre-scoping local progress into the guest namespace once, then
 * remove the shared key so it can never leak into an account again.
 */
function migrateLegacyGuest(): void {
  try {
    const guestKey = progressKey(null);

    if (window.localStorage.getItem(guestKey) !== null) return;

    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);

    if (legacy !== null) {
      window.localStorage.setItem(guestKey, legacy);
    }

    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Storage unavailable: guest simply starts from defaults.
  }
}

export function getNextLevelId(
  levelId: number
): number | null {
  const index = ORDERED_IDS.indexOf(levelId);

  if (index < 0 || index + 1 >= ORDERED_IDS.length) {
    return null;
  }

  return ORDERED_IDS[index + 1];
}

export function isLevelUnlocked(
  progress: LevelProgress,
  levelId: number
): boolean {
  return progress.unlocked.includes(levelId);
}

export function isLevelCompleted(
  progress: LevelProgress,
  levelId: number
): boolean {
  return progress.completed.includes(levelId);
}

/** Record a completion and unlock the next level. Idempotent. */
export function completeLevel(
  levelId: number,
  userId: string | null
): LevelProgress {
  const progress = loadProgress(userId);

  if (!progress.completed.includes(levelId)) {
    progress.completed.push(levelId);
  }

  const nextId = getNextLevelId(levelId);

  if (nextId !== null && !progress.unlocked.includes(nextId)) {
    progress.unlocked.push(nextId);
  }

  saveProgress(progress, userId);

  return progress;
}

/** Union local and server progress; server completions unlock locally. */
export function mergeProgress(
  local: LevelProgress,
  serverCompleted: number[]
): LevelProgress {
  const completed = [...local.completed];

  for (const id of serverCompleted) {
    if (KNOWN_IDS.has(id) && !completed.includes(id)) {
      completed.push(id);
    }
  }

  const unlocked = [...local.unlocked];

  for (const id of completed) {
    if (!unlocked.includes(id)) unlocked.push(id);

    const nextId = getNextLevelId(id);

    if (nextId !== null && !unlocked.includes(nextId)) {
      unlocked.push(nextId);
    }
  }

  for (const id of getDefaultProgress().unlocked) {
    if (!unlocked.includes(id)) unlocked.push(id);
  }

  return { unlocked, completed };
}

/**
 * Push one completion to the server. Best-effort: callers must not let
 * a failed push break gameplay; the next sync heals local-only wins.
 */
export async function pushCompletion(
  levelId: number
): Promise<void> {
  if (typeof window === "undefined") return;

  await recordLevelCompletion(levelId);
}

/**
 * Reconcile with the server: union server completions into local
 * storage, then push any local-only completions up. Returns merged
 * progress. Throws when signed out or unreachable; callers fall back
 * to local progress.
 */
export async function syncProgress(
  userId: string | null
): Promise<LevelProgress> {
  // Guests never touch the server: their device-local wins must not be
  // uploaded to any account, and there is no account to fetch from.
  if (userId === null) {
    return loadProgress(null);
  }

  const local = loadProgress(userId);
  const server = await fetchUserProfile();
  const merged = mergeProgress(local, server.completed_levels);
  saveProgress(merged, userId);

  const serverSet = new Set(server.completed_levels);

  for (const id of merged.completed) {
    if (!serverSet.has(id)) {
      await recordLevelCompletion(id);
    }
  }

  return merged;
}
