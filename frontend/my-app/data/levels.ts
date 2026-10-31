
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
      "Learn the controls and navigate a simple factory maze to reach the exit.",
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

  // Tutorial 2: Laser hazards
  {
    id: 2,
    name: "Hazards",
    description:
      "Navigate the factory floor while avoiding dangerous tiles and laser traps.",
    type: "Tutorial",
    difficulty: "Easy",
    goal: "Get to the finish line",
    layout: [
      "###########",
      "#S..L.....#",
      "#.###.###.#",
      "#...L.....#",
      "###.###.#.#",
      "#.....L.#.#",
      "#.####...L#",
      "#........E#",
      "###########",
    ],
  },

  // Tutorial 3: Alternate routes and trigger-controlled doors
  {
    id: 3,
    name: "Something Unexpected",
    description:
      "A blocked route forces you to reconsider your path and find another way to the exit.",
    type: "Tutorial",
    difficulty: "Medium",
    goal: "Get to the finish line",
    layout: [
      "###########",
      "#S..#.....#",
      "#...#..D..#",
      "#.###..#..#",
      "#....!.#..#",
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
      "#S..........#",
      "#.####.####.#",
      "#.#.....L.#.#",
      "#.#.#####.#.#",
      "#.#.#...#.#.#",
      "#.#.#.#.#.#.#",
      "#...#.#...#.#",
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
      "#.#........#L.#",
      "#.#.##.##.#.#.#",
      "#.#.#...#.#..E#",
      "#.#.#.###.#.#.#",
      "#...L.........#",
      "###############",
    ],
  },

  // Story 3: Trigger-gated factory rescue finale (Phase B)
  {
    id: 6,
    name: "The Factory Rescue",
    description:
      "Trigger the security override, unlock the sealed exit chamber, and escape the factory. Lasers guard every shortcut.",
    type: "Story",
    difficulty: "Hard",
    goal: "Get to the finish line",
    layout: [
      "###############",
      "#S....#....L..#",
      "#.##..#.#.###.#",
      "#.#...#.#...#L#",
      "#.#.###.#.#...#",
      "#.#.#L..#.#.#.#",
      "#.#.#.###.#.#.#",
      "#.#.#.#...#.#.#",
      "#.#.#...#.#.#.#",
      "#...#.#L..#..!#",
      "#.###.#.###.#.#",
      "#.....#...#DE##",
      "###############",
    ],
  },
];
