"""Community levels: player-made mazes, versions, attempts, leaderboards.

Levels are validated server-side (dimensions, symbols, exactly one
start/exit, and a laser-free route). Layout edits bump an immutable
version; attempts pin their version so history never shifts meaning.

Attempt metrics are verified, not trusted: the server resimulates the
submitted actions against the pinned layout and derives the outcome,
move count, battery cost, and remaining charge itself.
"""

from datetime import datetime, timezone
from typing import Annotated, Literal

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from pymongo.collection import Collection
from pymongo.errors import DuplicateKeyError

from authentication.common import db, get_current_user
from community import validation as v

router = APIRouter(prefix="/api/community", tags=["community"])

community_levels_collection: Collection = db["community_levels"]
community_attempts_collection: Collection = db["community_attempts"]

PAGE_SIZE_MAX = 20
NAME_MAX = 60
DESCRIPTION_MAX = 500
PROMPT_MAX = 500
PROMPTS_MAX = 50

SortKey = Literal["newest", "attempts", "completion"]
Metric = Literal["moves", "cost", "time"]


class LevelCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=NAME_MAX)
    description: str = Field(default="", max_length=DESCRIPTION_MAX)
    width: int = Field(ge=v.MIN_DIM, le=v.MAX_DIM)
    height: int = Field(ge=v.MIN_DIM, le=v.MAX_DIM)
    layout: list[str] = Field(min_length=v.MIN_DIM, max_length=v.MAX_DIM)
    categories: list[str] = Field(default_factory=list, max_length=5)

    @field_validator("name", "description")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()

    @field_validator("categories")
    @classmethod
    def _known_categories(cls, values: list[str]) -> list[str]:
        unknown = [c for c in values if c not in v.CATEGORIES]
        if unknown:
            raise ValueError(f"Unknown categories: {', '.join(unknown)}")
        return values


class LevelUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=NAME_MAX)
    description: str | None = Field(default=None, max_length=DESCRIPTION_MAX)
    width: int | None = Field(default=None, ge=v.MIN_DIM, le=v.MAX_DIM)
    height: int | None = Field(default=None, ge=v.MIN_DIM, le=v.MAX_DIM)
    layout: list[str] | None = Field(
        default=None, min_length=v.MIN_DIM, max_length=v.MAX_DIM
    )
    categories: list[str] | None = Field(default=None, max_length=5)


class PromptRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: str = Field(min_length=1, max_length=PROMPT_MAX)
    status: Literal["Success", "Failed"]


class AttemptSubmission(BaseModel):
    model_config = ConfigDict(extra="forbid")

    attempt_id: str = Field(min_length=1, max_length=128)
    version: int = Field(ge=1)
    algorithm: Literal["ai", "bfs", "dijkstra", "astar"]
    actions: list[str] = Field(min_length=1, max_length=v.MAX_ACTIONS)
    prompts: list[PromptRecord] = Field(
        default_factory=list, max_length=PROMPTS_MAX
    )
    exec_ms: int = Field(ge=0, le=86_400_000)
    plan_ms: int = Field(ge=0, le=86_400_000)
    plan_count: int = Field(ge=0, le=1000)


class AttemptResult(BaseModel):
    attempt_id: str
    duplicate: bool
    outcome: str
    moves: int
    cost: int
    remaining: int


class LevelCard(BaseModel):
    public_id: str
    name: str
    description: str
    creator_username: str
    width: int
    height: int
    version: int
    status: str = "published"
    categories: list[str]
    has_lasers: bool
    has_weighted: bool
    attempts: int
    completions: int
    completion_rate: float
    created_at: datetime
    best: dict | None


class LevelCardPage(BaseModel):
    page: int
    page_size: int
    total_levels: int
    total_pages: int
    levels: list[LevelCard]


class CommunityLevel(BaseModel):
    public_id: str
    name: str
    description: str
    creator_username: str
    width: int
    height: int
    layout: list[str]
    categories: list[str]
    version: int
    status: str
    created_at: datetime
    updated_at: datetime
    attempts: int
    completions: int


class LeaderboardRow(BaseModel):
    rank: int
    username: str
    algorithm: str
    moves: int
    cost: int
    remaining: int
    exec_ms: int
    submitted_at: datetime


class LeaderboardData(BaseModel):
    public_id: str
    version: str
    metric: str
    page: int
    page_size: int
    total_players: int
    total_pages: int
    entries: list[LeaderboardRow]


class AttemptRecord(BaseModel):
    attempt_id: str
    version: int
    algorithm: str
    outcome: str
    moves: int
    cost: int
    remaining: int
    exec_ms: int
    prompts: list[PromptRecord]
    submitted_at: datetime


def ensure_community_indexes() -> None:
    """Unique public ids and idempotent attempt submissions."""
    community_levels_collection.create_index(
        "public_id", unique=True, name="unique_public_id"
    )
    community_attempts_collection.create_index(
        [("user_id", 1), ("attempt_id", 1)],
        unique=True,
        name="unique_user_attempt",
    )
    community_attempts_collection.create_index(
        [("level_id", 1)], name="by_community_level"
    )


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _public_or_404(public_id: str) -> dict:
    level = community_levels_collection.find_one({"public_id": public_id})

    if level is None or level.get("status") == "deleted":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Community level not found.",
        )

    return level


def _layout_for_version(level: dict, version: int) -> dict:
    if version == level.get("version"):
        return {
            "width": level["width"],
            "height": level["height"],
            "layout": level["layout"],
        }

    for snapshot in level.get("history", []):
        if snapshot.get("version") == version:
            return snapshot

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Version {version} does not exist for this level.",
    )


def _check_solvable(width, height, layout) -> None:
    errors, meta = v.validate_layout(width, height, layout)

    if errors:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="; ".join(errors),
        )

    assert meta is not None
    route = v.find_safe_route(layout, meta["start"], meta["exit"])

    if route is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No laser-free route exists from start to exit.",
        )


def _best_for_level(public_id: str) -> dict | None:
    rows = [
        doc
        for doc in community_attempts_collection.find(
            {"level_id": public_id, "outcome": "completed"}
        )
    ]

    if not rows:
        return None

    best = min(rows, key=lambda r: (r["moves"], r["cost"], r["exec_ms"]))

    return {
        "username": best["username"],
        "moves": best["moves"],
        "cost": best["cost"],
    }


def _card(level: dict) -> LevelCard:
    stats = level.get("stats", {})
    attempts = stats.get("attempts", 0)
    completions = stats.get("completions", 0)
    errors, meta = v.validate_layout(
        level["width"], level["height"], level["layout"]
    )

    return LevelCard(
        public_id=level["public_id"],
        name=level["name"],
        description=level.get("description", ""),
        creator_username=level.get("creator_username", "?"),
        width=level["width"],
        height=level["height"],
        version=level.get("version", 1),
        status=level.get("status", "published"),
        categories=level.get("categories", []),
        has_lasers=bool(meta and meta["has_lasers"]) if not errors else False,
        has_weighted=bool(meta and meta["has_weighted"])
        if not errors
        else False,
        attempts=attempts,
        completions=completions,
        completion_rate=(completions / attempts) if attempts else 0.0,
        created_at=level["created_at"],
        best=_best_for_level(level["public_id"]),
    )


@router.post("/levels", response_model=CommunityLevel)
def create_level(
    payload: LevelCreate,
    user: Annotated[dict, Depends(get_current_user)],
) -> CommunityLevel:
    """Validate and publish a new community level at version 1."""
    ensure_community_indexes()

    if not payload.name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Name must not be blank.",
        )

    _check_solvable(payload.width, payload.height, payload.layout)
    now = _now()
    public_id = str(ObjectId())

    community_levels_collection.insert_one(
        {
            "public_id": public_id,
            "creator_id": user["id"],
            "creator_username": user["username"],
            "name": payload.name,
            "description": payload.description,
            "width": payload.width,
            "height": payload.height,
            "layout": list(payload.layout),
            "categories": list(payload.categories),
            "version": 1,
            "history": [],
            "status": "published",
            "created_at": now,
            "updated_at": now,
            "stats": {"attempts": 0, "completions": 0},
        }
    )

    return _full_view(public_id)


def _full_view(public_id: str) -> CommunityLevel:
    level = _public_or_404(public_id)
    stats = level.get("stats", {})

    return CommunityLevel(
        public_id=level["public_id"],
        name=level["name"],
        description=level.get("description", ""),
        creator_username=level.get("creator_username", "?"),
        width=level["width"],
        height=level["height"],
        layout=level["layout"],
        categories=level.get("categories", []),
        version=level.get("version", 1),
        status=level.get("status", "published"),
        created_at=level["created_at"],
        updated_at=level["updated_at"],
        attempts=stats.get("attempts", 0),
        completions=stats.get("completions", 0),
    )


@router.get("/levels", response_model=LevelCardPage)
def list_levels(
    sort: Annotated[SortKey, Query()] = "newest",
    category: Annotated[str | None, Query()] = None,
    q: Annotated[str | None, Query(max_length=60)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=PAGE_SIZE_MAX)] = 10,
) -> LevelCardPage:
    """Browse published community levels with cards and pagination."""
    needle = (q or "").strip().lower()
    docs = [
        doc
        for doc in community_levels_collection.find({"status": "published"})
        if category is None or category in doc.get("categories", [])
        if not needle or needle in doc.get("name", "").lower()
    ]
    cards = [_card(doc) for doc in docs]

    if sort == "newest":
        cards.sort(key=lambda c: c.created_at, reverse=True)
    elif sort == "attempts":
        cards.sort(key=lambda c: (c.attempts, c.created_at), reverse=True)
    else:
        cards.sort(
            key=lambda c: (c.completion_rate, c.attempts, c.created_at),
            reverse=True,
        )

    total_pages = max(1, -(-len(cards) // page_size))
    safe_page = min(page, total_pages)
    start = (safe_page - 1) * page_size

    return LevelCardPage(
        page=safe_page,
        page_size=page_size,
        total_levels=len(cards),
        total_pages=total_pages,
        levels=cards[start : start + page_size],
    )


@router.get("/levels/mine", response_model=list[LevelCard])
def list_my_levels(
    user: Annotated[dict, Depends(get_current_user)],
) -> list[LevelCard]:
    """Own levels, newest first, whatever their status — so creators
    can find unpublished levels to edit, test, or republish."""
    docs = [
        doc
        for doc in community_levels_collection.find(
            {"creator_id": user["id"]}
        )
        if doc.get("status") != "deleted"
    ]
    cards = [_card(doc) for doc in docs]
    cards.sort(key=lambda c: c.created_at, reverse=True)
    return cards


@router.get("/levels/{public_id}", response_model=CommunityLevel)
def read_level(public_id: str) -> CommunityLevel:
    """Fetch one level with its current-version layout."""
    level = _public_or_404(public_id)

    if level.get("status") != "published":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Community level not found.",
        )

    return _full_view(public_id)


@router.get(
    "/levels/{public_id}/editable", response_model=CommunityLevel
)
def read_editable_level(
    public_id: str,
    user: Annotated[dict, Depends(get_current_user)],
) -> CommunityLevel:
    """Owner view for editing and testing, whatever the status."""
    _owned_level(public_id, user)

    return _full_view(public_id)


def _owned_level(public_id: str, user: dict) -> dict:
    level = _public_or_404(public_id)

    if level.get("creator_id") != user["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the creator can change this level.",
        )

    return level


@router.patch("/levels/{public_id}", response_model=CommunityLevel)
def update_level(
    public_id: str,
    payload: LevelUpdate,
    user: Annotated[dict, Depends(get_current_user)],
) -> CommunityLevel:
    """Edit own level. Layout changes bump an immutable version."""
    level = _owned_level(public_id, user)
    changes: dict = {}
    data = payload.model_dump(exclude_unset=True)

    if data.get("name") is not None:
        name = data["name"].strip()
        if not name:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Name must not be blank.",
            )
        changes["name"] = name

    if data.get("description") is not None:
        changes["description"] = data["description"].strip()

    if data.get("categories") is not None:
        unknown = [c for c in data["categories"] if c not in v.CATEGORIES]
        if unknown:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Unknown categories: {', '.join(unknown)}",
            )
        changes["categories"] = list(data["categories"])

    layout_fields = {"width", "height", "layout"} & set(data)
    new_version = level.get("version", 1)

    if layout_fields:
        width = data.get("width", level["width"])
        height = data.get("height", level["height"])
        layout = data.get("layout", level["layout"])
        _check_solvable(width, height, layout)

        if (
            width != level["width"]
            or height != level["height"]
            or list(layout) != list(level["layout"])
        ):
            new_version += 1
            snapshot = {
                "version": level.get("version", 1),
                "width": level["width"],
                "height": level["height"],
                "layout": list(level["layout"]),
                "updated_at": _now(),
            }
            community_levels_collection.update_one(
                {"public_id": public_id}, {"$push": {"history": snapshot}}
            )
            changes["width"] = width
            changes["height"] = height
            changes["layout"] = list(layout)
            changes["version"] = new_version

    changes["updated_at"] = _now()
    community_levels_collection.update_one(
        {"public_id": public_id}, {"$set": changes}
    )

    return _full_view(public_id)


@router.post("/levels/{public_id}/publish", response_model=CommunityLevel)
def publish_level(
    public_id: str,
    user: Annotated[dict, Depends(get_current_user)],
) -> CommunityLevel:
    """Republish own unpublished level."""
    _owned_level(public_id, user)
    community_levels_collection.update_one(
        {"public_id": public_id},
        {"$set": {"status": "published", "updated_at": _now()}},
    )

    return _full_view(public_id)


@router.post("/levels/{public_id}/unpublish", response_model=CommunityLevel)
def unpublish_level(
    public_id: str,
    user: Annotated[dict, Depends(get_current_user)],
) -> CommunityLevel:
    """Unpublish own level; attempts and history are preserved."""
    level = _owned_level(public_id, user)
    community_levels_collection.update_one(
        {"public_id": public_id},
        {"$set": {"status": "unpublished", "updated_at": _now()}},
    )

    return _full_view(public_id)


@router.delete("/levels/{public_id}", response_model=CommunityLevel)
def delete_level(
    public_id: str,
    user: Annotated[dict, Depends(get_current_user)],
) -> CommunityLevel:
    """Soft-delete own level. Attempts stay for history."""
    _owned_level(public_id, user)
    community_levels_collection.update_one(
        {"public_id": public_id},
        {"$set": {"status": "deleted", "updated_at": _now()}},
    )
    level = community_levels_collection.find_one({"public_id": public_id})
    assert level is not None
    stats = level.get("stats", {})

    return CommunityLevel(
        public_id=level["public_id"],
        name=level["name"],
        description=level.get("description", ""),
        creator_username=level.get("creator_username", "?"),
        width=level["width"],
        height=level["height"],
        layout=level["layout"],
        categories=level.get("categories", []),
        version=level.get("version", 1),
        status="deleted",
        created_at=level["created_at"],
        updated_at=level["updated_at"],
        attempts=stats.get("attempts", 0),
        completions=stats.get("completions", 0),
    )


@router.post(
    "/levels/{public_id}/attempts", response_model=AttemptResult
)
def submit_attempt(
    public_id: str,
    payload: AttemptSubmission,
    user: Annotated[dict, Depends(get_current_user)],
) -> AttemptResult:
    """Verify a playthrough by resimulation; record it idempotently."""
    ensure_community_indexes()
    level = _public_or_404(public_id)

    is_owner = level.get("creator_id") == user["id"]

    if level.get("status") != "published" and not is_owner:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This level is not currently published.",
        )

    snapshot = _layout_for_version(level, payload.version)
    errors, meta = v.validate_layout(
        snapshot["width"], snapshot["height"], snapshot["layout"]
    )

    if errors or meta is None:  # pragma: no cover - stored data is valid
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Stored level data is invalid.",
        )

    result = v.resimulate(
        snapshot["layout"], meta["start"], meta["exit"], payload.actions
    )

    if not result["ok"]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=result["error"],
        )

    outcome = "completed" if result["reached"] else "failed"
    document = {
        "attempt_id": payload.attempt_id,
        "user_id": user["id"],
        "username": user["username"],
        "level_id": public_id,
        "version": payload.version,
        "algorithm": payload.algorithm,
        "actions": list(payload.actions),
        "prompts": [p.model_dump() for p in payload.prompts],
        "exec_ms": payload.exec_ms,
        "plan_ms": payload.plan_ms,
        "plan_count": payload.plan_count,
        "outcome": outcome,
        "moves": result["moves"],
        "cost": result["cost"],
        "remaining": result["remaining"],
        "submitted_at": _now(),
    }

    try:
        community_attempts_collection.insert_one(document)
    except DuplicateKeyError:
        existing = community_attempts_collection.find_one(
            {"user_id": user["id"], "attempt_id": payload.attempt_id}
        )
        assert existing is not None

        return AttemptResult(
            attempt_id=payload.attempt_id,
            duplicate=True,
            outcome=existing["outcome"],
            moves=existing["moves"],
            cost=existing["cost"],
            remaining=existing["remaining"],
        )

    community_levels_collection.update_one(
        {"public_id": public_id},
        {
            "$inc": {
                "stats.attempts": 1,
                "stats.completions": 1 if outcome == "completed" else 0,
            }
        },
    )

    return AttemptResult(
        attempt_id=payload.attempt_id,
        duplicate=False,
        outcome=outcome,
        moves=result["moves"],
        cost=result["cost"],
        remaining=result["remaining"],
    )


def _metric_key(metric: str, row: dict) -> tuple:
    if metric == "cost":
        return (row["cost"], row["moves"], row["exec_ms"])
    if metric == "time":
        return (row["exec_ms"], row["moves"], row["cost"])
    return (row["moves"], row["cost"], row["exec_ms"])


@router.get(
    "/levels/{public_id}/leaderboard", response_model=LeaderboardData
)
def read_leaderboard(
    public_id: str,
    metric: Annotated[Metric, Query()] = "moves",
    version: Annotated[str, Query()] = "all",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=PAGE_SIZE_MAX)] = 10,
) -> LeaderboardData:
    """Best verified completion per player. Public, no private data."""
    _public_or_404(public_id)

    try:
        pinned = int(version) if version != "all" else None
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Version must be 'all' or a number.",
        ) from None

    rows = [
        doc
        for doc in community_attempts_collection.find(
            {"level_id": public_id, "outcome": "completed"}
        )
        if pinned is None or doc.get("version") == pinned
    ]
    best: dict[str, dict] = {}

    for row in rows:
        current = best.get(row["user_id"])
        candidate = (_metric_key(metric, row), row["submitted_at"])

        if current is None or candidate < (
            _metric_key(metric, current),
            current["submitted_at"],
        ):
            best[row["user_id"]] = row

    ranked = sorted(
        best.values(),
        key=lambda r: (_metric_key(metric, r), r["submitted_at"]),
    )
    total_pages = max(1, -(-len(ranked) // page_size))
    safe_page = min(page, total_pages)
    start = (safe_page - 1) * page_size
    entries = [
        LeaderboardRow(
            rank=start + index + 1,
            username=row["username"],
            algorithm=row["algorithm"],
            moves=row["moves"],
            cost=row["cost"],
            remaining=row["remaining"],
            exec_ms=row["exec_ms"],
            submitted_at=row["submitted_at"],
        )
        for index, row in enumerate(ranked[start : start + page_size])
    ]

    return LeaderboardData(
        public_id=public_id,
        version=version,
        metric=metric,
        page=safe_page,
        page_size=page_size,
        total_players=len(ranked),
        total_pages=total_pages,
        entries=entries,
    )


@router.get(
    "/levels/{public_id}/attempts/me", response_model=list[AttemptRecord]
)
def read_my_attempts(
    public_id: str,
    user: Annotated[dict, Depends(get_current_user)],
) -> list[AttemptRecord]:
    """Own attempt history for one level, newest first. Owner only."""
    _public_or_404(public_id)
    rows = [
        doc
        for doc in community_attempts_collection.find(
            {"level_id": public_id, "user_id": user["id"]}
        )
    ]
    rows.sort(key=lambda r: r["submitted_at"], reverse=True)

    return [
        AttemptRecord(
            attempt_id=row["attempt_id"],
            version=row["version"],
            algorithm=row["algorithm"],
            outcome=row["outcome"],
            moves=row["moves"],
            cost=row["cost"],
            remaining=row["remaining"],
            exec_ms=row["exec_ms"],
            prompts=row.get("prompts", []),
            submitted_at=row["submitted_at"],
        )
        for row in rows
    ]
