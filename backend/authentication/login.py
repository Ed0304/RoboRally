"""Login, current-user, and logout endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
import common

from authentication.common import (
    PASSWORD_HASHER,
    SESSION_COOKIE,
    connect_database,
    create_session_token,
    get_current_user,
    set_session_cookie,
    session_cookie_secure,
)

router = APIRouter(prefix="/auth", tags=["authentication"])

# A fixed dummy hash keeps the unknown-account path close in cost to a real login.
_DUMMY_PASSWORD_HASH = PASSWORD_HASHER.hash("not-a-real-user-password")


class LoginRequest(BaseModel):
    identifier: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=1, max_length=128)


class UserResponse(BaseModel):
    id: int
    username: str
    email: str


@router.post("/login", response_model=UserResponse)
def login(payload: LoginRequest, response: Response) -> UserResponse:
    identifier = payload.identifier.strip()
    with connect_database() as connection:
        user = connection.execute(
            "SELECT id, username, email, password_hash FROM users "
            "WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE",
            (identifier, identifier),
        ).fetchone()

    stored_hash = user["password_hash"] if user else _DUMMY_PASSWORD_HASH
    password_is_valid = PASSWORD_HASHER.verify(payload.password, stored_hash)
    if user is None or not password_is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username/email or password.",
        )

    set_session_cookie(response, create_session_token(user["id"]))
    return UserResponse(id=user["id"], username=user["username"], email=user["email"])


@router.get("/me", response_model=UserResponse)
def current_user(
    user: Annotated[dict, Depends(get_current_user)],
) -> UserResponse:
    return UserResponse(**user)


@router.post("/logout")
def logout(response: Response) -> dict[str, str]:
    response.delete_cookie(
        key=SESSION_COOKIE,
        path="/",
        httponly=True,
        secure=session_cookie_secure(),
        samesite="lax",
    )
    return {"message": "Logged out."}
