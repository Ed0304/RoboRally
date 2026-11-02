"""Deterministic mission-input validation, before any model call.

Cheap structural checks reject empty, trivial, repetitive, malformed,
and unsupported-only instructions without spending a planning request.
Genuinely ambiguous wording that passes these checks still flows to the
model, where the comprehension gate (``understood=false``) is the
semantic backstop, and independent plan validation guards execution.

Nothing here judges mission *quality*: meaningful missions — even
inefficient ones — pass. Only direction bans ("never move east") get a
feasibility verdict, computed against the canonical level.
"""

import re
from dataclasses import dataclass, field

from ai_engine.rules import OFFSETS, parse_layout

MIN_MEANINGFUL_TOKENS = 2

STOPWORDS = frozenset(
    {
        "a", "an", "and", "as", "at", "be", "by", "for", "if", "in",
        "is", "it", "me", "my", "of", "on", "or", "so", "the", "to",
        "with",
    }
)

# Anchors that name the mission's objective.
GOAL_PHRASES = (
    "way out",
    "out of here",
    "get out",
    "finish line",
)
GOAL_WORDS = frozenset(
    {
        "exit", "goal", "finish", "escape", "safe", "rescue",
        # Traversal targets: "cross the corridor" is a real mission.
        "corridor", "maze", "room", "hall", "floor", "factory",
        "area", "zone", "level", "sector", "passage", "path", "route",
    }
)

DIRECTION_WORDS = frozenset(
    {
        "north", "south", "east", "west",
        # Screen-relative synonyms; the compass is north-up.
        "up", "down", "left", "right",
    }
)

CARDINALS = ("north", "south", "east", "west")

# Requested methods the engine cannot perform. Matched case-insensitively
# against the raw mission; negated mentions ("don't fly") are ignored.
UNSUPPORTED_PATTERNS = (
    r"diagon\w*",
    r"teleport\w*",
    r"northeast|northwest|southeast|southwest",
    r"north-east|north-west|south-east|south-west",
    r"\bfly\b|\bflying\b|\bfly over\b|\bflew\b",
    r"\bjump\b|\bjumping\b|\bjump over\b",
    r"(?:pass|go|walk|move|phase)\s+through\s+(?:the\s+)?walls?",
    r"(?:pass|go|walk|move)\s+through\s+(?:the\s+)?lasers?",
    r"ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions?",
    r"ignore\s+.*\brules\b",
    r"disregard\s+.*instructions?",
)
NEGATION_GUARD = re.compile(
    r"(n't|\bnot\b|\bwithout\b|\bnever\b)\s+\w{0,12}$"
)

# "Never move east" style bans, plus "only east and south" exclusives.
BAN_PREFIX = r"\b(?:never|don't|dont|do not|not|without|no|avoid)"
BAN_PATTERN = re.compile(
    rf"{BAN_PREFIX}\W+(?:\w+\W+){{0,2}}?"
    r"(north|south|east|west)\b"
)
ONLY_PATTERN = re.compile(
    r"\bonly\s+"
    r"(north|south|east|west)"
    r"(?:\s*(?:,|and|or)\s*(north|south|east|west))?"
)

# Open-ended extents ("until", "to the wall"): complete only when an
# exit objective accompanies them.
UNTIL_PATTERN = re.compile(
    r"\buntil\b|\btill\b|\bto the wall\b|\bas far as\b"
)

NUMBER_WORDS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "a": 1, "an": 1,
}
_COUNT = r"(\d+|one|two|three|four|five|six|seven|eight|nine|ten|a|an)"
_UNIT = r"(?:steps?|tiles?|moves?|spaces?|squares?)?"
_DIRS = r"(north|south|east|west|up|down|left|right)"
DIR_FIRST_PATTERN = re.compile(rf"\b{_DIRS}\s+{_COUNT}\s*{_UNIT}")
COUNT_FIRST_PATTERN = re.compile(
    rf"\b{_COUNT}\s*(?:steps?|tiles?|moves?|spaces?|squares?)?\s+"
    rf"(?:to\s+the\s+|to\s+|the\s+)?{_DIRS}\b"
)
BARE_DIR_PATTERN = re.compile(rf"\b{_DIRS}\b")
OF_GUARD = re.compile(r"\s+of\b")

# Screen-relative synonyms on the north-up map.
SYNONYM_MAP = {"up": "north", "down": "south", "left": "west", "right": "east"}

# Mirrors planner.MAX_TOTAL_ACTIONS; a test locks the two together.
PLANNING_ACTION_BUDGET = 72

MSG_TOO_SHORT = (
    "Your mission is a little too short. Describe what you want "
    "the robot to accomplish."
)
MSG_NO_OBJECTIVE = (
    "I couldn't identify a clear mission. Tell the robot what you "
    "want it to achieve."
)
MSG_UNSUPPORTED = (
    "That instruction uses a movement the robot cannot perform. "
    "Try using supported directions."
)
MSG_MALFORMED = (
    "I couldn't make sense of that message. Try rephrasing your "
    "mission."
)


@dataclass(frozen=True)
class MissionValidation:
    """Stage A verdict + structured mission contract.

    ``exit_objective``: the prompt names the level goal (exit, escape,
    traversal target), so routing there is requested, not invented.
    ``required_sequence``: explicit cardinal moves in order; empty when
    the mission states no exact moves. ``banned_directions``: explicit
    direction bans. Reason codes: ok | too_short | no_objective |
    unsupported_action | malformed | impossible_constraint |
    needs_clarification.
    """

    valid: bool
    reason_code: str
    message: str
    banned_directions: tuple = field(default_factory=tuple)
    exit_objective: bool = False
    required_sequence: tuple = field(default_factory=tuple)


def _alpha_tokens(text: str) -> list[str]:
    return re.findall(r"[a-z]+", text.lower())


def _is_noise_token(token: str) -> bool:
    if len(token) >= 4 and len(set(token)) == 1:
        return True  # aaaa, zzzzz
    return len(token) >= 3 and not any(
        vowel in token for vowel in "aeiou"
    )


def _has_unsupported_method(text: str) -> bool:
    lowered = text.lower()

    for pattern in UNSUPPORTED_PATTERNS:
        for match in re.finditer(pattern, lowered):
            # "Don't fly — walk east" mentions flying only to forbid it.
            window = lowered[max(0, match.start() - 14):match.start()]
            if NEGATION_GUARD.search(window):
                continue
            return True

    return False


def extract_direction_bans(text: str) -> tuple[str, ...]:
    """Direction bans stated in the mission ("never move east")."""
    lowered = text.lower()
    banned = {match.group(1) for match in BAN_PATTERN.finditer(lowered)}

    only = ONLY_PATTERN.search(lowered)
    if only:
        allowed = {group for group in only.groups() if group}
        banned.update(direction for direction in CARDINALS if direction not in allowed)

    return tuple(sorted(banned))


def _has_objective(text: str, tokens: list[str]) -> bool:
    lowered = text.lower()

    if any(phrase in lowered for phrase in GOAL_PHRASES):
        return True

    words = set(tokens)

    if words & GOAL_WORDS:
        return True

    return bool(words & DIRECTION_WORDS)


def has_exit_objective(text: str, tokens: list[str]) -> bool:
    """Whether the prompt names the level goal. Bare directions alone
    ("go east") do not imply an exit run."""
    lowered = text.lower()

    if any(phrase in lowered for phrase in GOAL_PHRASES):
        return True

    return bool(set(tokens) & GOAL_WORDS)


def _count_value(raw: str) -> int:
    if raw.isdigit():
        return int(raw)
    return NUMBER_WORDS.get(raw, 1)


def _overlaps(span: tuple[int, int], spans: list[tuple[int, int]]) -> bool:
    return any(start < span[1] and span[0] < end for start, end in spans)


def parse_required_sequence(
    text: str, banned: tuple[str, ...]
) -> tuple[str, ...]:
    """Explicit cardinal moves in order, excluding banned directions
    and allowed-set phrases ("only east and south" is not a sequence).
    Screen-relative words map onto the north-up compass.
    """
    lowered = ONLY_PATTERN.sub(" ", text.lower())
    banned_set = set(banned)
    events: list[tuple[int, str, int]] = []
    claimed: list[tuple[int, int]] = []

    def positional(match) -> bool:
        # "South of the exit" names a location, not a move.
        return OF_GUARD.match(lowered, match.end()) is not None

    for pattern, order in (
        (DIR_FIRST_PATTERN, (1, 2)),
        (COUNT_FIRST_PATTERN, (2, 1)),
    ):
        for match in pattern.finditer(lowered):
            span = (match.start(), match.end())

            if _overlaps(span, claimed) or positional(match):
                continue

            claimed.append(span)
            direction = SYNONYM_MAP.get(
                match.group(order[0]), match.group(order[0])
            )
            count = _count_value(match.group(order[1]))
            events.append((match.start(), direction, count))

    for match in BARE_DIR_PATTERN.finditer(lowered):
        span = (match.start(), match.end())

        if _overlaps(span, claimed) or positional(match):
            continue

        claimed.append(span)
        direction = SYNONYM_MAP.get(match.group(1), match.group(1))
        events.append((match.start(), direction, 1))

    events.sort(key=lambda event: event[0])
    sequence: list[str] = []

    for _, direction, count in events:
        if direction in banned_set:
            continue
        # Cap expansion: counts past the budget trip over-budget anyway.
        sequence.extend([direction] * min(count, PLANNING_ACTION_BUDGET + 1))

    return tuple(sequence)


def describe_sequence(sequence: tuple[str, ...]) -> str:
    """Compressed human form: ("east",) * 8 -> "east 8"."""
    parts: list[str] = []
    run_direction: str | None = None
    run_count = 0

    for direction in list(sequence) + [None]:
        if direction == run_direction:
            run_count += 1
            continue

        if run_direction is not None:
            parts.append(f"{run_direction} {run_count}")

        run_direction = direction  # type: ignore[assignment]
        run_count = 1

    return ", ".join(parts)


def validate_mission_text(text: str) -> MissionValidation:
    """Structural quality verdict; no level data needed."""
    normalized = " ".join(text.split())

    if not normalized:
        return MissionValidation(False, "malformed", MSG_MALFORMED)

    tokens = _alpha_tokens(normalized)

    if not tokens:
        return MissionValidation(False, "malformed", MSG_MALFORMED)

    meaningful = [
        token
        for token in tokens
        if len(token) >= 2 and token not in STOPWORDS
    ]

    if len(meaningful) < MIN_MEANINGFUL_TOKENS:
        return MissionValidation(False, "too_short", MSG_TOO_SHORT)

    if len(meaningful) >= 3 and len(set(meaningful)) == 1:
        return MissionValidation(False, "malformed", MSG_MALFORMED)

    if all(_is_noise_token(token) for token in meaningful):
        return MissionValidation(False, "malformed", MSG_MALFORMED)

    if _has_unsupported_method(normalized):
        return MissionValidation(False, "unsupported_action", MSG_UNSUPPORTED)

    if not _has_objective(normalized, tokens):
        return MissionValidation(False, "no_objective", MSG_NO_OBJECTIVE)

    banned = extract_direction_bans(normalized)
    exit_objective = has_exit_objective(normalized, tokens)
    sequence = parse_required_sequence(normalized, banned)

    if len(sequence) > PLANNING_ACTION_BUDGET:
        return MissionValidation(
            False,
            "impossible_constraint",
            f"That needs {len(sequence)} moves, beyond the "
            f"{PLANNING_ACTION_BUDGET}-move planning budget. Try a "
            "shorter mission.",
            banned,
            exit_objective,
            sequence,
        )

    if not exit_objective and UNTIL_PATTERN.search(normalized):
        moves = " and ".join(dict.fromkeys(sequence)) or "ahead"
        return MissionValidation(
            False,
            "needs_clarification",
            f"I understand that you want me to move {moves}, but I'm "
            "not sure what you want me to accomplish after that. Tell "
            "me your destination or your overall objective.",
            banned,
            exit_objective,
            sequence,
        )

    if not exit_objective and not sequence:
        # A lone constraint ("never move east") with no goal or moves.
        names = " and ".join(banned)
        return MissionValidation(
            False,
            "needs_clarification",
            f"I understand you want to avoid {names} moves, but I'm "
            "not sure what you want me to accomplish. Tell me your "
            "destination or your overall objective.",
            banned,
            exit_objective,
            sequence,
        )

    return MissionValidation(
        True, "ok", "", banned, exit_objective, sequence
    )


def route_exists_without(
    layout: list[str],
    start: tuple[int, int],
    goal: tuple[int, int],
    banned: tuple[str, ...],
    door_open: bool,
    enemies: list[dict],
) -> bool:
    """BFS reachability honoring walls, lasers, doors, enemies, and bans."""
    tiles = parse_layout(layout)
    blocked_enemies = {(enemy["x"], enemy["z"]) for enemy in enemies}
    seen = {start}
    queue = [start]

    while queue:
        x, z = queue.pop(0)

        if (x, z) == goal:
            return True

        for direction in CARDINALS:
            if direction in banned:
                continue

            dx, dz = OFFSETS[direction]
            nxt = (x + dx, z + dz)

            if nxt in seen:
                continue

            symbol = tiles.get(nxt)

            if symbol is None or symbol == "#":
                continue
            if symbol == "D" and not door_open:
                continue
            if symbol == "L":
                continue
            if nxt in blocked_enemies:
                continue

            seen.add(nxt)
            queue.append(nxt)

    return False


def validate_mission(
    text: str,
    layout: list[str],
    robot: dict[str, int],
    door_open: bool,
    enemies: list[dict],
    exit_pos: tuple[int, int],
) -> MissionValidation:
    """Full pre-model verdict, including constraint feasibility."""
    structural = validate_mission_text(text)

    if not structural.valid or not structural.banned_directions:
        return structural

    start = (robot["x"], robot["z"])

    if start == exit_pos:
        return structural

    if route_exists_without(
        layout, start, exit_pos, structural.banned_directions,
        door_open, enemies,
    ):
        return structural

    names = " and ".join(structural.banned_directions)
    moves = "move" if len(structural.banned_directions) == 1 else "moves"

    return MissionValidation(
        False,
        "impossible_constraint",
        f"That route isn't possible here: every path to the exit "
        f"needs {names} {moves}. Try adjusting the constraint.",
        structural.banned_directions,
    )
