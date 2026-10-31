import { levels } from "../../data/levels";
import type { PlanDirection } from "./agent";
import { costsForMaze } from "./battery";
import { buildMaze } from "./maze";
import {
  planRoute,
  previewOptionsFor,
  type SearchStrategy,
} from "./pathfinding";

export interface DirectionSegment {
  direction: PlanDirection;
  count: number;
}

export interface TutorialExample {
  levelId: number;
  strategy: SearchStrategy;
  /** Natural-language prompt generated from the verified route. */
  prompt: string;
  directions: PlanDirection[];
  moves: number;
  cost: number;
}

/**
 * Each Tutorial level's example demonstrates its own lesson:
 * L1 BFS (fewest moves), L2 Dijkstra (cheapest cost), L3 A*.
 */
const EXAMPLE_STRATEGY: Record<number, SearchStrategy> = {
  1: "bfs",
  2: "dijkstra",
  3: "astar",
};

/**
 * Backend planner budget (planner.py: 6 legs x 12 moves). Examples
 * must fit; update alongside the backend if it ever changes.
 */
export const PLANNER_ACTION_BUDGET = 72;

export function compressDirections(
  directions: PlanDirection[]
): DirectionSegment[] {
  const segments: DirectionSegment[] = [];

  for (const direction of directions) {
    const last = segments[segments.length - 1];

    if (last !== undefined && last.direction === direction) {
      last.count += 1;
    } else {
      segments.push({ direction, count: 1 });
    }
  }

  return segments;
}

export function promptForSegments(
  segments: DirectionSegment[]
): string {
  const body = segments
    .map(
      (segment) =>
        `${segment.direction} ${segment.count} step${segment.count === 1 ? "" : "s"}`
    )
    .join(", ");

  return `Move ${body} to reach the exit.`;
}

/**
 * Parse a generated example prompt back into segments. Used by the
 * regression check to prove the prompt text matches its route.
 */
export function parsePromptSegments(
  prompt: string
): DirectionSegment[] | null {
  const match = /^Move (.+) to reach the exit\.$/.exec(prompt.trim());

  if (!match) return null;

  const segments: DirectionSegment[] = [];

  for (const part of match[1].split(", ")) {
    const parsed = /^(north|south|east|west) (\d+) steps?$/.exec(part);

    if (!parsed) return null;

    segments.push({
      direction: parsed[1] as PlanDirection,
      count: Number(parsed[2]),
    });
  }

  return segments;
}

function pathDirections(
  path: Array<{ x: number; z: number }>
): PlanDirection[] {
  const directions: PlanDirection[] = [];

  for (let i = 1; i < path.length; i++) {
    const dx = path[i].x - path[i - 1].x;
    const dz = path[i].z - path[i - 1].z;

    if (dx === 1 && dz === 0) directions.push("east");
    else if (dx === -1 && dz === 0) directions.push("west");
    else if (dx === 0 && dz === 1) directions.push("south");
    else if (dx === 0 && dz === -1) directions.push("north");
    else return [];
  }

  return directions;
}

/**
 * Verified example mission for a Tutorial level, or null for Story
 * and unknown levels. The prompt is generated from a deterministic
 * reference route over the canonical level, so text and route agree
 * by construction. Returns null when no route exists rather than an
 * unverified prompt.
 */
export function tutorialExampleForLevel(
  levelId: number
): TutorialExample | null {
  const strategy = EXAMPLE_STRATEGY[levelId];

  if (!strategy) return null;

  const level = levels.find((entry) => entry.id === levelId);

  if (!level) return null;

  const maze = buildMaze(level);
  const result = planRoute(maze, maze.start, maze.exit, {
    ...previewOptionsFor(maze),
    strategy,
    costs: costsForMaze(maze),
  });

  if (!result.reached) return null;

  const directions = pathDirections(result.path);

  if (directions.length === 0) return null;

  return {
    levelId,
    strategy,
    prompt: promptForSegments(compressDirections(directions)),
    directions,
    moves: result.moves,
    cost: result.cost,
  };
}
