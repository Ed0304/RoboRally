
import Link from "next/link";

export default function StartPage() {
  return (
    <main className="flex flex-1 justify-center bg-background px-4 py-12 text-foreground sm:px-6">
      <div className="w-full max-w-5xl">
        <header className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-accent">
            RoboRally // Mission Selection
          </p>
          <h1 className="mt-3 text-3xl font-black sm:text-5xl">
            Select Your Mission
          </h1>
          <p className="mx-auto mt-4 max-w-2xl leading-7 text-muted">
            Choose a mode and prepare to enter the factory. Learn the controls
            first, or jump straight into the rescue operation.
          </p>
        </header>

        <section className="mt-10 grid gap-6 md:grid-cols-2">
          <article className="flex flex-col rounded-2xl border border-border bg-surface p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-success/30 bg-success/10 text-2xl">
                ◈
              </div>
              <span className="rounded-md border border-success/30 bg-success/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-success">
                Training
              </span>
            </div>

            <h2 className="mt-6 text-2xl font-black">Tutorial Mode</h2>
            <p className="mt-3 flex-1 leading-7 text-muted">
              Get familiar with the factory, learn how to define objectives,
              and understand the agent's plan-and-replan workflow at your own
              pace.
            </p>

            <ul className="my-6 space-y-2 text-sm text-muted">
              <li>✓ Learn the gameplay loop</li>
              <li>✓ Practice basic objectives</li>
              <li>✓ Get comfortable before Story Mode</li>
            </ul>

            <Link
              href="/start/tutorial"
              className="inline-flex w-full items-center justify-center rounded-lg border border-success/40 bg-success/10 px-5 py-3.5 font-bold text-success transition hover:bg-success/20"
            >
              Begin Tutorial →
            </Link>
          </article>

          <article className="flex flex-col rounded-2xl border border-accent/40 bg-surface p-6 shadow-lg shadow-accent/5 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-accent/40 bg-accent/10 text-2xl">
                ⚙
              </div>
              <span className="rounded-md border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-accent">
                Main Campaign
              </span>
            </div>

            <h2 className="mt-6 text-2xl font-black">Story Mode</h2>
            <p className="mt-3 flex-1 leading-7 text-muted">
              Take on the Factory Rescue mission. Work toward objectives,
              respond to obstacles, and help your robot navigate the challenges
              ahead.
            </p>

            <ul className="my-6 space-y-2 text-sm text-muted">
              <li>✓ Progress through mission objectives</li>
              <li>✓ Adapt when your route is blocked</li>
              <li>✓ Track your progress as the campaign grows</li>
            </ul>

            <Link
              href="/start/story"
              className="inline-flex w-full items-center justify-center rounded-lg bg-accent px-5 py-3.5 font-bold text-accent-foreground shadow-md transition hover:bg-accent-hover"
            >
              Begin Story Mode →
            </Link>
          </article>
        </section>

        <p className="mt-8 text-center text-xs leading-5 text-muted">
          Game modes are selection UI for now. The gameplay routes and mission
          logic will be implemented separately.
        </p>
      </div>
    </main>
  );
}
