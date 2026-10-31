"""Tests for Story Mode leaderboard submission and rankings.

MongoDB is replaced with small in-memory fakes: no live database is
touched. The aggregate fake implements just enough pipeline semantics
($match/$addFields/$sort/$group/$facet) to prove ordering, best-per-
player grouping, and pagination end to end.
"""

from datetime import datetime, timezone

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from pymongo.errors import DuplicateKeyError

from leaderboard import router as leaderboard_router
from leaderboard.router import StoryRunSubmission

USER_A = "aaaa00000000000000000001"
USER_B = "bbbb00000000000000000002"


def make_user(uid=USER_A, **overrides):
    user = {
        "id": uid,
        "username": f"op-{uid[:4]}",
        "email": f"{uid[:4]}@example.com",
        "completed_levels": [4, 5, 6],
        "prompt_history": [],
    }
    user.update(overrides)
    return user


def make_run(**overrides):
    payload = {
        "run_id": "run-1",
        "level_id": 4,
        "moves": 25,
        "remaining": 75,
        "exec_ms": 10000,
        "plan_ms": 500,
        "plan_count": 1,
        "cost_ratio": 1.0,
        "move_ratio": 1.0,
        "completed_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
    }
    payload.update(overrides)
    return StoryRunSubmission(**payload)


def _get(row, dotted):
    value = row
    for part in dotted.split("."):
        value = value[part]
    return value


class FakeStoryRuns:
    def __init__(self):
        self.docs = []
        self._seq = 0

    def create_index(self, *args, **kwargs):
        return "index"

    def insert_one(self, document):
        for doc in self.docs:
            if (
                doc["user_id"] == document["user_id"]
                and doc["run_id"] == document["run_id"]
            ):
                raise DuplicateKeyError("duplicate run")

        stored = dict(document)
        stored["_id"] = self._seq
        self._seq += 1
        self.docs.append(stored)

    def aggregate(self, pipeline):
        rows = [dict(doc) for doc in self.docs]

        for stage in pipeline:
            if "$match" in stage:
                rows = [
                    row
                    for row in rows
                    if all(
                        row.get(key) == value
                        for key, value in stage["$match"].items()
                    )
                ]
            elif "$addFields" in stage:
                for row in rows:
                    for key, expr in stage["$addFields"].items():
                        row[key] = sum(
                            row[field[1:]] for field in expr["$add"]
                        )
            elif "$sort" in stage:
                for key, direction in reversed(
                    list(stage["$sort"].items())
                ):

                    def sort_key(row, k=key):
                        try:
                            return (0, _get(row, k))
                        except KeyError:
                            # MongoDB sorts missing fields as null.
                            return (1, 0)

                    rows.sort(
                        key=sort_key,
                        reverse=(direction == -1),
                    )
            elif "$group" in stage:
                grouped = {}
                for row in rows:
                    gid = row["user_id"]
                    if gid not in grouped:
                        grouped[gid] = {"_id": gid, "best": dict(row)}
                rows = list(grouped.values())
            elif "$facet" in stage:
                entries = rows
                for sub in stage["$facet"]["entries"]:
                    if "$skip" in sub:
                        entries = entries[sub["$skip"] :]
                    if "$limit" in sub:
                        entries = entries[: sub["$limit"]]
                return [
                    {
                        "total": (
                            [{"count": len(rows)}] if rows else []
                        ),
                        "entries": entries,
                    }
                ]

        return rows


class FakeLevels:
    TYPES = {
        1: "Tutorial",
        2: "Tutorial",
        3: "Tutorial",
        4: "Story",
        5: "Story",
        6: "Story",
    }

    def find_one(self, filter, projection=None):
        level_type = self.TYPES.get(filter.get("id"))
        if level_type is None:
            return None
        return {"id": filter["id"], "type": level_type}


@pytest.fixture()
def story_runs(monkeypatch):
    collection = FakeStoryRuns()
    monkeypatch.setattr(
        leaderboard_router, "story_runs_collection", collection
    )
    monkeypatch.setattr(
        leaderboard_router, "levels_collection", FakeLevels()
    )
    return collection


def test_submit_stores_snapshot_without_secrets(story_runs):
    response = leaderboard_router.submit_run(make_run(), make_user())

    assert response.run_id == "run-1"
    assert response.duplicate is False
    assert len(story_runs.docs) == 1

    stored = story_runs.docs[0]
    assert stored["user_id"] == USER_A
    assert stored["username"] == "op-aaaa"
    assert stored["level_id"] == 4
    assert "email" not in stored
    assert "password" not in stored


def test_submit_is_idempotent_per_run(story_runs):
    first = leaderboard_router.submit_run(make_run(), make_user())
    second = leaderboard_router.submit_run(make_run(), make_user())

    assert first.duplicate is False
    assert second.duplicate is True
    assert len(story_runs.docs) == 1


def test_submit_rejects_tutorial_level(story_runs):
    with pytest.raises(HTTPException) as exc_info:
        leaderboard_router.submit_run(
            make_run(level_id=1), make_user(completed_levels=[1])
        )

    assert exc_info.value.status_code == 400


def test_submit_rejects_unknown_level(story_runs):
    with pytest.raises(HTTPException) as exc_info:
        leaderboard_router.submit_run(make_run(level_id=99), make_user())

    assert exc_info.value.status_code == 404


def test_submit_requires_server_completion(story_runs):
    with pytest.raises(HTTPException) as exc_info:
        leaderboard_router.submit_run(
            make_run(), make_user(completed_levels=[1, 2, 3])
        )

    assert exc_info.value.status_code == 403
    assert story_runs.docs == []


def test_submit_validates_ranges():
    with pytest.raises(ValidationError):
        make_run(moves=0)
    with pytest.raises(ValidationError):
        make_run(remaining=101)
    with pytest.raises(ValidationError):
        make_run(run_id="")
    with pytest.raises(ValidationError):
        make_run(cost_ratio=-1)


def seed_battery_board(story_runs):
    leaderboard_router.submit_run(
        make_run(
            run_id="a1",
            remaining=80,
            moves=20,
            exec_ms=5000,
            completed_at=datetime(2026, 1, 3, tzinfo=timezone.utc),
        ),
        make_user(),
    )
    leaderboard_router.submit_run(
        make_run(
            run_id="b1",
            remaining=80,
            moves=18,
            exec_ms=9000,
            completed_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
        ),
        make_user(uid=USER_B),
    )
    leaderboard_router.submit_run(
        make_run(
            run_id="c1",
            remaining=90,
            moves=25,
            exec_ms=1000,
            completed_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        ),
        make_user(uid="cccc00000000000000000003"),
    )


def test_battery_ranking_with_tie_breaks(story_runs):
    seed_battery_board(story_runs)

    page = leaderboard_router.read_leaderboard(4, "battery", 1, 20)

    assert page.total_players == 3
    assert [entry.username for entry in page.entries] == [
        "op-cccc",
        "op-bbbb",
        "op-aaaa",
    ]
    assert [entry.rank for entry in page.entries] == [1, 2, 3]
    # B outranks A on the moves tie-break despite a slower run.
    assert page.entries[1].moves == 18


def test_best_run_per_player(story_runs):
    seed_battery_board(story_runs)
    leaderboard_router.submit_run(
        make_run(run_id="a2", remaining=70, moves=30),
        make_user(),
    )

    page = leaderboard_router.read_leaderboard(4, "battery", 1, 20)

    assert page.total_players == 3
    assert page.entries[2].username == "op-aaaa"
    assert page.entries[2].remaining == 80


def test_moves_ranking(story_runs):
    seed_battery_board(story_runs)

    page = leaderboard_router.read_leaderboard(4, "moves", 1, 20)

    assert [entry.moves for entry in page.entries] == [18, 20, 25]


def test_planner_ranking_scores_ratios(story_runs):
    leaderboard_router.submit_run(
        make_run(
            run_id="p1",
            cost_ratio=1.0,
            move_ratio=1.5,
            moves=30,
        ),
        make_user(),
    )
    leaderboard_router.submit_run(
        make_run(
            run_id="p2",
            cost_ratio=1.25,
            move_ratio=1.25,
            moves=25,
        ),
        make_user(uid=USER_B),
    )

    page = leaderboard_router.read_leaderboard(4, "planner", 1, 20)

    assert [entry.username for entry in page.entries] == [
        "op-aaaa",
        "op-bbbb",
    ]
    assert page.entries[0].score == 2.5
    assert page.entries[1].score == 2.5


def test_pagination_and_clamping(story_runs):
    seed_battery_board(story_runs)

    first = leaderboard_router.read_leaderboard(4, "battery", 1, 2)
    assert first.total_pages == 2
    assert [entry.rank for entry in first.entries] == [1, 2]

    second = leaderboard_router.read_leaderboard(4, "battery", 2, 2)
    assert [entry.rank for entry in second.entries] == [3]

    clamped = leaderboard_router.read_leaderboard(4, "battery", 99, 2)
    assert clamped.page == 2
    assert [entry.rank for entry in clamped.entries] == [3]


def test_levels_are_scoped(story_runs):
    seed_battery_board(story_runs)
    leaderboard_router.submit_run(
        make_run(run_id="l5", level_id=5, remaining=99), make_user()
    )

    assert (
        leaderboard_router.read_leaderboard(4, "battery", 1, 20)
    ).total_players == 3
    level_five = leaderboard_router.read_leaderboard(5, "battery", 1, 20)
    assert level_five.total_players == 1
    assert level_five.entries[0].remaining == 99


def test_malformed_rows_are_skipped(story_runs):
    seed_battery_board(story_runs)
    story_runs.docs.append(
        {"user_id": "zzz", "level_id": 4, "username": 42}
    )

    page = leaderboard_router.read_leaderboard(4, "battery", 1, 20)

    assert page.total_players == 4
    assert all(
        isinstance(entry.username, str) for entry in page.entries
    )


def test_entries_never_carry_private_fields(story_runs):
    seed_battery_board(story_runs)

    page = leaderboard_router.read_leaderboard(4, "battery", 1, 20)

    for entry in page.entries:
        assert set(entry.model_dump()) == {
            "rank",
            "username",
            "moves",
            "remaining",
            "exec_ms",
            "cost_ratio",
            "move_ratio",
            "score",
            "completed_at",
        }


def test_leaderboard_routes_registered():
    from main import app

    paths = app.openapi()["paths"]

    assert "post" in paths["/api/leaderboard/runs"]
    assert "get" in paths["/api/leaderboard/{level_id}"]
