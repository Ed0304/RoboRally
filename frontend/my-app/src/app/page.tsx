
export default function HomePage() {
  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden bg-background px-6 py-20 text-foreground">
      {/* Decorative industrial grid */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #F3F0E8 1px, transparent 1px), linear-gradient(to bottom, #F3F0E8 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative mx-auto w-full max-w-4xl text-center">
        <div className="mb-8 inline-flex items-center gap-3 rounded-full border border-success/30 bg-success/10 px-4 py-2">
          <span
            className="h-2 w-2 animate-pulse rounded-full bg-success"
            aria-hidden="true"
          />
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-success">
            Factory Systems Online
          </p>
        </div>

        <p className="mb-4 text-sm font-bold uppercase tracking-[0.3em] text-muted">
          Autonomous robotics // Mission control
        </p>

        <h1 className="text-4xl font-black leading-tight tracking-tight sm:text-6xl lg:text-7xl">
          Welcome to
          <span className="mt-2 block text-accent">RoboRally</span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-muted sm:text-lg">
          Command your robot. Navigate the factory. Adapt when your plan fails.
          Every mission is a test of strategy, precision, and intelligent
          decision-making.
        </p>

        <div className="mx-auto mt-10 flex max-w-md flex-col justify-center gap-3 sm:flex-row">
          <a
            href="/start"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-7 py-3.5 font-bold text-accent-foreground shadow-lg transition hover:bg-accent-hover active:scale-[0.98]"
          >
            Start Mission
            <span aria-hidden="true">→</span>
          </a>

          <a
            href="/howtoplay"
            className="inline-flex items-center justify-center rounded-lg border border-border bg-surface px-7 py-3.5 font-semibold text-foreground transition hover:border-accent/60 hover:bg-surface/80"
          >
            How to Play
          </a>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-3 text-left sm:grid-cols-3">
          {[
            {
              number: "01",
              title: "SET OBJECTIVE",
              description: "Define the mission your robot must complete.",
            },
            {
              number: "02",
              title: "PLAN & EXECUTE",
              description: "Let your agent plan and carry out its actions.",
            },
            {
              number: "03",
              title: "ADAPT & RESCUE",
              description: "Respond to obstacles and find a new route.",
            },
          ].map((item) => (
            <div
              key={item.number}
              className="rounded-xl border border-border bg-surface/80 p-5"
            >
              <p className="mb-4 font-mono text-sm font-bold text-accent">
                // {item.number}
              </p>
              <h2 className="text-sm font-black tracking-wider text-foreground">
                {item.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
