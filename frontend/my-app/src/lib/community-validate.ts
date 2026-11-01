import { buildMaze } from "./maze";
import { costsForMaze } from "./battery";
import { planRoute } from "./pathfinding";

export const COMMUNITY_MIN_DIM = 5;
export const COMMUNITY_MAX_DIM = 25;

export const COMMUNITY_CATEGORIES = [
  { id: "basics", label: "Basic navigation" },
  { id: "hazards", label: "Hazard avoidance" },
  { id: "weighted", label: "Weighted pathfinding" },
  { id: "efficient", label: "Resource-efficient navigation" },
  { id: "dynamic", label: "Dynamic obstacles" },
] as const;

const ALLOWED = new Set(["#", ".", "S", "E", "L", "3", "5"]);

export interface CommunityDraft {
  name: string;
  description: string;
  width: number;
  height: number;
  /** Row strings, "."-filled grid the editor mutates. */
  layout: string[];
  categories: string[];
}

/** Mirror of the server rules so the editor fails fast, same messages. */
export function validateCommunityDraft(draft: CommunityDraft): string[] {
  const errors: string[] = [];
  const { width, height, layout } = draft;

  if (
    !Number.isInteger(width) ||
    width < COMMUNITY_MIN_DIM ||
    width > COMMUNITY_MAX_DIM
  ) {
    errors.push(
      `Width must be between ${COMMUNITY_MIN_DIM} and ${COMMUNITY_MAX_DIM}.`
    );
  }

  if (
    !Number.isInteger(height) ||
    height < COMMUNITY_MIN_DIM ||
    height > COMMUNITY_MAX_DIM
  ) {
    errors.push(
      `Height must be between ${COMMUNITY_MIN_DIM} and ${COMMUNITY_MAX_DIM}.`
    );
  }

  if (layout.length !== height) {
    errors.push(`Layout must have exactly ${height} rows.`);
    return errors;
  }

  let starts = 0;
  let exits = 0;

  for (let z = 0; z < layout.length; z++) {
    const row = layout[z];
    if (row.length !== width) {
      errors.push(`Row ${z + 1} must be ${width} characters wide.`);
      continue;
    }
    for (let x = 0; x < row.length; x++) {
      const symbol = row[x];
      if (!ALLOWED.has(symbol)) {
        errors.push(
          `Row ${z + 1}, col ${x + 1}: unsupported tile '${symbol}'.`
        );
      } else if (symbol === "S") {
        starts += 1;
      } else if (symbol === "E") {
        exits += 1;
      }
    }
  }

  if (starts !== 1) {
    errors.push("The maze must have exactly one start (S).");
  }
  if (exits !== 1) {
    errors.push("The maze must have exactly one exit (E).");
  }

  if (errors.length > 0 || draft.name.trim().length === 0) {
    if (draft.name.trim().length === 0) {
      errors.push("Name must not be blank.");
    }
    return errors;
  }

  // Solvability under the real engine: a laser-free route must exist.
  const maze = buildMaze({
    id: 0,
    name: draft.name,
    description: draft.description,
    layout: draft.layout,
  });
  const route = planRoute(maze, maze.start, maze.exit, {
    avoidLasers: true,
    dynamicDoors: false,
    strategy: "bfs",
    costs: costsForMaze(maze),
  });

  if (!route.reached) {
    errors.push("No laser-free route exists from start to exit.");
  }

  return errors;
}

export function emptyLayout(width: number, height: number): string[] {
  return Array.from({ length: height }, () => ".".repeat(width));
}
