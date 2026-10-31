
"""Authenticated user profile and progress endpoints."""

from typing import Annotated, Literal

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from pymongo import ReturnDocument

from authentication.common import get_current_user, users_collection
from game_logic.levels import levels_collection

router = APIRouter(prefix="/api/users", tags=["users"])

PROMPT_MAX_CHARS = 500
PROMPT_HISTORY_LIMIT = 50
PROMPT_STATUSES = ("Success", "Failed")


class PromptEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: str = Field(min_length=1, max_length=PROMPT_MAX_CHARS)
    status: Literal["Success", "Failed"]

    @field_validator("prompt")
    @classmethod
    def _strip_prompt(cls, value: str) -> str:
        stripped = value.strip()

        if not stripped:
            raise ValueError("Prompt must not be blank.")

        return stripped


class UserProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    username: str
    email: EmailStr
    completed_levels: list[int] = Field(default_factory=list)
    prompt_history: list[PromptEntry] = Field(default_factory=list)


class LevelCompletion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    level_id: int = Field(ge=1)


class CompletionResponse(BaseModel):
    completed_levels: list[int]


def _sanitized_history(raw: object) -> list[dict]:
    """Keep only well-shaped entries so legacy documents cannot break
    the response contract."""
    if not isinstance(raw, list):
        return []

    clean: list[dict] = []

    for entry in raw:
        if (
            isinstance(entry, dict)
            and isinstance(entry.get("prompt"), str)
            and entry.get("status") in PROMPT_STATUSES
        ):
            clean.append(
                {
                    "prompt": entry["prompt"][:PROMPT_MAX_CHARS],
                    "status": entry["status"],
                }
            )

    return clean


def _sanitized_levels(raw: object) -> list[int]:
    if not isinstance(raw, list):
        return []

    return sorted(
        {entry for entry in raw if type(entry) is int and entry >= 1}
    )


@router.get("/me", response_model=UserProfile)
def read_profile(
    user: Annotated[dict, Depends(get_current_user)],
) -> UserProfile:
    return UserProfile(
        id=user["id"],
        username=user["username"],
        email=user["email"],
        completed_levels=_sanitized_levels(
            user.get("completed_levels")
        ),
        prompt_history=_sanitized_history(user.get("prompt_history")),
    )


@router.post(
    "/me/completed-levels",
    response_model=CompletionResponse,
)
def record_completion(
    payload: LevelCompletion,
    user: Annotated[dict, Depends(get_current_user)],
) -> CompletionResponse:
    """Atomically record a level completion ($addToSet: no duplicates)."""
    known = levels_collection.find_one(
        {"id": payload.level_id},
        {"_id": 1},
    )

    if known is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Level {payload.level_id} not found.",
        )

    updated = users_collection.find_one_and_update(
        {"_id": ObjectId(user["id"])},
        {"$addToSet": {"completed_levels": payload.level_id}},
        projection={"completed_levels": 1},
        return_document=ReturnDocument.AFTER,
    )

    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User no longer exists.",
        )

    return CompletionResponse(
        completed_levels=_sanitized_levels(
            updated.get("completed_levels")
        ),
    )


@router.post(
    "/me/prompt-history",
    response_model=PromptEntry,
    status_code=status.HTTP_201_CREATED,
)
def record_prompt(
    payload: PromptEntry,
    user: Annotated[dict, Depends(get_current_user)],
) -> PromptEntry:
    """Atomically append a prompt attempt, keeping the newest entries."""
    result = users_collection.update_one(
        {"_id": ObjectId(user["id"])},
        {
            "$push": {
                "prompt_history": {
                    "$each": [payload.model_dump()],
                    "$slice": -PROMPT_HISTORY_LIMIT,
                }
            }
        },
    )

    if result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User no longer exists.",
        )

    return payload
