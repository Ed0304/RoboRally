
"""Pydantic contracts for the mission-planning API."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Direction = Literal["north", "south", "east", "west"]

MAX_ACTIONS = 24
MAX_MISSION_CHARS = 500


class RobotState(BaseModel):
    model_config = ConfigDict(extra="forbid")

    x: int
    z: int
    direction: Direction


class EnemyState(BaseModel):
    model_config = ConfigDict(extra="forbid")

    x: int
    z: int


class PlanRequest(BaseModel):
    """Minimum observation needed to plan. The level layout is always
    loaded from MongoDB; the client cannot supply geometry."""

    model_config = ConfigDict(extra="forbid")

    level_id: int = Field(ge=1)
    mission: str = Field(min_length=1, max_length=MAX_MISSION_CHARS)
    robot: RobotState
    enemies: list[EnemyState] = Field(default_factory=list)
    door_open: bool = False


class Action(BaseModel):
    """Only 'move' exists: the game engine has no explicit turn or
    interact action (blocked moves turn in place; triggers fire on step)."""

    model_config = ConfigDict(extra="forbid")

    op: Literal["move"]
    direction: Direction


class ActionPlan(BaseModel):
    """Raw model output, before rule validation."""

    model_config = ConfigDict(extra="forbid")

    actions: list[Action] = Field(min_length=1, max_length=MAX_ACTIONS)
    reasoning: str = Field(max_length=2000)


class RejectedAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    index: int
    reason: str


class PlanResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model: str
    actions: list[Action]
    reasoning: str
    rejected: list[RejectedAction] = Field(default_factory=list)
