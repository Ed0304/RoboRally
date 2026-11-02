
import type { MazeDefinition } from "./maze";
import {
  DEFAULT_COSTS,
  MIN_MOVE_COST,
  moveCost,
  routeCost,
  type CostModel,
} from "./battery";

export interface RouteCell {
  x: number;
  z: number;
}

/** BFS minimizes moves; Dijkstra and A* minimize battery cost. */
export type SearchStrategy = "bfs" | "dijkstra" | "astar";

export interface RouteOptions {
  /** Treat laser tiles as blocked (preview a safe route). */
  avoidLasers: boolean;
  /** Search over (x, z, doorOpen): stepping on a trigger opens doors. */
  dynamicDoors: boolean;
  /** Planning algorithm. Defaults to "bfs". */
  strategy?: SearchStrategy;
  /** Movement costs. Defaults to uniform 1 per tile. */
  costs?: CostModel;
  /** Door state at the search start. Defaults to false. */
  initialDoorOpen?: boolean;
  /**
   * Record one SearchTraceEvent per expansion, aligned 1:1 with `order`,
   * for beginner-friendly "thinking" narration. Off by default so hot
   * paths (cost fields, benchmarks) stay allocation-free.
   */
  trace?: boolean;
}

/**
 * One expansion narrated for beginners: the popped node, the values the
 * pop rule actually used, and what happened to each neighbor. Recorded
 * only when RouteOptions.trace is true; events line up with `order`.
 */
export interface SearchTraceEvent {
  /** The state just removed from the frontier for processing. */
  node: RouteCell;
  /** BFS: moves from the start. Dijkstra/A*: battery cost so far. */
  g: number;
  /** A*: Manhattan estimate of the remaining distance. Else 0. */
  h: number;
  /** Priority actually used to pop: g for BFS/Dijkstra, g + h for A*. */
  f: number;
  /** Frontier entries still waiting after this expansion's pushes. */
  frontierSize: number;
  /** Neighbors discovered for the first time by this expansion. */
  added: RouteCell[];
  /** Neighbors re-prioritized with a better cost (weighted only). */
  updated: RouteCell[];
  /** Neighbors skipped: wall, void, or avoided laser. */
  skippedBlocked: number;
  /** Neighbors skipped: already settled or no better than known. */
  skippedSeen: number;
  /** True when the popped node is the goal. */
  goal: boolean;
}

export interface RouteResult {
  reached: boolean;
  /** Start-to-exit cells; empty when unreachable. */
  path: RouteCell[];
  /** Human-readable outcome; empty on success. */
  reason: string;
  /** Number of moves (path cells minus one); 0 when unreachable. */
  moves: number;
  /** Battery cost of the path under the active cost model. */
  cost: number;
  /**
   * Expansion order: every search state removed from the frontier for
   * processing, in pop order, including the goal pop and (on failure)
   * everything expanded before giving up. With dynamicDoors a state is
   * (x, z, doorOpen), so one cell may appear twice.
   */
  order: RouteCell[];
  /** Number of expanded states; always order.length. */
  expanded: number;
  /**
   * Per-expansion narration events, aligned 1:1 with `order`. Present
   * only when RouteOptions.trace is true; otherwise undefined.
   */
  trace?: SearchTraceEvent[];
}

export const DEFAULT_ROUTE_OPTIONS: RouteOptions = {
  avoidLasers: false,
  dynamicDoors: false,
};

/**
 * Shared empty neighbor list for untraced runs, so the hot path allocates
 * nothing extra. Never mutated: trace pushes are always wantTrace-guarded.
 */
const NO_TRACE_CELLS: RouteCell[] = [];

/**
 * Deterministic route planner for previews. Mirrors the engine's movement
 * rules: four-directional uniform moves in North/East/South/West order, walls
 * always blocked, doors passable only when open, lasers lethal (optionally
 * avoided). With dynamicDoors, the search state is (x, z, doorOpen) and
 * trigger tiles flip doors open, exactly like MazeScene's trigger rule.
 *
 * A* uses Manhattan distance times MIN_MOVE_COST, which is admissible while
 * every entry cost is at least MIN_MOVE_COST (true for all game costs).
 *
 * Pure function: never touches game state, progression, or the robot.
 */
export function planRoute(
  maze: MazeDefinition,
  start: RouteCell,
  goal: RouteCell,
  options: RouteOptions = DEFAULT_ROUTE_OPTIONS
): RouteResult {
  const strategy = options.strategy ?? "bfs";
  const costs = options.costs ?? DEFAULT_COSTS;

  const tileMap = new Map(
    maze.tiles.map((tile) => [`${tile.x},${tile.z}`, tile])
  );

  const goalKey = `${goal.x},${goal.z}`;
  const order: RouteCell[] = [];
  const wantTrace = options.trace === true;
  const events: SearchTraceEvent[] = [];
  const failure = (reason: string): RouteResult => ({
    reached: false,
    path: [],
    reason,
    moves: 0,
    cost: 0,
    order,
    expanded: order.length,
    trace: wantTrace ? events : undefined,
  });

  function blocked(x: number, z: number, doorOpen: boolean): boolean {
    const tile = tileMap.get(`${x},${z}`);

    if (!tile) return true;
    if (tile.type === "wall") return true;
    if (tile.type === "door") return !doorOpen;
    if (tile.type === "laser" && options.avoidLasers) return true;

    return false;
  }

  function isTrigger(x: number, z: number): boolean {
    return tileMap.get(`${x},${z}`)?.type === "trigger";
  }

  const startDoorOpen = options.initialDoorOpen ?? false;

  if (blocked(start.x, start.z, startDoorOpen)) {
    return failure("No route: the robot's tile is blocked.");
  }
  const stateKey = (x: number, z: number, doorOpen: boolean) =>
    options.dynamicDoors ? `${x},${z},${doorOpen}` : `${x},${z}`;

  const directions = [
    { x: 0, z: -1 }, // North
    { x: 1, z: 0 }, // East
    { x: 0, z: 1 }, // South
    { x: -1, z: 0 }, // West
  ];

  const heuristic = (x: number, z: number): number =>
    (Math.abs(x - goal.x) + Math.abs(z - goal.z)) * MIN_MOVE_COST;

  interface SearchNode extends RouteCell {
    doorOpen: boolean;
  }

  const startNode: SearchNode = {
    x: start.x,
    z: start.z,
    doorOpen: startDoorOpen,
  };
  const startKey = stateKey(start.x, start.z, startDoorOpen);

  const parent = new Map<string, string>();
  const nodeByKey = new Map<string, SearchNode>([[startKey, startNode]]);
  // Best known cost-to-reach per state (Dijkstra/A*).
  const best = new Map<string, number>([[startKey, 0]]);

  // Frontier holds state keys in insertion order; BFS pops FIFO while
  // Dijkstra/A* pop the minimum (g or g+h), first-minimum wins ties.
  const frontier: string[] = [startKey];
  const queued = new Set<string>([startKey]);

  const score = (key: string): number => {
    const g = best.get(key) ?? Infinity;
    if (strategy !== "astar") return g;
    const node = nodeByKey.get(key);
    return node ? g + heuristic(node.x, node.z) : g;
  };

  const popNext = (): string => {
    if (strategy === "bfs") return frontier.shift() as string;
    let bestIndex = 0;
    for (let i = 1; i < frontier.length; i++) {
      if (score(frontier[i]) < score(frontier[bestIndex])) bestIndex = i;
    }
    return frontier.splice(bestIndex, 1)[0];
  };

  while (frontier.length > 0) {
    const currentKey = popNext();
    const current = nodeByKey.get(currentKey);
    if (!current) continue;
    queued.delete(currentKey);
    order.push({ x: current.x, z: current.z });

    if (`${current.x},${current.z}` === goalKey) {
      const path: RouteCell[] = [];
      let key: string | undefined = currentKey;

      while (key !== undefined) {
        const node = nodeByKey.get(key);
        if (!node) break;
        path.push({ x: node.x, z: node.z });
        key = parent.get(key);
      }

      path.reverse();

      if (wantTrace) {
        const g = best.get(currentKey) ?? 0;
        const h =
          strategy === "astar" ? heuristic(current.x, current.z) : 0;
        events.push({
          node: { x: current.x, z: current.z },
          g,
          h,
          f: g + h,
          frontierSize: frontier.length,
          added: [],
          updated: [],
          skippedBlocked: 0,
          skippedSeen: 0,
          goal: true,
        });
      }

      return {
        reached: true,
        path,
        reason: "",
        moves: Math.max(path.length - 1, 0),
        cost: routeCost(path, costs),
        order,
        expanded: order.length,
        trace: wantTrace ? events : undefined,
      };
    }

    const currentCost = best.get(currentKey) ?? 0;
    const added: RouteCell[] = wantTrace ? [] : NO_TRACE_CELLS;
    const updated: RouteCell[] = wantTrace ? [] : NO_TRACE_CELLS;
    let skippedBlocked = 0;
    let skippedSeen = 0;

    for (const direction of directions) {
      const x = current.x + direction.x;
      const z = current.z + direction.z;
      const doorOpen =
        options.dynamicDoors &&
        (current.doorOpen || isTrigger(x, z));
      const key = stateKey(x, z, doorOpen);

      if (blocked(x, z, current.doorOpen)) {
        if (wantTrace) skippedBlocked++;
        continue;
      }

      if (strategy === "bfs") {
        if (nodeByKey.has(key)) {
          if (wantTrace) skippedSeen++;
          continue;
        }
        parent.set(key, currentKey);
        nodeByKey.set(key, { x, z, doorOpen });
        best.set(key, currentCost + 1);
        queued.add(key);
        frontier.push(key);
        if (wantTrace) added.push({ x, z });
        continue;
      }

      const stepCost = moveCost(costs, x, z);
      const nextCost = currentCost + stepCost;
      const known = best.get(key);
      if (nextCost >= (known ?? Infinity)) {
        if (wantTrace) skippedSeen++;
        continue;
      }

      const firstSeen = known === undefined;
      parent.set(key, currentKey);
      nodeByKey.set(key, { x, z, doorOpen });
      best.set(key, nextCost);
      if (!queued.has(key)) {
        queued.add(key);
        frontier.push(key);
      }
      if (wantTrace) (firstSeen ? added : updated).push({ x, z });
    }

    if (wantTrace) {
      const h =
        strategy === "astar" ? heuristic(current.x, current.z) : 0;
      events.push({
        node: { x: current.x, z: current.z },
        g: currentCost,
        h,
        f: currentCost + h,
        frontierSize: frontier.length,
        added,
        updated,
        skippedBlocked,
        skippedSeen,
        goal: false,
      });
    }
  }

  // Diagnose laser involvement for an honest message.
  const laserFree = options.avoidLasers
    ? planRoute(maze, start, goal, {
        avoidLasers: false,
        dynamicDoors: options.dynamicDoors,
      }).reached
    : false;

  return failure(
    options.avoidLasers && laserFree
      ? "No safe route: every path to the exit crosses a laser."
      : "No route: the exit cannot be reached from here."
  );
}

/**
 * Derive preview options from maze contents so each Tutorial level
 * gets the search its mechanics require: plain BFS for walls-only
 * mazes, laser avoidance where lasers exist, door-state search where
 * doors exist.
 */
export function previewOptionsFor(
  maze: MazeDefinition
): RouteOptions {
  let hasLaser = false;
  let hasDoor = false;

  for (const tile of maze.tiles) {
    if (tile.type === "laser") hasLaser = true;
    if (tile.type === "door") hasDoor = true;
  }

  return { avoidLasers: hasLaser, dynamicDoors: hasDoor };
}

export interface StrategyComparison {
  strategy: SearchStrategy;
  result: RouteResult;
  /** Measured wall-clock planning time in milliseconds. */
  ms: number;
}

/**
 * Run BFS, Dijkstra, and A* on the IDENTICAL maze, start, goal, rules, and
 * cost model so their routes and effort can be compared fairly. Timing is
 * measured per strategy; sub-millisecond differences are noise.
 */
export function compareStrategies(
  maze: MazeDefinition,
  start: RouteCell,
  goal: RouteCell,
  options: RouteOptions
): StrategyComparison[] {
  const strategies: SearchStrategy[] = ["bfs", "dijkstra", "astar"];

  return strategies.map((strategy) => {
    const begun = performance.now();
    const result = planRoute(maze, start, goal, { ...options, strategy });
    const ms = performance.now() - begun;

    return { strategy, result, ms };
  });
}

export interface CostFieldOptions {
  avoidLasers: boolean;
  dynamicDoors: boolean;
  initialDoorOpen?: boolean;
  costs?: CostModel;
}

/**
 * Minimum battery cost from the start cell to every valid destination tile,
 * keyed by "x,z". Walls, voids, and lethal lasers are never entries;
 * unreachable tiles are omitted. The start tile maps to 0. Each entry is
 * computed with the same Dijkstra search (and cost model) the planner uses,
 * so projections match execution math exactly.
 */
export function costField(
  maze: MazeDefinition,
  start: RouteCell,
  options: CostFieldOptions
): Map<string, number> {
  const field = new Map<string, number>();
  const costs = options.costs ?? DEFAULT_COSTS;

  for (const tile of maze.tiles) {
    if (tile.type === "wall" || tile.type === "laser") continue;

    const key = `${tile.x},${tile.z}`;
    if (tile.x === start.x && tile.z === start.z) {
      field.set(key, 0);
      continue;
    }

    const route = planRoute(maze, start, { x: tile.x, z: tile.z }, {
      avoidLasers: options.avoidLasers,
      dynamicDoors: options.dynamicDoors,
      initialDoorOpen: options.initialDoorOpen,
      strategy: "dijkstra",
      costs,
    });

    if (route.reached) field.set(key, route.cost);
  }

  return field;
}
