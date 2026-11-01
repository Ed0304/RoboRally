"""Pure validation and verification for community levels.

Mirrors the frontend engine rules (gamelogic movement, battery costs):
four-directional moves, walls block, lasers are lethal, entry costs
floor 1 / rough 3 / drain 5 with the starting tile free.
"""

from collections import deque

MIN_DIM = 5
MAX_DIM = 25
MAX_ACTIONS = 1000

WALL = "#"
FLOOR = "."
START = "S"
EXIT = "E"
LASER = "L"
ROUGH = "3"
DRAIN = "5"

ALLOWED_SYMBOLS = frozenset({WALL, FLOOR, START, EXIT, LASER, ROUGH, DRAIN})

ENTRY_COST = {FLOOR: 1, ROUGH: 3, DRAIN: 5, START: 1, EXIT: 1, LASER: 1}

DIRECTIONS = {
    "north": (0, -1),
    "south": (0, 1),
    "east": (1, 0),
    "west": (-1, 0),
}

CATEGORIES = frozenset({"basics", "hazards", "weighted", "efficient", "dynamic"})

BATTERY_MAX = 100


def validate_layout(width, height, layout):
    """Check dimensions, symbols, and start/exit counts.

    Returns (errors, meta) where meta holds start, exit, laser list,
    and mechanic flags when parsing succeeded.
    """
    errors = []

    if not isinstance(width, int) or not isinstance(height, int):
        return ["Width and height must be integers."], None

    if not (MIN_DIM <= width <= MAX_DIM):
        errors.append(
            f"Width must be between {MIN_DIM} and {MAX_DIM}."
        )

    if not (MIN_DIM <= height <= MAX_DIM):
        errors.append(
            f"Height must be between {MIN_DIM} and {MAX_DIM}."
        )

    if not isinstance(layout, list) or len(layout) != height:
        errors.append(
            f"Layout must have exactly {height} rows."
        )
        return errors, None

    starts = []
    exits = []
    lasers = []
    has_weighted = False

    for z, row in enumerate(layout):
        if not isinstance(row, str) or len(row) != width:
            errors.append(f"Row {z + 1} must be {width} characters wide.")
            continue

        for x, symbol in enumerate(row):
            if symbol not in ALLOWED_SYMBOLS:
                errors.append(
                    f"Row {z + 1}, col {x + 1}: unsupported tile '{symbol}'."
                )
            elif symbol == START:
                starts.append((x, z))
            elif symbol == EXIT:
                exits.append((x, z))
            elif symbol == LASER:
                lasers.append((x, z))
            elif symbol in (ROUGH, DRAIN):
                has_weighted = True

    if len(starts) != 1:
        errors.append("The maze must have exactly one start (S).")

    if len(exits) != 1:
        errors.append("The maze must have exactly one exit (E).")

    if errors:
        return errors, None

    return [], {
        "start": starts[0],
        "exit": exits[0],
        "lasers": lasers,
        "has_lasers": len(lasers) > 0,
        "has_weighted": has_weighted,
    }


def _blocked(symbol, for_safety):
    if symbol == WALL:
        return True
    if for_safety and symbol == LASER:
        return True
    return False


def find_safe_route(layout, start, exit):
    """BFS for a laser-free route; None when no safe route exists."""
    height = len(layout)
    width = len(layout[0])
    queue = deque([(start, [start])])
    seen = {start}

    while queue:
        (x, z), path = queue.popleft()

        if (x, z) == exit:
            return path

        for dx, dz in DIRECTIONS.values():
            nxt = (x + dx, z + dz)

            if not (0 <= nxt[0] < width and 0 <= nxt[1] < height):
                continue

            if nxt in seen:
                continue

            if _blocked(layout[nxt[1]][nxt[0]], for_safety=True):
                continue

            seen.add(nxt)
            queue.append((nxt, path + [nxt]))

    return None


def resimulate(layout, start, exit, actions):
    """Replay claimed actions against the layout like the engine.

    Returns a dict with ok, reached, died, moves, cost, remaining,
    or ok False with an error describing the first invalid step.
    """
    height = len(layout)
    width = len(layout[0])
    x, z = start
    battery = BATTERY_MAX
    cost = 0

    if not isinstance(actions, list) or len(actions) == 0:
        return {"ok": False, "error": "At least one action is required."}

    if len(actions) > MAX_ACTIONS:
        return {
            "ok": False,
            "error": f"At most {MAX_ACTIONS} actions are allowed.",
        }

    for index, direction in enumerate(actions):
        step = index + 1

        if direction not in DIRECTIONS:
            return {"ok": False, "error": f"Step {step}: bad direction."}

        dx, dz = DIRECTIONS[direction]
        nx, ny = x + dx, z + dz

        if not (0 <= nx < width and 0 <= ny < height):
            return {
                "ok": False,
                "error": f"Step {step}: leaves the maze.",
            }

        symbol = layout[ny][nx]

        if symbol == WALL:
            return {
                "ok": False,
                "error": f"Step {step}: walks into a wall.",
            }

        step_cost = ENTRY_COST[symbol]

        if step_cost > battery:
            return {
                "ok": False,
                "error": f"Step {step}: not enough battery.",
            }

        battery -= step_cost
        cost += step_cost
        x, z = nx, ny

        if symbol == LASER:
            return {
                "ok": True,
                "reached": False,
                "died": True,
                "died_at": step,
                "moves": step,
                "cost": cost,
                "remaining": battery,
            }

    return {
        "ok": True,
        "reached": (x, z) == exit,
        "died": False,
        "moves": len(actions),
        "cost": cost,
        "remaining": battery,
    }
