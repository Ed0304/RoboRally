
"""Shared database and authentication utilities."""

import os
from pathlib import Path
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import HTTPException, Request, Response, status
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from pymongo import MongoClient
from pymongo.collection import Collection
from pymongo.errors import DuplicateKeyError
from pwdlib import PasswordHash

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")


def _require_env(name: str) -> str:
    """Read required config, failing fast with a sanitized message."""
    value = os.environ.get(name)

    if not value:
        raise RuntimeError(
            f"Missing required backend configuration: {name}. Set it "
            "in the environment or backend/.env (see .env.example)."
        )

    return value

MONGODB_URI = _require_env("MONGODB_URI")
MONGODB_DATABASE = os.getenv("MONGODB_DATABASE", "roborally")
SESSION_SECRET = _require_env("SESSION_SECRET")

SESSION_COOKIE = "roborally_session"
SESSION_MAX_AGE = 60 * 60 * 24 * 7  # 7 days

PASSWORD_HASHER = PasswordHash.recommended()

serializer = URLSafeTimedSerializer(
    SESSION_SECRET,
    salt="roborally-auth-session",
)

client = MongoClient(
    MONGODB_URI,
    serverSelectionTimeoutMS=5000,
)
db = client[MONGODB_DATABASE]
users_collection: Collection = db["users"]


def connect_database() -> Collection:
    """Return the MongoDB users collection."""
    return users_collection


def ensure_user_indexes() -> None:
    """Enforce unique normalized usernames and email addresses."""
    users_collection.create_index(
        "username_normalized",
        unique=True,
        name="unique_username_normalized",
    )
    users_collection.create_index(
        "email_normalized",
        unique=True,
        name="unique_email_normalized",
    )


def create_session_token(user_id: str) -> str:
    """Create a signed token containing the user's MongoDB ID."""
    return serializer.dumps({"sub": user_id})


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        max_age=SESSION_MAX_AGE,
        httponly=True,
        secure=session_cookie_secure(),
        samesite="lax",
        path="/",
    )


def session_cookie_secure() -> bool:
    return os.getenv("SESSION_COOKIE_SECURE", "true").lower() in {
        "1", "true", "yes"
    }


def get_current_user(request: Request) -> dict:
    """Validate the session and load the corresponding user."""
    token = request.cookies.get(SESSION_COOKIE)

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated.",
        )

    try:
        data = serializer.loads(token, max_age=SESSION_MAX_AGE)
        user_id = data.get("sub")

        if not isinstance(user_id, str):
            raise BadSignature("Invalid session subject.")

        from bson import ObjectId

        if not ObjectId.is_valid(user_id):
            raise BadSignature("Invalid user ID.")

    except (BadSignature, SignatureExpired, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session.",
        ) from None

    user = users_collection.find_one(
        {"_id": ObjectId(user_id)},
        {
            "username": 1,
            "email": 1,
            "completed_levels": 1,
            "prompt_history": 1,
        },
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User no longer exists.",
        )

    return {
        "id": str(user["_id"]),
        "username": user["username"],
        "email": user["email"],
        # New fields default for records created before they existed.
        "completed_levels": user.get("completed_levels") or [],
        "prompt_history": user.get("prompt_history") or [],
    }


def get_optional_user(request: Request) -> dict | None:
    """Best-effort session user for endpoints guests may call.

    Returns None when no valid session rides along, so public flows
    (guest planning on canonical levels) keep working while signed-in
    owners gain access to their own unpublished work.
    """
    try:
        return get_current_user(request)
    except HTTPException:
        return None