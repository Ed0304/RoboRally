
import type { LevelData } from "./levels";

export interface ApiLevel extends LevelData {
  type: "Tutorial" | "Story";
  difficulty: "Easy" | "Medium" | "Hard";
  goal:
    | "Get to the finish line"
    | "Collect all items"
    | "Defeat all enemies";
  createdAt?: string;
  updatedAt?: string;
}
