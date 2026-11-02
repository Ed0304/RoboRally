
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  emptyLayout,
  validateCommunityDraft,
  type CommunityDraft,
} from "@/lib/community-validate";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) =>
  readFileSync(join(root, path), "utf8");

const mazeScene = read("components/maze/MazeScene.tsx");
const mazeTiles = read("components/maze/MazeTiles.tsx");
const missionPanel = read("components/maze/MissionPanel.tsx");
const agent = read("src/lib/agent.ts");
const communityApi = read("src/lib/community-api.ts");
const browse = read("src/app/community/page.tsx");
const create = read("src/app/community/create/page.tsx");
const edit = read("src/app/community/edit/[id]/page.tsx");
const play = read("src/app/community/play/[id]/page.tsx");
const board = read("src/app/community/[id]/leaderboard/page.tsx");
const header = read("components/header.tsx");
const backendMain = readFileSync(
  join(root, "..", "..", "backend", "main.py"),
  "utf8"
);
const backendCommunity = readFileSync(
  join(root, "..", "..", "backend", "community", "router.py"),
  "utf8"
);

function draft(overrides: Partial<CommunityDraft>): CommunityDraft {
  return {
    name: "First Maze",
    description: "",
    width: 5,
    height: 5,
    layout: [
      "#####",
      "#S..#",
      "###.#",
      "#..E#",
      "#####",
    ],
    categories: ["basics"],
    ...overrides,
  };
}

// --- Editor validation mirrors the server ---
assert.deepEqual(validateCommunityDraft(draft({})), []);
assert.ok(
  validateCommunityDraft(draft({ name: "   " })).some((e) =>
    e.includes("blank")
  )
);
assert.ok(
  validateCommunityDraft(draft({ width: 4 })).some((e) =>
    e.includes("Width")
  )
);
assert.ok(
  validateCommunityDraft(
    draft({ layout: ["#####", "#S.#", "###.#", "#..E#", "#####"] })
  ).some((e) => e.includes("wide"))
);
assert.ok(
  validateCommunityDraft(
    draft({
      layout: ["#####", "#S.X#", "###.#", "#..E#", "#####"],
    })
  ).some((e) => e.includes("unsupported"))
);
assert.ok(
  validateCommunityDraft(
    draft({
      layout: ["#####", "#...#", "###.#", "#..E#", "#####"],
    })
  ).some((e) => e.includes("one start"))
);
assert.ok(
  validateCommunityDraft(
    draft({
      layout: ["#####", "#S###", "#####", "##E##", "#####"],
    })
  ).some((e) => e.includes("laser-free"))
);
// Only path crosses a laser: correctly unsolvable.
assert.ok(
  validateCommunityDraft(
    draft({ layout: ["#####", "#SLE#", "#####", "#####", "#####"] })
  ).some((e) => e.includes("laser-free"))
);

assert.deepEqual(emptyLayout(5, 5), [
  ".....",
  ".....",
  ".....",
  ".....",
  ".....",
]);

// --- MazeScene community mode: report runs, never canonical state ---
for (const token of [
  "CommunityPlay",
  "CommunityRunStats",
  "community.onFinish",
  "planDeterministic",
  "runActionsRef",
  "COMMUNITY_PLANNERS",
  "Planning strategy",
  "communityId={community?.publicId}",
  "communityVersion={community?.version}",
  "nextLevelId !== null && !community",
  "community-",
  "hasSuccess",
  "to unlock",
]) {
  assert.ok(mazeScene.includes(token), `MazeScene has ${token}`);
}

// --- MissionPanel threads community planning + attempt prompts ---
for (const token of [
  "community_id: communityId",
  "community_version: communityVersion",
  "onPromptAttempt",
]) {
  assert.ok(missionPanel.includes(token), `MissionPanel has ${token}`);
}
assert.match(agent, /community_id\?: string/);
assert.match(agent, /community_version\?: number/);

// --- Pages exist with their key wiring ---
assert.match(browse, /fetchCommunityLevels/);
assert.match(browse, /\/community\/create/);
assert.match(create, /validateCommunityDraft/);
assert.match(create, /createCommunityLevel/);
assert.match(create, /Maze editor grid/);
assert.match(play, /fetchCommunityLevel/);
assert.match(play, /submitCommunityAttempt/);
assert.match(play, /fetchMyCommunityAttempts/);
assert.match(play, /hasSuccess/);
assert.match(play, /community=\{community\}/);
assert.doesNotMatch(
  play,
  /submittedRef/,
  "every genuine finish submits: no once-per-mount gate may swallow restarts or retries"
);
assert.match(board, /fetchCommunityLeaderboard/);
assert.match(board, /fetchMyCommunityAttempts/);
assert.match(board, /Rank/);
assert.match(
  board,
  /fetchEditableCommunityLevel/,
  "board page falls back to the owner view for unpublished levels"
);
assert.match(header, /\/community/);

// --- Terrain costs stay hidden until the win (story + community) ---
assert.match(mazeTiles, /hideTerrainCosts/);
assert.match(
  mazeTiles,
  /hideTerrainCosts \? null/,
  "masked terrain renders no identity plate"
);
assert.ok(
  mazeScene.includes("hideTerrainCosts={!tutorialMode && !won}"),
  "story/community mask costs during play, reveal on win"
);

// --- Backend serves the community API ---
assert.match(backendMain, /community/);

// --- Owners see their unpublished levels in the main list ---
assert.match(
  backendCommunity,
  /get_optional_user/,
  "level listing resolves the signed-in viewer for owner visibility"
);

// --- Name search: backend q filter + browse search box ---
assert.match(backendCommunity, /q: Annotated\[str \| None/);
assert.match(backendCommunity, /needle in doc\.get\("name", ""\)\.lower\(\)/);
assert.match(communityApi, /q\?: string/);
assert.match(communityApi, /params\.set\("q", q\.trim\(\)\)/);
for (const token of [
  'role="search"',
  "community-search",
  "Search by name",
  "fetchMyCommunityLevels",
  "My levels",
]) {
  assert.ok(browse.includes(token), `browse page has ${token}`);
}

// --- Creator management: edit page + client + backend ---
for (const token of [
  "fetchEditableCommunityLevel",
  "updateCommunityLevel",
  "publishCommunityLevel",
  "unpublishCommunityLevel",
  "deleteCommunityLevel",
  "/editable",
  "/levels/mine",
]) {
  assert.ok(communityApi.includes(token), `community-api has ${token}`);
}
for (const token of [
  "fetchEditableCommunityLevel",
  "updateCommunityLevel",
  "Test play",
  "Maze editor grid",
  "Unpublish",
  "Yes, delete",
]) {
  assert.ok(edit.includes(token), `edit page has ${token}`);
}
assert.match(backendCommunity, /\/levels\/\{public_id\}\/editable/);
assert.match(backendCommunity, /\/levels\/mine/);
assert.match(backendCommunity, /def list_my_levels/);

// --- Owner test play: unpublished fallback + edit entry point ---
assert.match(play, /fetchEditableCommunityLevel/);
assert.match(play, /Test mode/);
assert.match(play, /\/community\/edit\//);

// --- Rankings honor original AI-planned work only ---
assert.match(
  backendCommunity,
  /"algorithm": "ai"/,
  "community rankings exclude deterministic-planner runs"
);
assert.ok(
  board.includes("AI-planned runs only"),
  "board page states rankings cover AI-planned runs only"
);

console.log("Community checks passed!");
