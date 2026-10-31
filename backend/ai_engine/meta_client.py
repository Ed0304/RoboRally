
"""Meta Model API client for mission planning.

Verified against the official docs (https://dev.meta.ai/docs/quickstart,
https://dev.meta.ai/docs/structured-output): the API is OpenAI-SDK
compatible at base URL https://api.meta.ai/v1, authenticates with a
MODEL_API_KEY, and supports constrained structured output via a
``json_schema`` response_format on Chat Completions.
"""

import json
import logging
import os

from openai import (
    APIConnectionError,
    APIError,
    APITimeoutError,
    AuthenticationError,
    OpenAI,
    RateLimitError,
)

BASE_URL = "https://api.meta.ai/v1"
DEFAULT_MODEL = "muse-spark-1.3"
REQUEST_TIMEOUT_SECONDS = 30.0
# Per-call output budget. Well within the 1M-token context window;
# worst-case cost ~$0.02 per call at $4.25/M output tokens.
MAX_OUTPUT_TOKENS = 4000
# Muse Spark is a reasoning model: hidden reasoning tokens share the
# max_tokens budget with visible output, and omitted effort lets the
# model burn the whole budget thinking (observed: out=4000, empty
# content). "low" is the documented level for direct-answer tasks.
# https://dev.meta.ai/docs/reasoning
REASONING_EFFORT = "low"

# Sanitized diagnostics only: model ids, HTTP statuses, and shapes.
# Never log API keys, headers, or full prompts here.
logger = logging.getLogger("roborally.ai_engine")


class PlannerError(Exception):
    """Safe, user-facing planner failure (no secrets, no tracebacks)."""

    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.status_code = status_code


class MissingCredentialsError(PlannerError):
    def __init__(self) -> None:
        super().__init__(
            "Mission planning is unavailable: MODEL_API_KEY is not "
            "configured on the server.",
            status_code=503,
        )


def get_api_key() -> str:
    """Return the Meta Model API key.

    ``MODEL_API_KEY`` is the documented name; ``META_API_KEY`` is kept as
    a deprecated alias so existing configuration keeps working.
    """
    key = os.getenv("MODEL_API_KEY") or os.getenv("META_API_KEY")

    if not key:
        raise MissingCredentialsError()

    return key


def is_configured() -> bool:
    try:
        get_api_key()
    except MissingCredentialsError:
        return False
    return True


def get_client() -> OpenAI:
    # The OpenAI SDK does not auto-read MODEL_API_KEY, so pass it
    # explicitly (per the official quickstart).
    return OpenAI(
        base_url=BASE_URL,
        api_key=get_api_key(),
        timeout=REQUEST_TIMEOUT_SECONDS,
        max_retries=1,
    )


# Constrained-decoding schema for plans. Mirrors ActionPlan in schemas.py.
# Note: recursive schemas are rejected by the API (HTTP 400), so this is
# deliberately flat.
PLAN_JSON_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "actions": {
            "type": "array",
            "minItems": 1,
            "maxItems": 24,
            "items": {
                "type": "object",
                "properties": {
                    "op": {"type": "string", "enum": ["move"]},
                    "direction": {
                        "type": "string",
                        "enum": ["north", "south", "east", "west"],
                    },
                },
                "required": ["op", "direction"],
                "additionalProperties": False,
            },
        },
        # maxLength mirrors ActionPlan.reasoning so constrained decoding
        # enforces exactly what Pydantic validates.
        "reasoning": {"type": "string", "maxLength": 2000},
    },
    "required": ["actions", "reasoning"],
    "additionalProperties": False,
}


def _summarize_usage(usage) -> str:
    """Render token usage as plain counts; safe to log."""
    if usage is None:
        return "?"

    prompt = getattr(usage, "prompt_tokens", None)
    completion = getattr(usage, "completion_tokens", None)
    total = getattr(usage, "total_tokens", None)
    details = getattr(usage, "completion_tokens_details", None)
    reasoning = getattr(details, "reasoning_tokens", None)

    if (
        prompt is None
        and completion is None
        and total is None
        and reasoning is None
    ):
        return "?"

    summary = f"in={prompt} out={completion} total={total}"

    if reasoning is not None:
        summary += f" reasoning={reasoning}"

    return summary


# Segment calls request actions only: no free-form reasoning field,
# capped at 12 moves. Minimal visible output keeps generation far below
# the output budget; the planner synthesizes display text server-side.
SEGMENT_JSON_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "actions": {
            **PLAN_JSON_SCHEMA["properties"]["actions"],
            "minItems": 1,
            "maxItems": 12,
        },
    },
    "required": ["actions"],
    "additionalProperties": False,
}


def complete_plan(
    system_prompt: str,
    user_prompt: str,
    model: str = DEFAULT_MODEL,
    json_schema: dict | None = None,
) -> dict:
    """Request a structured plan from Muse Spark.

    Returns the decoded JSON object. Raises PlannerError with a safe
    message for every expected failure mode.
    """
    schema = json_schema if json_schema is not None else PLAN_JSON_SCHEMA
    try:
        client = get_client()
    except MissingCredentialsError:
        raise

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "ActionPlan",
                    "schema": schema,
                },
            },
            temperature=0.2,
            max_tokens=MAX_OUTPUT_TOKENS,
            reasoning_effort=REASONING_EFFORT,
        )
    except AuthenticationError as exc:
        logger.warning(
            "plan request rejected: model=%s stage=auth status=%s",
            model,
            getattr(exc, "status_code", "?"),
        )
        raise PlannerError(
            "Mission planning failed: the server's Meta API key was "
            "rejected. Check MODEL_API_KEY.",
            status_code=503,
        ) from None
    except RateLimitError:
        logger.warning("plan request rate limited: model=%s", model)
        raise PlannerError(
            "Mission planning is rate limited. Please try again shortly.",
            status_code=503,
        ) from None
    except APITimeoutError:
        logger.warning(
            "plan request timed out: model=%s timeout_s=%s",
            model,
            REQUEST_TIMEOUT_SECONDS,
        )
        raise PlannerError(
            "Mission planning timed out. Please try again.",
            status_code=503,
        ) from None
    except APIConnectionError:
        logger.warning("plan request connection failed: model=%s", model)
        raise PlannerError(
            "Mission planning failed: the model API is unreachable.",
            status_code=503,
        ) from None
    except APIError as exc:
        logger.warning(
            "plan request API error: model=%s status=%s",
            model,
            getattr(exc, "status_code", "?"),
        )
        raise PlannerError(
            "Mission planning failed: the model API returned an error.",
            status_code=503,
        ) from None

    choices = list(getattr(response, "choices", None) or [])

    if not choices:
        logger.warning("plan request no choices: model=%s", model)
        raise PlannerError(
            "Mission planning failed: the model returned no "
            "completion. Please try again."
        ) from None

    choice = choices[0]
    message = choice.message
    finish_reason = getattr(choice, "finish_reason", None)
    refusal = getattr(message, "refusal", None)
    tool_calls = list(getattr(message, "tool_calls", None) or [])
    raw_content = getattr(message, "content", None)

    if isinstance(raw_content, list):
        # Content-block form: concatenate the text parts.
        content = "".join(
            part.text
            for part in raw_content
            if isinstance(getattr(part, "text", None), str)
        )
    elif isinstance(raw_content, str):
        content = raw_content
    else:
        content = ""

    usage = getattr(response, "usage", None)
    usage_summary = _summarize_usage(usage)

    if refusal:
        logger.warning(
            "plan request refused: model=%s finish=%s refusal=%r",
            model,
            finish_reason,
            str(refusal)[:200],
        )
        raise PlannerError(
            "Mission planning failed: the model declined to plan. "
            "Try rephrasing your mission."
        ) from None

    if not content.strip():
        logger.warning(
            "plan request empty content: model=%s finish=%s tools=%d "
            "usage=%s limit=%d",
            model,
            finish_reason,
            len(tool_calls),
            usage_summary,
            MAX_OUTPUT_TOKENS,
        )
        if finish_reason == "length":
            detail = (
                "Mission planning failed: the plan grew too long to "
                "finish. Try a shorter mission."
            )
        elif finish_reason == "content_filter":
            detail = (
                "Mission planning failed: the model response was "
                "blocked by content moderation. Try rephrasing your "
                "mission."
            )
        else:
            detail = (
                "Mission planning failed: the model returned an empty "
                "response. Try rephrasing your mission."
            )
        raise PlannerError(detail) from None

    logger.info(
        "plan request ok: model=%s finish=%s chars=%d usage=%s",
        model,
        finish_reason,
        len(content),
        usage_summary,
    )

    try:
        decoded = json.loads(content)
    except json.JSONDecodeError:
        if finish_reason == "length":
            # Partial content cut off by the output budget is
            # truncation, not malformed output. Never parse it.
            logger.warning(
                "plan request truncated JSON: model=%s chars=%d "
                "usage=%s limit=%d",
                model,
                len(content),
                usage_summary,
                MAX_OUTPUT_TOKENS,
            )
            raise PlannerError(
                "Mission planning failed: the plan grew too long to "
                "finish. Try a shorter mission."
            ) from None
        logger.warning(
            "plan request malformed JSON: model=%s chars=%d head=%r",
            model,
            len(content),
            content[:200],
        )
        raise PlannerError(
            "Mission planning failed: the model returned malformed "
            "output. Try rephrasing your mission."
        ) from None

    if not isinstance(decoded, dict):
        logger.warning(
            "plan request unexpected shape: model=%s type=%s",
            model,
            type(decoded).__name__,
        )
        raise PlannerError(
            "Mission planning failed: the model response had an "
            "unexpected shape."
        ) from None

    return decoded
