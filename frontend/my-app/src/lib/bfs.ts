
import type { MazeDefinition } from "./maze";

export interface GridCell {
  x: number;
  z: number;
}

export interface BfsStep {
  /** Cell being expanded in this step. */
  current: GridCell;
  /** Queue contents (discovered, not yet expanded) after expansion. */
  frontier: GridCell[];
  /** Distinct cells discovered so far. */
  visitedCount: number;
}

export interface BfsTrace {
  /** Discovery order, start first. */
  order: GridCell[];
  /** One entry per expansion, in FIFO order. */
  steps: BfsStep[];
  /** Shortest path from start to exit; empty when unreachable. */
  path: GridCell[];
  visitedCount: number;
  reachedExit: boolean;
}

export function cellKey(cell: GridCell): string {
  return `${cell.x},${cell.z}`;
}

/**
 * Breadth-first search with a full visualization trace. Mirrors the
 * semantics of validateMaze exactly (same blocked rule, same
 * North/East/South/West neighbor order) so the lesson reflects the
 * real validator: uniform-cost moves, walls and closed doors blocked.
 */
export function traceBfs(maze: MazeDefinition): BfsTrace {
  const tileMap = new Map(
    maze.tiles.map((tile) => [`${tile.x},${tile.z}`, tile])
  );

  const startKey = cellKey(maze.start);
  const exitKey = cellKey(maze.exit);
  const startTile = tileMap.get(startKey);
  const exitTile = tileMap.get(exitKey);

  const empty: BfsTrace = {
    order: [],
    steps: [],
    path: [],
    visitedCount: 0,
    reachedExit: false,
  };

  if (
    !startTile ||
    !exitTile ||
    startTile.blocksMovement ||
    exitTile.blocksMovement
  ) {
    return empty;
  }

  const directions = [
    { x: 0, z: -1 }, // North
    { x: 1, z: 0 }, // East
    { x: 0, z: 1 }, // South
    { x: -1, z: 0 }, // West
  ];

  const queue: GridCell[] = [{ ...maze.start }];
  let head = 0;
  const visited = new Set<string>([startKey]);
  const parent = new Map<string, string>();
  const order: GridCell[] = [{ ...maze.start }];
  const steps: BfsStep[] = [];

  while (head < queue.length) {
    const current = queue[head++];
    const currentKey = cellKey(current);

    if (currentKey === exitKey) {
      const path: GridCell[] = [];
      let key = exitKey;

      while (key !== startKey) {
        const [x, z] = key.split(",").map(Number);
        path.push({ x, z });

        const previous = parent.get(key);
        if (!previous) break;
        key = previous;
      }

      path.push({ ...maze.start });
      path.reverse();

      steps.push({
        current: { ...current },
        frontier: queue.slice(head).map((cell) => ({ ...cell })),
        visitedCount: visited.size,
      });

      return {
        order,
        steps,
        path,
        visitedCount: visited.size,
        reachedExit: true,
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
      order.push({ x, z });
    }

    steps.push({
      current: { ...current },
      frontier: queue.slice(head).map((cell) => ({ ...cell })),
      visitedCount: visited.size,
    });
  }

  return {
    order,
    steps,
    path: [],
    visitedCount: visited.size,
    reachedExit: false,
  };
}

/** Shortest-path length in moves; -1 when the exit is unreachable. */
export function shortestPathLength(trace: BfsTrace): number {
  if (!trace.reachedExit) return -1;
  return trace.path.length - 1;
}

export function gradePrediction(
  selectedMoves: number,
  answerMoves: number
): boolean {
  return selectedMoves === answerMoves;
}
