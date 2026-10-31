
"use client";

import { useMemo, useState } from "react";
import { moveRobot, type RobotState } from "@/lib/gamelogic";
import { cellKey, shortestPathLength } from "@/lib/bfs";
import {
  requestPlan,
  type PlanAction,
  type PlanResponse,
} from "@/lib/agent";
import MazeGrid from "./MazeGrid";
import { LAB_LEVEL_ID, type LabMaze } from "./LearnPanels";

const DEFAULT_MISSION = "Reach the exit.";

function actionsToPositions(
  maze: Parameters<typeof moveRobot>[2],
  start: { x: number; z: number },
  actions: PlanAction[]
) {
  const positions = [{ ...start }];
  let state: RobotState = { ...start, direction: "south" };

  for (const action of actions) {
    state = moveRobot(state, action.direction, maze, false);
    positions.push({ x: state.x, z: state.z });
  }

  return positions;
}

export default function CompareSection({ lab }: { lab: LabMaze }) {
  const { maze, trace } = lab;
  const [mission, setMission] = useState(DEFAULT_MISSION);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [error, setError] = useState("");
  const [playStep, setPlayStep] = useState(0);

  const bfsPath = useMemo(
    () => new Set(trace.path.map(cellKey)),
    [trace.path]
  );
  const bfsExplored = useMemo(
    () => new Set(trace.order.map(cellKey)),
    [trace.order]
  );

  const agentPositions = useMemo(
    () =>
      plan
        ? actionsToPositions(maze, maze.start, plan.actions)
        : [{ ...maze.start }],
    [maze, plan]
  );
  const agentTrail = useMemo(
    () =>
      new Set(
        agentPositions.slice(0, playStep + 1).map(cellKey)
      ),
    [agentPositions, playStep]
  );

  async function handleRequest() {
    setLoading(true);
    setError("");
    setPlan(null);
    setPlayStep(0);

    try {
      const response = await requestPlan({
        level_id: LAB_LEVEL_ID,
        mission,
        robot: {
          x: maze.start.x,
          z: maze.start.z,
          direction: "south",
        },
        enemies: [],
        door_open: false,
      });

      setPlan(response);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Planning failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  const generated = plan
    ? plan.actions.length + plan.rejected.length
    : 0;

  return (
    <section
      aria-labelledby="agent-comparison"
      className="rounded-2xl border border-border bg-surface p-6 sm:p-8"
    >
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-accent">
        Side-by-side comparison
      </p>
      <h2 id="agent-comparison" className="mt-2 text-2xl font-black">
        Classical search vs AI agent
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
        Both panels use the identical Level 1 maze, start, exit, and
        four-direction movement rules. BFS systematically proves the
        shortest route; the Meta AI agent generates a plan from your
        words, which the game then validates move by move. The
        metrics below measure different things: BFS reports search
        coverage and a guaranteed optimum, while the agent reports
        what it proposed, what passed validation, and what the
        simulated playback shows. The model does not guarantee an
        optimal path.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-background p-4">
          <h3 className="font-bold">BFS (deterministic)</h3>
          <div className="mt-3">
            <MazeGrid
              maze={maze}
              explored={bfsExplored}
              path={bfsPath}
              label="BFS final coverage and shortest path"
            />
          </div>
          <dl className="mt-3 space-y-1 text-sm text-muted">
            <div className="flex justify-between gap-2">
              <dt>Cells visited</dt>
              <dd className="font-mono font-bold text-foreground">
                {trace.visitedCount}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Path length</dt>
              <dd className="font-mono font-bold text-foreground">
                {shortestPathLength(trace)} moves
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Optimality</dt>
              <dd className="font-bold text-success">
                Optimal (static, unweighted)
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-border bg-background p-4">
          <h3 className="font-bold">Meta AI agent (model)</h3>

          <div className="mt-3 flex gap-2">
            <input
              value={mission}
              onChange={(event) => setMission(event.target.value)}
              maxLength={500}
              aria-label="Mission for the AI agent"
              className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent"
            />
            <button
              type="button"
              onClick={handleRequest}
              disabled={loading || mission.trim().length === 0}
              className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-bold text-accent-foreground transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Planning..." : "Plan"}
            </button>
          </div>

          {error && (
            <p
              role="alert"
              className="mt-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs leading-5 text-danger"
            >
              {error}
            </p>
          )}

          {!plan && !error && (
            <p className="mt-3 text-sm leading-6 text-muted">
              Request a plan to see what the model proposes for this
              exact maze and start position.
            </p>
          )}

          {plan && (
            <>
              <div className="mt-3">
                <MazeGrid
                  maze={maze}
                  path={agentTrail}
                  marker={agentPositions[playStep] ?? null}
                  label={`Agent plan playback at step ${playStep}`}
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setPlayStep((s) =>
                      Math.max(0, s - 1)
                    )
                  }
                  disabled={playStep === 0}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold transition hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPlayStep((s) =>
                      Math.min(s + 1, agentPositions.length - 1)
                    )
                  }
                  disabled={
                    playStep >= agentPositions.length - 1
                  }
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold transition hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Step →
                </button>
                <span className="text-xs text-muted">
                  Step {playStep} of {agentPositions.length - 1}
                </span>
              </div>

              <dl className="mt-3 space-y-1 text-sm text-muted">
                <div className="flex justify-between gap-2">
                  <dt>Model</dt>
                  <dd className="font-mono text-foreground">
                    {plan.model}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Actions proposed</dt>
                  <dd className="font-mono font-bold text-foreground">
                    {generated}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Approved / rejected</dt>
                  <dd className="font-mono font-bold text-foreground">
                    {plan.actions.length} / {plan.rejected.length}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Optimality</dt>
                  <dd className="font-bold text-warning">
                    Not guaranteed
                  </dd>
                </div>
              </dl>

              {plan.rejected.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {plan.rejected.slice(0, 3).map((item) => (
                    <li
                      key={item.index}
                      className="text-xs leading-5 text-muted"
                    >
                      #{item.index + 1}: {item.reason}
                    </li>
                  ))}
                  {plan.rejected.length > 3 && (
                    <li className="text-xs text-muted">
                      +{plan.rejected.length - 3} more rejections
                    </li>
                  )}
                </ul>
              )}

              <p className="mt-2 text-xs leading-5 text-muted">
                Simulated playback of the approved plan on this grid —
                not a live game. Rejected moves never execute.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
