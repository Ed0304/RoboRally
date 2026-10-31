
"""Account registration endpoint."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel, EmailStr, Field
from pymongo.errors import DuplicateKeyError

from authentication.common import (
    PASSWORD_HASHER,
    connect_database,
    create_session_token,
    ensure_user_indexes,
    set_session_cookie,
)

router = APIRouter(prefix="/auth", tags=["authentication"])


class RegisterRequest(BaseModel):
    username: str = Field(
        min_length=3,
        max_length=24,
        pattern=r"^[A-Za-z0-9_]+$",
    )
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserResponse(BaseModel):
    id: str
    username: str
    email: EmailStr


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_account(
    payload: RegisterRequest,
    response: Response,
) -> UserResponse:
    username = payload.username.strip()
    email = str(payload.email).strip().lower()

    # Use normalized values for case-insensitive uniqueness and lookup.
    username_normalized = username.lower()
    email_normalized = email

    password_hash = PASSWORD_HASHER.hash(payload.password)
    users = connect_database()

    ensure_user_indexes()

    document = {
        "username": username,
        "username_normalized": username_normalized,
        "email": email,
        "email_normalized": email_normalized,
        "password_hash": password_hash,
        "completed_levels": [],
        "prompt_history": [],
        "created_at": datetime.now(timezone.utc),
    }

    try:
        result = users.insert_one(document)
    except DuplicateKeyError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with that username or email already exists.",
        ) from None

    user_id = str(result.inserted_id)

    set_session_cookie(response, create_session_token(user_id))

    return UserResponse(
        id=user_id,
        username=username,
        email=email,
    )
