"""Tests for community levels, versions, attempts, and leaderboards.

MongoDB is replaced with small in-memory fakes: no live database is
touched. Attempt verification runs against the real resimulation.
"""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from pymongo.errors import DuplicateKeyError

from ai_engine import planner
from community import router as community_router
from community import validation as v
from community.router import AttemptSubmission, LevelCreate, LevelUpdate

USER_A = "aaaa00000000000000000001"
USER_B = "bbbb00000000000000000002"

LAYOUT = [
    "#####",
    "#S..#",
    "###.#",
    "#..E#",
    "#####",
]

LASER_LAYOUT = [
    "#####",
    "#S..#",
    "##L.#",
    "#..E#",
    "#####",
]

SEALED = [
    "#####",
    "#S###",
    "#####",
    "##E##",
    "#####",
]

T0 = datetime(2026, 3, 1, tzinfo=timezone.utc)


def make_user(uid=USER_A, **overrides):
    user = {
        "id": uid,
        "username": f"op-{uid[:4]}",
        "email": f"{uid[:4]}@example.com",
        "completed_levels": [],
        "prompt_history": [],
    }
    user.update(overrides)
    return user


def make_level_payload(**overrides):
    data = {
        "name": "First Maze",
        "description": "A starter.",
        "width": 5,
        "height": 5,
        "layout": list(LAYOUT),
        "categories": ["basics"],
    }
    data.update(overrides)
    return LevelCreate(**data)


def make_attempt(**overrides):
    data = {
        "attempt_id": "att-1",
        "version": 1,
        "algorithm": "bfs",
        "actions": ["east", "east", "south", "south"],
        "prompts": [],
        "exec_ms": 2000,
        "plan_ms": 100,
        "plan_count": 1,
    }
    data.update(overrides)
    return AttemptSubmission(**data)


class FakeCollection:
    """Minimal equality-match collection with dotted updates."""

    def __init__(self, key=None):
        self.docs = []
        self._key = key or (lambda doc: None)

    def create_index(self, *args, **kwargs):
        return "index"

    def _matches(self, doc, filt):
        return all(doc.get(k) == value for k, value in filt.items())

    def insert_one(self, document):
        candidate = self._key(document)

        if candidate is not None:
            for doc in self.docs:
                if self._key(doc) == candidate:
                    raise DuplicateKeyError("duplicate")

        self.docs.append(dict(document))

    def find_one(self, filt):
        for doc in self.docs:
            if self._matches(doc, filt):
                return dict(doc)
        return None

    def find(self, filt):
        return [dict(doc) for doc in self.docs if self._matches(doc, filt)]

    def update_one(self, filt, update):
        for doc in self.docs:
            if not self._matches(doc, filt):
                continue

            for path, value in update.get("$set", {}).items():
                target = doc
                parts = path.split(".")
                for part in parts[:-1]:
                    target = target.setdefault(part, {})
                target[parts[-1]] = value

            for path, value in update.get("$push", {}).items():
                doc.setdefault(path, []).append(value)

            for path, value in update.get("$inc", {}).items():
                target = doc
                parts = path.split(".")
                for part in parts[:-1]:
                    target = target.setdefault(part, {})
                target[parts[-1]] = target.get(parts[-1], 0) + value

            return


@pytest.fixture
def fakes(monkeypatch):
    levels = FakeCollection(key=lambda doc: doc.get("public_id"))
    attempts = FakeCollection(
        key=lambda doc: (doc.get("user_id"), doc.get("attempt_id"))
    )
    monkeypatch.setattr(
        community_router, "community_levels_collection", levels
    )
    monkeypatch.setattr(
        community_router, "community_attempts_collection", attempts
    )
    return levels, attempts


def publish(fakes, user=None, **overrides):
    _, _ = fakes
    user = user or make_user()
    return community_router.create_level(
        make_level_payload(**overrides), user
    )


# --- Layout validation ---


def test_validate_layout_accepts_good_maze():
    errors, meta = v.validate_layout(5, 5, LAYOUT)
    assert errors == []
    assert meta["start"] == (1, 1)
    assert meta["exit"] == (3, 3)
    assert meta["has_lasers"] is False


def test_validate_layout_rejects_bad_dimensions():
    errors, _ = v.validate_layout(4, 5, LAYOUT)
    assert any("Width" in e for e in errors)


def test_validate_layout_rejects_ragged_rows():
    errors, _ = v.validate_layout(5, 5, ["#####", "#S.#", "###.#", "#..E#", "#####"])
    assert any("wide" in e for e in errors)


def test_validate_layout_rejects_bad_symbol_and_counts():
    bad = ["#####", "#S.X#", "###.#", "#..E#", "#####"]
    errors, _ = v.validate_layout(5, 5, bad)
    assert any("unsupported" in e for e in errors)

    two_starts = ["#####", "#SS.#", "###.#", "#..E#", "#####"]
    errors, _ = v.validate_layout(5, 5, two_starts)
    assert any("one start" in e for e in errors)


def test_safe_route_requires_laser_free_path():
    assert v.find_safe_route(LAYOUT, (1, 1), (3, 3)) is not None
    assert v.find_safe_route(SEALED, (1, 1), (2, 3)) is None
    # Only path crosses a laser: unsafe, so unsolvable.
    laser_only = ["#####", "#SL.E#", "#####", "#####", "#####"]
    assert v.find_safe_route(laser_only, (1, 1), (4, 1)) is None


# --- Resimulation ---


def test_resimulate_verifies_honest_run():
    result = v.resimulate(
        LAYOUT, (1, 1), (3, 3), ["east", "east", "south", "south"]
    )
    assert result["ok"] is True
    assert result["reached"] is True
    assert result["died"] is False
    assert (result["moves"], result["cost"], result["remaining"]) == (4, 4, 96)


def test_resimulate_rejects_wall_and_bad_steps():
    assert v.resimulate(LAYOUT, (1, 1), (3, 3), ["north"])["ok"] is False
    assert v.resimulate(LAYOUT, (1, 1), (3, 3), ["up"])["ok"] is False
    assert v.resimulate(LAYOUT, (1, 1), (3, 3), [])["ok"] is False


def test_resimulate_reports_laser_death():
    result = v.resimulate(
        LASER_LAYOUT, (1, 1), (3, 3), ["east", "south"]
    )
    assert result["ok"] is True
    assert result["died"] is True
    assert result["reached"] is False


def test_resimulate_enforces_battery():
    actions = ["east", "west"] * 60
    result = v.resimulate(LAYOUT, (1, 1), (3, 3), actions)
    assert result["ok"] is False
    assert "battery" in result["error"]


# --- Level lifecycle ---


def test_create_and_read_level(fakes):
    created = publish(fakes)
    assert created.version == 1
    assert created.status == "published"

    fetched = community_router.read_level(created.public_id)
    assert fetched.layout == LAYOUT
    assert fetched.creator_username == "op-aaaa"


def test_create_rejects_unsolvable_maze(fakes):
    with pytest.raises(HTTPException) as exc:
        community_router.create_level(
            make_level_payload(layout=list(SEALED)), make_user()
        )
    assert exc.value.status_code == 422


def test_create_rejects_blank_name(fakes):
    with pytest.raises(HTTPException) as exc:
        community_router.create_level(
            make_level_payload(name="   "), make_user()
        )
    assert exc.value.status_code == 422


def test_create_rejects_unknown_category():
    with pytest.raises(ValidationError):
        make_level_payload(categories=["nope"])


def test_list_levels_sorts_filters_and_paginates(fakes):
    levels, attempts = fakes
    first = publish(fakes, name="Old", categories=["basics"])
    second = publish(fakes, name="New", categories=["hazards"])
    levels.docs[0]["created_at"] = T0
    levels.docs[1]["created_at"] = T0 + timedelta(days=1)
    levels.docs[0]["stats"] = {"attempts": 10, "completions": 1}
    levels.docs[1]["stats"] = {"attempts": 4, "completions": 4}

    newest = community_router.list_levels()
    assert [c.public_id for c in newest.levels] == [
        second.public_id,
        first.public_id,
    ]

    busy = community_router.list_levels(sort="attempts")
    assert busy.levels[0].public_id == first.public_id

    rate = community_router.list_levels(sort="completion")
    assert rate.levels[0].public_id == second.public_id
    assert rate.levels[0].completion_rate == 1.0

    filtered = community_router.list_levels(category="hazards")
    assert [c.public_id for c in filtered.levels] == [second.public_id]

    page = community_router.list_levels(page=9, page_size=1)
    assert page.page == 2
    assert len(page.levels) == 1


def test_list_excludes_unpublished(fakes):
    created = publish(fakes)
    community_router.unpublish_level(created.public_id, make_user())
    assert community_router.list_levels().total_levels == 0

    with pytest.raises(HTTPException):
        community_router.read_level(created.public_id)


def test_update_metadata_keeps_version(fakes):
    created = publish(fakes)
    updated = community_router.update_level(
        created.public_id,
        LevelUpdate(name="Renamed"),
        make_user(),
    )
    assert updated.version == 1
    assert updated.name == "Renamed"


def test_update_layout_bumps_version_with_history(fakes):
    levels, _ = fakes
    created = publish(fakes)
    changed = list(LAYOUT)
    changed[1] = "#S3.#"
    updated = community_router.update_level(
        created.public_id,
        LevelUpdate(layout=changed),
        make_user(),
    )
    assert updated.version == 2

    stored = levels.find_one({"public_id": created.public_id})
    assert len(stored["history"]) == 1
    assert stored["history"][0]["version"] == 1
    assert stored["history"][0]["layout"] == LAYOUT


def test_update_rejects_other_owners_and_bad_layouts(fakes):
    created = publish(fakes)

    with pytest.raises(HTTPException) as exc:
        community_router.update_level(
            created.public_id, LevelUpdate(name="Hijack"), make_user(USER_B)
        )
    assert exc.value.status_code == 403

    with pytest.raises(HTTPException) as exc:
        community_router.update_level(
            created.public_id,
            LevelUpdate(layout=list(SEALED)),
            make_user(),
        )
    assert exc.value.status_code == 422


def test_delete_preserves_record_as_deleted(fakes):
    levels, _ = fakes
    created = publish(fakes)
    removed = community_router.delete_level(created.public_id, make_user())
    assert removed.status == "deleted"
    assert levels.find_one({"public_id": created.public_id}) is not None

    with pytest.raises(HTTPException):
        community_router.read_level(created.public_id)


# --- Attempts ---


def submit(fakes, public_id, user=None, **overrides):
    return community_router.submit_attempt(
        public_id, make_attempt(**overrides), user or make_user()
    )


def test_attempt_verifies_completion(fakes):
    created = publish(fakes)
    result = submit(fakes, created.public_id)
    assert result.duplicate is False
    assert result.outcome == "completed"
    assert (result.moves, result.cost, result.remaining) == (4, 4, 96)

    levels, _ = fakes
    stored = levels.find_one({"public_id": created.public_id})
    assert stored["stats"] == {"attempts": 1, "completions": 1}


def test_attempt_is_idempotent(fakes):
    levels, _ = fakes
    created = publish(fakes)
    submit(fakes, created.public_id)
    again = submit(fakes, created.public_id)
    assert again.duplicate is True
    stored = levels.find_one({"public_id": created.public_id})
    assert stored["stats"] == {"attempts": 1, "completions": 1}


def test_attempt_rejects_impossible_actions(fakes):
    created = publish(fakes)

    with pytest.raises(HTTPException) as exc:
        submit(fakes, created.public_id, actions=["north"])
    assert exc.value.status_code == 422

    levels, _ = fakes
    stored = levels.find_one({"public_id": created.public_id})
    assert stored["stats"] == {"attempts": 0, "completions": 0}


def test_attempt_records_short_and_laser_runs_as_failed(fakes):
    created = publish(fakes)
    short = submit(fakes, created.public_id, attempt_id="s", actions=["east"])
    assert short.outcome == "failed"

    laser = publish(fakes, layout=list(LASER_LAYOUT))
    died = submit(
        fakes, laser.public_id, attempt_id="d", actions=["east", "south"]
    )
    assert died.outcome == "failed"
    assert (died.moves, died.cost, died.remaining) == (2, 2, 98)


def test_attempt_pins_immutable_version(fakes):
    created = publish(fakes)
    changed = list(LAYOUT)
    changed[1] = "#S3.#"
    community_router.update_level(
        created.public_id, LevelUpdate(layout=changed), make_user()
    )

    old = submit(fakes, created.public_id, version=1)
    assert old.outcome == "completed"

    with pytest.raises(HTTPException) as exc:
        submit(fakes, created.public_id, attempt_id="x", version=99)
    assert exc.value.status_code == 400


def test_attempt_requires_published_level_for_guests(fakes):
    created = publish(fakes)
    community_router.unpublish_level(created.public_id, make_user())

    with pytest.raises(HTTPException) as exc:
        submit(fakes, created.public_id, user=make_user(USER_B))
    assert exc.value.status_code == 400


def test_owner_can_test_unpublished_level(fakes):
    created = publish(fakes)
    community_router.unpublish_level(created.public_id, make_user())

    result = submit(fakes, created.public_id)
    assert result.outcome == "completed"


def test_list_searches_by_name(fakes):
    publish(fakes, name="The Gauntlet")
    publish(fakes, name="gauntlet run")
    publish(fakes, name="Quiet Garden")

    found = community_router.list_levels(q="GAUNTLET")
    assert {c.name for c in found.levels} == {
        "The Gauntlet",
        "gauntlet run",
    }
    assert found.total_levels == 2

    blank = community_router.list_levels(q="   ")
    assert blank.total_levels == 3


def test_list_my_levels_returns_own_any_status(fakes):
    mine = publish(fakes, name="Mine")
    community_router.unpublish_level(mine.public_id, make_user())
    publish(fakes, name="Theirs", user=make_user(USER_B))
    gone = publish(fakes, name="Gone")
    community_router.delete_level(gone.public_id, make_user())

    cards = community_router.list_my_levels(make_user())
    assert [c.name for c in cards] == ["Mine"]
    assert cards[0].status == "unpublished"


def test_read_editable_level_is_owner_only(fakes):
    created = publish(fakes)
    community_router.unpublish_level(created.public_id, make_user())

    owned = community_router.read_editable_level(
        created.public_id, make_user()
    )
    assert owned.status == "unpublished"
    assert owned.layout == LAYOUT

    with pytest.raises(HTTPException) as exc:
        community_router.read_editable_level(
            created.public_id, make_user(USER_B)
        )
    assert exc.value.status_code == 403

    community_router.delete_level(created.public_id, make_user())
    with pytest.raises(HTTPException) as exc:
        community_router.read_editable_level(
            created.public_id, make_user()
        )
    assert exc.value.status_code == 404


# --- Leaderboard and history ---


def seed_board(fakes, public_id):
    submit(
        fakes,
        public_id,
        make_user(USER_A),
        attempt_id="a1",
        exec_ms=3000,
    )
    submit(
        fakes,
        public_id,
        make_user(USER_A),
        attempt_id="a2",
        actions=["east", "east", "south", "south"],
        exec_ms=1000,
    )
    submit(
        fakes,
        public_id,
        make_user(USER_B),
        attempt_id="b1",
        actions=["east", "east", "south", "south"],
        exec_ms=2000,
    )
    submit(
        fakes,
        public_id,
        make_user(USER_B),
        attempt_id="b2",
        actions=["east"],
    )


def test_leaderboard_best_per_player_with_tiebreaks(fakes):
    created = publish(fakes)
    seed_board(fakes, created.public_id)

    board = community_router.read_leaderboard(created.public_id)
    assert board.total_players == 2
    # Same moves/cost: faster execution wins.
    assert [e.username for e in board.entries] == ["op-aaaa", "op-bbbb"]
    assert [e.rank for e in board.entries] == [1, 2]
    assert board.entries[0].algorithm == "bfs"


def test_leaderboard_metric_and_version_filters(fakes):
    created = publish(fakes)
    seed_board(fakes, created.public_id)

    timed = community_router.read_leaderboard(
        created.public_id, metric="time"
    )
    assert timed.entries[0].username == "op-aaaa"

    only_v1 = community_router.read_leaderboard(
        created.public_id, version="1"
    )
    assert only_v1.total_players == 2

    empty = community_router.read_leaderboard(created.public_id, version="7")
    assert empty.entries == []

    with pytest.raises(HTTPException):
        community_router.read_leaderboard(created.public_id, version="x")


def test_my_attempts_are_private_and_ordered(fakes):
    created = publish(fakes)
    seed_board(fakes, created.public_id)

    mine = community_router.read_my_attempts(
        created.public_id, make_user(USER_A)
    )
    assert len(mine) == 2
    assert mine[0].submitted_at >= mine[1].submitted_at

    other = community_router.read_my_attempts(
        created.public_id, make_user(USER_B)
    )
    assert {a.attempt_id for a in other} == {"b1", "b2"}


def test_planner_loads_published_community_layout(fakes, monkeypatch):
    levels, _ = fakes
    monkeypatch.setattr(
        planner, "community_levels_collection", levels
    )
    created = publish(fakes)
    loaded = planner.load_community_level(created.public_id, None)
    assert loaded["layout"] == LAYOUT
    assert loaded["id"] == 0

    changed = list(LAYOUT)
    changed[1] = "#S3.#"
    community_router.update_level(
        created.public_id, LevelUpdate(layout=changed), make_user()
    )
    old = planner.load_community_level(created.public_id, 1)
    assert old["layout"] == LAYOUT
    new = planner.load_community_level(created.public_id, 2)
    assert new["layout"] == changed

    with pytest.raises(HTTPException) as exc:
        planner.load_community_level(created.public_id, 99)
    assert exc.value.status_code == 400

    with pytest.raises(HTTPException) as exc:
        planner.load_community_level("missing", None)
    assert exc.value.status_code == 404

    community_router.unpublish_level(created.public_id, make_user())
    with pytest.raises(HTTPException) as exc:
        planner.load_community_level(created.public_id, None)
    assert exc.value.status_code == 404


def test_card_carries_best_result(fakes):
    created = publish(fakes)
    seed_board(fakes, created.public_id)

    cards = community_router.list_levels()
    assert cards.levels[0].best == {
        "username": "op-aaaa",
        "moves": 4,
        "cost": 4,
    }
    assert cards.levels[0].attempts == 4
    assert cards.levels[0].completions == 3
