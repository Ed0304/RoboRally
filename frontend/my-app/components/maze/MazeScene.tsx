
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

import {
  moveRobot,
  checkGameStatus,
  type RobotState,
  type GameStatus,
} from "@/lib/gamelogic";
import {
  planRoute,
  previewOptionsFor,
  type SearchStrategy,
} from "@/lib/pathfinding";
import {
  BATTERY_MAX,
  DEFAULT_COSTS,
  canAfford,
  deductBattery,
  estimatePlanCost,
  moveCost,
  stepDestination,
} from "@/lib/battery";
import type { PlanAction } from "@/lib/agent";
import {
  EXEC_STEP_DELAY_MS,
  IDLE_EXECUTION,
  describeProgress,
  verifyStepPrereqs,
  type ExecutionState,
} from "@/lib/execution";
import {
  completeLevel,
  getNextLevelId,
  pushCompletion,
} from "@/lib/progress";

interface MazeSceneProps {
  level: LevelData;
  /** Tutorial-only route preview; never moves the robot. */
  showPreview?: boolean;
}



function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function MazeScene({ level, showPreview = false }: MazeSceneProps) {
  return <LoadedMazeScene key={level.id} level={level} showPreview={showPreview} />;
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
  showPreview = false,
}: {
  level: LevelData;
  showPreview?: boolean;
}) {

  const maze = useMemo(() => buildMaze(level), [level]);

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
  const [preview, setPreview] = useState<{ cells: Set<string>; steps: number; cost: number; strategy: SearchStrategy } | null>(null);
  const [algorithm, setAlgorithm] = useState<SearchStrategy>("bfs");
  const [battery, setBattery] = useState(BATTERY_MAX);
  const batteryRef = useRef(BATTERY_MAX);
  const [previewMessage, setPreviewMessage] = useState<string | null>(null);

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
  const completionSavedRef = useRef(false);
  const router = useRouter();

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
    }
  }, [status, level.id, userId]);

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

  // Single shared movement path for keyboard input and plan execution.
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
    setExecution((prev) => ({ ...prev, running: false, message }));
  }

  async function executePlan(actions: PlanAction[]) {
    if (execRunningRef.current) return;
    clearRoutePreview();

    if (statusRef.current !== "playing") {
      setExecution({
        running: false,
        currentIndex: 0,
        total: actions.length,
        message: "Start execution only while the mission is active.",
      });
      return;
    }

    if (actions.length === 0) {
      setExecution({
        running: false,
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
      DEFAULT_COSTS
    );

    if (!canAfford(batteryRef.current, estimate.cost)) {
      setExecution({
        running: false,
        currentIndex: 0,
        total: actions.length,
        message: `Plan needs approx. ${estimate.cost}% battery but only ${batteryRef.current}% remains. Restart to recharge.`,
      });
      return;
    }

    execRunningRef.current = true;
    execCancelRef.current = false;

    let expected = {
      x: robotRef.current.x,
      z: robotRef.current.z,
    };

    const finish = (state: ExecutionState) => {
      setExecution(state);
    };

    try {
      for (let index = 0; index < actions.length; index++) {
        if (execCancelRef.current) return;

        const verdict = verifyStepPrereqs({
          status: statusRef.current,
          expected,
          actual: robotRef.current,
        });

        if (!verdict.ok) {
          finish({
            running: false,
            currentIndex: index,
            total: actions.length,
            message: verdict.reason,
          });
          return;
        }

        finish({
          running: true,
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
            currentIndex: index,
            total: actions.length,
            message: recheck.reason,
          });
          return;
        }

        const dest = stepDestination(expected.x, expected.z, actions[index].direction);
        const stepCost = moveCost(DEFAULT_COSTS, dest.x, dest.z);

        if (!canAfford(batteryRef.current, stepCost)) {
          finish({
            running: false,
            currentIndex: index,
            total: actions.length,
            message: `Battery depleted at step ${index + 1} — ${batteryRef.current}% left, step needs ${stepCost}%. Restart to recharge.`,
          });
          return;
        }

        const result = attemptMove(actions[index].direction);

        if (result.status !== "playing") {
          finish({
            running: false,
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
          finish({
            running: false,
            currentIndex: index,
            total: actions.length,
            message:
              `Step ${index + 1} was blocked — the maze changed ` +
              `since planning. Request a new plan.`,
          });
          return;
        }

        batteryRef.current = deductBattery(batteryRef.current, stepCost);
        setBattery(batteryRef.current);

        expected = {
          x: robotRef.current.x,
          z: robotRef.current.z,
        };
      }

      finish({
        running: false,
        currentIndex: actions.length,
        total: actions.length,
        message: `Plan complete (${actions.length}/${actions.length} steps).`,
      });
    } finally {
      execRunningRef.current = false;
    }
  }

  function showRoutePreview() {
    const result = planRoute(
      maze,
      { x: robotRef.current.x, z: robotRef.current.z },
      maze.exit,
      { ...previewOptionsFor(maze), strategy: algorithm, costs: DEFAULT_COSTS }
    );

    if (!result.reached) {
      setPreview(null);
      setPreviewMessage(result.reason);
      return;
    }

    setPreview({
      cells: new Set(result.path.map((cell) => `${cell.x},${cell.z}`)),
      steps: result.moves,
      cost: result.cost,
      strategy: algorithm,
    });
    setPreviewMessage(null);
  }

  function clearRoutePreview() {
    setPreview(null);
    setPreviewMessage(null);
  }

  function restart() {
    execCancelRef.current = true;
    clearRoutePreview();

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

    setRobotState(initialRobot);
    setEnemyPositions(initialEnemies);
    setStatus("playing");
    setBattery(BATTERY_MAX);
    setDoorOpen(false);
    setExecution(IDLE_EXECUTION);
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

        <p className={`mt-2 text-sm ${battery <= 20 ? "text-[#FF7979]" : "text-[#ADB2BD]"}`}>
          Battery: {battery}%
        </p>

        <p className="mt-2 text-xs text-[#9299A6]">
          Control: AI agent only
        </p>

        {won && (
          <p className="mt-3 font-bold text-[#65D982]">
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

        {dead && (
          <p className="mt-3 font-bold text-[#FF7979]">
            ROBOT DESTROYED — MISSION FAILED
          </p>
        )}

        <button
          onClick={restart}
          className="mt-3 rounded-md border border-[#3B414B] bg-[#292E36] px-3 py-2 text-sm font-medium text-[#F3F0E8] transition hover:border-[#F2A93B] hover:bg-[#343A44]"
        >
          Restart
        </button>

        {showPreview && status === "playing" && (
          <label className="mt-3 block text-xs text-[#ADB2BD]">
            Planning algorithm
            <select
              value={algorithm}
              onChange={(event) => {
                setAlgorithm(event.target.value as SearchStrategy);
                clearRoutePreview();
              }}
              className="mt-1 w-full rounded-md border border-[#3B414B] bg-[#292E36] px-2 py-2 text-sm text-[#F3F0E8]"
            >
              <option value="bfs">BFS — fewest moves</option>
              <option value="dijkstra">Dijkstra — lowest battery cost</option>
              <option value="astar">A* — lowest battery cost (guided)</option>
            </select>
          </label>
        )}

        {showPreview && status === "playing" && !preview && (
          <button
            onClick={showRoutePreview}
            className="mt-3 w-full rounded-md border border-cyan-400/50 bg-cyan-400/10 px-3 py-2 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-400/20"
          >
            Preview Route
          </button>
        )}

        {showPreview && status === "playing" && preview && (
          <button
            onClick={clearRoutePreview}
            className="mt-3 w-full rounded-md border border-[#3B414B] bg-[#292E36] px-3 py-2 text-sm font-medium text-[#F3F0E8] transition hover:border-cyan-400/50"
          >
            Clear Preview
          </button>
        )}

        {showPreview && preview && (
          <p className="mt-2 text-xs text-cyan-200/90">
            {preview.strategy === "bfs" ? "BFS" : preview.strategy === "dijkstra" ? "Dijkstra" : "A*"} preview: {preview.steps} {preview.steps === 1 ? "step" : "steps"} · approx. {preview.cost}% battery from here. Preview only — the robot does not move until you execute a plan.
          </p>
        )}

        {showPreview && previewMessage && (
          <p className="mt-2 text-xs text-[#FFB020]">{previewMessage}</p>
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
          })}
          execution={execution}
          canExecute={status === "playing"}
          onExecute={executePlan}
          onStop={() => stopExecution()}
        />
    </div>
    <div className="relative h-[520px] w-full">
      <div className="pointer-events-none absolute right-4 top-4 z-10">
        <Compass direction={robotState.direction} />
      </div>
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
            previewRoute={preview?.cells}
          />
          <Robot state={robotState} />
        </group>

      </Canvas>
    </div>




    </div>
  );
}
