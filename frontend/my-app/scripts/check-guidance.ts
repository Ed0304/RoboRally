import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { levels } from "../data/levels";
import { buildMaze } from "@/lib/maze";
import { INSIDER_TIP_BODY, INSIDER_TIP_TITLE } from "@/lib/insiderTip";
import { canMoveTo } from "@/lib/gamelogic";
import type { PlanDirection, PlanResponse } from "@/lib/agent";
import {
  compressDirections,
  parsePromptSegments,
  PLANNER_ACTION_BUDGET,
  tutorialExampleForLevel,
} from "@/lib/tutorialExamples";
import {
  classifyPlanningError,
  compressActions,
  summarizePlan,
} from "@/lib/planSummary";

function planResponse(
  directions: PlanDirection[],
  rejectedCount: number
): PlanResponse {
  return {
    model: "test-model",
    actions: directions.map((direction) => ({ op: "move", direction })),
    reasoning: "test reasoning",
    rejected: Array.from({ length: rejectedCount }, (_, index) => ({
      index,
      reason: "blocked",
    })),
  };
}

async function main(): Promise<void> {
  // --- Examples exist for Tutorial levels only ---
  for (const id of [1, 2, 3]) {
    assert.ok(
      tutorialExampleForLevel(id),
      `tutorial example exists for level ${id}`
    );
  }

  for (const id of [0, 4, 5, 6, 99]) {
    assert.equal(
      tutorialExampleForLevel(id),
      null,
      `no example for level ${id}`
    );
  }

  // --- Pinned reference routes (layout drift fails loudly) ---
  assert.deepEqual(
    [1, 2, 3].map((id) => {
      const example = tutorialExampleForLevel(id);
      assert.ok(example);
      return [example.moves, example.cost, example.strategy];
    }),
    [
      [14, 14, "bfs"],
      [18, 18, "dijkstra"],
      [14, 14, "astar"],
    ]
  );

  // --- Each example route is engine-legal, laser-free, affordable ---
  for (const id of [1, 2, 3]) {
    const example = tutorialExampleForLevel(id);
    assert.ok(example);

    const level = levels.find((entry) => entry.id === id);
    assert.ok(level);
    const maze = buildMaze(level);

    assert.equal(example.directions.length, example.moves);
    assert.ok(
      example.moves <= PLANNER_ACTION_BUDGET,
      `L${id} fits the ${PLANNER_ACTION_BUDGET}-move planning budget`
    );
    assert.ok(
      example.cost <= 100,
      `L${id} fits the 100% battery budget`
    );
    assert.ok(
      example.prompt.length <= 500,
      `L${id} prompt fits the mission input limit`
    );

    let x = maze.start.x;
    let z = maze.start.z;

    for (const direction of example.directions) {
      const next = {
        x: x + (direction === "east" ? 1 : direction === "west" ? -1 : 0),
        z: z + (direction === "south" ? 1 : direction === "north" ? -1 : 0),
      };
      assert.ok(
        canMoveTo(next.x, next.z, maze, false),
        `L${id} step ${direction} to (${next.x}, ${next.z}) is engine-legal`
      );
      const tile = maze.tiles.find(
        (entry) => entry.x === next.x && entry.z === next.z
      );
      assert.notEqual(
        tile?.type,
        "laser",
        `L${id} route never steps on a laser`
      );
      x = next.x;
      z = next.z;
    }

    assert.deepEqual(
      { x, z },
      maze.exit,
      `L${id} example route reaches the exit`
    );
  }

  // --- Prompt text matches its route by construction ---
  for (const id of [1, 2, 3]) {
    const example = tutorialExampleForLevel(id);
    assert.ok(example);
    assert.deepEqual(
      parsePromptSegments(example.prompt),
      compressDirections(example.directions),
      `L${id} prompt round-trips to its route`
    );
  }

  assert.ok(
    tutorialExampleForLevel(3)?.prompt.includes("south 1 step"),
    "singular step count reads naturally"
  );
  assert.equal(parsePromptSegments("Reach the exit!"), null);

  // --- Interpretation summary reflects actual plan data ---
  {
    const summary = summarizePlan(
      planResponse(["east", "east", "south"], 2)
    );
    assert.ok(summary.includes("3 validated moves"));
    assert.ok(summary.includes("east 2 steps → south 1 step"));
    assert.ok(summary.includes("2 proposed moves"));
  }

  {
    const single = summarizePlan(planResponse(["north"], 0));
    assert.ok(single.includes("1 validated move "));
    assert.ok(!single.includes("didn't pass validation"));
  }

  {
    const empty = summarizePlan(planResponse([], 1));
    assert.ok(empty.includes("couldn't turn your words"));
    for (const word of ["north", "south", "east", "west"]) {
      assert.ok(
        !empty.includes(word),
        `empty summary invents no ${word} moves`
      );
    }
  }

  // No fabrication: every direction named comes from the input.
  {
    const summary = summarizePlan(
      planResponse(["west", "west", "west"], 0)
    );
    assert.ok(summary.includes("west 3 steps"));
    for (const word of ["north", "south", "east"]) {
      assert.ok(
        !summary.includes(word),
        `summary invents no ${word} moves`
      );
    }
    assert.equal(
      summary,
      summarizePlan(planResponse(["west", "west", "west"], 0))
    );
  }

  assert.deepEqual(
    compressActions(planResponse(["south", "south"], 0).actions),
    [{ direction: "south", count: 2 }]
  );

  // --- Error classification: network vs planning ---
  assert.equal(
    classifyPlanningError(new TypeError("Failed to fetch")),
    "network"
  );
  assert.equal(
    classifyPlanningError(new Error("Load failed")),
    "network"
  );
  assert.equal(
    classifyPlanningError(new Error("Network request failed")),
    "network"
  );
  assert.equal(
    classifyPlanningError(
      new Error("Mission planning failed: the model returned an empty response.")
    ),
    "planning"
  );
  assert.equal(
    classifyPlanningError(new Error("Request failed (502)")),
    "planning"
  );
  assert.equal(classifyPlanningError("boom"), "planning");
  assert.equal(classifyPlanningError(null), "planning");

  // --- Insider tip: incremental plans beat giant ones ---
  assert.equal(INSIDER_TIP_TITLE, "Insider tip");
  for (const phrase of [
    "wall",
    "where the robot stopped",
    "small plans",
    "large mazes",
  ]) {
    assert.ok(
      INSIDER_TIP_BODY.includes(phrase),
      `tip mentions "${phrase}"`
    );
  }

  // Rendered on every game level and on How to Play.
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const mazeScene = readFileSync(
    join(root, "components/maze/MazeScene.tsx"),
    "utf8"
  );
  const howtoplay = readFileSync(
    join(root, "src/app/howtoplay/page.tsx"),
    "utf8"
  );
  assert.ok(
    mazeScene.includes("{INSIDER_TIP_BODY}"),
    "every level shows the insider tip"
  );
  assert.ok(
    howtoplay.includes("{INSIDER_TIP_BODY}"),
    "how to play shows the insider tip"
  );

  // --- Prompt history deletion: per-entry + clear-all wiring ---
  const playerDetails = readFileSync(
    join(root, "src/app/playerdetails/page.tsx"),
    "utf8"
  );
  const userClient = readFileSync(join(root, "src/lib/user.ts"), "utf8");
  for (const token of [
    "deletePromptEntry",
    "clearPromptHistory",
    'method: "DELETE"',
  ]) {
    assert.ok(userClient.includes(token), `user client has ${token}`);
  }
  for (const token of [
    "deletePromptEntry",
    "clearPromptHistory",
    "Clear all",
    "Yes, clear all",
    "Delete prompt:",
    "storedIndex",
  ]) {
    assert.ok(
      playerDetails.includes(token),
      `player details page has ${token}`
    );
  }

  console.log("All guidance checks passed!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
