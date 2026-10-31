
import type { GameStatus } from "./gamelogic";

export const EXEC_STEP_DELAY_MS = 450;

export interface ExecutionState {
  running: boolean;
  currentIndex: number;
  total: number;
  message: string;
}

export const IDLE_EXECUTION: ExecutionState = {
  running: false,
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
