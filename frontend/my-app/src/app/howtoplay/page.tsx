
import Link from "next/link";
import { INSIDER_TIP_BODY, INSIDER_TIP_TITLE } from "@/lib/insiderTip";

const steps = [
  {
    number: "01",
    title: "Choose a game mode",
    description:
      "Select Tutorial to learn search algorithms with route previews, or Story to run agent-only rescue missions with no hints.",
  },
  {
    number: "02",
    title: "Define your objective",
    description:
      "Tell your AI agent what you want to accomplish. Be clear about the goal, such as reaching the exit while avoiding lasers and costly terrain.",
  },
  {
    number: "03",
    title: "Review the plan",
    description:
      "The agent turns your objective into a sequence of structured actions. Review the proposed plan — and any rejected moves — before it is executed.",
  },
  {
    number: "04",
    title: "Execute actions",
    description:
      "The game engine validates the agent's actions and applies valid moves to the factory environment, deducting battery for every step.",
  },
  {
    number: "05",
    title: "Observe the result",
    description:
      "Check the updated game state to see whether your robot made progress, ran low on battery, or encountered an obstacle.",
  },
  {
    number: "06",
    title: "Adapt and complete the mission",
    description:
      "If the original plan no longer works, request a new plan based on the latest state. Story runs end with a results breakdown and a leaderboard ranking.",
  },
];

const modes = [
  {
    title: "Tutorial · Levels 1–3",
    description:
      "One algorithm per level: BFS finds the fewest moves, Dijkstra finds the cheapest battery cost, and A* adds a goal-directed heuristic. Preview routes freely — previews never move the robot or drain battery.",
  },
  {
    title: "Story · Levels 4–6",
    description:
      "Agent-only factory rescue with no hints and no previews. Find efficient routes yourself: every win records moves, battery, and planning time, then ranks you against BFS, Dijkstra, A*, and other players.",
  },
];

export default function HowtoPlayPage() {
  return (
    <main className="flex flex-1 justify-center bg-background px-4 py-10 text-foreground sm:px-6">
      <div className="w-full max-w-4xl space-y-10">
        <header>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-accent">
            RoboRally // Field Manual
          </p>
          <h1 className="mt-3 text-3xl font-black sm:text-4xl">
            How to Play
          </h1>
          <p className="mt-3 max-w-2xl leading-7 text-muted">
            Your objective is to guide a robot through a factory
            environment with the help of an AI agent. Give it a goal,
            evaluate its plan, watch your battery, and adapt when
            conditions change.
          </p>
        </header>

        <section className="rounded-2xl border border-accent/30 bg-accent/5 p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-accent">
            Core gameplay loop
          </p>
          <p className="mt-3 text-lg font-black leading-relaxed sm:text-xl">
            Goal <span className="text-accent">→</span> Plan{" "}
            <span className="text-accent">→</span> Validate{" "}
            <span className="text-accent">→</span> Act{" "}
            <span className="text-accent">→</span> Observe{" "}
            <span className="text-accent">→</span> Replan
          </p>
          <p className="mt-3 text-sm leading-6 text-muted">
            The agent does not just make a plan once. It can respond to the
            latest game state when its route is blocked or circumstances change.
          </p>
        </section>

        <section>
          <h2 className="mb-5 text-xl font-black">Two modes</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {modes.map((mode) => (
              <article
                key={mode.title}
                className="rounded-xl border border-border bg-surface p-5 sm:p-6"
              >
                <h3 className="font-bold">{mode.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {mode.description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-5 text-xl font-black">Mission procedure</h2>
          <div className="space-y-4">
            {steps.map((step) => (
              <article
                key={step.number}
                className="flex gap-4 rounded-xl border border-border bg-surface p-5 sm:gap-6 sm:p-6"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-accent/30 bg-accent/10 font-mono font-bold text-accent">
                  {step.number}
                </div>
                <div>
                  <h3 className="font-bold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    {step.description}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="text-xl font-black">Battery and terrain</h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-muted">
            <li>
              <span className="mr-2 font-bold text-accent">›</span>
              The robot starts every mission at 100% battery. Plain
              floor costs 1% per step, rough ground (3) costs 3%, and
              draining ground (5) costs 5%.
            </li>
            <li>
              <span className="mr-2 font-bold text-accent">›</span>
              Laser tiles are lethal: stepping on one destroys the
              robot and ends the run.
            </li>
            <li>
              <span className="mr-2 font-bold text-accent">›</span>
              Previewing a route is always free. Only executed moves
              drain battery.
            </li>
            <li>
              <span className="mr-2 font-bold text-accent">›</span>
              Plans that cost more battery than remains are rejected
              before execution. Restart recharges to 100%.
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="text-xl font-black">Learn and compete</h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-muted">
            <li>
              <span className="mr-2 font-bold text-accent">›</span>
              New to pathfinding? The{" "}
              <Link href="/learn" className="font-semibold text-accent hover:underline">
                Pathfinding Lab
              </Link>{" "}
              teaches BFS, Dijkstra, and A* with hands-on visualizations
              on practice mazes.
            </li>
            <li>
              <span className="mr-2 font-bold text-accent">›</span>
              Story wins are ranked on the{" "}
              <Link href="/leaderboard" className="font-semibold text-accent hover:underline">
                leaderboard
              </Link>
              : most battery left, fewest steps, and best planner
              score per level.
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="text-xl font-black">Tips for a successful run</h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-muted">
            <li>
              <span className="mr-2 font-bold text-accent">›</span>
              Describe the outcome you want, not just a vague instruction.
            </li>
            <li>
              <span className="mr-2 font-bold text-accent">›</span>
              There are no manual controls: every move is made by the
              AI agent carrying out your validated plan.
            </li>
            <li>
              <span className="mr-2 font-bold text-accent">›</span>
              Check the plan against the objective before execution —
              and read rejections, which explain what the game refused
              and why.
            </li>
            <li>
              <span className="mr-2 font-bold text-accent">›</span>
              On weighted terrain, a longer route can be cheaper than
              a short one. In Tutorial mode, preview both before you
              commit.
            </li>
            <li>
              <span className="mr-2 font-bold text-accent">›</span>
              When an action fails, use the new state to decide what to try next.
            </li>
            <li>
              <span className="mr-2 font-bold text-accent">›</span>
              <span className="font-bold text-foreground">
                {INSIDER_TIP_TITLE}:
              </span>{" "}
              {INSIDER_TIP_BODY}
            </li>
          </ul>
        </section>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/start"
            className="inline-flex items-center justify-center rounded-lg bg-accent px-6 py-3 font-bold text-accent-foreground transition hover:bg-accent-hover"
          >
            Choose Game Mode →
          </Link>
          <Link
            href="/learn"
            className="inline-flex items-center justify-center rounded-lg border border-border bg-surface px-6 py-3 font-semibold transition hover:border-accent/50"
          >
            Visit the Lab
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg border border-border bg-surface px-6 py-3 font-semibold transition hover:border-accent/50"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </main>
  );
}
