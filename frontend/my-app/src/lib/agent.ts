
import { apiRequest } from "./api";

export type PlanDirection = "north" | "south" | "east" | "west";

export interface PlanAction {
  op: "move";
  direction: PlanDirection;
}

export interface PlanRequest {
  level_id: number;
  mission: string;
  robot: { x: number; z: number; direction: PlanDirection };
  enemies: { x: number; z: number }[];
  door_open: boolean;
}

export interface RejectedAction {
  index: number;
  reason: string;
}

export interface PlanResponse {
  model: string;
  actions: PlanAction[];
  reasoning: string;
  rejected: RejectedAction[];
}

export function requestPlan(
  request: PlanRequest
): Promise<PlanResponse> {
  return apiRequest<PlanResponse>("/api/agent/plan", {
    method: "POST",
    body: JSON.stringify(request),
  });
}
