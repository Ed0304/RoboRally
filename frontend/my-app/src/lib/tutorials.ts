// One algorithm lesson per Tutorial level. Kept in a plain lib module so the
// game brief and the regression checks share the same copy.
export type TutorialAlgorithm = "bfs" | "dijkstra" | "astar";

export interface TutorialLesson {
  levelId: number;
  algorithm: TutorialAlgorithm;
  title: string;
  body: string[];
}

export const TUTORIAL_LESSONS: Record<number, TutorialLesson> = {
  1: {
    levelId: 1,
    algorithm: "bfs",
    title: "Level 1 · Breadth-First Search",
    body: [
      "BFS explores the maze in layers: it visits every cell one step away, then two steps, and so on.",
      "The cells waiting to be explored are the frontier; cells already visited are explored. Because every move costs the same here, the first time BFS reaches the exit it has found a route with the fewest moves.",
      "Give the agent a mission, watch it execute step by step, and compare algorithms in the post-win replay.",
    ],
  },
  2: {
    levelId: 2,
    algorithm: "dijkstra",
    title: "Level 2 · Dijkstra's Algorithm",
    body: [
      "Rough (3%) and drain (5%) tiles make some steps more expensive than others, so the fewest-move route is not always the cheapest.",
      "Dijkstra's algorithm tracks the total battery cost to reach each cell and always expands the cheapest unfinished cell first, which finds the minimum-cost route.",
      "Run a mission, then use the post-win replay to compare the short costly passage with the long cheap corridor.",
    ],
  },
  3: {
    levelId: 3,
    algorithm: "astar",
    title: "Level 3 · A* Search",
    body: [
      "A* also finds a minimum-cost route, but it uses a heuristic — the Manhattan distance to the exit — to steer the search toward the goal.",
      "Because the heuristic never overestimates the true remaining cost, the route stays optimal while fewer cells get explored.",
      "Run a mission, then replay all three algorithms after your win and compare expanded states — A*'s hint explores less while keeping the optimum.",
    ],
  },
};

export function lessonForLevel(levelId: number): TutorialLesson | null {
  return TUTORIAL_LESSONS[levelId] ?? null;
}
