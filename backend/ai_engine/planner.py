
"""Mission planning orchestration: prompt, model call, validation."""

import logging

from fastapi import HTTPException
from pydantic import ValidationError

from ai_engine import meta_client
from ai_engine.meta_client import PlannerError
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
# most SEGMENT_ACTIONS moves, chained server-side. Bounds: at most
# MAX_SEGMENTS model calls and SEGMENT_ACTIONS * MAX_SEGMENTS total
# moves per request, so API usage stays predictable. All shipped levels
# need at most 14 moves, comfortably inside the budget.
SEGMENT_ACTIONS = 12
MAX_SEGMENTS = 3

SYSTEM_PROMPT = """You command a robot in a grid factory maze. Plan the next leg of the mission as a short, safe move plan.

Legend: # wall (blocked), . floor, S start, E exit/goal, L laser (lethal, never step on), C collectible (walkable), R enemy start (avoid enemies), D door (blocked unless open), ! trigger (step on it to open doors).
Moves: north (x, z-1), south (x, z+1), east (x+1, z), west (x-1, z). One tile per move. The only action is "move" with one of these directions.
Rules: return the SHORTEST safe route toward the exit, at most 12 moves; never plan moves into walls or lasers; never pass a closed door without stepping on its trigger first; avoid tiles occupied by patrolling enemies.
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
) -> str:
    layout = "\n".join(level["layout"])
    enemies = ", ".join(
        f"({enemy.x}, {enemy.z})" for enemy in request.enemies
    ) or "none reported"

    return (
        f"Mission: {request.mission.strip()}\n"
        f"Level {level['id']}: {level['name']} "
        f"(goal: {level.get('goal', 'reach the exit')}).\n"
        f"Leg {leg}: robot at ({position['x']}, {position['z']}), "
        f"exit at ({exit_pos[0]}, {exit_pos[1]}). "
        f"Door open: {door_open}. Enemies at: {enemies}.\n"
        f"Plan at most {SEGMENT_ACTIONS} moves toward the exit.\n"
        f"Layout:\n{layout}"
    )


def _request_segment(
    request: PlanRequest,
    level: dict,
    position: dict[str, int],
    door_open: bool,
    exit_pos: tuple[int, int],
    leg: int,
) -> ActionSegment:
    logger.info(
        "plan request leg: level=%d leg=%d pos=(%d, %d) "
        "schema=segment12 effort=%s limit=%d",
        request.level_id,
        leg,
        position["x"],
        position["z"],
        meta_client.REASONING_EFFORT,
        meta_client.MAX_OUTPUT_TOKENS,
    )

    try:
        raw = meta_client.complete_plan(
            SYSTEM_PROMPT,
            build_user_prompt(
                request, level, position, door_open, exit_pos, leg
            ),
            model=meta_client.DEFAULT_MODEL,
            json_schema=meta_client.SEGMENT_JSON_SCHEMA,
        )
    except PlannerError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail=str(exc),
        ) from None

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
        raise HTTPException(
            status_code=502,
            detail=(
                "Mission planning failed: the model returned an "
                "unusable plan. Try rephrasing your mission."
            ),
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

    actions: list[Action] = []
    rejected: list[RejectedAction] = []
    reasonings: list[str] = []
    consumed = 0

    for leg in range(1, MAX_SEGMENTS + 1):
        plan = _request_segment(
            request, level, position, door_open, exit_pos, leg
        )

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

        actions.extend(result.approved)
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

        position = {"x": result.end_x, "z": result.end_z}
        door_open = result.doors_open

        if (position["x"], position["z"]) == exit_pos:
            break
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
