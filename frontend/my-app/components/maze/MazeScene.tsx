
"use client";

import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

import type { LevelData } from "@/lib/levels";
import { buildMaze } from "@/lib/maze";
import { moveRobot, type RobotState } from "@/lib/gamelogic";

import MazeTiles from "./MazeTiles";
import Robot from "./Robot";
import Compass from "./Compass";

interface MazeSceneProps {
  level: LevelData;
}

export default function MazeScene({ level }: MazeSceneProps) {
  return <LoadedMazeScene key={level.id} level={level} />;
}

function LoadedMazeScene({ level }: { level: LevelData }) {
  const maze = useMemo(() => buildMaze(level), [level]);

  const [robotState, setRobotState] = useState<RobotState>(() => ({
    ...maze.start,
    direction: "south",
  }));

  const won =
    robotState.x === maze.exit.x &&
    robotState.z === maze.exit.z;

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

      if (!direction || won) return;

      event.preventDefault();

      setRobotState((current) =>
        moveRobot(current, direction, maze)
      );
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [maze, won]);

  function restart() {
    setRobotState({
      ...maze.start,
      direction: "south",
    });
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
          <MazeTiles maze={maze} />
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

        {won && (
          <p className="mt-3 font-bold text-[#65D982]">
            Level completed!
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
