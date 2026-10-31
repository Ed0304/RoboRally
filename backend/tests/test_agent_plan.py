
"""Tests for the mission-planning endpoint.

The model client is stubbed or monkeypatched in every test: nothing here
touches the live Meta API. A live call is a separate manual check.

Endpoint tests call the planner and route functions directly instead of
going through an HTTP test client, so the suite runs without sockets.
"""

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from ai_engine import meta_client, planner
from ai_engine.meta_client import PlannerError
from ai_engine.rules import simulate
from ai_engine.schemas import Action, ActionPlan, PlanRequest
from main import app

TINY_LEVEL = {
    "id": 99,
    "name": "Test Box",
    "goal": "Get to the finish line",
    "layout": [
        "#####",
        "#S.E#",
        "#####",
    ],
}

DOOR_LEVEL = {
    "id": 100,
    "name": "Test Door",
    "goal": "Get to the finish line",
    "layout": [
        "#####",
        "#S!D#",
        "#..E#",
        "#####",
    ],
}


def make_request(**overrides) -> PlanRequest:
    data = {
        "level_id": 99,
        "mission": "Reach the exit.",
        "robot": {"x": 1, "z": 1, "direction": "east"},
        "enemies": [],
        "door_open": False,
    }
    data.update(overrides)
    return PlanRequest.model_validate(data)


def move(direction: str) -> Action:
    return Action.model_validate({"op": "move", "direction": direction})


# --- Schema validation ---


def test_action_rejects_bad_direction():
    with pytest.raises(ValidationError):
        Action.model_validate({"op": "move", "direction": "up"})


def test_action_rejects_unknown_op():
    with pytest.raises(ValidationError):
        Action.model_validate({"op": "teleport", "direction": "north"})


def test_action_rejects_extra_fields():
    with pytest.raises(ValidationError):
        Action.model_validate(
            {"op": "move", "direction": "north", "speed": 3}
        )


def test_plan_rejects_empty_and_overlong():
    with pytest.raises(ValidationError):
        ActionPlan.model_validate({"actions": [], "reasoning": "x"})

    with pytest.raises(ValidationError):
        ActionPlan.model_validate(
            {
                "actions": [
                    {"op": "move", "direction": "east"}
                ]
                * 25,
                "reasoning": "x",
            }
        )


def test_request_rejects_long_mission():
    with pytest.raises(ValidationError):
        make_request(mission="x" * 501)


# --- Rule simulation ---


def test_simulate_happy_path():
    approved, rejected = simulate(
        TINY_LEVEL["layout"],
        {"x": 1, "z": 1},
        False,
        [],
        [move("east"), move("east")],
    )

    assert [a.direction for a in approved] == ["east", "east"]
    assert rejected == []


def test_simulate_rejects_wall_and_stays_put():
    approved, rejected = simulate(
        TINY_LEVEL["layout"],
        {"x": 1, "z": 1},
        False,
        [],
        [move("north"), move("east")],
    )

    # Blocked first step: robot stays, second step still evaluated.
    assert [a.direction for a in approved] == ["east"]
    assert len(rejected) == 1
    assert rejected[0].index == 0
    assert "wall" in rejected[0].reason


def test_simulate_rejects_out_of_bounds():
    approved, rejected = simulate(
        ["S"],
        {"x": 0, "z": 0},
        False,
        [],
        [move("west")],
    )

    assert approved == []
    assert "bounds" in rejected[0].reason


def test_simulate_rejects_laser():
    approved, rejected = simulate(
        ["#####", "#SLE#", "#####"],
        {"x": 1, "z": 1},
        False,
        [],
        [move("east")],
    )

    assert approved == []
    assert "laser" in rejected[0].reason


def test_simulate_door_needs_trigger():
    # Stepping east lands on the trigger (2,1), opening the door at
    # (3,1) for the following step.
    approved, rejected = simulate(
        DOOR_LEVEL["layout"],
        {"x": 1, "z": 1},
        False,
        [],
        [move("east"), move("east")],
    )

    assert [a.direction for a in approved] == ["east", "east"]
    assert rejected == []


def test_simulate_rejects_enemy_tile():
    approved, rejected = simulate(
        TINY_LEVEL["layout"],
        {"x": 1, "z": 1},
        False,
        [{"x": 2, "z": 1}],
        [move("east")],
    )

    assert approved == []
    assert "enemy" in rejected[0].reason


def test_simulate_rejects_bad_layout():
    with pytest.raises(PlannerError):
        simulate(["##", "#"], {"x": 0, "z": 0}, False, [], [move("east")])

    with pytest.raises(PlannerError):
        simulate(["#S", "@#"], {"x": 0, "z": 0}, False, [], [move("east")])


# --- Endpoint logic (direct calls: no sockets, sandbox-safe) ---


@pytest.fixture()
def stub_level(monkeypatch):
    monkeypatch.setattr(
        planner, "load_level", lambda level_id: TINY_LEVEL
    )


def test_routes_registered():
    # FastAPI 0.162 keeps included routers lazy; the OpenAPI schema
    # resolves them without serving traffic.
    paths = app.openapi()["paths"]

    assert "post" in paths["/api/agent/plan"]
    assert "get" in paths["/api/agent/health"]


def test_plan_happy_path(stub_level, monkeypatch):
    monkeypatch.setattr(
        meta_client,
        "complete_plan",
        lambda system, user, model: {
            "actions": [
                {"op": "move", "direction": "north"},
                {"op": "move", "direction": "east"},
                {"op": "move", "direction": "east"},
            ],
            "reasoning": "Head east to the exit.",
        },
    )

    response = planner.plan_mission(make_request())

    assert response.model == meta_client.DEFAULT_MODEL
    assert [a.direction for a in response.actions] == ["east", "east"]
    assert len(response.rejected) == 1
    assert response.rejected[0].index == 0
    assert response.reasoning == "Head east to the exit."


def test_plan_from_mid_level_state(stub_level, monkeypatch):
    """Plans validate from any reported state, not just level start."""
    monkeypatch.setattr(
        meta_client,
        "complete_plan",
        lambda system, user, model: {
            "actions": [{"op": "move", "direction": "east"}],
            "reasoning": "One step left.",
        },
    )

    response = planner.plan_mission(
        make_request(
            robot={"x": 2, "z": 1, "direction": "east"},
            door_open=True,
        )
    )

    assert [a.direction for a in response.actions] == ["east"]
    assert response.rejected == []


def test_plan_rejects_malformed_model_output(stub_level, monkeypatch):
    monkeypatch.setattr(
        meta_client,
        "complete_plan",
        lambda system, user, model: {"unexpected": True},
    )

    with pytest.raises(HTTPException) as exc_info:
        planner.plan_mission(make_request())

    assert exc_info.value.status_code == 502
    assert "invalid plan" in exc_info.value.detail


def test_plan_missing_credentials(stub_level, monkeypatch):
    monkeypatch.delenv("MODEL_API_KEY", raising=False)
    monkeypatch.delenv("META_API_KEY", raising=False)

    with pytest.raises(HTTPException) as exc_info:
        planner.plan_mission(make_request())

    assert exc_info.value.status_code == 503
    assert "MODEL_API_KEY" in exc_info.value.detail


def test_plan_model_error_maps_to_503(stub_level, monkeypatch):
    def boom(system, user, model):
        raise PlannerError("Mission planning timed out.", status_code=503)

    monkeypatch.setattr(meta_client, "complete_plan", boom)

    with pytest.raises(HTTPException) as exc_info:
        planner.plan_mission(make_request())

    assert exc_info.value.status_code == 503
    assert "timed out" in exc_info.value.detail


def test_plan_level_not_found(monkeypatch):
    def missing(level_id):
        raise HTTPException(status_code=404, detail="Level 7 not found.")

    monkeypatch.setattr(planner, "load_level", missing)

    with pytest.raises(HTTPException) as exc_info:
        planner.plan_mission(make_request(level_id=7))

    assert exc_info.value.status_code == 404


def test_plan_validates_request():
    with pytest.raises(ValidationError):
        PlanRequest.model_validate(
            {
                "level_id": 0,
                "mission": "",
                "robot": {"x": 1, "z": 1, "direction": "up"},
                "enemies": [],
                "door_open": False,
            }
        )


def test_health_reports_without_key(monkeypatch):
    monkeypatch.delenv("MODEL_API_KEY", raising=False)
    monkeypatch.delenv("META_API_KEY", raising=False)

    assert planner.health() == {
        "meta_configured": False,
        "model": meta_client.DEFAULT_MODEL,
    }


def test_meta_api_key_alias(monkeypatch):
    """META_API_KEY keeps working as a deprecated alias."""
    monkeypatch.delenv("MODEL_API_KEY", raising=False)
    monkeypatch.setenv("META_API_KEY", "alias-key")

    assert meta_client.get_api_key() == "alias-key"
    assert meta_client.is_configured() is True
