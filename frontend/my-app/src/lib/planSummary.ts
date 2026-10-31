import type { PlanAction, PlanResponse } from "./agent";
import type { DirectionSegment } from "./tutorialExamples";
import { compressDirections } from "./tutorialExamples";

export type PlanningErrorKind = "network" | "planning";

/**
 * Classify a planning failure for user-facing copy. Network errors
 * (unreachable backend) read differently from model/planning errors
 * (reachable backend, unusable plan). Execution failures are reported
 * separately by the game engine and never reach this classifier.
 */
export function classifyPlanningError(err: unknown): PlanningErrorKind {
  if (err instanceof TypeError) return "network";

  const message =
    err instanceof Error ? err.message : String(err ?? "");

  return /failed to fetch|networkerror|load failed|network request failed/i.test(
    message
  )
    ? "network"
    : "planning";
}

export function compressActions(
  actions: PlanAction[]
): DirectionSegment[] {
  return compressDirections(actions.map((action) => action.direction));
}

/**
 * Human-readable summary of what the agent understood, derived ONLY
 * from the validated plan response: action directions, counts, and
 * rejections. Never invents objectives, constraints, or level
 * solutions; returns an honest empty-plan message when there is
 * nothing to summarize.
 */
export function summarizePlan(plan: PlanResponse): string {
  if (plan.actions.length === 0) {
    return (
      "The agent couldn't turn your words into any valid moves. " +
      "Nothing will execute — try rephrasing below."
    );
  }

  const segments = compressActions(plan.actions);
  const body = segments
    .map(
      (segment) =>
        `${segment.direction} ${segment.count} step${segment.count === 1 ? "" : "s"}`
    )
    .join(" → ");
  const moves = plan.actions.length;
  const rejected = plan.rejected.length;

  let summary =
    `The agent planned ${moves} validated move${moves === 1 ? "" : "s"} ` +
    `from your words: ${body}.`;

  if (rejected > 0) {
    summary +=
      ` ${rejected} proposed move${rejected === 1 ? "" : "s"} ` +
      `didn't pass validation (details below).`;
  }

  return summary;
}
