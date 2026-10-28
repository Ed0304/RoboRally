
"use client";

import { useCallback, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  MAZE_DEPTH,
  MAZE_WIDTH,
  maze,
} from "@/lib/maze";
import {
  initialRobotState,
  moveRobot,
  type RobotState,
} from "@/lib/gamelogic";
import Robot from "./Robot";
import { hasWon } from "@/lib/gamestatus";
import Compass from "./Compass";

function MazeTiles() {
  return (
    <>
      {maze.map((tile) => {
        const position: [number, number, number] = [
          tile.x,
          tile.type === "wall" ? 0.6 : 0,
          tile.z,
        ];

        if (tile.type === "wall") {
          return (
            <mesh
              key={`${tile.x}-${tile.z}`}
              position={position}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[0.94, 1.2, 0.94]} />
              <meshStandardMaterial
                color="#414A53"
                roughness={0.75}
              />
            </mesh>
          );
        }

        return (
          <mesh
            key={`${tile.x}-${tile.z}`}
            position={[tile.x, 0.015, tile.z]}
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow
          >
            <planeGeometry args={[0.94, 0.94]} />
            <meshStandardMaterial
              color={tile.type === "exit" ? "#FF8A24" : "#292F35"}
              emissive={tile.type === "exit" ? "#FF6500" : "#000000"}
              emissiveIntensity={tile.type === "exit" ? 1.5 : 0}
              roughness={0.8}
            />
          </mesh>
        );
      })}
    </>
  );
}

export default function MazeScene() {
  const [robotState, setRobotState] =
    useState<RobotState>(initialRobotState);
    const won = hasWon(robotState);

    const restartGame = () => {
        setRobotState(initialRobotState);
    };

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
  const directions: Record<string, RobotState["direction"]> = {
    ArrowUp: "north",
    w: "north",
    ArrowDown: "south",
    s: "south",
    ArrowRight: "east",
    d: "east",
    ArrowLeft: "west",
    a: "west",
  };

  const direction = directions[event.key];
  if (!direction) return;

  event.preventDefault();

  setRobotState((current) => {
    if (hasWon(current)) return current;
    return moveRobot(current, direction);
  });
}, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  return (
    <div className="relative h-[600px] w-full overflow-hidden rounded-xl border border-[#414A53] bg-[#171A1D]">
      <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-lg border border-[#515A61] bg-[#171A1D]/90 px-4 py-3 text-sm text-[#F5F2E9]">
        <p className="font-semibold text-[#FF8A24]">
          ROBOT CONTROL
        </p>
        <p className="mt-1">WASD / Arrow keys</p>
        <p className="text-[#AAB3BA]">
          Position: ({robotState.x}, {robotState.z})
        </p>
      </div>
      <Compass direction={robotState.direction} />
      

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
        <color attach="background" args={["#171A1D"]} />

        <ambientLight intensity={1.2} />

        <directionalLight
          position={[5, 10, 5]}
          intensity={2}
          castShadow
        />

        {/* Center the maze and robot together exactly once. */}
        <group
          position={[
            -MAZE_WIDTH / 2 + 0.5,
            0,
            -MAZE_DEPTH / 2 + 0.5,
          ]}
        >
          <MazeTiles />
          <Robot state={robotState} />
        </group>

        <OrbitControls
          enablePan={false}
          minPolarAngle={0.3}
          maxPolarAngle={Math.PI / 2.1}
          minZoom={35}
          maxZoom={80}
        />
            </Canvas>

      {/* Victory overlay */}
      {won && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#171A1D]/80 p-4">
          <div className="w-full max-w-sm rounded-xl border border-[#FF8A24] bg-[#24292E] p-8 text-center shadow-2xl">
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-[#FF8A24]">
              Mission Complete
            </p>

            <h2 className="mt-3 text-3xl font-bold text-[#F5F2E9]">
              Factory Cleared!
            </h2>

            <p className="mt-3 text-[#C5CBD0]">
              You've successfully reached the exit.
            </p>

            <button
              onClick={restartGame}
              className="mt-6 w-full rounded-md bg-[#FF8A24] px-4 py-3 font-semibold text-[#171A1D] transition hover:bg-[#FFA64D]"
            >
              Play Again
            </button>
          </div>
        </div>
      )}

    </div>
    
  );
}
