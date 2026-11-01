import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// In-memory browser stub: bests.ts only touches window.localStorage.
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

import { levels } from "../data/levels";
import { buildMaze } from "@/lib/maze";
import { costsForMaze } from "@/lib/battery";
import { planRoute, previewOptionsFor } from "@/lib/pathfinding";
import {
  benchmarkLevel,
  fewestMoveEntry,
  optimalCostEntry,
} from "@/lib/benchmarks";
import {
  compareRuns,
  paginate,
  plannerScore,
  rankRuns,
  type RunMetrics,
} from "@/lib/leaderboard";
import {
  bestsKey,
  loadBests,
  recordStoryRun,
  type StoryRun,
} from "@/lib/bests";
import {
  newRunId,
  submissionForRun,
  submitRunAfterCompletion,
} from "@/lib/leaderboard-api";

function storyLevel(id: number) {
  const level = levels.find((entry) => entry.id === id);
  if (!level) throw new Error(`Level ${id} missing from data/levels.ts`);
  return level;
}

function metrics(overrides: Partial<RunMetrics> = {}): RunMetrics {
  return {
    moves: 25,
    remaining: 75,
    execMs: 10000,
    costRatio: 1,
    moveRatio: 1,
    completedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function storyRun(overrides: Partial<StoryRun> = {}): StoryRun {
  return {
    levelId: 4,
    planMs: 500,
    planCount: 1,
    ...metrics(),
    ...overrides,
  };
}

async function main(): Promise<void> {
  // --- Benchmarks use the canonical maze and execution cost model ---
  for (const id of [4, 5, 6]) {
    const level = storyLevel(id);
    const benchmarks = benchmarkLevel(level);
    assert.equal(benchmarks.levelId, id);
    assert.deepEqual(
      benchmarks.entries.map((entry) => entry.strategy),
      ["bfs", "dijkstra", "astar"]
    );

    const maze = buildMaze(level);
    const costs = costsForMaze(maze);
    for (const entry of benchmarks.entries) {
      const direct = planRoute(maze, maze.start, maze.exit, {
        ...previewOptionsFor(maze),
        strategy: entry.strategy,
        costs,
      });
      assert.equal(entry.reached, direct.reached);
      assert.equal(entry.reached, true, direct.reason);
      assert.equal(entry.moves, direct.moves);
      assert.equal(entry.cost, direct.cost);
      assert.equal(entry.expanded, direct.expanded);
      assert.ok(entry.expanded > 0);
      assert.ok(entry.ms >= 0);
      assert.equal(entry.affordable, true);
      assert.equal(entry.remaining, 100 - entry.cost);
    }
  }

  // --- Optimal / fewest-move selectors (Story 4 pins) ---
  {
    const benchmarks = benchmarkLevel(storyLevel(4));
    assert.equal(optimalCostEntry(benchmarks)?.cost, 25);
    assert.equal(fewestMoveEntry(benchmarks)?.moves, 19);
  }

  // --- Planner Challenger score: costRatio + moveRatio ---
  assert.equal(plannerScore(metrics()), 2);
  assert.equal(
    plannerScore(metrics({ costRatio: 1.25, moveRatio: 1.5 })),
    2.75
  );

  // --- Battery ranking: remaining desc, moves asc, execMs asc ---
  {
    const first = metrics({ remaining: 80, moves: 20 });
    const second = metrics({ remaining: 80, moves: 18 });
    assert.ok(compareRuns(second, first, "battery") < 0);
    assert.ok(compareRuns(first, second, "battery") > 0);
    const quick = metrics({ remaining: 80, moves: 18, execMs: 1000 });
    const slow = metrics({ remaining: 80, moves: 18, execMs: 2000 });
    assert.ok(compareRuns(quick, slow, "battery") < 0);
  }

  // --- Move ranking: moves asc, remaining desc, execMs asc ---
  {
    const first = metrics({ moves: 18, remaining: 70 });
    const second = metrics({ moves: 18, remaining: 75 });
    assert.ok(compareRuns(second, first, "moves") < 0);
  }

  // --- Planner ranking: score asc, then costRatio asc ---
  {
    const first = metrics({ costRatio: 1, moveRatio: 1.5 });
    const second = metrics({ costRatio: 1.25, moveRatio: 1.25 });
    assert.equal(plannerScore(first), plannerScore(second));
    assert.ok(compareRuns(first, second, "planner") < 0);
  }

  // --- Deterministic final tie-break: earlier completion first ---
  {
    const early = metrics({ completedAt: "2026-01-01T00:00:00.000Z" });
    const late = metrics({ completedAt: "2026-01-02T00:00:00.000Z" });
    for (const category of ["battery", "moves", "planner"] as const) {
      assert.ok(compareRuns(early, late, category) < 0);
      assert.equal(compareRuns(early, { ...early }, category), 0);
    }
  }

  // --- rankRuns returns a sorted copy without mutating input ---
  {
    const runs = [
      metrics({ remaining: 70 }),
      metrics({ remaining: 90 }),
      metrics({ remaining: 80 }),
    ];
    const ranked = rankRuns(runs, "battery");
    assert.deepEqual(
      ranked.map((run) => run.remaining),
      [90, 80, 70]
    );
    assert.deepEqual(
      runs.map((run) => run.remaining),
      [70, 90, 80]
    );
  }

  // --- Bounded pagination with clamped pages ---
  {
    const ranked = Array.from({ length: 25 }, (_, i) =>
      metrics({ remaining: 100 - i })
    );
    const page = paginate(ranked, 2, 10);
    assert.equal(page.items.length, 10);
    assert.equal(page.total, 25);
    assert.equal(page.totalPages, 3);
    assert.equal(page.items[0].remaining, 90);
    assert.equal(paginate(ranked, 99, 10).page, 3);
    assert.equal(paginate(ranked, 0, 10).page, 1);
    assert.equal(paginate(ranked, 1, 0).pageSize, 1);
  }

  // --- Tutorial runs never touch the Story leaderboard ---
  store.clear();
  {
    const { bests, isNewBest } = recordStoryRun(
      "userA",
      storyRun({ levelId: 1 })
    );
    assert.deepEqual(bests, {});
    assert.deepEqual(isNewBest, {
      battery: false,
      moves: false,
      planner: false,
    });
    assert.deepEqual(loadBests("userA"), {});
  }

  // --- First Story run sets every baseline ---
  {
    const { bests, isNewBest } = recordStoryRun("userA", storyRun());
    assert.deepEqual(isNewBest, {
      battery: true,
      moves: true,
      planner: true,
    });
    assert.equal(bests["4"]?.battery?.remaining, 75);
  }

  // --- Duplicate submissions are idempotent ---
  {
    const before = JSON.stringify(loadBests("userA"));
    const { isNewBest } = recordStoryRun("userA", storyRun());
    assert.deepEqual(isNewBest, {
      battery: false,
      moves: false,
      planner: false,
    });
    assert.equal(JSON.stringify(loadBests("userA")), before);
  }

  // --- Only strictly better runs replace a best, per category ---
  {
    const better = storyRun({
      moves: 30,
      remaining: 80,
      execMs: 12000,
      costRatio: 0.96,
      moveRatio: 1.2,
      completedAt: "2026-01-02T00:00:00.000Z",
    });
    const { isNewBest } = recordStoryRun("userA", better);
    assert.deepEqual(isNewBest, {
      battery: true,
      moves: false,
      planner: false,
    });
    const bests = loadBests("userA");
    assert.equal(bests["4"]?.battery?.remaining, 80);
    assert.equal(bests["4"]?.moves?.moves, 25);
  }

  // --- Bests are account-scoped, like progress ---
  {
    assert.equal(bestsKey("userA"), "roborally_bests_v1:userA");
    assert.equal(bestsKey(null), "roborally_bests_v1:guest");
    assert.notEqual(bestsKey("userA"), bestsKey("userB"));
    assert.deepEqual(loadBests("userB"), {});
    assert.deepEqual(loadBests(null), {});
    recordStoryRun(null, storyRun());
    assert.equal(loadBests(null)["4"]?.battery?.remaining, 75);
    assert.equal(loadBests("userA")["4"]?.battery?.remaining, 80);
  }

  // --- Server submissions carry the full run with a unique id ---
  {
    const run = storyRun();
    const submission = submissionForRun(run, "rid-1");
    assert.deepEqual(submission, {
      run_id: "rid-1",
      level_id: 4,
      moves: 25,
      remaining: 75,
      exec_ms: 10000,
      plan_ms: 500,
      plan_count: 1,
      cost_ratio: 1,
      move_ratio: 1,
      completed_at: "2026-01-01T00:00:00.000Z",
    });
    const generated = newRunId(4);
    assert.ok(generated.startsWith("4-"));
    assert.ok(generated.length > 4);
  }

  // --- Completion push settles before the run submission ---
  {
    const order: string[] = [];
    await submitRunAfterCompletion(
      () => {
        order.push("push");
        return Promise.resolve();
      },
      () => {
        order.push("submit");
        return Promise.resolve();
      }
    );
    assert.deepEqual(order, ["push", "submit"]);
  }

  // --- A failed push is retried once, then the run still goes out ---
  {
    const order: string[] = [];
    let pushes = 0;
    await submitRunAfterCompletion(
      () => {
        pushes += 1;
        order.push(`push${pushes}`);
        return pushes === 1
          ? Promise.reject(new Error("hiccup"))
          : Promise.resolve();
      },
      () => {
        order.push("submit");
        return Promise.resolve();
      }
    );
    assert.deepEqual(order, ["push1", "push2", "submit"]);
  }

  // --- Best-effort preserved: double failure still never throws ---
  {
    const order: string[] = [];
    await submitRunAfterCompletion(
      () => {
        order.push("push");
        return Promise.reject(new Error("down"));
      },
      () => {
        order.push("submit");
        return Promise.reject(new Error("down"));
      }
    );
    assert.deepEqual(order, ["push", "push", "submit"]);
  }

  // --- Corrupt or foreign stored data is ignored, never thrown ---
  {
    store.set(bestsKey("userC"), "not-json");
    assert.deepEqual(loadBests("userC"), {});
    store.set(
      bestsKey("userC"),
      JSON.stringify({
        "1": {
          battery: storyRun({ levelId: 1 }),
          moves: null,
          planner: null,
        },
        "4": { battery: { bogus: true }, moves: null, planner: null },
      })
    );
    assert.deepEqual(loadBests("userC"), {});
  }

  // --- Wins use the ordered chain, not concurrent uploads ---
  {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const mazeScene = readFileSync(
      join(root, "components/maze/MazeScene.tsx"),
      "utf8"
    );
    assert.ok(
      mazeScene.includes("submitRunAfterCompletion("),
      "story wins chain the completion push before the run"
    );
  }

  console.log("All story-results checks passed!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
