
import Link from "next/link";

const steps = [
  {
    number: "01",
    title: "Choose a game mode",
    description:
      "Select Tutorial to learn the basics or Story to begin the factory rescue mission.",
  },
  {
    number: "02",
    title: "Define your objective",
    description:
      "Tell your AI agent what you want to accomplish. Be clear about the goal, such as reaching a target or navigating around an obstacle.",
  },
  {
    number: "03",
    title: "Review the plan",
    description:
      "The agent turns your objective into a sequence of structured actions. Review the proposed plan before it is executed.",
  },
  {
    number: "04",
    title: "Execute actions",
    description:
      "The game engine validates the agent's actions and applies valid moves to the factory environment.",
  },
  {
    number: "05",
    title: "Observe the result",
    description:
      "Check the updated game state to see whether your robot made progress or encountered an obstacle.",
  },
  {
    number: "06",
    title: "Adapt and complete the mission",
    description:
      "If the original plan no longer works, request a new plan based on the latest state. Keep working toward the objective.",
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
            Your objective is to guide a robot through a factory environment
            with the help of an AI agent. Give it a goal, evaluate its plan,
            and adapt when conditions change.
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
              Check the plan against the objective before execution.
            </li>
            <li>
              <span className="mr-2 font-bold text-accent">›</span>
              When an action fails, use the new state to decide what to try next.
            </li>
            <li>
              <span className="mr-2 font-bold text-accent">›</span>
              Treat obstacles as a reason to adapt, not necessarily to abandon
              the mission.
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
