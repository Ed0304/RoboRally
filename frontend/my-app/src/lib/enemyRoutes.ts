
import type { PatrolRoute } from "./enemyAI";

// No patrols: Story mode no longer has enemy entities (Phase B revamp).
// Enemies render, spawn, and detect exclusively from this table, so an
// empty record removes them everywhere. Consumers fall back to [].
export const ENEMY_PATROLS: Record<number, PatrolRoute[]> = {};
