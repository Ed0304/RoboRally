
"""Meta Model API client for mission planning.

Verified against the official docs (https://dev.meta.ai/docs/quickstart,
https://dev.meta.ai/docs/structured-output): the API is OpenAI-SDK
compatible at base URL https://api.meta.ai/v1, authenticates with a
MODEL_API_KEY, and supports constrained structured output via a
``json_schema`` response_format on Chat Completions.
"""

import json
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
        "reasoning": {"type": "string"},
    },
    "required": ["actions", "reasoning"],
    "additionalProperties": False,
}


def complete_plan(
    system_prompt: str,
    user_prompt: str,
    model: str = DEFAULT_MODEL,
) -> dict:
    """Request a structured plan from Muse Spark.

    Returns the decoded JSON object. Raises PlannerError with a safe
    message for every expected failure mode.
    """
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
                    "schema": PLAN_JSON_SCHEMA,
                },
            },
            temperature=0.2,
            max_tokens=1000,
        )
    except AuthenticationError:
        raise PlannerError(
            "Mission planning failed: the server's Meta API key was "
            "rejected. Check MODEL_API_KEY.",
            status_code=503,
        ) from None
    except RateLimitError:
        raise PlannerError(
            "Mission planning is rate limited. Please try again shortly.",
            status_code=503,
        ) from None
    except APITimeoutError:
        raise PlannerError(
            "Mission planning timed out. Please try again.",
            status_code=503,
        ) from None
    except (APIConnectionError, APIError):
        raise PlannerError(
            "Mission planning failed: the model API is unreachable.",
            status_code=503,
        ) from None

    content = ""
    if response.choices:
        content = response.choices[0].message.content or ""

    if not content.strip():
        raise PlannerError(
            "Mission planning failed: the model returned an empty response."
        ) from None

    try:
        decoded = json.loads(content)
    except json.JSONDecodeError:
        raise PlannerError(
            "Mission planning failed: the model returned malformed JSON."
        ) from None

    if not isinstance(decoded, dict):
        raise PlannerError(
            "Mission planning failed: the model response had an "
            "unexpected shape."
        ) from None

    return decoded
