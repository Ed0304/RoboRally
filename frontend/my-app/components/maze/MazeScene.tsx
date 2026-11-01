
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Canvas, useThree } from "@react-three/fiber";
import type { OrthographicCamera } from "three";

import type { LevelData } from "@/lib/levels";
import { buildMaze } from "@/lib/maze";
import {
  advanceEnemies,
  createEnemies,
  validatePatrolRoutes,
  type EnemyPosition,
  isRobotDetected,
} from "@/lib/enemyAI";
import { ENEMY_PATROLS } from "@/lib/enemyRoutes";
import MazeTiles from "./MazeTiles";
import Robot from "./Robot";
import Compass from "./Compass";
import MissionPanel from "./MissionPanel";
import ReplayPanel from "./ReplayPanel";
import TutorialLesson from "./TutorialLesson";
import StoryResults, { type StoryResultData } from "./StoryResults";

import {
  moveRobot,
  checkGameStatus,
  type RobotState,
  type GameStatus,
} from "@/lib/gamelogic";
import {
  BATTERY_MAX,
  canAfford,
  costsForMaze,
  deductBattery,
  estimatePlanCost,
  moveCost,
  stepDestination,
  toastForMove,
} from "@/lib/battery";
import type { PlanAction } from "@/lib/agent";
import type {
  RouteCell,
  SearchStrategy,
  StrategyComparison,
} from "@/lib/pathfinding";
import {
  EXPLORED_STEP_MS,
  REPLAY_STEP_MS,
  replayCells,
  replayRoutes,
} from "@/lib/replay";
import {
  EXEC_STEP_DELAY_MS,
  IDLE_EXECUTION,
  PAUSE_POLL_MS,
  coachForBlocked,
  coachForDepleted,
  coachForMove,
  coachForOutcome,
  describeProgress,
  verifyStepPrereqs,
  type ExecutionState,
} from "@/lib/execution";
import {
  completeLevel,
  getNextLevelId,
  pushCompletion,
} from "@/lib/progress";
import {
  benchmarkLevel,
  fewestMoveEntry,
  optimalCostEntry,
} from "@/lib/benchmarks";
import {
  loadBests,
  recordStoryRun,
  type StoryRun,
} from "@/lib/bests";
import {
  newRunId,
  submissionForRun,
  submitStoryRun,
} from "@/lib/leaderboard-api";

interface MazeSceneProps {
  level: LevelData;
  /** Tutorial mode: coach messages instead of a route preview line. */
  tutorialMode?: boolean;
}



function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function MazeScene({ level, tutorialMode = false }: MazeSceneProps) {
  return <LoadedMazeScene key={level.id} level={level} tutorialMode={tutorialMode} />;
}

// Constant top-down view: screen-up is world -Z (North) and
// screen-right is world +X (East), matching the compass. Change this
// single constant to rotate the view if needed.
const TOP_DOWN_UP: [number, number, number] = [0, 0, -1];

// Fit the whole maze in view: R3F's orthographic camera covers one
// world unit per pixel at zoom 1, so zoom = pixels per tile needed
// to fit the maze plus a one-tile margin on every side.
function FitMazeToView({ width, depth }: { width: number; depth: number }) {
  const camera = useThree((state) => state.camera) as OrthographicCamera;
  const size = useThree((state) => state.size);

  useEffect(() => {
    camera.zoom = Math.min(
      size.width / (width + 2),
      size.height / (depth + 2)
    );
    camera.updateProjectionMatrix();
  }, [camera, size, width, depth]);

  return null;
}

function LoadedMazeScene({
  level,
  tutorialMode = false,
}: {
  level: LevelData;
  tutorialMode?: boolean;
}) {

  const maze = useMemo(() => buildMaze(level), [level]);
  const costs = useMemo(() => costsForMaze(maze), [maze]);

  const routes = useMemo(
    () => ENEMY_PATROLS[level.id] ?? [],
    [level.id]
  );

  const routeErrors = useMemo(
    () => validatePatrolRoutes(routes, maze),
    [routes, maze]
  );

  const [robotState, setRobotState] = useState<RobotState>(() => ({
    ...maze.start,
    direction: "south",
  }));

  const [enemyPositions, setEnemyPositions] = useState<EnemyPosition[]>(
    () => createEnemies(routes, maze)
  );

  const [status, setStatus] = useState<GameStatus>("playing");
  const [doorOpen, setDoorOpen] = useState(false);
  const [battery, setBattery] = useState(BATTERY_MAX);
  const batteryRef = useRef(BATTERY_MAX);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastIdRef = useRef(0);
  // Tutorial-only coach line narrating the latest executed step.
  const [coach, setCoach] = useState<string | null>(null);
  // Post-win what-if replay: ghost marker over the maze. Never touches
  // the robot, battery, status, or progression.
  const [replay, setReplay] = useState<{
    strategy: SearchStrategy;
    path: RouteCell[];
    routeHead: number;
    order: RouteCell[];
    exploredHead: number;
    phase: "exploring" | "routing";
  } | null>(null);

  // Refs let the patrol timer and plan executor access latest state.
  const robotRef = useRef(robotState);
  const enemiesRef = useRef(enemyPositions);
  const statusRef = useRef(status);
  const doorOpenRef = useRef(doorOpen);

  const won = status === "won";
  const dead = status === "dead";
  const nextLevelId = getNextLevelId(level.id);
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [showDoorUnlocked, setShowDoorUnlocked] = useState(false);
  const [execution, setExecution] =
    useState<ExecutionState>(IDLE_EXECUTION);
  const execCancelRef = useRef(false);
  const execRunningRef = useRef(false);
  const execPausedRef = useRef(false);
  const completionSavedRef = useRef(false);
  // Story run tracking: successful moves, execution wall time, and Muse
  // Spark planning time since load/restart. Powers StoryResults only.
  const runMovesRef = useRef(0);
  const runExecMsRef = useRef(0);
  const runPlanMsRef = useRef(0);
  const runPlanCountRef = useRef(0);
  const [storyResult, setStoryResult] = useState<StoryResultData | null>(null);
  const router = useRouter();

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    robotRef.current = robotState;
  }, [robotState]);

  useEffect(() => {
    enemiesRef.current = enemyPositions;
  }, [enemyPositions]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    doorOpenRef.current = doorOpen;
  }, [doorOpen]);

  useEffect(() => {
    if (routeErrors.length > 0) {
      console.error(
        `[RoboRally] Invalid patrol routes for level ${level.id}:`,
        routeErrors
      );
    }
  }, [level.id, routeErrors]);

  useEffect(() => {
    if (!showDoorUnlocked) return;

    const timeout = setTimeout(() => {
      setShowDoorUnlocked(false);
    }, 2000);

    return () => clearTimeout(timeout);
  }, [showDoorUnlocked]);

  useEffect(() => {
    return () => {
      execCancelRef.current = true;
    };
  }, []);

  // What-if routes, computed once per win from the canonical maze.
  const replayOptions = useMemo<StrategyComparison[] | null>(
    () => (won ? replayRoutes(maze, costs) : null),
    [won, maze, costs]
  );

  // Two-phase stepper. First the explored overlay grows in true
  // expansion order; then the route trail animates under the ghost
  // marker. Cleanup stops the timer on unmount or level change.
  useEffect(() => {
    if (!replay) return;
    if (replay.phase === "exploring") {
      if (replay.exploredHead >= replay.order.length - 1) {
        setReplay((prev) =>
          prev === null
            ? null
            : {
                ...prev,
                phase: "routing",
                routeHead: 0,
                exploredHead: prev.order.length - 1,
              }
        );
        return;
      }
      const timer = setTimeout(() => {
        setReplay((prev) =>
          prev === null
            ? null
            : { ...prev, exploredHead: prev.exploredHead + 1 }
        );
      }, EXPLORED_STEP_MS);
      return () => clearTimeout(timer);
    }
    if (replay.routeHead >= replay.path.length - 1) return;
    const timer = setTimeout(() => {
      setReplay((prev) =>
        prev === null ? null : { ...prev, routeHead: prev.routeHead + 1 }
      );
    }, REPLAY_STEP_MS);
    return () => clearTimeout(timer);
  }, [replay]);

  const replayExploring =
    replay !== null && replay.phase === "exploring";
  const replayTrail = useMemo(
    () =>
      replay && replay.phase === "routing"
        ? replayCells(replay.path, replay.routeHead)
        : undefined,
    [replay]
  );
  const replayExploredSet = useMemo(
    () =>
      replay ? replayCells(replay.order, replay.exploredHead) : undefined,
    [replay]
  );
  const replayHeadCell =
    replay && replay.phase === "routing"
      ? replay.path[replay.routeHead]
      : null;
  const replayFinished =
    replay !== null &&
    replay.phase === "routing" &&
    replay.routeHead >= replay.path.length - 1;

  function startReplay(strategy: SearchStrategy) {
    const found = replayOptions?.find(
      (entry) => entry.strategy === strategy
    );
    if (!found || !found.result.reached) return;
    const reduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReplay({
      strategy,
      path: found.result.path,
      routeHead: reduced ? found.result.path.length - 1 : 0,
      order: found.result.order,
      exploredHead: reduced ? found.result.order.length - 1 : 0,
      phase: reduced ? "routing" : "exploring",
    });
  }

  function stopReplay() {
    setReplay(null);
  }

  // Record completion once, scoped to the signed-in account (or the
  // guest namespace when signed out). Guests never upload: their wins
  // stay on this device until they play signed in.
  useEffect(() => {
    if (status === "won" && !completionSavedRef.current) {
      completionSavedRef.current = true;
      completeLevel(level.id, userId);

      if (userId !== null) {
        pushCompletion(level.id).catch(() => {});
      }

      // Story-only results: compare the confirmed win against
      // deterministic benchmarks and record personal bests. Benchmark
      // failures must never break the win flow.
      if (!tutorialMode) {
        try {
          const benchmarks = benchmarkLevel(level);
          const optimal = optimalCostEntry(benchmarks);
          const fewest = fewestMoveEntry(benchmarks);

          if (
            optimal !== null &&
            fewest !== null &&
            optimal.cost > 0 &&
            fewest.moves > 0
          ) {
            const spent = BATTERY_MAX - batteryRef.current;
            const run: StoryRun = {
              levelId: level.id,
              moves: runMovesRef.current,
              remaining: batteryRef.current,
              execMs: Math.round(runExecMsRef.current),
              planMs: Math.round(runPlanMsRef.current),
              planCount: runPlanCountRef.current,
              costRatio: spent / optimal.cost,
              moveRatio: runMovesRef.current / fewest.moves,
              completedAt: new Date().toISOString(),
            };
            const previous = loadBests(userId);
            const { isNewBest } = recordStoryRun(userId, run);
            setStoryResult({ run, benchmarks, previous, isNewBest });

            // Guests never upload; authenticated submissions are
            // best-effort and completion-gated server-side.
            if (userId !== null) {
              submitStoryRun(
                submissionForRun(run, newRunId(level.id))
              ).catch(() => {});
            }
          }
        } catch {
          // No results panel; progression above is already saved.
        }
      }
    }
  }, [status, level, level.id, userId, tutorialMode]);

  const displayedEnemies = enemyPositions.map((enemy) => {
  const alerted = isRobotDetected(robotState, [enemy], maze, 2);

  let facing = enemy.facing;

  if (alerted) {
    const dx = robotState.x - enemy.x;
    const dz = robotState.z - enemy.z;

    if (Math.abs(dx) > Math.abs(dz)) {
      facing = dx > 0 ? "east" : "west";
    } else if (dz !== 0) {
      facing = dz > 0 ? "south" : "north";
    } else if (dx !== 0) {
      facing = dx > 0 ? "east" : "west";
    }
  }

  return { ...enemy, facing, alerted };
});

  // Move patrol enemies once every 800 ms.
  useEffect(() => {
    if (status !== "playing") return;

    const timer = window.setInterval(() => {
      const nextEnemies = advanceEnemies(
        enemiesRef.current,
        routes,
        maze
      );

      enemiesRef.current = nextEnemies;
      setEnemyPositions(nextEnemies);

      const nextStatus = checkGameStatus(
        robotRef.current,
        maze,
        nextEnemies
      );

      if (nextStatus !== "playing") {
        statusRef.current = nextStatus;
        setStatus(nextStatus);
      }
    }, 800);

    return () => window.clearInterval(timer);
  }, [status, routes, maze]);

  // Single shared movement path for plan execution; the AI agent is
  // the sole driver and every step flows through here.
  const attemptMove = useCallback(
    (
      direction: RobotState["direction"]
    ): { moved: boolean; status: GameStatus } => {
      const nextRobot = moveRobot(
        robotRef.current,
        direction,
        maze,
        doorOpenRef.current
      );

      const moved =
        nextRobot.x !== robotRef.current.x ||
        nextRobot.z !== robotRef.current.z;

      const trigger = maze.tiles.find(
        (tile) => tile.type === "trigger"
      );

      if (
        trigger &&
        nextRobot.x === trigger.x &&
        nextRobot.z === trigger.z
      ) {
        doorOpenRef.current = true;
        setDoorOpen(true);
        setShowDoorUnlocked(true);
      }

      robotRef.current = nextRobot;
      setRobotState(nextRobot);

      const nextStatus = checkGameStatus(
        nextRobot,
        maze,
        enemiesRef.current
      );

      if (nextStatus !== "playing") {
        statusRef.current = nextStatus;
        setStatus(nextStatus);
      }

      return { moved, status: statusRef.current };
    },
    [maze]
  );

  // No manual controls: the AI agent is the sole driver. All movement
  // flows through attemptMove via executePlan, so every step is a
  // validated plan action and keys are always free for typing.
  function stopExecution(message = "Execution stopped.") {
    execCancelRef.current = true;
    execPausedRef.current = false;
    setExecution((prev) => ({ ...prev, running: false, paused: false, message }));
  }

  function pauseExecution() {
    if (!execRunningRef.current || execPausedRef.current) return;
    execPausedRef.current = true;
    setExecution((prev) => ({
      ...prev,
      paused: true,
      message: "Paused — resume to continue, or stop to cancel.",
    }));
  }

  function resumeExecution() {
    if (!execRunningRef.current || !execPausedRef.current) return;
    execPausedRef.current = false;
    setExecution((prev) => ({ ...prev, paused: false }));
  }

  async function executePlan(actions: PlanAction[]) {
    // Auto-start can race a winding-down run (submit cancels, then the
    // fresh plan arrives): cancel it and wait briefly rather than drop
    // the new plan or overlap two steppers.
    if (execRunningRef.current) {
      execCancelRef.current = true;
      execPausedRef.current = false;
      for (let i = 0; i < 50 && execRunningRef.current; i++) {
        await sleep(PAUSE_POLL_MS);
      }
      if (execRunningRef.current) {
        setExecution({
          running: false,
          paused: false,
          currentIndex: 0,
          total: actions.length,
          message: "An execution is still stopping — try again in a moment.",
        });
        return;
      }
    }

    if (tutorialMode) setCoach(null);

    if (statusRef.current !== "playing") {
      setExecution({
        running: false,
        paused: false,
        currentIndex: 0,
        total: actions.length,
        message: "Start execution only while the mission is active.",
      });
      return;
    }

    if (actions.length === 0) {
      setExecution({
        running: false,
        paused: false,
        currentIndex: 0,
        total: 0,
        message: "Nothing to execute.",
      });
      return;
    }

    const estimate = estimatePlanCost(
      actions.map((action) => action.direction),
      { x: robotRef.current.x, z: robotRef.current.z },
      maze,
      doorOpenRef.current,
      costs
    );

    if (!canAfford(batteryRef.current, estimate.cost)) {
      setExecution({
        running: false,
        paused: false,
        currentIndex: 0,
        total: actions.length,
        message: `Plan needs approx. ${estimate.cost}% battery but only ${batteryRef.current}% remains. Restart to recharge.`,
      });
      return;
    }

    execRunningRef.current = true;
    execCancelRef.current = false;
    execPausedRef.current = false;
    const execBegun = performance.now();

    let expected = {
      x: robotRef.current.x,
      z: robotRef.current.z,
    };

    const finish = (state: ExecutionState) => {
      setExecution(state);
    };

    // Tutorial narration for real step events; silent in Story mode.
    const say = (text: string) => {
      if (tutorialMode) setCoach(text);
    };

    try {
      for (let index = 0; index < actions.length; index++) {
        // Pause holds the stepper at step boundaries; cancel still wins.
        while (execPausedRef.current && !execCancelRef.current) {
          await sleep(PAUSE_POLL_MS);
        }
        if (execCancelRef.current) return;

        const verdict = verifyStepPrereqs({
          status: statusRef.current,
          expected,
          actual: robotRef.current,
        });

        if (!verdict.ok) {
          finish({
            running: false,
            paused: false,
            currentIndex: index,
            total: actions.length,
            message: verdict.reason,
          });
          return;
        }

        finish({
          running: true,
          paused: false,
          currentIndex: index,
          total: actions.length,
          message: describeProgress(index, actions.length),
        });

        await sleep(EXEC_STEP_DELAY_MS);

        if (execCancelRef.current) return;

        // Re-verify after the delay: enemies move on their own timer.
        const recheck = verifyStepPrereqs({
          status: statusRef.current,
          expected,
          actual: robotRef.current,
        });

        if (!recheck.ok) {
          finish({
            running: false,
            paused: false,
            currentIndex: index,
            total: actions.length,
            message: recheck.reason,
          });
          return;
        }

        const dest = stepDestination(expected.x, expected.z, actions[index].direction);
        const stepCost = moveCost(costs, dest.x, dest.z);

        if (!canAfford(batteryRef.current, stepCost)) {
          say(coachForDepleted());
          finish({
            running: false,
            paused: false,
            currentIndex: index,
            total: actions.length,
            message: `Battery depleted at step ${index + 1} — ${batteryRef.current}% left, step needs ${stepCost}%. Restart to recharge.`,
          });
          return;
        }

        const result = attemptMove(actions[index].direction);
        if (result.moved) runMovesRef.current += 1;

        if (result.status !== "playing") {
          say(coachForOutcome(result.status));
          finish({
            running: false,
            paused: false,
            currentIndex: index + 1,
            total: actions.length,
            message:
              result.status === "won"
                ? `Level completed in ${index + 1} step(s)!`
                : `Robot destroyed on step ${index + 1}.`,
          });
          return;
        }

        if (!result.moved) {
          say(coachForBlocked());
          finish({
            running: false,
            paused: false,
            currentIndex: index,
            total: actions.length,
            message:
              `Step ${index + 1} was blocked — the maze changed ` +
              `since planning. Request a new plan.`,
          });
          return;
        }

        const remaining = deductBattery(batteryRef.current, stepCost);
        batteryRef.current = remaining;
        setBattery(remaining);
        const landed = maze.tiles.find(
          (tile) => tile.x === robotRef.current.x && tile.z === robotRef.current.z
        );
        say(
          coachForMove(
            actions[index].direction,
            stepCost,
            remaining,
            landed?.type ?? "floor"
          )
        );
        const toastText = toastForMove(stepCost, remaining);
        if (toastText) {
          if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
          toastIdRef.current += 1;
          setToast({ id: toastIdRef.current, text: toastText });
          toastTimerRef.current = setTimeout(() => setToast(null), 1400);
        }

        expected = {
          x: robotRef.current.x,
          z: robotRef.current.z,
        };
      }

      finish({
        running: false,
        paused: false,
        currentIndex: actions.length,
        total: actions.length,
        message: `Plan complete (${actions.length}/${actions.length} steps).`,
      });
    } finally {
      execRunningRef.current = false;
      runExecMsRef.current += performance.now() - execBegun;
    }
  }

  function restart() {
    execCancelRef.current = true;
    execPausedRef.current = false;

    const initialRobot: RobotState = {
      ...maze.start,
      direction: "south",
    };

    const initialEnemies = createEnemies(routes, maze);

    batteryRef.current = BATTERY_MAX;
    robotRef.current = initialRobot;
    enemiesRef.current = initialEnemies;
    statusRef.current = "playing";
    doorOpenRef.current = false;
    // A restart begins a new run: re-arm completion recording and clear
    // run tracking plus any previous results panel.
    completionSavedRef.current = false;
    runMovesRef.current = 0;
    runExecMsRef.current = 0;
    runPlanMsRef.current = 0;
    runPlanCountRef.current = 0;

    setRobotState(initialRobot);
    setEnemyPositions(initialEnemies);
    setStatus("playing");
    setBattery(BATTERY_MAX);
    setDoorOpen(false);
    setExecution(IDLE_EXECUTION);
    setCoach(null);
    setReplay(null);
    setStoryResult(null);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToast(null);
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-[#3B414B] bg-[#191C22] shadow-inner">
    <div className="w-full border-b border-[#3B414B] bg-[#191C22] p-4 text-[#F3F0E8]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#F2A93B]">
          Mission Status
        </p>

        <h2 className="mt-2 font-bold">{level.name}</h2>

        <p className="mt-2 text-sm text-[#ADB2BD]">
          Position: ({robotState.x}, {robotState.z})
        </p>

        <div className="mt-2 flex items-center gap-2" role="img" aria-label={`Battery ${battery} percent`}>
          <svg width="26" height="14" viewBox="0 0 26 14" aria-hidden="true" className="shrink-0">
            <rect x="0.5" y="0.5" width="21" height="13" rx="2.5" fill="none" stroke="#ADB2BD" strokeWidth="1.5" />
            <rect x="2.5" y="2.5" width={Math.max((battery / BATTERY_MAX) * 17, 0)} height="9" rx="1" fill={battery <= 20 ? "#FF7979" : battery <= 50 ? "#F2A93B" : "#65D982"} />
            <rect x="23" y="4.5" width="2.5" height="5" rx="1" fill="#ADB2BD" />
          </svg>
          <div className="h-2.5 w-28 overflow-hidden rounded-full bg-[#292E36]">
            <div className="h-full rounded-full transition-all" style={{ width: `${battery}%`, backgroundColor: battery <= 20 ? "#FF7979" : battery <= 50 ? "#F2A93B" : "#65D982" }} />
          </div>
          <span className="font-mono text-sm font-bold text-[#F3F0E8]">{battery}%</span>
        </div>
        {battery <= 20 && (
          <p className="mt-1 text-xs font-semibold text-[#FF7979]">Low battery — restart to recharge.</p>
        )}

        <p className="mt-2 text-xs text-[#9299A6]">
          Control: AI agent only
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#9299A6]" aria-label="Terrain battery costs">
          <span className="font-semibold uppercase tracking-wider">Terrain:</span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm border border-[#515A61]" style={{ backgroundColor: "#343A40" }} />
            Floor 1%
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: "#B45309" }} />
            Rough 3%
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: "#7C3AED" }} />
            Drain 5%
          </span>
        </div>

        {won && !tutorialMode && storyResult && (
          <StoryResults levelName={level.name} result={storyResult} />
        )}

        {dead && (
          <p className="mt-3 font-bold text-[#FF7979]">
            ROBOT DESTROYED — MISSION FAILED
          </p>
        )}

        <MissionPanel
          levelId={level.id}
          getSnapshot={() => ({
            robot: {
              x: robotState.x,
              z: robotState.z,
              direction: robotState.direction,
            },
            enemies: enemyPositions.map((enemy) => ({
              x: enemy.x,
              z: enemy.z,
            })),
            doorOpen,
            battery: batteryRef.current,
          })}
          execution={execution}
          canExecute={status === "playing"}
          onExecute={executePlan}
          onStop={() => stopExecution()}
          onPause={pauseExecution}
          onResume={resumeExecution}
          onPlanTiming={(ms) => {
            runPlanMsRef.current += ms;
            runPlanCountRef.current += 1;
          }}
        />
        {tutorialMode && (
          <div className="mt-3">
            <TutorialLesson levelId={level.id} />
          </div>
        )}

        {won && replayOptions && (
          <ReplayPanel
            routes={replayOptions}
            active={replay?.strategy ?? null}
            finished={replayFinished}
            exploring={replayExploring}
            onSelect={startReplay}
            onClose={stopReplay}
          />
        )}
    </div>
    <div className="relative h-[520px] w-full">
      <div className="pointer-events-none absolute right-4 top-4 z-10">
        <Compass direction={robotState.direction} />
      </div>
      {tutorialMode && coach && (
        <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-[62%]">
          <p
            role="status"
            className="rounded-lg border border-cyan-400/40 bg-slate-950/90 px-3 py-2 text-xs leading-5 text-cyan-100"
          >
            {coach}
          </p>
        </div>
      )}
      {toast && (
        <div key={toast.id} className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center">
          <div className="rounded-lg border border-[#F2A93B]/50 bg-slate-950/90 px-4 py-2 text-sm font-semibold text-[#F2A93B]">
            {toast.text}
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 top-6 z-50 flex justify-center">
    <div
      className={`rounded-lg border border-cyan-400/50 bg-slate-950/90 px-6 py-3 text-center shadow-[0_0_24px_rgba(34,211,238,0.2)] backdrop-blur-sm transition-all duration-500 ${
        showDoorUnlocked
          ? "translate-y-0 opacity-100"
          : "-translate-y-3 opacity-0"
      }`}
      aria-live="polite"
      aria-atomic="true"
    >
      <p className="font-bold tracking-[0.2em] text-emerald-300">
        🔓 DOOR UNLOCKED
      </p>
      <p className="mt-1 text-sm text-slate-300">
        Security lock disengaged. Exit access granted.
      </p>
    </div>
  </div>
      <Canvas
        shadows
        orthographic
        onCreated={({ camera }) => {
          camera.up.set(...TOP_DOWN_UP);
          camera.position.set(0, 20, 0);
          camera.lookAt(0, 0, 0);
        }}
        camera={{
          position: [0, 20, 0],
          zoom: 55,
          near: 0.1,
          far: 100,
        }}
      >
        <FitMazeToView width={maze.width} depth={maze.depth} />

        <ambientLight intensity={1.2} />

        <directionalLight
          position={[8, 12, 6]}
          intensity={2}
          castShadow
        />

        <group
          position={[
            -maze.width / 2 + 0.5,
            0,
            -maze.depth / 2 + 0.5,
          ]}
        >
          <MazeTiles
            maze={maze}
            enemyPositions={displayedEnemies}
            doorOpen={doorOpen}
            previewRoute={replayTrail}
            replayHead={replayHeadCell}
            replayExplored={replayExploredSet}
          />
          <Robot state={robotState} />
        </group>

      </Canvas>
    </div>

    <div className="w-full border-t border-[#3B414B] bg-[#191C22] p-4 text-[#F3F0E8]">
      {won && (
        <p className="font-bold text-[#65D982]">
          Level completed!
        </p>
      )}

      {won && nextLevelId !== null && (
        <button
          onClick={() => router.push(`/game/level/${nextLevelId}`)}
          className="mt-3 w-full rounded-md bg-[#F2A93B] px-3 py-2 text-sm font-semibold text-[#17191D] transition hover:bg-[#FFC15B] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F2A93B]"
        >
          Next Level →
        </button>
      )}

      <button
        onClick={restart}
        title="Reset the robot to its starting position and recharge the battery to try again"
        className="mt-3 w-full rounded-md border border-[#3B414B] bg-[#292E36] px-3 py-2 text-sm font-semibold text-[#F3F0E8] transition hover:border-[#F2A93B] hover:bg-[#343A44]"
      >
        ↺ Restart position
      </button>
    </div>
    </div>
  );
}
