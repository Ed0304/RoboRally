"""Account registration endpoint."""

import sqlite3
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel, EmailStr, Field

from authentication.common import (
    PASSWORD_HASHER,
    connect_database,
    create_session_token,
    set_session_cookie,
)

router = APIRouter(prefix="/auth", tags=["authentication"])


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=24, pattern=r"^[A-Za-z0-9_]+$")
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserResponse(BaseModel):
    id: int
    username: str
    email: EmailStr


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register_account(payload: RegisterRequest, response: Response) -> UserResponse:
    username = payload.username.strip()
    email = str(payload.email).strip().lower()
    password_hash = PASSWORD_HASHER.hash(payload.password)

    try:
        with connect_database() as connection:
            cursor = connection.execute(
                "INSERT INTO users (username, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
                (username, email, password_hash, datetime.now(timezone.utc).isoformat()),
            )
            user_id = cursor.lastrowid
    except sqlite3.IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with that username or email already exists.",
        ) from None

    if user_id is None:
        raise HTTPException(status_code=500, detail="Could not create the account.")
    set_session_cookie(response, create_session_token(user_id))
    return UserResponse(id=user_id, username=username, email=email)
