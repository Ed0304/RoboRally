
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
}

export const levels: Level[] = [
  {
    id: 1,
    name: "The Basics",
    description:
      "Learn the controls and navigate a simple factory maze to reach the exit.",
    type: "Tutorial",
    difficulty: "Easy",
    goal: "Get to the finish line",
  },
  {
    id: 2,
    name: "Hazards",
    description:
      "Navigate the factory floor while avoiding dangerous tiles and laser traps.",
    type: "Tutorial",
    difficulty: "Easy",
    goal: "Get to the finish line",
  },
  {
    id: 3,
    name: "Something Unexpected",
    description:
      "A blocked route forces you to reconsider your path and find another way to the exit.",
    type: "Tutorial",
    difficulty: "Medium",
    goal: "Get to the finish line",
  },
  {
    id: 4,
    name: "Power Up",
    description:
      "Explore an abandoned factory sector and collect the energy cells needed to restore power.",
    type: "Story",
    difficulty: "Easy",
    goal: "Collect all items",
  },
  {
    id: 5,
    name: "Hostile Takeover",
    description:
      "Navigate a security-controlled facility and defeat the hostile robots guarding the route.",
    type: "Story",
    difficulty: "Medium",
    goal: "Defeat all enemies",
  },
  {
    id: 6,
    name: "The Factory Rescue",
    description:
      "Enter the failing production facility and recover the critical power cells.",
    type: "Story",
    difficulty: "Hard",
    goal: "Collect all items",
  },
];
