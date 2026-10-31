import type { LevelData } from "./levels";

/**
 * Original practice mazes for the /learn lab. Deliberately separate
 * from the six game levels: small, focused examples that each teach
 * one idea. Lab ids (101+) never collide with game level ids.
 */
export const BFS_LAB: LevelData = {
  id: 101,
  name: "Wave Garden",
  description:
    "Unweighted practice maze: every move costs the same, so the first route BFS finds is the shortest.",
  layout: [
    "#######",
    "#S....#",
    "#.###.#",
    "#...#.#",
    "###.#E#",
    "#######",
  ],
};

export const DIJKSTRA_LAB: LevelData = {
  id: 102,
  name: "Fork in the Road",
  description:
    "Weighted practice maze: a short expensive passage versus a long cheap corridor.",
  layout: [
    "########",
    "#S.55.E#",
    "#.####.#",
    "#......#",
    "#.####.#",
    "########",
  ],
};

export const ASTAR_LAB: LevelData = {
  id: 103,
  name: "The Distraction",
  description:
    "Heuristic practice maze: a long dead-end corridor tempts blind search away from the goal.",
  layout: [
    "##########",
    "#S......E#",
    "#.########",
    "#.########",
    "#.########",
    "#.########",
    "#.########",
    "#....#####",
    "##########",
  ],
};

export const LAB_MAZES: LevelData[] = [BFS_LAB, DIJKSTRA_LAB, ASTAR_LAB];
