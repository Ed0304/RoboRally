
"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import type { RobotState } from "@/lib/gamelogic";

interface RobotProps {
  state: RobotState;
}

const directionRotation: Record<RobotState["direction"], number> = {
  north: 0,
  south: Math.PI,
  east: -Math.PI / 2,
  west: Math.PI / 2,
};

export default function Robot({ state }: RobotProps) {
  const robotRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (!robotRef.current) return;

    const robot = robotRef.current;

    robot.position.x = THREE.MathUtils.damp(
      robot.position.x,
      state.x,
      10,
      delta
    );

    robot.position.z = THREE.MathUtils.damp(
      robot.position.z,
      state.z,
      10,
      delta
    );

    robot.rotation.y = THREE.MathUtils.damp(
      robot.rotation.y,
      directionRotation[state.direction],
      10,
      delta
    );
  });

  return (
    <group ref={robotRef} position={[state.x, 0, state.z]}>
      {/* Main armored body */}
      <mesh position={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[0.58, 0.5, 0.58]} />
        <meshStandardMaterial
          color="#AAB3BA"
          metalness={0.65}
          roughness={0.35}
        />
      </mesh>

      {/* Dark rear panel: helps distinguish the back */}
      <mesh position={[0, 0.32, 0.23]}>
        <boxGeometry args={[0.38, 0.3, 0.06]} />
        <meshStandardMaterial color="#24292E" />
      </mesh>

      {/* Head / upper casing */}
      <mesh position={[0, 0.65, 0]} castShadow>
        <boxGeometry args={[0.4, 0.22, 0.4]} />
        <meshStandardMaterial
          color="#414A53"
          metalness={0.5}
          roughness={0.3}
        />
      </mesh>

      {/* Bright orange front panel, facing local -Z */}
      <mesh position={[0, 0.67, -0.21]}>
        <boxGeometry args={[0.24, 0.1, 0.035]} />
        <meshStandardMaterial
          color="#FF8A24"
          emissive="#FF6500"
          emissiveIntensity={2}
        />
      </mesh>

      {/* Two front sensors */}
      {[-0.11, 0.11].map((x) => (
        <mesh key={x} position={[x, 0.77, -0.19]}>
          <sphereGeometry args={[0.035, 12, 12]} />
          <meshStandardMaterial
            color="#62E6FF"
            emissive="#00BFFF"
            emissiveIntensity={2}
          />
        </mesh>
      ))}

      {/* Antenna */}
      <mesh position={[0, 0.84, 0.02]}>
        <cylinderGeometry args={[0.025, 0.025, 0.12, 8]} />
        <meshStandardMaterial color="#FF8A24" />
      </mesh>
    </group>
  );
}
