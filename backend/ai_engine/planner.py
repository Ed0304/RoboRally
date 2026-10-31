
"""Mission planning orchestration: prompt, model call, validation."""

import logging
import time

from fastapi import HTTPException
from pydantic import ValidationError

from ai_engine import meta_client
from ai_engine.meta_client import PlannerError
from ai_engine.mission_validation import describe_sequence, validate_mission
from ai_engine.rules import find_exit, simulate
from ai_engine.schemas import (
    Action,
    ActionSegment,
    PlanRequest,
    PlanResponse,
    RejectedAction,
)
from game_logic.levels import levels_collection

logger = logging.getLogger("roborally.ai_engine")

# Bounded segmentation: complex missions are planned as short legs of at
# most SEGMENT_ACTIONS moves, chained server-side. Hard bounds per
# request: at most MAX_SEGMENTS legs, MAX_TOTAL_ACTIONS approved moves,
# MAX_MODEL_CALLS model calls (legs plus one truncation retry), and
# PLANNING_TIMEOUT_SECONDS before new legs stop (one in-flight call may
# overrun by at most its own timeout). Shortest safe routes of the
# shipped levels: L1 14, L2 ~15, L3 14, L4 19, L5 22, L6 37 moves. The
# 72-move budget covers the longest route with margin for waypoint
# detours, short legs, and rejected moves; repeat detection still stops
# genuine loops long before the cap.
SEGMENT_ACTIONS = 12
MAX_SEGMENTS = 6
MAX_TOTAL_ACTIONS = SEGMENT_ACTIONS * MAX_SEGMENTS
MAX_MODEL_CALLS = MAX_SEGMENTS + 1
PLANNING_TIMEOUT_SECONDS = 600.0
# A truncated leg is retried once with a smaller, simpler ask: fewer
# moves and an explicit follow-the-mission instruction, which gives the
# reasoning model a cheaper task instead of the same failing one.
RETRY_ACTIONS = 6

SYSTEM_PROMPT = """You command a robot in a grid factory maze. Plan the next leg of the mission as a short move plan.

Legend: # wall (blocked), . floor, S start, E exit/goal, L laser (lethal on entry), C collectible (walkable), R enemy start (avoid enemies), D door (blocked unless open), ! trigger (step on it to open doors), 3 rough terrain (walkable, costs 3% battery), 5 drain terrain (walkable, costs 5% battery).
Moves: north (x, z-1), south (x, z+1), east (x+1, z), west (x-1, z). One tile per move. The only action is "move" with one of these directions.
Rules: follow the mission step by step and return only the next moves of this leg, at most 12 moves; never plan moves into walls; never pass a closed door without stepping on its trigger first; avoid tiles occupied by patrolling enemies. Laser tiles destroy the robot on entry: follow the mission as stated and do not refuse, reroute, or second-guess it because of hazards.
Work incrementally: plan only this leg's moves from the robot's current position; do not plan beyond this leg.
Comprehension: if the mission text is gibberish with no discernible movement instruction or goal, set understood=false and return any single move as a placeholder (it will be discarded). Never set understood=false for a meaningful mission, even if it seems wrong, suboptimal, or impossible. Do not judge or correct the player's strategy: the game tests their problem-solving, so plan their words as stated.
Reply with structured output only: the JSON move list and nothing else. No reasoning field, no commentary, no markdown."""


def load_level(level_id: int) -> dict:
    """Load the authoritative level from MongoDB (same source as GET)."""
    if level_id < 1:
        raise HTTPException(
            status_code=400,
            detail="Level ID must be a positive integer.",
        )

    level = levels_collection.find_one({"id": level_id}, {"_id": 0})

    if level is None:
        raise HTTPException(
            status_code=404,
            detail=f"Level {level_id} not found.",
        )

    return level


def build_user_prompt(
    request: PlanRequest,
    level: dict,
    position: dict[str, int],
    door_open: bool,
    exit_pos: tuple[int, int],
    leg: int,
    max_actions: int = SEGMENT_ACTIONS,
    simplified: bool = False,
    exit_objective: bool = True,
    requested: str = "",
) -> str:
    layout = "\n".join(level["layout"])
    enemies = ", ".join(
        f"({enemy.x}, {enemy.z})" for enemy in request.enemies
    ) or "none reported"

    if simplified:
        instruction = (
            f"Plan ONLY the next {max_actions} moves following the "
            f"mission in order. Do not work out the rest of the "
            f"mission."
        )
    elif not exit_objective:
        instruction = (
            f"Plan ONLY these requested moves in order ({requested}) "
            f"— at most {max_actions} moves; do not add any further "
            f"moves and do not head to the exit."
        )
    else:
        instruction = (
            f"Plan up to {max_actions} moves toward the exit — use as "
            f"many as needed without stopping early; stop only when "
            f"you reach the exit."
        )

        if requested and leg == 1:
            instruction += (
                f" Begin with the requested starting moves: {requested}."
            )

    return (
        f"Mission: {request.mission.strip()}\n"
        f"Level {level['id']}: {level['name']} "
        f"(goal: {level.get('goal', 'reach the exit')}).\n"
        f"Leg {leg}: robot at ({position['x']}, {position['z']}), "
        f"exit at ({exit_pos[0]}, {exit_pos[1]}). "
        f"Door open: {door_open}. Enemies at: {enemies}.\n"
        f"{instruction}\n"
        f"Layout:\n{layout}"
    )


def _request_segment(
    request: PlanRequest,
    level: dict,
    position: dict[str, int],
    door_open: bool,
    exit_pos: tuple[int, int],
    leg: int,
    max_actions: int = SEGMENT_ACTIONS,
    simplified: bool = False,
    timeout: float | None = None,
    exit_objective: bool = True,
    requested: str = "",
) -> ActionSegment:
    logger.info(
        "plan request leg: level=%d leg=%d pos=(%d, %d) "
        "schema=segment%d effort=%s limit=%d",
        request.level_id,
        leg,
        position["x"],
        position["z"],
        max_actions,
        meta_client.REASONING_EFFORT,
        meta_client.MAX_OUTPUT_TOKENS,
    )

    raw = meta_client.complete_plan(
        SYSTEM_PROMPT,
        build_user_prompt(
            request,
            level,
            position,
            door_open,
            exit_pos,
            leg,
            max_actions,
            simplified,
            exit_objective,
            requested,
        ),
        model=meta_client.DEFAULT_MODEL,
        json_schema=meta_client.segment_schema(max_actions),
        timeout=timeout,
    )

    try:
        return ActionSegment.model_validate(raw)
    except ValidationError as exc:
        summary = "; ".join(
            f"{'.'.join(str(part) for part in error['loc'])}: "
            f"{error['msg']}"
            for error in exc.errors()
        )
        logger.warning(
            "plan request invalid model output: level=%d leg=%d "
            "errors=%s",
            request.level_id,
            leg,
            summary,
        )
        raise PlannerError(
            "Mission planning failed: the model returned an "
            "unusable plan. Try rephrasing your mission.",
        ) from None


def plan_mission(request: PlanRequest) -> PlanResponse:
    level = load_level(request.level_id)
    logger.info(
        "plan request: level=%d mission_chars=%d robot=(%d, %d) "
        "enemies=%d door_open=%s model=%s",
        request.level_id,
        len(request.mission),
        request.robot.x,
        request.robot.z,
        len(request.enemies),
        request.door_open,
        meta_client.DEFAULT_MODEL,
    )

    try:
        exit_pos = find_exit(level["layout"])
    except PlannerError as exc:
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from None

    position = {"x": request.robot.x, "z": request.robot.z}
    enemies = [{"x": e.x, "z": e.z} for e in request.enemies]
    door_open = request.door_open

    if (position["x"], position["z"]) == exit_pos:
        return PlanResponse(
            model=meta_client.DEFAULT_MODEL,
            actions=[],
            reasoning="Already at the exit.",
            rejected=[],
        )

    # Deterministic quality gate: rejects weak missions before any
    # model call, so they consume no planning budget.
    validation = validate_mission(
        request.mission,
        level["layout"],
        position,
        door_open,
        enemies,
        exit_pos,
    )

    if not validation.valid:
        logger.warning(
            "plan request invalid mission: level=%d reason=%s",
            request.level_id,
            validation.reason_code,
        )
        raise HTTPException(
            status_code=422,
            detail=validation.message,
        ) from None

    exit_objective = validation.exit_objective
    required = list(validation.required_sequence)
    requested = describe_sequence(validation.required_sequence)

    if required:
        # Required starting moves are simulated before any model call:
        # blocked instructions fail fast instead of burning budget.
        pre_check = simulate(
            level["layout"],
            position,
            door_open,
            enemies,
            [Action(op="move", direction=d) for d in required],
        )

        if pre_check.rejected:
            first = pre_check.rejected[0]
            raise HTTPException(
                status_code=422,
                detail=(
                    "Mission planning failed: your requested moves "
                    "can't be completed as stated — "
                    f"{first.reason} Try rephrasing."
                ),
            ) from None

    actions: list[Action] = []
    rejected: list[RejectedAction] = []
    reasonings: list[str] = []
    consumed = 0
    total_cost = 0
    died = False
    model_calls = 0
    retried = False
    seen = {(position["x"], position["z"])}
    deadline = time.monotonic() + PLANNING_TIMEOUT_SECONDS

    for leg in range(1, MAX_SEGMENTS + 1):
        if time.monotonic() >= deadline:
            logger.warning(
                "plan request timed out: level=%d leg=%d",
                request.level_id,
                leg,
            )
            raise HTTPException(
                status_code=503,
                detail=(
                    "Mission planning timed out before finishing. "
                    "Try a shorter mission."
                ),
            ) from None

        call_timeout = min(
            meta_client.REQUEST_TIMEOUT_SECONDS,
            max(1.0, deadline - time.monotonic()),
        )

        if exit_objective:
            leg_max = SEGMENT_ACTIONS
            retry_max = RETRY_ACTIONS
        else:
            # Bounded mission: never ask for more than requested.
            remaining = len(required) - len(actions)

            if remaining <= 0:
                break

            leg_max = min(SEGMENT_ACTIONS, remaining)
            retry_max = min(RETRY_ACTIONS, remaining)

        try:
            model_calls += 1
            plan = _request_segment(
                request,
                level,
                position,
                door_open,
                exit_pos,
                leg,
                max_actions=leg_max,
                timeout=call_timeout,
                exit_objective=exit_objective,
                requested=requested,
            )
        except PlannerError as exc:
            if exc.code == "truncated" and not retried:
                # One bounded retry with a cheaper ask: fewer moves and
                # an explicit follow-the-mission instruction, so the
                # model reasons less instead of repeating the failure.
                retried = True
                model_calls += 1
                logger.warning(
                    "plan request truncated, retrying once: level=%d "
                    "leg=%d calls=%d",
                    request.level_id,
                    leg,
                    model_calls,
                )
                try:
                    plan = _request_segment(
                        request,
                        level,
                        position,
                        door_open,
                        exit_pos,
                        leg,
                        max_actions=retry_max,
                        simplified=True,
                        timeout=call_timeout,
                        exit_objective=exit_objective,
                        requested=requested,
                    )
                except PlannerError as retry_exc:
                    raise HTTPException(
                        status_code=retry_exc.status_code,
                        detail=str(retry_exc),
                    ) from None
            else:
                raise HTTPException(
                    status_code=exc.status_code,
                    detail=str(exc),
                ) from None

        assert model_calls <= MAX_MODEL_CALLS

        if not plan.understood:
            logger.warning(
                "plan request unintelligible mission: level=%d leg=%d",
                request.level_id,
                leg,
            )
            raise HTTPException(
                status_code=422,
                detail=(
                    "Mission planning failed: those instructions look "
                    "like gibberish — the agent couldn't find any "
                    "movement goal in them. Try describing where the "
                    "robot should go."
                ),
            ) from None

        try:
            result = simulate(
                level["layout"],
                position,
                door_open,
                enemies,
                plan.actions,
            )
        except PlannerError as exc:
            raise HTTPException(
                status_code=500,
                detail=str(exc),
            ) from None

        # Truncation cuts, applied together: moves past a lethal step
        # can never execute, so they are omitted entirely (the lethal
        # step itself stays in the plan, and its warning discloses the
        # cutoff). Bounded overruns past the requested count are still
        # recorded as rejected, never silent.
        if result.died_at is not None:
            laser_keep = result.died_at + 1
        else:
            laser_keep = None

        if not exit_objective and required:
            bound_keep = max(0, len(required) - len(actions))
        else:
            bound_keep = None

        keep = len(result.approved)

        if laser_keep is not None:
            keep = min(keep, laser_keep)

        if bound_keep is not None:
            keep = min(keep, bound_keep)

        for offset in range(keep, len(result.approved)):
            if laser_keep is not None and offset >= laser_keep:
                continue

            rejected.append(
                RejectedAction(
                    index=consumed + offset,
                    reason=(
                        f"Beyond the {len(required)} requested "
                        "moves; excluded from the plan."
                    ),
                )
            )

        approved = result.approved[:keep]
        approved_cost = sum(result.costs[:keep])
        died = result.died_at is not None and keep > result.died_at

        actions.extend(approved)
        assert len(actions) <= MAX_TOTAL_ACTIONS
        total_cost += approved_cost
        reasonings.append(
            f"Leg {leg}: {len(result.approved)} of "
            f"{len(plan.actions)} proposed moves approved."
        )

        for item in result.rejected:
            rejected.append(
                RejectedAction(
                    index=item.index + consumed,
                    reason=item.reason,
                )
            )
        consumed += len(plan.actions)

        if not result.approved:
            logger.warning(
                "plan request stalled: level=%d leg=%d",
                request.level_id,
                leg,
            )
            raise HTTPException(
                status_code=502,
                detail=(
                    "Mission planning failed: the model could not "
                    "extend the route. Try rephrasing your mission."
                ),
            ) from None

        if died:
            # Lethal step kept: stop chaining from a dead position.
            # Execution resolves the death; the warning discloses it.
            reasonings.append(
                f"Warning: step {len(actions)} enters a lethal laser "
                "tile; the robot will be destroyed there."
            )
            break

        if not exit_objective and len(actions) >= len(required):
            # Bounded mission fulfilled: stop chaining instead of
            # inventing an onward route. Conformance follows.
            break

        position = {"x": result.end_x, "z": result.end_z}
        door_open = result.doors_open

        if (position["x"], position["z"]) == exit_pos:
            break

        if (position["x"], position["z"]) in seen:
            logger.warning(
                "plan request repeating: level=%d leg=%d pos=(%d, %d)",
                request.level_id,
                leg,
                position["x"],
                position["z"],
            )
            raise HTTPException(
                status_code=502,
                detail=(
                    "Mission planning failed: the plan started "
                    "repeating itself without reaching the exit. "
                    "Try rephrasing your mission."
                ),
            ) from None
        seen.add((position["x"], position["z"]))
    else:
        logger.warning(
            "plan request segment budget exhausted: level=%d",
            request.level_id,
        )
        raise HTTPException(
            status_code=502,
            detail=(
                "Mission planning failed: no complete route found "
                "within the planning budget. Try a shorter mission."
            ),
        ) from None

    # Stage B — plan conformance: the executed plan must match the
    # validated contract, not merely reach somewhere legally.
    got = [action.direction for action in actions]

    if required and died:
        # Executed moves must match the contract up to the lethal step.
        if got != required[: len(got)]:
            logger.warning(
                "plan request deviated before lethal step: level=%d",
                request.level_id,
            )
            raise HTTPException(
                status_code=502,
                detail=(
                    "Mission planning failed: the plan didn't follow "
                    "your requested moves. Try regenerating or "
                    "rephrasing."
                ),
            ) from None
    elif required:
        if exit_objective:
            if got[: len(required)] != required:
                logger.warning(
                    "plan request ignored starting moves: level=%d",
                    request.level_id,
                )
                raise HTTPException(
                    status_code=502,
                    detail=(
                        "Mission planning failed: the plan didn't follow "
                        "your requested starting moves. Try regenerating "
                        "or rephrasing."
                    ),
                ) from None
        elif got != required:
            logger.warning(
                "plan request deviated from requested moves: level=%d",
                request.level_id,
            )
            raise HTTPException(
                status_code=502,
                detail=(
                    "Mission planning failed: the plan didn't follow "
                    "your requested moves exactly. Try regenerating or "
                    "rephrasing."
                ),
            ) from None

    if validation.banned_directions:
        for direction in got:
            if direction in validation.banned_directions:
                logger.warning(
                    "plan request violated ban: level=%d direction=%s",
                    request.level_id,
                    direction,
                )
                raise HTTPException(
                    status_code=502,
                    detail=(
                        f"Mission planning failed: the plan used {direction} "
                        "moves though the mission asked to avoid them. Try "
                        "regenerating."
                    ),
                ) from None

    # Exit missions normally end at the exit (the loop breaks only
    # there, apart from the lethal-step break), and every other path
    # raises. The battery check mirrors frontend affordability (strict
    # total; no over-budget execution).
    if total_cost > request.battery:
        logger.warning(
            "plan request over battery: level=%d cost=%d battery=%d",
            request.level_id,
            total_cost,
            request.battery,
        )
        raise HTTPException(
            status_code=502,
            detail=(
                f"Mission planning failed: the route costs {total_cost}% "
                f"battery but only {request.battery}% is available. Try "
                "a shorter mission."
            ),
        ) from None

    return PlanResponse(
        model=meta_client.DEFAULT_MODEL,
        actions=actions,
        reasoning=" ".join(reasonings),
        rejected=rejected,
    )


def health() -> dict:
    return {
        "meta_configured": meta_client.is_configured(),
        "model": meta_client.DEFAULT_MODEL,
    }
