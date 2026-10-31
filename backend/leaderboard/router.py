"""Story Mode leaderboard: verified-completion run submissions and rankings.

Submissions are gated on the server: the level must be a Story level the
session user has actually completed (their server-side completed_levels).
Metrics themselves are player-reported from the authoritative client
execution, so the board is completion-gated, not fully cheat-proof.

Rankings mirror the frontend comparators in src/lib/leaderboard.ts:
one best run per player, deterministic tie-breakers, bounded pages.
"""

from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from pymongo.collection import Collection
from pymongo.errors import DuplicateKeyError

from authentication.common import db, get_current_user
from game_logic.levels import levels_collection

router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])

story_runs_collection: Collection = db["story_runs"]

Category = Literal["battery", "moves", "planner"]

PAGE_SIZE_MAX = 50

# Sort keys per category: (field, direction). Final _id key keeps
# MongoDB's order total when every metric ties.
SORT_SPECS: dict[str, list[tuple[str, int]]] = {
    "battery": [
        ("remaining", -1),
        ("moves", 1),
        ("exec_ms", 1),
        ("completed_at", 1),
        ("_id", 1),
    ],
    "moves": [
        ("moves", 1),
        ("remaining", -1),
        ("exec_ms", 1),
        ("completed_at", 1),
        ("_id", 1),
    ],
    "planner": [
        ("score", 1),
        ("cost_ratio", 1),
        ("moves", 1),
        ("exec_ms", 1),
        ("completed_at", 1),
        ("_id", 1),
    ],
}


class StoryRunSubmission(BaseModel):
    model_config = ConfigDict(extra="forbid")

    run_id: str = Field(min_length=1, max_length=128)
    level_id: int = Field(ge=1)
    moves: int = Field(ge=1, le=100000)
    remaining: int = Field(ge=0, le=100)
    exec_ms: int = Field(ge=0, le=86_400_000)
    plan_ms: int = Field(ge=0, le=86_400_000)
    plan_count: int = Field(ge=0, le=1000)
    cost_ratio: float = Field(ge=0, le=1000)
    move_ratio: float = Field(ge=0, le=1000)
    completed_at: datetime


class SubmissionResponse(BaseModel):
    run_id: str
    duplicate: bool


class LeaderboardEntry(BaseModel):
    rank: int
    username: str
    moves: int
    remaining: int
    exec_ms: int
    cost_ratio: float
    move_ratio: float
    score: float
    completed_at: datetime


class LeaderboardPage(BaseModel):
    level_id: int
    category: str
    page: int
    page_size: int
    total_players: int
    total_pages: int
    entries: list[LeaderboardEntry]


def ensure_leaderboard_indexes() -> None:
    """Deduplicate retries and serve per-level rankings."""
    story_runs_collection.create_index(
        [("user_id", 1), ("run_id", 1)],
        unique=True,
        name="unique_user_run",
    )
    story_runs_collection.create_index(
        [("level_id", 1)],
        name="by_level",
    )


def _story_level_or_404(level_id: int) -> dict:
    level = levels_collection.find_one({"id": level_id})

    if level is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Level {level_id} not found.",
        )

    if level.get("type") != "Story":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Leaderboards cover Story levels only.",
        )

    return level


def _prefix_keys(
    spec: list[tuple[str, int]], prefix: str
) -> dict[str, int]:
    return {f"{prefix}{field}": direction for field, direction in spec}


@router.post("/runs", response_model=SubmissionResponse)
def submit_run(
    payload: StoryRunSubmission,
    user: Annotated[dict, Depends(get_current_user)],
) -> SubmissionResponse:
    """Record one completed Story run. Idempotent per (user, run_id)."""
    ensure_leaderboard_indexes()
    _story_level_or_404(payload.level_id)

    completed = user.get("completed_levels") or []

    if payload.level_id not in completed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Complete the level before submitting a run.",
        )

    document = {
        "user_id": user["id"],
        "username": user["username"],
        "run_id": payload.run_id,
        "level_id": payload.level_id,
        "moves": payload.moves,
        "remaining": payload.remaining,
        "exec_ms": payload.exec_ms,
        "plan_ms": payload.plan_ms,
        "plan_count": payload.plan_count,
        "cost_ratio": payload.cost_ratio,
        "move_ratio": payload.move_ratio,
        "completed_at": payload.completed_at,
    }

    try:
        story_runs_collection.insert_one(document)
    except DuplicateKeyError:
        return SubmissionResponse(run_id=payload.run_id, duplicate=True)

    return SubmissionResponse(run_id=payload.run_id, duplicate=False)


def _clean_entry(raw: object, rank: int) -> LeaderboardEntry | None:
    """Coerce one aggregated best-run doc; skip malformed records."""
    if not isinstance(raw, dict):
        return None

    try:
        username = raw["username"]
        moves = raw["moves"]
        remaining = raw["remaining"]
        exec_ms = raw["exec_ms"]
        cost_ratio = raw["cost_ratio"]
        move_ratio = raw["move_ratio"]
        completed_at = raw["completed_at"]

        if not isinstance(username, str) or not username:
            return None
        if not isinstance(completed_at, datetime):
            return None
        for value in (moves, remaining, exec_ms):
            if type(value) is not int or isinstance(value, bool):
                return None
        for value in (cost_ratio, move_ratio):
            if not isinstance(value, (int, float)):
                return None

        return LeaderboardEntry(
            rank=rank,
            username=username,
            moves=moves,
            remaining=remaining,
            exec_ms=exec_ms,
            cost_ratio=float(cost_ratio),
            move_ratio=float(move_ratio),
            score=float(cost_ratio) + float(move_ratio),
            completed_at=completed_at,
        )
    except (KeyError, ValueError):
        return None


@router.get("/{level_id}", response_model=LeaderboardPage)
def read_leaderboard(
    level_id: int,
    category: Annotated[Category, Query()] = "battery",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=PAGE_SIZE_MAX)] = 20,
) -> LeaderboardPage:
    """Best run per player for one Story level and category.

    Public: entries carry usernames and run metrics only, never emails
    or account details.
    """
    _story_level_or_404(level_id)
    spec = SORT_SPECS[category]

    pipeline: list[dict] = [{"$match": {"level_id": level_id}}]

    if category == "planner":
        pipeline.append(
            {
                "$addFields": {
                    "score": {"$add": ["$cost_ratio", "$move_ratio"]}
                }
            }
        )

    # Rank every run, keep each player's best, re-rank the bests.
    pipeline.extend(
        [
            {"$sort": dict(spec)},
            {"$group": {"_id": "$user_id", "best": {"$first": "$$ROOT"}}},
            {"$sort": _prefix_keys(spec, "best.")},
            {
                "$facet": {
                    "total": [{"$count": "count"}],
                    "entries": [
                        {"$skip": (page - 1) * page_size},
                        {"$limit": page_size},
                    ],
                }
            },
        ]
    )

    result = list(story_runs_collection.aggregate(pipeline))
    facet = result[0] if result else {"total": [], "entries": []}
    total_rows = facet.get("total", [])
    total_players = (
        total_rows[0].get("count", 0) if total_rows else 0
    )
    total_pages = max(1, -(-total_players // page_size))

    # Clamp over-long pages like the frontend paginate helper.
    safe_page = min(page, total_pages)
    docs = facet.get("entries", [])

    if safe_page != page:
        skip = (safe_page - 1) * page_size
        docs = list(
            story_runs_collection.aggregate(
                pipeline[:-1]
                + [
                    {
                        "$facet": {
                            "total": [{"$count": "count"}],
                            "entries": [
                                {"$skip": skip},
                                {"$limit": page_size},
                            ],
                        }
                    }
                ]
            )
        )[0].get("entries", [])

    entries: list[LeaderboardEntry] = []

    for index, doc in enumerate(docs):
        entry = _clean_entry(
            doc.get("best", doc), (safe_page - 1) * page_size + index + 1
        )
        if entry is not None:
            entries.append(entry)

    return LeaderboardPage(
        level_id=level_id,
        category=category,
        page=safe_page,
        page_size=page_size,
        total_players=total_players,
        total_pages=total_pages,
        entries=entries,
    )
