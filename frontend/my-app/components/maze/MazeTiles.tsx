
"use client";

import type { MazeDefinition, MazeTile } from "@/lib/maze";

interface MazeTilesProps {
  maze: MazeDefinition;
}

function LaserTile({ tile }: { tile: MazeTile }) {
  return (
    <group position={[tile.x, 0, tile.z]}>
      {/* Dark emitter posts */}
      {[-0.39, 0.39].map((x) => (
        <group key={x} position={[x, 0.16, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.16, 0.32, 0.22]} />
            <meshStandardMaterial
              color="#101216"
              metalness={0.8}
              roughness={0.3}
            />
          </mesh>

          {/* Small emitter indicator */}
          <mesh position={[0, 0.04, 0.115]}>
            <boxGeometry args={[0.09, 0.045, 0.015]} />
            <meshStandardMaterial
              color="#EF4444"
              emissive="#FF001E"
              emissiveIntensity={2}
            />
          </mesh>
        </group>
      ))}

      {/* Laser beam */}
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[0.76, 0.09, 0.07]} />
        <meshStandardMaterial
          color="#B90025"
          emissive="#FF002F"
          emissiveIntensity={3}
          toneMapped={false}
        />
      </mesh>

      {/* Bright central beam core */}
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[0.74, 0.025, 0.085]} />
        <meshBasicMaterial
          color="#FF5369"
          toneMapped={false}
        />
      </mesh>

      {/* Subtle red light around the beam */}
      <pointLight
        position={[0, 0.35, 0]}
        color="#FF173D"
        intensity={0.7}
        distance={1.8}
      />
    </group>
  );
}

function DoorTile({ tile }: { tile: MazeTile }) {
  return (
    <group position={[tile.x, 0, tile.z]}>
      {/* Heavy industrial door panel */}
      <mesh position={[0, 0.47, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.82, 0.92, 0.16]} />
        <meshStandardMaterial
          color="#858B91"
          metalness={0.7}
          roughness={0.38}
        />
      </mesh>

      {/* Central door seam */}
      <mesh position={[0, 0.47, 0.084]}>
        <boxGeometry args={[0.025, 0.86, 0.012]} />
        <meshStandardMaterial color="#272B30" />
      </mesh>

      {/* Top and bottom reinforcement bars */}
      {[-0.38, 0.38].map((y) => (
        <mesh key={y} position={[0, 0.47 + y, 0.09]}>
          <boxGeometry args={[0.74, 0.045, 0.025]} />
          <meshStandardMaterial
            color="#454B52"
            metalness={0.8}
          />
        </mesh>
      ))}

      {/* Amber lock indicator */}
      <mesh position={[0.23, 0.53, 0.105]}>
        <boxGeometry args={[0.075, 0.075, 0.025]} />
        <meshStandardMaterial
          color="#F2A93B"
          emissive="#F2A93B"
          emissiveIntensity={1.5}
        />
      </mesh>
    </group>
  );
}

function CollectibleTile({ tile }: { tile: MazeTile }) {
  return (
    <group position={[tile.x, 0, tile.z]}>
      {/* Outer cyan halo */}
      <mesh position={[0, 0.32, 0]}>
        <torusGeometry args={[0.25, 0.065, 16, 48]} />
        <meshBasicMaterial
          color="#06B6D4"
          transparent
          opacity={0.32}
          toneMapped={false}
        />
      </mesh>

      {/* Bright energy ring */}
      <mesh
        position={[0, 0.32, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <torusGeometry args={[0.2, 0.055, 16, 48]} />
        <meshStandardMaterial
          color="#22D3EE"
          emissive="#00CFFF"
          emissiveIntensity={2.5}
          metalness={0.35}
          roughness={0.18}
          toneMapped={false}
        />
      </mesh>

      {/* Floating energy core */}
      <mesh position={[0, 0.32, 0]} castShadow>
        <sphereGeometry args={[0.115, 24, 24]} />
        <meshStandardMaterial
          color="#E0FFFF"
          emissive="#22D3EE"
          emissiveIntensity={3}
          metalness={0.2}
          roughness={0.12}
          toneMapped={false}
        />
      </mesh>

      {/* Cyan glow */}
      <pointLight
        position={[0, 0.38, 0]}
        color="#06D9FF"
        intensity={1.2}
        distance={2}
      />
    </group>
  );
}

function EnemyTile({ tile }: { tile: MazeTile }) {
  return (
    <group position={[tile.x, 0, tile.z]}>
      {/* Dark robot chassis */}
      <mesh position={[0, 0.32, 0]} castShadow>
        <boxGeometry args={[0.66, 0.64, 0.66]} />
        <meshStandardMaterial
          color="#101216"
          metalness={0.85}
          roughness={0.28}
        />
      </mesh>

      {/* Red armor stripe */}
      <mesh position={[0, 0.52, 0.337]}>
        <boxGeometry args={[0.68, 0.16, 0.045]} />
        <meshStandardMaterial
          color="#A00020"
          emissive="#E00030"
          emissiveIntensity={1.3}
          metalness={0.45}
          roughness={0.3}
        />
      </mesh>

      {/* Glowing hostile sensor */}
      <mesh position={[0, 0.33, 0.345]}>
        <boxGeometry args={[0.2, 0.055, 0.025]} />
        <meshBasicMaterial
          color="#FF354D"
          toneMapped={false}
        />
      </mesh>

      <pointLight
        position={[0, 0.45, 0.5]}
        color="#FF173D"
        intensity={0.5}
        distance={1.2}
      />
    </group>
  );
}

function TriggerTile({ tile }: { tile: MazeTile }) {
  return (
    <group position={[tile.x, 0.025, tile.z]}>
      {/* Simple X-shaped floor marking */}
      {[Math.PI / 4, -Math.PI / 4].map((rotation) => (
        <mesh
          key={rotation}
          rotation={[-Math.PI / 2, 0, rotation]}
        >
          <boxGeometry args={[0.68, 0.075, 0.075]} />
          <meshStandardMaterial
            color="#F2A93B"
            emissive="#F2A93B"
            emissiveIntensity={0.7}
          />
        </mesh>
      ))}
    </group>
  );
}

function SpecialTile({ tile }: { tile: MazeTile }) {
  switch (tile.type) {
    case "laser":
      return <LaserTile tile={tile} />;

    case "door":
      return <DoorTile tile={tile} />;

    case "collectible":
      return <CollectibleTile tile={tile} />;

    case "enemy":
      return <EnemyTile tile={tile} />;

    case "trigger":
      return <TriggerTile tile={tile} />;

    default:
      return null;
  }
}

export default function MazeTiles({ maze }: MazeTilesProps) {
  return (
    <>
      {maze.tiles.map((tile) => (
        <group key={`${tile.x}-${tile.z}`}>
          {/* Floor tile */}
          <mesh
            position={[tile.x, -0.12, tile.z]}
            receiveShadow
          >
            <boxGeometry args={[0.98, 0.2, 0.98]} />
            <meshStandardMaterial
              color={tile.type === "exit" ? "#14532D" : "#343A40"}
              roughness={0.85}
            />
          </mesh>

          {/* Factory wall */}
          {tile.type === "wall" && (
            <mesh
              position={[tile.x, 0.4, tile.z]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial
                color="#68737D"
                metalness={0.45}
                roughness={0.55}
              />
            </mesh>
          )}

          {/* Exit marker */}
          {tile.type === "exit" && (
            <mesh position={[tile.x, 0.015, tile.z]}>
              <boxGeometry args={[0.65, 0.025, 0.65]} />
              <meshStandardMaterial
                color="#22C55E"
                emissive="#16A34A"
                emissiveIntensity={0.8}
              />
            </mesh>
          )}

          <SpecialTile tile={tile} />
        </group>
      ))}
    </>
  );
}
