
"use client";

import { useState } from "react";
import {
  requestPlan,
  type PlanAction,
  type PlanDirection,
  type PlanResponse,
} from "@/lib/agent";
import type { ExecutionState } from "@/lib/execution";
import { recordPromptAttempt } from "@/lib/user";

export interface MissionSnapshot {
  robot: { x: number; z: number; direction: PlanDirection };
  enemies: { x: number; z: number }[];
  doorOpen: boolean;
}

interface MissionPanelProps {
  levelId: number;
  getSnapshot: () => MissionSnapshot;
  execution: ExecutionState;
  canExecute: boolean;
  onExecute: (actions: PlanAction[]) => void;
  onStop: () => void;
}

const directionArrow: Record<PlanDirection, string> = {
  north: "↑",
  south: "↓",
  east: "→",
  west: "←",
};

export default function MissionPanel({
  levelId,
  getSnapshot,
  execution,
  canExecute,
  onExecute,
  onStop,
}: MissionPanelProps) {
  const [mission, setMission] = useState("");
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [error, setError] = useState("");

  async function handleSubmit() {
    const snapshot = getSnapshot();

    onStop();
    setLoading(true);
    setError("");
    setPlan(null);

    // History rule: Success means the planner returned at least one
    // approved action. Errors, empty plans, and failures before the
    // model (network/HTTP) are Failed attempts. Blocked empty input is
    // not an attempt and is never recorded. One call site per request,
    // so retries cannot duplicate entries.
    try {
      const response = await requestPlan({
        level_id: levelId,
        mission,
        robot: snapshot.robot,
        enemies: snapshot.enemies,
        door_open: snapshot.doorOpen,
      });

      setPlan(response);
      recordPromptAttempt(
        mission.trim(),
        response.actions.length > 0 ? "Success" : "Failed"
      ).catch(() => {});
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Planning failed. Please try again."
      );
      recordPromptAttempt(mission.trim(), "Failed").catch(() => {});
    } finally {
      setLoading(false);
    }
  }

  const canStartExecution =
    canExecute &&
    !execution.running &&
    !loading &&
    plan !== null &&
    plan.actions.length > 0;

  return (
    <div className="mt-3 border-t border-[#3B414B] pt-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#F2A93B]">
        AI Mission
      </p>

      <textarea
        value={mission}
        onChange={(event) => setMission(event.target.value)}
        placeholder="e.g. Reach the exit without touching lasers"
        rows={2}
        maxLength={500}
        disabled={execution.running}
        className="mt-2 w-full resize-none rounded-md border border-[#3B414B] bg-[#22262D] px-2 py-2 text-sm text-[#F3F0E8] outline-none placeholder:text-[#626875] focus:border-[#F2A93B] disabled:opacity-50"
      />

      <button
        onClick={handleSubmit}
        disabled={
          loading || execution.running || mission.trim().length === 0
        }
        className="mt-2 w-full rounded-md bg-[#F2A93B] px-3 py-2 text-sm font-semibold text-[#17191D] transition hover:bg-[#FFC15B] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Planning..." : "Request plan"}
      </button>

      {error && (
        <p
          role="alert"
          className="mt-2 rounded-md border border-[#49343A] bg-[#2A1E22] px-2 py-2 text-xs leading-5 text-[#FF7979]"
        >
          {error}
        </p>
      )}

      {plan && (
        <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-[#3B414B] bg-[#22262D] p-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9299A6]">
            Plan · {plan.model}
          </p>

          {plan.actions.length === 0 ? (
            <p className="mt-1 text-xs text-[#FF7979]">
              No valid actions. See rejections below.
            </p>
          ) : (
            <ol className="mt-1 space-y-1">
              {plan.actions.map((action, index) => {
                const done = index < execution.currentIndex;
                const current =
                  execution.running &&
                  index === execution.currentIndex;

                return (
                  <li
                    key={index}
                    className={`flex items-center gap-2 text-xs ${
                      current
                        ? "font-bold text-[#F2A93B]"
                        : done
                          ? "text-[#626875] line-through"
                          : "text-[#E7E8EA]"
                    }`}
                  >
                    <span className="font-mono text-[#626875]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="font-bold text-[#F2A93B]">
                      {directionArrow[action.direction]}
                    </span>
                    <span className="capitalize">
                      {action.direction}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}

          {execution.running ? (
            <button
              onClick={onStop}
              className="mt-2 w-full rounded-md border border-[#FF7979] bg-[#2A1E22] px-3 py-2 text-sm font-semibold text-[#FF7979] transition hover:bg-[#3A262B]"
            >
              Stop execution
            </button>
          ) : (
            <button
              onClick={() => plan && onExecute(plan.actions)}
              disabled={!canStartExecution}
              className="mt-2 w-full rounded-md bg-[#65D982] px-3 py-2 text-sm font-semibold text-[#17191D] transition hover:bg-[#7FE797] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Execute Plan
            </button>
          )}

          {execution.message && (
            <p
              role="status"
              className="mt-2 text-xs leading-5 text-[#ADB2BD]"
            >
              {execution.message}
            </p>
          )}

          <p className="mt-2 text-xs leading-5 text-[#ADB2BD]">
            {plan.reasoning}
          </p>

          {plan.rejected.length > 0 && (
            <div className="mt-2 border-t border-[#3B414B] pt-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#FF7979]">
                Rejected ({plan.rejected.length})
              </p>

              <ul className="mt-1 space-y-1">
                {plan.rejected.map((item) => (
                  <li
                    key={item.index}
                    className="text-xs leading-5 text-[#B5BAC4]"
                  >
                    <span className="font-mono text-[#626875]">
                      #{item.index + 1}
                    </span>{" "}
                    {item.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
