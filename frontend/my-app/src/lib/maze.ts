
export type TileType = "floor" | "wall" | "exit";

// Each character represents one tile:
// # = wall, . = floor, E = exit
const mazeLayout = [
  "#########",
  "#.......#",
  "#.###.#.#",
  "#...#.#.#",
  "###.#...#",
  "#...###.#",
  "#.#.....#",
  "#......E#",
  "#########",
];

export interface MazeTile {
  x: number;
  z: number;
  type: TileType;
}

export const maze: MazeTile[] = mazeLayout.flatMap(
  (row, z) =>
    [...row].map((character, x): MazeTile => ({
      x,
      z,
      type:
        character === "#"
          ? "wall"
          : character === "E"
            ? "exit"
            : "floor",
    }))
);

export const MAZE_WIDTH = mazeLayout[0].length;
export const MAZE_DEPTH = mazeLayout.length;
