
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
from ai_engine.schemas import (
    Action,
    ActionPlan,
    ActionSegment,
    PlanRequest,
)
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


def test_simulate_approves_laser_and_marks_death():
    """Laser steps are legal moves with a lethal outcome: approved, with
    the death index marked so the planner stops chaining there."""
    result = simulate(
        ["#####", "#SLE#", "#####"],
        {"x": 1, "z": 1},
        False,
        [],
        [move("east"), move("east")],
    )

    assert [a.direction for a in result.approved] == ["east", "east"]
    assert result.died_at == 0
    assert result.rejected == []


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


def test_simulate_accepts_weighted_terrain():
    result = simulate(
        ["#####", "#S35#", "#####"],
        {"x": 1, "z": 1},
        False,
        [],
        [move("east"), move("east")],
    )

    assert len(result.approved) == 2
    assert result.rejected == []
    assert (result.end_x, result.end_z) == (3, 1)


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
        lambda system, user, model, json_schema=None, **kwargs: {
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


def test_small_ask_uses_reduced_budget(stub_level, monkeypatch):
    calls = []

    def scripted(system, user, model, json_schema=None, **kwargs):
        calls.append(kwargs)
        return {
            "actions": [{"op": "move", "direction": "east"}],
            "understood": True,
        }

    monkeypatch.setattr(meta_client, "complete_plan", scripted)
    response = planner.plan_mission(make_request(mission="Move east"))

    assert [a.direction for a in response.actions] == ["east"]
    assert len(calls) == 1
    assert calls[0]["max_tokens"] == meta_client.REDUCED_MAX_OUTPUT_TOKENS
    assert calls[0]["reasoning_effort"] == meta_client.REDUCED_REASONING_EFFORT


def test_full_ask_keeps_full_budget(stub_level, monkeypatch):
    calls = []

    def scripted(system, user, model, json_schema=None, **kwargs):
        calls.append(kwargs)
        return {
            "actions": [
                {"op": "move", "direction": "east"},
                {"op": "move", "direction": "east"},
            ],
            "understood": True,
        }

    monkeypatch.setattr(meta_client, "complete_plan", scripted)
    planner.plan_mission(make_request())  # "Reach the exit."

    assert len(calls) == 1
    assert calls[0]["max_tokens"] == meta_client.MAX_OUTPUT_TOKENS
    assert calls[0]["reasoning_effort"] == meta_client.REASONING_EFFORT


def test_simplified_retry_uses_reduced_budget(stub_level, monkeypatch):
    attempts = []
    retries = []

    def scripted(system, user, model, json_schema=None, **kwargs):
        attempts.append(kwargs)
        if len(attempts) == 1:
            raise PlannerError("grew too long", code="truncated")
        retries.append(kwargs)
        return {
            "actions": [
                {"op": "move", "direction": "east"},
                {"op": "move", "direction": "east"},
            ],
            "understood": True,
        }

    monkeypatch.setattr(meta_client, "complete_plan", scripted)
    response = planner.plan_mission(make_request())  # exit mission

    assert [a.direction for a in response.actions] == ["east", "east"]
    assert attempts[0]["max_tokens"] == meta_client.MAX_OUTPUT_TOKENS
    assert retries[0]["max_tokens"] == meta_client.REDUCED_MAX_OUTPUT_TOKENS
    assert retries[0]["reasoning_effort"] == meta_client.REDUCED_REASONING_EFFORT


def test_plan_from_mid_level_state(stub_level, monkeypatch):
    """Plans validate from any reported state, not just level start."""
    monkeypatch.setattr(
        meta_client,
        "complete_plan",
        lambda system, user, model, json_schema=None, **kwargs: {
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
        lambda system, user, model, json_schema=None, **kwargs: {"unexpected": True},
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
    def boom(system, user, model, json_schema=None, **kwargs):
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
        lambda timeout=None: _FakeClient(
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
        meta_client, "get_client", lambda timeout=None: _CaptureClient()
    )

    decoded = meta_client.complete_plan("system", "user")

    assert decoded["actions"][0]["direction"] == "east"
    assert seen["max_tokens"] == meta_client.MAX_OUTPUT_TOKENS
    assert meta_client.MAX_OUTPUT_TOKENS >= 2000
    assert seen["model"] == meta_client.DEFAULT_MODEL
    assert seen["reasoning_effort"] == meta_client.REASONING_EFFORT
    assert meta_client.REASONING_EFFORT == "high"


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
        lambda system, user, model, json_schema=None, **kwargs: {
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
        lambda system, user, model, json_schema=None, **kwargs: {
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
    """Segment calls request moves plus one comprehension flag —
    still no free-form reasoning."""
    schema = meta_client.SEGMENT_JSON_SCHEMA

    assert set(schema["properties"]) == {"actions", "understood"}
    assert schema["required"] == ["actions", "understood"]
    assert "reasoning" not in schema["properties"]
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


def _script_model_client(monkeypatch, content, finish_reason="stop",
                         usage=None):
    """Stub get_client with a scripted chat.completions response."""
    from types import SimpleNamespace

    message = SimpleNamespace(
        content=content, refusal=None, tool_calls=None
    )
    choice = SimpleNamespace(message=message, finish_reason=finish_reason)
    response = SimpleNamespace(choices=[choice], usage=usage)
    fake = SimpleNamespace(
        chat=SimpleNamespace(
            completions=SimpleNamespace(
                create=lambda **kwargs: response
            )
        )
    )
    monkeypatch.setattr(meta_client, "get_client", lambda timeout: fake)


def test_model_call_logs_start_end_ledger(monkeypatch, caplog):
    import logging
    from types import SimpleNamespace

    usage = SimpleNamespace(
        prompt_tokens=645, completion_tokens=12, total_tokens=657,
        completion_tokens_details=None,
    )
    _script_model_client(
        monkeypatch,
        '{"actions": [{"op": "move", "direction": "east"}], '
        '"understood": true}',
        usage=usage,
    )
    with caplog.at_level(logging.INFO):
        decoded = meta_client.complete_plan(
            "system prompt",
            "Mission: go east\nLayout:\nS3CR3T-LAYOUT-MARKER",
            purpose="leg-2",
            mission="go east",
        )

    assert decoded["understood"] is True
    assert "plan request model call start" in caplog.text
    assert "purpose=leg-2" in caplog.text
    assert "muse-spark-1.3" in caplog.text
    assert "go east" in caplog.text
    assert "plan request ok" in caplog.text
    assert "actions=[east]" in caplog.text
    assert "understood=True" in caplog.text
    assert "duration_ms=" in caplog.text
    assert "S3CR3T-LAYOUT-MARKER" not in caplog.text


def test_model_call_logs_failure_with_duration(monkeypatch, caplog):
    import logging

    _script_model_client(monkeypatch, "", finish_reason="length")
    with caplog.at_level(logging.INFO):
        with pytest.raises(PlannerError) as exc:
            meta_client.complete_plan(
                "system", "Mission: x", purpose="leg-1"
            )

    assert exc.value.code == "truncated"
    assert "purpose=leg-1" in caplog.text
    assert "duration_ms=" in caplog.text


def test_model_call_scrubs_key_like_text(monkeypatch, caplog):
    import logging

    _script_model_client(
        monkeypatch,
        '{"actions": [{"op": "move", "direction": "north"}], '
        '"understood": true}',
    )
    with caplog.at_level(logging.INFO):
        meta_client.complete_plan(
            "system",
            "Mission: x",
            mission="my key LLM|abc123def456 please",
        )

    assert "LLM|abc123def456" not in caplog.text
    assert "<redacted>" in caplog.text


def test_plan_passes_purpose_and_mission(stub_level, monkeypatch):
    calls = []

    def scripted(system, user, model, json_schema=None, **kwargs):
        calls.append(kwargs)
        return {
            "actions": [
                {"op": "move", "direction": "east"},
                {"op": "move", "direction": "east"},
            ],
            "understood": True,
        }

    monkeypatch.setattr(meta_client, "complete_plan", scripted)
    planner.plan_mission(make_request())  # "Reach the exit."

    assert calls[0]["purpose"] == "leg-1"
    assert calls[0]["mission"] == "Reach the exit."


def test_plan_retry_purpose_marks_retry(stub_level, monkeypatch):
    calls = []

    def scripted(system, user, model, json_schema=None, **kwargs):
        calls.append(kwargs)
        if len(calls) == 1:
            raise PlannerError("grew too long", code="truncated")
        return {
            "actions": [{"op": "move", "direction": "east"}],
            "understood": True,
        }

    monkeypatch.setattr(meta_client, "complete_plan", scripted)
    response = planner.plan_mission(make_request(mission="Move east"))

    assert [a.direction for a in response.actions] == ["east"]
    assert [call["purpose"] for call in calls] == ["leg-1", "leg-1-retry"]


def test_plan_logs_leg_diagnostics(stub_level, monkeypatch, caplog):
    import logging

    monkeypatch.setattr(
        meta_client,
        "complete_plan",
        lambda system, user, model, json_schema=None, **kwargs: _east_leg(2),
    )

    with caplog.at_level(logging.INFO):
        planner.plan_mission(make_request())

    assert "schema=segment12" in caplog.text
    assert "effort=high" in caplog.text
    assert f"limit={meta_client.MAX_OUTPUT_TOKENS}" in caplog.text
    assert "MODEL_API_KEY" not in caplog.text


def test_invalid_plan_logs_diagnostics(
    stub_level, monkeypatch, caplog
):
    import logging

    monkeypatch.setattr(
        meta_client,
        "complete_plan",
        lambda system, user, model, json_schema=None, **kwargs: {"unexpected": True},
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

    def scripted(system, user, model, json_schema=None, **kwargs):
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
        lambda system, user, model, json_schema=None, **kwargs: {
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
        lambda system, user, model, json_schema=None, **kwargs: calls.append(
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
    def boom(system, user, model, json_schema=None, **kwargs):
        raise AssertionError("model must not be called")

    monkeypatch.setattr(meta_client, "complete_plan", boom)

    response = planner.plan_mission(
        make_request(
            robot={"x": 3, "z": 1, "direction": "east"},
        )
    )

    assert response.actions == []
    assert response.reasoning == "Already at the exit."


REPORTED_MISSION = (
    "Move south to the wall, go east to the nearest wall, then north "
    "3 steps, east 2 steps, then north, east, north 4 steps, east "
    "2 steps, go south until you hit a wall, go east to the exit."
)

LONG_LEVEL = {
    "id": 102,
    "name": "Marathon Corridor",
    "goal": "Get to the finish line",
    "layout": [
        "#" * 42,
        "#S" + "." * 38 + "E#",
        "#" * 42,
    ],
}

MID_LEVEL = {
    "id": 103,
    "name": "Long Corridor",
    "goal": "Get to the finish line",
    "layout": [
        "#" * 62,
        "#S" + "." * 58 + "E#",
        "#" * 62,
    ],
}

TOO_LONG_LEVEL = {
    "id": 104,
    "name": "Endless Corridor",
    "goal": "Get to the finish line",
    "layout": [
        "#" * 82,
        "#S" + "." * 78 + "E#",
        "#" * 82,
    ],
}


def _west_leg(count):
    return {
        "actions": [
            {"op": "move", "direction": "west"}
        ]
        * count,
    }


def test_plan_rejects_blocked_starting_sequence(stub_level, monkeypatch):
    """The exact Level 6 mission from the bug report starts with 'Move
    south to the wall', which is blocked on the tiny level — so the
    required starting moves fail fast instead of being ignored in
    favor of an unrelated exit route. The model is stubbed: this pins
    the conformance contract, not live model output."""
    assert len(REPORTED_MISSION) <= 500

    def boom(*args, **kwargs):
        raise AssertionError("blocked starts must precede any model call")

    monkeypatch.setattr(meta_client, "complete_plan", boom)

    with pytest.raises(HTTPException) as exc_info:
        planner.plan_mission(make_request(mission=REPORTED_MISSION))

    assert exc_info.value.status_code == 422
    assert "can't be completed as stated" in exc_info.value.detail


def test_plan_chains_four_legs_within_budget(monkeypatch):
    """39-move route needs 4 legs: succeeds under the 48-move budget.
    (The old 3-leg/36-move budget rejected this shape outright.)"""
    monkeypatch.setattr(
        planner, "load_level", lambda level_id: LONG_LEVEL
    )
    script = [_east_leg(12), _east_leg(12), _east_leg(12), _east_leg(3)]
    calls = []

    def scripted(system, user, model, json_schema=None, **kwargs):
        calls.append(user)
        return script[len(calls) - 1]

    monkeypatch.setattr(meta_client, "complete_plan", scripted)

    response = planner.plan_mission(make_request(level_id=102))

    assert [a.direction for a in response.actions] == ["east"] * 39
    assert len(response.actions) <= planner.MAX_TOTAL_ACTIONS
    assert len(calls) == 4
    assert response.rejected == []


def test_plan_retries_truncated_leg_once(stub_level, monkeypatch):
    calls = []

    def flaky(system, user, model, json_schema=None, **kwargs):
        calls.append((user, json_schema))
        if len(calls) == 1:
            raise PlannerError(
                "Mission planning failed: the plan grew too long to "
                "finish. Try a shorter mission.",
                code="truncated",
            )
        return _east_leg(2)

    monkeypatch.setattr(meta_client, "complete_plan", flaky)

    response = planner.plan_mission(make_request())

    assert [a.direction for a in response.actions] == ["east"] * 2
    assert len(calls) == 2
    # The retry is a smaller, simpler ask, not a blind repeat.
    assert (
        calls[1][1]["properties"]["actions"]["maxItems"]
        == planner.RETRY_ACTIONS
    )
    assert "ONLY the next" in calls[1][0]
    assert "Do not work out the rest" in calls[1][0]
    # The retry must differ from the failed ask, never blindly repeat it.
    assert calls[1][0] != calls[0][0]


def test_plan_gives_up_after_retry_truncated(stub_level, monkeypatch):
    calls = []

    def always_truncated(
        system, user, model, json_schema=None, **kwargs
    ):
        calls.append(user)
        raise PlannerError(
            "Mission planning failed: the plan grew too long to "
            "finish. Try a shorter mission.",
            code="truncated",
        )

    monkeypatch.setattr(meta_client, "complete_plan", always_truncated)

    with pytest.raises(HTTPException) as exc_info:
        planner.plan_mission(make_request())

    assert exc_info.value.status_code == 502
    assert "too long" in exc_info.value.detail
    assert len(calls) == 2


def test_plan_stops_on_repeating_route(monkeypatch):
    monkeypatch.setattr(
        planner, "load_level", lambda level_id: CORRIDOR_LEVEL
    )
    script = [_east_leg(2), _west_leg(2)]
    calls = []

    def scripted(system, user, model, json_schema=None, **kwargs):
        calls.append(user)
        return script[len(calls) - 1]

    monkeypatch.setattr(meta_client, "complete_plan", scripted)

    with pytest.raises(HTTPException) as exc_info:
        planner.plan_mission(make_request(level_id=101))

    assert exc_info.value.status_code == 502
    assert "repeating" in exc_info.value.detail
    # The repeating leg is rejected; nothing partial is returned.
    assert len(calls) == 2


def test_plan_chains_five_legs_for_59_moves(monkeypatch):
    """59-move route: 5 legs of 12/12/12/12/11 succeed within budget."""
    monkeypatch.setattr(
        planner, "load_level", lambda level_id: MID_LEVEL
    )
    script = [
        _east_leg(12),
        _east_leg(12),
        _east_leg(12),
        _east_leg(12),
        _east_leg(11),
    ]
    calls = []

    def scripted(system, user, model, json_schema=None, **kwargs):
        calls.append(user)
        return script[len(calls) - 1]

    monkeypatch.setattr(meta_client, "complete_plan", scripted)

    response = planner.plan_mission(make_request(level_id=103))

    assert [a.direction for a in response.actions] == ["east"] * 59
    assert len(response.actions) <= planner.MAX_TOTAL_ACTIONS
    assert len(calls) == 5


def test_plan_budget_covers_72_moves_not_79(monkeypatch):
    """79-move route: 6 legs approve 72, then the budget error fires.
    Total actions can never exceed MAX_TOTAL_ACTIONS."""
    monkeypatch.setattr(
        planner, "load_level", lambda level_id: TOO_LONG_LEVEL
    )
    calls = []
    monkeypatch.setattr(
        meta_client,
        "complete_plan",
        lambda system, user, model, json_schema=None, **kwargs: calls.append(
            user
        )
        or _east_leg(12),
    )

    with pytest.raises(HTTPException) as exc_info:
        planner.plan_mission(make_request(level_id=104))

    assert exc_info.value.status_code == 502
    assert "planning budget" in exc_info.value.detail
    assert len(calls) == planner.MAX_SEGMENTS
    assert len(calls) <= planner.MAX_MODEL_CALLS


def test_plan_stops_at_elapsed_deadline(stub_level, monkeypatch):
    def boom(system, user, model, json_schema=None, **kwargs):
        raise AssertionError("model must not be called")

    monkeypatch.setattr(meta_client, "complete_plan", boom)
    monkeypatch.setattr(planner, "PLANNING_TIMEOUT_SECONDS", 0.0)

    with pytest.raises(HTTPException) as exc_info:
        planner.plan_mission(make_request())

    assert exc_info.value.status_code == 503
    assert "timed out" in exc_info.value.detail


def test_plan_until_wall_terminates_with_rejections(
    stub_level, monkeypatch
):
    """A leg that runs into a wall approves the legal prefix, rejects
    the rest, and terminates: no unbounded growth, no invalid moves."""
    monkeypatch.setattr(
        meta_client,
        "complete_plan",
        lambda system, user, model, json_schema=None, **kwargs: _east_leg(
            12
        ),
    )

    response = planner.plan_mission(make_request())

    assert [a.direction for a in response.actions] == ["east"] * 2
    assert len(response.rejected) == 10
    assert len(response.actions) <= planner.MAX_TOTAL_ACTIONS


def test_truncation_errors_carry_retry_code(monkeypatch):
    _stub_client(monkeypatch, "", finish_reason="length")

    with pytest.raises(PlannerError) as exc_info:
        meta_client.complete_plan("system", "user")

    assert exc_info.value.code == "truncated"

    _stub_client(
        monkeypatch,
        '{"actions": [{"op": "move", "direc',
        finish_reason="length",
    )

    with pytest.raises(PlannerError) as exc_info:
        meta_client.complete_plan("system", "user")

    assert exc_info.value.code == "truncated"


# --- Gibberish comprehension gate ---


def test_segment_understood_defaults_true():
    """Outputs without the flag (older stubs) still validate."""
    segment = ActionSegment.model_validate(
        {"actions": [{"op": "move", "direction": "east"}]}
    )

    assert segment.understood is True


def test_segment_schema_requires_understood_flag():
    for schema in (
        meta_client.SEGMENT_JSON_SCHEMA,
        meta_client.segment_schema(6),
    ):
        assert schema["properties"]["understood"] == {"type": "boolean"}
        assert "understood" in schema["required"]


def test_plan_rejects_gibberish_mission(stub_level, monkeypatch):
    # Pure noise is rejected by structural validation; the understood
    # flag is the backstop for model-baffling text that passes it.
    monkeypatch.setattr(
        meta_client,
        "complete_plan",
        lambda system, user, model, json_schema=None, **kwargs: {
            "actions": [{"op": "move", "direction": "north"}],
            "understood": False,
        },
    )

    with pytest.raises(HTTPException) as exc_info:
        planner.plan_mission(make_request(mission="Exit florp wubble burr"))

    assert exc_info.value.status_code == 422
    assert "gibberish" in exc_info.value.detail


def test_plan_accepts_understood_mission(stub_level, monkeypatch):
    monkeypatch.setattr(
        meta_client,
        "complete_plan",
        lambda system, user, model, json_schema=None, **kwargs: {
            "actions": [
                {"op": "move", "direction": "east"},
                {"op": "move", "direction": "east"},
            ],
            "understood": True,
        },
    )

    response = planner.plan_mission(make_request(mission="go east 2"))

    assert [a.direction for a in response.actions] == ["east", "east"]


def test_system_prompt_never_judges_strategy():
    """The model flags only gibberish; meaningful missions — even bad
    ones — are planned as stated, since the game tests problem-solving."""
    assert "understood=false" in planner.SYSTEM_PROMPT
    assert (
        "Do not judge or correct the player's strategy"
        in planner.SYSTEM_PROMPT
    )


def test_system_prompt_does_not_mandate_laser_avoidance():
    """Lethality is stated as a fact, but the model must follow the
    mission as stated instead of refusing or rerouting around hazards."""
    assert "Never step on a laser" not in planner.SYSTEM_PROMPT
    assert "never step on" not in planner.SYSTEM_PROMPT.lower()
    assert "destroy the robot on entry" in planner.SYSTEM_PROMPT
    assert (
        "do not refuse, reroute, or second-guess it because of hazards"
        in planner.SYSTEM_PROMPT
    )
