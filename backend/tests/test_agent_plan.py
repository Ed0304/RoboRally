
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
from ai_engine.rules import find_exit, simulate
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

            }
        )


def test_request_rejects_long_mission():
    with pytest.raises(ValidationError):
        make_request(mission="x" * 501)


# --- Rule simulation ---


def test_simulate_happy_path():
    result = simulate(
        TINY_LEVEL["layout"],
        {"x": 1, "z": 1},
        False,
        [],
        [move("east"), move("east")],
    )

    assert [a.direction for a in result.approved] == ["east", "east"]
    assert result.rejected == []
    assert (result.end_x, result.end_z) == (3, 1)
    assert result.doors_open is False


def test_simulate_rejects_wall_and_stays_put():
    result = simulate(
        TINY_LEVEL["layout"],
        {"x": 1, "z": 1},
        False,
        [],
        [move("north"), move("east")],
    )

    # Blocked first step: robot stays, second step still evaluated.
    assert [a.direction for a in result.approved] == ["east"]
    assert len(result.rejected) == 1
    assert result.rejected[0].index == 0
    assert "wall" in result.rejected[0].reason
    assert (result.end_x, result.end_z) == (2, 1)


def test_simulate_rejects_out_of_bounds():
    result = simulate(
        ["S"],
        {"x": 0, "z": 0},
        False,
        [],
        [move("west")],
    )

    assert result.approved == []
    assert "bounds" in result.rejected[0].reason


def test_simulate_rejects_laser():
    result = simulate(
        ["#####", "#SLE#", "#####"],
        {"x": 1, "z": 1},
        False,
        [],
        [move("east")],
    )

    assert result.approved == []
    assert "laser" in result.rejected[0].reason


def test_simulate_door_needs_trigger():
    # Stepping east lands on the trigger (2,1), opening the door at
    # (3,1) for the following step.
    result = simulate(
        DOOR_LEVEL["layout"],
        {"x": 1, "z": 1},
        False,
        [],
        [move("east"), move("east")],
    )

    assert [a.direction for a in result.approved] == ["east", "east"]
    assert result.rejected == []
    assert (result.end_x, result.end_z) == (3, 1)
    assert result.doors_open is True


def test_simulate_rejects_enemy_tile():
    result = simulate(
        TINY_LEVEL["layout"],
        {"x": 1, "z": 1},
        False,
        [{"x": 2, "z": 1}],
        [move("east")],
    )

    assert result.approved == []
    assert "enemy" in result.rejected[0].reason


def test_find_exit():
    assert find_exit(TINY_LEVEL["layout"]) == (3, 1)

    with pytest.raises(PlannerError):
        find_exit(["###", "#S#", "###"])


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
        lambda system, user, model, json_schema=None: {
            "actions": [
                {"op": "move", "direction": "north"},
                {"op": "move", "direction": "east"},
                {"op": "move", "direction": "east"},
            ],

        },
    )

    response = planner.plan_mission(make_request())

    assert response.model == meta_client.DEFAULT_MODEL
    assert [a.direction for a in response.actions] == ["east", "east"]
    assert len(response.rejected) == 1
    assert response.rejected[0].index == 0
    assert (
        response.reasoning == "Leg 1: 2 of 3 proposed moves approved."
    )


def test_plan_from_mid_level_state(stub_level, monkeypatch):
    """Plans validate from any reported state, not just level start."""
    monkeypatch.setattr(
        meta_client,
        "complete_plan",
        lambda system, user, model, json_schema=None: {
            "actions": [{"op": "move", "direction": "east"}],

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
        lambda system, user, model, json_schema=None: {"unexpected": True},
    )

    with pytest.raises(HTTPException) as exc_info:
        planner.plan_mission(make_request())

    assert exc_info.value.status_code == 502
    assert "unusable plan" in exc_info.value.detail


def test_plan_missing_credentials(stub_level, monkeypatch):
    monkeypatch.delenv("MODEL_API_KEY", raising=False)
    monkeypatch.delenv("META_API_KEY", raising=False)

    with pytest.raises(HTTPException) as exc_info:
        planner.plan_mission(make_request())

    assert exc_info.value.status_code == 503
    assert "MODEL_API_KEY" in exc_info.value.detail


def test_plan_model_error_maps_to_503(stub_level, monkeypatch):
    def boom(system, user, model, json_schema=None):
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


# --- Model response parsing (stubbed SDK client) ---


class _FakeMessage:
    def __init__(self, content, refusal=None):
        self.content = content
        self.refusal = refusal


class _FakeChoice:
    def __init__(
        self, content, finish_reason=None, refusal=None
    ):
        self.message = _FakeMessage(content, refusal)
        self.finish_reason = finish_reason


class _FakeCompletions:
    def __init__(self, response):
        self._response = response

    def create(self, **kwargs):
        return self._response


class _FakeChat:
    def __init__(self, response):
        self.completions = _FakeCompletions(response)


class _FakeClient:
    def __init__(
        self,
        content,
        finish_reason=None,
        refusal=None,
        choices=True,
    ):
        response = type("Response", (), {})()
        response.usage = None
        response.choices = (
            [_FakeChoice(content, finish_reason, refusal)]
            if choices
            else []
        )
        self.chat = _FakeChat(response)


def _stub_client(
    monkeypatch,
    content,
    finish_reason=None,
    refusal=None,
    choices=True,
):
    monkeypatch.setattr(
        meta_client,
        "get_client",
        lambda: _FakeClient(
            content,
            finish_reason=finish_reason,
            refusal=refusal,
            choices=choices,
        ),
    )


def test_complete_plan_rejects_malformed_json(monkeypatch):
    _stub_client(monkeypatch, '{"actions": [broken')

    with pytest.raises(PlannerError) as exc_info:
        meta_client.complete_plan("system", "user")

    assert exc_info.value.status_code == 502
    assert "malformed" in str(exc_info.value)


def test_complete_plan_rejects_empty_content(monkeypatch):
    _stub_client(monkeypatch, "   ")

    with pytest.raises(PlannerError) as exc_info:
        meta_client.complete_plan("system", "user")

    assert exc_info.value.status_code == 502
    assert "empty" in str(exc_info.value)


def test_complete_plan_rejects_non_dict_shape(monkeypatch):
    _stub_client(monkeypatch, '["not", "an", "object"]')

    with pytest.raises(PlannerError) as exc_info:
        meta_client.complete_plan("system", "user")

    assert exc_info.value.status_code == 502
    assert "unexpected shape" in str(exc_info.value)


def test_complete_plan_accepts_valid_content(monkeypatch):
    _stub_client(
        monkeypatch,
        '{"actions": [{"op": "move", "direction": "east"}], '
        '"reasoning": "Go east."}',
        finish_reason="stop",
    )

    decoded = meta_client.complete_plan("system", "user")

    assert decoded["actions"] == [
        {"op": "move", "direction": "east"}
    ]
    assert decoded["reasoning"] == "Go east."


def test_complete_plan_accepts_content_blocks(monkeypatch):
    part = type("Part", (), {})()
    part.text = (
        '{"actions": [{"op": "move", "direction": "north"}], '
        '"reasoning": "Go north."}'
    )
    _stub_client(monkeypatch, [part], finish_reason="stop")

    decoded = meta_client.complete_plan("system", "user")

    assert decoded["actions"][0]["direction"] == "north"


def test_complete_plan_rejects_empty_choices(monkeypatch):
    _stub_client(monkeypatch, "", choices=False)

    with pytest.raises(PlannerError) as exc_info:
        meta_client.complete_plan("system", "user")

    assert exc_info.value.status_code == 502
    assert "no completion" in str(exc_info.value)


def test_complete_plan_reports_refusal(monkeypatch):
    _stub_client(
        monkeypatch,
        "",
        finish_reason="refusal",
        refusal="I cannot help with that.",
    )

    with pytest.raises(PlannerError) as exc_info:
        meta_client.complete_plan("system", "user")

    assert exc_info.value.status_code == 502
    assert "declined" in str(exc_info.value)


def test_complete_plan_reports_truncation(monkeypatch):
    _stub_client(monkeypatch, "", finish_reason="length")

    with pytest.raises(PlannerError) as exc_info:
        meta_client.complete_plan("system", "user")

    assert exc_info.value.status_code == 502
    assert "too long" in str(exc_info.value)


def test_complete_plan_truncated_partial_json(monkeypatch):
    """Partial content with finish=length is truncation, not malformed."""
    _stub_client(
        monkeypatch,
        '{"actions": [{"op": "move", "direc',
        finish_reason="length",
    )

    with pytest.raises(PlannerError) as exc_info:
        meta_client.complete_plan("system", "user")

    assert exc_info.value.status_code == 502
    assert "too long" in str(exc_info.value)


def test_complete_plan_uses_output_budget(monkeypatch):
    seen = {}

    class _CaptureCompletions:
        def create(self, **kwargs):
            seen.update(kwargs)
            response = type("Response", (), {})()
            response.usage = None
            response.choices = [
                _FakeChoice(
                    '{"actions": [{"op": "move", "direction": "east"}],'
                    ' "reasoning": "Go east."}',
                    "stop",
                )
            ]
            return response

    class _CaptureChat:
        completions = _CaptureCompletions()

    class _CaptureClient:
        chat = _CaptureChat()

    monkeypatch.setattr(
        meta_client, "get_client", lambda: _CaptureClient()
    )

    decoded = meta_client.complete_plan("system", "user")

    assert decoded["actions"][0]["direction"] == "east"
    assert seen["max_tokens"] == meta_client.MAX_OUTPUT_TOKENS
    assert meta_client.MAX_OUTPUT_TOKENS >= 2000
    assert seen["model"] == meta_client.DEFAULT_MODEL
    assert seen["reasoning_effort"] == meta_client.REASONING_EFFORT
    assert meta_client.REASONING_EFFORT == "low"


def test_complete_plan_reports_content_filter(monkeypatch):
    _stub_client(
        monkeypatch, "", finish_reason="content_filter"
    )

    with pytest.raises(PlannerError) as exc_info:
        meta_client.complete_plan("system", "user")

    assert exc_info.value.status_code == 502
    assert "moderation" in str(exc_info.value)


def test_plan_rejects_empty_actions(stub_level, monkeypatch):
    monkeypatch.setattr(
        meta_client,
        "complete_plan",
        lambda system, user, model, json_schema=None: {
            "actions": [],

        },
    )

    with pytest.raises(HTTPException) as exc_info:
        planner.plan_mission(make_request())

    assert exc_info.value.status_code == 502


def test_plan_rejects_unknown_segment_fields(stub_level, monkeypatch):
    """The action-only segment contract forbids extra fields."""
    monkeypatch.setattr(
        meta_client,
        "complete_plan",
        lambda system, user, model, json_schema=None: {
            "actions": [{"op": "move", "direction": "east"}],
            "reasoning": "Should not be here.",
        },
    )

    with pytest.raises(HTTPException) as exc_info:
        planner.plan_mission(make_request())

    assert exc_info.value.status_code == 502


def test_json_schema_matches_pydantic_contract():
    """Constrained decoding must enforce what validation checks."""
    schema = meta_client.PLAN_JSON_SCHEMA

    assert schema["properties"]["actions"]["minItems"] == 1
    assert schema["properties"]["actions"]["maxItems"] == 24
    assert (
        schema["properties"]["actions"]["items"]["properties"][
            "direction"
        ]["enum"]
        == ["north", "south", "east", "west"]
    )
    assert (
        schema["properties"]["reasoning"]["maxLength"] == 2000
    )


def test_segment_schema_is_action_only():
    """Segment calls request moves without free-form reasoning."""
    schema = meta_client.SEGMENT_JSON_SCHEMA

    assert set(schema["properties"]) == {"actions"}
    assert schema["required"] == ["actions"]
    assert schema["properties"]["actions"]["minItems"] == 1
    assert schema["properties"]["actions"]["maxItems"] == 12


def test_usage_summary_reports_reasoning_split():
    details = type("Details", (), {})()
    details.reasoning_tokens = 3200
    usage = type("Usage", (), {})()
    usage.prompt_tokens = 491
    usage.completion_tokens = 4000
    usage.total_tokens = 4491
    usage.completion_tokens_details = details

    assert (
        meta_client._summarize_usage(usage)
        == "in=491 out=4000 total=4491 reasoning=3200"
    )
    assert meta_client._summarize_usage(None) == "?"


def test_plan_logs_leg_diagnostics(stub_level, monkeypatch, caplog):
    import logging

    monkeypatch.setattr(
        meta_client,
        "complete_plan",
        lambda system, user, model, json_schema=None: _east_leg(2),
    )

    with caplog.at_level(logging.INFO):
        planner.plan_mission(make_request())

    assert "schema=segment12" in caplog.text
    assert "effort=low" in caplog.text
    assert "limit=4000" in caplog.text
    assert "MODEL_API_KEY" not in caplog.text


def test_invalid_plan_logs_diagnostics(
    stub_level, monkeypatch, caplog
):
    import logging

    monkeypatch.setattr(
        meta_client,
        "complete_plan",
        lambda system, user, model, json_schema=None: {"unexpected": True},
    )

    with caplog.at_level(logging.WARNING):
        with pytest.raises(HTTPException):
            planner.plan_mission(make_request())

    assert "invalid model output" in caplog.text
    assert "MODEL_API_KEY" not in caplog.text


# --- Segment chaining ---


CORRIDOR_LEVEL = {
    "id": 101,
    "name": "Long Corridor",
    "goal": "Get to the finish line",
    "layout": [
        "####################",
        "#S................E#",
        "####################",
    ],
}


def _east_leg(count):
    return {
        "actions": [
            {"op": "move", "direction": "east"}
        ]
        * count,
    }


def test_plan_chains_segments_to_exit(monkeypatch):
    """A 17-move corridor needs two legs; the second starts where the
    first stopped, and rejection indices stay globally coherent."""
    monkeypatch.setattr(
        planner, "load_level", lambda level_id: CORRIDOR_LEVEL
    )
    prompts: list[str] = []
    script = [
        _east_leg(12),
        {
            "actions": [
                {"op": "move", "direction": "north"},
                *[
                    {"op": "move", "direction": "east"}
                ]
                * 5,
            ],

        },
    ]

    def scripted(system, user, model, json_schema=None):
        prompts.append(user)
        assert (
            json_schema["properties"]["actions"]["maxItems"] == 12
        )
        return script.pop(0)

    monkeypatch.setattr(meta_client, "complete_plan", scripted)

    response = planner.plan_mission(
        make_request(level_id=101, mission="Cross the corridor.")
    )

    assert [a.direction for a in response.actions] == ["east"] * 17
    assert len(response.rejected) == 1
    assert response.rejected[0].index == 12
    assert (
        response.reasoning
        == "Leg 1: 12 of 12 proposed moves approved. "
        "Leg 2: 5 of 6 proposed moves approved."
    )
    assert len(prompts) == 2
    assert "robot at (1, 1)" in prompts[0]
    assert "robot at (13, 1)" in prompts[1]


def test_plan_stops_when_segment_stalls(monkeypatch):
    monkeypatch.setattr(
        planner, "load_level", lambda level_id: CORRIDOR_LEVEL
    )
    monkeypatch.setattr(
        meta_client,
        "complete_plan",
        lambda system, user, model, json_schema=None: {
            "actions": [{"op": "move", "direction": "north"}],

        },
    )

    with pytest.raises(HTTPException) as exc_info:
        planner.plan_mission(make_request(level_id=101))

    assert exc_info.value.status_code == 502
    assert "could not extend" in exc_info.value.detail


def test_plan_fails_when_budget_exhausted(monkeypatch, caplog):
    import logging

    monkeypatch.setattr(
        planner, "load_level", lambda level_id: CORRIDOR_LEVEL
    )
    calls = []
    monkeypatch.setattr(
        meta_client,
        "complete_plan",
        lambda system, user, model, json_schema=None: calls.append(
            user
        )
        or _east_leg(1),
    )

    with caplog.at_level(logging.WARNING):
        with pytest.raises(HTTPException) as exc_info:
            planner.plan_mission(make_request(level_id=101))

    assert exc_info.value.status_code == 502
    assert "planning budget" in exc_info.value.detail
    assert len(calls) == planner.MAX_SEGMENTS
    assert "segment budget exhausted" in caplog.text


def test_plan_short_circuits_at_exit(stub_level, monkeypatch):
    def boom(system, user, model, json_schema=None):
        raise AssertionError("model must not be called")

    monkeypatch.setattr(meta_client, "complete_plan", boom)

    response = planner.plan_mission(
        make_request(
            robot={"x": 3, "z": 1, "direction": "east"},
        )
    )

    assert response.actions == []
    assert response.reasoning == "Already at the exit."
