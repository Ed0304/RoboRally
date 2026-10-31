
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

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
import type { PlanAction } from "@/lib/agent";
import {
  EXEC_STEP_DELAY_MS,
  IDLE_EXECUTION,
  describeProgress,
  verifyStepPrereqs,
  type ExecutionState,
} from "@/lib/execution";

interface MazeSceneProps {
  level: LevelData;
}



function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function MazeScene({ level }: MazeSceneProps) {
  return <LoadedMazeScene key={level.id} level={level} />;
}

function LoadedMazeScene({ level }: { level: LevelData }) {

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

  // Refs let the patrol timer and plan executor access latest state.
  const robotRef = useRef(robotState);
  const enemiesRef = useRef(enemyPositions);
  const statusRef = useRef(status);
  const doorOpenRef = useRef(doorOpen);

  const won = status === "won";
  const dead = status === "dead";

  const [showDoorUnlocked, setShowDoorUnlocked] = useState(false);
  const [execution, setExecution] =
    useState<ExecutionState>(IDLE_EXECUTION);
  const execCancelRef = useRef(false);
  const execRunningRef = useRef(false);

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

  // Robot controls and collision/detection checks.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();

      const directions: Record<string, RobotState["direction"]> = {
        w: "north",
        arrowup: "north",
        s: "south",
        arrowdown: "south",
        a: "west",
        arrowleft: "west",
        d: "east",
        arrowright: "east",
      };

      const direction = directions[key];

      if (!direction || statusRef.current !== "playing") return;

      event.preventDefault();
      attemptMove(direction);
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [attemptMove]);

  function stopExecution(message = "Execution stopped.") {
    execCancelRef.current = true;
    setExecution((prev) => ({ ...prev, running: false, message }));
  }

  async function executePlan(actions: PlanAction[]) {
    if (execRunningRef.current) return;

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

  function restart() {
    execCancelRef.current = true;

    const initialRobot: RobotState = {
      ...maze.start,
      direction: "south",
    };

    const initialEnemies = createEnemies(routes, maze);

    robotRef.current = initialRobot;
    enemiesRef.current = initialEnemies;
    statusRef.current = "playing";
    doorOpenRef.current = false;

    setRobotState(initialRobot);
    setEnemyPositions(initialEnemies);
    setStatus("playing");
    setDoorOpen(false);
    setExecution(IDLE_EXECUTION);
  }

  return (
    <div className="relative flex h-[650px] flex-col items-center overflow-hidden rounded-lg border border-[#3B414B] bg-[#191C22] shadow-inner">
    <Compass direction={robotState.direction} />
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
        camera={{
          position: [10, 12, 10],
          zoom: 55,
          near: 0.1,
          far: 100,
        }}
      >
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
          />
          <Robot state={robotState} />
        </group>

        <OrbitControls
          target={[0, 0, 0]}
          enablePan={false}
          minPolarAngle={0.2}
          maxPolarAngle={Math.PI / 2.1}
        />
      </Canvas>



      <div className="absolute left-4 top-4 max-w-[calc(100%-2rem)] rounded-lg border border-[#3B414B] bg-[#191C22]/95 p-4 text-[#F3F0E8] shadow-xl backdrop-blur-sm">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#F2A93B]">
          Mission Status
        </p>

        <h2 className="mt-2 font-bold">{level.name}</h2>

        <p className="mt-2 text-sm text-[#ADB2BD]">
          Position: ({robotState.x}, {robotState.z})
        </p>

        <p className="mt-2 text-xs text-[#9299A6]">
          Move: WASD or arrow keys
        </p>

        {won && (
          <p className="mt-3 font-bold text-[#65D982]">
            Level completed!
          </p>
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
    </div>
  );
}
