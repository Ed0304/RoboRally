
"""Minimal server-side validation of proposed moves.

This mirrors just enough of ``frontend/my-app/src/lib/gamelogic.ts`` and
``maze.ts`` to reject obviously invalid plans. The frontend game engine
remains authoritative: approved steps are still executed through
``moveRobot``/``checkGameStatus``, which may reject or kill where this
mirror cannot see.

Deliberately NOT mirrored (documented limitations):
- Enemy patrol movement and range-2 line-of-sight detection: patrol
  routes live in the frontend (``enemyRoutes.ts``) and enemies move on an
  800 ms timer, so the backend only knows the snapshot sent with the
  request. Steps onto a *currently reported* enemy tile are rejected;
  steps into future detection range are not predicted.
- Collectible pickup and enemy defeat: not implemented in the game
  engine either (win = reach exit), so plans cannot rely on them.
"""

from ai_engine.meta_client import PlannerError
from ai_engine.schemas import Action, RejectedAction

OFFSETS = {
    "north": (0, -1),
    "south": (0, 1),
    "east": (1, 0),
    "west": (-1, 0),
}

WALL = "#"
DOOR = "D"
LASER = "L"
TRIGGER = "!"

KNOWN_SYMBOLS = set("#.SELCRD!")


def parse_layout(layout: list[str]) -> dict[tuple[int, int], str]:
    """Index layout rows by (x, z), rejecting malformed geometry."""
    if not layout:
        raise PlannerError("Level data is invalid: empty layout.")

    width = len(layout[0])
    tiles: dict[tuple[int, int], str] = {}

    for z, row in enumerate(layout):
        if len(row) != width:
            raise PlannerError(
                "Level data is invalid: rows have unequal width."
            )
        for x, symbol in enumerate(row):
            if symbol not in KNOWN_SYMBOLS:
                raise PlannerError(
                    f"Level data is invalid: unknown symbol at ({x}, {z})."
                )
            tiles[(x, z)] = symbol

    return tiles


def simulate(
    layout: list[str],
    robot: dict[str, int],
    door_open: bool,
    enemies: list[dict[str, int]],
    actions: list[Action],
) -> tuple[list[Action], list[RejectedAction]]:
    """Walk the plan step by step from the reported state.

    Blocked steps leave the robot in place (matching ``moveRobot``) and
    are recorded with reasons; later steps are still evaluated from the
    resulting position. Landing on a trigger opens doors for subsequent
    steps (matching ``MazeScene``).
    """
    tiles = parse_layout(layout)
    enemy_tiles = {(enemy["x"], enemy["z"]) for enemy in enemies}

    x, z = robot["x"], robot["z"]
    doors_open = door_open
    approved: list[Action] = []
    rejected: list[RejectedAction] = []

    for index, action in enumerate(actions):
        dx, dz = OFFSETS[action.direction]
        next_x, next_z = x + dx, z + dz
        symbol = tiles.get((next_x, next_z))

        if symbol is None:
            rejected.append(
                RejectedAction(
                    index=index,
                    reason=(
                        f"Move {action.direction} from ({x}, {z}) leaves "
                        "the maze bounds."
                    ),
                )
            )
            continue

        if symbol == WALL:
            rejected.append(
                RejectedAction(
                    index=index,
                    reason=(
                        f"Move {action.direction} is blocked by a wall at "
                        f"({next_x}, {next_z})."
                    ),
                )
            )
            continue

        if symbol == DOOR and not doors_open:
            rejected.append(
                RejectedAction(
                    index=index,
                    reason=(
                        f"Move {action.direction} is blocked by a closed "
                        f"door at ({next_x}, {next_z}). Step on the "
                        "trigger (!) first."
                    ),
                )
            )
            continue

        if symbol == LASER:
            rejected.append(
                RejectedAction(
                    index=index,
                    reason=(
                        f"Move {action.direction} steps onto a laser at "
                        f"({next_x}, {next_z}) and would destroy the robot."
                    ),
                )
            )
            continue

        if (next_x, next_z) in enemy_tiles:
            rejected.append(
                RejectedAction(
                    index=index,
                    reason=(
                        f"Move {action.direction} steps onto a tile "
                        f"({next_x}, {next_z}) occupied by a patrolling "
                        "enemy."
                    ),
                )
            )
            continue

        x, z = next_x, next_z
        approved.append(action)

        if symbol == TRIGGER:
            doors_open = True

    return approved, rejected
