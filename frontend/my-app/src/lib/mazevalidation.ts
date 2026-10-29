
import type { MazeDefinition } from "@/lib/maze";

export interface MazeValidationResult {
  solvable: boolean;
  visitedCount: number;
  path: { x: number; z: number }[];
}

export function validateMaze(
  maze: MazeDefinition
): MazeValidationResult {
  const start = maze.start;
  const exit = maze.exit;

  // Look up tiles by coordinate for efficient neighbor checks.
  const tileMap = new Map(
    maze.tiles.map((tile) => [`${tile.x},${tile.z}`, tile])
  );

  const startKey = `${start.x},${start.z}`;
  const exitKey = `${exit.x},${exit.z}`;

  const startTile = tileMap.get(startKey);
  const exitTile = tileMap.get(exitKey);

  if (
    !startTile ||
    !exitTile ||
    startTile.blocksMovement ||
    exitTile.blocksMovement
  ) {
    return {
      solvable: false,
      visitedCount: 0,
      path: [],
    };
  }

  // BFS queue: process each discovered tile in FIFO order.
  const queue: { x: number; z: number }[] = [start];
  let head = 0;

  const visited = new Set<string>([startKey]);
  const parent = new Map<string, string>();

  const directions = [
    { x: 0, z: -1 }, // North
    { x: 1, z: 0 },  // East
    { x: 0, z: 1 },  // South
    { x: -1, z: 0 }, // West
  ];

  while (head < queue.length) {
    const current = queue[head++];
    const currentKey = `${current.x},${current.z}`;

    if (currentKey === exitKey) {
      // Reconstruct the shortest path from exit back to start.
      const path: { x: number; z: number }[] = [];
      let key = exitKey;

      while (key !== startKey) {
        const [x, z] = key.split(",").map(Number);
        path.push({ x, z });

        const previous = parent.get(key);
        if (!previous) break;
        key = previous;
      }

      path.push(start);
      path.reverse();

      return {
        solvable: true,
        visitedCount: visited.size,
        path,
      };
    }

    for (const direction of directions) {
      const x = current.x + direction.x;
      const z = current.z + direction.z;
      const neighborKey = `${x},${z}`;

      if (visited.has(neighborKey)) continue;

      const neighbor = tileMap.get(neighborKey);

      if (!neighbor || neighbor.blocksMovement) continue;

      visited.add(neighborKey);
      parent.set(neighborKey, currentKey);
      queue.push({ x, z });
    }
  }

  return {
    solvable: false,
    visitedCount: visited.size,
    path: [],
  };
}
