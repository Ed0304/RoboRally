
"""Mission-planning API endpoints."""

from fastapi import APIRouter

from ai_engine import planner
from ai_engine.schemas import PlanRequest, PlanResponse

router = APIRouter(prefix="/api/agent", tags=["agent"])


@router.post("/plan", response_model=PlanResponse)
def create_plan(payload: PlanRequest) -> PlanResponse:
    """Convert a natural-language mission into a validated action plan."""
    return planner.plan_mission(payload)


@router.get("/health")
def agent_health() -> dict:
    """Report planner readiness without calling the model API."""
    return planner.health()
