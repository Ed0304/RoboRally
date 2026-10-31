
import assert from "node:assert/strict";

// In-memory browser stub: progress.ts only touches window.localStorage.
const store = new Map<string, string>();

(globalThis as Record<string, unknown>).window = {
  localStorage: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  },
};

import {
  completeLevel,
  isLevelCompleted,
  isLevelUnlocked,
  loadProgress,
  mergeProgress,
  progressKey,
  syncProgress,
} from "@/lib/progress";

async function main(): Promise<void> {
  // Distinct namespaces per account.
  assert.equal(progressKey("userA"), "roborally_progress_v1:userA");
  assert.equal(progressKey(null), "roborally_progress_v1:guest");
  assert.notEqual(progressKey("userA"), progressKey("userB"));

  // 1. User A signs in and completes Level 1.
  completeLevel(1, "userA");
  assert.deepEqual(loadProgress("userA").completed, [1]);
  assert.equal(isLevelUnlocked(loadProgress("userA"), 2), true);

  // 2-3. User A signs out; User B signs in on the same browser.
  assert.deepEqual(loadProgress("userB").completed, []);
  assert.equal(isLevelUnlocked(loadProgress("userB"), 2), false);
  assert.equal(isLevelCompleted(loadProgress("userB"), 1), false);

  // 4. B's view cannot inherit A, even merged with B's empty server record.
  {
    const merged = mergeProgress(loadProgress("userB"), []);
    assert.deepEqual(merged.completed, []);
    assert.equal(isLevelUnlocked(merged, 2), false);
  }

  // 5. User A returns: their own progress is intact.
  assert.deepEqual(loadProgress("userA").completed, [1]);

  // 6. Guest progress stays in the guest namespace and is never synced.
  (globalThis as Record<string, unknown>).fetch = () => {
    throw new Error("guest sync must not touch the network");
  };
  completeLevel(2, null);
  assert.deepEqual(loadProgress(null).completed, [2]);
  assert.deepEqual(loadProgress("userA").completed, [1]);
  assert.deepEqual(loadProgress("userB").completed, []);
  await syncProgress(null);
  assert.deepEqual(loadProgress(null).completed, [2]);

  // Legacy unscoped progress is adopted by guests only, never by accounts.
  store.clear();
  store.set(
    "roborally_progress_v1",
    JSON.stringify({ unlocked: [1, 2], completed: [1] })
  );
  assert.deepEqual(loadProgress("userB").completed, []);
  assert.deepEqual(loadProgress(null).completed, [1]);
  assert.equal(store.has("roborally_progress_v1"), false);

  console.log("Account isolation checks passed!");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
