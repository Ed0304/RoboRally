# This serves as the main point for the backend
import os

from fastapi import FastAPI
import uvicorn
from fastapi.middleware.cors import CORSMiddleware
from game_logic import levels
from ai_engine import router as agent_router
from users import router as users_router
from leaderboard import router as leaderboard_router
from community import router as community_router
from authentication import login, register
app = FastAPI(
    title="RoboRally API",
    description= "Backend for RoboRally: The factory rescue",
    version="0.1.0",
)

def _frontend_origins() -> list[str]:
    """Explicit CORS origins from FRONTEND_ORIGINS (comma-separated).

    Defaults to local development. "*" is forbidden: credentialed
    requests require explicitly permitted origins.
    """
    raw = os.getenv("FRONTEND_ORIGINS", "http://localhost:3000")
    origins = [origin.strip() for origin in raw.split(",") if origin.strip()]
    if "*" in origins:
        raise RuntimeError(
            "FRONTEND_ORIGINS must list explicit origins; '*' is "
            "forbidden with credentialed requests."
        )
    return origins


origins = _frontend_origins()
# Add routers for authentication, AI and game logic
app.include_router(login.router)
app.include_router(register.router)
app.include_router(levels.router)
app.include_router(agent_router.router)
app.include_router(users_router.router)
app.include_router(leaderboard_router.router)
app.include_router(community_router.router)

#Enable CORS - IMPORTANT!
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_headers=["*"],
    allow_methods=["*"],
    allow_origins=origins
)

@app.get("/")
def home():
    return {"message":"Welcome to RoboRally!"}


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "8000")),
    )
