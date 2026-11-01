
import type { GameStatus } from "./gamelogic";

export const EXEC_STEP_DELAY_MS = 450;

/** Poll interval while paused: the stepper waits here between moves. */
export const PAUSE_POLL_MS = 100;

export interface ExecutionState {
  running: boolean;
  /** True while a running execution is held between steps. */
  paused: boolean;
  currentIndex: number;
  total: number;
  message: string;
}

export const IDLE_EXECUTION: ExecutionState = {
  running: false,
  paused: false,
  currentIndex: 0,
  total: 0,
  message: "",
};

export interface GridPosition {
  x: number;
  z: number;
}

export interface StepPrereqs {
  status: GameStatus;
  expected: GridPosition;
  actual: GridPosition;
}

export type StepVerdict =
  | { ok: true }
  | { ok: false; reason: string };

export function verifyStepPrereqs(
  prereqs: StepPrereqs
): StepVerdict {
  if (prereqs.status === "won") {
    return { ok: false, reason: "Level already completed." };
  }

  if (prereqs.status === "dead") {
    return { ok: false, reason: "Robot was destroyed." };
  }

  if (
    prereqs.expected.x !== prereqs.actual.x ||
    prereqs.expected.z !== prereqs.actual.z
  ) {
    return {
      ok: false,
      reason:
        `Position changed since planning (expected ` +
        `(${prereqs.expected.x}, ${prereqs.expected.z}), found ` +
        `(${prereqs.actual.x}, ${prereqs.actual.z})). ` +
        `Plan stopped — request a new plan.`,
    };
  }

  return { ok: true };
}

export function describeProgress(
  index: number,
  total: number
): string {
  return `Step ${index + 1} of ${total}`;
}

const COACH_TERRAIN_LABEL: Record<string, string> = {
  rough: "rough terrain",
  drain: "drain terrain",
};

/**
 * Tutorial coach line for one successful move. Built only from the
 * observed step: direction taken, battery actually deducted, battery
 * left, and the tile type entered.
 */
export function coachForMove(
  direction: string,
  cost: number,
  remaining: number,
  tileType: string
): string {
  const terrain = COACH_TERRAIN_LABEL[tileType];
  const where = terrain ? ` onto ${terrain}` : "";
  return (
    `Moved ${direction}${where} · −${cost}% battery · ` +
    `${remaining}% left.`
  );
}

/** Tutorial coach line when a planned step cannot move the robot. */
export function coachForBlocked(): string {
  return (
    "That tile is blocked, so the robot stayed put. Rephrase " +
    "your mission or request a new plan."
  );
}

/** Tutorial coach line when the next step is unaffordable. */
export function coachForDepleted(): string {
  return "Battery too low for the next step — restart to recharge.";
}

/** Tutorial coach line for a terminal run outcome. */
export function coachForOutcome(status: "won" | "dead"): string {
  return status === "won"
    ? "Mission complete — the robot reached the exit."
    : "The robot was destroyed — restart to try again.";
}
