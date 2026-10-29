# This serves as the main point for the backend
from fastapi import FastAPI
import uvicorn
from fastapi.middleware.cors import CORSMiddleware
from game_logic import levels
from authentication import login, register
app = FastAPI(
    title="RoboRally API",
    description= "Backend for RoboRally: The factory rescue",
    version="0.1.0",
)

origins = [
    "http://localhost:3000" #NextJS frontend, localhost
    # TODO: Add deployment URL once deployed.
]
# Add routers for authentication, AI and game logic
app.include_router(login.router)
app.include_router(register.router)
app.include_router(levels.router)

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
    uvicorn.run("main:app")


