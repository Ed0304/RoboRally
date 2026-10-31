
"""Tests for user profile and progress endpoints.

MongoDB is replaced with small in-memory fakes: no live database is
touched. The fakes implement just enough operator semantics ($addToSet,
$push/$each/$slice) to prove the endpoints use atomic updates.
"""

import pytest
from bson import ObjectId
from fastapi import HTTPException
from pydantic import ValidationError
from starlette.requests import Request

from authentication import common as auth_common
from authentication import register as register_module
from users import router as users_router
from users.router import (
    CompletionResponse,
    LevelCompletion,
    PromptEntry,
    UserProfile,
)

USER_ID = ObjectId()
OTHER_ID = ObjectId()


def make_user(uid=USER_ID, **overrides):
    user = {
        "id": str(uid),
        "username": "operator",
        "email": "op@example.com",
        "completed_levels": [],
        "prompt_history": [],
    }
    user.update(overrides)
    return user


class FakeUsersCollection:
    """Minimal pymongo stub keyed by ObjectId."""

    def __init__(self, docs):
        self.docs = docs
        self.last_filter = None

    def find_one_and_update(
        self, filter, update, projection=None, return_document=None
    ):
        self.last_filter = filter
        doc = self.docs.get(filter.get("_id"))

        if doc is None:
            return None

        for field, value in update.get("$addToSet", {}).items():
            current = doc.setdefault(field, [])
            if value not in current:
                current.append(value)

        return {
            key: doc.get(key)
            for key in (projection or {}).keys()
            if key != "_id"
        }

    def update_one(self, filter, update):
        self.last_filter = filter
        doc = self.docs.get(filter.get("_id"))

        class Result:
            matched_count = 1 if doc is not None else 0

        if doc is None:
            return Result()

        for field, spec in update.get("$push", {}).items():
            current = doc.setdefault(field, [])
            current.extend(spec["$each"])
            del current[: max(0, len(current) + spec["$slice"])]

        return Result()


class FakeLevelsCollection:
    def __init__(self, ids):
        self.ids = set(ids)

    def find_one(self, filter, projection=None):
        if filter.get("id") in self.ids:
            return {"_id": ObjectId()}
        return None


@pytest.fixture()
def users_collection(monkeypatch):
    collection = FakeUsersCollection(
        {USER_ID: {"completed_levels": [], "prompt_history": []}}
    )
    monkeypatch.setattr(
        users_router, "users_collection", collection
    )
    monkeypatch.setattr(
        users_router,
        "levels_collection",
        FakeLevelsCollection({1, 2, 3, 4, 5, 6}),
    )
    return collection


def test_read_profile_defaults_for_legacy_user():
    profile = users_router.read_profile(
        make_user(completed_levels=None, prompt_history=None)
    )

    assert profile.completed_levels == []
    assert profile.prompt_history == []


def test_read_profile_sanitizes_garbage():
    profile = users_router.read_profile(
        make_user(
            completed_levels=[2, "x", 2, -1],
            prompt_history=[
                {"prompt": "  Go east  ", "status": "Success"},
                {"prompt": "Bad", "status": "Maybe"},
                {"prompt": 42, "status": "Failed"},
                "not-a-dict",
            ],
        )
    )

    assert profile.completed_levels == [2]
    assert profile.prompt_history == [
        PromptEntry(prompt="  Go east  ", status="Success")
    ]
    # Note: read-path entries keep stored text; writes strip on input.


def test_record_completion_adds_level(users_collection):
    first = users_router.record_completion(
        LevelCompletion(level_id=3), make_user()
    )
    assert first.completed_levels == [3]

    # Replaying never duplicates ($addToSet).
    second = users_router.record_completion(
        LevelCompletion(level_id=3), make_user()
    )
    assert second.completed_levels == [3]

    third = users_router.record_completion(
        LevelCompletion(level_id=1), make_user()
    )
    assert third.completed_levels == [1, 3]


def test_record_completion_rejects_unknown_level(users_collection):
    with pytest.raises(HTTPException) as exc_info:
        users_router.record_completion(
            LevelCompletion(level_id=99), make_user()
        )

    assert exc_info.value.status_code == 404


def test_record_completion_rejects_bad_id():
    with pytest.raises(ValidationError):
        LevelCompletion(level_id=0)


def test_session_resolves_only_own_record(monkeypatch):
    """get_current_user looks up exactly the session's _id: account A
    can never receive account B's document."""
    seen = {}

    class FakeUsers:
        def find_one(self, filter, projection=None):
            seen.update(filter)
            if filter.get("_id") == USER_ID:
                return {
                    "_id": USER_ID,
                    "username": "a",
                    "email": "a@example.com",
                    "completed_levels": [1],
                    "prompt_history": [],
                }
            return None

    monkeypatch.setattr(auth_common, "users_collection", FakeUsers())
    token = auth_common.create_session_token(str(USER_ID))
    request = Request(
        {
            "type": "http",
            "headers": [
                (
                    b"cookie",
                    f"roborally_session={token}".encode(),
                )
            ],
        }
    )

    user = auth_common.get_current_user(request)

    assert seen == {"_id": USER_ID}
    assert user["id"] == str(USER_ID)
    assert user["completed_levels"] == [1]


def test_record_completion_scoped_to_own_user(users_collection):
    with pytest.raises(HTTPException) as exc_info:
        users_router.record_completion(
            LevelCompletion(level_id=2), make_user(uid=OTHER_ID)
        )

    assert exc_info.value.status_code == 401
    assert users_collection.last_filter == {"_id": OTHER_ID}


def test_record_prompt_appends_entry(users_collection):
    entry = users_router.record_prompt(
        PromptEntry(prompt="  Open the eastern exit ", status="Success"),
        make_user(),
    )

    assert entry.prompt == "Open the eastern exit"
    assert entry.status == "Success"

    failed = users_router.record_prompt(
        PromptEntry(prompt="Walk into the wall", status="Failed"),
        make_user(),
    )

    assert failed.status == "Failed"


def test_record_prompt_validates_input():
    with pytest.raises(ValidationError):
        PromptEntry(prompt="   ", status="Success")

    with pytest.raises(ValidationError):
        PromptEntry(prompt="x" * 501, status="Success")

    with pytest.raises(ValidationError):
        PromptEntry(prompt="Go", status="Maybe")


def test_record_prompt_caps_history(users_collection):
    doc = users_collection.docs[USER_ID]
    doc["prompt_history"] = [
        {"prompt": f"old {i}", "status": "Success"}
        for i in range(50)
    ]

    users_router.record_prompt(
        PromptEntry(prompt="newest", status="Failed"),
        make_user(),
    )

    history = doc["prompt_history"]
    assert len(history) == 50
    assert history[-1]["prompt"] == "newest"
    assert history[0]["prompt"] == "old 1"


def test_record_prompt_scoped_to_own_user(users_collection):
    with pytest.raises(HTTPException) as exc_info:
        users_router.record_prompt(
            PromptEntry(prompt="Go", status="Success"),
            make_user(uid=OTHER_ID),
        )

    assert exc_info.value.status_code == 401


def test_auth_required_without_cookie():
    request = Request({"type": "http", "headers": []})

    with pytest.raises(HTTPException) as exc_info:
        auth_common.get_current_user(request)

    assert exc_info.value.status_code == 401


def test_auth_rejects_bad_token():
    request = Request(
        {
            "type": "http",
            "headers": [
                (
                    b"cookie",
                    b"roborally_session=not-a-valid-token",
                )
            ],
        }
    )

    with pytest.raises(HTTPException) as exc_info:
        auth_common.get_current_user(request)

    assert exc_info.value.status_code == 401


def test_register_initializes_progress_fields(monkeypatch):
    captured = {}

    class FakeInsert:
        def insert_one(self, document):
            captured.update(document)

            class Result:
                inserted_id = USER_ID

            return Result()

    monkeypatch.setattr(
        register_module, "connect_database", lambda: FakeInsert()
    )
    monkeypatch.setattr(
        register_module, "ensure_user_indexes", lambda: None
    )

    from fastapi import Response

    register_module.register_account(
        register_module.RegisterRequest(
            username="newop",
            email="new@example.com",
            password="password123",
        ),
        Response(),
    )

    assert captured["completed_levels"] == []
    assert captured["prompt_history"] == []
    assert "password" not in captured


def test_user_routes_registered():
    from main import app

    paths = app.openapi()["paths"]

    assert "get" in paths["/api/users/me"]
    assert "post" in paths["/api/users/me/completed-levels"]
    assert "post" in paths["/api/users/me/prompt-history"]


def test_profile_contract_matches_frontend():
    """The response shape the UI consumes must stay stable."""
    profile = UserProfile(
        id="abc",
        username="op",
        email="op@example.com",
        completed_levels=[1, 2],
        prompt_history=[{"prompt": "Go", "status": "Failed"}],
    )

    assert profile.model_dump() == {
        "id": "abc",
        "username": "op",
        "email": "op@example.com",
        "completed_levels": [1, 2],
        "prompt_history": [{"prompt": "Go", "status": "Failed"}],
    }
    assert isinstance(CompletionResponse(completed_levels=[1]), object)
