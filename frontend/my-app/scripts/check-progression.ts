
import assert from "node:assert/strict";
import {
  completeLevel,
  getDefaultProgress,
  getNextLevelId,
  isLevelCompleted,
  isLevelUnlocked,
  loadProgress,
  mergeProgress,
} from "@/lib/progress";

// New player: first level unlocked, nothing completed.
{
  const fresh = getDefaultProgress();
  assert.deepEqual(fresh.unlocked, [1]);
  assert.deepEqual(fresh.completed, []);
  assert.equal(isLevelUnlocked(fresh, 1), true);
  assert.equal(isLevelUnlocked(fresh, 2), false);
}

// No window in Node: safe fallback, never crashes.
{
  const fallback = loadProgress("userA");
  assert.deepEqual(fallback.unlocked, [1]);
  assert.deepEqual(fallback.completed, []);
}

// Level ordering follows the static level list.
assert.equal(getNextLevelId(1), 2);
assert.equal(getNextLevelId(5), 6);
assert.equal(getNextLevelId(6), null);
assert.equal(getNextLevelId(999), null);

// Completion unlocks the next level and is idempotent.
{
  const first = completeLevel(1, "userA");
  assert.deepEqual(first.completed, [1]);
  assert.deepEqual(first.unlocked, [1, 2]);

  const second = completeLevel(1, "userA");
  assert.deepEqual(second.completed, [1]);
  assert.deepEqual(second.unlocked, [1, 2]);
}

// Final level completes without unlocking anything nonexistent.
{
  const done = completeLevel(6, "userA");
  assert.equal(isLevelCompleted(done, 6), true);
  assert.equal(done.unlocked.includes(999), false);
}

// Server merge: unions completions, derives unlocks, ignores unknown IDs.
{
  const merged = mergeProgress(
    { unlocked: [1], completed: [1] },
    [2, 2, 999]
  );
  assert.deepEqual(merged.completed, [1, 2]);
  assert.equal(isLevelUnlocked(merged, 2), true);
  assert.equal(isLevelUnlocked(merged, 3), true);
  assert.equal(merged.completed.includes(999), false);
}

console.log("Progression checks passed!");
