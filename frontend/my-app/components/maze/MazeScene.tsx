
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

import {
  moveRobot,
  checkGameStatus,
  type RobotState,
  type GameStatus,
} from "@/lib/gamelogic";

interface MazeSceneProps {
  level: LevelData;
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

  // Refs let the patrol timer access the latest positions.
  const robotRef = useRef(robotState);
  const enemiesRef = useRef(enemyPositions);

  const won = status === "won";
  const dead = status === "dead";

  useEffect(() => {
    robotRef.current = robotState;
  }, [robotState]);

  useEffect(() => {
    enemiesRef.current = enemyPositions;
  }, [enemyPositions]);

  useEffect(() => {
    if (routeErrors.length > 0) {
      console.error(
        `[RoboRally] Invalid patrol routes for level ${level.id}:`,
        routeErrors
      );
    }
  }, [level.id, routeErrors]);

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
        setStatus(nextStatus);
      }
    }, 800);

    return () => window.clearInterval(timer);
  }, [status, routes, maze]);

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

      if (!direction || status !== "playing") return;

      event.preventDefault();

      const nextRobot = moveRobot(
        robotRef.current,
        direction,
        maze
      );

      robotRef.current = nextRobot;
      setRobotState(nextRobot);

      const nextStatus = checkGameStatus(
        nextRobot,
        maze,
        enemiesRef.current
      );

      if (nextStatus !== "playing") {
        setStatus(nextStatus);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [maze, status]);

  function restart() {
    const initialRobot: RobotState = {
      ...maze.start,
      direction: "south",
    };

    const initialEnemies = createEnemies(routes, maze);

    robotRef.current = initialRobot;
    enemiesRef.current = initialEnemies;

    setRobotState(initialRobot);
    setEnemyPositions(initialEnemies);
    setStatus("playing");
  }

  return (
    <div className="relative h-[650px] overflow-hidden rounded-lg border border-[#3B414B] bg-[#191C22] shadow-inner">
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

      <Compass direction={robotState.direction} />

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

        <p className="mt-1 text-xs text-[#9299A6]">
          Patrol units: {enemyPositions.length}
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
      </div>
    </div>
  );
}
