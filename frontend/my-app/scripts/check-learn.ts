import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { levels } from "../data/levels";
import { buildMaze } from "@/lib/maze";
import { validateMaze } from "@/lib/mazevalidation";
import { costsForMaze } from "@/lib/battery";
import {
  planRoute,
  previewOptionsFor,
  type SearchStrategy,
} from "@/lib/pathfinding";
import {
  cellKey,
  gradePrediction,
  shortestPathLength,
  traceBfs,
} from "@/lib/bfs";
import { BFS_LAB, LAB_MAZES } from "@/lib/labMazes";
import {
  DEFAULT_EXPLAIN_SPEED,
  MAX_EXPLAIN_SPEED,
  MIN_EXPLAIN_SPEED,
  STRATEGY_INTRO,
  bfsStepToEvent,
  describeStep,
  describeSummary,
  intervalFor,
} from "@/lib/explainSearch";

function route(
  id: 101 | 102 | 103 | 104,
  strategy: SearchStrategy
) {
  const def = LAB_MAZES.find((entry) => entry.id === id);
  assert.ok(def);
  const maze = buildMaze(def);
  return planRoute(maze, maze.start, maze.exit, {
    ...previewOptionsFor(maze),
    strategy,
    costs: costsForMaze(maze),
  });
}

// --- Lab mazes stay separate from the six game levels ---
{
  const gameIds = new Set(levels.map((level) => level.id));
  const gameLayouts = new Set(
    levels.map((level) => JSON.stringify(level.layout))
  );

  assert.equal(LAB_MAZES.length, 4);

  for (const lab of LAB_MAZES) {
    assert.ok(
      !gameIds.has(lab.id),
      `Lab id ${lab.id} collides with a game level.`
    );
    assert.ok(
      !gameLayouts.has(JSON.stringify(lab.layout)),
      `Lab "${lab.name}" duplicates a game level layout.`
    );
  }
}

// --- Structural invariants per lab maze ---
{
  const allowed: Record<number, Set<string>> = {
    101: new Set(["#", ".", "S", "E"]),
    102: new Set(["#", ".", "S", "E", "3", "5"]),
    103: new Set(["#", ".", "S", "E"]),
    104: new Set(["#", ".", "S", "E", "3", "5"]),
  };

  for (const lab of LAB_MAZES) {
    const width = lab.layout[0]?.length ?? 0;
    assert.ok(width > 0, `${lab.name}: empty layout`);

    for (const [z, row] of lab.layout.entries()) {
      assert.equal(
        row.length,
        width,
        `${lab.name}: row ${z} width ${row.length} != ${width}`
      );
      for (const symbol of row) {
        assert.ok(
          allowed[lab.id].has(symbol),
          `${lab.name}: unexpected symbol "${symbol}".`
        );
      }
    }

    const flat = lab.layout.join("");
    assert.equal(
      [...flat].filter((s) => s === "S").length,
      1,
      `${lab.name}: expected exactly one start.`
    );
    assert.equal(
      [...flat].filter((s) => s === "E").length,
      1,
      `${lab.name}: expected exactly one exit.`
    );

    const oracle = validateMaze(buildMaze(lab));
    assert.equal(
      oracle.solvable,
      true,
      `${lab.name}: the lab maze must stay solvable.`
    );
  }
}

// --- BFS lab: waves on unweighted terrain ---
{
  const maze = buildMaze(BFS_LAB);
  const trace = traceBfs(maze);

  assert.equal(trace.reachedExit, true);
  assert.equal(shortestPathLength(trace), 7);
  assert.equal(trace.visitedCount, 13);

  // Deterministic N-E-S-W order from (1, 1): north is a wall,
  // so east, then south, then the next wave.
  assert.deepEqual(trace.order[0], { x: 1, z: 1 });
  assert.deepEqual(trace.order[1], { x: 2, z: 1 });
  assert.deepEqual(trace.order[2], { x: 1, z: 2 });
  assert.deepEqual(trace.order[3], { x: 3, z: 1 });
  assert.deepEqual(traceBfs(maze).order, trace.order);

  const oracle = validateMaze(maze);
  assert.equal(trace.path.length, oracle.path.length);
  assert.equal(trace.visitedCount, oracle.visitedCount);

  assert.equal(gradePrediction(7, 7), true);
  assert.equal(gradePrediction(5, 7), false);
}

// --- Unreachable goal: walled-in start ---
{
  const sealed = buildMaze({
    id: 999,
    name: "Sealed",
    description: "test",
    layout: ["#####", "##S##", "#####", "##E##", "#####"],
  });
  const result = traceBfs(sealed);
  assert.equal(result.reachedExit, false);
  assert.deepEqual(result.path, []);
  assert.equal(shortestPathLength(result), -1);
}

// --- Dijkstra lab: short-expensive vs long-cheap fork ---
{
  const bfs = route(102, "bfs");
  const dijkstra = route(102, "dijkstra");
  const astar = route(102, "astar");

  assert.equal(bfs.reached, true);
  assert.deepEqual([bfs.moves, bfs.cost], [5, 13]);
  assert.deepEqual([dijkstra.moves, dijkstra.cost], [9, 9]);
  assert.deepEqual([astar.moves, astar.cost], [9, 9]);
  assert.ok(bfs.moves < dijkstra.moves);
  assert.ok(bfs.cost > dijkstra.cost);
}

// --- A* lab: same optimum, far less wandering ---
{
  const bfs = route(103, "bfs");
  const dijkstra = route(103, "dijkstra");
  const astar = route(103, "astar");

  for (const result of [bfs, dijkstra, astar]) {
    assert.equal(result.reached, true);
    assert.equal(result.moves, 7);
  }

  assert.deepEqual(
    [bfs.expanded, dijkstra.expanded, astar.expanded],
    [14, 14, 8]
  );
  assert.equal(astar.cost, dijkstra.cost);
  assert.ok(astar.expanded < bfs.expanded);
}

// --- Comparison lab: same optimum, visibly different search ---
{
  const bfs = route(104, "bfs");
  const dijkstra = route(104, "dijkstra");
  const astar = route(104, "astar");

  assert.deepEqual([bfs.moves, bfs.cost], [9, 29]);
  assert.deepEqual([dijkstra.moves, dijkstra.cost], [13, 13]);
  assert.deepEqual([astar.moves, astar.cost], [13, 13]);
  assert.deepEqual(
    [bfs.expanded, dijkstra.expanded, astar.expanded],
    [31, 44, 17]
  );

  // Dijkstra and A* trace the identical optimal route here; the
  // lesson is the search coverage, which must stay clearly apart.
  assert.deepEqual(
    dijkstra.path.map(cellKey),
    astar.path.map(cellKey)
  );
  assert.notDeepEqual(
    bfs.path.map(cellKey),
    dijkstra.path.map(cellKey)
  );
  assert.ok(
    dijkstra.expanded > astar.expanded * 2,
    "Dijkstra explores more than twice the states A* does"
  );
}

// --- Thinking narration: every animation explains the real execution ---
{
  // Required beginner wordings, one pop rule per strategy.
  assert.match(STRATEGY_INTRO.bfs.rule, /level by level/);
  assert.match(STRATEGY_INTRO.dijkstra.rule, /lowest known/);
  assert.match(STRATEGY_INTRO.astar.rule, /f\(n\) = g\(n\) \+ h\(n\)/);

  // BFS lesson: adapted steps carry the real depths and neighbor counts.
  const bfsMaze = buildMaze(BFS_LAB);
  const bfsTrace = traceBfs(bfsMaze);
  const bfsEvents = bfsTrace.steps.map(bfsStepToEvent);
  assert.equal(bfsEvents.length, bfsTrace.steps.length);

  for (const event of bfsEvents) {
    if (event.goal) continue;
    assert.equal(
      event.added.length + event.skippedBlocked + event.skippedSeen,
      4,
      "every BFS neighbor is classified exactly once"
    );
  }

  const bfsFirst = bfsEvents[0];
  assert.deepEqual(bfsFirst.node, { x: 1, z: 1 });
  assert.equal(bfsFirst.g, 0);
  assert.equal(bfsFirst.f, 0);

  const bfsGoal = bfsEvents[bfsEvents.length - 1];
  assert.equal(bfsGoal.goal, true);
  assert.equal(bfsGoal.g, 7, "goal depth equals the 7-move optimum");

  // Narration repeats recorded numbers; nothing is invented.
  const bfsSecond = describeStep("bfs", bfsEvents[1]);
  assert.match(bfsSecond.headline, /1 move from the start/);
  assert.deepEqual(bfsSecond.stats, [
    { label: "Distance from start", value: "1 move" },
  ]);
  assert.match(bfsSecond.detail, /waiting/);
  assert.equal(
    describeStep("bfs", bfsGoal).headline,
    "Exit reached!"
  );
  assert.match(
    describeSummary("bfs", {
      reached: true,
      moves: 7,
      expanded: bfsEvents.length,
    }),
    /7 moves/
  );

  // Weighted labs: traces align with the animated expansion order and
  // honor each strategy's pop rule on the real lab-102 fork.
  const fork = LAB_MAZES.find((entry) => entry.id === 102);
  assert.ok(fork);
  const forkMaze = buildMaze(fork);
  const forkCosts = costsForMaze(forkMaze);

  for (const strategy of ["bfs", "dijkstra", "astar"] as const) {
    const untraced = planRoute(forkMaze, forkMaze.start, forkMaze.exit, {
      ...previewOptionsFor(forkMaze),
      strategy,
      costs: forkCosts,
    });
    assert.equal(
      untraced.trace,
      undefined,
      `${strategy} stays allocation-free without the trace flag`
    );

    const result = planRoute(forkMaze, forkMaze.start, forkMaze.exit, {
      ...previewOptionsFor(forkMaze),
      strategy,
      costs: forkCosts,
      trace: true,
    });
    const events = result.trace;
    assert.ok(events, `${strategy} records a narration trace`);
    assert.equal(events.length, result.order.length);

    for (const [index, event] of events.entries()) {
      assert.deepEqual(
        event.node,
        result.order[index],
        `${strategy} event ${index} matches the animated order`
      );
      if (!event.goal) {
        assert.equal(
          event.added.length +
            event.updated.length +
            event.skippedBlocked +
            event.skippedSeen,
          4,
          `${strategy} classifies all four neighbors per expansion`
        );
      }
      if (strategy === "astar") {
        assert.equal(
          event.f,
          event.g + event.h,
          "A* pops by exactly g + h"
        );
      }
      if (index > 0) {
        assert.ok(
          event.f >= events[index - 1].f,
          `${strategy} pop priority never moves backwards`
        );
      }
    }

    const goal = events[events.length - 1];
    assert.equal(goal.goal, true);
    if (strategy === "bfs") {
      assert.equal(goal.g, result.moves);
    } else {
      assert.equal(goal.g, result.cost);
    }
  }

  // Weighted narration shows the real priority values.
  const dijkstraTrace = planRoute(
    forkMaze,
    forkMaze.start,
    forkMaze.exit,
    {
      ...previewOptionsFor(forkMaze),
      strategy: "dijkstra",
      costs: forkCosts,
      trace: true,
    }
  ).trace;
  assert.ok(dijkstraTrace);
  const dijkstraFirst = describeStep("dijkstra", dijkstraTrace[0]);
  assert.match(dijkstraFirst.headline, /cheapest waiting cell/);
  assert.deepEqual(dijkstraFirst.stats, [
    { label: "Cost so far", value: "0% battery" },
  ]);
  assert.match(
    describeSummary("dijkstra", {
      reached: true,
      moves: 9,
      expanded: dijkstraTrace.length,
      cost: 9,
    }),
    /9 moves.*≈9% battery/
  );

  const astarTrace = planRoute(forkMaze, forkMaze.start, forkMaze.exit, {
    ...previewOptionsFor(forkMaze),
    strategy: "astar",
    costs: forkCosts,
    trace: true,
  }).trace;
  assert.ok(astarTrace);
  const astarLive = astarTrace.find((event) => !event.goal);
  assert.ok(astarLive);
  const astarNarration = describeStep("astar", astarLive);
  assert.deepEqual(astarNarration.stats[2], {
    label: "f(n) · total",
    value: `${astarLive.f}`,
  });
}

// --- Thinking panel wiring: every animation surface renders it ---
{
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const learnPanels = readFileSync(
    join(root, "components/learn/LearnPanels.tsx"),
    "utf8"
  );
  const costLab = readFileSync(
    join(root, "components/learn/CostLab.tsx"),
    "utf8"
  );
  const thinkingPanel = readFileSync(
    join(root, "components/learn/ThinkingPanel.tsx"),
    "utf8"
  );

  assert.match(
    learnPanels,
    /bfsStepToEvent/,
    "BFS lesson adapts real trace steps, never invented ones"
  );
  assert.match(
    learnPanels,
    /<ThinkingPanel/,
    "BFS lesson renders the thinking panel"
  );
  assert.match(
    costLab,
    /BASE_STEP_MS = 1000/,
    "Dijkstra/A* lab plays 1s per step at 1x"
  );
  assert.match(
    learnPanels,
    /BASE_STEP_MS = 1000/,
    "BFS lesson plays 1s per step at 1x"
  );
  assert.match(
    costLab,
    /<SpeedSlider/,
    "Dijkstra/A* lab offers a speed slider"
  );
  assert.match(
    learnPanels,
    /<SpeedSlider/,
    "BFS lesson offers a speed slider"
  );
  assert.match(
    costLab,
    /intervalFor\(BASE_STEP_MS, speed\)/,
    "Dijkstra/A* lab scales its pace by the slider"
  );
  assert.match(
    learnPanels,
    /intervalFor\(BASE_STEP_MS, speed\)/,
    "BFS lesson scales its pace by the slider"
  );

  // Speed math on the real helper: 0.5x doubles, 4x quarters.
  assert.equal(DEFAULT_EXPLAIN_SPEED, 1);
  assert.equal(MIN_EXPLAIN_SPEED, 0.5);
  assert.equal(MAX_EXPLAIN_SPEED, 4);
  assert.equal(intervalFor(1000, 1), 1000);
  assert.equal(intervalFor(1000, 0.5), 2000);
  assert.equal(intervalFor(1000, 4), 250);
  assert.equal(intervalFor(1000, 0), 1000);
  assert.match(
    costLab,
    /trace: true/,
    "Dijkstra/A* lab records narration traces"
  );
  assert.match(
    costLab,
    /<ThinkingPanel/,
    "Dijkstra/A* lab renders the thinking panel"
  );
  assert.match(
    thinkingPanel,
    /aria-live/,
    "thinking panel announces step changes"
  );
  assert.match(
    thinkingPanel,
    /describeStep/,
    "panel narrates from recorded events"
  );
  assert.match(
    thinkingPanel,
    /describeSummary/,
    "panel summarizes the real outcome"
  );
}

console.log("Learn lab checks passed!");
