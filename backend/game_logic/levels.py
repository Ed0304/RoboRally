
"""Game level retrieval endpoints."""

from fastapi import APIRouter, HTTPException
from pymongo.collection import Collection

from authentication.common import db

router = APIRouter(prefix="/api/levels", tags=["game levels"])

levels_collection: Collection = db["levels"]


@router.get("/{level_id}")
def get_level(level_id: int) -> dict:
    """Retrieve a game level by its numeric ID."""

    if level_id < 1:
        raise HTTPException(
            status_code=400,
            detail="Level ID must be a positive integer.",
        )

    level = levels_collection.find_one(
        {"id": level_id},
        {"_id": 0},
    )

    if level is None:
        raise HTTPException(
            status_code=404,
            detail=f"Level {level_id} not found.",
        )

    return level
