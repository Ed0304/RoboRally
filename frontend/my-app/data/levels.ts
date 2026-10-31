
export type LevelType = "Tutorial" | "Story";
export type Difficulty = "Easy" | "Medium" | "Hard";

export type LevelGoal =
  | "Get to the finish line"
  | "Collect all items"
  | "Defeat all enemies";

export interface Level {
  id: number;
  name: string;
  description: string;
  type: LevelType;
  difficulty: Difficulty;
  goal: LevelGoal;
  layout: string[];
}

export const levels: Level[] = [
  // Tutorial 1: Basic navigation
  {
    id: 1,
    name: "The Basics",
    description:
      "Tutorial 1 of 3 — BFS: watch the search frontier spread from the start and find the fewest-move route to the exit.",
    type: "Tutorial",
    difficulty: "Easy",
    goal: "Get to the finish line",
    layout: [
      "###########",
      "#S........#",
      "#.#####...#",
      "#.....#...#",
      "###.#.#...#",
      "#...#.....#",
      "#.........#",
      "#........E#",
      "###########",
    ],
  },

  // Tutorial 2: Dijkstra's algorithm on weighted terrain
  {
    id: 2,
    name: "Hazards",
    description:
      "Tutorial 2 of 3 — Dijkstra: a shorter route can cost more battery. Compare the short costly middle passage with the longer cheap corridor.",
    type: "Tutorial",
    difficulty: "Easy",
    goal: "Get to the finish line",
    layout: [
      "###########",
      "#S..L.....#",
      "#.###.###.#",
      "#...L.....#",
      "###.###.#.#",
      "#...53L.#.#",
      "#.###.33.L#",
      "#........E#",
      "###########",
    ],
  },

  // Tutorial 3: A* search with a Manhattan heuristic
  {
    id: 3,
    name: "Something Unexpected",
    description:
      "Tutorial 3 of 3 — A*: see how a goal-directed heuristic finds a minimum-cost route while exploring fewer states.",
    type: "Tutorial",
    difficulty: "Medium",
    goal: "Get to the finish line",
    layout: [
      "###########",
      "#S..#.....#",
      "#...#..#..#",
      "#.###..#..#",
      "#....3.#..#",
      "####.#.#..#",
      "#......#..#",
      "#........E#",
      "###########",
    ],
  },

  // Story 1: Laser-guarded corridor with two routes (Phase B)
  {
    id: 4,
    name: "Ember Corridor",
    description:
      "Cross a laser-guarded factory corridor. Two routes lead east: the exposed northern walkway or the longer southern service passage.",
    type: "Story",
    difficulty: "Medium",
    goal: "Get to the finish line",
    layout: [
      "#############",
      "#S.333333...#",
      "#.####.####.#",
      "#.#.....L5#.#",
      "#.#.#####.#.#",
      "#.#.#...#.#.#",
      "#.#.#.#.#.#.#",
      "#.5.#.#...#.#",
      "#.###.###.#.#",
      "#.....L...E.#",
      "#############",
    ],
  },

  // Story 2: Laser-secured workshops (Phase B)
  {
    id: 5,
    name: "Security Breach",
    description:
      "Infiltrate a laser-secured factory sector. Thread the central workshops to the eastern exit without touching a laser.",
    type: "Story",
    difficulty: "Hard",
    goal: "Get to the finish line",
    layout: [
      "###############",
      "#S...#...L....#",
      "##.#.#.####.#.#",
      "#..#.#.#..#.#.#",
      "#.##.#.#L.#.#.#",
      "#.#....333.#L.#",
      "#.#.##.##3#.#.#",
      "#.#.#...#3#..E#",
      "#.#.#.###.#.#5#",
      "#...L.......5.#",
      "###############",
    ],
  },

  // Story 3: Trigger-gated factory rescue finale (Phase B)
  {
    id: 6,
    name: "The Factory Rescue",
    description:
      "Escape the failing production facility. Choose between the costly eastern spur and the longer western colonnade. Lasers guard every shortcut.",
    type: "Story",
    difficulty: "Hard",
    goal: "Get to the finish line",
    layout: [
      "###############",
      "#S....#.55.L..#",
      "#.##..#.#.###.#",
      "#.#...#.#...#L#",
      "#.#.###.#.#3..#",
      "#.#.#L..#.#3#.#",
      "#.#.#.###.#3#.#",
      "#.#.#.#...#3#.#",
      "#.#.#...#.#3#.#",
      "#...#.#L..#...#",
      "#.###.#.###.#.#",
      "#.....#...#.E##",
      "###############",
    ],
  },
];
