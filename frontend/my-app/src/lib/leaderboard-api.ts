import { apiRequest } from "./api";
import type { StoryRun } from "./bests";
import type { LeaderboardCategory } from "./leaderboard";

export interface LeaderboardEntry {
  rank: number;
  username: string;
  moves: number;
  remaining: number;
  exec_ms: number;
  cost_ratio: number;
  move_ratio: number;
  score: number;
  completed_at: string;
}

export interface LeaderboardPageData {
  level_id: number;
  category: string;
  page: number;
  page_size: number;
  total_players: number;
  total_pages: number;
  entries: LeaderboardEntry[];
}

export interface StoryRunSubmission {
  run_id: string;
  level_id: number;
  moves: number;
  remaining: number;
  exec_ms: number;
  plan_ms: number;
  plan_count: number;
  cost_ratio: number;
  move_ratio: number;
  completed_at: string;
}

/** Unique client run id so retried submissions deduplicate server-side. */
export function newRunId(levelId: number): string {
  return `${levelId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function submissionForRun(
  run: StoryRun,
  runId: string
): StoryRunSubmission {
  return {
    run_id: runId,
    level_id: run.levelId,
    moves: run.moves,
    remaining: run.remaining,
    exec_ms: run.execMs,
    plan_ms: run.planMs,
    plan_count: run.planCount,
    cost_ratio: run.costRatio,
    move_ratio: run.moveRatio,
    completed_at: run.completedAt,
  };
}

export function fetchLeaderboard(
  levelId: number,
  category: LeaderboardCategory,
  page: number,
  pageSize = 10
): Promise<LeaderboardPageData> {
  const params = new URLSearchParams({
    category,
    page: String(page),
    page_size: String(pageSize),
  });
  return apiRequest<LeaderboardPageData>(
    `/api/leaderboard/${levelId}?${params.toString()}`
  );
}

export function submitStoryRun(
  submission: StoryRunSubmission
): Promise<{ run_id: string; duplicate: boolean }> {
  return apiRequest<{ run_id: string; duplicate: boolean }>(
    "/api/leaderboard/runs",
    { method: "POST", body: JSON.stringify(submission) }
  );
}
