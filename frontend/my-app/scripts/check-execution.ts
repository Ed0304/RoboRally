
import assert from "node:assert/strict";
import {
  describeProgress,
  verifyStepPrereqs,
} from "@/lib/execution";

// Pre-move gate: playing + position matches -> proceed.
assert.deepEqual(
  verifyStepPrereqs({
    status: "playing",
    expected: { x: 2, z: 3 },
    actual: { x: 2, z: 3 },
  }),
  { ok: true }
);

// Game already won -> stop.
{
  const verdict = verifyStepPrereqs({
    status: "won",
    expected: { x: 2, z: 3 },
    actual: { x: 2, z: 3 },
  });
  assert.equal(verdict.ok, false);
  assert.match(
    (verdict as { reason: string }).reason,
    /completed/
  );
}

// Robot destroyed -> stop.
{
  const verdict = verifyStepPrereqs({
    status: "dead",
    expected: { x: 2, z: 3 },
    actual: { x: 2, z: 3 },
  });
  assert.equal(verdict.ok, false);
  assert.match(
    (verdict as { reason: string }).reason,
    /destroyed/
  );
}

// Position drifted (manual move, restart, enemy shove) -> stop with coords.
{
  const verdict = verifyStepPrereqs({
    status: "playing",
    expected: { x: 2, z: 3 },
    actual: { x: 4, z: 3 },
  });
  assert.equal(verdict.ok, false);
  const reason = (verdict as { reason: string }).reason;
  assert.match(reason, /\(2, 3\)/);
  assert.match(reason, /\(4, 3\)/);
  assert.match(reason, /new plan/);
}

assert.equal(describeProgress(0, 6), "Step 1 of 6");
assert.equal(describeProgress(5, 6), "Step 6 of 6");

console.log("Execution gate checks passed!");
