import { apiRequest } from "./api";

export type CommunitySort = "newest" | "attempts" | "completion";
export type CommunityMetric = "moves" | "cost" | "time";
export type CommunityAlgorithm = "ai" | "bfs" | "dijkstra" | "astar";

export interface CommunityBest {
  username: string;
  moves: number;
  cost: number;
}

export interface CommunityCard {
  public_id: string;
  name: string;
  description: string;
  creator_username: string;
  width: number;
  height: number;
  version: number;
  status: string;
  categories: string[];
  has_lasers: boolean;
  has_weighted: boolean;
  attempts: number;
  completions: number;
  completion_rate: number;
  created_at: string;
  best: CommunityBest | null;
}

export interface CommunityCardPage {
  page: number;
  page_size: number;
  total_levels: number;
  total_pages: number;
  levels: CommunityCard[];
}

export interface CommunityLevel {
  public_id: string;
  name: string;
  description: string;
  creator_username: string;
  width: number;
  height: number;
  layout: string[];
  categories: string[];
  version: number;
  status: string;
  created_at: string;
  updated_at: string;
  attempts: number;
  completions: number;
}

export interface AttemptPrompt {
  prompt: string;
  status: "Success" | "Failed";
}

export interface AttemptResult {
  attempt_id: string;
  duplicate: boolean;
  outcome: string;
  moves: number;
  cost: number;
  remaining: number;
}

export interface CommunityLeaderboardRow {
  rank: number;
  username: string;
  algorithm: string;
  moves: number;
  cost: number;
  remaining: number;
  exec_ms: number;
  submitted_at: string;
}

export interface CommunityLeaderboard {
  public_id: string;
  version: string;
  metric: string;
  page: number;
  page_size: number;
  total_players: number;
  total_pages: number;
  entries: CommunityLeaderboardRow[];
}

export interface AttemptRecord {
  attempt_id: string;
  version: number;
  algorithm: string;
  outcome: string;
  moves: number;
  cost: number;
  remaining: number;
  exec_ms: number;
  prompts: AttemptPrompt[];
  submitted_at: string;
}

export function fetchCommunityLevels(
  sort: CommunitySort,
  page: number,
  category?: string,
  q?: string
): Promise<CommunityCardPage> {
  const params = new URLSearchParams({
    sort,
    page: String(page),
  });
  if (category) params.set("category", category);
  if (q?.trim()) params.set("q", q.trim());
  return apiRequest<CommunityCardPage>(
    `/api/community/levels?${params.toString()}`
  );
}

export function fetchCommunityLevel(
  publicId: string
): Promise<CommunityLevel> {
  return apiRequest<CommunityLevel>(`/api/community/levels/${publicId}`);
}

export function fetchMyCommunityLevels(): Promise<CommunityCard[]> {
  return apiRequest<CommunityCard[]>("/api/community/levels/mine");
}

export function fetchEditableCommunityLevel(
  publicId: string
): Promise<CommunityLevel> {
  return apiRequest<CommunityLevel>(
    `/api/community/levels/${publicId}/editable`
  );
}

export function updateCommunityLevel(
  publicId: string,
  payload: {
    name?: string;
    description?: string;
    width?: number;
    height?: number;
    layout?: string[];
    categories?: string[];
  }
): Promise<CommunityLevel> {
  return apiRequest<CommunityLevel>(`/api/community/levels/${publicId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function publishCommunityLevel(
  publicId: string
): Promise<CommunityLevel> {
  return apiRequest<CommunityLevel>(
    `/api/community/levels/${publicId}/publish`,
    { method: "POST" }
  );
}

export function unpublishCommunityLevel(
  publicId: string
): Promise<CommunityLevel> {
  return apiRequest<CommunityLevel>(
    `/api/community/levels/${publicId}/unpublish`,
    { method: "POST" }
  );
}

export function deleteCommunityLevel(
  publicId: string
): Promise<CommunityLevel> {
  return apiRequest<CommunityLevel>(`/api/community/levels/${publicId}`, {
    method: "DELETE",
  });
}

export function createCommunityLevel(payload: {
  name: string;
  description: string;
  width: number;
  height: number;
  layout: string[];
  categories: string[];
}): Promise<CommunityLevel> {
  return apiRequest<CommunityLevel>("/api/community/levels", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function newAttemptId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function submitCommunityAttempt(
  publicId: string,
  payload: {
    attempt_id: string;
    version: number;
    algorithm: CommunityAlgorithm;
    actions: string[];
    prompts: AttemptPrompt[];
    exec_ms: number;
    plan_ms: number;
    plan_count: number;
  }
): Promise<AttemptResult> {
  return apiRequest<AttemptResult>(
    `/api/community/levels/${publicId}/attempts`,
    { method: "POST", body: JSON.stringify(payload) }
  );
}

export function fetchCommunityLeaderboard(
  publicId: string,
  metric: CommunityMetric,
  version: string,
  page: number
): Promise<CommunityLeaderboard> {
  const params = new URLSearchParams({
    metric,
    version,
    page: String(page),
  });
  return apiRequest<CommunityLeaderboard>(
    `/api/community/levels/${publicId}/leaderboard?${params.toString()}`
  );
}

export function fetchMyCommunityAttempts(
  publicId: string
): Promise<AttemptRecord[]> {
  return apiRequest<AttemptRecord[]>(
    `/api/community/levels/${publicId}/attempts/me`
  );
}
