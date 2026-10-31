
"""Mission planning orchestration: prompt, model call, validation."""

from fastapi import HTTPException
from pydantic import ValidationError

from ai_engine import meta_client
from ai_engine.meta_client import PlannerError
from ai_engine.rules import simulate
from ai_engine.schemas import (
    ActionPlan,
    PlanRequest,
    PlanResponse,
    RejectedAction,
)
from game_logic.levels import levels_collection

SYSTEM_PROMPT = """You command a robot in a grid factory maze. Convert the player's mission into a short, safe move plan.

Legend: # wall (blocked), . floor, S start, E exit/goal, L laser (lethal, never step on), C collectible (walkable), R enemy start (avoid enemies), D door (blocked unless open), ! trigger (step on it to open doors).
Moves: north (x, z-1), south (x, z+1), east (x+1, z), west (x-1, z). One tile per move. The only action is "move" with one of these directions.
Rules: never plan moves into walls or lasers; never pass a closed door without stepping on its trigger first; avoid tiles occupied by patrolling enemies; keep plans short (at most 24 moves). Prefer reaching the exit tile (E).
Reply with structured output only: the move list plus one or two sentences of reasoning."""


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
) -> str:
    layout = "\n".join(level["layout"])
    enemies = ", ".join(
        f"({enemy.x}, {enemy.z})" for enemy in request.enemies
    ) or "none reported"

    return (
        f"Mission: {request.mission.strip()}\n"
        f"Level {level['id']}: {level['name']} "
        f"(goal: {level.get('goal', 'reach the exit')}).\n"
        f"Robot at ({request.robot.x}, {request.robot.z}) "
        f"facing {request.robot.direction}. "
        f"Door open: {request.door_open}. "
        f"Enemies at: {enemies}.\n"
        f"Layout:\n{layout}"
    )


def plan_mission(request: PlanRequest) -> PlanResponse:
    level = load_level(request.level_id)

    try:
        raw = meta_client.complete_plan(
            SYSTEM_PROMPT,
            build_user_prompt(request, level),
            model=meta_client.DEFAULT_MODEL,
        )
    except PlannerError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail=str(exc),
        ) from None

    try:
        plan = ActionPlan.model_validate(raw)
    except ValidationError:
        raise HTTPException(
            status_code=502,
            detail=(
                "Mission planning failed: the model returned an invalid "
                "plan."
            ),
        ) from None

    try:
        approved, rejected = simulate(
            level["layout"],
            {"x": request.robot.x, "z": request.robot.z},
            request.door_open,
            [{"x": e.x, "z": e.z} for e in request.enemies],
            plan.actions,
        )
    except PlannerError as exc:
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from None

    return PlanResponse(
        model=meta_client.DEFAULT_MODEL,
        actions=approved,
        reasoning=plan.reasoning,
        rejected=rejected,
    )


def health() -> dict:
    return {
        "meta_configured": meta_client.is_configured(),
        "model": meta_client.DEFAULT_MODEL,
    }
