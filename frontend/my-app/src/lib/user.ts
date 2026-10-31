
import { apiRequest } from "./api";

export type PromptStatus = "Success" | "Failed";

export interface PromptEntry {
  prompt: string;
  status: PromptStatus;
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  completed_levels: number[];
  prompt_history: PromptEntry[];
}

export interface CompletionResponse {
  completed_levels: number[];
}

export function fetchUserProfile(): Promise<UserProfile> {
  return apiRequest<UserProfile>("/api/users/me");
}

export function recordLevelCompletion(
  levelId: number
): Promise<CompletionResponse> {
  return apiRequest<CompletionResponse>(
    "/api/users/me/completed-levels",
    {
      method: "POST",
      body: JSON.stringify({ level_id: levelId }),
    }
  );
}

export function recordPromptAttempt(
  prompt: string,
  status: PromptStatus
): Promise<PromptEntry> {
  return apiRequest<PromptEntry>("/api/users/me/prompt-history", {
    method: "POST",
    body: JSON.stringify({ prompt, status }),
  });
}
