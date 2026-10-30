
import type { PatrolRoute } from "./enemyAI";

export const ENEMY_PATROLS: Record<number, PatrolRoute[]> = {
  4: [
    {
      id: "level4-enemy-1",
      // Large loop along the upper corridor.
      points: [
        { x: 4, z: 3 },
        { x: 5, z: 3 },
        { x: 6, z: 3 },
        { x: 7, z: 3 },
        { x: 8, z: 3 },
        { x: 9, z: 3 },
        { x: 10, z: 3 },
        { x: 11, z: 3 },
        { x: 11, z: 4 },
        { x: 10, z: 4 },
        { x: 9, z: 4 },
        { x: 8, z: 4 },
        { x: 7, z: 4 },
        { x: 6, z: 4 },
        { x: 5, z: 4 },
        { x: 4, z: 4 },
        { x: 3, z: 4 },
        { x: 3, z: 3 },
      ],
    },
  ],

  5: [
    {
      id: "level5-enemy-1",
      // Loop through the upper-left room.
      points: [
        { x: 4, z: 3 },
        { x: 3, z: 3 },
        { x: 2, z: 3 },
        { x: 1, z: 3 },
        { x: 1, z: 4 },
        { x: 2, z: 4 },
        { x: 3, z: 4 },
        { x: 4, z: 4 },
      ],
    },
    {
      id: "level5-enemy-2",
      // Loop around the lower-right room without entering the laser.
      points: [
        { x: 9, z: 6 },
        { x: 10, z: 6 },
        { x: 11, z: 6 },
        { x: 12, z: 6 },
        { x: 12, z: 7 },
        { x: 11, z: 7 },
        { x: 10, z: 7 },
        { x: 9, z: 7 },
      ],
    },
    {
      id: "level5-enemy-3",
      // Loop through the lower-left room.
      points: [
        { x: 4, z: 8 },
        { x: 5, z: 8 },
        { x: 6, z: 8 },
        { x: 7, z: 8 },
        { x: 7, z: 9 },
        { x: 6, z: 9 },
        { x: 5, z: 9 },
        { x: 4, z: 9 },
        { x: 3, z: 9 },
        { x: 2, z: 9 },
        { x: 1, z: 9 },
        { x: 1, z: 8 },
        { x: 2, z: 8 },
        { x: 3, z: 8 },
      ],
    },
  ],

  6: [
    {
      id: "level6-enemy-1",
      // Loop around the upper-right corridor.
      points: [
        { x: 14, z: 1 },
        { x: 13, z: 1 },
        { x: 12, z: 1 },
        { x: 12, z: 2 },
        { x: 13, z: 2 },
        { x: 14, z: 2 },
        { x: 14, z: 3 },
        { x: 13, z: 3 },
        { x: 12, z: 3 },
        { x: 12, z: 2 },
      ],
    },
    {
      id: "level6-enemy-2",
      // Loop in the central room.
      points: [
        { x: 8, z: 3 },
        { x: 7, z: 3 },
        { x: 6, z: 3 },
        { x: 6, z: 4 },
        { x: 7, z: 4 },
        { x: 8, z: 4 },
        { x: 8, z: 3 },
      ],
    },
    {
      id: "level6-enemy-3",
      // Loop around the left-hand room.
      points: [
        { x: 3, z: 4 },
        { x: 2, z: 4 },
        { x: 1, z: 4 },
        { x: 1, z: 3 },
        { x: 2, z: 3 },
        { x: 3, z: 3 },
        { x: 4, z: 3 },
        { x: 4, z: 4 },
      ],
    },
  ],
};
