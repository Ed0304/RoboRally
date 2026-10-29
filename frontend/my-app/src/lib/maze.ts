
import type { LevelData } from "./levels";

export type TileType =
  | "floor"
  | "wall"
  | "exit"
  | "laser"
  | "collectible"
  | "enemy"
  | "door"
  | "trigger";

// The mapping table: one place defines each symbol's meaning.
export const TILE_MAPPING: Record<
  string,
  { type: TileType; blocksMovement: boolean }
> = {
  "#": { type: "wall", blocksMovement: true },
  ".": { type: "floor", blocksMovement: false },
  S:  { type: "floor", blocksMovement: false },
  E:  { type: "exit", blocksMovement: false },
  L:  { type: "laser", blocksMovement: false },
  C:  { type: "collectible", blocksMovement: false },
  R:  { type: "enemy", blocksMovement: true },
  D:  { type: "door", blocksMovement: true },
  "!": { type: "trigger", blocksMovement: false },
};

export interface MazeTile {
  x: number;
  z: number;
  type: TileType;
  symbol: string;
  blocksMovement: boolean;
}

export interface MazeDefinition {
  tiles: MazeTile[];
  width: number;
  depth: number;
  start: { x: number; z: number };
  exit: { x: number; z: number };
}

export function buildMaze(level: LevelData): MazeDefinition {
  const layout = level.layout;
  const width = layout[0]?.length ?? 0;

  if (
    width === 0 ||
    layout.some((row) => row.length !== width)
  ) {
    throw new Error(
      `Invalid maze layout for level ${level.id}: rows must have equal width`
    );
  }

  let start: MazeDefinition["start"] | undefined;
  let exit: MazeDefinition["exit"] | undefined;

  const tiles = layout.flatMap((row, z) =>
    [...row].map((symbol, x): MazeTile => {
      const mapping = TILE_MAPPING[symbol];

      if (!mapping) {
        throw new Error(
          `Unknown maze symbol "${symbol}" in level ${level.id} at (${x}, ${z})`
        );
      }

      if (symbol === "S") {
        if (start) {
          throw new Error(`Level ${level.id} has multiple start positions`);
        }
        start = { x, z };
      }

      if (symbol === "E") {
        if (exit) {
          throw new Error(`Level ${level.id} has multiple exits`);
        }
        exit = { x, z };
      }

      return {
        x,
        z,
        type: mapping.type,
        symbol,
        blocksMovement: mapping.blocksMovement,
      };
    })
  );

  if (!start || !exit) {
    throw new Error(
      `Level ${level.id} must contain exactly one start (S) and one exit (E)`
    );
  }

  return {
    tiles,
    width,
    depth: layout.length,
    start,
    exit,
  };
}
